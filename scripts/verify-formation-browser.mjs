import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.TEST_URL||'http://localhost:5173'}/studio/band/`);
 await page.waitForFunction(()=>window.bandView?.session,null,{timeout:90000});
 const loadExample=async()=>{await page.getByRole('button',{name:'载入波西米亚示例',exact:true}).click();await page.waitForFunction(()=>window.bandView.player&&!document.querySelector('.band-lighting button').disabled,null,{timeout:120000});await page.evaluate(()=>{window.bandView.player.pause();window.bandView.player.seek(30);});};
 await loadExample();
 const snapshot=()=>page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),v=window.bandView;return{layout:v.session.layout,size:new T.Box3().setFromObject(v.band).getSize(new T.Vector3()).toArray()};});
 const first=await snapshot();assert.equal(first.layout.instances.length,7);assert.ok(first.size[0]>10 && first.size[2]<5.5);assert.ok(Math.abs(first.size[1]-1.85)<.01,'physical scale unchanged');
 await page.evaluate(()=>{window.formationModels=new Map(window.bandView.instruments.list().map(i=>[i.id,i]));});
 await page.getByRole('button',{name:'重新排位',exact:true}).click();assert.deepEqual((await snapshot()).layout,first.layout,'rearranging an automatic formation is idempotent');
 assert.ok(await page.evaluate(()=>window.bandView.instruments.list().every(i=>window.formationModels.get(i.id)===i)),'rearranging reuses all models');
 for(const view of ['audience','overhead','venue']){
  await page.getByLabel('固定机位',{exact:true}).selectOption('band:'+view);await page.waitForTimeout(250);
  assert.ok(await page.evaluate(()=>window.bandView.camera.output.position.toArray().every(Number.isFinite)));
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/formation-${view}.png`});}
 }
 // Loading the same MIDI via a different preceding layout must not change its automatic formation.
 const changed=structuredClone(first.layout);for(const i of changed.instances)i.transform.position[0]+=.5;
 await page.evaluate(async layout=>window.bandView.loadLayoutFile(new File([JSON.stringify(layout)],'shifted.json')),changed);
 assert.equal(await page.evaluate(()=>window.bandView.player),null);
 await loadExample();assert.deepEqual((await snapshot()).layout,first.layout,'prior automatic positions do not affect the new roster');
 // User locks persist through MIDI reload, while all other members find valid space.
 const locked=structuredClone(first.layout),drum=locked.instances.find(i=>i.type==='drums');drum.locked=true;drum.transform.position=[0,0,-3];
 await page.evaluate(async layout=>window.bandView.loadLayoutFile(new File([JSON.stringify(layout)],'locked.json')),locked);
 await loadExample();const after=await snapshot();assert.deepEqual(after.layout.instances.find(i=>i.type==='drums'),drum);
 const issues=await page.evaluate(async()=>{const {validateLayout}=await import('/src/layout/AutoLayout.ts');const {footprintsOf}=await import('/src/layout/presentBand.ts');const v=window.bandView;return validateLayout(v.session.layout,footprintsOf(v.session.members),v.venue.layout);});assert.deepEqual(issues,[]);
 assert.deepEqual(errors,[]);
 console.log('Chrome formation: Queen width/depth',first.size.map(n=>+n.toFixed(3)),'physical scale, reflow, model identity, deterministic reload and persistent locks passed.');
}finally{await browser.close();}
