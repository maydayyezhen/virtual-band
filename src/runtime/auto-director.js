'use strict';

// Camera v3.2 · hybrid live director: cross-subject CUTs + same-subject MOVE + local camera motion.
(() => {
  const T=THREE,$=id=>document.getElementById(id),songs=window.VIRTUAL_BAND_SONGS||{};
  const stage=$('stage'),menu=$('camera-menu'),songSelect=$('bp-song'),modeSelect=$('bp-mode'),playButton=$('bp-play'),progress=$('bp-progress'),timeLabel=$('bp-time');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STORE='vb-director-enabled',TICK=120,HOLD=4400,STRONG=3000,LOCAL=6500,MANUAL=8000,RETURN=15000;
  const STAGE_SEQ=['front','left','right','front','top','front'],WEIGHT={keyboard:1.05,drums:1,electric:1.12,acoustic:.92,bass:.78};
  const STAGE={
    front:{yaw:.10,pitch:.13,fov:30,margin:1.08,distanceScale:1.08,bias:{x:.01,y:-.12,z:.08}},
    left:{yaw:-.62,pitch:.16,fov:31,margin:1.07,distanceScale:1.06,bias:{x:-.055,y:-.10,z:.035}},
    right:{yaw:.62,pitch:.16,fov:31,margin:1.07,distanceScale:1.06,bias:{x:.055,y:-.10,z:.035}},
    top:{yaw:.13,pitch:.62,fov:33,margin:1.08,distanceScale:1.08,bias:{x:0,y:-.045,z:.02}},
  };
  const FOCUS={
    acoustic:{yaw:-.18,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.085,z:0}},
    electric:{yaw:.20,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.085,z:0}},
    bass:{yaw:.14,pitch:.13,fov:28,margin:1.20,distanceScale:1.06,bias:{x:0,y:-.09,z:0}},
  };
  const DETAIL={
    acoustic:{neck:{region:{y:[.38,1]},spec:{yaw:-.24,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}}},
    electric:{neck:{region:{y:[.38,1]},spec:{yaw:.25,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}}},
    bass:{neck:{region:{y:[.36,1]},spec:{yaw:.24,pitch:.11,fov:25,margin:1.14,distanceScale:1.02,bias:{x:0,y:-.02,z:0}}}},
  };
  const ANCHOR={
    keyboard:{
      observeAll:{camera:[8.8,12.8,8],target:[0,9,-.25],fov:34},
      observeLower:{camera:[7.7,10.65,6.65],target:[0,7.92,-.02],fov:31},
      observeUpper:{camera:[-7,12.75,6.55],target:[0,10.28,-.72],fov:31},
    },
    drums:{
      observeAll:{camera:[4.9,4.75,5.75],target:[0,1.82,-.10],fov:35},
      observeLeft:{camera:[4.65,3.75,.55],target:[.10,1.82,-.30],fov:34},
      observeRight:{camera:[-4.65,3.75,.55],target:[-.10,1.82,-.30],fov:34},
    },
  };
  const M={
    stage:{front:[.026,-.030,.012,.058,-.050,.026],left:[.030,-.022,.014,.065,-.038,.034],right:[-.030,-.022,-.014,-.065,-.038,-.034],top:[0,-.028,.008,0,0,0]},
    keyboard:{observeAll:[-.030,-.030,.016,-.070,-.055,.036],observeLower:[0,-.026,.012,.045,-.045,.026],observeUpper:[0,-.026,-.012,-.045,-.045,-.026]},
    drums:{observeAll:[.032,-.026,.012,.078,-.042,.028],observeLeft:[.024,-.022,.012,.052,-.035,.024],observeRight:[-.024,-.022,-.012,-.052,-.035,-.024]},
    acoustic:{overall:[.022,-.024,.012,.055,-.045,.028],neck:[0,-.020,.008,0,0,0]},
    electric:{overall:[-.022,-.026,-.012,-.055,-.048,-.028],neck:[0,-.020,-.008,0,0,0]},
    bass:{overall:[.020,-.022,.010,.050,-.040,.024],neck:[0,-.018,.006,0,0,0]},
  };

  let camera,runtime,baseRender,programCamera,wrapped=false,enabled=localStorage.getItem(STORE)!=='0',renderProgram=false,manual=false,manualUntil=0;
  let cachedSong=null,cachedKey='',timeline=[],lastSongTime=0,lastCut=-Infinity,lastStage=-Infinity,target='stage',type='stage',shot='front',stageIndex=0,cuts=0,moves=0,wasPlaying=false,lastScores=[],timer=0,attached=false,tries=0;
  let pose=null,poseFactory=null,motion=null,motionStyle='static',shotStart=0,transition=null;
  const lastShown=new Map();

  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)},ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const bpm=s=>{const m=String(s?.bpm??'').match(/[\d.]+/),v=m?+m[0]:120;return Number.isFinite(v)&&v>20?v:120};
  const currentSong=()=>songs[songSelect?.value]||null,isPlaying=()=>modeSelect?.value==='song'&&/停止/.test(playButton?.textContent||'');
  function songTime(s){const p=parseFloat(progress?.style.width||'');if(Number.isFinite(p)&&s?.duration>0)return clamp(s.duration*p/100,0,s.duration);const m=String(timeLabel?.textContent||'').match(/(\d+):(\d{2})/);return m?+m[1]*60 + +m[2]:0}
  function desc(e){
    if(e?.i==='lower'||e?.i==='upper')return{id:'keyboard',type:'keyboard',index:0,sub:e.i,label:'键盘'};
    if(e?.i==='drums')return{id:'drums',type:'drums',index:0,sub:'drums',label:'架子鼓'};
    if(e?.i==='bass')return{id:'bass',type:'bass',index:0,sub:'bass',label:'Bass'};
    if(e?.i==='guitar'){const i=Math.max(0,+e.x||0);return{id:`acoustic:${i}`,type:'acoustic',index:i,sub:'guitar',label:`木吉他 ${i+1}`}}
    if(e?.i==='electric'){const i=Math.max(0,+e.x||0);return{id:`electric:${i}`,type:'electric',index:i,sub:'electric',label:`电吉他 ${i+1}`}}
    return null;
  }
  function rebuild(s){
    cachedSong=s;cachedKey=`${songSelect.value}:${s?.events?.length||0}:${s?.duration||0}`;const groups=new Map();
    for(const e of s?.events||[]){const d=desc(e);if(!d)continue;let g=groups.get(d.id);if(!g){g={...d,events:[]};groups.set(d.id,g)}const st=+e.s||0,en=+(e.e??e.ve??st+.08),v=clamp(+(e.v??96),1,127)/127;g.events.push({s:st,e:Number.isFinite(en)?en:st+.08,v,sub:d.sub})}
    timeline=[...groups.values()];for(const g of timeline)g.events.sort((a,b)=>a.s-b.s);lastScores=[];
  }
  function lowerBound(a,t){let l=0,h=a.length;while(l<h){const m=(l+h)>>1;if(a[m].s<t)l=m+1;else h=m}return l}
  function score(g,t,now){
    let i=lowerBound(g.events,t-1.25),s=0,h45=0,h18=0,lo=0,up=0,maxv=0;
    for(;i<g.events.length&&g.events[i].s<=t+.10;i++){const e=g.events[i],age=t-e.s,d=age>=0?Math.exp(-age/.52):.42,c=(.32+e.v*.92)*d;s+=c;maxv=Math.max(maxv,e.v);if(age>=0&&age<=.45)h45++;if(age>=0&&age<=.18)h18++;if(e.s<=t&&e.e>=t)s+=.24+e.v*.22;if(e.sub==='lower')lo+=c;else if(e.sub==='upper')up+=c}
    s+=Math.min(1.6,h45*.18);s*=WEIGHT[g.type]||1;const last=lastShown.get(g.id);if(last!=null)s*=1+Math.min(.28,Math.max(0,now-last)/40000*.28);if(g.id===target)s*=.88;
    const strong=g.type==='drums'?h45>=5||(h45>=3&&maxv>.9):h18>=4||(h45>=4&&maxv>.94);return{...g,score:s,strong,hits45:h45,lower:lo,upper:up};
  }
  function ensure(s){const k=`${songSelect.value}:${s?.events?.length||0}:${s?.duration||0}`;if(s!==cachedSong||k!==cachedKey)rebuild(s)}

  function visible(o){for(let x=o;x;x=x.parent)if(!x.visible)return false;return true}
  const roots=()=>camera?.roots||[],visibleRoots=()=>roots().filter(r=>r.parent&&visible(r));
  function bounds(list){const b=new T.Box3().makeEmpty();for(const o of list){o.updateWorldMatrix(true,true);b.expandByObject(o,true)}return b.isEmpty()?null:b}
  function region(b,r){if(!r)return b.clone();const o=b.clone(),s=b.getSize(new T.Vector3());for(const a of['x','y','z'])if(r[a]){const x=b.min[a]+s[a]*clamp(r[a][0],0,1),y=b.min[a]+s[a]*clamp(r[a][1],0,1);o.min[a]=Math.min(x,y);o.max[a]=Math.max(x,y)}return o}
  function corners(b){const{min,max}=b;return[new T.Vector3(min.x,min.y,min.z),new T.Vector3(max.x,min.y,min.z),new T.Vector3(min.x,max.y,min.z),new T.Vector3(max.x,max.y,min.z),new T.Vector3(min.x,min.y,max.z),new T.Vector3(max.x,min.y,max.z),new T.Vector3(min.x,max.y,max.z),new T.Vector3(max.x,max.y,max.z)]}
  function fit(b,spec,focused=false){
    const size=b.getSize(new T.Vector3()),t=b.getCenter(new T.Vector3()),q=spec.bias||{};t.x+=size.x*(q.x||0);t.y+=size.y*(q.y||0);t.z+=size.z*(q.z||0);
    const cp=Math.cos(spec.pitch),sp=Math.sin(spec.pitch),back=new T.Vector3(Math.sin(spec.yaw)*cp,sp,Math.cos(spec.yaw)*cp),fwd=back.clone().multiplyScalar(-1),right=new T.Vector3().crossVectors(fwd,new T.Vector3(0,1,0)).normalize(),up=new T.Vector3().crossVectors(right,fwd).normalize();
    const vf=T.MathUtils.degToRad(spec.fov),hf=2*Math.atan(Math.tan(vf/2)*Math.max(.25,runtime.camera.aspect||1)),tv=Math.tan(vf/2),th=Math.tan(hf/2);let d=.1;
    for(const p of corners(b)){const v=p.sub(t),z=v.dot(fwd);d=Math.max(d,Math.abs(v.dot(right))*(spec.margin||1.08)/th-z,Math.abs(v.dot(up))*(spec.margin||1.08)/tv-z)}
    d=Math.max(d,Math.max(.1,size.length())*(focused?.48:.38),focused?1.4:8.5);return{target:t,yaw:spec.yaw,pitch:spec.pitch,distance:d*(spec.distanceScale||1),fov:spec.fov};
  }
  const stagePose=v=>{const b=bounds(visibleRoots());return b?fit(b,STAGE[v]||STAGE.front):null};
  function rootFor(c){
    if(c.type==='keyboard')return roots().find(r=>(r.name||'').includes('dual-tier'))||null;
    if(c.type==='drums')return roots().find(r=>(r.name||'').includes('Band Drums'))||null;
    if(c.type==='bass')return roots().find(r=>(r.name||'').includes('Fingered Bass'))||null;
    if(c.type==='acoustic')return roots().find(r=>new RegExp(`Wish Acoustic ${c.index+1}$`).test(r.name||''))||null;
    if(c.type==='electric')return roots().find(r=>new RegExp(`Electric ${c.index+1}$`).test(r.name||''))||null;return null;
  }
  function anchorPose(root,a){root.updateWorldMatrix(true,true);const c=root.localToWorld(new T.Vector3(...a.camera)),t=root.localToWorld(new T.Vector3(...a.target)),b=c.clone().sub(t),d=Math.max(.8,b.length());return{target:t,yaw:Math.atan2(b.x,b.z),pitch:Math.atan2(b.y,Math.max(1e-5,Math.hypot(b.x,b.z))),distance:d,fov:a.fov||34}}
  function instrumentPose(c,s){const r=rootFor(c);if(!r)return null;if(ANCHOR[c.type]?.[s])return anchorPose(r,ANCHOR[c.type][s]);const whole=bounds([r]);if(!whole)return null;const x=DETAIL[c.type]?.[s],b=x?.region?region(whole,x.region):whole,spec=x?.spec||FOCUS[c.type];return spec?fit(b,spec,true):null}

  const clone=p=>({target:p.target.clone(),yaw:p.yaw,pitch:p.pitch,distance:p.distance,fov:p.fov});
  const yawLerp=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
  function cameraPose(){const s=camera?.state;if(!s?.target)return null;return{target:s.target.clone?s.target.clone():new T.Vector3(s.target.x||0,s.target.y||0,s.target.z||0),yaw:+s.yaw||0,pitch:+s.pitch||.13,distance:Math.max(.8,+s.distance||20),fov:clamp(+s.fov||30,24,42)}}
  function moved(base,m,now){const p=clone(base);if(!m||reduced)return p;const e=smooth((now-shotStart-(m.delay||0))/Math.max(800,m.duration||3200));p.yaw+=(m.yaw||0)*e;p.pitch=clamp(p.pitch+(m.pitch||0)*e,.06,1.18);p.distance=Math.max(.8,p.distance*(1+(m.zoom||0)*e));if(m.truck){const r=new T.Vector3(Math.cos(p.yaw),0,-Math.sin(p.yaw));p.target.addScaledVector(r,base.distance*m.truck*e)}p.target.y+=base.distance*(m.rise||0)*e;return p}
  function programPose(now=performance.now()){
    if(transition){const u=clamp((now-transition.start)/transition.duration,0,1),e=ease(u),p={target:transition.from.target.clone().lerp(transition.to.target,e),yaw:yawLerp(transition.from.yaw,transition.to.yaw,e),pitch:T.MathUtils.lerp(transition.from.pitch,transition.to.pitch,e),distance:T.MathUtils.lerp(transition.from.distance,transition.to.distance,e),fov:T.MathUtils.lerp(transition.from.fov,transition.to.fov,e)};if(u>=1){pose=clone(transition.to);poseFactory=transition.factory;motion=transition.after;motionStyle=transition.style;shotStart=now;transition=null}return p}return pose?moved(pose,motion,now):null;
  }
  function apply(cam,p){if(!cam||!p)return;const cp=Math.cos(p.pitch);cam.fov=p.fov;cam.aspect=Math.max(.25,runtime.camera.aspect||1);cam.position.set(p.target.x+Math.sin(p.yaw)*cp*p.distance,Math.max(.18,p.target.y+Math.sin(p.pitch)*p.distance),p.target.z+Math.cos(p.yaw)*cp*p.distance);cam.lookAt(p.target);cam.near=Math.max(.04,p.distance*.0015);cam.far=Math.max(180,p.distance*5);cam.updateProjectionMatrix();cam.updateMatrixWorld(true)}
  const shouldProgram=()=>renderProgram&&enabled&&modeSelect?.value==='song'&&isPlaying()&&programCamera;
  function installRender(){if(wrapped)return;baseRender=runtime.renderer.render.bind(runtime.renderer);programCamera=runtime.camera.clone();programCamera.name='Virtual Band · PROGRAM camera';runtime.renderer.render=function(scene,c){if(c===runtime.camera&&shouldProgram()){const p=manual?cameraPose():programPose();if(p)apply(programCamera,p);return baseRender(scene,programCamera)}return baseRender(scene,c)};wrapped=true}

  function noise(s=0){const x=Math.sin((cuts+1)*12.9898+(moves+1)*4.1414+s*78.233)*43758.5453;return x-Math.floor(x)}
  function chooseMotion(t,s,strong=false){if(reduced)return{style:'static',motion:null};const a=M[t]?.[s];if(!a)return{style:'static',motion:null};const r=noise(t.length+s.length),move=strong?.18:.10,slow=strong?.48:.40;let style=r<move?'move':r<slow?'slow':'static';if(style==='move'&&!a.slice(3).some(Boolean))style='slow';if(style==='static')return{style,motion:null};const off=style==='move'?3:0,dir=noise(3.2)<.5?-1:1;return{style,motion:{delay:style==='move'?650:900,duration:style==='move'?3200:3500,yaw:a[off]*dir,zoom:a[off+1],truck:a[off+2]*dir}}}
  function cutPose(factory,t,id,s,strong=false){const p=factory?.();if(!p)return false;const m=chooseMotion(t,s,strong);poseFactory=factory;pose=clone(p);transition=null;motion=m.motion;motionStyle=m.style;shotStart=performance.now();manual=false;renderProgram=true;target=id;type=t;shot=s;return true}
  function movePose(factory,t,id,s,strong=false,d=2200){const to=factory?.();if(!to)return false;const from=programPose()||pose||to,m=chooseMotion(t,s,strong);transition={from:clone(from),to:clone(to),factory,start:performance.now(),duration:clamp(d,1400,3000),after:m.motion,style:m.style};motion=null;motionStyle='local-move';manual=false;renderProgram=true;target=id;type=t;shot=s;moves++;return true}

  function preferred(c){if(c.type==='keyboard'){if(c.lower>c.upper*1.28)return'observeLower';if(c.upper>c.lower*1.28)return'observeUpper';return'observeAll'}if(c.type==='drums')return['observeAll','observeLeft','observeRight'][cuts%3];if(c.type==='electric')return cuts%4===1?'neck':'overall';if(c.type==='acoustic')return cuts%5===2?'neck':'overall';if(c.type==='bass')return cuts%5===3?'neck':'overall';return'overall'}
  function alternate(c){if(c.type==='keyboard'){const p=preferred(c);if(shot==='observeAll')return p==='observeAll'?(moves%2?'observeLower':'observeUpper'):p;return'observeAll'}if(c.type==='drums'){const a=['observeAll','observeLeft','observeRight'],i=Math.max(0,a.indexOf(shot));return a[(i+1+moves)%a.length]}if(['acoustic','electric','bass'].includes(c.type))return shot==='neck'?'overall':'neck';return null}
  const shotLabel=s=>({observeAll:'演奏总览',observeLower:'下层观察',observeUpper:'上层观察',observeLeft:'左侧观察',observeRight:'右侧观察',overall:'整体',neck:'指板'})[s]||s;
  const stageLabel=s=>({front:'正面',left:'左侧',right:'右侧',top:'高机位'})[s]||s;
  const motionLabel=()=>motionStyle==='move'?'移动':motionStyle==='slow'?'慢移':'静机';
  function status(text,on=false){const s=$('camera-director-status'),b=$('camera-director-toggle');if(s)s.textContent=text;if(b){b.setAttribute('aria-pressed',String(enabled));b.textContent=enabled?'开启':'关闭';b.classList.toggle('active',on&&enabled)}}
  function cutStage(v,reason='全景',strong=false){v=STAGE[v]?v:'front';if(!cutPose(()=>stagePose(v),'stage','stage',v,strong))return false;const now=performance.now();lastCut=now;lastStage=now;cuts++;status(`${reason} · ${stageLabel(v)} · CUT · ${motionLabel()}`,true);return true}
  function cutCandidate(c,reason='',force=false){const s=preferred(c);if(!force&&c.id===target&&s===shot)return false;if(!cutPose(()=>instrumentPose(c,s),c.type,c.id,s,c.strong))return false;const now=performance.now();lastCut=now;cuts++;lastShown.set(c.id,now);status(`${c.label} · ${shotLabel(s)}${reason?` · ${reason}`:''} · CUT · ${motionLabel()}`,true);return true}
  function moveCandidate(c,reason='跟拍'){if(c.id!==target||transition)return false;const s=alternate(c);if(!s||s===shot)return false;if(!movePose(()=>instrumentPose(c,s),c.type,c.id,s,c.strong,c.type==='keyboard'||c.type==='drums'?2200:1900))return false;lastCut=performance.now();lastShown.set(c.id,lastCut);status(`${c.label} · ${shotLabel(s)} · ${reason} MOVE`,true);return true}
  function boundary(t,s,bar=false){const beat=60/bpm(s),span=bar?beat*4:beat,p=((t%span)+span)%span;return Math.min(p,span-p)<=Math.min(bar?.20:.14,span*.24)}
  function reset(force=false){lastSongTime=0;lastCut=-Infinity;lastStage=-Infinity;target='stage';type='stage';shot='front';stageIndex=cuts=moves=0;lastShown.clear();transition=null;manual=false;manualUntil=0;if(force&&enabled&&modeSelect?.value==='song')cutStage('front','开场')}
  function takeover(){if(!enabled||!isPlaying())return;manual=true;transition=null;manualUntil=performance.now()+MANUAL;renderProgram=true;status('手动接管 8s')}

  function direct(s,t,now){
    const a=timeline.map(g=>score(g,t,now)).filter(x=>x.score>.24).sort((x,y)=>y.score-x.score);lastScores=a.map(({id,label,type,score,strong})=>({id,label,type,score,strong}));const top=a[0],active=a.filter(x=>x.score>.72).length,since=now-lastCut,sinceStage=now-lastStage;
    if(manual){if(now<manualUntil||!boundary(t,s))return;if(top)cutCandidate(top,'自动接管',true);else cutStage('front','自动接管');return}
    if(t<1.35)return;
    if(sinceStage>RETURN&&since>=HOLD&&boundary(t,s,true)){stageIndex=(stageIndex+1)%STAGE_SEQ.length;cutStage(STAGE_SEQ[stageIndex],active>=4?'合奏':'回全景');return}
    if(!top){if(target!=='stage'&&since>=HOLD&&boundary(t,s,true)){stageIndex=(stageIndex+1)%STAGE_SEQ.length;cutStage(STAGE_SEQ[stageIndex],'间奏')}return}
    if(top.strong&&top.id!==target&&since>=STRONG&&boundary(t,s)){cutCandidate(top,top.type==='drums'?'Fill':'强调');return}
    if(since<HOLD||!boundary(t,s))return;
    if(active>=5&&sinceStage>8500&&boundary(t,s,true)){stageIndex=(stageIndex+1)%STAGE_SEQ.length;cutStage(STAGE_SEQ[stageIndex],'合奏');return}
    const cur=a.find(x=>x.id===target),dominance=top.score/Math.max(.25,cur?.score||0);if(target==='stage'||top.id!==target||dominance>1.26){cutCandidate(top);return}
    if(top.id===target&&since>=LOCAL&&boundary(t,s,true)){moveCandidate(top,top.strong?'强调跟拍':'跟拍');return}
    if(since>8500){const alt=alternate(top);if(alt&&alt!==shot&&cutPose(()=>instrumentPose(top,alt),top.type,top.id,alt,top.strong)){lastCut=now;cuts++;lastShown.set(top.id,now);status(`${top.label} · ${shotLabel(alt)} · CUT · ${motionLabel()}`,true)}}
  }
  function tick(){const now=performance.now(),s=currentSong(),playing=!!s&&isPlaying();renderProgram=enabled&&playing;if(!enabled){status('关闭');wasPlaying=playing;return}if(modeSelect?.value!=='song'){status('仅欣赏模式');wasPlaying=playing;renderProgram=false;return}if(!s){status('无曲目');wasPlaying=false;renderProgram=false;return}ensure(s);const t=songTime(s);if(playing&&!wasPlaying)reset(true);if(playing&&t+.45<lastSongTime)reset(false);wasPlaying=playing;lastSongTime=t;if(!playing){status('等待播放');renderProgram=false;return}if(manual&&now<manualUntil){status(`手动接管 ${Math.max(1,Math.ceil((manualUntil-now)/1000))}s`);return}direct(s,t,now)}

  function setupUi(){const panel=menu?.querySelector('.camera-panel');if(!panel)return;panel.querySelector('.camera-director-section')?.remove();const sec=document.createElement('div');sec.className='camera-director-section';sec.innerHTML='<div class="camera-director-copy"><strong>自动导播</strong><small id="camera-director-status">等待播放</small></div><button id="camera-director-toggle" type="button" aria-pressed="false">开启</button>';const prefs=panel.querySelector('.camera-pref-section');panel.insertBefore(sec,prefs||panel.querySelector('#camera-v2-note')||null);$('camera-director-style')?.remove();const style=document.createElement('style');style.id='camera-director-style';style.textContent='.camera-director-section{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}.camera-director-copy{display:grid;gap:2px;min-width:0}.camera-director-copy strong{font-size:10px;font-weight:600;color:#dce7e5}.camera-director-copy small{font-size:8px;color:#71858d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:165px}#camera-director-toggle{height:28px;min-width:48px;border:1px solid var(--line);border-radius:7px;background:#ffffff05;color:#8fa1a5;font-size:9px;cursor:pointer}#camera-director-toggle[aria-pressed="true"]{color:#d8e8e4;border-color:#78958e;background:#8fb6aa17}#camera-director-toggle.active{background:#8fb6aa25}';document.head.appendChild(style);sec.querySelector('#camera-director-toggle')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();enabled=!enabled;localStorage.setItem(STORE,enabled?'1':'0');manual=false;manualUntil=0;transition=null;if(enabled){reset(false);status(isPlaying()?'准备接管':'等待播放')}else{renderProgram=false;status('关闭')}})}
  function manualHooks(){stage?.addEventListener('pointerdown',takeover,{capture:true,passive:true});stage?.addEventListener('wheel',takeover,{capture:true,passive:true});menu?.addEventListener('click',e=>{if(e.target.closest('#camera-director-toggle'))return;if(e.target.closest('[data-camera],[data-focus-view],#zoom-in,#zoom-out,#reset,#camera-focus-back'))takeover()},true)}
  function resolve(v){if(v?.isObject3D)return v;const x=String(v||'').toLowerCase();if(x==='keyboard'||x.includes('键盘'))return roots().find(r=>(r.name||'').includes('dual-tier'))||null;if(x==='drums'||x.includes('鼓'))return roots().find(r=>(r.name||'').includes('Band Drums'))||null;if(x==='bass')return roots().find(r=>(r.name||'').includes('Fingered Bass'))||null;let m=x.match(/(?:acoustic|木吉他)\s*(\d+)?/);if(m){const i=Math.max(1,+m[1]||1);return roots().find(r=>new RegExp(`Wish Acoustic ${i}$`).test(r.name||''))||null}m=x.match(/(?:electric|电吉他)\s*(\d+)?/);if(m){const i=Math.max(1,+m[1]||1);return roots().find(r=>new RegExp(`Electric ${i}$`).test(r.name||''))||null}return roots().find(r=>(r.name||'').toLowerCase().includes(x))||null}
  function candidate(r){const n=r?.name||'';if(n.includes('dual-tier'))return{id:'keyboard',type:'keyboard',index:0,label:'键盘',lower:1,upper:1};if(n.includes('Band Drums'))return{id:'drums',type:'drums',index:0,label:'架子鼓'};if(n.includes('Fingered Bass'))return{id:'bass',type:'bass',index:0,label:'Bass'};let m=/Wish Acoustic (\d+)$/.exec(n);if(m)return{id:`acoustic:${+m[1]-1}`,type:'acoustic',index:+m[1]-1,label:`木吉他 ${m[1]}`};m=/Electric (\d+)$/.exec(n);if(m)return{id:`electric:${+m[1]-1}`,type:'electric',index:+m[1]-1,label:`电吉他 ${m[1]}`};return null}

  function attach(){if(attached)return true;camera=window.VirtualBandCamera;runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;if(!camera||!runtime?.renderer||!runtime?.camera||!stage||!menu||!songSelect||!modeSelect||!playButton||!progress)return false;installRender();setupUi();manualHooks();status(enabled?'等待播放':'关闭');timer=setInterval(tick,TICK);addEventListener('resize',()=>{if(poseFactory&&!manual&&!transition){const p=poseFactory();if(p)pose=clone(p)}},{passive:true});window.VirtualBandDirector={enable(){enabled=true;localStorage.setItem(STORE,'1');manual=false;manualUntil=0;reset(false);status(isPlaying()?'准备接管':'等待播放')},disable(){enabled=false;localStorage.setItem(STORE,'0');renderProgram=false;manual=false;transition=null;status('关闭')},toggle(){enabled?this.disable():this.enable();return enabled},setStyle(s){return['hybrid','live-switcher','balanced'].includes(s)},cutToStageView(v='front'){return cutStage(STAGE[v]?v:'front','导播指令')},cutToInstrument(v,s='overall'){const r=resolve(v),c=candidate(r);if(!c)return false;s=s==='overall'&&c.type==='keyboard'?'observeAll':s==='overall'&&c.type==='drums'?'observeAll':s;if(!cutPose(()=>instrumentPose(c,s),c.type,c.id,s))return false;lastCut=performance.now();cuts++;status(`${c.label} · ${shotLabel(s)} · CUT · ${motionLabel()}`,true);return true},moveToInstrument(v,s='overall',d=2200){const r=resolve(v),c=candidate(r);if(!c)return false;s=s==='overall'&&c.type==='keyboard'?'observeAll':s==='overall'&&c.type==='drums'?'observeAll':s;if(!movePose(()=>instrumentPose(c,s),c.type,c.id,s,false,d))return false;lastCut=performance.now();status(`${c.label} · ${shotLabel(s)} · MOVE`,true);return true},hold(ms=MANUAL){manual=true;transition=null;manualUntil=performance.now()+Math.max(0,+ms||0);renderProgram=true},destroy(){if(timer)clearInterval(timer);timer=0;if(wrapped&&runtime?.renderer&&baseRender)runtime.renderer.render=baseRender;wrapped=attached=renderProgram=false;transition=null},get state(){return{enabled,style:'hybrid',playing:isPlaying(),program:renderProgram&&!manual,currentTarget:target,currentType:type,currentShot:shot,manualHoldMs:Math.max(0,manualUntil-performance.now()),motionStyle,motion:motion?{...motion}:null,transitioning:!!transition,scores:lastScores.map(x=>({...x}))}}};attached=true;console.info('[Director v3.2] hybrid director attached · CUT + local MOVE + static/slow cameras');return true}
  function wait(){if(attach())return;if(++tries<600)requestAnimationFrame(wait);else console.warn('[Director v3.2] camera/runtime/player unavailable after waiting; auto director disabled.')}
  wait();
})();
