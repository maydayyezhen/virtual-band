'use strict';

// Camera v2, phase 1. This file runs after app.js has installed its legacy listeners.
// camera-capture.js exposes the real stage renderer/scene/camera; this controller then
// becomes authoritative only for the final stage pose while leaving MIDI/audio logic alone.
(() => {
  const T = THREE;
  const stage = document.getElementById('stage');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VIEWS = {
    front: { yaw:  0.02, pitch: 0.18, margin: 1.18 },
    left:  { yaw: -0.68, pitch: 0.23, margin: 1.16 },
    right: { yaw:  0.68, pitch: 0.23, margin: 1.16 },
    top:   { yaw:  0.06, pitch: 0.92, margin: 1.12 },
  };

  let renderer = null, scene = null, camera = null, canvas = null;
  let legacyRender = null, ready = false, raf = 0, lastFrame = performance.now();
  let activeView = 'front', focusedRoot = null, baseDistance = 24;

  const state = { target: new T.Vector3(0,4,0), yaw:0, pitch:.18, distance:30 };
  const want  = { target: state.target.clone(), yaw:0, pitch:.18, distance:30 };
  const roots = [];

  function isBandRoot(object) {
    const name = object?.name || '';
    return name === 'Atelier — dual-tier stage rig' ||
      /^Wish Acoustic \d+$/.test(name) ||
      name === 'Wish Fingered Bass' ||
      /Electric \d+$/.test(name) ||
      name === 'Atelier Session 04 · Band Drums';
  }

  function rootLabel(root) {
    const name = root?.name || '';
    if (name.includes('dual-tier')) return '双层键盘';
    if (name.includes('Fingered Bass')) return 'Bass';
    if (name.includes('Band Drums')) return '架子鼓';
    const a = /Wish Acoustic (\d+)$/.exec(name); if (a) return `木吉他 ${a[1]}`;
    const e = /Electric (\d+)$/.exec(name); if (e) return `电吉他 ${e[1]}`;
    return name || '乐器';
  }

  function collectRoots() {
    roots.length = 0;
    for (const child of scene?.children || []) if (isBandRoot(child)) roots.push(child);
  }

  function worldVisible(object) {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  function visibleRoots() {
    return roots.filter(root => root.parent && worldVisible(root));
  }

  function boundsFor(objects) {
    const box = new T.Box3().makeEmpty();
    for (const object of objects) {
      object.updateWorldMatrix(true, true);
      box.expandByObject(object, true);
    }
    return box.isEmpty() ? null : box;
  }

  function corners(box) {
    const {min,max}=box;
    return [
      new T.Vector3(min.x,min.y,min.z), new T.Vector3(max.x,min.y,min.z),
      new T.Vector3(min.x,max.y,min.z), new T.Vector3(max.x,max.y,min.z),
      new T.Vector3(min.x,min.y,max.z), new T.Vector3(max.x,min.y,max.z),
      new T.Vector3(min.x,max.y,max.z), new T.Vector3(max.x,max.y,max.z),
    ];
  }

  function fitBox(box, yaw, pitch, margin=1.16, focused=false) {
    if (!camera) return null;
    const size = box.getSize(new T.Vector3());
    const target = box.getCenter(new T.Vector3());
    if (!focused) target.y -= size.y * .045;

    const cp=Math.cos(pitch), sp=Math.sin(pitch);
    const back = new T.Vector3(Math.sin(yaw)*cp, sp, Math.cos(yaw)*cp);
    const forward = back.clone().multiplyScalar(-1);
    const right = new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).normalize();
    const up = new T.Vector3().crossVectors(right,forward).normalize();
    const vfov=T.MathUtils.degToRad(camera.fov);
    const hfov=2*Math.atan(Math.tan(vfov/2)*Math.max(.25,camera.aspect||1));
    const tanV=Math.tan(vfov/2), tanH=Math.tan(hfov/2);
    let distance=.1;

    for (const point of corners(box)) {
      const v=point.sub(target), depth=v.dot(forward);
      distance=Math.max(distance,
        Math.abs(v.dot(right))*margin/tanH-depth,
        Math.abs(v.dot(up))*margin/tanV-depth);
    }

    const diagonal=Math.max(.1,size.length());
    distance=Math.max(distance, diagonal*(focused?.50:.40), focused?2.4:8.5);
    return {target,distance};
  }

  function shortestYaw(from,to) {
    return from + Math.atan2(Math.sin(to-from),Math.cos(to-from));
  }

  function applyPose() {
    if (!camera) return;
    const cp=Math.cos(state.pitch);
    camera.position.set(
      state.target.x + Math.sin(state.yaw)*cp*state.distance,
      Math.max(.18,state.target.y + Math.sin(state.pitch)*state.distance),
      state.target.z + Math.cos(state.yaw)*cp*state.distance
    );
    camera.lookAt(state.target);
    camera.near=Math.max(.04,state.distance*.0015);
    camera.far=Math.max(180,state.distance*5);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function renderNow() {
    if (!ready || !legacyRender) return;
    applyPose();
    legacyRender(scene,camera);
  }

  function frame(now) {
    raf=0;
    const dt=Math.min(.05,Math.max(.001,(now-lastFrame)/1000));
    const ease=1-Math.exp(-dt*10);
    lastFrame=now;
    state.target.lerp(want.target,ease);
    state.yaw += (want.yaw-state.yaw)*ease;
    state.pitch += (want.pitch-state.pitch)*ease;
    state.distance += (want.distance-state.distance)*ease;
    renderNow();
    const moving=state.target.distanceTo(want.target)+Math.abs(state.yaw-want.yaw)+Math.abs(state.pitch-want.pitch)+Math.abs(state.distance-want.distance)>.0015;
    if (moving) scheduleFrame();
  }

  function scheduleFrame() {
    if (raf) return;
    lastFrame=performance.now();
    raf=requestAnimationFrame(frame);
  }

  function setDesired(target,yaw,pitch,distance,instant=false) {
    want.target.copy(target);
    want.yaw=shortestYaw(state.yaw,yaw);
    want.pitch=T.MathUtils.clamp(pitch,.10,1.22);
    want.distance=Math.max(.8,distance);
    if (instant || reducedMotion) {
      state.target.copy(want.target);state.yaw=want.yaw;state.pitch=want.pitch;state.distance=want.distance;
      renderNow();
    } else scheduleFrame();
  }

  function updateUi() {
    document.querySelectorAll('#camera-menu [data-camera]').forEach(button=>
      button.setAttribute('aria-pressed',String(button.dataset.camera===activeView&&!focusedRoot)));
    const note=document.getElementById('camera-v2-note');
    if (note) note.textContent=focusedRoot ? `聚焦 · ${rootLabel(focusedRoot)} · 双击空地返回全景` : '双击乐器聚焦 · 左拖旋转 · 右拖平移 · 滚轮缩放';
  }

  function goView(id='front',instant=false) {
    collectRoots();
    const objects=visibleRoots();
    const box=boundsFor(objects); if (!box) return false;
    const spec=VIEWS[id]||VIEWS.front;
    const fit=fitBox(box,spec.yaw,spec.pitch,spec.margin,false); if (!fit) return false;
    focusedRoot=null;activeView=id;baseDistance=fit.distance;
    setDesired(fit.target,spec.yaw,spec.pitch,fit.distance,instant);updateUi();return true;
  }

  function focusRoot(root,instant=false) {
    if (!root || !worldVisible(root)) return false;
    const box=boundsFor([root]); if (!box) return false;
    const label=rootLabel(root);
    let yaw=.03,pitch=.18;
    if (label==='架子鼓') { yaw=.16; pitch=.22; }
    else if (label.startsWith('电吉他')) yaw=.10;
    else if (label.startsWith('木吉他')) yaw=-.08;
    else if (label==='Bass') yaw=.08;
    else if (label==='双层键盘') { yaw=.03; pitch=.16; }
    const fit=fitBox(box,yaw,pitch,1.28,true); if (!fit) return false;
    focusedRoot=root;activeView='focus';baseDistance=fit.distance;
    setDesired(fit.target,yaw,pitch,fit.distance,instant);updateUi();return true;
  }

  function zoomLimits() {
    return focusedRoot ? [Math.max(.9,baseDistance*.34),Math.max(7,baseDistance*2.7)] : [Math.max(5,baseDistance*.56),Math.max(20,baseDistance*2.4)];
  }

  function zoomBy(factor) {
    const [min,max]=zoomLimits();
    state.distance=want.distance=T.MathUtils.clamp(state.distance*factor,min,max);
    activeView=focusedRoot?'focus':'custom';updateUi();renderNow();
  }

  function orbit(dx,dy) {
    state.yaw=want.yaw=state.yaw-dx*.006;
    state.pitch=want.pitch=T.MathUtils.clamp(state.pitch-dy*.0045,.10,1.22);
    activeView=focusedRoot?'focus':'custom';updateUi();renderNow();
  }

  function pan(dx,dy) {
    if (!camera || !canvas) return;
    const worldPerPixel=state.distance*2*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,canvas.clientHeight);
    applyPose();
    const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();
    const up=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();
    state.target.addScaledVector(right,-dx*worldPerPixel).addScaledVector(up,dy*worldPerPixel);
    want.target.copy(state.target);activeView=focusedRoot?'focus':'custom';updateUi();renderNow();
  }

  const raycaster=new T.Raycaster(), ndc=new T.Vector2();
  function hitsAt(x,y) {
    const rect=canvas.getBoundingClientRect();
    ndc.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(ndc,camera);
    return raycaster.intersectObjects(visibleRoots(),true);
  }
  function bandRootFor(object) { for(let o=object;o;o=o.parent) if(roots.includes(o)) return o; return null; }
  function pickedRoot(x,y) { for(const hit of hitsAt(x,y)){const root=bandRootFor(hit.object);if(root)return root;} return null; }
  function playableHit(x,y) {
    const hit=hitsAt(x,y)[0]?.object;
    for(let o=hit;o;o=o.parent){ if(o.userData?.key||o.userData?.pedal)return true; if(roots.includes(o))break; }
    return false;
  }

  function stop(event) {
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  }

  function setupCanvas() {
    canvas=stage?.querySelector('canvas'); if(!canvas) return false;
    const pointers=new Map(); let gesture=null; let moved=false; let lastTouchTap={time:0,x:0,y:0};
    canvas.addEventListener('contextmenu',stop,true);
    canvas.addEventListener('pointerdown',event=>{
      if(event.button===0&&!event.shiftKey&&playableHit(event.clientX,event.clientY))return;
      stop(event);moved=false;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,sx:event.clientX,sy:event.clientY,type:event.pointerType,button:event.button,shift:event.shiftKey});
      try{canvas.setPointerCapture(event.pointerId)}catch{}canvas.classList.add('dragging');
      if(pointers.size>=2)gesture=null;
    },true);
    canvas.addEventListener('pointermove',event=>{
      const p=pointers.get(event.pointerId); if(!p)return;
      stop(event);const dx=event.clientX-p.x,dy=event.clientY-p.y;p.x=event.clientX;p.y=event.clientY;
      if(Math.hypot(event.clientX-p.sx,event.clientY-p.sy)>4)moved=true;
      if(pointers.size>=2){
        const two=[...pointers.values()].slice(0,2),cx=(two[0].x+two[1].x)/2,cy=(two[0].y+two[1].y)/2,dist=Math.hypot(two[0].x-two[1].x,two[0].y-two[1].y);
        if(gesture){pan(cx-gesture.cx,cy-gesture.cy);if(dist>4&&gesture.dist>4)zoomBy(gesture.dist/dist);}gesture={cx,cy,dist};
      }else if(p.button===2||p.shift)pan(dx,dy);else orbit(dx,dy);
    },true);
    const end=event=>{
      const p=pointers.get(event.pointerId);if(!p)return;stop(event);pointers.delete(event.pointerId);if(pointers.size<2)gesture=null;if(!pointers.size)canvas.classList.remove('dragging');
      if(p.type==='touch'&&!moved){const now=performance.now(),near=Math.hypot(event.clientX-lastTouchTap.x,event.clientY-lastTouchTap.y)<28;if(now-lastTouchTap.time<330&&near){const root=pickedRoot(event.clientX,event.clientY);root?focusRoot(root):goView('front');lastTouchTap.time=0;}else lastTouchTap={time:now,x:event.clientX,y:event.clientY};}
    };
    canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);canvas.addEventListener('lostpointercapture',event=>{if(pointers.has(event.pointerId))end(event);},true);
    canvas.addEventListener('wheel',event=>{stop(event);zoomBy(Math.exp(T.MathUtils.clamp(event.deltaY,-180,180)*.00155));},{capture:true,passive:false});
    canvas.addEventListener('dblclick',event=>{stop(event);const root=pickedRoot(event.clientX,event.clientY);root?focusRoot(root):goView('front');},true);
    return true;
  }

  function setupUi() {
    const menu=document.getElementById('camera-menu');if(!menu)return;
    const controls=menu.querySelector('.controls');
    if(controls)controls.innerHTML='<button class="view" data-camera="front" aria-pressed="true">正面</button><button class="view" data-camera="left" aria-pressed="false">左侧</button><button class="view" data-camera="right" aria-pressed="false">右侧</button><button class="view" data-camera="top" aria-pressed="false">俯视</button>';
    const tools=menu.querySelector('.right-tools');
    if(tools)tools.innerHTML='<button class="circle" id="zoom-in" type="button">＋</button><button class="circle" id="zoom-out" type="button">−</button><button class="circle" id="reset" type="button">⌂ 全景</button>';
    const panel=menu.querySelector('.camera-panel');
    const note=document.createElement('div');note.id='camera-v2-note';note.className='camera-v2-note';note.textContent='双击乐器聚焦 · 左拖旋转 · 右拖平移 · 滚轮缩放';panel?.appendChild(note);
    const style=document.createElement('style');style.textContent='.camera-panel{width:214px!important}.camera-v2-note{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:9px;line-height:1.5;color:#73878e}#camera-menu #reset{font-size:10px;white-space:nowrap}';document.head.appendChild(style);
    menu.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',event=>{stop(event);goView(button.dataset.camera);stage?.focus({preventScroll:true});},true));
    menu.querySelector('#zoom-in')?.addEventListener('click',event=>{stop(event);zoomBy(.82);},true);
    menu.querySelector('#zoom-out')?.addEventListener('click',event=>{stop(event);zoomBy(1/.82);},true);
    menu.querySelector('#reset')?.addEventListener('click',event=>{stop(event);goView('front');},true);
  }

  function refitSoon() { requestAnimationFrame(()=>requestAnimationFrame(()=>{if(ready)goView('front');})); }

  function attach(runtime) {
    renderer=runtime.renderer;scene=runtime.scene;camera=runtime.camera;
    collectRoots();
    legacyRender=renderer.render.bind(renderer);
    renderer.render=function(s,c){ if(c===camera)applyPose(); return legacyRender(s,c); };
    if(!setupCanvas())return false;
    setupUi();ready=true;
    goView('front',true);

    for(const id of ['bp-song','bp-mode','bp-instrument','pr-target'])document.getElementById(id)?.addEventListener('change',refitSoon);
    window.addEventListener('resize',()=>requestAnimationFrame(()=>{if(focusedRoot)focusRoot(focusedRoot,true);else if(VIEWS[activeView])goView(activeView,true);else renderNow();}));

    window.VirtualBandCamera={home:()=>goView('front'),view:id=>goView(id),focus:focusRoot,refit:refitSoon,get roots(){return [...roots]},get state(){return {view:activeView,focused:focusedRoot?.name||null,yaw:state.yaw,pitch:state.pitch,distance:state.distance,target:state.target.clone()}}};
    return true;
  }

  let tries=0;
  function waitForStage() {
    const runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
    if(runtime && stage?.querySelector('canvas')) { attach(runtime); return; }
    if(++tries<600) requestAnimationFrame(waitForStage);
    else console.warn('[Camera v2] stage camera was not captured; legacy camera remains active.');
  }
  waitForStage();
})();
