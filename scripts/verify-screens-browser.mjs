import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{Midi}=require('@tonejs/midi');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{
  window.testVideos=[];window.testURLs=new Set();
  const create=document.createElement.bind(document);document.createElement=(tag,...args)=>{const e=create(tag,...args);if(tag.toLowerCase()==='video')window.testVideos.push(e);return e;};
  const make=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=value=>{const url=make(value);if(value instanceof File)window.testURLs.add(url);return url;};
  URL.revokeObjectURL=url=>{window.testURLs.delete(url);revoke(url);};
 });
 await page.goto(`${process.env.TEST_URL||'http://localhost:5173'}/studio/band/`);
 await page.waitForFunction(()=>window.bandView?.session,null,{timeout:90000});
 await page.getByLabel('固定机位',{exact:true}).selectOption('band:venue');
 await page.getByText('LED 内容',{exact:true}).click();
 await page.getByLabel('导入 LED 图片或视频',{exact:true}).setInputFiles('scripts/fixtures/screens/poster.svg');
 await page.waitForFunction(()=>window.bandView.screens.status('main').label==='poster.svg'&&!window.bandView.screens.status('right').loading);
 assert.equal(await page.evaluate(()=>window.testURLs.size),3);
 await page.waitForFunction(()=>['main','left','right'].every(id=>{const c=window.bandView.venue.root.getObjectByName('LED:'+id).material.uniforms.source.value.image;const p=c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2-c.width*.05),1,1).data;return p[0]>200&&p[1]>200&&p[2]>200;}));
 const pixels=await page.evaluate(()=>['main','left','right'].map(id=>{const c=window.bandView.venue.root.getObjectByName('LED:'+id).material.uniforms.source.value.image;return [...c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2-c.width*.05),1,1).data];}));
 assert.ok(pixels.every(p=>p[0]>200&&p[1]>200&&p[2]>200));
 // Invalid decoding preserves the previous picture and revokes failed URLs.
 await page.getByLabel('导入 LED 图片或视频',{exact:true}).setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
 await page.waitForFunction(()=>document.querySelector('.band-screens p').textContent.includes('未替换画面'));
 assert.equal(await page.evaluate(()=>window.bandView.screens.status('main').label),'poster.svg');assert.equal(await page.evaluate(()=>window.testURLs.size),3);
 await page.getByLabel('目标屏幕',{exact:true}).selectOption('main');
 await page.getByLabel('导入 LED 图片或视频',{exact:true}).setInputFiles('scripts/fixtures/screens/color-cycle.mp4');
 await page.waitForFunction(()=>window.bandView.screens.status('main').label==='color-cycle.mp4');
 await page.waitForFunction(()=>window.testVideos.at(-1).currentTime>.15);
 assert.equal(await page.evaluate(()=>window.bandView.screens.status('left').label),'poster.svg');
 await page.getByRole('button',{name:'暂停画面',exact:true}).click();await page.waitForTimeout(250);
 const paused=await page.evaluate(()=>({time:window.testVideos.at(-1).currentTime,clock:window.bandView.screens.status('main').time,paused:window.testVideos.at(-1).paused}));
 assert.equal(paused.paused,true);assert.ok(Math.abs(paused.time-paused.clock%4)<.04);
 await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.testVideos.at(-1).currentTime),paused.time);
 await page.getByRole('button',{name:'继续画面',exact:true}).click();await page.waitForFunction(()=>!window.testVideos.at(-1).paused);
 // Original MIDI player remains the master clock; video seeks to song time modulo its own duration.
 const midi=new Midi(),track=midi.addTrack();track.addNote({midi:60,time:0,duration:12,velocity:.8});
 await page.evaluate(async bytes=>window.bandView.loadMidiFile(new File([new Uint8Array(bytes)],'screen-clock.mid')),[...midi.toArray()]);
 await page.evaluate(()=>window.bandView.player.seek(7.5));
 await page.waitForFunction(()=>Math.abs(window.testVideos.at(-1).currentTime-3.5)<.04&&window.testVideos.at(-1).paused);
 await page.getByRole('button',{name:'播放',exact:true}).click();await page.waitForFunction(()=>window.bandView.player.time>8);
 await page.getByRole('button',{name:'暂停',exact:true}).click();await page.waitForTimeout(250);
 assert.ok(await page.evaluate(()=>Math.abs(window.testVideos.at(-1).currentTime-window.bandView.player.time%4)<.04));
 await page.getByRole('button',{name:'恢复默认',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.testURLs.size),2);assert.equal(await page.evaluate(()=>window.testVideos.at(-1).getAttribute('src')),null);
 await page.getByLabel('目标屏幕',{exact:true}).selectOption('all');await page.getByRole('button',{name:'光带动画',exact:true}).click();
 await page.waitForFunction(()=>window.bandView.screens.status('right').label==='光带动画');
 assert.equal(await page.evaluate(()=>window.testURLs.size),0);
 // Custom provider: clock, destination dimensions and audio samples without any stage reference.
 const custom=await page.evaluate(async()=>{
  const {canvasContent}=await import('/src/screens/content.ts');window.drawFrames={};
  await window.bandView.screens.setContent(['main','left'],canvasContent('custom',(ctx,f)=>{window.drawFrames[f.width]={time:f.time,width:f.width,height:f.height,audio:!!f.audio,stage:'stage' in f};ctx.fillStyle='#00ff80';ctx.fillRect(0,0,f.width,f.height);}));
  return true;
 });assert.ok(custom);await page.waitForFunction(()=>Object.values(window.drawFrames).every(f=>f.audio));
 assert.ok(await page.evaluate(()=>Object.values(window.drawFrames).every(f=>!f.stage&&Math.abs(f.time-window.bandView.player.time)<.03)));
 const sources=await page.evaluate(async()=>{
  const {surfaceContent}=await import('/src/screens/content.ts'),T=await import('/node_modules/three/build/three.module.js');
  const canvas=new OffscreenCanvas(64,64);canvas.getContext('2d').fillRect(0,0,64,64);
  const bitmap=await createImageBitmap(canvas);await window.bandView.screens.setContent(['left'],surfaceContent('bitmap',bitmap));
  window.bandView.screens.restore(['left']);const bitmapOwned=bitmap.width===64;bitmap.close();
  const frame=new VideoFrame(canvas,{timestamp:0});await window.bandView.screens.setContent(['left'],surfaceContent('frame',frame));
  window.bandView.screens.restore(['left']);const frameOwned=frame.displayWidth===64;frame.close();
  const texture=new T.DataTexture(new Uint8Array([255,0,0,255,0,0,255,255]),2,1);texture.needsUpdate=true;window.borrowedTexture=texture;window.textureDisposals=0;texture.addEventListener('dispose',()=>window.textureDisposals++);
  await window.bandView.screens.setContent(['main'],surfaceContent('texture',texture),{fit:'contain'});
  const material=window.bandView.venue.root.getObjectByName('LED:main').material;
  const contain=material.uniforms.contentScale.value.toArray();window.bandView.screens.setOptions(['main'],{fit:'cover'});const cover=material.uniforms.contentScale.value.toArray();
  return{bitmapOwned,frameOwned,contain,cover};
 });assert.equal(sources.bitmapOwned,true);assert.equal(sources.frameOwned,true);assert.deepEqual(sources.contain,[1.6,1]);assert.deepEqual(sources.cover,[1,.625]);
 await page.evaluate(()=>window.bandView.screens.restore());
 assert.equal(await page.evaluate(()=>window.textureDisposals),0);
 await page.getByLabel('目标屏幕',{exact:true}).selectOption('all');await page.getByLabel('屏幕文字',{exact:true}).fill('UNIFIED LED\n图片 · 视频 · 程序动画');await page.getByRole('button',{name:'显示文字',exact:true}).click();
 await page.waitForFunction(()=>window.bandView.screens.status('right').label==='文字');
 await page.getByLabel('固定机位',{exact:true}).selectOption('band:venue');
 if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH});
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,panel:document.querySelector('.band-camera').getBoundingClientRect().toJSON()}));assert.ok(mobile.scroll<=mobile.width);assert.ok(mobile.panel.bottom<744);
 // Restoring before venue disposal must not accidentally dispose a borrowed GPU texture through floor reflection.
 await page.evaluate(async()=>{const {surfaceContent}=await import('/src/screens/content.ts');await window.bandView.screens.setContent(['main'],surfaceContent('borrowed',window.borrowedTexture));window.bandView.venue.update(0);window.bandView.screens.dispose();window.bandView.venue.dispose();});
 assert.equal(await page.evaluate(()=>window.textureDisposals),0);await page.evaluate(()=>window.borrowedTexture.dispose());
 assert.deepEqual(errors,[]);
 console.log('Chrome screens: image/video import, decode failure preservation, native video pause/seek/song sync, independent screens, canvas/audio input, ImageBitmap/VideoFrame/GPU texture, fitting, ownership, mobile UI and disposal passed.');
}finally{await browser.close();}
