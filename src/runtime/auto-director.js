'use strict';

// Camera v3.1 · MIDI-aware live switcher.
// Auto mode behaves like a small multi-camera production: every shot has a stable
// virtual camera, the active camera may drift very slowly, and the director CUTs
// between them on musical boundaries. It reuses app.js' render loop.
(() => {
  const T = THREE;
  const songs = window.VIRTUAL_BAND_SONGS || {};
  const stage = document.getElementById('stage');
  const menu = document.getElementById('camera-menu');
  const songSelect = document.getElementById('bp-song');
  const modeSelect = document.getElementById('bp-mode');
  const playButton = document.getElementById('bp-play');
  const progress = document.getElementById('bp-progress');
  const timeLabel = document.getElementById('bp-time');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STORAGE_KEY = 'vb-director-enabled';
  const TICK_MS = 120;
  const MIN_HOLD_MS = 4300;
  const STRONG_HOLD_MS = 3000;
  const MANUAL_HOLD_MS = 8000;
  const STAGE_RETURN_MS = 15000;
  const STAGE_SEQUENCE = ['front', 'left', 'right', 'front', 'top', 'front'];
  const WEIGHT = {keyboard:1.05, drums:1.00, electric:1.12, acoustic:.92, bass:.78};

  const STAGE_VIEWS = {
    front:{yaw:.10,pitch:.13,fov:30,margin:1.08,distanceScale:1.08,bias:{x:.01,y:-.12,z:.08}},
    left:{yaw:-.62,pitch:.16,fov:31,margin:1.07,distanceScale:1.06,bias:{x:-.055,y:-.10,z:.035}},
    right:{yaw:.62,pitch:.16,fov:31,margin:1.07,distanceScale:1.06,bias:{x:.055,y:-.10,z:.035}},
    top:{yaw:.13,pitch:.62,fov:33,margin:1.08,distanceScale:1.08,bias:{x:0,y:-.045,z:.02}},
  };
  const FOCUS = {
    acoustic:{yaw:-.18,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.085,z:0}},
    electric:{yaw:.20,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.085,z:0}},
    bass:{yaw:.14,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.09,z:0}},
  };
  const DETAIL = {
    acoustic:{neck:{region:{y:[.38,1]},spec:{yaw:-.24,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}}},
    electric:{neck:{region:{y:[.38,1]},spec:{yaw:.25,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}}},
    bass:{neck:{region:{y:[.36,1]},spec:{yaw:.24,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}}},
  };
  const ANCHOR = {
    keyboard:{
      observeAll:{camera:[8.8,12.8,8.0],target:[0,9.00,-.25],fov:34},
      observeLower:{camera:[7.7,10.65,6.65],target:[0,7.92,-.02],fov:31},
      observeUpper:{camera:[-7.0,12.75,6.55],target:[0,10.28,-.72],fov:31},
    },
    drums:{
      observeAll:{camera:[4.9,4.75,5.75],target:[0,1.82,-.10],fov:35},
      observeLeft:{camera:[4.65,3.75,.55],target:[.10,1.82,-.30],fov:34},
      observeRight:{camera:[-4.65,3.75,.55],target:[-.10,1.82,-.30],fov:34},
    },
  };
  const MOTION = {
    stage:{
      front:{duration:10500,yaw:.018,zoom:-.024,truck:.010},
      left:{duration:11500,yaw:.024,zoom:-.012,truck:.006},
      right:{duration:11500,yaw:-.024,zoom:-.012,truck:-.006},
      top:null,
    },
    keyboard:{
      observeAll:{duration:9500,yaw:-.018,zoom:-.022,truck:.012},
      observeLower:null,
      observeUpper:null,
    },
    drums:{
      observeAll:{duration:9500,yaw:.022,zoom:-.018,truck:.006},
      observeLeft:null,
      observeRight:null,
    },
    acoustic:{
      overall:{duration:10000,yaw:.014,zoom:-.016,truck:.006},
      neck:null,
    },
    electric:{
      overall:{duration:10000,yaw:-.014,zoom:-.018,truck:-.006},
      neck:null,
    },
    bass:{
      overall:{duration:10500,yaw:.012,zoom:-.015,truck:.004},
      neck:null,
    },
  };

  let camera = null;
  let runtime = null;
  let renderBase = null;
  let programCamera = null;
  let rendererWrapped = false;
  let enabled = localStorage.getItem(STORAGE_KEY) !== '0';
  let renderProgram = false;
  let manualMode = false;
  let manualHoldUntil = 0;

  let cachedSong = null;
  let cachedSongKey = '';
  let timeline = [];
  let lastTickSongTime = 0;
  let lastCutAt = -Infinity;
  let lastStageAt = -Infinity;
  let currentTarget = 'stage';
  let currentShot = 'front';
  let stageIndex = 0;
  let cutCount = 0;
  let wasPlaying = false;
  let lastScores = [];
  let timer = 0;
  let attached = false;
  let initTries = 0;
  let programPose = null;
  let programPoseFactory = null;
  let programMotion = null;
  let programShotStartedAt = 0;
  const lastShown = new Map();

  function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
  function bpmFor(song){
    const match=String(song?.bpm??'').match(/[\d.]+/);
    const bpm=match?Number(match[0]):120;
    return Number.isFinite(bpm)&&bpm>20?bpm:120;
  }
  function currentSong(){return songs[songSelect?.value]||null;}
  function isPlaying(){return modeSelect?.value==='song'&&/停止/.test(playButton?.textContent||'');}
  function parseClock(text){
    const match=String(text||'').match(/(\d+):(\d{2})/);
    return match?Number(match[1])*60+Number(match[2]):NaN;
  }
  function songTime(song){
    const pct=parseFloat(progress?.style.width||'');
    if(Number.isFinite(pct)&&song?.duration>0)return clamp(song.duration*pct/100,0,song.duration);
    const fallback=parseClock(timeLabel?.textContent);
    return Number.isFinite(fallback)?fallback:0;
  }

  function descriptorForEvent(ev){
    const instrument=ev?.i;
    if(instrument==='lower'||instrument==='upper')return {id:'keyboard',type:'keyboard',index:0,sub:instrument,label:'键盘'};
    if(instrument==='drums')return {id:'drums',type:'drums',index:0,sub:'drums',label:'架子鼓'};
    if(instrument==='bass')return {id:'bass',type:'bass',index:0,sub:'bass',label:'Bass'};
    if(instrument==='guitar'){
      const index=Math.max(0,Number(ev.x)||0);
      return {id:`acoustic:${index}`,type:'acoustic',index,sub:'guitar',label:`木吉他 ${index+1}`};
    }
    if(instrument==='electric'){
      const index=Math.max(0,Number(ev.x)||0);
      return {id:`electric:${index}`,type:'electric',index,sub:'electric',label:`电吉他 ${index+1}`};
    }
    return null;
  }
  function rebuildTimeline(song){
    cachedSong=song;
    cachedSongKey=`${songSelect.value}:${song?.events?.length||0}:${song?.duration||0}`;
    const groups=new Map();
    for(const ev of song?.events||[]){
      const d=descriptorForEvent(ev);if(!d)continue;
      let group=groups.get(d.id);
      if(!group){group={...d,events:[]};groups.set(d.id,group);}
      const s=Number(ev.s??0),rawEnd=Number(ev.e??ev.ve??s+.08);
      const v=clamp(Number(ev.v??96),1,127)/127;
      group.events.push({s,e:Number.isFinite(rawEnd)?rawEnd:s+.08,v,sub:d.sub});
    }
    timeline=[...groups.values()];
    for(const group of timeline)group.events.sort((a,b)=>a.s-b.s);
    lastScores=[];
  }
  function ensureTimeline(song){
    const key=`${songSelect.value}:${song?.events?.length||0}:${song?.duration||0}`;
    if(song!==cachedSong||key!==cachedSongKey)rebuildTimeline(song);
  }
  function lowerBound(events,time){
    let lo=0,hi=events.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].s<time)lo=mid+1;else hi=mid;}
    return lo;
  }
  function scoreGroup(group,t,now){
    const events=group.events,start=t-1.25,end=t+.10;
    let i=lowerBound(events,start);
    let score=0,hits45=0,hits18=0,lower=0,upper=0,maxVelocity=0;
    for(;i<events.length&&events[i].s<=end;i++){
      const ev=events[i],age=t-ev.s;
      const decay=age>=0?Math.exp(-age/.52):.42;
      const contribution=(.32+ev.v*.92)*decay;
      score+=contribution;maxVelocity=Math.max(maxVelocity,ev.v);
      if(age>=0&&age<=.45)hits45++;
      if(age>=0&&age<=.18)hits18++;
      if(ev.s<=t&&ev.e>=t)score+=.24+ev.v*.22;
      if(ev.sub==='lower')lower+=contribution;
      else if(ev.sub==='upper')upper+=contribution;
    }
    score+=Math.min(1.6,hits45*.18);
    score*=WEIGHT[group.type]||1;
    const last=lastShown.get(group.id);
    if(last!=null)score*=1+Math.min(.28,Math.max(0,now-last)/40000*.28);
    if(group.id===currentTarget)score*=.86;
    const strong=group.type==='drums'
      ?hits45>=5||(hits45>=3&&maxVelocity>.9)
      :hits18>=4||(hits45>=4&&maxVelocity>.94);
    return {...group,score,strong,hits45,lower,upper};
  }

  function worldVisible(object){
    for(let o=object;o;o=o.parent)if(!o.visible)return false;
    return true;
  }
  function visibleRoots(){return (camera?.roots||[]).filter(root=>root.parent&&worldVisible(root));}
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
      const a=box.min[axis]+size[axis]*clamp(range[0],0,1);
      const b=box.min[axis]+size[axis]*clamp(range[1],0,1);
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
  function fitBox(box,spec,focused=false){
    const aspect=Math.max(.25,runtime?.camera?.aspect||1);
    const size=box.getSize(new T.Vector3()),target=composedTarget(box,spec);
    const cp=Math.cos(spec.pitch),sp=Math.sin(spec.pitch);
    const back=new T.Vector3(Math.sin(spec.yaw)*cp,sp,Math.cos(spec.yaw)*cp);
    const forward=back.clone().multiplyScalar(-1);
    const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).normalize();
    const up=new T.Vector3().crossVectors(right,forward).normalize();
    const vfov=T.MathUtils.degToRad(spec.fov);
    const hfov=2*Math.atan(Math.tan(vfov/2)*aspect);
    const tanV=Math.tan(vfov/2),tanH=Math.tan(hfov/2);
    let distance=.1;
    for(const point of corners(box)){
      const v=point.sub(target),depth=v.dot(forward);
      distance=Math.max(distance,
        Math.abs(v.dot(right))*(spec.margin||1.08)/tanH-depth,
        Math.abs(v.dot(up))*(spec.margin||1.08)/tanV-depth);
    }
    distance=Math.max(distance,Math.max(.1,size.length())*(focused?.48:.38),focused?1.4:8.5);
    return {target,yaw:spec.yaw,pitch:spec.pitch,distance:distance*(spec.distanceScale||1),fov:spec.fov};
  }
  function stagePose(view){
    const spec=STAGE_VIEWS[view]||STAGE_VIEWS.front;
    const box=boundsFor(visibleRoots());if(!box)return null;
    return fitBox(box,spec,false);
  }
  function rootFor(candidate){
    const roots=camera?.roots||[];
    if(candidate.type==='keyboard')return roots.find(r=>(r.name||'').includes('dual-tier'))||null;
    if(candidate.type==='drums')return roots.find(r=>(r.name||'').includes('Band Drums'))||null;
    if(candidate.type==='bass')return roots.find(r=>(r.name||'').includes('Fingered Bass'))||null;
    if(candidate.type==='acoustic')return roots.find(r=>new RegExp(`Wish Acoustic ${candidate.index+1}$`).test(r.name||''))||null;
    if(candidate.type==='electric')return roots.find(r=>new RegExp(`Electric ${candidate.index+1}$`).test(r.name||''))||null;
    return null;
  }
  function anchorPose(root,anchor){
    root.updateWorldMatrix(true,true);
    const cameraWorld=root.localToWorld(new T.Vector3(...anchor.camera));
    const targetWorld=root.localToWorld(new T.Vector3(...anchor.target));
    const back=cameraWorld.clone().sub(targetWorld);
    const distance=Math.max(.8,back.length());
    return {
      target:targetWorld,
      yaw:Math.atan2(back.x,back.z),
      pitch:Math.atan2(back.y,Math.max(1e-5,Math.hypot(back.x,back.z))),
      distance,
      fov:anchor.fov||34,
    };
  }
  function instrumentPose(candidate,shot){
    const root=rootFor(candidate);if(!root)return null;
    const anchors=ANCHOR[candidate.type];
    if(anchors?.[shot])return anchorPose(root,anchors[shot]);
    const whole=boundsFor([root]);if(!whole)return null;
    const detail=DETAIL[candidate.type]?.[shot];
    const box=detail?.region?regionBox(whole,detail.region):whole;
    const spec=detail?.spec||FOCUS[candidate.type];
    return spec?fitBox(box,spec,true):null;
  }

  function cameraStatePose(){
    const s=camera?.state;if(!s?.target)return null;
    return {
      target:s.target.clone?s.target.clone():new T.Vector3(s.target.x||0,s.target.y||0,s.target.z||0),
      yaw:Number(s.yaw)||0,pitch:Number(s.pitch)||.13,
      distance:Math.max(.8,Number(s.distance)||20),fov:clamp(Number(s.fov)||30,24,42),
    };
  }
  function applyPose(cam,base,motion,now){
    if(!cam||!base)return;
    let yaw=base.yaw,pitch=base.pitch,distance=base.distance;
    const target=base.target.clone();
    if(motion&&!reducedMotion){
      const duration=Math.max(1000,motion.duration||10000);
      const u=clamp((now-programShotStartedAt)/duration,0,1);
      const e=u*u*(3-2*u);
      yaw+=Number(motion.yaw||0)*e;
      pitch=clamp(pitch+Number(motion.pitch||0)*e,.06,1.18);
      distance=Math.max(.8,distance*(1+Number(motion.zoom||0)*e));
      if(motion.truck){
        const cp=Math.cos(yaw),sp=Math.sin(yaw);
        const right=new T.Vector3(cp,0,-sp).normalize();
        target.addScaledVector(right,base.distance*Number(motion.truck)*e);
      }
      target.y+=base.distance*Number(motion.rise||0)*e;
    }
    const cp=Math.cos(pitch);
    cam.fov=base.fov;cam.aspect=Math.max(.25,runtime.camera.aspect||1);
    cam.position.set(
      target.x+Math.sin(yaw)*cp*distance,
      Math.max(.18,target.y+Math.sin(pitch)*distance),
      target.z+Math.cos(yaw)*cp*distance
    );
    cam.lookAt(target);
    cam.near=Math.max(.04,distance*.0015);
    cam.far=Math.max(180,distance*5);
    cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
  }
  function shouldRenderProgram(){
    return renderProgram&&enabled&&modeSelect?.value==='song'&&isPlaying()&&programCamera;
  }
  function installRenderSwitcher(){
    if(rendererWrapped||!runtime?.renderer)return;
    renderBase=runtime.renderer.render.bind(runtime.renderer);
    programCamera=runtime.camera.clone();
    programCamera.name='Virtual Band · PROGRAM camera';
    runtime.renderer.render=function(scene,renderCamera){
      if(renderCamera===runtime.camera&&shouldRenderProgram()){
        const now=performance.now();
        if(manualMode){
          const manualPose=cameraStatePose();
          if(manualPose)applyPose(programCamera,manualPose,null,now);
        }else if(programPose){
          applyPose(programCamera,programPose,programMotion,now);
        }
        return renderBase(scene,programCamera);
      }
      return renderBase(scene,renderCamera);
    };
    rendererWrapped=true;
  }
  function motionFor(type,shot){
    const source=(MOTION[type]||{})[shot];
    if(!source||reducedMotion)return null;
    const direction=cutCount%2===0?1:-1;
    return {...source,yaw:Number(source.yaw||0)*direction,truck:Number(source.truck||0)*direction};
  }
  function setProgramShot(factory,motion,type,shot){
    const pose=factory?.();if(!pose)return false;
    programPoseFactory=factory;programPose=pose;programMotion=motion;
    programShotStartedAt=performance.now();manualMode=false;renderProgram=true;
    currentTarget=type;currentShot=shot;
    applyPose(programCamera,programPose,programMotion,programShotStartedAt);
    return true;
  }

  function keyboardShot(candidate){
    if(candidate.lower>candidate.upper*1.28)return'observeLower';
    if(candidate.upper>candidate.lower*1.28)return'observeUpper';
    return'observeAll';
  }
  function instrumentShot(candidate){
    if(candidate.type==='keyboard')return keyboardShot(candidate);
    if(candidate.type==='drums')return ['observeAll','observeLeft','observeRight'][cutCount%3];
    if(candidate.type==='electric')return cutCount%4===1?'neck':'overall';
    if(candidate.type==='acoustic')return cutCount%5===2?'neck':'overall';
    if(candidate.type==='bass')return cutCount%5===3?'neck':'overall';
    return'overall';
  }
  function shotLabel(id){
    return ({
      observeAll:'演奏总览',observeLower:'下层观察',observeUpper:'上层观察',
      observeLeft:'左侧观察',observeRight:'右侧观察',
      overall:'整体',neck:'指板'
    })[id]||id;
  }
  function stageLabel(view){
    return ({front:'正面',left:'左侧',right:'右侧',top:'高机位'})[view]||view;
  }
  function setStatus(text,active=false){
    const status=document.getElementById('camera-director-status');
    const toggle=document.getElementById('camera-director-toggle');
    if(status)status.textContent=text;
    if(toggle){
      toggle.setAttribute('aria-pressed',String(enabled));
      toggle.textContent=enabled?'开启':'关闭';
      toggle.classList.toggle('active',active&&enabled);
    }
  }
  function cutStage(view,reason='全景'){
    const safe=STAGE_VIEWS[view]?view:'front';
    if(!setProgramShot(()=>stagePose(safe),motionFor('stage',safe),'stage',safe))return false;
    const now=performance.now();
    lastCutAt=now;lastStageAt=now;cutCount++;
    setStatus(`${reason} · ${stageLabel(safe)} · CUT`,true);
    return true;
  }
  function cutCandidate(candidate,reason=''){
    const shot=instrumentShot(candidate);
    if(candidate.id===currentTarget&&shot===currentShot)return false;
    if(!setProgramShot(()=>instrumentPose(candidate,shot),motionFor(candidate.type,shot),candidate.id,shot))return false;
    const now=performance.now();
    lastCutAt=now;cutCount++;lastShown.set(candidate.id,now);
    setStatus(`${candidate.label} · ${shotLabel(shot)}${reason?` · ${reason}`:''} · CUT`,true);
    return true;
  }
  function nearBoundary(t,song,bars=false){
    const beat=60/bpmFor(song),span=bars?beat*4:beat;
    const phase=((t%span)+span)%span;
    return Math.min(phase,span-phase)<=Math.min(bars?.20:.14,span*.24);
  }
  function resetRun(forceStage=false){
    lastTickSongTime=0;lastCutAt=-Infinity;lastStageAt=-Infinity;
    currentTarget='stage';currentShot='front';stageIndex=0;cutCount=0;lastShown.clear();
    manualMode=false;manualHoldUntil=0;
    if(forceStage&&enabled&&modeSelect?.value==='song')cutStage('front','开场');
  }
  function manualOverride(){
    if(!enabled||!isPlaying())return;
    manualMode=true;manualHoldUntil=performance.now()+MANUAL_HOLD_MS;renderProgram=true;
    setStatus('手动接管 8s');
  }

  function chooseAndCut(song,t,now){
    const scores=timeline.map(group=>scoreGroup(group,t,now))
      .filter(item=>item.score>.24).sort((a,b)=>b.score-a.score);
    lastScores=scores.map(({id,label,type,score,strong})=>({id,label,type,score,strong}));
    const top=scores[0],activeCount=scores.filter(item=>item.score>.72).length;
    const sinceCut=now-lastCutAt,sinceStage=now-lastStageAt;

    if(manualMode){
      if(now<manualHoldUntil)return;
      if(!nearBoundary(t,song,false))return;
      if(top)cutCandidate(top,'自动接管');
      else cutStage('front','自动接管');
      return;
    }
    if(t<1.35)return;

    if(sinceStage>STAGE_RETURN_MS&&sinceCut>=MIN_HOLD_MS&&nearBoundary(t,song,true)){
      stageIndex=(stageIndex+1)%STAGE_SEQUENCE.length;
      cutStage(STAGE_SEQUENCE[stageIndex],activeCount>=4?'合奏':'回全景');
      return;
    }
    if(!top){
      if(currentTarget!=='stage'&&sinceCut>=MIN_HOLD_MS&&nearBoundary(t,song,true)){
        stageIndex=(stageIndex+1)%STAGE_SEQUENCE.length;
        cutStage(STAGE_SEQUENCE[stageIndex],'间奏');
      }
      return;
    }
    if(top.strong&&sinceCut>=STRONG_HOLD_MS&&nearBoundary(t,song,false)){
      cutCandidate(top,top.type==='drums'?'Fill':'强调');
      return;
    }
    if(sinceCut<MIN_HOLD_MS||!nearBoundary(t,song,false))return;
    if(activeCount>=5&&sinceStage>8500&&nearBoundary(t,song,true)){
      stageIndex=(stageIndex+1)%STAGE_SEQUENCE.length;
      cutStage(STAGE_SEQUENCE[stageIndex],'合奏');
      return;
    }

    const current=scores.find(item=>item.id===currentTarget);
    const currentScore=current?.score||0;
    const dominance=top.score/Math.max(.25,currentScore);
    if(currentTarget==='stage'||top.id!==currentTarget||dominance>1.24||sinceCut>7000)cutCandidate(top);
  }

  function tick(){
    const now=performance.now(),song=currentSong(),playing=!!song&&isPlaying();
    renderProgram=enabled&&playing;

    if(!enabled){setStatus('关闭');wasPlaying=playing;return;}
    if(modeSelect?.value!=='song'){setStatus('仅欣赏模式');wasPlaying=playing;renderProgram=false;return;}
    if(!song){setStatus('无曲目');wasPlaying=false;renderProgram=false;return;}

    ensureTimeline(song);
    const t=songTime(song);
    if(playing&&!wasPlaying)resetRun(true);
    if(playing&&t+.45<lastTickSongTime)resetRun(false);
    wasPlaying=playing;lastTickSongTime=t;

    if(!playing){setStatus('等待播放');renderProgram=false;return;}
    if(manualMode&&now<manualHoldUntil){
      setStatus(`手动接管 ${Math.max(1,Math.ceil((manualHoldUntil-now)/1000))}s`);
      return;
    }
    chooseAndCut(song,t,now);
  }

  function setupUi(){
    const panel=menu?.querySelector('.camera-panel');if(!panel)return;
    panel.querySelector('.camera-director-section')?.remove();
    const section=document.createElement('div');section.className='camera-director-section';
    section.innerHTML=
      '<div class="camera-director-copy"><strong>自动导播</strong><small id="camera-director-status">等待播放</small></div>'+
      '<button id="camera-director-toggle" type="button" aria-pressed="false">开启</button>';
    const prefs=panel.querySelector('.camera-pref-section');
    panel.insertBefore(section,prefs||panel.querySelector('#camera-v2-note')||null);

    document.getElementById('camera-director-style')?.remove();
    const style=document.createElement('style');style.id='camera-director-style';
    style.textContent=
      '.camera-director-section{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}'+
      '.camera-director-copy{display:grid;gap:2px;min-width:0}.camera-director-copy strong{font-size:10px;font-weight:600;color:#dce7e5}.camera-director-copy small{font-size:8px;color:#71858d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}'+
      '#camera-director-toggle{height:28px;min-width:48px;border:1px solid var(--line);border-radius:7px;background:#ffffff05;color:#8fa1a5;font-size:9px;cursor:pointer}'+
      '#camera-director-toggle[aria-pressed="true"]{color:#d8e8e4;border-color:#78958e;background:#8fb6aa17}'+
      '#camera-director-toggle.active{background:#8fb6aa25}';
    document.head.appendChild(style);

    section.querySelector('#camera-director-toggle')?.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      enabled=!enabled;localStorage.setItem(STORAGE_KEY,enabled?'1':'0');
      manualMode=false;manualHoldUntil=0;
      if(enabled){resetRun(false);setStatus(isPlaying()?'准备接管':'等待播放');}
      else{renderProgram=false;setStatus('关闭');}
    });
  }
  function installManualOverrideHooks(){
    stage?.addEventListener('pointerdown',manualOverride,{capture:true,passive:true});
    stage?.addEventListener('wheel',manualOverride,{capture:true,passive:true});
    menu?.addEventListener('click',event=>{
      if(event.target.closest('#camera-director-toggle'))return;
      if(event.target.closest('[data-camera],[data-focus-view],#zoom-in,#zoom-out,#reset,#camera-focus-back'))manualOverride();
    },true);
  }
  function resolveTarget(target){
    if(target?.isObject3D)return target;
    const text=String(target||'').toLowerCase(),roots=camera?.roots||[];
    if(text==='keyboard'||text.includes('键盘'))return roots.find(r=>(r.name||'').includes('dual-tier'))||null;
    if(text==='drums'||text.includes('鼓'))return roots.find(r=>(r.name||'').includes('Band Drums'))||null;
    if(text==='bass')return roots.find(r=>(r.name||'').includes('Fingered Bass'))||null;
    const acoustic=text.match(/(?:acoustic|木吉他)\s*(\d+)?/);
    if(acoustic){
      const index=Math.max(1,Number(acoustic[1])||1);
      return roots.find(r=>new RegExp(`Wish Acoustic ${index}$`).test(r.name||''))||null;
    }
    const electric=text.match(/(?:electric|电吉他)\s*(\d+)?/);
    if(electric){
      const index=Math.max(1,Number(electric[1])||1);
      return roots.find(r=>new RegExp(`Electric ${index}$`).test(r.name||''))||null;
    }
    return roots.find(r=>(r.name||'').toLowerCase().includes(text))||null;
  }
  function candidateForRoot(root){
    const name=root?.name||'';
    if(name.includes('dual-tier'))return{id:'keyboard',type:'keyboard',index:0,label:'键盘',lower:1,upper:1};
    if(name.includes('Band Drums'))return{id:'drums',type:'drums',index:0,label:'架子鼓'};
    if(name.includes('Fingered Bass'))return{id:'bass',type:'bass',index:0,label:'Bass'};
    let m=/Wish Acoustic (\d+)$/.exec(name);
    if(m)return{id:`acoustic:${Number(m[1])-1}`,type:'acoustic',index:Number(m[1])-1,label:`木吉他 ${m[1]}`};
    m=/Electric (\d+)$/.exec(name);
    if(m)return{id:`electric:${Number(m[1])-1}`,type:'electric',index:Number(m[1])-1,label:`电吉他 ${m[1]}`};
    return null;
  }

  function attachDirector(){
    if(attached)return true;
    camera=window.VirtualBandCamera;
    runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
    if(!camera||!runtime?.renderer||!runtime?.camera||!stage||!menu||!songSelect||!modeSelect||!playButton||!progress)return false;

    installRenderSwitcher();setupUi();installManualOverrideHooks();
    setStatus(enabled?'等待播放':'关闭');
    timer=window.setInterval(tick,TICK_MS);
    window.addEventListener('resize',()=>{
      if(programPoseFactory&&!manualMode){
        const pose=programPoseFactory();if(pose)programPose=pose;
      }
    },{passive:true});

    window.VirtualBandDirector={
      enable(){enabled=true;localStorage.setItem(STORAGE_KEY,'1');manualMode=false;manualHoldUntil=0;resetRun(false);setStatus(isPlaying()?'准备接管':'等待播放');},
      disable(){enabled=false;localStorage.setItem(STORAGE_KEY,'0');renderProgram=false;manualMode=false;setStatus('关闭');},
      toggle(){enabled?this.disable():this.enable();return enabled;},
      setStyle(style){return style==='live-switcher'||style==='balanced';},
      cutToStageView(view='front'){return cutStage(STAGE_VIEWS[view]?view:'front','导播指令');},
      cutToInstrument(target,view='overall'){
        const root=resolveTarget(target);if(!root)return false;
        const candidate=candidateForRoot(root);if(!candidate)return false;
        const shot=view==='overall'&&candidate.type==='keyboard'?'observeAll':
          view==='overall'&&candidate.type==='drums'?'observeAll':view;
        if(!setProgramShot(()=>instrumentPose(candidate,shot),motionFor(candidate.type,shot),candidate.id,shot))return false;
        lastCutAt=performance.now();cutCount++;setStatus(`${candidate.label} · ${shotLabel(shot)} · CUT`,true);return true;
      },
      hold(ms=MANUAL_HOLD_MS){manualMode=true;manualHoldUntil=performance.now()+Math.max(0,Number(ms)||0);renderProgram=true;},
      destroy(){
        if(timer)window.clearInterval(timer);timer=0;
        if(rendererWrapped&&runtime?.renderer&&renderBase)runtime.renderer.render=renderBase;
        rendererWrapped=false;attached=false;renderProgram=false;
      },
      get state(){
        return {
          enabled,style:'live-switcher',playing:isPlaying(),program:renderProgram&&!manualMode,
          currentTarget,currentShot,manualHoldMs:Math.max(0,manualHoldUntil-performance.now()),
          motion:programMotion?{...programMotion}:null,scores:lastScores.map(item=>({...item})),
        };
      },
    };

    attached=true;
    console.info('[Director v3.1] live switcher attached · static/slow virtual cameras · beat CUTs');
    return true;
  }
  function waitForDirectorRuntime(){
    if(attachDirector())return;
    if(++initTries<600)requestAnimationFrame(waitForDirectorRuntime);
    else console.warn('[Director v3.1] camera/runtime/player unavailable after waiting; auto director disabled.');
  }
  waitForDirectorRuntime();
})();
