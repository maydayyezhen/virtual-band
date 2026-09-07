'use strict';

// NOCTURNE camera integration guard.
// The original venue treats normal dragging as a person turning their head: camera
// position stays fixed while yaw/pitch change. Reproduce that behavior on top of Camera
// v2, and keep every rendered perspective camera inside the authored venue bounds.
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
  const raycaster=new T.Raycaster(),ndc=new T.Vector2();
  let gesture=null;

  const active=()=>window.VirtualBandVenues?.current==='nocturne';
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function clampPosition(v){
    v.x=clamp(v.x,SAFE.minX,SAFE.maxX);
    v.y=clamp(v.y,SAFE.minY,SAFE.maxY);
    v.z=clamp(v.z,SAFE.minZ,SAFE.maxZ);
    return v;
  }
  function same(a,b){return a.distanceToSquared(b)<1e-10;}
  function direction(cam=runtime.camera){
    return cam.getWorldDirection(new T.Vector3()).normalize();
  }
  function pose(position,dir,fov=runtime.camera.fov){
    const p=clampPosition(position.clone());
    const d=dir.clone().normalize();
    const target=p.clone().addScaledVector(d,LOOK_DISTANCE);
    cameraApi.pose?.({position:p.toArray(),target:target.toArray(),fov:clamp(fov,28,100),durationMs:0},true);
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

  // A renderer-level safety net also catches automatic director PROGRAM cameras and any
  // future custom camera. Orthographic post-processing cameras are intentionally ignored.
  const priorRender=runtime.renderer.render.bind(runtime.renderer);
  runtime.renderer.render=function(scene,cam){
    if(active()&&cam?.isPerspectiveCamera){
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
    pointers.set(event.pointerId,{
      x:event.clientX,y:event.clientY,button:event.button,shift:event.shiftKey,
      type:event.pointerType,head,
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
      if(gesture){
        const head=currentHead(),dir=dirFrom(head.yaw,head.pitch);
        const right=new T.Vector3().crossVectors(dir,new T.Vector3(0,1,0)).normalize();
        const up=new T.Vector3(0,1,0);
        const move=right.multiplyScalar(-(cx-gesture.cx)*.024).add(up.multiplyScalar((cy-gesture.cy)*.024));
        const next=head.position.clone().add(move);
        const fov=clamp(head.fov+(gesture.dist-dist)*.10,28,100);
        pose(next,dir,fov);
      }
      gesture={cx,cy,dist};
      return;
    }

    const head=currentHead();
    if(p.button===2||p.shift){
      const dir=dirFrom(head.yaw,head.pitch);
      const right=new T.Vector3().crossVectors(dir,new T.Vector3(0,1,0)).normalize();
      const up=new T.Vector3(0,1,0);
      pose(head.position.clone().add(right.multiplyScalar(-dx*.024)).add(up.multiplyScalar(dy*.024)),dir,head.fov);
      return;
    }

    // Match the authored CameraRig semantics: the eye does not orbit a target. Dragging
    // only changes the viewing direction, like turning your head inside the venue.
    const yaw=head.yaw+dx*.0035;
    const pitch=clamp(head.pitch+dy*.0035,-Math.PI*.48,Math.PI*.48);
    pose(head.position,dirFrom(yaw,pitch),head.fov);
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
    const head=currentHead();
    // In panorama mode the original scene zooms by FOV, so the eye remains stationary.
    pose(head.position,dirFrom(head.yaw,head.pitch),clamp(head.fov+event.deltaY*.035,28,100));
  },{capture:true,passive:false});

  stage.addEventListener('dblclick',event=>{
    if(!active())return;
    stop(event);
    const root=rootFor(hitAt(event.clientX,event.clientY));
    if(root)cameraApi.focus?.(root);
  },true);

  window.addEventListener('virtual-band-venue-change',event=>{
    pointers.clear();gesture=null;stage.classList.remove('dragging');
    if(event.detail?.id==='nocturne'){
      // If a previous scene left the eye outside the room, normalize it immediately.
      const head=currentHead();pose(head.position,dirFrom(head.yaw,head.pitch),head.fov);
    }
  });

  window.NocturneCameraSafety={
    bounds:{...SAFE},
    clampPosition(v){return clampPosition(v);},
    get inside(){
      const p=runtime.camera.position;
      return p.x>=SAFE.minX&&p.x<=SAFE.maxX&&p.y>=SAFE.minY&&p.y<=SAFE.maxY&&p.z>=SAFE.minZ&&p.z<=SAFE.maxZ;
    },
  };
  console.info('[Venue camera] NOCTURNE head-look + in-room camera guard attached',SAFE);
})();