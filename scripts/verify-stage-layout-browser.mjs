import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {Midi}=require('@tonejs/midi');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
 const page=await browser.newPage({viewport:{width:1200,height:800},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/band/`);
 await page.waitForFunction(()=>window.bandView?.session,null,{timeout:90000});
 const initial=await page.evaluate(async()=>{
  const v=window.bandView, T=await import('/node_modules/three/build/three.module.js');
  let meshes=0,lights=0,vertices=0;v.venue.root.traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position.count*(o.isInstancedMesh?o.count:1);}if(o.isLight)lights++;});
  const bounds=v.instruments.list().map(i=>{const b=new T.Box3().setFromObject(i.root);return{id:i.id,minY:b.min.y,height:b.max.y-b.min.y};});
  window.oldInstances=new Map(v.instruments.list().map(i=>[i.id,i]));
  window.oldLayout=structuredClone(v.session.layout);
  const first=v.session.apply(), before=first.group.children.map(h=>({id:h.name,p:h.position.toArray(),s:h.scale.toArray()}));
  const second=v.session.apply(), after=second.group.children.map(h=>({id:h.name,p:h.position.toArray(),s:h.scale.toArray()}));
  // Reattach after exercising absolute application (the live band group is intentionally stable).
  for(const holder of [...second.group.children])v.band.add(holder);
  return{meshes,lights,vertices,bounds,before,after,legacyGlobals:!!(window.__NOCTURNE_LAYOUT_HOST__||window.__NOCTURNE_LAYOUT_STAGE__)};
 });
 assert.deepEqual([initial.meshes,initial.lights,initial.vertices],[614,39,526740],'preserved venue geometry');
 assert.equal(initial.legacyGlobals,false);assert.deepEqual(initial.before,initial.after,'repeated application is idempotent');
 const heights={'cello.main':1.465,'saxophone.main':.95,'piano.main':1.85,'drums.main':1.45,'keyboard.main':1.2,'violin.main':.72,'electric.main':1.08,'acoustic.main':1.1,'bass.main':1.24};
 for(const b of initial.bounds){assert.ok(Math.abs(b.minY-1.2)<.03,`${b.id} grounded`);assert.ok(Math.abs(b.height-heights[b.id])<.03,`${b.id} real dimensions`);}
 // A MIDI rebuild retains the model but recomposes unlocked positions for the new roster.
 const midi=new Midi();const track=midi.addTrack();track.instrument.number=4;track.addNote({midi:60,time:0,duration:2,velocity:.7});const bytes=[...midi.toArray()];
 await page.evaluate(async bytes=>window.bandView.loadMidiFile(new File([new Uint8Array(bytes)],'reuse.mid')),bytes);
 assert.ok(await page.evaluate(()=>window.bandView.instruments.get('keyboard.main')===window.oldInstances.get('keyboard.main')),'same object reused');
 assert.ok(await page.evaluate(()=>{const [x,,z]=window.bandView.session.layout.instances[0].transform.position;return Math.abs(x)<1e-6&&Math.abs(z-.6)<1e-6;}),'a single remaining instrument is recentered');
 await page.getByRole('button',{name:'重新排位',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.bandView.player.scheduledNotes),1,'rearrange retains playback binding');
 // Exact saved ID mapping, even when the layout lists same-type instruments in reverse order.
 const layout={schemaVersion:3,venueId:'nocturne',units:'meters',name:'id-mapping',instances:[
  {id:'keys.right',type:'keyboard',locked:true,transform:{position:[3,0,1],rotation:[0,Math.PI,0],scale:1}},
  {id:'keys.left',type:'keyboard',transform:{position:[-3,0,1],rotation:[0,Math.PI/2,0],scale:1}},
 ]};
 await page.evaluate(async layout=>window.bandView.loadLayoutFile(new File([JSON.stringify(layout)],'layout.json')),layout);
 const placed=await page.evaluate(()=>window.bandView.session.members.map(m=>({id:m.id,x:m.holder.position.x,y:m.holder.position.y,z:m.holder.position.z})));
 assert.deepEqual(placed,[{id:'keys.right',x:3,y:0,z:1},{id:'keys.left',x:-3,y:0,z:1}]);
 await page.getByRole('button',{name:'重新排位',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.bandView.session.members.find(m=>m.id==='keys.right').holder.position.x),3,'saved lock retained');
 const preserved=await page.evaluate(()=>{window.preservedBand=window.bandView.band;return JSON.stringify(window.bandView.session.layout);});
 const impossible={...layout,instances:layout.instances.map(i=>({...i,transform:{...i.transform,scale:10}}))};
 await page.evaluate(async layout=>window.bandView.loadLayoutFile(new File([JSON.stringify(layout)],'too-large.json')),impossible);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.bandView.session.layout)),preserved,'failed import preserves current layout');
 assert.equal(await page.evaluate(()=>window.bandView.band===window.preservedBand),true,'failed import preserves current scene');
 // Independent venue lifecycle, using a second host with no window bridge.
 const lifecycle=await page.evaluate(async()=>{
  const {RendererHost}=await import('/src/engine/RendererHost.ts');const {NocturneVenue}=await import('/src/venues/nocturne/NocturneVenue.ts');
  const mount=document.createElement('div');mount.style.cssText='width:100px;height:100px;position:fixed;left:-200px';document.body.append(mount);
  const h=new RendererHost(mount),a=new NocturneVenue(h);const root=a.root;let disposedGeometry=0;
  root.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposedGeometry++));
  const b=new NocturneVenue(h);const firstDetached=root.parent===null;const count=h.scene.children.filter(o=>o.name==='venue:nocturne').length;
  b.update(.016);h.resizeIfNeeded();h.render(window.bandView.camera.output);b.dispose();b.dispose();
  const cleared=h.scene.children.length===0&&h.scene.environment===null;h.dispose();mount.remove();return{firstDetached,count,cleared,disposedGeometry};
 });
 assert.equal(lifecycle.firstDetached,true);assert.equal(lifecycle.count,1);assert.equal(lifecycle.cleared,true);assert.ok(lifecycle.disposedGeometry>0);
 assert.deepEqual(errors,[]);
 if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH});
 console.log('Chrome stage/layout: preserved geometry, independent disposal, real dimensions, idempotence, instance reuse, exact JSON IDs, locks and failed-import rollback passed.');
 // Editor's own runtime uses the same JSON and stage without a band host.
 await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/layout/`);
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='自动排位'&&!b.disabled),null,{timeout:90000});
 await page.getByLabel('锁定',{exact:true}).check();
 await page.getByRole('button',{name:'自动排位',exact:true}).click();
 assert.equal(await page.getByLabel('锁定',{exact:true}).isChecked(),true);
 assert.deepEqual(errors,[]);
 console.log('Chrome editor: lock survives automatic arrangement.');
}finally{await browser.close();}
