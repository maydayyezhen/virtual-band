import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{Midi}=require('@tonejs/midi');
const make=programs=>{const midi=new Midi();programs.forEach((program,index)=>{const track=midi.addTrack();track.channel=index;track.instrument.number=program;track.addNote({midi:64,time:0,duration:8,velocity:.7});});return [...midi.toArray()];};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.TEST_URL||'http://localhost:5173'}/studio/band/`);
 await page.waitForFunction(()=>window.bandView?.session,null,{timeout:90000});
 const data=make([44,45,46,47,48]);
 const routed=await page.evaluate(async bytes=>{const {analyzeMidi}=await import('/src/midi/index.ts');return analyzeMidi(new Uint8Array(bytes)).routed.map(t=>[t.program,t.type]);},data);
 assert.deepEqual(routed,[[44,'keyboard'],[45,'violin'],[46,'keyboard'],[47,'keyboard'],[48,'keyboard']]);
 await page.evaluate(async bytes=>window.bandView.loadMidiFile(new File([new Uint8Array(bytes)],'strings-boundaries.mid')),data);
 assert.equal(await page.evaluate(()=>window.bandView.player.scheduledNotes),5,'all source notes remain assigned');
 await page.evaluate(()=>{window.routingViolin=window.bandView.instruments.get('violin.main');return window.bandView.player.play();});
 await page.waitForFunction(()=>window.routingViolin.articulation==='pizzicato');
 await page.evaluate(()=>window.bandView.player.pause());
 await page.evaluate(async bytes=>window.bandView.loadMidiFile(new File([new Uint8Array(bytes)],'bowed.mid')),make([40]));
 assert.ok(await page.evaluate(()=>window.bandView.instruments.get('violin.main')===window.routingViolin),'same violin is reused');
 await page.evaluate(()=>window.bandView.player.play());
 await page.waitForFunction(()=>window.routingViolin.articulation==='arco');
 await page.evaluate(()=>window.bandView.player.pause());
 await page.getByRole('button',{name:'载入波西米亚示例',exact:true}).click();
 await page.waitForFunction(()=>window.bandView.player?.scheduledNotes===5922,null,{timeout:120000});
 const queen=await page.evaluate(async()=>{
   const v=window.bandView;
   v.player.seek(213);await v.player.play();
   return {count:v.session.layout.instances.length,keyboards:v.session.layout.instances.filter(i=>i.type==='keyboard').length};
 });
 assert.deepEqual(queen,{count:7,keyboards:1});
 await page.waitForFunction(()=>{
   const s=window.bandView.instruments.get('keyboard.main').status();
   return s.lower.pressedNotes>0 && s.upper.pressedNotes>0;
 });
 await page.evaluate(()=>window.bandView.player.pause());
 const released=await page.evaluate(()=>{
   const k=window.bandView.instruments.get('keyboard.main');k.update(1);return k.status();
 });
 assert.equal(released.lower.pressedNotes+released.upper.pressedNotes,0,'pause clears layered keys');
 assert.deepEqual(errors,[]);
 console.log('Chrome routing: 44–48 actual MIDI assignment, all notes retained, pizzicato playback and reused violin returning to arco passed.');
}finally{await browser.close();}
