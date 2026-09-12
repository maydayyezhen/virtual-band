import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright'),{Midi}=require('@tonejs/midi');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto(`${process.env.TEST_URL||'http://localhost:5173'}/studio/band/`);
 await page.waitForFunction(()=>window.bandView?.session,null,{timeout:90000});
 const baseline=await page.evaluate(()=>{let lights=0;window.bandView.venue.root.traverse(o=>{if(o.isLight)lights++});window.originalVenue=window.bandView.venue;return{lights,bg:window.bandView.venue.root.background.toArray()};});
 await page.getByRole('button',{name:'载入波西米亚示例',exact:true}).click();
 await page.waitForFunction(()=>window.bandView?.lighting.currentShow,null,{timeout:120000});
 const loaded=await page.evaluate(()=>{
  const v=window.bandView;window.sampleShow=v.lighting.currentShow;let lights=0;v.venue.root.traverse(o=>{if(o.isLight)lights++});
  return{sameVenue:v.venue===window.originalVenue,lights,fixtures:v.venue.lighting.rig.fixtures.length,pixels:v.venue.lighting.rig.pixels.length,gobos:v.venue.lighting.rig.gobos.length,sections:v.lighting.currentShow.sections,total:v.player.total,notes:v.player.scheduledNotes,instruments:v.instruments.list().length};
 });
 assert.equal(loaded.sameVenue,true);assert.equal(loaded.fixtures,30);assert.equal(loaded.pixels,56);assert.equal(loaded.gobos,4);assert.equal(loaded.lights,baseline.lights-24);assert.equal(loaded.sections.length,11);assert.ok(loaded.notes>1000);
 console.log('Loaded',JSON.stringify(loaded));
 await page.getByLabel('固定机位',{exact:true}).selectOption('band:venue');
 await page.waitForFunction(()=>window.bandView.stage.activeBandViewId==='band:venue');
 await page.waitForTimeout(100);
 // Same camera for all comparisons. Show evaluation must never write a camera or move instruments.
 const scene=await page.evaluate(()=>({camera:window.bandView.camera.output.position.toArray(),layout:JSON.stringify(window.bandView.session.layout)}));
 const seek=async time=>{await page.evaluate(time=>window.bandView.player.seek(time),time);await page.waitForFunction(time=>Math.abs(window.bandView.lighting.frame.time-time)<.06,time);};
 for(const index of [1,4,7,10]){
  const time=loaded.sections[index].time+3;await seek(time);
  const state=await page.evaluate(()=>({camera:window.bandView.camera.output.position.toArray(),layout:JSON.stringify(window.bandView.session.layout),frame:window.bandView.lighting.frame}));
  assert.deepEqual(state.camera,scene.camera);assert.equal(state.layout,scene.layout);
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/lighting-${index}.png`});}
 }
 const target=loaded.sections[7].time+5;
 await seek(target);const once=await page.evaluate(()=>JSON.stringify(window.bandView.lighting.frame));await seek(20);await seek(target);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.bandView.lighting.frame)),once,'seek is deterministic');
 await page.getByRole('button',{name:'播放',exact:true}).click();await page.waitForFunction(()=>window.bandView.player.isPlaying);
 await page.waitForFunction(t=>window.bandView.player.time>t+.5,target);
 await page.getByRole('button',{name:'暂停',exact:true}).click();
 const pause=await page.evaluate(()=>({time:window.bandView.player.time,frame:JSON.stringify(window.bandView.lighting.frame)}));
 await page.waitForTimeout(350);
 assert.equal(await page.evaluate(()=>window.bandView.player.time),pause.time);assert.equal(await page.evaluate(()=>JSON.stringify(window.bandView.lighting.frame)),pause.frame,'pause freezes show');
 await page.getByLabel('歌曲灯光',{exact:true}).uncheck();
 const released=await page.evaluate(()=>{let lights=0;window.bandView.venue.root.traverse(o=>{if(o.isLight)lights++});return{lights,bg:window.bandView.venue.root.background.toArray(),extras:!!window.bandView.venue.root.getObjectByName('lighting:accents')};});
 assert.equal(released.lights,baseline.lights);assert.deepEqual(released.bg,baseline.bg);assert.equal(released.extras,false);
 // Lease exclusivity, stale-handle rejection and validation before mutation.
 const controlTest=await page.evaluate(()=>{
  const v=window.bandView,port=v.venue.lighting,lease=port.acquire(),valid=v.lighting.currentShow.evaluate(80);lease.apply(valid);let exclusive=false,invalid=false,stale=false;
  try{port.acquire();}catch{exclusive=true;}
  try{lease.apply({...valid,fixtures:[{...valid.fixtures[0],intensity:NaN},...valid.fixtures.slice(1)]});}catch{invalid=true;}
  lease.release();lease.release();try{lease.apply(valid);}catch{stale=true;}
  return{exclusive,invalid,stale};
 });assert.deepEqual(controlTest,{exclusive:true,invalid:true,stale:true});
 await page.getByLabel('歌曲灯光',{exact:true}).check();
 await page.getByLabel('灯光段落',{exact:true}).selectOption(String(loaded.sections[6].time));
 await page.waitForFunction(()=>window.bandView.lighting.frame.section.includes('面具法庭'));
 await page.getByRole('button',{name:'停止',exact:true}).click();await page.waitForFunction(()=>window.bandView.lighting.frame.time<.01);
 await seek(loaded.total-.4);await page.getByRole('button',{name:'播放',exact:true}).click();
 await page.waitForFunction(()=>!window.bandView.player.isPlaying&&window.bandView.player.time>320);
 await page.waitForFunction(()=>window.bandView.lighting.frame.fixtures.every(f=>f.intensity===0));
 // Reloading the example releases the old owner and keeps one accent group.
 await page.getByRole('button',{name:'载入波西米亚示例',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.band-lighting button').disabled);
 assert.equal(await page.evaluate(()=>window.bandView.venue.root.children.filter(o=>o.name==='lighting:accents').length),1);
 // Parsing failure leaves the existing band and show intact.
 const failure=await page.evaluate(async()=>{
  const v=window.bandView,band=v.band,show=v.lighting.currentShow;
  await v.loadMidiFile(new File(['invalid'],'broken.mid'));
  return {band:v.band===band,show:v.lighting.currentShow===show,enabled:v.lighting.enabled};
 });assert.deepEqual(failure,{band:true,show:true,enabled:true});
 assert.equal(errors.length,1);assert.ok(errors[0].includes('MIDI 装载失败'));errors.splice(0);
 const midi=new Midi();midi.addTrack().addNote({midi:60,time:0,duration:2,velocity:.7});
 await page.evaluate(async bytes=>window.bandView.loadMidiFile(new File([new Uint8Array(bytes)],'波西米亚狂想曲.mid')),[...midi.toArray()]);
 assert.equal(await page.evaluate(()=>window.bandView.lighting.currentShow),null,'same filename with different content does not select show');
 assert.equal(await page.getByLabel('歌曲灯光',{exact:true}).isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log('Chrome lighting: original MIDI playback, fixed-camera sections, deterministic seek, pause, end, restore, ownership, invalid frames, reload and unrelated MIDI passed.');
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,panel:document.querySelector('.band-camera').getBoundingClientRect().toJSON()}));
 assert.ok(mobile.scroll<=mobile.width);assert.ok(mobile.panel.right<=mobile.width);assert.ok(mobile.panel.bottom<650);
 const disposal=await page.evaluate(()=>{
  const v=window.bandView,lease=v.venue.lighting.acquire();lease.apply(window.sampleShow.evaluate(230));
  let geometry=0,material=0,texture=0;const extras=v.venue.root.getObjectByName('lighting:accents');
  const g=extras.getObjectByName('gobo-0');g.geometry.addEventListener('dispose',()=>geometry++);g.material.addEventListener('dispose',()=>material++);g.material.map.addEventListener('dispose',()=>texture++);
  v.venue.dispose();v.venue.dispose();let stale=false;try{lease.apply(window.sampleShow.evaluate(230));}catch{stale=true;}
  return{geometry,material,texture,stale,detached:v.venue.root.parent===null};
 });assert.deepEqual(disposal,{geometry:1,material:1,texture:1,stale:true,detached:true});
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
