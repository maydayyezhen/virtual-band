'use strict';

// NOCTURNE camera integration guard.
// The original venue treats normal dragging as a person turning their head: camera
// position stays fixed while yaw/pitch change. Reproduce that behavior on top of Camera
// v2, add first-person WASD/QE movement, and keep every rendered perspective camera
// inside the authored venue bounds.
(() => {
  const T=THREE;
  const stage=document.getElementById('stage');
  const runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
  const cameraApi=window.VirtualBandCamera;
  if(!stage||!runtime?.renderer||!runtime?.camera||!cameraApi)return;

  // Original CameraRig movement clamp was x ±28.4, z -14..57, y 1.7..20.5.
  // Use a small inward margin so near-plane clipping never places the eye on a wall.
  const SAFE={minX:-28.0,maxX:28.0,minY:1.85,maxY:20.25,minZ:-13.6,maxZ:56.6};
  const LOOK_DISTANCE=20;
  const pointers=new Map();
  const keys=new Set();
  const raycaster=new T.Raycaster(),ndc=new T.Vector2();
  let gesture=null,desiredHead=null,lastDesiredAt=-Infinity,lastMoveFrame=performance.now();

  const active=()=>window.VirtualBandVenues?.current==='nocturne';
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function clampPosition(v){
    v.x=clamp(v.x,SAFE.minX,SAFE.maxX);
    v.y=clamp(v.y,SAFE.minY,SAFE.maxY);
    v.z=clamp(v.z,SAFE.minZ,SAFE.maxZ);
    return v;
  }
  function same(a,b){return a.distanceToSquared(b)<1e-10;}

  // Camera v2 computes its physical camera from target/yaw/pitch/distance immediately
  // before drawing. Clamp the actual position vector at that write boundary, so even a
  // generated fit/transition cannot put the real eye outside the room for one frame.
  const hostPosition=runtime.camera.position;
  const nativeSet=hostPosition.set.bind(hostPosition);
  const nativeCopy=hostPosition.copy.bind(hostPosition);
  const copyScratch=new T.Vector3();
  hostPosition.set=function(x,y,z){
    if(active()){
      x=clamp(x,SAFE.minX,SAFE.maxX);
      y=clamp(y,SAFE.minY,SAFE.maxY);
      z=clamp(z,SAFE.minZ,SAFE.maxZ);
    }
    return nativeSet(x,y,z);
  };
  hostPosition.copy=function(v){
    if(!active())return nativeCopy(v);
    copyScratch.set(v.x,v.y,v.z);clampPosition(copyScratch);return nativeCopy(copyScratch);
  };

  function direction(cam=runtime.camera){
    return cam.getWorldDirection(new T.Vector3()).normalize();
  }
  function syncNote(){
    const note=document.getElementById('camera-v2-note');
    if(note&&active()&&!cameraApi.state?.focused)
      note.textContent='NOCTURNE · 左拖环顾 · WASD 移动 · Q/E 升降 · Shift 加速 · 滚轮视野';
  }
  function cloneHead(head){
    return {
      position:head.position.clone(),yaw:head.yaw,pitch:head.pitch,fov:head.fov,
    };
  }
  function currentHead(){
    runtime.camera.updateMatrixWorld(true);
    const p=clampPosition(runtime.camera.position.clone()),d=direction();
    return {
      position:p,
      yaw:Math.atan2(d.x,d.z),
      pitch:Math.asin(clamp(d.y,-1,1)),
      fov:runtime.camera.fov,
    };
  }
  function dirFrom(yaw,pitch){
    return new T.Vector3(
      Math.sin(yaw)*Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw)*Math.cos(pitch),
    ).normalize();
  }
  function poseHead(head){
    head.position=clampPosition(head.position.clone());
    head.pitch=clamp(head.pitch,-Math.PI*.48,Math.PI*.48);
    head.fov=clamp(head.fov,28,100);
    const dir=dirFrom(head.yaw,head.pitch);
    const target=head.position.clone().addScaledVector(dir,LOOK_DISTANCE);

    // Camera v2 has an older instant-pose path that cancels its requested target before
    // applying it. Use a 1 ms transition instead: visually immediate, but it travels
    // through the normal state/update path and therefore cannot be discarded.
    cameraApi.pose?.({
      position:head.position.toArray(),
      target:target.toArray(),
      fov:head.fov,
      durationMs:1,
    },false);
    desiredHead=cloneHead(head);lastDesiredAt=performance.now();syncNote();
  }
  function recentHead(maxAge=120){
    return desiredHead&&performance.now()-lastDesiredAt<maxAge
      ?cloneHead(desiredHead)
      :currentHead();
  }

  // A renderer-level safety net catches automatic director PROGRAM cameras and future
  // custom perspective cameras. Orthographic post-processing cameras are ignored.
  const priorRender=runtime.renderer.render.bind(runtime.renderer);
  runtime.renderer.render=function(scene,cam){
    if(active()&&cam?.isPerspectiveCamera&&cam!==runtime.camera){
      const before=cam.position.clone();
      clampPosition(cam.position);
      if(!same(before,cam.position))cam.updateMatrixWorld(true);
    }
    return priorRender(scene,cam);
  };

  function rootFor(object){
    const roots=cameraApi.roots||[];
    for(let o=object;o;o=o.parent)if(roots.includes(o))return o;
    return null;
  }
  function hitAt(x,y){
    const canvas=stage.querySelector('canvas');if(!canvas)return null;
    const rect=canvas.getBoundingClientRect();
    ndc.set((x-rect.left)/Math.max(1,rect.width)*2-1,-(y-rect.top)/Math.max(1,rect.height)*2+1);
    raycaster.setFromCamera(ndc,runtime.camera);
    return raycaster.intersectObjects(cameraApi.roots||[],true)[0]?.object||null;
  }
  function isPlayable(x,y){
    const roots=cameraApi.roots||[];
    let o=hitAt(x,y);
    while(o){
      if(o.userData?.key||o.userData?.pedal)return true;
      if(roots.includes(o))break;
      o=o.parent;
    }
    return false;
  }
  function stop(event){event.preventDefault();event.stopPropagation();}

  // Capture on the stage ancestor runs before Camera v2's canvas capture handlers. This
  // lets venue mode use head-look without changing Camera v2 behavior in the "无" scene.
  stage.addEventListener('pointerdown',event=>{
    if(!active())return;
    if(event.button===0&&!event.shiftKey&&isPlayable(event.clientX,event.clientY))return;
    stop(event);
    const head=currentHead();
    desiredHead=cloneHead(head);lastDesiredAt=performance.now();
    pointers.set(event.pointerId,{
      x:event.clientX,y:event.clientY,button:event.button,shift:event.shiftKey,
      type:event.pointerType,head:cloneHead(head),
    });
    try{event.target?.setPointerCapture?.(event.pointerId)}catch{}
    stage.classList.add('dragging');
    if(pointers.size>=2)gesture=null;
  },true);

  stage.addEventListener('pointermove',event=>{
    if(!active())return;
    const p=pointers.get(event.pointerId);if(!p)return;
    stop(event);
    const dx=event.clientX-p.x,dy=event.clientY-p.y;
    p.x=event.clientX;p.y=event.clientY;

    if(pointers.size>=2){
      const two=[...pointers.values()].slice(0,2);
      const cx=(two[0].x+two[1].x)/2,cy=(two[0].y+two[1].y)/2;
      const dist=Math.hypot(two[0].x-two[1].x,two[0].y-two[1].y);
      if(!gesture){
        gesture={cx,cy,dist,head:recentHead(1000)};
        return;
      }
      const head=gesture.head;
      const dir=dirFrom(head.yaw,head.pitch);
      const right=new T.Vector3().crossVectors(dir,new T.Vector3(0,1,0)).normalize();
      const up=new T.Vector3(0,1,0);
      head.position.add(right.multiplyScalar(-(cx-gesture.cx)*.024)).add(up.multiplyScalar((cy-gesture.cy)*.024));
      head.fov=clamp(head.fov+(gesture.dist-dist)*.10,28,100);
      poseHead(head);
      gesture.cx=cx;gesture.cy=cy;gesture.dist=dist;
      return;
    }

    const head=p.head;
    if(p.button===2||p.shift){
      const dir=dirFrom(head.yaw,head.pitch);
      const right=new T.Vector3().crossVectors(dir,new T.Vector3(0,1,0)).normalize();
      const up=new T.Vector3(0,1,0);
      head.position.add(right.multiplyScalar(-dx*.024)).add(up.multiplyScalar(dy*.024));
      poseHead(head);
      return;
    }

    // Match the authored CameraRig semantics: the eye does not orbit a target. Dragging
    // only changes the viewing direction, like turning your head inside the venue.
    head.yaw+=dx*.0035;
    head.pitch=clamp(head.pitch+dy*.0035,-Math.PI*.48,Math.PI*.48);
    poseHead(head);
  },true);

  function end(event){
    if(!active()||!pointers.has(event.pointerId))return;
    stop(event);pointers.delete(event.pointerId);
    if(pointers.size<2)gesture=null;
    if(!pointers.size)stage.classList.remove('dragging');
  }
  stage.addEventListener('pointerup',end,true);
  stage.addEventListener('pointercancel',end,true);
  stage.addEventListener('lostpointercapture',end,true);

  stage.addEventListener('wheel',event=>{
    if(!active())return;
    stop(event);
    const head=recentHead();
    // In panorama mode the original scene zooms by FOV, so the eye remains stationary.
    head.fov=clamp(head.fov+event.deltaY*.035,28,100);
    poseHead(head);
  },{capture:true,passive:false});

  stage.addEventListener('dblclick',event=>{
    if(!active())return;
    stop(event);
    const root=rootFor(hitAt(event.clientX,event.clientY));
    if(root)cameraApi.focus?.(root);
  },true);

  // First-person free-fly navigation, matching the authored CameraRig: W/S forward/back,
  // A/D strafe, Q/E vertical, Shift for fast movement. Movement is relative to yaw rather
  // than pitch so looking up/down does not make W fly vertically.
  const NAV_CODES=new Set([
    'KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE',
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight',
  ]);
  const editingTarget=target=>/INPUT|SELECT|TEXTAREA|BUTTON/.test(target?.tagName||'');
  window.addEventListener('keydown',event=>{
    if(!active()||editingTarget(event.target)||!NAV_CODES.has(event.code))return;
    keys.add(event.code);
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  },true);
  window.addEventListener('keyup',event=>{
    if(!NAV_CODES.has(event.code))return;
    keys.delete(event.code);
    if(active()){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
    }
  },true);
  window.addEventListener('blur',()=>keys.clear());

  function moveCamera(now){
    requestAnimationFrame(moveCamera);
    const dt=Math.min(.05,Math.max(0,(now-lastMoveFrame)/1000));
    lastMoveFrame=now;
    if(!active()||!keys.size||dt<=0)return;

    const head=recentHead(250);
    const forward=new T.Vector3(Math.sin(head.yaw),0,Math.cos(head.yaw));
    const right=new T.Vector3(-Math.cos(head.yaw),0,Math.sin(head.yaw));
    const move=new T.Vector3();
    if(keys.has('KeyW')||keys.has('ArrowUp'))move.add(forward);
    if(keys.has('KeyS')||keys.has('ArrowDown'))move.sub(forward);
    if(keys.has('KeyD')||keys.has('ArrowRight'))move.add(right);
    if(keys.has('KeyA')||keys.has('ArrowLeft'))move.sub(right);
    if(keys.has('KeyE'))move.y+=1;
    if(keys.has('KeyQ'))move.y-=1;
    if(move.lengthSq()<=0)return;

    const fast=keys.has('ShiftLeft')||keys.has('ShiftRight');
    move.normalize().multiplyScalar((fast?15:6)*dt);
    head.position.add(move);
    poseHead(head);
  }
  requestAnimationFrame(moveCamera);

  window.addEventListener('virtual-band-venue-change',event=>{
    pointers.clear();keys.clear();gesture=null;desiredHead=null;lastDesiredAt=-Infinity;
    stage.classList.remove('dragging');
    if(event.detail?.id==='nocturne'){
      // If a previous scene left the eye outside the room, normalize it immediately.
      poseHead(currentHead());
    }
    syncNote();
  });

  window.NocturneCameraSafety={
    bounds:{...SAFE},
    clampPosition(v){return clampPosition(v);},
    get inside(){
      const p=runtime.camera.position;
      return p.x>=SAFE.minX&&p.x<=SAFE.maxX&&p.y>=SAFE.minY&&p.y<=SAFE.maxY&&p.z>=SAFE.minZ&&p.z<=SAFE.maxZ;
    },
  };
  syncNote();
  console.info('[Venue camera] NOCTURNE head-look + WASD free-fly + in-room guard attached',SAFE);
})();