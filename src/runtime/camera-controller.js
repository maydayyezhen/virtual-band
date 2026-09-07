'use strict';

// Camera v2 · phase 2.3
// Stage composition, instrument detail views, performance-observation shots and playback-aware transitions.
(() => {
  const T = THREE;
  const stage = document.getElementById('stage');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VIEWS = {
    front:{yaw:.10,pitch:.13,fov:30,margin:1.08,distanceScale:1.08,bias:{x:.01,y:-.12,z:.08}},
    left:{yaw:-.62,pitch:.16,fov:31,margin:1.07,distanceScale:1.06,bias:{x:-.055,y:-.10,z:.035}},
    right:{yaw:.62,pitch:.16,fov:31,margin:1.07,distanceScale:1.06,bias:{x:.055,y:-.10,z:.035}},
    top:{yaw:.13,pitch:.62,fov:33,margin:1.08,distanceScale:1.08,bias:{x:0,y:-.045,z:.02}},
  };

  const FOCUS = {
    keyboard:{yaw:-.43,pitch:.14,fov:30,margin:1.18,distanceScale:1.08,bias:{x:0,y:-.07,z:0}},
    drums:{yaw:.38,pitch:.17,fov:29,margin:1.18,distanceScale:1.05,bias:{x:0,y:-.055,z:0}},
    acoustic:{yaw:-.18,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.085,z:0}},
    electric:{yaw:.20,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.085,z:0}},
    bass:{yaw:.14,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.09,z:0}},
  };

  // Box3 views present the model. Anchor views below are observer cameras deliberately
  // offset from the performer position so the moving keys/drum surfaces stay readable.
  // Anchors live in root-local coordinates and therefore follow stage rotation/scale/moves.
  const INSTRUMENT_VIEWS = {
    keyboard:[
      {id:'overall',label:'整体',group:'display',spec:FOCUS.keyboard},
      {id:'lower',label:'88 键',group:'display',region:{y:[.34,.68]},spec:{yaw:-.35,pitch:.11,fov:27,margin:1.13,distanceScale:1.03,bias:{x:0,y:-.025,z:0}}},
      {id:'upper',label:'61 键',group:'display',region:{y:[.60,.96]},spec:{yaw:-.31,pitch:.15,fov:27,margin:1.13,distanceScale:1.04,bias:{x:0,y:-.02,z:0}}},
      {id:'panel',label:'控制面板',group:'display',region:{y:[.54,.94],x:[.08,.92]},spec:{yaw:-.46,pitch:.28,fov:25,margin:1.12,distanceScale:1.01,bias:{x:0,y:-.03,z:0}}},
      {id:'pedals',label:'踏板',group:'display',region:{y:[0,.27],x:[.28,.72]},spec:{yaw:-.20,pitch:.22,fov:26,margin:1.15,distanceScale:1.04,bias:{x:0,y:.02,z:0}}},
      {id:'observeAll',label:'演奏总览',group:'perform',anchor:{camera:[8.8,12.8,8.0],target:[0,9.00,-.25],fov:34}},
      {id:'observeLower',label:'下层观察',group:'perform',anchor:{camera:[7.7,10.65,6.65],target:[0,7.92,-.02],fov:31}},
      {id:'observeUpper',label:'上层观察',group:'perform',anchor:{camera:[-7.0,12.75,6.55],target:[0,10.28,-.72],fov:31}},
    ],
    drums:[
      {id:'overall',label:'整体',group:'display',spec:FOCUS.drums},
      {id:'front',label:'正面',group:'display',spec:{yaw:.03,pitch:.14,fov:29,margin:1.16,distanceScale:1.05,bias:{x:0,y:-.06,z:0}}},
      {id:'left34',label:'左前 3/4',group:'display',spec:{yaw:-.52,pitch:.17,fov:29,margin:1.16,distanceScale:1.04,bias:{x:-.02,y:-.05,z:0}}},
      {id:'right34',label:'右前 3/4',group:'display',spec:{yaw:.54,pitch:.17,fov:29,margin:1.16,distanceScale:1.04,bias:{x:.02,y:-.05,z:0}}},
      {id:'top',label:'高机位',group:'display',spec:{yaw:.14,pitch:.72,fov:31,margin:1.13,distanceScale:1.04,bias:{x:0,y:-.02,z:0}}},
      {id:'observeAll',label:'演奏总览',group:'perform',anchor:{camera:[4.9,4.75,5.75],target:[0,1.82,-.10],fov:35}},
      {id:'observeLeft',label:'左侧观察',group:'perform',anchor:{camera:[4.65,3.75,.55],target:[.10,1.82,-.30],fov:34}},
      {id:'observeRight',label:'右侧观察',group:'perform',anchor:{camera:[-4.65,3.75,.55],target:[-.10,1.82,-.30],fov:34}},
    ],
    acoustic:[
      {id:'overall',label:'整体',group:'display',spec:FOCUS.acoustic},
      {id:'body',label:'琴身',group:'display',region:{y:[0,.52]},spec:{yaw:-.16,pitch:.10,fov:26,margin:1.15,distanceScale:1.02,bias:{x:0,y:-.04,z:0}}},
      {id:'neck',label:'指板',group:'display',region:{y:[.38,1]},spec:{yaw:-.24,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}},
      {id:'side',label:'侧面',group:'display',spec:{yaw:-1.02,pitch:.14,fov:28,margin:1.16,distanceScale:1.08,bias:{x:0,y:-.075,z:0}}},
    ],
    electric:[
      {id:'overall',label:'整体',group:'display',spec:FOCUS.electric},
      {id:'body',label:'琴身',group:'display',region:{y:[0,.52]},spec:{yaw:.18,pitch:.10,fov:26,margin:1.15,distanceScale:1.02,bias:{x:0,y:-.04,z:0}}},
      {id:'neck',label:'指板',group:'display',region:{y:[.38,1]},spec:{yaw:.25,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}},
      {id:'side',label:'侧面',group:'display',spec:{yaw:1.02,pitch:.14,fov:28,margin:1.16,distanceScale:1.08,bias:{x:0,y:-.075,z:0}}},
    ],
    bass:[
      {id:'overall',label:'整体',group:'display',spec:FOCUS.bass},
      {id:'body',label:'琴身',group:'display',region:{y:[0,.50]},spec:{yaw:.16,pitch:.10,fov:26,margin:1.15,distanceScale:1.02,bias:{x:0,y:-.04,z:0}}},
      {id:'neck',label:'指板',group:'display',region:{y:[.36,1]},spec:{yaw:.24,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}},
      {id:'side',label:'侧面',group:'display',spec:{yaw:.96,pitch:.14,fov:28,margin:1.16,distanceScale:1.08,bias:{x:0,y:-.075,z:0}}},
    ],
  };

  const SENSITIVITY={low:.72,medium:1,high:1.36};
  const TRANSITION_MS={stage:700,focus:600,local:450};
  const cameraPrefs={
    vertical:localStorage.getItem('vb-camera-vertical')==='inverted'?'inverted':'standard',
    sensitivity:['low','medium','high'].includes(localStorage.getItem('vb-camera-sensitivity'))
      ?localStorage.getItem('vb-camera-sensitivity'):'medium',
  };

  let renderer=null,scene=null,camera=null,canvas=null,legacyRender=null,ready=false;
  let activeView='front',focusedRoot=null,focusedView='overall',baseDistance=24;
  let transition=null,transitionRaf=0,lastExternalRender=-Infinity;
  let focusUiType='';
  const state={target:new T.Vector3(0,4,0),yaw:0,pitch:.13,distance:30,fov:30};
  const want={target:state.target.clone(),yaw:0,pitch:.13,distance:30,fov:30};
  const roots=[];

  function isBandRoot(object){
    const n=object?.name||'';
    return n==='Atelier — dual-tier stage rig'||/^Wish Acoustic \d+$/.test(n)||
      n==='Wish Fingered Bass'||/Electric \d+$/.test(n)||n==='Atelier Session 04 · Band Drums';
  }
  function rootLabel(root){
    const n=root?.name||'';
    if(n.includes('dual-tier'))return '双层键盘';
    if(n.includes('Fingered Bass'))return 'Bass';
    if(n.includes('Band Drums'))return '架子鼓';
    const a=/Wish Acoustic (\d+)$/.exec(n);if(a)return `木吉他 ${a[1]}`;
    const e=/Electric (\d+)$/.exec(n);if(e)return `电吉他 ${e[1]}`;
    return n||'乐器';
  }
  function focusType(root){
    const label=rootLabel(root);
    if(label==='双层键盘')return 'keyboard';
    if(label==='架子鼓')return 'drums';
    if(label==='Bass')return 'bass';
    if(label.startsWith('木吉他'))return 'acoustic';
    if(label.startsWith('电吉他'))return 'electric';
    return 'acoustic';
  }
  function collectRoots(){
    roots.length=0;
    for(const child of scene?.children||[])if(isBandRoot(child))roots.push(child);
  }
  function worldVisible(object){
    for(let o=object;o;o=o.parent)if(!o.visible)return false;
    return true;
  }
  function visibleRoots(){return roots.filter(root=>root.parent&&worldVisible(root));}
  function boundsFor(objects){
    const box=new T.Box3().makeEmpty();
    for(const object of objects){
      object.updateWorldMatrix(true,true);
      box.expandByObject(object,true);
    }
    return box.isEmpty()?null:box;
  }
  function regionBox(box,region){
    if(!region)return box.clone();
    const out=box.clone(),size=box.getSize(new T.Vector3());
    for(const axis of ['x','y','z']){
      const range=region[axis];if(!range)continue;
      const a=box.min[axis]+size[axis]*T.MathUtils.clamp(range[0],0,1);
      const b=box.min[axis]+size[axis]*T.MathUtils.clamp(range[1],0,1);
      out.min[axis]=Math.min(a,b);out.max[axis]=Math.max(a,b);
    }
    return out;
  }
  function corners(box){
    const {min,max}=box;
    return [
      new T.Vector3(min.x,min.y,min.z),new T.Vector3(max.x,min.y,min.z),
      new T.Vector3(min.x,max.y,min.z),new T.Vector3(max.x,max.y,min.z),
      new T.Vector3(min.x,min.y,max.z),new T.Vector3(max.x,min.y,max.z),
      new T.Vector3(min.x,max.y,max.z),new T.Vector3(max.x,max.y,max.z),
    ];
  }
  function composedTarget(box,spec){
    const size=box.getSize(new T.Vector3()),target=box.getCenter(new T.Vector3()),b=spec?.bias||{};
    target.x+=size.x*(b.x||0);target.y+=size.y*(b.y||0);target.z+=size.z*(b.z||0);
    return target;
  }
  function fitBox(box,yaw,pitch,fov,margin=1.08,targetOverride=null,focused=false){
    if(!camera)return null;
    const size=box.getSize(new T.Vector3());
    const target=targetOverride?targetOverride.clone():box.getCenter(new T.Vector3());
    const cp=Math.cos(pitch),sp=Math.sin(pitch);
    const back=new T.Vector3(Math.sin(yaw)*cp,sp,Math.cos(yaw)*cp);
    const forward=back.clone().multiplyScalar(-1);
    const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).normalize();
    const up=new T.Vector3().crossVectors(right,forward).normalize();
    const vfov=T.MathUtils.degToRad(fov);
    const hfov=2*Math.atan(Math.tan(vfov/2)*Math.max(.25,camera.aspect||1));
    const tanV=Math.tan(vfov/2),tanH=Math.tan(hfov/2);
    let distance=.1;
    for(const point of corners(box)){
      const v=point.sub(target),depth=v.dot(forward);
      distance=Math.max(distance,
        Math.abs(v.dot(right))*margin/tanH-depth,
        Math.abs(v.dot(up))*margin/tanV-depth);
    }
    distance=Math.max(distance,Math.max(.1,size.length())*(focused?.48:.38),focused?1.4:8.5);
    return {target,distance};
  }
  function shortestYaw(from,to){return from+Math.atan2(Math.sin(to-from),Math.cos(to-from));}

  function applyPose(){
    if(!camera)return;
    const cp=Math.cos(state.pitch);camera.fov=state.fov;
    camera.position.set(
      state.target.x+Math.sin(state.yaw)*cp*state.distance,
      Math.max(.18,state.target.y+Math.sin(state.pitch)*state.distance),
      state.target.z+Math.cos(state.yaw)*cp*state.distance
    );
    camera.lookAt(state.target);
    camera.near=Math.max(.04,state.distance*.0015);
    camera.far=Math.max(180,state.distance*5);
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }

  const easeInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const easeFov=t=>1-Math.pow(1-t,3);
  function syncWant(){
    want.target.copy(state.target);want.yaw=state.yaw;want.pitch=state.pitch;
    want.distance=state.distance;want.fov=state.fov;
  }
  function cancelTransition(){
    transition=null;
    if(transitionRaf){cancelAnimationFrame(transitionRaf);transitionRaf=0;}
    syncWant();
  }
  function sampleTransition(now){
    if(!transition)return false;
    const raw=T.MathUtils.clamp((now-transition.start)/transition.duration,0,1);
    const t=easeInOut(raw),tf=easeFov(raw),from=transition.from,to=transition.to;
    state.target.lerpVectors(from.target,to.target,t);
    state.yaw=T.MathUtils.lerp(from.yaw,to.yaw,t);
    state.pitch=T.MathUtils.lerp(from.pitch,to.pitch,t);
    state.distance=T.MathUtils.lerp(from.distance,to.distance,t);
    state.fov=T.MathUtils.lerp(from.fov,to.fov,tf);
    if(raw>=1){
      state.target.copy(to.target);state.yaw=to.yaw;state.pitch=to.pitch;
      state.distance=to.distance;state.fov=to.fov;transition=null;syncWant();
    }
    return true;
  }
  function fallbackRender(now=performance.now()){
    if(!ready||!legacyRender)return;
    applyPose();
    if(now-lastExternalRender>48)legacyRender(scene,camera);
  }
  function transitionPump(now){
    transitionRaf=0;if(!transition)return;
    sampleTransition(now);fallbackRender(now);
    if(transition)transitionRaf=requestAnimationFrame(transitionPump);
  }
  function setDesired(target,yaw,pitch,distance,fov=30,instant=false,duration=TRANSITION_MS.focus){
    want.target.copy(target);
    want.yaw=shortestYaw(state.yaw,yaw);
    want.pitch=T.MathUtils.clamp(pitch,.08,1.12);
    want.distance=Math.max(.8,distance);
    want.fov=T.MathUtils.clamp(fov,24,42);
    if(instant||reducedMotion){
      cancelTransition();
      state.target.copy(want.target);state.yaw=want.yaw;state.pitch=want.pitch;
      state.distance=want.distance;state.fov=want.fov;fallbackRender();return;
    }
    if(transitionRaf){cancelAnimationFrame(transitionRaf);transitionRaf=0;}
    transition={
      start:performance.now(),duration,
      from:{target:state.target.clone(),yaw:state.yaw,pitch:state.pitch,distance:state.distance,fov:state.fov},
      to:{target:want.target.clone(),yaw:want.yaw,pitch:want.pitch,distance:want.distance,fov:want.fov},
    };
    transitionRaf=requestAnimationFrame(transitionPump);
  }

  function currentInstrumentViews(){
    return focusedRoot?(INSTRUMENT_VIEWS[focusType(focusedRoot)]||INSTRUMENT_VIEWS.acoustic):[];
  }
  function makeFocusButton(item){
    const button=document.createElement('button');
    button.className='view camera-subview';button.type='button';
    button.dataset.focusView=item.id;button.textContent=item.label;
    button.addEventListener('click',event=>{
      stop(event);focusView(focusedRoot,item.id);stage?.focus({preventScroll:true});
    },true);
    return button;
  }
  function renderFocusUi(){
    const menu=document.getElementById('camera-menu');
    const section=menu?.querySelector('.camera-focus-section');
    const title=menu?.querySelector('#camera-focus-title');
    const views=menu?.querySelector('#camera-focus-views');
    if(!menu||!section||!views)return;
    const focused=!!focusedRoot;
    menu.classList.toggle('instrument-focus',focused);section.hidden=!focused;
    if(!focused){focusUiType='';views.innerHTML='';return;}
    if(title)title.textContent=rootLabel(focusedRoot);
    const type=focusType(focusedRoot);
    if(focusUiType===type)return;
    focusUiType=type;views.innerHTML='';
    const list=currentInstrumentViews();
    const groups=[
      {id:'display',label:'展示',items:list.filter(item=>(item.group||'display')==='display')},
      {id:'perform',label:'演奏观察',items:list.filter(item=>item.group==='perform')},
    ].filter(group=>group.items.length);
    for(const group of groups){
      const block=document.createElement('div');block.className='camera-view-group';
      if(groups.length>1){
        const label=document.createElement('div');label.className='camera-view-group-label';label.textContent=group.label;block.appendChild(label);
      }
      const grid=document.createElement('div');grid.className='camera-subviews-grid';
      for(const item of group.items)grid.appendChild(makeFocusButton(item));
      block.appendChild(grid);views.appendChild(block);
    }
  }
  function updateUi(){
    renderFocusUi();
    document.querySelectorAll('#camera-menu [data-camera]').forEach(button=>
      button.setAttribute('aria-pressed',String(button.dataset.camera===activeView&&!focusedRoot)));
    document.querySelectorAll('#camera-menu [data-focus-view]').forEach(button=>
      button.setAttribute('aria-pressed',String(button.dataset.focusView===focusedView)));
    const note=document.getElementById('camera-v2-note');
    if(note)note.textContent=focusedRoot
      ?`${rootLabel(focusedRoot)} · 展示 / 演奏观察机位 · 双击空地返回乐队`
      :'摄影机位 · 双击乐器聚焦 · 左拖旋转 · 右拖平移';
  }

  function goView(id='front',instant=false){
    collectRoots();
    const box=boundsFor(visibleRoots());if(!box)return false;
    const spec=VIEWS[id]||VIEWS.front,target=composedTarget(box,spec);
    const fit=fitBox(box,spec.yaw,spec.pitch,spec.fov,spec.margin,target,false);if(!fit)return false;
    const distance=fit.distance*(spec.distanceScale||1);
    focusedRoot=null;focusedView='overall';activeView=id;baseDistance=distance;focusUiType='';
    setDesired(fit.target,spec.yaw,spec.pitch,distance,spec.fov,instant,TRANSITION_MS.stage);
    updateUi();return true;
  }

  function anchorPose(root,anchor){
    root.updateWorldMatrix(true,true);
    const cameraLocal=new T.Vector3(...anchor.camera);
    const targetLocal=new T.Vector3(...anchor.target);
    const cameraWorld=root.localToWorld(cameraLocal);
    const targetWorld=root.localToWorld(targetLocal);
    const back=cameraWorld.clone().sub(targetWorld);
    const distance=Math.max(.8,back.length());
    const horizontal=Math.max(1e-5,Math.hypot(back.x,back.z));
    return {
      target:targetWorld,
      yaw:Math.atan2(back.x,back.z),
      pitch:Math.atan2(back.y,horizontal),
      distance,
      fov:anchor.fov||36,
    };
  }
  function focusAnchorView(root,view,instant=false,sameRoot=false){
    const pose=anchorPose(root,view.anchor);if(!pose)return false;
    focusedRoot=root;focusedView=view.id;activeView='focus';baseDistance=pose.distance;
    setDesired(pose.target,pose.yaw,pose.pitch,pose.distance,pose.fov,instant,
      sameRoot?TRANSITION_MS.local:TRANSITION_MS.focus);
    updateUi();return true;
  }
  function focusView(root,viewId='overall',instant=false){
    if(!root||!worldVisible(root))return false;
    const type=focusType(root);
    const list=INSTRUMENT_VIEWS[type]||INSTRUMENT_VIEWS.acoustic;
    const view=list.find(item=>item.id===viewId)||list[0];
    const sameRoot=focusedRoot===root;
    if(view.anchor)return focusAnchorView(root,view,instant,sameRoot);
    const whole=boundsFor([root]);if(!whole)return false;
    const box=regionBox(whole,view.region),spec=view.spec||FOCUS[type]||FOCUS.acoustic;
    const target=composedTarget(box,spec);
    const fit=fitBox(box,spec.yaw,spec.pitch,spec.fov,spec.margin,target,true);if(!fit)return false;
    const distance=fit.distance*(spec.distanceScale||1);
    focusedRoot=root;focusedView=view.id;activeView='focus';baseDistance=distance;
    setDesired(fit.target,spec.yaw,spec.pitch,distance,spec.fov,instant,
      sameRoot?TRANSITION_MS.local:TRANSITION_MS.focus);
    updateUi();return true;
  }
  function focusRoot(root,instant=false){return focusView(root,'overall',instant);}
  function zoomLimits(){
    return focusedRoot
      ?[Math.max(.75,baseDistance*.34),Math.max(7,baseDistance*2.7)]
      :[Math.max(5,baseDistance*.58),Math.max(20,baseDistance*2.35)];
  }
  function renderManual(){fallbackRender(performance.now());}
  function zoomBy(factor){
    cancelTransition();
    const [min,max]=zoomLimits();
    state.distance=want.distance=T.MathUtils.clamp(state.distance*factor,min,max);
    activeView=focusedRoot?'focus':'custom';updateUi();renderManual();
  }
  function orbit(dx,dy){
    cancelTransition();
    const sensitivity=SENSITIVITY[cameraPrefs.sensitivity]||1;
    const verticalSign=cameraPrefs.vertical==='inverted'?-1:1;
    state.yaw=want.yaw=state.yaw-dx*.0056*sensitivity;
    state.pitch=want.pitch=T.MathUtils.clamp(state.pitch-dy*.0042*sensitivity*verticalSign,.08,1.12);
    if(focusedRoot)focusedView='custom';
    activeView=focusedRoot?'focus':'custom';updateUi();renderManual();
  }
  function pan(dx,dy){
    if(!camera||!canvas)return;
    cancelTransition();
    const sensitivity=SENSITIVITY[cameraPrefs.sensitivity]||1;
    dx*=sensitivity;dy*=sensitivity;
    const worldPerPixel=state.distance*2*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,canvas.clientHeight);
    applyPose();
    const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();
    const up=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();
    state.target.addScaledVector(right,-dx*worldPerPixel).addScaledVector(up,dy*worldPerPixel);
    want.target.copy(state.target);
    if(focusedRoot)focusedView='custom';
    activeView=focusedRoot?'focus':'custom';updateUi();renderManual();
  }

  const raycaster=new T.Raycaster(),ndc=new T.Vector2();
  function hitsAt(x,y){
    const rect=canvas.getBoundingClientRect();
    ndc.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(ndc,camera);
    return raycaster.intersectObjects(visibleRoots(),true);
  }
  function bandRootFor(object){for(let o=object;o;o=o.parent)if(roots.includes(o))return o;return null;}
  function pickedRoot(x,y){for(const hit of hitsAt(x,y)){const root=bandRootFor(hit.object);if(root)return root;}return null;}
  function playableHit(x,y){
    const hit=hitsAt(x,y)[0]?.object;
    for(let o=hit;o;o=o.parent){
      if(o.userData?.key||o.userData?.pedal)return true;
      if(roots.includes(o))break;
    }
    return false;
  }
  function stop(event){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  }

  function setupCanvas(){
    canvas=stage?.querySelector('canvas');if(!canvas)return false;
    const pointers=new Map();let gesture=null,moved=false,lastTouchTap={time:0,x:0,y:0};
    canvas.addEventListener('contextmenu',stop,true);
    canvas.addEventListener('pointerdown',event=>{
      if(event.button===0&&!event.shiftKey&&playableHit(event.clientX,event.clientY))return;
      stop(event);moved=false;
      pointers.set(event.pointerId,{
        x:event.clientX,y:event.clientY,sx:event.clientX,sy:event.clientY,
        type:event.pointerType,button:event.button,shift:event.shiftKey,
      });
      try{canvas.setPointerCapture(event.pointerId)}catch{}
      canvas.classList.add('dragging');if(pointers.size>=2)gesture=null;
    },true);
    canvas.addEventListener('pointermove',event=>{
      const p=pointers.get(event.pointerId);if(!p)return;
      stop(event);
      const dx=event.clientX-p.x,dy=event.clientY-p.y;
      p.x=event.clientX;p.y=event.clientY;
      if(Math.hypot(event.clientX-p.sx,event.clientY-p.sy)>4)moved=true;
      if(pointers.size>=2){
        const two=[...pointers.values()].slice(0,2);
        const cx=(two[0].x+two[1].x)/2,cy=(two[0].y+two[1].y)/2;
        const dist=Math.hypot(two[0].x-two[1].x,two[0].y-two[1].y);
        if(gesture){
          pan(cx-gesture.cx,cy-gesture.cy);
          if(dist>4&&gesture.dist>4)zoomBy(gesture.dist/dist);
        }
        gesture={cx,cy,dist};
      }else if(p.button===2||p.shift)pan(dx,dy);
      else orbit(dx,dy);
    },true);
    const end=event=>{
      const p=pointers.get(event.pointerId);if(!p)return;
      stop(event);pointers.delete(event.pointerId);
      if(pointers.size<2)gesture=null;
      if(!pointers.size)canvas.classList.remove('dragging');
      if(p.type==='touch'&&!moved){
        const now=performance.now();
        const near=Math.hypot(event.clientX-lastTouchTap.x,event.clientY-lastTouchTap.y)<28;
        if(now-lastTouchTap.time<330&&near){
          const root=pickedRoot(event.clientX,event.clientY);
          root?focusRoot(root):goView('front');lastTouchTap.time=0;
        }else lastTouchTap={time:now,x:event.clientX,y:event.clientY};
      }
    };
    canvas.addEventListener('pointerup',end,true);
    canvas.addEventListener('pointercancel',end,true);
    canvas.addEventListener('lostpointercapture',event=>{if(pointers.has(event.pointerId))end(event);},true);
    canvas.addEventListener('wheel',event=>{
      stop(event);zoomBy(Math.exp(T.MathUtils.clamp(event.deltaY,-180,180)*.00155));
    },{capture:true,passive:false});
    canvas.addEventListener('dblclick',event=>{
      stop(event);const root=pickedRoot(event.clientX,event.clientY);
      root?focusRoot(root):goView('front');
    },true);
    return true;
  }

  function savePrefs(){
    localStorage.setItem('vb-camera-vertical',cameraPrefs.vertical);
    localStorage.setItem('vb-camera-sensitivity',cameraPrefs.sensitivity);
  }
  function setupUi(){
    const menu=document.getElementById('camera-menu');if(!menu)return;
    const controls=menu.querySelector('.controls');
    if(controls)controls.innerHTML=
      '<button class="view" data-camera="front" aria-pressed="true">正面</button>'+
      '<button class="view" data-camera="left" aria-pressed="false">左侧</button>'+
      '<button class="view" data-camera="right" aria-pressed="false">右侧</button>'+
      '<button class="view" data-camera="top" aria-pressed="false">高机位</button>';
    const tools=menu.querySelector('.right-tools');
    if(tools)tools.innerHTML=
      '<button class="circle" id="zoom-in" type="button">＋</button>'+
      '<button class="circle" id="zoom-out" type="button">−</button>'+
      '<button class="circle" id="reset" type="button">⌂ 全景</button>';
    const panel=menu.querySelector('.camera-panel');

    panel?.querySelector('.camera-focus-section')?.remove();
    const focusSection=document.createElement('div');
    focusSection.className='camera-focus-section';focusSection.hidden=true;
    focusSection.innerHTML=
      '<div class="camera-focus-head"><strong id="camera-focus-title">乐器</strong>'+
      '<button id="camera-focus-back" type="button">← 乐队</button></div>'+
      '<div class="camera-subviews" id="camera-focus-views"></div>';
    panel?.insertBefore(focusSection,tools||null);

    panel?.querySelector('.camera-pref-section')?.remove();
    const prefs=document.createElement('div');prefs.className='camera-pref-section';
    prefs.innerHTML=
      '<label>上下拖动<select id="camera-vertical-mode">'+
      '<option value="standard">标准</option><option value="inverted">反向</option></select></label>'+
      '<label>镜头灵敏度<select id="camera-sensitivity">'+
      '<option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>';
    panel?.appendChild(prefs);

    panel?.querySelector('#camera-v2-note')?.remove();
    const note=document.createElement('div');note.id='camera-v2-note';note.className='camera-v2-note';
    note.textContent='摄影机位 · 双击乐器聚焦 · 左拖旋转 · 右拖平移';panel?.appendChild(note);

    document.getElementById('camera-v2-style')?.remove();
    const style=document.createElement('style');style.id='camera-v2-style';
    style.textContent=
      '.camera-panel{width:258px!important}'+
      '.camera-focus-section{margin-bottom:8px}.camera-focus-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}'+
      '.camera-focus-head strong{font-size:11px;font-weight:600;color:#e7eeeb}.camera-focus-head button{border:0;background:transparent;color:#879ba2;font-size:9px;cursor:pointer}'+
      '.camera-view-group+.camera-view-group{margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}'+
      '.camera-view-group-label{margin:0 0 5px;font-size:8px;letter-spacing:.12em;color:#71858d}'+
      '.camera-subviews-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.camera-subviews-grid .view{height:32px}'+
      '.instrument-focus .controls{display:none}.camera-pref-section{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}'+
      '.camera-pref-section label{display:grid;gap:4px;font-size:8px;color:#73878e}.camera-pref-section select{width:100%;height:29px;border:1px solid var(--line);border-radius:7px;background:#ffffff05;color:#b8c5c6;padding:0 6px;font-size:9px}'+
      '.camera-v2-note{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:9px;line-height:1.5;color:#73878e}'+
      '#camera-menu #reset{font-size:10px;white-space:nowrap}';
    document.head.appendChild(style);

    menu.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',event=>{
      stop(event);goView(button.dataset.camera);stage?.focus({preventScroll:true});
    },true));
    menu.querySelector('#zoom-in')?.addEventListener('click',event=>{stop(event);zoomBy(.82);},true);
    menu.querySelector('#zoom-out')?.addEventListener('click',event=>{stop(event);zoomBy(1/.82);},true);
    menu.querySelector('#reset')?.addEventListener('click',event=>{stop(event);goView('front');},true);
    menu.querySelector('#camera-focus-back')?.addEventListener('click',event=>{stop(event);goView('front');},true);

    const vertical=menu.querySelector('#camera-vertical-mode');
    const sensitivity=menu.querySelector('#camera-sensitivity');
    if(vertical){
      vertical.value=cameraPrefs.vertical;
      vertical.addEventListener('change',()=>{
        cameraPrefs.vertical=vertical.value==='inverted'?'inverted':'standard';savePrefs();
      });
    }
    if(sensitivity){
      sensitivity.value=cameraPrefs.sensitivity;
      sensitivity.addEventListener('change',()=>{
        cameraPrefs.sensitivity=SENSITIVITY[sensitivity.value]?sensitivity.value:'medium';savePrefs();
      });
    }
  }

  function refitSoon(){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(ready)goView('front');}));
  }
  function attach(runtime){
    renderer=runtime.renderer;scene=runtime.scene;camera=runtime.camera;
    collectRoots();legacyRender=renderer.render.bind(renderer);
    renderer.render=function(s,c){
      if(c===camera){
        const now=performance.now();lastExternalRender=now;sampleTransition(now);applyPose();
      }
      return legacyRender(s,c);
    };
    if(!setupCanvas())return false;
    setupUi();ready=true;goView('front',true);

    for(const id of ['bp-song','bp-mode','bp-instrument','pr-target'])
      document.getElementById(id)?.addEventListener('change',refitSoon);
    window.addEventListener('resize',()=>requestAnimationFrame(()=>{
      if(focusedRoot&&focusedView!=='custom')focusView(focusedRoot,focusedView,true);
      else if(!focusedRoot&&VIEWS[activeView])goView(activeView,true);
      else fallbackRender();
    }));

    window.VirtualBandCamera={
      home:()=>goView('front'),
      view:id=>goView(id),
      focus:focusRoot,
      focusView:(root,id)=>focusView(root,id),
      refit:refitSoon,
      setVerticalMode:value=>{
        cameraPrefs.vertical=value==='inverted'?'inverted':'standard';savePrefs();updateUi();
      },
      setSensitivity:value=>{
        cameraPrefs.sensitivity=SENSITIVITY[value]?value:'medium';savePrefs();updateUi();
      },
      get roots(){return [...roots]},
      get state(){
        return {
          view:activeView,focused:focusedRoot?.name||null,focusedView,
          yaw:state.yaw,pitch:state.pitch,distance:state.distance,fov:state.fov,
          target:state.target.clone(),preferences:{...cameraPrefs},transitioning:!!transition,
        };
      },
    };
    console.info('[Camera v2] phase 2.3 performance observation views attached');
    return true;
  }

  let tries=0;
  function waitForStage(){
    const runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
    if(runtime&&stage?.querySelector('canvas')){attach(runtime);return;}
    if(++tries<600)requestAnimationFrame(waitForStage);
    else console.warn('[Camera v2] stage camera was not captured; legacy camera remains active.');
  }
  waitForStage();
})();
