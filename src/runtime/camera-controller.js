'use strict';

// Camera v2 — adaptive stage framing and instrument focus.
// Loaded before app.js so it can capture the stage roots and renderer, while leaving
// the MIDI/audio/instrument controllers untouched. The legacy camera may still update
// its private state, but every actual stage render is composed through this controller.
(() => {
  const T = THREE;
  const stage = document.getElementById('stage');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const roots = [];
  let renderer = null, scene = null, camera = null, canvas = null;
  let ready = false, initialFitDone = false, raf = 0, lastFrame = performance.now();
  let activeView = 'front', focusedRoot = null, baseDistance = 20, interactionMoved = false;

  const state = { target:new T.Vector3(0,4,0), yaw:0, pitch:.20, distance:28 };
  const want = { target:state.target.clone(), yaw:state.yaw, pitch:state.pitch, distance:state.distance };
  const VIEWS = {
    front:{yaw:.035,pitch:.205,margin:1.18},
    left:{yaw:-.70,pitch:.235,margin:1.16},
    right:{yaw:.70,pitch:.235,margin:1.16},
    top:{yaw:.08,pitch:.90,margin:1.12},
  };

  const rootLabel = root => {
    const name=root?.name||'';
    if(name.includes('dual-tier'))return '双层键盘';
    if(/Wish Acoustic 1$/.test(name))return '木吉他 1';
    if(/Wish Acoustic 2$/.test(name))return '木吉他 2';
    if(/Wish Acoustic 3$/.test(name))return '木吉他 3';
    if(name.includes('Fingered Bass'))return 'Bass';
    const electric=/Electric (\d+)$/.exec(name);if(electric)return '电吉他 '+electric[1];
    if(name.includes('Band Drums'))return '架子鼓';
    return name||'乐器';
  };
  const isBandRoot = object => {
    const name=object?.name||'';
    return name==='Atelier — dual-tier stage rig'||/^Wish Acoustic \d+$/.test(name)||name==='Wish Fingered Bass'||/Electric \d+$/.test(name)||name==='Atelier Session 04 · Band Drums';
  };

  // Capture instrument roots. stage-layout.js and shadow-sync.js wrap Scene.add after
  // this file; both eventually restore back to this wrapper.
  const sceneAdd=T.Scene.prototype.add;
  T.Scene.prototype.add=function(...objects){
    const result=sceneAdd.apply(this,objects);
    for(const object of objects)if(isBandRoot(object)&&!roots.includes(object))roots.push(object);
    return result;
  };

  // PMREM also renders internally during startup. Only capture a perspective camera
  // whose scene actually owns one of our band roots, otherwise the environment-map
  // helper camera would be mistaken for the stage camera.
  const rawRender=T.WebGLRenderer.prototype.render;
  T.WebGLRenderer.prototype.render=function(renderScene,renderCamera){
    if(!camera&&renderCamera?.isPerspectiveCamera&&roots.some(root=>root.parent===renderScene)){
      renderer=this;scene=renderScene;camera=renderCamera;
      if(ready&&!initialFitDone)requestAnimationFrame(()=>goView('front',true));
    }
    if(ready&&renderCamera===camera)applyPose();
    return rawRender.call(this,renderScene,renderCamera);
  };

  function worldVisible(object){for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;}
  function visibleRoots(){return roots.filter(root=>root.parent&&worldVisible(root));}
  function boundsFor(objects){
    const box=new T.Box3().makeEmpty();
    for(const object of objects){object.updateWorldMatrix(true,true);box.expandByObject(object,true);}
    return box.isEmpty()?null:box;
  }
  function boxCorners(box){
    const {min,max}=box;return [
      new T.Vector3(min.x,min.y,min.z),new T.Vector3(max.x,min.y,min.z),new T.Vector3(min.x,max.y,min.z),new T.Vector3(max.x,max.y,min.z),
      new T.Vector3(min.x,min.y,max.z),new T.Vector3(max.x,min.y,max.z),new T.Vector3(min.x,max.y,max.z),new T.Vector3(max.x,max.y,max.z)
    ];
  }

  // Fit from actual Box3 corner extents in the requested camera orientation. This
  // replaces the old authored width/height constants and adapts to song visibility,
  // imported MIDI, stage layout changes, window aspect ratio and mobile screens.
  function fitBox(box,yaw,pitch,margin=1.16,focused=false){
    if(!camera)return null;
    const size=box.getSize(new T.Vector3()),target=box.getCenter(new T.Vector3());
    if(!focused)target.y-=size.y*.055; // reserve visual room for the bottom transport
    const cp=Math.cos(pitch),sp=Math.sin(pitch);
    const back=new T.Vector3(Math.sin(yaw)*cp,sp,Math.cos(yaw)*cp),forward=back.clone().multiplyScalar(-1);
    const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).normalize();
    const up=new T.Vector3().crossVectors(right,forward).normalize();
    const vfov=T.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*Math.max(.25,camera.aspect||1));
    const tanV=Math.tan(vfov/2),tanH=Math.tan(hfov/2);let distance=.1;
    for(const point of boxCorners(box)){
      const v=point.sub(target),depthOffset=v.dot(forward);
      distance=Math.max(distance,Math.abs(v.dot(right))*margin/tanH-depthOffset,Math.abs(v.dot(up))*margin/tanV-depthOffset);
    }
    const diagonal=Math.max(.1,size.length());
    distance=Math.max(distance,diagonal*(focused?.52:.42),focused?2.3:8);
    return {target,distance};
  }

  function shortestYaw(from,to){return from+Math.atan2(Math.sin(to-from),Math.cos(to-from));}
  function setDesired(target,yaw,pitch,distance,instant=false){
    want.target.copy(target);want.yaw=shortestYaw(state.yaw,yaw);want.pitch=T.MathUtils.clamp(pitch,.10,1.22);want.distance=Math.max(.8,distance);
    if(instant||reducedMotion){state.target.copy(want.target);state.yaw=want.yaw;state.pitch=want.pitch;state.distance=want.distance;applyPose();renderNow();return;}
    scheduleFrame();
  }
  function applyPose(){
    if(!camera)return;const cp=Math.cos(state.pitch);
    camera.position.set(state.target.x+Math.sin(state.yaw)*cp*state.distance,state.target.y+Math.sin(state.pitch)*state.distance,state.target.z+Math.cos(state.yaw)*cp*state.distance);
    camera.lookAt(state.target);camera.near=Math.max(.04,state.distance*.0015);camera.far=Math.max(180,state.distance*5);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  function renderNow(){if(!renderer||!scene||!camera)return;applyPose();rawRender.call(renderer,scene,camera);}
  function frame(now){
    raf=0;const dt=Math.min(.05,Math.max(.001,(now-lastFrame)/1000)),ease=1-Math.exp(-dt*9.5);lastFrame=now;
    state.target.lerp(want.target,ease);state.yaw+=(want.yaw-state.yaw)*ease;state.pitch+=(want.pitch-state.pitch)*ease;state.distance+=(want.distance-state.distance)*ease;renderNow();
    const moving=state.target.distanceTo(want.target)+Math.abs(state.yaw-want.yaw)+Math.abs(state.pitch-want.pitch)+Math.abs(state.distance-want.distance)>.0015;
    if(moving)scheduleFrame();
  }
  function scheduleFrame(){if(raf)return;lastFrame=performance.now();raf=requestAnimationFrame(frame);}

  function updatePresetUi(){
    document.querySelectorAll('#camera-menu [data-camera]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.camera===activeView&&!focusedRoot)));
    const note=document.getElementById('camera-v2-note');if(note)note.textContent=focusedRoot?`聚焦 · ${rootLabel(focusedRoot)} · 双击空地返回全景`:'双击乐器聚焦 · 左拖旋转 · 右拖平移 · 滚轮缩放';
  }
  function goView(id='front',instant=false){
    const spec=VIEWS[id]||VIEWS.front,box=boundsFor(visibleRoots());if(!box)return false;
    const fit=fitBox(box,spec.yaw,spec.pitch,spec.margin,false);if(!fit)return false;
    focusedRoot=null;activeView=id;baseDistance=fit.distance;initialFitDone=true;setDesired(fit.target,spec.yaw,spec.pitch,fit.distance,instant);updatePresetUi();return true;
  }
  function focusRoot(root,instant=false){
    if(!root||!worldVisible(root))return false;const box=boundsFor([root]);if(!box)return false;
    const label=rootLabel(root);let yaw=.05;if(label.includes('架子鼓'))yaw=.16;else if(label.includes('电吉他'))yaw=.10;else if(label.includes('木吉他'))yaw=-.08;else if(label==='Bass')yaw=.08;
    const pitch=label.includes('双层键盘')?.18:.20,fit=fitBox(box,yaw,pitch,1.28,true);if(!fit)return false;
    focusedRoot=root;activeView='focus';baseDistance=fit.distance;setDesired(fit.target,yaw,pitch,fit.distance,instant);updatePresetUi();return true;
  }
  function zoomLimits(){return focusedRoot?[Math.max(.9,baseDistance*.30),Math.max(6,baseDistance*2.8)]:[Math.max(5,baseDistance*.54),Math.max(18,baseDistance*2.5)];}
  function zoomBy(factor){const [min,max]=zoomLimits();state.distance=want.distance=T.MathUtils.clamp(state.distance*factor,min,max);activeView=focusedRoot?'focus':'custom';updatePresetUi();renderNow();}
  function orbit(dx,dy){state.yaw=want.yaw=state.yaw-dx*.0062;state.pitch=want.pitch=T.MathUtils.clamp(state.pitch-dy*.0046,.10,1.22);activeView=focusedRoot?'focus':'custom';updatePresetUi();renderNow();}
  function pan(dx,dy){
    if(!camera||!canvas)return;const worldPerPixel=state.distance*2*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,canvas.clientHeight);
    camera.updateMatrixWorld(true);const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize(),up=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();
    state.target.addScaledVector(right,-dx*worldPerPixel).addScaledVector(up,dy*worldPerPixel);want.target.copy(state.target);activeView=focusedRoot?'focus':'custom';updatePresetUi();renderNow();
  }

  const raycaster=new T.Raycaster(),ndc=new T.Vector2();
  function intersectionsAt(clientX,clientY){
    if(!camera||!canvas)return [];const rect=canvas.getBoundingClientRect();ndc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(ndc,camera);return raycaster.intersectObjects(visibleRoots(),true);
  }
  function bandRootFor(object){for(let o=object;o;o=o.parent)if(roots.includes(o))return o;return null;}
  function playableHit(clientX,clientY){const hit=intersectionsAt(clientX,clientY)[0]?.object;for(let o=hit;o;o=o.parent){if(o.userData?.key||o.userData?.pedal)return true;if(roots.includes(o))break;}return false;}
  function pickedRoot(clientX,clientY){for(const hit of intersectionsAt(clientX,clientY)){const root=bandRootFor(hit.object);if(root)return root;}return null;}

  const pointers=new Map();let gesture=null,lastTouchTap={time:0,x:0,y:0};
  function capture(event){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();}
  function setupCanvas(){
    canvas=stage?.querySelector('canvas');if(!canvas||canvas.dataset.cameraV2==='1')return;canvas.dataset.cameraV2='1';
    canvas.addEventListener('contextmenu',capture,true);
    canvas.addEventListener('pointerdown',event=>{
      if(event.button===0&&!event.shiftKey&&playableHit(event.clientX,event.clientY))return;
      capture(event);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,type:event.pointerType,button:event.button,shift:event.shiftKey});interactionMoved=false;
      try{canvas.setPointerCapture(event.pointerId)}catch{}canvas.classList.add('dragging');if(pointers.size>=2)gesture=null;
    },true);
    canvas.addEventListener('pointermove',event=>{
      const pointer=pointers.get(event.pointerId);if(!pointer)return;capture(event);const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;pointer.x=event.clientX;pointer.y=event.clientY;
      if(Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)>4)interactionMoved=true;
      if(pointers.size>=2){
        const two=[...pointers.values()].slice(0,2),cx=(two[0].x+two[1].x)/2,cy=(two[0].y+two[1].y)/2,dist=Math.hypot(two[0].x-two[1].x,two[0].y-two[1].y);
        if(gesture){pan(cx-gesture.cx,cy-gesture.cy);if(dist>4&&gesture.dist>4)zoomBy(gesture.dist/dist);}gesture={cx,cy,dist};
      }else if(pointer.button===2||pointer.shift)pan(dx,dy);else orbit(dx,dy);
    },true);
    const endPointer=event=>{
      const pointer=pointers.get(event.pointerId);if(!pointer)return;capture(event);pointers.delete(event.pointerId);if(pointers.size<2)gesture=null;if(!pointers.size)canvas.classList.remove('dragging');
      if(pointer.type==='touch'&&!interactionMoved){const now=performance.now(),near=Math.hypot(event.clientX-lastTouchTap.x,event.clientY-lastTouchTap.y)<28;if(now-lastTouchTap.time<330&&near){const root=pickedRoot(event.clientX,event.clientY);root?focusRoot(root):goView('front');lastTouchTap.time=0;}else lastTouchTap={time:now,x:event.clientX,y:event.clientY};}
    };
    canvas.addEventListener('pointerup',endPointer,true);canvas.addEventListener('pointercancel',endPointer,true);canvas.addEventListener('lostpointercapture',event=>{if(pointers.has(event.pointerId))endPointer(event);},true);
    canvas.addEventListener('wheel',event=>{capture(event);zoomBy(Math.exp(T.MathUtils.clamp(event.deltaY,-180,180)*.00155));},{capture:true,passive:false});
    canvas.addEventListener('dblclick',event=>{capture(event);const root=pickedRoot(event.clientX,event.clientY);root?focusRoot(root):goView('front');},true);
  }

  function setupUi(){
    const menu=document.getElementById('camera-menu');if(!menu||menu.dataset.cameraV2==='1')return;menu.dataset.cameraV2='1';
    const controls=menu.querySelector('.controls');if(controls)controls.innerHTML='<button class="view" data-camera="front" aria-pressed="true">正面</button><button class="view" data-camera="left" aria-pressed="false">左侧</button><button class="view" data-camera="right" aria-pressed="false">右侧</button><button class="view" data-camera="top" aria-pressed="false">俯视</button>';
    const tools=menu.querySelector('.right-tools');if(tools)tools.innerHTML='<button class="circle" id="zoom-in" type="button" title="放大" aria-label="放大">＋</button><button class="circle" id="zoom-out" type="button" title="缩小" aria-label="缩小">−</button><button class="circle" id="reset" type="button" title="回到全乐队" aria-label="回到全乐队">⌂ 全景</button>';
    const note=document.createElement('div');note.id='camera-v2-note';note.className='camera-v2-note';note.textContent='双击乐器聚焦 · 左拖旋转 · 右拖平移 · 滚轮缩放';menu.querySelector('.camera-panel')?.appendChild(note);
    const style=document.createElement('style');style.textContent='.camera-panel{width:214px!important}.camera-v2-note{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:9px;line-height:1.5;color:#73878e}#camera-menu #reset{font-size:10px;white-space:nowrap}';document.head.appendChild(style);
    menu.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',event=>{capture(event);goView(button.dataset.camera);stage?.focus({preventScroll:true});},true));
    document.getElementById('zoom-in')?.addEventListener('click',event=>{capture(event);zoomBy(.82);},true);document.getElementById('zoom-out')?.addEventListener('click',event=>{capture(event);zoomBy(1/.82);},true);document.getElementById('reset')?.addEventListener('click',event=>{capture(event);goView('front');},true);
  }

  let refitTicket=0;
  function scheduleRefit(){const ticket=++refitTicket;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(ticket!==refitTicket||!ready)return;goView('front');}));}
  setupUi();
  for(const id of ['bp-song','bp-mode','bp-instrument','pr-target'])document.getElementById(id)?.addEventListener('change',scheduleRefit);
  window.addEventListener('resize',()=>{if(!ready)return;requestAnimationFrame(()=>{if(focusedRoot)focusRoot(focusedRoot,true);else if(VIEWS[activeView])goView(activeView,true);else renderNow();});});

  Promise.resolve(window.stageRigReady).then(()=>{
    setupCanvas();ready=true;
    if(camera)goView('front',true); // otherwise first real stage render initializes it
  }).catch(()=>{});

  window.VirtualBandCamera={
    home:()=>goView('front'),view:id=>goView(id),focus:root=>focusRoot(root),refit:scheduleRefit,
    get roots(){return [...roots]},
    get state(){return {view:activeView,focused:focusedRoot?.name||null,yaw:state.yaw,pitch:state.pitch,distance:state.distance,target:state.target.clone()}}
  };
})();
