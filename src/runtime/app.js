'use strict';
function start(){
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch(error){fail();return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<600?1.7:2));
  renderer.setClearColor(0x11191f,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  stage.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
  const scene=new T.Scene();scene.fog=new T.Fog(0x11191f,36,90);
  const camera=new T.PerspectiveCamera(34,1,.05,160);
  const env=environmentTexture(),pmrem=new T.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();const environment=pmrem.fromEquirectangular(env);scene.environment=environment.texture;env.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xd8e8ee,0x363b43,.95));
  const keyLight=new T.DirectionalLight(0xffebd4,3.1);keyLight.position.set(-7,16,10);keyLight.castShadow=true;keyLight.target.position.set(0,5,0);scene.add(keyLight,keyLight.target);
  keyLight.shadow.mapSize.set(2048,2048);Object.assign(keyLight.shadow.camera,{left:-11,right:11,top:12,bottom:-9,near:1,far:40});keyLight.shadow.bias=-.00018;keyLight.shadow.normalBias=.013;keyLight.shadow.radius=3;
  const fill=new T.DirectionalLight(0xabcfe7,1.25);fill.position.set(9,11,4);scene.add(fill);
  const rim=new T.DirectionalLight(0xffe2c8,2.9);rim.position.set(4,14,-7);scene.add(rim);
  const rear=new T.DirectionalLight(0xbedbe9,1.6);rear.position.set(-6,9,-11);scene.add(rear);
  const floor=new T.Mesh(new T.PlaneGeometry(180,180),new T.MeshStandardMaterial({color:0x17232c,roughness:.85,metalness:.11}));floor.rotation.x=-Math.PI/2;floor.position.y=-.012;floor.receiveShadow=true;scene.add(floor);
  const shadowTex=canvasTexture(128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'#00000080');g.addColorStop(.3,'#00000050');g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(0,0,w,h);});
  const contact=new T.Mesh(new T.PlaneGeometry(12.3,7.2),new T.MeshBasicMaterial({map:shadowTex,transparent:true,opacity:.47,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.set(0,-.004,.6);scene.add(contact);

  const model=createStageModel();scene.add(model.root);
  model.root.position.set(-6.15,0,-1.55);model.root.rotation.y=.12;
  contact.position.set(0,-.004,-2.05);

  // Front line: three acoustics and the bass.  The gifted dual-keyboard rig stays
  // centered behind them, so every playable object lives in one Three.js scene.
  const guitarLayouts=[
    {x:-9.35,y:3.90,z:5.35,ry:.23,scale:.59},
    {x:-5.05,y:3.90,z:5.92,ry:.11,scale:.60},
    {x:-.75,y:3.90,z:6.15,ry:.02,scale:.60}
  ];
  const guitarInstances=guitarLayouts.map((p,i)=>{
    const g=createGuitar();g.position.set(p.x,p.y,p.z);g.rotation.y=p.ry;g.scale.setScalar(p.scale);g.name='Wish Acoustic '+(i+1);scene.add(g);return g;
  });
  const bass=createBass();bass.position.set(10.55,3.91,5.15);bass.rotation.y=-.22;bass.scale.setScalar(.565);bass.name='Wish Fingered Bass';scene.add(bass);

  const electricLayouts=[
    {x:2.25,y:2.28,z:6.10,ry:-.03,scale:.63},
    {x:5.30,y:2.28,z:5.90,ry:-.10,scale:.63},
    {x:8.20,y:2.28,z:5.55,ry:-.17,scale:.63}
  ];
  const electricModels=electricLayouts.map((p,i)=>{
    const m=createElectricModel();
    m.root.position.set(p.x,p.y,p.z);m.root.rotation.y=p.ry;m.root.scale.setScalar(p.scale);
    m.root.name='Atelier Electric 05 · Electric '+(i+1);scene.add(m.root);return m;
  });
  const electricModel=electricModels[0];
  let electricControllers=[],electricController=null;

  // User-provided Atelier Session 04 drum kit, now part of the same stage.
  const drumModel=createDrumModel();
  drumModel.root.position.set(2.75,0,-6.35);
  drumModel.root.rotation.y=-.10;
  drumModel.root.scale.setScalar(2.08);
  drumModel.root.name='Atelier Session 04 · Band Drums';
  scene.add(drumModel.root);
  let drumController=null;

  const guitarTuning=[40,45,50,55,59,64],bassTuning=[28,33,38,43];
  const guitarBusy=guitarInstances.map(()=>new Array(6).fill(0)),bassBusy=new Array(4).fill(0);
  const fingerMat=new T.MeshStandardMaterial({color:0xe3cf9e,emissive:0x57401b,emissiveIntensity:1.15,roughness:.34,transparent:true,opacity:.92});
  const guitarMarkers=guitarInstances.map(g=>g.userData.playableStrings.map(()=>{
    const m=new T.Mesh(new T.SphereGeometry(.065,14,10),fingerMat.clone());m.scale.set(1,1,.48);m.visible=false;m.userData.until=0;m.userData.born=0;g.add(m);return m;
  }));
  const bassMarker=new T.Mesh(new T.SphereGeometry(.082,16,12),new T.MeshStandardMaterial({color:0xaed9c4,emissive:0x244b40,emissiveIntensity:1.3,roughness:.32,transparent:true,opacity:.93}));
  bassMarker.scale.set(1,1,.55);bassMarker.visible=false;bassMarker.userData.until=0;bassMarker.userData.born=0;bassMarker.userData.pos=V(0,0,0);bassMarker.userData.target=V(0,0,0);bass.add(bassMarker);
  const bassHand={string:0,fret:0,note:28,time:-1};

  function midiName(note){return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][note%12]+(Math.floor(note/12)-1);}
  function fretWire(n,nut,scale){return n<=0?nut:nut-scale*(1-Math.pow(2,-n/12));}
  function chooseGuitarFinger(note,now,gi){
    const c=[];for(let s=0;s<6;s++){const fret=note-guitarTuning[s];if(fret>=0&&fret<=20)c.push({string:s,fret,score:(guitarBusy[gi][s]>now?2.7:0)+Math.abs(fret-5)*.055+(5-s)*.032});}
    c.sort((a,b)=>a.score-b.score);return c[0]||null;
  }
  function showGuitarFinger(gi,sidx,fret,v,now){
    const g=guitarInstances[gi],s=g.userData.playableStrings[sidx],m=guitarMarkers[gi][sidx];if(!s||!m)return;
    const y=fret===0?4.36:(fretWire(fret,4.42,6.30)+fretWire(fret-1,4.42,6.30))*.5;
    const a=clamp((y-s.a.y)/(s.b.y-s.a.y),0,1),p=s.a.clone().lerp(s.b,a);p.z+=.092;
    m.position.copy(p);m.visible=true;m.userData.born=now;m.userData.until=now+Math.max(150,280*v);m.material.opacity=.72+.22*v;
  }
  // PERFORMANCE: string vibration now deforms the existing vertex buffer in-place.
  // The old implementation rebuilt + disposed a TubeGeometry every frame, which caused
  // GC / geometry-upload spikes exactly when a practice key was pressed.
  function initStringMorph(s){
    if(s._morphReady)return;
    const geom=s.mesh.geometry,attr=geom.getAttribute('position');
    if(!attr)return;
    attr.setUsage(T.DynamicDrawUsage);
    s._basePos=new Float32Array(attr.array);
    s._t=new Float32Array(attr.count);
    const ax=s.b.x-s.a.x,ay=s.b.y-s.a.y,az=s.b.z-s.a.z;
    const denom=ax*ax+ay*ay+az*az||1;
    for(let i=0;i<attr.count;i++){
      const k=i*3,x=s._basePos[k],y=s._basePos[k+1],z=s._basePos[k+2];
      s._t[i]=clamp(((x-s.a.x)*ax+(y-s.a.y)*ay+(z-s.a.z)*az)/denom,0,1);
    }
    s._morphReady=true;
  }
  function restoreStringMorph(s){
    initStringMorph(s);
    const attr=s.mesh.geometry.getAttribute('position');
    if(!attr||!s._basePos)return;
    attr.array.set(s._basePos);attr.needsUpdate=true;
    s.mesh.position.set(0,0,0);s.mesh.quaternion.identity();
  }
  function deformStringMorph(s,phase,amp,kind){
    initStringMorph(s);
    const attr=s.mesh.geometry.getAttribute('position');
    if(!attr||!s._basePos||!s._t)return;
    const a=attr.array,base=s._basePos,tv=s._t;
    const edgeSize=kind==='bass'?.16:.14;
    const waveMul=kind==='bass'?13.4:15.8;
    const zRatio=kind==='bass'?.22:.34;
    const phase2=kind==='bass'?.73:.71;
    for(let i=0;i<attr.count;i++){
      const k=i*3,t=tv[i],edge=Math.min(1,t/edgeSize,(1-t)/edgeSize);
      const tap=edge*edge*(3-2*edge),env=Math.sin(Math.PI*t)*tap;
      // Longitudinal position drives a smooth wave while both endpoints remain pinned.
      const w=Math.sin(phase+t*waveMul)*amp*env;
      a[k]=base[k]+w;
      a[k+1]=base[k+1];
      a[k+2]=base[k+2]+w*zRatio*Math.cos(phase*phase2+t*7.1);
    }
    attr.needsUpdate=true;
  }
  // Prepare once while idle, rather than on the first played note.
  function initAllStringMorphs(){
    for(const g of guitarInstances)for(const s of g.userData.playableStrings||[])initStringMorph(s);
    for(const s of bass.userData.playableStrings||[])initStringMorph(s);
  }
  initAllStringMorphs();

  function triggerGuitar(ev){
    const gi=ev.x|0,now=performance.now(),f=chooseGuitarFinger(ev.n,now,gi);if(!f)return;
    const v=clamp(ev.v/127,.18,1),s=guitarInstances[gi].userData.playableStrings[f.string];guitarBusy[gi][f.string]=now+78;showGuitarFinger(gi,f.string,f.fret,v,now);
    s.amp=.035*v*(1.12-f.string*.045);s.phase=Math.PI*.5;s.active=true;s.visualHz=7.4+(ev.n-40)*.075;markChanged();
  }
  function chooseBassFinger(note,now){
    const c=[],recent=bassHand.time>0&&(now-bassHand.time)<420;
    for(let s=0;s<4;s++){
      const fret=note-bassTuning[s];if(fret<0||fret>21)continue;
      let score=(bassBusy[s]>now?2.4:0);
      if(recent){const fj=Math.abs(fret-bassHand.fret),sj=Math.abs(s-bassHand.string);score+=fj*.11+sj*.34;if(Math.abs(note-bassHand.note)<=4&&s===bassHand.string)score-=.28;if(fj>5)score+=(fj-5)*.15;}
      else score+=Math.abs(fret-4)*.05+(3-s)*.022;
      c.push({string:s,fret,score});
    }
    c.sort((a,b)=>a.score-b.score);return c[0]||null;
  }
  function triggerBass(ev){
    const now=performance.now(),f=chooseBassFinger(ev.n,now);if(!f)return;
    const v=clamp(ev.v/127,.2,1),s=bass.userData.playableStrings[f.string];bassBusy[f.string]=now+80;
    bassHand.string=f.string;bassHand.fret=f.fret;bassHand.note=ev.n;bassHand.time=now;
    const y=f.fret===0?5.86:(fretWire(f.fret,6.0,8.66)+fretWire(f.fret-1,6.0,8.66))*.5,a=clamp((y-s.a.y)/(s.b.y-s.a.y),0,1),p=s.a.clone().lerp(s.b,a);p.z+=.115;
    if(!bassMarker.visible){bassMarker.position.copy(p);bassMarker.userData.pos.copy(p);}bassMarker.userData.target.copy(p);bassMarker.visible=true;bassMarker.userData.born=now;bassMarker.userData.until=now+Math.max(220,360*v);
    s.amp=.040*v;s.phase=Math.PI*.5;s.active=true;s.visualHz=4.6+(ev.n-28)*.095;markChanged();
  }
  function straightGuitarString(s){restoreStringMorph(s);}
  function updateBandVisuals(dt,now){
    let any=false;
    for(let gi=0;gi<guitarInstances.length;gi++){
      for(const s of guitarInstances[gi].userData.playableStrings){
        if(!s.active)continue;
        any=true;s.phase+=dt*TAU*s.visualHz;s.amp*=Math.exp(-dt*s.decay);
        if(s.amp<.00042){s.amp=0;s.active=false;restoreStringMorph(s);continue;}
        deformStringMorph(s,s.phase,s.amp,'guitar');
      }
      for(const m of guitarMarkers[gi])if(m.visible){
        if(now>=m.userData.until)m.visible=false;
        else{any=true;const age=(now-m.userData.born)/130,p=1+Math.sin(Math.min(1,age)*Math.PI)*.14;m.scale.set(p,p,.48);}
      }
    }
    for(const s of bass.userData.playableStrings||[]){
      if(!s.active)continue;
      any=true;s.phase+=dt*TAU*s.visualHz;s.amp*=Math.exp(-dt*s.decay);
      if(s.amp<.00042){s.amp=0;s.active=false;restoreStringMorph(s);continue;}
      deformStringMorph(s,s.phase,s.amp,'bass');
    }
    if(bassMarker.visible){
      if(now>=bassMarker.userData.until)bassMarker.visible=false;
      else{
        any=true;const follow=1-Math.exp(-dt*18);
        bassMarker.userData.pos.lerp(bassMarker.userData.target,follow);
        bassMarker.position.copy(bassMarker.userData.pos);
        const age=(now-bassMarker.userData.born)/145,p=1+Math.sin(Math.min(1,age)*Math.PI)*.12;
        bassMarker.scale.set(p,p,.55);
      }
    }
    if(any)needsRender=true;return any;
  }

  const presets={
    whole:{target:V(0,5.20,.65),yaw:.20,pitch:.315,height:14.7,width:24.8},
    lower:{target:V(.05,8.04,-2.45),yaw:.05,pitch:.32,height:4.8,width:14.9},
    upper:{target:V(0,10.38,-3.48),yaw:.16,pitch:.64,height:4.9,width:11.9},
    pedals:{target:V(0,.28,-.30),yaw:.22,pitch:.65,height:2.2,width:3.5},
    back:{target:V(0,5.20,.10),yaw:Math.PI+.22,pitch:.25,height:14.7,width:24.8}
  };
  const current={target:presets.whole.target.clone(),yaw:.39,pitch:.425,distance:27},want={target:current.target.clone(),yaw:current.yaw,pitch:current.pitch,distance:27};
  let width=1,height=1,zoom=1,preset='whole',raf=0,inFrame=false,needsRender=true,lastTime=performance.now(),inputTier='lower';
  let momentumX=0,momentumY=0,previousGesture=null,controller;
  const keyboardStrikeActions=new Map();
  const KEY_STRIKE_THRESHOLD=1;
  const KEY_UP_DURATION=.050;
  function keyboardDownDuration(velocity=100,source=''){
    const v=clamp(Number(velocity)||100,1,127)/127;
    // Song playback gets a slightly longer, readable travel.
    // Interactive play is intentionally faster to keep latency low.
    if(String(source).startsWith('song:'))return .065-.018*v;   // ~47–65 ms
    return .034-.010*v;                                        // ~24–34 ms
  }
  function clearKeyboardStrikeActions(prefix=''){
    for(const key of [...keyboardStrikeActions.keys()]){
      if(!prefix||String(key).startsWith(prefix))keyboardStrikeActions.delete(key);
    }
  }
  function handleKeyboardStrike(ev){
    const action=keyboardStrikeActions.get(ev.source);
    if(!action)return;
    keyboardStrikeActions.delete(ev.source);

    // The physical key has now reached its actuation point.
    // Only now do we create/start the SoundFont voice.
    if(action.kind==='practice'){
      if(!practice?.running||practice.target?.role!==action.role)return;
      const song=SONGS[practice.songId];
      const tone=action.tone||practice.target?.events?.[0]?.tone;
      const sf=tone?getSF(song,tone):null;if(!sf)return;
      try{
        const stop=sf.start({note:action.note,velocity:action.velocity,stopId:ev.source});
        if(typeof stop==='function')practice.stops.set(action.code,stop);
      }catch(err){console.error(err);}
    }else if(action.kind==='live'){
      if(live?.mode!=='free'||live.instrument!==action.role)return;
      try{
        const stop=action.sf.start({
          note:action.note,velocity:action.velocity,stopId:ev.source,
          ...(action.duration!=null?{duration:action.duration}:{})
        });
        if(typeof stop==='function')live.stops.set(action.code,stop);
      }catch(err){console.error(err);}
    }
  }
  const pointers=new Map(),computerKeys=new Map(),canvas=renderer.domElement;
  const raycaster=new T.Raycaster(),ndc=new T.Vector2(),demoButton=document.getElementById('demo');
  const statusTier=document.getElementById('input-tier'),statusNotes=document.getElementById('active-notes');
  let demoPlaying=false,demoStarted=0,demoCursor=0;
  const demoEvents=[],demoLength=15.36;
  function markChanged(){needsRender=true;if(!raf&&!inFrame&&!document.hidden)raf=requestAnimationFrame(frame);}
  drumController=createDrumController(drumModel,{
    wake:markChanged,
    onHit:()=>{needsRender=true;}
  });
  electricControllers=electricModels.map((m,i)=>createElectricController(m,{
    wake:markChanged,
    onHit:()=>{needsRender=true;}
  }));
  electricController=electricControllers[0];
  function distanceFor(p){
    const reserved=height<500?102:178,usableHeight=Math.max(height-reserved,height*.64),usableWidth=width<600?width-26:width-86;
    return Math.max(p.height*height/usableHeight,p.width*height/Math.max(usableWidth,200))/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)));
  }
  function updateStatus(){
    statusTier.textContent=inputTier==='lower'?'88 · STAGE PIANO':'61 · SYNTHESIZER';
    const notes=controller?controller.activeNotes(inputTier):[];
    statusNotes.textContent=notes.length?notes.slice(-8).map(noteName).join('   '):inputTier==='lower'?'A0 — C8':'C2 — C7';
    statusNotes.classList.toggle('note-on',notes.length>0);
  }
  let statusUpdatePending=false;
  function queueStatusUpdate(){
    // In Free/Practice mode the right-hand practice UI is the live readout.
    // Avoid DOM text/layout work on every keyboard press/release.
    const mode=document.getElementById('bp-mode')?.value||'song';
    if(mode!=='song')return;
    if(statusUpdatePending)return;
    statusUpdatePending=true;
    requestAnimationFrame(()=>{statusUpdatePending=false;updateStatus();});
  }
  function setInputTier(id){if(id!=='lower'&&id!=='upper')return false;inputTier=id;updateStatus();return true;}
  function releaseHit(p){
    if(p.hit?.key)controller.release(p.hit.key.note,p.hit.key.tier,'pointer:'+p.id);
    if(p.hit?.pedal)controller.pedal(p.hit.pedal.id,false,'pointer:'+p.id);
    p.hit=null;
  }
  function playHit(p,hit){
    if(p.hit?.key===hit?.key&&p.hit?.pedal===hit?.pedal)return;
    releaseHit(p);p.hit=hit;
    if(hit?.key){setInputTier(hit.key.tier);controller.press(hit.key.note,103,hit.key.tier,'pointer:'+p.id);}
    if(hit?.pedal)controller.pedal(hit.pedal.id,true,'pointer:'+p.id);
  }
  function hitAt(x,y){
    const rect=canvas.getBoundingClientRect();ndc.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(ndc,camera);
    const found=raycaster.intersectObject(model.root,true)[0];let object=found?.object;
    while(object&&object!==model.root){if(object.userData.key||object.userData.pedal)return object.userData;object=object.parent;}return null;
  }
  function stopDemo(){
    demoPlaying=false;demoButton.setAttribute('aria-pressed','false');document.getElementById('demo-label').textContent='演奏动画';
    if(controller)controller.clearSources('demo:');markChanged();
  }

  controller=createStageController(model,{
    wake:markChanged,
    onChange:()=>queueStatusUpdate(),
    // Only auto-song playback is allowed to refresh the decorative hardware LCD.
    // Free-play and practice need input latency, not a constantly redrawn 3D display.
    screenEnabled:()=>((document.getElementById('bp-mode')?.value||'song')==='song'),
    strikeThreshold:KEY_STRIKE_THRESHOLD,
    audioNow:()=>bandAC?.currentTime ?? performance.now()/1000,
    onStrike:handleKeyboardStrike,
    onPanic:()=>{clearKeyboardStrikeActions();stopDemo();pointers.clear();computerKeys.clear();canvas.classList.remove('dragging');momentumX=momentumY=0;}
  });

  // Full-band transport. AudioContext is the timing master; rAF only mirrors it
  // into the 3D performance state.
  const SONGS=window.VIRTUAL_BAND_SONGS;

  // ---------------- UNIVERSAL STANDARD MIDI FILE IMPORT ----------------
  // Pure browser-side SMF parser: format 0/1, running status, tempo map,
  // Program Change, note pairing, CC64 sustain and Channel 10 percussion.
  const GM_PROGRAMS=[
    'acoustic_grand_piano','bright_acoustic_piano','electric_grand_piano','honkytonk_piano','electric_piano_1','electric_piano_2','harpsichord','clavinet',
    'celesta','glockenspiel','music_box','vibraphone','marimba','xylophone','tubular_bells','dulcimer',
    'drawbar_organ','percussive_organ','rock_organ','church_organ','reed_organ','accordion','harmonica','tango_accordion',
    'acoustic_guitar_nylon','acoustic_guitar_steel','electric_guitar_jazz','electric_guitar_clean','electric_guitar_muted','overdriven_guitar','distortion_guitar','guitar_harmonics',
    'acoustic_bass','electric_bass_finger','electric_bass_pick','fretless_bass','slap_bass_1','slap_bass_2','synth_bass_1','synth_bass_2',
    'violin','viola','cello','contrabass','tremolo_strings','pizzicato_strings','orchestral_harp','timpani',
    'string_ensemble_1','string_ensemble_2','synth_strings_1','synth_strings_2','choir_aahs','voice_oohs','synth_choir','orchestra_hit',
    'trumpet','trombone','tuba','muted_trumpet','french_horn','brass_section','synth_brass_1','synth_brass_2',
    'soprano_sax','alto_sax','tenor_sax','baritone_sax','oboe','english_horn','bassoon','clarinet',
    'piccolo','flute','recorder','pan_flute','blown_bottle','shakuhachi','whistle','ocarina',
    'lead_1_square','lead_2_sawtooth','lead_3_calliope','lead_4_chiff','lead_5_charang','lead_6_voice','lead_7_fifths','lead_8_bass__lead',
    'pad_1_new_age','pad_2_warm','pad_3_polysynth','pad_4_choir','pad_5_bowed','pad_6_metallic','pad_7_halo','pad_8_sweep',
    'fx_1_rain','fx_2_soundtrack','fx_3_crystal','fx_4_atmosphere','fx_5_brightness','fx_6_goblins','fx_7_echoes','fx_8_scifi',
    'sitar','banjo','shamisen','koto','kalimba','bagpipe','fiddle','shanai',
    'tinkle_bell','agogo','steel_drums','woodblock','taiko_drum','melodic_tom','synth_drum','reverse_cymbal',
    'guitar_fret_noise','breath_noise','seashore','bird_tweet','telephone_ring','helicopter','applause','gunshot'
  ];
  const GM_LABELS=GM_PROGRAMS.map(s=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()));
  function gmFallback(program){
    if(program<8)return 'acoustic_grand_piano';
    if(program<16)return 'marimba';
    if(program<24)return 'rock_organ';
    if(program<26)return 'acoustic_guitar_steel';
    if(program<32)return program===26?'electric_guitar_jazz':'electric_guitar_clean';
    if(program<36)return program===32?'acoustic_bass':program===35?'fretless_bass':'electric_bass_finger';
    if(program<40)return program>=38?'synth_bass_1':'electric_bass_finger';
    if(program<56)return 'string_ensemble_2';
    if(program<72)return 'synth_brass_1';
    if(program<80)return 'synth_brass_2';
    if(program<104)return 'synth_brass_2';
    if(program<112)return 'acoustic_guitar_steel';
    if(program<120)return 'marimba';
    return 'synth_brass_2';
  }
  function gmRole(program,channel,note=60){
    if(channel===9)return 'drums';
    if(program>=24&&program<=25)return 'guitar';
    if(program>=26&&program<=31)return 'electric';
    if(program>=32&&program<=39)return 'bass';
    if(program<=15)return 'lower';
    // Organs, strings, brass, winds, leads and pads are visually proxied by the upper keyboard.
    // Extremely low/high proxy notes fall back to the 88-key lower keyboard.
    return note<36||note>96?'lower':'upper';
  }
  function gmRoleLabel(role){
    return {guitar:'木吉他',electric:'电吉他',bass:'Bass',lower:'88 键',upper:'61 键代理',drums:'架子鼓'}[role]||role;
  }
  function smfReadVar(bytes,state){
    let value=0,b=0,count=0;
    do{
      if(state.p>=bytes.length)throw new Error('MIDI 文件意外结束');
      b=bytes[state.p++];value=(value<<7)|(b&127);
      if(++count>4)throw new Error('非法 MIDI variable-length quantity');
    }while(b&128);
    return value>>>0;
  }
  function smfText(bytes,p,n){
    let s='';for(let i=0;i<n;i++){const c=bytes[p+i];if(c>=32&&c<127)s+=String.fromCharCode(c);}
    return s.trim();
  }
  function parseStandardMidi(arrayBuffer,fileName='Imported MIDI'){
    const bytes=new Uint8Array(arrayBuffer),dv=new DataView(arrayBuffer);
    const four=p=>String.fromCharCode(bytes[p],bytes[p+1],bytes[p+2],bytes[p+3]);
    const u16=p=>dv.getUint16(p,false),u32=p=>dv.getUint32(p,false);
    if(bytes.length<14||four(0)!=='MThd')throw new Error('不是有效的 Standard MIDI File');
    const headerLen=u32(4),format=u16(8),trackCount=u16(10),division=u16(12);
    if(format>2)throw new Error('不支持的 MIDI format '+format);
    if(format===2)throw new Error('暂不支持 MIDI Format 2（多个独立序列）');
    let p=8+headerLen,seq=0,maxTick=0;
    const raw=[],tempos=[],trackNames=[];
    for(let track=0;track<trackCount;track++){
      if(p+8>bytes.length||four(p)!=='MTrk')throw new Error('缺少 MTrk：轨道 '+(track+1));
      const len=u32(p+4),end=Math.min(bytes.length,p+8+len);p+=8;
      let tick=0,running=0;
      while(p<end){
        const st={p};const delta=smfReadVar(bytes,st);p=st.p;tick+=delta;maxTick=Math.max(maxTick,tick);
        if(p>=end)break;
        let status=bytes[p];
        if(status<0x80){
          if(!running)throw new Error('Running status 缺失');
          status=running;
        }else{
          p++;
          if(status<0xf0)running=status;else running=0;
        }
        if(status===0xff){
          if(p>=end)break;const type=bytes[p++],ls={p},mlen=smfReadVar(bytes,ls);p=ls.p;
          const mstart=p,mend=Math.min(end,p+mlen);
          if(type===0x51&&mend-mstart===3){
            const tempo=(bytes[mstart]<<16)|(bytes[mstart+1]<<8)|bytes[mstart+2];
            tempos.push({tick,tempo,seq:seq++});
          }else if((type===0x03||type===0x04)&&!trackNames[track]){
            trackNames[track]=smfText(bytes,mstart,mend-mstart);
          }
          p=mend;
          if(type===0x2f)break;
          continue;
        }
        if(status===0xf0||status===0xf7){
          const ls={p},slen=smfReadVar(bytes,ls);p=Math.min(end,ls.p+slen);continue;
        }
        const hi=status&0xf0,ch=status&15;
        if(hi<0x80||hi>0xe0)throw new Error('未知 MIDI status 0x'+status.toString(16));
        if(p>=end)break;const d1=bytes[p++],one=(hi===0xc0||hi===0xd0),d2=one?0:(p<end?bytes[p++]:0);
        let type='';
        if(hi===0x80)type='off';
        else if(hi===0x90)type=d2===0?'off':'on';
        else if(hi===0xb0)type='cc';
        else if(hi===0xc0)type='program';
        else if(hi===0xe0)type='bend';
        if(type)raw.push({tick,track,seq:seq++,type,ch,d1,d2});
      }
      p=end;
    }

    let tickToSec,firstTempo=500000;
    if(division&0x8000){
      const fpsCode=(division>>8)&255,frames=256-fpsCode,fps=frames===29?29.97:frames,tpf=division&255;
      if(!fps||!tpf)throw new Error('非法 SMPTE time division');
      tickToSec=t=>t/(fps*tpf);
    }else{
      const ppq=division;if(!ppq)throw new Error('PPQ 不能为 0');
      tempos.sort((a,b)=>a.tick-b.tick||a.seq-b.seq);
      const dedup=[];for(const te of tempos){if(dedup.length&&dedup.at(-1).tick===te.tick)dedup[dedup.length-1]=te;else dedup.push(te);}
      if(!dedup.length||dedup[0].tick!==0)dedup.unshift({tick:0,tempo:500000,seq:-1});
      firstTempo=dedup[0].tempo;
      const seg=[];let prevTick=0,prevSec=0,prevTempo=dedup[0].tempo;
      seg.push({tick:0,sec:0,tempo:prevTempo});
      for(let i=1;i<dedup.length;i++){
        const te=dedup[i];prevSec+=(te.tick-prevTick)*prevTempo/(ppq*1e6);
        seg.push({tick:te.tick,sec:prevSec,tempo:te.tempo});
        prevTick=te.tick;prevTempo=te.tempo;
      }
      tickToSec=t=>{
        let lo=0,hi=seg.length-1;
        while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(seg[mid].tick<=t)lo=mid;else hi=mid-1;}
        const s=seg[lo];return s.sec+(t-s.tick)*s.tempo/(ppq*1e6);
      };
    }

    raw.sort((a,b)=>a.tick-b.tick||a.seq-b.seq);
    const programs=Array(16).fill(0),active=new Map(),notes=[],drumHits=[],pedals=[];
    function activeKey(e){return e.track+':'+e.ch+':'+e.d1}
    function pushActive(e){
      const key=activeKey(e);let q=active.get(key);if(!q)active.set(key,q=[]);
      q.push({tick:e.tick,track:e.track,ch:e.ch,note:e.d1,velocity:e.d2,program:programs[e.ch]});
    }
    function popActive(e){
      const key=activeKey(e),q=active.get(key);if(!q?.length)return;
      const n=q.shift();n.endTick=Math.max(n.tick+1,e.tick);notes.push(n);if(!q.length)active.delete(key);
    }
    for(const e of raw){
      if(e.type==='program'){programs[e.ch]=e.d1&127;continue;}
      if(e.type==='cc'){
        if(e.d1===64&&e.ch!==9){
          const role=gmRole(programs[e.ch],e.ch,60);
          if(role==='lower'||role==='upper')pedals.push({tick:e.tick,on:e.d2>=64});
        }
        continue;
      }
      if(e.type==='on'){
        if(e.ch===9)drumHits.push({tick:e.tick,track:e.track,ch:e.ch,note:e.d1,velocity:e.d2,program:0});
        else pushActive(e);
      }else if(e.type==='off'&&e.ch!==9)popActive(e);
    }
    for(const q of active.values())for(const n of q){n.endTick=Math.max(n.tick+1,maxTick);notes.push(n);}

    const firstMusicalTick=Math.min(
      ...notes.map(n=>n.tick),
      ...drumHits.map(n=>n.tick),
      Number.POSITIVE_INFINITY
    );
    const trimTick=Number.isFinite(firstMusicalTick)?firstMusicalTick:0;
    const trimSec=tickToSec(trimTick);
    const duration=Math.max(.1,tickToSec(maxTick)-trimSec);
    const acousticLane=new Map(),electricLane=new Map();let nextAcoustic=0,nextElectric=0,id=1;
    const events=[],tones={},roleCounts={},rolePrograms={};
    function addRole(role,program){
      roleCounts[role]=(roleCounts[role]||0)+1;
      (rolePrograms[role]||(rolePrograms[role]=new Set())).add(program);
    }
    function toneFor(program,role,lane=0){
      const split=role==='guitar'||role==='electric';
      const key='gm_p'+program+(split?'_'+role+'_lane'+lane:'');
      if(!tones[key]){
        const lanePan=[-.28,0,.28][Math.max(0,Math.min(2,lane|0))];
        const pan=split?lanePan:({bass:-.08,lower:-.10,upper:.12}[role]||0);
        tones[key]={instrument:GM_PROGRAMS[program]||gmFallback(program),fallback:gmFallback(program),pan,volume:role==='bass'?78:split?76:80};
      }
      return key;
    }
    notes.sort((a,b)=>a.tick-b.tick||a.track-b.track||a.note-b.note);
    for(const n of notes){
      let role=gmRole(n.program,n.ch,n.note),x=0;
      if(role==='guitar'){
        const lane=n.track+':'+n.ch+':'+n.program;
        if(!acousticLane.has(lane)){acousticLane.set(lane,nextAcoustic%3);nextAcoustic++;}
        x=acousticLane.get(lane);
      }else if(role==='electric'){
        const lane=n.track+':'+n.ch+':'+n.program;
        if(!electricLane.has(lane)){electricLane.set(lane,nextElectric%3);nextElectric++;}
        x=electricLane.get(lane);
      }
      const s=Math.max(0,tickToSec(n.tick)-trimSec),e=Math.max(s+.035,tickToSec(n.endTick)-trimSec);
      const tone=toneFor(n.program,role,x);
      events.push({s,e,ve:e,i:role,x,n:n.note,v:n.velocity,pg:n.program,tone,id:id++});
      addRole(role,n.program);
    }
    for(const n of drumHits){
      const s=Math.max(0,tickToSec(n.tick)-trimSec),e=s+.09;
      events.push({s,e,ve:e,i:'drums',x:0,n:n.note,v:n.velocity,tone:'drums',id:id++});
      addRole('drums',0);
    }
    events.sort((a,b)=>a.s-b.s||a.id-b.id);
    const pedalOut=pedals.map(p=>({t:Math.max(0,tickToSec(p.tick)-trimSec),on:p.on})).filter(p=>p.t<=duration+.1).sort((a,b)=>a.t-b.t);

    const cardOrder=['guitar','electric','bass','lower','upper','drums'];
    const cards=[];
    for(const role of cardOrder){
      const count=roleCounts[role]||0;if(!count)continue;
      const progs=[...(rolePrograms[role]||[])];
      const name=role==='drums'?'GM Channel 10':progs.slice(0,2).map(p=>GM_LABELS[p]||('Program '+p)).join(' / ')+(progs.length>2?' +'+(progs.length-2):'');
      cards.push([
        {guitar:'ACOUSTIC',electric:'ELECTRIC',bass:'BASS',lower:'LOWER · 88',upper:'UPPER · 61',drums:'DRUMS'}[role],
        name,
        count+(role==='drums'?' hits':' notes')
      ]);
    }
    if(roleCounts.electric){
      const laneCount=new Set(events.filter(e=>e.i==='electric').map(e=>e.x|0)).size;
      const c=cards.find(c=>c[0]==='ELECTRIC');if(c)c[0]='ELECTRIC ×'+laneCount;
    }
    const activeRoles=cardOrder.filter(r=>roleCounts[r]);
    const stage=(roleCounts.guitar||roleCounts.electric||roleCounts.drums)?'full':roleCounts.bass?'keys_bass':'keys';
    const cleanName=(fileName||'Imported MIDI').replace(/\.(mid|midi)$/i,'');
    const title=cleanName||trackNames.find(Boolean)||'Imported MIDI';
    return {
      artist:'Imported MIDI',title,
      bpm:String(Math.round(60000000/firstTempo)),
      duration,stage,cards,events,pedals:pedalOut,tones,
      subtitle:'GM 自动路由 · '+activeRoles.map(gmRoleLabel).join(' + ')+' · '+trackCount+' tracks',
      imported:true,format,trackCount,sourceName:fileName
    };
  }

  const bp={
    play:document.getElementById('bp-play'),restart:document.getElementById('bp-restart'),
    song:document.getElementById('bp-song'),mode:document.getElementById('bp-mode'),importBtn:document.getElementById('bp-import'),file:document.getElementById('bp-file'),
    instrument:document.getElementById('bp-instrument'),bassLayout:document.getElementById('bp-bass-layout'),electricMode:document.getElementById('bp-electric-mode'),map:document.getElementById('bp-map'),
    freebadge:document.getElementById('bp-freebadge'),title:document.getElementById('bp-title'),
    sub:document.getElementById('bp-sub'),grid:document.getElementById('bp-grid'),practice:document.getElementById('bp-practice'),
    time:document.getElementById('bp-time'),now:document.getElementById('bp-now'),progress:document.getElementById('bp-progress')
  };
  let currentSongId='wish';
  let bandAC=null,SoundfontCtor=null,bandLoading=null;
  const sfCache=new Map();
  const drumBuffers=new Map();
  const drumVoices=new Set();
  // Paul Rosen's abcjs soundfont fork includes a real Channel-10 percussion set.
  // Files are named by MIDI pitch using flats: C2.mp3, Gb2.mp3, Bb2.mp3, Db3.mp3...
  const DRUM_SAMPLE_BASE='https://paulrosen.github.io/midi-js-soundfonts/abcjs/percussion-mp3/';
  const DRUM_FLAT_NAMES=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const DRUM_PART_LABEL={kick:'底鼓',snare:'军鼓',hihat:'踩镲',floorTom:'落地通鼓',tomMid:'中通',tomHigh:'高通',crashLeft:'Crash',crashRight:'Crash 2',ride:'Ride',splash:'Splash'};
  const DRUM_KEY_BY_PART={kick:'A',snare:'S',hihat:'D/F',tomHigh:'J',tomMid:'K',floorTom:'L',crashLeft:'Q',crashRight:'W',ride:'E',splash:'T'};
  const DRUM_CODE_TO_NOTE={KeyA:36,KeyS:38,KeyD:42,KeyF:46,KeyJ:50,KeyK:47,KeyL:43,KeyQ:49,KeyW:57,KeyE:51,KeyT:55};
  const DRUM_FREE_NOTES=Object.values(DRUM_CODE_TO_NOTE);
  function drumVisualNote(note){
    if(DRUM_NOTES[note])return note;
    if(note===37||note===39||note===40)return 38;
    if(note===44)return 42;
    if(note===41||note===43)return 43;
    if(note===45||note===47)return 47;
    if(note===48||note===50)return 50;
    if(note===52||note===54||note===56||note===58)return 49;
    if(note===53||note===59)return 51;
    if(note===35)return 36;
    return note<41?38:note<49?47:note<55?50:51;
  }
  function drumPart(note){return DRUM_NOTES[drumVisualNote(note)]||null;}
  function drumDisplay(note){
    const p=drumPart(note);return p?(DRUM_PART_LABEL[p]||p):midiName(note);
  }
  function drumNoteFile(note){
    const n=Math.max(0,Math.min(127,Math.round(note)));
    const octave=Math.floor(n/12)-1;
    return DRUM_FLAT_NAMES[n%12]+octave+'.mp3';
  }
  async function ensureDrumBuffers(song=null){
    if(!bandAC)bandAC=new (window.AudioContext||window.webkitAudioContext)();
    const notes=new Set(DRUM_FREE_NOTES);
    for(const ev of song?.events||[])if(ev.i==='drums')notes.add(ev.n);
    const pending=[];
    for(const note of notes){
      if(drumBuffers.has(note))continue;
      const url=DRUM_SAMPLE_BASE+drumNoteFile(note);
      pending.push(fetch(url,{mode:'cors'}).then(r=>{
        if(!r.ok)throw new Error('Drum sample MIDI '+note+' '+drumNoteFile(note)+' '+r.status);
        return r.arrayBuffer();
      }).then(b=>bandAC.decodeAudioData(b)).then(buf=>drumBuffers.set(note,buf)));
    }
    await Promise.all(pending);
  }
  function playDrumSample(note,velocity=100,when=null){
    const buf=drumBuffers.get(note);if(!buf||!bandAC)return null;
    const src=bandAC.createBufferSource(),g=bandAC.createGain();
    src.buffer=buf;g.gain.value=Math.max(.025,Math.min(1,(velocity||100)/127))*.80;
    src.connect(g).connect(bandAC.destination);
    drumVoices.add(src);src.addEventListener('ended',()=>drumVoices.delete(src),{once:true});
    src.start(when??bandAC.currentTime);
    return ()=>{try{src.stop()}catch{}drumVoices.delete(src);}
  }
  function stopDrumVoices(){for(const src of drumVoices)try{src.stop()}catch{}drumVoices.clear();}

  const transport={playing:false,startAudio:0,raf:0,onPtr:0,drumPtr:0,offPtr:0,pedalPtr:0,lastSongTime:0,currentSfs:new Set(),scheduledStops:new Set()};
  let keyboardOffs=[],visualOns=[],drumOns=[],byId=new Map();

  const fmtBand=s=>{s=Math.max(0,s||0);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0')};
  const songNow=()=>transport.playing&&bandAC?Math.max(0,bandAC.currentTime-transport.startAudio):0;


  // ---------------- LIVE / FREE PLAY ----------------

  const ELECTRIC_PROGRAM_PRESETS={
    26:{name:'Jazz',instrument:'electric_guitar_jazz',pickup:0,tone:.56,volume:.76,accent:.82},
    27:{name:'Clean',instrument:'electric_guitar_clean',pickup:1,tone:.82,volume:.82,accent:.92},
    28:{name:'Muted',instrument:'electric_guitar_muted',pickup:2,tone:.50,volume:.80,accent:.66},
    29:{name:'Overdrive',instrument:'overdriven_guitar',pickup:2,tone:.84,volume:.91,accent:1.04},
    30:{name:'Distortion',instrument:'distortion_guitar',pickup:2,tone:1.00,volume:.96,accent:1.12},
    31:{name:'Harmonics',instrument:'guitar_harmonics',pickup:2,tone:1.00,volume:.86,accent:.78}
  };
  const electricProgramState=new Array(3).fill(null);
  function electricProgramFromEvent(ev){
    if(Number.isInteger(ev?.pg))return ev.pg;
    const t=String(ev?.tone||'');
    if(t.includes('jazz'))return 26;if(t.includes('muted'))return 28;
    if(t.includes('overdr'))return 29;if(t.includes('distort'))return 30;
    if(t.includes('harmonic'))return 31;return 27;
  }
  function applyElectricProgram(slot,program,force=false){
    slot=Math.max(0,Math.min(electricControllers.length-1,slot|0));
    program=Math.max(26,Math.min(31,program|0));
    if(!force&&electricProgramState[slot]===program)return;
    const preset=ELECTRIC_PROGRAM_PRESETS[program]||ELECTRIC_PROGRAM_PRESETS[27];
    const c=electricControllers[slot];if(!c)return;
    c.api.setControl('pickup',preset.pickup);
    c.api.setControl('tone',preset.tone);
    c.api.setControl('volume',preset.volume);
    electricProgramState[slot]=program;
    markChanged();
  }

  const live={
    mode:'song',instrument:'guitar',keys:new Map(),stops:new Map(),guitarChord:'Em',bassFret:0,bassLayout:'twohand',electricProgram:27,
    chordKeys:{KeyA:'Em',KeyS:'C',KeyD:'G',KeyF:'D'},
    pianoMap:{KeyA:0,KeyW:1,KeyS:2,KeyE:3,KeyD:4,KeyF:5,KeyT:6,KeyG:7,KeyY:8,KeyH:9,KeyU:10,KeyJ:11,KeyK:12,KeyO:13,KeyL:14,KeyP:15,Semicolon:16},
    chordNotes:{
      Em:[40,47,52,55,59,64],
      C:[48,52,55,60,64],
      G:[43,47,50,55,59,67],
      D:[50,57,62,66]
    },
    tone:{
      guitar:{instrument:'acoustic_guitar_steel',pan:0,volume:86},
      electric:{instrument:'electric_guitar_clean',pan:0,volume:82},
      bass:{instrument:'electric_bass_finger',pan:0,volume:91},
      lower:{instrument:'acoustic_grand_piano',pan:0,volume:82},
      upper:{instrument:'synth_brass_2',pan:0,volume:76}
    }
  };
  const liveOriginal={
    guitars:guitarInstances.map(g=>({position:g.position.clone(),rotation:g.rotation.clone(),scale:g.scale.clone()})),
    bass:{position:bass.position.clone(),rotation:bass.rotation.clone(),scale:bass.scale.clone()},
    modelPos:model.root.position.clone(),
    drums:{position:drumModel.root.position.clone(),rotation:drumModel.root.rotation.clone(),scale:drumModel.root.scale.clone()},
    electrics:electricModels.map(m=>({position:m.root.position.clone(),rotation:m.root.rotation.clone(),scale:m.root.scale.clone()}))
  };

  function liveMapHtml(){
    if(live.mode!=='free')return '<strong>曲库模式</strong> · 选择曲目后点击「开始演奏」。切换到自由演奏即可用电脑键盘直接控制单件乐器。';
    if(live.instrument==='electric')return '<strong>电吉他</strong> · <span class="hot">左手和弦</span> <kbd>A</kbd>Em <kbd>S</kbd>C <kbd>D</kbd>G <kbd>F</kbd>D · <span class="hot">右手</span> <kbd>J</kbd>↓扫 <kbd>K</kbd>↑扫 <kbd>U</kbd><kbd>I</kbd><kbd>O</kbd><kbd>P</kbd>单音 · <kbd>Space</kbd>制音';
    if(live.instrument==='guitar')return '<strong>木吉他</strong> · <span class="hot">左手和弦</span> <kbd>A</kbd>Em <kbd>S</kbd>C <kbd>D</kbd>G <kbd>F</kbd>D · <span class="hot">右手</span> <kbd>J</kbd>↓扫 <kbd>K</kbd>↑扫 <kbd>U</kbd><kbd>I</kbd><kbd>O</kbd><kbd>P</kbd>单弦 · <kbd>L</kbd>闷音↓ <kbd>;</kbd>闷音↑ · <kbd>Space</kbd>制音';
    if(live.instrument==='drums'){
      const note=DRUM_CODE_TO_NOTE[e.code];if(note===undefined)return false;
      playDrumSample(note,108);drumController.noteOn(drumVisualNote(note),108);bp.now.textContent='Drums · '+drumDisplay(note);markChanged();return true;
    }
    if(live.instrument==='bass'){
      if(live.bassLayout==='chromatic')return '<strong>Bass · 类钢琴</strong> · 连续半音：<kbd>A</kbd>E1 <kbd>W</kbd>F1 <kbd>S</kbd>F♯1 <kbd>E</kbd>G1 … <kbd>P</kbd>G2 · 每个按键就是一个音，最容易上手。';
      return '<strong>Bass · 双手</strong> · <span class="hot">左手品位</span> <kbd>A</kbd>0 <kbd>S</kbd>1 <kbd>D</kbd>2 <kbd>F</kbd>3 <kbd>G</kbd>4 · <span class="hot">右手拨弦</span> <kbd>J</kbd>E <kbd>K</kbd>A <kbd>L</kbd>D <kbd>;</kbd>G。';
    }
    if(live.instrument==='drums')return '<strong>架子鼓</strong> · <kbd>A</kbd>底鼓 <kbd>S</kbd>军鼓 <kbd>D</kbd>闭镲 <kbd>F</kbd>开镲 <kbd>J</kbd>高通 <kbd>K</kbd>中通 <kbd>L</kbd>落地 <kbd>Q</kbd>/<kbd>W</kbd>Crash <kbd>E</kbd>Ride <kbd>T</kbd>Splash';
    if(live.instrument==='lower')return '<strong>88 键 Stage Piano</strong> · <kbd>A</kbd>C4 <kbd>W</kbd>C♯4 <kbd>S</kbd>D4 … <kbd>;</kbd>E5 · <kbd>Space</kbd>延音踏板。';
    return '<strong>61 键 Synth</strong> · <kbd>A</kbd>C4 <kbd>W</kbd>C♯4 <kbd>S</kbd>D4 … <kbd>;</kbd>E5 · <kbd>Space</kbd>延音踏板。';
  }
  function updateBassLayoutUi(){
    const practiceBass=live.mode==='practice'&&practice?.target?.role==='bass';
    const relevant=(live.mode==='free'&&live.instrument==='bass')||practiceBass;
    bp.bassLayout.classList.toggle('on',relevant);bp.bassLayout.disabled=!relevant;
    if(!relevant)return;
    if(practiceBass){
      const canTwo=targetSupportsTwoHand(practice.target);
      bp.bassLayout.innerHTML=(canTwo?'<option value="twohand">Bass 映射 · 双手：品位 + 弦</option>':'')+'<option value="chromatic">Bass 映射 · 类钢琴：连续半音</option>';
      if(!canTwo)live.bassLayout='chromatic';
    }else{
      bp.bassLayout.innerHTML='<option value="twohand">Bass 映射 · 双手：品位 + 弦</option><option value="chromatic">Bass 映射 · 类钢琴：连续半音</option>';
    }
    bp.bassLayout.value=live.bassLayout;
  }
  function changeBassLayout(value){
    if(value!=='twohand'&&value!=='chromatic')return;
    if(practice?.running)practiceStop(true);if(live.mode==='free')liveStopAll();
    live.bassLayout=value;live.bassFret=0;if(practice)practice.selectedFret=0;
    updateBassLayoutUi();
    if(live.mode==='free')bp.map.innerHTML=liveMapHtml();
    if(live.mode==='practice'){updatePracticeLayoutUi();resetPracticeScore();renderPracticeLane(-practice.countIn);refreshPracticeMeta();}
    stage.focus({preventScroll:true});markChanged();
  }

  function updateLiveUi(){
    bp.instrument.disabled=live.mode!=='free';
    bp.song.disabled=live.mode!=='song';
    bp.play.disabled=live.mode==='free';
    bp.restart.disabled=live.mode==='free';
    bp.freebadge.classList.toggle('on',live.mode==='free');
    bp.map.innerHTML=liveMapHtml();
    updateBassLayoutUi();
    const electricRelevant=live.mode==='free'&&live.instrument==='electric';
    bp.electricMode.classList.toggle('on',electricRelevant);bp.electricMode.disabled=!electricRelevant;bp.electricMode.value=String(live.electricProgram);
    if(live.mode==='free'){
      bp.title.textContent='自由演奏 · '+({guitar:'木吉他',electric:'电吉他',bass:'Bass',lower:'Stage Piano',upper:'Synth',drums:'架子鼓'}[live.instrument]);
      bp.sub.textContent='电脑键盘 → 乐器控制器 → 3D 动画 + MusyngKite SoundFont';
      bp.now.textContent='点击舞台或直接按键开始演奏';
    }
  }
  function restoreSongStage(){
    guitarInstances.forEach((g,i)=>{
      const o=liveOriginal.guitars[i];g.position.copy(o.position);g.rotation.copy(o.rotation);g.scale.copy(o.scale);
    });
    bass.position.copy(liveOriginal.bass.position);bass.rotation.copy(liveOriginal.bass.rotation);bass.scale.copy(liveOriginal.bass.scale);
    model.root.position.copy(liveOriginal.modelPos);drumModel.root.position.copy(liveOriginal.drums.position);drumModel.root.rotation.copy(liveOriginal.drums.rotation);drumModel.root.scale.copy(liveOriginal.drums.scale);electricModels.forEach((m,i)=>{const o=liveOriginal.electrics[i];m.root.position.copy(o.position);m.root.rotation.copy(o.rotation);m.root.scale.copy(o.scale);});
    renderSongMeta();
  }
  function focusLiveInstrument(){
    guitarInstances.forEach(g=>g.visible=false);bass.visible=false;model.root.visible=false;drumModel.root.visible=false;electricModels.forEach(m=>m.root.visible=false);
    if(live.instrument==='guitar'){
      const g=guitarInstances[0];g.visible=true;g.position.set(0,4.25,.35);g.rotation.set(0,.02,0);g.scale.setScalar(.75);
      Object.assign(presets.whole,{target:V(0,4.55,.55),yaw:.10,pitch:.20,height:10.4,width:13.8});
    }else if(live.instrument==='electric'){
      const em=electricModels[0];em.root.visible=true;em.root.position.set(0,2.55,.25);em.root.rotation.set(0,-.05,0);em.root.scale.setScalar(.72);
      applyElectricProgram(0,live.electricProgram,true);
      Object.assign(presets.whole,{target:V(.05,3.35,.25),yaw:-.14,pitch:.14,height:8.2,width:8.4});
    }else if(live.instrument==='bass'){
      bass.visible=true;bass.position.set(0,4.20,.40);bass.rotation.set(0,-.02,0);bass.scale.setScalar(.70);
      Object.assign(presets.whole,{target:V(0,4.8,.45),yaw:.08,pitch:.22,height:11.0,width:14.0});
    }else if(live.instrument==='drums'){
      drumModel.root.visible=true;drumModel.root.position.set(0,0,-.55);drumModel.root.rotation.set(0,.02,0);drumModel.root.scale.setScalar(1.34);
      Object.assign(presets.whole,{target:V(0,1.72,-.55),yaw:.34,pitch:.34,height:5.6,width:8.9});
    }else{
      model.root.visible=true;model.root.position.set(0,0,-2.35);
      if(live.instrument==='lower')Object.assign(presets.whole,{target:V(.05,8.04,-2.45),yaw:.05,pitch:.32,height:4.8,width:14.9});
      else Object.assign(presets.whole,{target:V(0,10.38,-3.48),yaw:.16,pitch:.64,height:4.9,width:11.9});
    }
    selectPreset('whole',true);markChanged();
  }
  async function ensureLiveSf(){
    const cfg=live.tone[live.instrument],key=sfKey(cfg);
    await ensureSoundfontCtor();
    if(!sfCache.has(key)){
      const sf=SoundfontCtor(bandAC,{instrument:cfg.instrument,kit:'MusyngKite',pan:cfg.pan||0});
      sf.output.volume=cfg.volume??80;sfCache.set(key,sf);bp.now.textContent='正在加载 '+cfg.instrument+'…';
      await sf.ready;
    }
    return sfCache.get(key);
  }
  function liveStopAll(){
    clearKeyboardStrikeActions('live:');
    for(const stop of live.stops.values())try{stop()}catch{}
    live.stops.clear();live.keys.clear();
    const cfg=live.tone[live.instrument],sf=cfg?sfCache.get(sfKey(cfg)):null;if(sf)try{sf.stop()}catch{}
    stopDrumVoices();drumController.panic();electricControllers.forEach(c=>c.api.panic());controller.clearSources('live:');controller.pedal('sustain',false,'live:pedal');resetBandStrings();
  }
  function liveStartNote(note,velocity=105,code='note',role=live.instrument,duration){
    ensureLiveSf().then(sf=>{
      if(live.mode!=='free'||role!==live.instrument)return;
      const id='live:'+code;

      if(role==='lower'||role==='upper'){
        const pressAt=bandAC.currentTime;
        const strikeAt=pressAt+keyboardDownDuration(velocity,id);
        const opts={note,velocity,stopId:id,time:strikeAt};
        if(duration!=null)opts.duration=duration;
        const stop=sf.start(opts);if(typeof stop==='function')live.stops.set(code,stop);
        controller.press(note,velocity,role,id,pressAt);
      }else{
        const opts={note,velocity,stopId:id};
        if(duration!=null)opts.duration=duration;
        const stop=sf.start(opts);if(typeof stop==='function')live.stops.set(code,stop);
        if(role==='guitar')triggerGuitar({n:note,v:velocity,x:0});
        else if(role==='electric'){applyElectricProgram(0,live.electricProgram);electricControllers[0].api.noteOn(note,velocity);}
        else if(role==='bass')triggerBass({n:note,v:velocity});
      }
      markChanged();
    }).catch(err=>{console.error(err);bp.now.textContent='音色加载失败 · 请联网';});
  }
  function liveStopNote(code,note,role=live.instrument){
    const id='live:'+code;
    keyboardStrikeActions.delete(id);
    const stop=live.stops.get(code);if(stop){try{stop()}catch{}live.stops.delete(code);}
    if(role==='lower'||role==='upper')controller.release(note,role,id);else if(role==='electric')electricControllers[0].api.noteOff(note);
  }
  function guitarChordNotes(){return live.chordNotes[live.guitarChord]||live.chordNotes.Em;}
  function guitarStrum(up=false,muted=false){
    ensureLiveSf().then(sf=>{
      if(live.mode!=='free'||live.instrument!=='guitar')return;
      const notes=guitarChordNotes().slice();if(up)notes.reverse();
      const now=bandAC.currentTime+.012;
      notes.forEach((note,i)=>{
        const v=muted?66:94+(i%3)*5,delay=i*(muted?.012:.021),dur=muted?.12:1.55;
        sf.start({note,velocity:v,time:now+delay,duration:dur});
        setTimeout(()=>{if(live.mode==='free'&&live.instrument==='guitar')triggerGuitar({n:note,v,x:0});},Math.max(0,delay*1000));
      });
      bp.now.textContent=live.guitarChord+' · '+(muted?'闷音 ':'')+(up?'↑ 上扫':'↓ 下扫');
    }).catch(console.error);
  }
  function guitarPick(slot,code){
    const notes=guitarChordNotes(),idx=Math.max(0,notes.length-4+slot),note=notes[Math.min(notes.length-1,idx)];
    liveStartNote(note,92,code,'guitar',.75);bp.now.textContent=live.guitarChord+' · '+midiName(note);
  }
  const electricChordFrets={
    Em:[0,2,2,0,0,0],C:[null,3,2,0,1,0],G:[3,2,0,0,0,3],D:[null,null,0,2,3,2]
  };
  function electricStrum(up=false){
    ensureLiveSf().then(sf=>{
      if(live.mode!=='free'||live.instrument!=='electric')return;
      const frets=electricChordFrets[live.guitarChord]||electricChordFrets.Em;
      const notes=guitarChordNotes().slice();if(up)notes.reverse();
      const now=bandAC.currentTime+.010;
      notes.forEach((note,i)=>sf.start({note,velocity:96-i*2,time:now+i*.020,duration:1.75}));
      applyElectricProgram(0,live.electricProgram);electricControllers[0].api.strum(frets,100,up?'up':'down');
      bp.now.textContent='电吉他 · '+live.guitarChord+' · '+(up?'↑ 上扫':'↓ 下扫');
    }).catch(console.error);
  }
  function electricPick(slot,code){
    const notes=guitarChordNotes(),idx=Math.max(0,notes.length-4+slot),note=notes[Math.min(notes.length-1,idx)];
    liveStartNote(note,96,code,'electric',1.0);bp.now.textContent='电吉他 · '+live.guitarChord+' · '+midiName(note);
  }
  function enterFreeMode(){
    if(practice.running)practiceStop(true);bp.practice.classList.remove('on');
    if(transport.playing)stopBand(true);
    liveStopAll();live.mode='free';focusLiveInstrument();updateLiveUi();
    ensureLiveSf().then(()=>{if(live.mode==='free')bp.now.textContent='音色就绪 · 开始弹吧';}).catch(()=>{});
    stage.focus({preventScroll:true});
  }
  function leaveFreeMode(){
    liveStopAll();bp.practice.classList.remove('on');live.mode='song';restoreSongStage();updateLiveUi();
  }
  function changeLiveInstrument(id){
    if(!live.tone[id]&&id!=='drums')return;
    liveStopAll();live.instrument=id;focusLiveInstrument();updateLiveUi();
    const ready=id==='drums'?ensureDrumBuffers():ensureLiveSf();
    ready.then(()=>{if(live.mode==='free')bp.now.textContent='音色就绪 · 开始弹吧';}).catch(()=>{});
    stage.focus({preventScroll:true});
  }

  function handleLiveKeyDown(e){
    if(live.mode!=='free'||e.ctrlKey||e.altKey||e.metaKey)return false;
    if(['SELECT','INPUT','BUTTON'].includes(document.activeElement?.tagName))return false;
    if(e.repeat && live.instrument!=='guitar'&&live.instrument!=='electric')return true;
    if(live.instrument==='electric'){
      if(live.chordKeys[e.code]){
        live.guitarChord=live.chordKeys[e.code];bp.now.textContent='电吉他左手 · '+live.guitarChord;bp.map.innerHTML=liveMapHtml();return true;
      }
      if(e.code==='KeyJ'){if(!e.repeat)electricStrum(false);return true;}
      if(e.code==='KeyK'){if(!e.repeat)electricStrum(true);return true;}
      const picks={KeyU:0,KeyI:1,KeyO:2,KeyP:3};
      if(picks[e.code]!==undefined){if(!e.repeat)electricPick(picks[e.code],e.code);return true;}
      if(e.code==='Space'){electricControllers[0].api.allNotesOff();bp.now.textContent='电吉他 · 制音';return true;}
      return false;
    }
    if(live.instrument==='guitar'){
      if(live.chordKeys[e.code]){
        live.guitarChord=live.chordKeys[e.code];bp.now.textContent='左手 · '+live.guitarChord;bp.map.innerHTML=liveMapHtml();return true;
      }
      if(e.code==='KeyJ'){if(!e.repeat)guitarStrum(false,false);return true;}
      if(e.code==='KeyK'){if(!e.repeat)guitarStrum(true,false);return true;}
      if(e.code==='KeyL'){if(!e.repeat)guitarStrum(false,true);return true;}
      if(e.code==='Semicolon'){if(!e.repeat)guitarStrum(true,true);return true;}
      const picks={KeyU:0,KeyI:1,KeyO:2,KeyP:3};
      if(picks[e.code]!==undefined){if(!e.repeat)guitarPick(picks[e.code],e.code);return true;}
      if(e.code==='Space'){liveStopAll();bp.now.textContent='制音';return true;}
      return false;
    }
    if(live.instrument==='bass'){
      if(live.bassLayout==='chromatic'){
        const note=bassChromaticMap[e.code];
        if(note===undefined)return false;
        if(live.keys.has(e.code))return true;
        live.keys.set(e.code,{note,role:'bass'});
        liveStartNote(note,108,e.code,'bass');
        bp.now.textContent='Bass · '+bassChromaticKey(note)+' · '+midiName(note);
        return true;
      }

      const fretKeys={KeyA:0,KeyS:1,KeyD:2,KeyF:3,KeyG:4};
      const stringKeys={KeyJ:0,KeyK:1,KeyL:2,Semicolon:3};
      if(fretKeys[e.code]!==undefined){
        live.bassFret=fretKeys[e.code];
        bp.now.textContent='左手 · '+live.bassFret+' 品';
        return true;
      }
      if(stringKeys[e.code]!==undefined){
        if(live.keys.has(e.code))return true;
        const tunings=[28,33,38,43],si=stringKeys[e.code],note=tunings[si]+live.bassFret;
        live.keys.set(e.code,{note,role:'bass'});
        liveStartNote(note,108,e.code,'bass');
        bp.now.textContent='Bass · '+['E','A','D','G'][si]+'弦 '+live.bassFret+'品 · '+midiName(note);
        return true;
      }
      return false;
    }
    const semitone=live.pianoMap[e.code];
    if(semitone!==undefined){
      if(live.keys.has(e.code))return true;
      const base=60,note=base+semitone;
      live.keys.set(e.code,{note,role:live.instrument});
      liveStartNote(note,104,e.code,live.instrument);
      bp.now.textContent=({bass:'Bass',lower:'Piano',upper:'Synth'}[live.instrument])+' · '+midiName(note);return true;
    }
    if(e.code==='Space'&&(live.instrument==='lower'||live.instrument==='upper')){
      controller.pedal('sustain',true,'live:pedal');return true;
    }
    return false;
  }
  function handleLiveKeyUp(e){
    if(live.mode!=='free')return false;
    const k=live.keys.get(e.code);
    if(k){liveStopNote(e.code,k.note,k.role);live.keys.delete(e.code);return true;}
    if(e.code==='Space'&&(live.instrument==='lower'||live.instrument==='upper')){
      controller.pedal('sustain',false,'live:pedal');return true;
    }
    return false;
  }
  stage.addEventListener('keydown',e=>{if(handleLiveKeyDown(e)){e.preventDefault();e.stopImmediatePropagation();markChanged();}},true);
  window.addEventListener('keyup',e=>{if(handleLiveKeyUp(e)){e.preventDefault();e.stopImmediatePropagation();markChanged();}},true);
  window.addEventListener('blur',()=>{if(live.mode==='free')liveStopAll();},true);


  // ---------------- GENERIC SONG / INSTRUMENT PRACTICE ----------------
  const practice={
    running:false,speed:.40,judgeMode:'assist',selectedFret:0,countIn:2,
    startAudio:0,raf:0,lastDraw:0,hit:new Set(),miss:new Set(),
    score:0,combo:0,bestCombo:0,hits:0,misses:0,missCursor:0,held:new Map(),stops:new Map(),uiDirty:false,uiRaf:0,lastUiFlush:0,pendingJudge:'',
    scheduledStops:new Set(),clickNodes:new Set(),songId:'wish',targetKey:null,
    target:null,notes:[],groups:[],chromaticBase:48
  };
  const pr={
    target:document.getElementById('pr-target'),speed:document.getElementById('pr-speed'),
    judgeMode:document.getElementById('pr-judge-mode'),start:document.getElementById('pr-start'),
    acc:document.getElementById('pr-acc'),combo:document.getElementById('pr-combo'),
    current:document.getElementById('pr-current'),tempo:document.getElementById('pr-tempo'),
    judge:document.getElementById('pr-judge'),judgeNote:document.getElementById('pr-judge-note'),
    window:document.getElementById('pr-window'),stringTrack:document.getElementById('pr-string-track'),
    noteTrack:document.getElementById('pr-note-track'),canvas:document.getElementById('pr-canvas'),
    nowKey:document.getElementById('pr-now-key'),
    nowText:document.getElementById('pr-now-text'),nextKey:document.getElementById('pr-next-key'),
    nextText:document.getElementById('pr-next-text'),leftLabel:document.getElementById('pr-left-label'),
    rightLabel:document.getElementById('pr-right-label'),layoutDesc:document.getElementById('pr-layout-desc'),
    help:document.getElementById('pr-help'),twohandKeys:document.getElementById('pr-twohand-keys'),
    chromaticKeys:document.getElementById('pr-chromatic-keys'),
    chromaticRow:document.getElementById('pr-chromatic-row'),songTitle:document.getElementById('pr-song-title')
  };

  const practiceFretKeys={KeyA:0,KeyS:1,KeyD:2,KeyF:3,KeyG:4};
  const practiceFretLabels=['A','S','D','F','G'];
  const practiceStringKeys={KeyJ:0,KeyK:1,KeyL:2,Semicolon:3};
  const practiceStringLabels=['J','K','L',';'];
  const practiceTunings=[28,33,38,43];
  const practiceStringNames=['E','A','D','G'];

  // Two-row "virtual piano": 34 consecutive semitones.
  const chromaticCodes=[
    'KeyZ','KeyS','KeyX','KeyD','KeyC','KeyV','KeyG','KeyB','KeyH','KeyN','KeyJ','KeyM','Comma','KeyL','Period','Semicolon','Slash',
    'KeyQ','Digit2','KeyW','Digit3','KeyE','KeyR','Digit5','KeyT','Digit6','KeyY','Digit7','KeyU','KeyI','Digit9','KeyO','Digit0','KeyP'
  ];
  const chromaticLabels=['Z','S','X','D','C','V','G','B','H','N','J','M',',','L','.',';','/','Q','2','W','3','E','R','5','T','6','Y','7','U','I','9','O','0','P'];
  const chromaticIndex=Object.fromEntries(chromaticCodes.map((c,i)=>[c,i]));

  function songBpm(song){
    const m=String(song.bpm).match(/[\d.]+/);return m?Number(m[0]):120;
  }
  function cancelStopSet(set){
    for(const stop of set){try{if(typeof stop==='function')stop();}catch{}}
    set.clear();
  }
  function cancelPracticeClicks(){
    for(const node of practice.clickNodes){try{node.stop(bandAC?.currentTime||0);}catch{}try{node.disconnect();}catch{}}
    practice.clickNodes.clear();
  }
  function targetMatchesEvent(target,ev){
    if(!target)return false;
    if(target.role!==ev.i)return false;
    return target.role!=='guitar'||target.x===ev.x;
  }
  function bassFirstPosition(note){
    const candidates=[];
    for(let s=0;s<practiceTunings.length;s++){
      const fret=note-practiceTunings[s];
      if(fret>=0&&fret<=4)candidates.push({string:s,fret});
    }
    if(!candidates.length)return null;
    candidates.sort((a,b)=>a.fret-b.fret||b.string-a.string);
    return candidates[0];
  }
  function collapseBassEvents(events){
    const byStart=new Map();
    for(const ev of events){
      const k=Math.round(ev.s*1000);
      const prev=byStart.get(k);
      if(!prev||ev.n<prev.n)byStart.set(k,ev);
    }
    return [...byStart.values()].sort((a,b)=>a.s-b.s);
  }
  function buildPracticeTargets(songId){
    const song=SONGS[songId],targets=[];
    const guitarXs=[...new Set(song.events.filter(e=>e.i==='guitar').map(e=>e.x))].sort((a,b)=>a-b);
    for(const x of guitarXs){
      const events=song.events.filter(e=>e.i==='guitar'&&e.x===x);
      if(events.length)targets.push({key:'guitar:'+x,role:'guitar',x,label:'木吉他 '+(x+1),events});
    }
    const electricXs=[...new Set(song.events.filter(e=>e.i==='electric').map(e=>e.x|0))].sort((a,b)=>a-b);
    for(const x of electricXs){
      const events=song.events.filter(e=>e.i==='electric'&&(e.x|0)===x);
      if(events.length)targets.push({key:'electric:'+x,role:'electric',x,label:'电吉他 '+(x+1),events});
    }
    for(const role of ['bass','lower','upper','drums']){
      let events=song.events.filter(e=>e.i===role);
      if(!events.length)continue;
      if(role==='bass')events=collapseBassEvents(events);
      const label=role==='bass'?'Bass':role==='lower'?'下层 88 键':role==='upper'?'上层 61 键':'架子鼓';
      targets.push({key:role,role,x:0,label,events});
    }
    return targets;
  }
  function buildPracticeNotes(target){
    const notes=target.events.map((ev,i)=>{
      const f=target.role==='bass'?bassFirstPosition(ev.n):null;
      return {...ev,pid:i,string:f?.string??null,fret:f?.fret??null};
    }).sort((a,b)=>a.s-b.s||a.n-b.n);

    const groups=[];
    for(const n of notes){
      const last=groups[groups.length-1];
      if(last&&Math.abs(last.s-n.s)<.006)last.notes.push(n);
      else groups.push({s:n.s,notes:[n]});
    }
    practice.notes=notes;practice.groups=groups;
    return notes;
  }
  function practiceUsesDrums(){return practice.target?.role==='drums';}
  function drumPracticeKey(note){const p=drumPart(note);return p?(DRUM_KEY_BY_PART[p]||'?'):'?';}
  function practiceNoteMatches(targetNote,inputNote){
    if(practiceUsesDrums())return drumPart(targetNote)===drumPart(inputNote);
    return targetNote===inputNote;
  }
  function practiceDisplayName(note){return practiceUsesDrums()?drumDisplay(note):midiName(note);}
  function targetSupportsTwoHand(target){
    return target?.role==='bass'&&practice.notes.length>0&&practice.notes.every(n=>n.string!=null&&n.fret!=null);
  }
  function chooseChromaticBase(){
    const ns=practice.notes.map(n=>n.n);if(!ns.length){practice.chromaticBase=48;return;}
    const min=Math.min(...ns),max=Math.max(...ns),first=practice.notes[0].n;
    if(max-min<=33)practice.chromaticBase=min;
    else practice.chromaticBase=Math.max(21,Math.floor((first-8)/12)*12);
    renderChromaticLegend();
  }
  function chromaticKeyFor(note){
    const i=note-practice.chromaticBase;
    if(i>=0&&i<chromaticLabels.length)return chromaticLabels[i];
    const delta=note-practice.chromaticBase;
    const shifts=delta<0?Math.ceil((-delta)/12):Math.ceil((delta-33)/12);
    return delta<0?'[×'+shifts:']×'+shifts;
  }
  function chromaticNoteForCode(code){
    const i=chromaticIndex[code];return i===undefined?null:practice.chromaticBase+i;
  }
  function renderChromaticLegend(){
    if(!pr.chromaticRow)return;
    const used=[...new Set(practice.notes.map(n=>n.n))]
      .filter(n=>n>=practice.chromaticBase&&n<practice.chromaticBase+34)
      .slice(0,14);
    pr.chromaticRow.innerHTML='<span>键盘</span>'+used.map(n=>`<div class="pr-keycap chroma-key"><b>${chromaticKeyFor(n)}</b>${midiName(n)}</div>`).join('');
  }
  function practiceUsesTwoHand(){
    return practice.target?.role==='bass'&&live.bassLayout==='twohand'&&targetSupportsTwoHand(practice.target);
  }
  function updatePracticeLayoutUi(){
    const drums=practiceUsesDrums(),two=practiceUsesTwoHand();
    pr.leftLabel.textContent=drums?'鼓件':two?'左手':'音高';
    pr.rightLabel.textContent=drums?'按键':two?'右手':'按键';
    pr.twohandKeys.classList.toggle('on',two);
    pr.chromaticKeys.classList.toggle('on',!two);
    if(drums){
      pr.chromaticRow.innerHTML='<span>鼓键</span>'+Object.entries(DRUM_CODE_TO_NOTE).map(([code,n])=>`<div class="pr-keycap chroma-key"><b>${code.replace('Key','')}</b>${drumDisplay(n)}</div>`).join('');
    }else if(!two)renderChromaticLegend();

    if(practice.target?.role==='bass'){
      const canTwo=targetSupportsTwoHand(practice.target);
      bp.bassLayout.classList.add('on');bp.bassLayout.disabled=false;
      bp.bassLayout.innerHTML=(canTwo
        ?'<option value="twohand">Bass 映射 · 双手：品位 + 弦</option>'
        :'')+'<option value="chromatic">Bass 映射 · 类钢琴：连续半音</option>';
      if(!canTwo)live.bassLayout='chromatic';
      bp.bassLayout.value=live.bassLayout;
    }else{
      bp.bassLayout.classList.remove('on');bp.bassLayout.disabled=true;
    }

    const bpm=songBpm(SONGS[practice.songId]);
    pr.layoutDesc.textContent=(drums?'鼓件映射 · GM Percussion':two?'双手映射 · 左手品位 + 右手拨弦':'类钢琴映射 · 连续半音键盘')+' · 原速 '+Math.round(bpm)+' BPM';
    pr.help.textContent=drums
      ?'架子鼓：A 底鼓、S 军鼓、D 闭镲、F 开镲、J/K/L 三组通鼓、Q/W Crash、E Ride、T Splash。练习时自动静音原鼓轨。'
      :two?'双手映射：A/S/D/F/G 选择 0–4 品，J/K/L/; 拨 E/A/D/G 四根弦。该轨全部音符都能在第一把位完成。'
      :'类钢琴映射：两排键盘覆盖 34 个连续半音；[ / ] 可整体降 / 升一个八度。谱面 NOW / NEXT 会直接显示该按哪个电脑键。';
  }
  function populatePracticeTargets(preferKey=null){
    const targets=buildPracticeTargets(practice.songId);
    pr.target.innerHTML=targets.map(t=>`<option value="${t.key}">${t.label} · ${t.events.length} notes</option>`).join('');
    let target=targets.find(t=>t.key===preferKey)||targets[0]||null;
    practice.target=target;practice.targetKey=target?.key||null;
    if(target)pr.target.value=target.key;
    buildPracticeNotes(target||{events:[],role:'lower'});
    chooseChromaticBase();
    updatePracticeLayoutUi();
    resetPracticeScore();
    focusPracticeInstrument();
  }
  function updatePracticeSpeedLabels(){
    const bpm=songBpm(SONGS[practice.songId]);
    for(const opt of pr.speed.options){
      const factor=Number(opt.value);
      const suffix=factor===.4?' · 超慢':factor===.5?' · 入门':factor===1?' · 原速':'';
      opt.textContent=Math.round(bpm*factor)+' BPM'+suffix;
    }
    pr.tempo.textContent='· '+Math.round(bpm*(Number(pr.speed.value)||.4))+' BPM';
  }
  // Canvas practice highway:
  // one canvas, zero moving DOM nodes, zero layout/reflow while notes scroll.
  const practiceCanvas={
    ctx:null,dpr:1,w:0,h:92,lastCurrentToken:'',lastNextToken:''
  };
  function resizePracticeCanvas(){
    if(!pr.canvas)return;
    const rect=pr.canvas.getBoundingClientRect();
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(320,Math.round(rect.width));
    const h=92;
    if(practiceCanvas.w!==w||practiceCanvas.dpr!==dpr){
      practiceCanvas.w=w;practiceCanvas.h=h;practiceCanvas.dpr=dpr;
      pr.canvas.width=Math.round(w*dpr);pr.canvas.height=Math.round(h*dpr);
      pr.canvas.style.height=h+'px';
      practiceCanvas.ctx=pr.canvas.getContext('2d',{alpha:false,desynchronized:true});
      practiceCanvas.ctx.setTransform(dpr,0,0,dpr,0,0);
    }
  }
  function clearPracticeCanvas(){
    resizePracticeCanvas();
    const ctx=practiceCanvas.ctx;if(!ctx)return;
    ctx.fillStyle='#10191f';ctx.fillRect(0,0,practiceCanvas.w,practiceCanvas.h);
  }
  function lowerBoundTime(arr,time){
    let lo=0,hi=arr.length;
    while(lo<hi){
      const mid=(lo+hi)>>1;
      if(arr[mid].s<time)lo=mid+1;else hi=mid;
    }
    return lo;
  }
  function roundedRect(ctx,x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.roundRect(x,y,w,h,rr);
  }
  function drawPracticeChip(ctx,x,y,w,text,state,kind){
    const h=28;
    if(state==='hit'){ctx.fillStyle='#20392a';ctx.strokeStyle='#6d9d72';}
    else if(state==='miss'){ctx.fillStyle='#382326';ctx.strokeStyle='#9f6266';}
    else if(state==='current'){ctx.fillStyle='#4c3d23';ctx.strokeStyle='#c5a76c';}
    else{ctx.fillStyle=kind==='left'?'#22343b':'#1d2b31';ctx.strokeStyle='#4b6974';}
    roundedRect(ctx,x-w/2,y,w,h,7);ctx.fill();ctx.stroke();
    ctx.fillStyle=state==='current'?'#f5e7ca':'#e4ece9';
    ctx.font='600 11px system-ui,-apple-system,"Microsoft YaHei"';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(text,x,y+h/2);
  }
  function practiceGroupState(group,t,tol){
    let hit=0,miss=0;
    for(const n of group.notes){if(practice.hit.has(n.pid))hit++;if(practice.miss.has(n.pid))miss++;}
    if(hit===group.notes.length)return 'hit';
    if(miss>0&&hit+miss===group.notes.length)return 'miss';
    if(Math.abs(group.s-t)<=tol*.48)return 'current';
    return '';
  }
  function renderPracticeCanvas(t){
    resizePracticeCanvas();
    const ctx=practiceCanvas.ctx;if(!ctx)return;
    const W=practiceCanvas.w,H=practiceCanvas.h,labelW=47,hitX=labelW+58;
    const speed=Math.max(.01,practice.speed),pps=150,behindReal=.36,aheadReal=(W-hitX+30)/pps,tol=practiceTolerance();
    const drums=practiceUsesDrums(),two=practiceUsesTwoHand();

    // Background and lane separators.
    ctx.fillStyle='#10191f';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#151f24';ctx.fillRect(0,0,labelW,H);
    ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(labelW+.5,0);ctx.lineTo(labelW+.5,H);ctx.moveTo(0,46.5);ctx.lineTo(W,46.5);ctx.stroke();

    // Hit window + line.
    ctx.fillStyle='rgba(215,185,125,.055)';ctx.fillRect(hitX-26,0,52,H);
    ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(215,185,125,.25)';
    ctx.strokeRect(hitX-26+.5,.5,52-1,H-1);ctx.setLineDash([]);
    ctx.strokeStyle='rgba(239,216,170,.9)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(hitX+.5,2);ctx.lineTo(hitX+.5,H-2);ctx.stroke();

    // Lane labels.
    ctx.fillStyle='#849399';ctx.font='9px system-ui,-apple-system,"Microsoft YaHei"';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(drums?'鼓件':two?'左手':'音高',labelW/2,23);
    ctx.fillText(drums?'按键':two?'右手':'按键',labelW/2,69);

    let current=null,next=null;
    const scoreStart=t-behindReal*speed,scoreEnd=t+aheadReal*speed;
    let gi=Math.max(0,lowerBoundTime(practice.groups,scoreStart)-1);

    for(;gi<practice.groups.length;gi++){
      const group=practice.groups[gi];if(group.s>scoreEnd)break;
      const scoreDt=group.s-t,realDt=scoreDt/speed;
      if(realDt<-behindReal)continue;
      const pending=group.notes.some(n=>!practice.hit.has(n.pid)&&!practice.miss.has(n.pid));
      const stillDisplayable=group.s>=t-.09;
      if(!current&&stillDisplayable&&group.s>=t-tol*.35)current=group;
      else if(current&&!next&&pending&&group.s>current.s+.001)next=group;

      const x=hitX+realDt*pps,state=practiceGroupState(group,t,tol);
      if(drums){
        const left=group.notes.map(n=>drumDisplay(n.n)).join('+');
        const right=group.notes.map(n=>drumPracticeKey(n.n)).join('+');
        const w=Math.min(112,Math.max(42,Math.max(left.length,right.length)*7+20));
        drawPracticeChip(ctx,x,8,w,left,state,'left');drawPracticeChip(ctx,x,54,w,right,state,'right');
      }else if(two){
        const left=group.notes.map(n=>practiceFretLabels[n.fret]).join('+');
        const right=group.notes.map(n=>practiceStringLabels[n.string]).join('+');
        drawPracticeChip(ctx,x,8,42,left,state,'left');
        drawPracticeChip(ctx,x,54,42,right,state,'right');
      }else{
        const notes=group.notes.map(n=>midiName(n.n)).join('+');
        const keys=group.notes.map(n=>chromaticKeyFor(n.n)).join('+');
        const w=Math.min(112,Math.max(42,Math.max(notes.length,keys.length)*7+20));
        drawPracticeChip(ctx,x,8,w,notes,state,'left');
        drawPracticeChip(ctx,x,54,w,keys,state,'right');
      }
    }

    // NOW/NEXT DOM cards update only when the actual target changes.
    const currentToken=current?current.s+'|'+groupKeyText(current):'none';
    const nextToken=next?next.s+'|'+groupKeyText(next):'none';
    if(practiceCanvas.lastCurrentToken!==currentToken){
      practiceCanvas.lastCurrentToken=currentToken;
      pr.current.textContent=current?groupNoteText(current):'—';
      pr.nowKey.textContent=current?groupKeyText(current):'—';
      pr.nowText.textContent=current?groupNoteText(current):'等待目标';
    }
    if(practiceCanvas.lastNextToken!==nextToken){
      practiceCanvas.lastNextToken=nextToken;
      pr.nextKey.textContent=next?groupKeyText(next):'—';
      pr.nextText.textContent=next?groupNoteText(next):'—';
    }
  }
  clearPracticeCanvas();
  window.addEventListener('resize',()=>{practiceCanvas.w=0;clearPracticeCanvas();},{passive:true});

  function practiceTime(){
    if(!practice.running||!bandAC)return -practice.countIn;
    return (bandAC.currentTime-practice.startAudio)*practice.speed-practice.countIn;
  }
  function groupKeyText(group){
    if(!group)return '—';
    if(practiceUsesDrums())return group.notes.map(n=>drumPracticeKey(n.n)).join(' + ');
    if(practiceUsesTwoHand()){
      return group.notes.map(n=>practiceFretLabels[n.fret]+' + '+practiceStringLabels[n.string]).join(' · ');
    }
    return group.notes.map(n=>chromaticKeyFor(n.n)).join(' + ');
  }
  function groupNoteText(group){
    if(!group)return '—';
    if(practiceUsesDrums())return group.notes.map(n=>drumDisplay(n.n)).join(' + ');
    if(practiceUsesTwoHand()){
      return group.notes.map(n=>`${midiName(n.n)} · ${practiceStringNames[n.string]}弦 ${n.fret}品`).join(' / ');
    }
    return group.notes.map(n=>midiName(n.n)).join(' + ');
  }
  function resetPracticeScore(){
    practice.hit.clear();practice.miss.clear();practice.score=0;practice.combo=0;practice.bestCombo=0;practice.hits=0;practice.misses=0;practice.missCursor=0;practice.selectedFret=0;practice.uiDirty=false;practice.pendingJudge='';if(practice.uiRaf)cancelAnimationFrame(practice.uiRaf);practice.uiRaf=0;
    pr.acc.textContent='—';pr.combo.textContent='0';pr.judge.textContent='准备练习 · 点击开始';
    pr.current.textContent='等待开始';practiceCanvas.lastCurrentToken='';practiceCanvas.lastNextToken='';clearPracticeCanvas();
    pr.nowKey.textContent='—';pr.nowText.textContent='等待谱面';pr.nextKey.textContent='—';pr.nextText.textContent='—';
    document.querySelectorAll('.pr-keycap').forEach(k=>k.classList.remove('active'));
    document.querySelector('.pr-keycap.fret-key[data-fret="0"]')?.classList.add('active');
  }
  function flushPracticeUi(force=false){
    practice.uiRaf=0;
    if(!force&&!practice.uiDirty)return;
    const now=performance.now();
    // Scoreboard doesn't need to repaint at 60 Hz. 8 Hz is already visually instant,
    // but avoids a glass-panel repaint on every successful keystroke.
    if(!force&&now-practice.lastUiFlush<120){
      practice.uiRaf=requestAnimationFrame(()=>flushPracticeUi(false));
      return;
    }
    practice.lastUiFlush=now;practice.uiDirty=false;
    const judged=practice.hits+practice.misses;
    const acc=judged?Math.round(practice.score/judged*100)+'%':'—';
    const combo=String(practice.combo);
    if(pr.acc.textContent!==acc)pr.acc.textContent=acc;
    if(pr.combo.textContent!==combo)pr.combo.textContent=combo;
    if(practice.pendingJudge){
      pr.judge.textContent=practice.pendingJudge;
      practice.pendingJudge='';
      clearTimeout(pr.judge._t);
      pr.judge._t=setTimeout(()=>{if(practice.running)pr.judge.textContent='跟着命中线继续';},520);
    }
  }
  function schedulePracticeUi(){
    practice.uiDirty=true;
    if(!practice.uiRaf)practice.uiRaf=requestAnimationFrame(()=>flushPracticeUi(false));
  }
  function updatePracticeScore(){schedulePracticeUi();}
  function practiceTolerance(){return practice.judgeMode==='assist'?.33:.18;}
  function practiceGrade(absErr){
    if(practice.judgeMode==='assist'){
      if(absErr<=.09)return ['PERFECT',1];if(absErr<=.19)return ['GOOD',.82];return ['OK',.62];
    }
    if(absErr<=.055)return ['PERFECT',1];if(absErr<=.115)return ['GOOD',.82];return ['OK',.62];
  }
  function updatePracticeJudgeUI(){
    const tol=practiceTolerance();pr.judgeNote.textContent='约 ±'+tol.toFixed(2)+'s · LOW LATENCY';
    if(pr.window)pr.window.style.width=Math.max(34,tol*2*84)+'px';
  }
  function practiceSetJudge(text){
    practice.pendingJudge=text;
    schedulePracticeUi();
  }
  function practiceStopHeld(){
    clearKeyboardStrikeActions('practice:');
    for(const stop of practice.stops.values())try{stop()}catch{}
    practice.stops.clear();practice.held.clear();
    controller.clearSources('practice:');
  }
  function practiceStop(reset=true){
    practice.running=false;if(practice.raf)cancelAnimationFrame(practice.raf);practice.raf=0;
    cancelStopSet(practice.scheduledStops);cancelPracticeClicks();stopCurrentSoundfonts();practiceStopHeld();resetBandStrings();
    bp.play.textContent='▶ 开始练习';pr.start.textContent='▶ 开始练习';
    if(reset){
      resetPracticeScore();bp.progress.style.width='0%';
      bp.time.textContent='00:00 / '+fmtBand(SONGS[practice.songId].duration);
    }
  }
  function schedulePracticeClick(ctx,when,accent=false){
    const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=accent?1280:930;
    g.gain.setValueAtTime(.00001,when);g.gain.linearRampToValueAtTime(accent?.050:.028,when+.003);g.gain.exponentialRampToValueAtTime(.0001,when+.050);
    o.connect(g).connect(ctx.destination);o.start(when);o.stop(when+.060);practice.clickNodes.add(o);
    o.addEventListener?.('ended',()=>practice.clickNodes.delete(o),{once:true});
  }
  async function ensurePracticeSound(){
    const song=SONGS[practice.songId];await ensureSongSoundfonts(song);
    return song;
  }
  function schedulePracticeBacking(){
    const song=SONGS[practice.songId],start=bandAC.currentTime+.18;practice.startAudio=start;
    const speed=practice.speed,used=new Set();cancelStopSet(practice.scheduledStops);cancelPracticeClicks();
    for(const ev of song.events){
      if(targetMatchesEvent(practice.target,ev))continue;
      if(ev.i==='drums'){
        const stop=playDrumSample(ev.n,ev.v,start+(practice.countIn+ev.s)/speed);
        if(typeof stop==='function')practice.scheduledStops.add(stop);
        continue;
      }
      const sf=getSF(song,ev.tone);if(!sf)continue;used.add(sf);
      const dur=Math.max(.045,Math.min(ev.i==='lower'?5:4,(ev.e-ev.s)/speed));
      const stop=sf.start({note:ev.n,velocity:Math.max(1,Math.min(127,ev.v)),time:start+(practice.countIn+ev.s)/speed,duration:dur});
      if(typeof stop==='function')practice.scheduledStops.add(stop);
    }
    transport.currentSfs=used;
    const beat=60/songBpm(song);
    const totalBeats=Math.ceil((practice.countIn+song.duration)/beat);
    for(let i=0;i<totalBeats;i++)schedulePracticeClick(bandAC,start+i*(beat/speed),(i%4)===0);
  }

  function renderPracticeLane(t){renderPracticeCanvas(t);}
  function markPracticeMisses(t){
    const tol=practiceTolerance(),limit=t-tol-.055;
    while(practice.missCursor<practice.notes.length){
      const n=practice.notes[practice.missCursor];
      if(n.s>limit)break;
      if(!practice.hit.has(n.pid)&&!practice.miss.has(n.pid)){
        practice.miss.add(n.pid);practice.misses++;practice.combo=0;
        practice.pendingJudge='MISS · '+practiceDisplayName(n.n);schedulePracticeUi();
      }
      practice.missCursor++;
    }
  }
  function findPracticeMatch(note){
    if(!practice.running)return null;
    const t=practiceTime(),tol=practiceTolerance();
    let best=null,bestErr=999,nearest=null,nearestErr=999;
    let i=Math.max(0,lowerBoundTime(practice.notes,t-tol)-1);
    for(;i<practice.notes.length;i++){
      const n=practice.notes[i],d=n.s-t;
      if(d>tol)break;
      if(d<-tol||practice.hit.has(n.pid)||practice.miss.has(n.pid))continue;
      const a=Math.abs(d);
      if(a<nearestErr){nearestErr=a;nearest=n;}
      if(practiceNoteMatches(n.n,note)&&a<bestErr){bestErr=a;best=n;}
    }
    return {best,bestErr,nearest};
  }
  function practiceJudge(note){
    const found=findPracticeMatch(note);if(!found)return null;
    const {best,bestErr,nearest}=found;
    if(!best){
      if(practice.judgeMode==='assist'&&nearest){
        const g={s:nearest.s,notes:practice.notes.filter(n=>Math.abs(n.s-nearest.s)<.006&&!practice.hit.has(n.pid)&&!practice.miss.has(n.pid))};
        practiceSetJudge('需要 '+groupKeyText(g)+' · '+groupNoteText(g)+' · 还可以补救');
      }else{
        practiceSetJudge('WRONG · '+practiceDisplayName(note));if(practice.judgeMode==='standard')practice.combo=0;
      }
      updatePracticeScore();return null;
    }
    practice.hit.add(best.pid);practice.hits++;practice.combo++;practice.bestCombo=Math.max(practice.bestCombo,practice.combo);
    const [label,value]=practiceGrade(bestErr);practice.score+=value;
    const ms=Math.round((practiceTime()-best.s)*1000),timing=ms===0?'正中':ms<0?`早 ${Math.abs(ms)}ms`:`晚 ${ms}ms`;
    practiceSetJudge(label+' · '+midiName(note)+' · '+timing);updatePracticeScore();return best;
  }
  function practiceToneFor(note){
    const match=findPracticeMatch(note)?.best;
    return match?.tone||practice.target?.events?.[0]?.tone;
  }
  function practicePlayNote(code,note){
    if(practice.held.has(code)||!practice.running)return;
    const song=SONGS[practice.songId];
    const found=findPracticeMatch(note);
    const tone=found?.best?.tone||practice.target?.events?.[0]?.tone;
    const role=practice.target.role;
    const sf=role==='drums'?null:(tone?getSF(song,tone):null);
    if(role!=='drums'&&!sf){bp.now.textContent='练习音色尚未就绪';return;}
    if(role==='drums'&&!drumBuffers.size){bp.now.textContent='鼓组音色尚未就绪';return;}

    practice.held.set(code,note);
    try{
      const id='practice:'+code;

      if(role==='drums'){
        const stop=playDrumSample(note,108);
        if(typeof stop==='function')practice.stops.set(code,stop);
        drumController.noteOn(drumVisualNote(note),108);
      }else if(role==='lower'||role==='upper'){
        const pressAt=bandAC.currentTime;
        const strikeAt=pressAt+keyboardDownDuration(108,id);
        const stop=sf.start({note,velocity:108,stopId:id,time:strikeAt});
        if(typeof stop==='function')practice.stops.set(code,stop);
        controller.press(note,108,role,id,pressAt);
      }else{
        const stop=sf.start({note,velocity:108,stopId:id});
        if(typeof stop==='function')practice.stops.set(code,stop);
        if(role==='guitar')triggerGuitar({n:note,v:108,x:practice.target.x});
        else if(role==='electric'){
          const slot=Math.max(0,Math.min(electricControllers.length-1,practice.target.x|0));
          const program=electricProgramFromEvent(found?.best||practice.target.events[0]);applyElectricProgram(slot,program);
          electricControllers[slot].api.noteOn(note,108);
        }
        else if(role==='bass')triggerBass({n:note,v:108});
      }

      // Reuse the match found above instead of scanning the full score a second time.
      if(found?.best){
        const best=found.best,bestErr=found.bestErr;
        practice.hit.add(best.pid);practice.hits++;practice.combo++;
        practice.bestCombo=Math.max(practice.bestCombo,practice.combo);
        const [label,value]=practiceGrade(bestErr);practice.score+=value;
        const ms=Math.round((practiceTime()-best.s)*1000);
        const timing=ms===0?'正中':ms<0?`早 ${Math.abs(ms)}ms`:`晚 ${ms}ms`;
        practice.pendingJudge=label+' · '+practiceDisplayName(note)+' · '+timing;
        schedulePracticeUi();
      }else if(found?.nearest){
        if(practice.judgeMode==='assist'){
          const nearest=found.nearest;
          const g={s:nearest.s,notes:practice.notes.filter(n=>Math.abs(n.s-nearest.s)<.006&&!practice.hit.has(n.pid)&&!practice.miss.has(n.pid))};
          practiceSetJudge('需要 '+groupKeyText(g)+' · '+groupNoteText(g)+' · 还可以补救');
        }else{
          practiceSetJudge('WRONG · '+practiceDisplayName(note));practice.combo=0;updatePracticeScore();
        }
      }else{
        practiceSetJudge('WRONG · '+practiceDisplayName(note));
      }

      markChanged();
    }catch(err){console.error(err);practice.held.delete(code);bp.now.textContent='练习发声失败';}
  }
  function practiceReleaseNote(code){
    const id='practice:'+code;
    keyboardStrikeActions.delete(id);
    const stop=practice.stops.get(code);if(stop)try{stop()}catch{}
    practice.stops.delete(code);
    const note=practice.held.get(code),role=practice.target?.role;
    if(note!=null&&(role==='lower'||role==='upper'))controller.release(note,role,id);else if(note!=null&&role==='electric'){const slot=Math.max(0,Math.min(electricControllers.length-1,practice.target.x|0));electricControllers[slot].api.noteOff(note);}
    practice.held.delete(code);
  }
  function practiceTick(){
    if(!practice.running||!bandAC)return;
    const t=practiceTime(),song=SONGS[practice.songId];markPracticeMisses(t);
    renderPracticeLane(t);practice.lastDraw=performance.now();
    const shown=Math.max(0,Math.min(song.duration,t));bp.progress.style.width=(shown/song.duration*100).toFixed(2)+'%';bp.time.textContent=fmtBand(shown)+' / '+fmtBand(song.duration);
    const bpm=Math.round(songBpm(song)*practice.speed);
    if(t<0){const beat=60/songBpm(song),c=Math.max(1,Math.ceil(-t/beat));bp.now.textContent='预备 · '+c+' 拍';pr.judge.textContent='预备 · '+c;}
    else bp.now.textContent=practice.target.label+' Practice · '+bpm+' BPM';
    if(t>=song.duration+.35){
      practice.running=false;cancelStopSet(practice.scheduledStops);cancelPracticeClicks();practiceStopHeld();
      bp.play.textContent='▶ 再练一次';pr.start.textContent='▶ 再练一次';
      flushPracticeUi(true);bp.now.textContent='练习完成 · Best Combo '+practice.bestCombo;pr.judge.textContent='完成 · '+pr.acc.textContent+' · Best Combo '+practice.bestCombo;bp.progress.style.width='100%';return;
    }
    practice.raf=requestAnimationFrame(practiceTick);
  }
  async function startPractice(){
    if(practice.running){practiceStop(true);return;}
    stopBand(false);stopDemo();resetPracticeScore();
    practice.speed=Number(pr.speed.value)||.40;practice.judgeMode=pr.judgeMode.value||'assist';
    pr.tempo.textContent='· '+Math.round(songBpm(SONGS[practice.songId])*practice.speed)+' BPM';updatePracticeJudgeUI();
    bp.now.textContent='正在加载练习伴奏…';pr.start.disabled=true;
    try{await ensurePracticeSound();}catch{pr.start.disabled=false;return;}
    if(bandAC.state==='suspended')await bandAC.resume();
    schedulePracticeBacking();practice.running=true;practice.lastDraw=0;
    pr.start.disabled=false;pr.start.textContent='■ 停止';bp.now.textContent='4 拍预备';pr.judge.textContent='预备';
    stage.focus({preventScroll:true});practice.raf=requestAnimationFrame(practiceTick);markChanged();
  }
  function focusPracticeInstrument(){
    const target=practice.target;if(!target)return;
    guitarInstances.forEach(g=>g.visible=false);bass.visible=false;model.root.visible=false;drumModel.root.visible=false;
    if(target.role==='guitar'){
      const g=guitarInstances[target.x];if(g){g.visible=true;g.position.set(0,4.25,.35);g.rotation.set(0,.02,0);g.scale.setScalar(.75);}
      Object.assign(presets.whole,{target:V(0,4.55,.55),yaw:.10,pitch:.20,height:10.4,width:13.8});
    }else if(target.role==='electric'){
      const slot=Math.max(0,Math.min(electricModels.length-1,target.x|0)),em=electricModels[slot];
      electricModels.forEach(m=>m.root.visible=false);em.root.visible=true;em.root.position.set(-1.0,2.55,.35);em.root.rotation.set(0,-.04,0);em.root.scale.setScalar(.72);
      applyElectricProgram(slot,electricProgramFromEvent(target.events[0]),true);
      Object.assign(presets.whole,{target:V(-.8,3.35,.35),yaw:-.12,pitch:.14,height:8.2,width:8.5});
    }else if(target.role==='bass'){
      bass.visible=true;bass.position.set(-2.6,4.10,.20);bass.rotation.set(0,.03,0);bass.scale.setScalar(.72);
      Object.assign(presets.whole,{target:V(-2.1,4.85,.30),yaw:.08,pitch:.21,height:11.2,width:16.8});
    }else if(target.role==='drums'){
      drumModel.root.visible=true;drumModel.root.position.set(-1.25,0,-.55);drumModel.root.rotation.set(0,.12,0);drumModel.root.scale.setScalar(1.34);
      Object.assign(presets.whole,{target:V(-.8,1.72,-.55),yaw:.34,pitch:.34,height:5.6,width:9.3});
    }else{
      model.root.visible=true;model.root.position.set(0,0,-2.35);
      if(target.role==='lower')Object.assign(presets.whole,{target:V(.05,8.04,-2.45),yaw:.05,pitch:.32,height:4.8,width:14.9});
      else Object.assign(presets.whole,{target:V(0,10.38,-3.48),yaw:.16,pitch:.64,height:4.9,width:11.9});
    }
    selectPreset('whole',true);markChanged();
  }
  function refreshPracticeMeta(){
    const song=SONGS[practice.songId],target=practice.target;if(!target)return;
    pr.songTitle.textContent=song.artist+' · '+song.title+' · '+target.label;
    bp.title.textContent='曲目练习 · '+song.title;bp.sub.textContent=target.label+' · '+target.events.length+' MIDI events';
    bp.time.textContent='00:00 / '+fmtBand(song.duration);bp.progress.style.width='0%';
    updatePracticeSpeedLabels();updatePracticeLayoutUi();renderPracticeLane(-practice.countIn);
  }
  function enterPracticeMode(){
    if(transport.playing)stopBand(false);if(live.mode==='free')liveStopAll();practiceStop(true);
    live.mode='practice';practice.songId=currentSongId;bp.song.disabled=false;bp.instrument.disabled=true;
    bp.practice.classList.add('on');bp.freebadge.classList.add('on');bp.grid.style.display='none';bp.map.style.display='none';document.querySelector('.bp-actions').style.display='none';
    populatePracticeTargets();refreshPracticeMeta();pr.start.textContent='▶ 开始练习';focusPracticeInstrument();stage.focus({preventScroll:true});
  }
  function leavePracticeMode(){
    practiceStop(true);bp.practice.classList.remove('on');bp.freebadge.classList.remove('on');bp.grid.style.display='';bp.map.style.display='';document.querySelector('.bp-actions').style.display='';
    live.mode='song';currentSongId=practice.songId;bp.song.value=currentSongId;restoreSongStage();updateLiveUi();updateBassLayoutUi();
  }
  function changePracticeSong(id){
    if(!SONGS[id])return;practiceStop(true);practice.songId=id;currentSongId=id;populatePracticeTargets();refreshPracticeMeta();focusPracticeInstrument();
  }
  function changePracticeTarget(key){
    const targets=buildPracticeTargets(practice.songId),target=targets.find(t=>t.key===key)||targets[0];if(!target)return;
    practiceStop(true);practice.target=target;practice.targetKey=target.key;buildPracticeNotes(target);chooseChromaticBase();
    if(target.role!=='bass')live.bassLayout='chromatic';
    updatePracticeLayoutUi();resetPracticeScore();refreshPracticeMeta();focusPracticeInstrument();
  }
  function changePracticeOctave(delta){
    if(practiceUsesTwoHand())return;
    practice.chromaticBase=Math.max(0,Math.min(94,practice.chromaticBase+delta*12));renderChromaticLegend();renderPracticeLane(practice.running?practiceTime():-practice.countIn);
    pr.judge.textContent='键盘范围 · '+midiName(practice.chromaticBase)+' — '+midiName(practice.chromaticBase+33);
  }
  function handlePracticeKeyDown(e){
    if(live.mode!=='practice'||e.ctrlKey||e.altKey||e.metaKey)return false;
    if(['SELECT','INPUT','BUTTON'].includes(document.activeElement?.tagName))return false;
    if(e.repeat)return true;

    if(practiceUsesDrums()){
      const note=DRUM_CODE_TO_NOTE[e.code];if(note===undefined)return false;
      practicePlayNote(e.code,note);return true;
    }
    if(!practiceUsesTwoHand()&&(e.code==='BracketLeft'||e.code==='BracketRight')){
      changePracticeOctave(e.code==='BracketLeft'?-1:1);return true;
    }
    if(practiceUsesTwoHand()){
      if(practiceFretKeys[e.code]!==undefined){
        practice.selectedFret=practiceFretKeys[e.code];
        document.querySelectorAll('.pr-keycap.fret-key').forEach(k=>k.classList.toggle('active',Number(k.dataset.fret)===practice.selectedFret));
        pr.judge.textContent='左手 · '+practice.selectedFret+' 品';return true;
      }
      const si=practiceStringKeys[e.code];if(si===undefined)return false;
      const note=practiceTunings[si]+practice.selectedFret;practicePlayNote(e.code,note);return true;
    }
    const note=chromaticNoteForCode(e.code);if(note==null)return false;
    practicePlayNote(e.code,note);return true;
  }
  function handlePracticeKeyUp(e){
    if(live.mode!=='practice')return false;
    if(practice.held.has(e.code)){practiceReleaseNote(e.code);return true;}return false;
  }
  stage.addEventListener('keydown',e=>{if(handlePracticeKeyDown(e)){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('keyup',e=>{if(handlePracticeKeyUp(e)){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('blur',()=>{if(live.mode==='practice')practiceStopHeld();},true);

  pr.speed.addEventListener('change',()=>{practice.speed=Number(pr.speed.value)||.40;updatePracticeSpeedLabels();if(practice.running){practiceStop(true);startPractice();}});
  pr.judgeMode.addEventListener('change',()=>{practice.judgeMode=pr.judgeMode.value||'assist';updatePracticeJudgeUI();});
  pr.target.addEventListener('change',()=>changePracticeTarget(pr.target.value));
  pr.start.addEventListener('click',()=>startPractice());
  updatePracticeJudgeUI();

  function keyboardStrikeLead(velocity=100){
    return keyboardDownDuration(velocity,'song:');
  }
  function visualStartTime(ev){
    if(ev.i==='lower'||ev.i==='upper')return ev.s-keyboardStrikeLead(ev.v);
    return ev.s;
  }

  function renderSongMeta(){
    const song=SONGS[currentSongId];
    bp.title.textContent=song.artist+' · '+song.title;
    bp.sub.textContent=song.bpm+' BPM · '+song.subtitle;
    bp.grid.innerHTML=song.cards.map(c=>`<div class="bp-item"><span>${c[0]}</span><strong>${c[1]}</strong><small>${c[2]}</small></div>`).join('');
    bp.time.textContent='00:00 / '+fmtBand(song.duration);bp.progress.style.width='0%';
    keyboardOffs=song.events.filter(e=>e.i==='lower'||e.i==='upper'||e.i==='electric').map(e=>({t:e.ve??e.e,id:e.id})).sort((a,b)=>a.t-b.t);
    visualOns=song.events.filter(e=>e.i!=='drums').map(e=>({t:visualStartTime(e),id:e.id})).sort((a,b)=>a.t-b.t);
    drumOns=song.events.filter(e=>e.i==='drums').map(e=>({t:e.s,id:e.id})).sort((a,b)=>a.t-b.t);
    byId=new Map(song.events.map(e=>[e.id,e]));
    transport.onPtr=transport.drumPtr=transport.offPtr=transport.pedalPtr=0;transport.lastSongTime=0;
    const stage=song.stage;
    const hasDrums=song.events.some(e=>e.i==='drums'),hasBass=song.events.some(e=>e.i==='bass');
    const hasKeys=song.events.some(e=>e.i==='lower'||e.i==='upper'),hasElectric=song.events.some(e=>e.i==='electric');
    const guitarSlots=new Set(song.events.filter(e=>e.i==='guitar').map(e=>e.x|0));
    const electricSlots=new Set(song.events.filter(e=>e.i==='electric').map(e=>e.x|0));
    guitarInstances.forEach((g,i)=>g.visible=guitarSlots.has(i));
    electricModels.forEach((m,i)=>m.root.visible=electricSlots.has(i));
    bass.visible=hasBass;model.root.visible=hasKeys;drumModel.root.visible=hasDrums;
    if(stage==='full')Object.assign(presets.whole,{target:V(.20,4.95,.15),height:17.7,width:33.2});
    else if(stage==='keys_bass')Object.assign(presets.whole,{target:V(-.80,4.90,-.35),height:15.8,width:24.4});
    else Object.assign(presets.whole,{target:V(0,6.0,-2.65),height:11.5,width:17.2});
    selectPreset('whole',true);markChanged();
    if(live?.mode==='song')updateLiveUi();
  }

  async function ensureSoundfontCtor(){
    if(SoundfontCtor)return SoundfontCtor;
    if(!bandAC)bandAC=new (window.AudioContext||window.webkitAudioContext)();
    if(bandAC.state==='suspended')await bandAC.resume();
    const mod=await import("https://unpkg.com/smplr/dist/index.mjs");SoundfontCtor=mod.Soundfont;return SoundfontCtor;
  }
  function sfKey(cfg){return cfg.instrument+'|'+cfg.pan+'|'+cfg.volume}
  async function ensureSongSoundfonts(song){
    if(bandLoading)return bandLoading;
    bandLoading=(async()=>{
      bp.play.disabled=true;bp.song.disabled=true;bp.now.textContent='正在加载 '+song.title+' 音色…';
      try{
        await ensureSoundfontCtor();
        const need=[];
        if(song.events.some(e=>e.i==='drums'))need.push(ensureDrumBuffers(song));
        async function ensureCfg(cfg){
          let key=sfKey(cfg);
          if(sfCache.has(key))return sfCache.get(key).ready;
          try{
            const sf=SoundfontCtor(bandAC,{instrument:cfg.instrument,kit:'MusyngKite',pan:cfg.pan||0});
            sf.output.volume=cfg.volume??80;sfCache.set(key,sf);await sf.ready;return sf;
          }catch(err){
            sfCache.delete(key);
            if(cfg.fallback&&cfg.fallback!==cfg.instrument){
              console.warn('SoundFont fallback',cfg.instrument,'→',cfg.fallback,err);
              cfg.instrument=cfg.fallback;key=sfKey(cfg);
              if(sfCache.has(key))return sfCache.get(key).ready;
              const sf=SoundfontCtor(bandAC,{instrument:cfg.instrument,kit:'MusyngKite',pan:cfg.pan||0});
              sf.output.volume=cfg.volume??80;sfCache.set(key,sf);await sf.ready;return sf;
            }
            throw err;
          }
        }
        for(const cfg of Object.values(song.tones))need.push(ensureCfg(cfg));
        await Promise.all(need);
        bp.now.textContent='音色就绪 · 点击开始演奏';
      }catch(err){console.error(err);bp.now.textContent='音色加载失败 · 请联网后重试';throw err;}
      finally{bp.play.disabled=false;bp.song.disabled=false;}
    })();
    try{await bandLoading}finally{bandLoading=null}
  }
  function getSF(song,tone){
    const cfg=song.tones[tone];return cfg?sfCache.get(sfKey(cfg)):null;
  }
  function stopCurrentSoundfonts(){
    cancelStopSet(transport.scheduledStops);
    for(const sf of transport.currentSfs)try{sf.stop()}catch{}
    transport.currentSfs.clear();stopDrumVoices();
  }
  function scheduleAllAudio(song){
    const start=bandAC.currentTime+.16;transport.startAudio=start;
    const used=new Set();cancelStopSet(transport.scheduledStops);
    for(const ev of song.events){
      if(ev.i==='drums'){
        const stop=playDrumSample(ev.n,ev.v,start+ev.s);
        if(typeof stop==='function')transport.scheduledStops.add(stop);
        continue;
      }
      const sf=getSF(song,ev.tone);if(!sf)continue;used.add(sf);
      const cap=ev.i==='lower'?5.5:ev.i==='upper'?4.0:ev.i==='bass'?3.0:ev.i==='electric'?4.2:2.8;
      const dur=Math.max(.045,Math.min(cap,ev.e-ev.s));
      const stop=sf.start({note:ev.n,velocity:Math.max(1,Math.min(127,ev.v)),time:start+ev.s,duration:dur});
      if(typeof stop==='function')transport.scheduledStops.add(stop);
    }
    transport.currentSfs=used;
  }

  function visualOn(ev,prefix='song:'){
    if(ev.i==='guitar'){triggerGuitar(ev);bp.now.textContent='木吉他 '+(ev.x+1)+' · '+midiName(ev.n);}
    else if(ev.i==='bass'){triggerBass(ev);bp.now.textContent='Bass · '+midiName(ev.n);}
    else if(ev.i==='lower'){const at=prefix==='song:'?transport.startAudio+visualStartTime(ev):null;controller.press(ev.n,ev.v,'lower',prefix+ev.id,at);bp.now.textContent='下层 · '+midiName(ev.n);}
    else if(ev.i==='upper'){const at=prefix==='song:'?transport.startAudio+visualStartTime(ev):null;controller.press(ev.n,ev.v,'upper',prefix+ev.id,at);bp.now.textContent='上层 · '+midiName(ev.n);}
    else if(ev.i==='electric'){
      const slot=Math.max(0,Math.min(electricControllers.length-1,ev.x|0));
      const program=electricProgramFromEvent(ev);applyElectricProgram(slot,program);
      const preset=ELECTRIC_PROGRAM_PRESETS[program]||ELECTRIC_PROGRAM_PRESETS[27];
      electricControllers[slot].api.noteOn(ev.n,Math.min(127,Math.round(ev.v*preset.accent)));
      bp.now.textContent='电吉他 '+(slot+1)+' · '+preset.name+' · '+midiName(ev.n);
    }
  }
  function visualOff(ev,prefix='song:'){
    if(ev.i==='lower'||ev.i==='upper'){
      const at=prefix==='song:'?transport.startAudio+(ev.ve??ev.e):null;
      controller.release(ev.n,ev.i,prefix+ev.id,at);
    }else if(ev.i==='electric'){const slot=Math.max(0,Math.min(electricControllers.length-1,ev.x|0));electricControllers[slot].api.noteOff(ev.n);}
  }
  function resetBandStrings(){
    for(const g of guitarInstances)for(const s of g.userData.playableStrings){s.active=false;s.amp=0;straightGuitarString(s);}
    for(const s of bass.userData.playableStrings||[]){s.active=false;s.amp=0;restoreStringMorph(s);}
    for(const ms of guitarMarkers)for(const m of ms)m.visible=false;bassMarker.visible=false;markChanged();
  }
  function clearSongVisuals(){
    controller.clearSources('song:');controller.pedal('sustain',false,'song:pedal');drumController.panic();electricControllers.forEach(c=>c.api.panic());electricProgramState.fill(null);resetBandStrings();
  }
  function pointersForTime(song,t){
    let on=0;while(on<visualOns.length&&visualOns[on].t<=t)on++;
    let drum=0;while(drum<drumOns.length&&drumOns[drum].t<=t)drum++;
    let off=0;while(off<keyboardOffs.length&&keyboardOffs[off].t<=t)off++;
    let ped=0;while(ped<song.pedals.length&&song.pedals[ped].t<=t)ped++;
    transport.onPtr=on;transport.drumPtr=drum;transport.offPtr=off;transport.pedalPtr=ped;
  }
  function syncVisualState(t){
    const song=SONGS[currentSongId];clearSongVisuals();
    // Rebuild held keyboard notes exactly at the current AudioContext time.
    for(const ev of song.events){
      if(ev.s>t)break;
      if((ev.i==='lower'||ev.i==='upper') && (ev.ve??ev.e)>t)controller.press(ev.n,ev.v,ev.i,'song:'+ev.id,transport.startAudio+visualStartTime(ev));
    }
    let sustain=false;for(const pe of song.pedals){if(pe.t>t)break;sustain=pe.on;}
    controller.pedal('sustain',sustain,'song:pedal');
    // For strings, only retrigger notes that are actually sounding now.
    const activeStrings=song.events.filter(ev=>(ev.i==='guitar'||ev.i==='bass'||ev.i==='electric')&&ev.s<=t&&ev.e>t).slice(-12);
    for(const ev of activeStrings)visualOn(ev);
    pointersForTime(song,t);transport.lastSongTime=t;markChanged();
  }
  function stopBand(reset=true){
    transport.playing=false;if(transport.raf)cancelAnimationFrame(transport.raf);transport.raf=0;
    stopCurrentSoundfonts();clearSongVisuals();bp.play.textContent='▶ 开始演奏';
    if(reset){const song=SONGS[currentSongId];transport.onPtr=transport.drumPtr=transport.offPtr=transport.pedalPtr=0;bp.progress.style.width='0%';bp.time.textContent='00:00 / '+fmtBand(song.duration);bp.now.textContent='已停止 · 可切换曲目';}
  }
  function bandTick(){
    if(!transport.playing||!bandAC)return;
    const song=SONGS[currentSongId];
    const t=songNow();                              // audio / MIDI master clock
    const visualT=bandAC.currentTime-transport.startAudio; // allows negative pre-roll

    if(t-transport.lastSongTime>.45)syncVisualState(t);
    else{
      while(transport.onPtr<visualOns.length&&visualOns[transport.onPtr].t<=visualT+.006){
        const vo=visualOns[transport.onPtr++],ev=byId.get(vo.id);if(ev)visualOn(ev);
      }
      while(transport.drumPtr<drumOns.length&&drumOns[transport.drumPtr].t<=t+.010){
        const hit=drumOns[transport.drumPtr++],ev=byId.get(hit.id);
        if(ev){
          try{
            drumController.noteOn(drumVisualNote(ev.n),ev.v);
            bp.now.textContent='🥁 '+drumDisplay(ev.n)+' · MIDI '+ev.n;
          }catch(err){
            console.error('[DrumRig noteOn]',ev,err);
          }
        }
      }
      while(transport.offPtr<keyboardOffs.length&&keyboardOffs[transport.offPtr].t<=t+.006){
        const off=keyboardOffs[transport.offPtr++],ev=byId.get(off.id);if(ev)visualOff(ev);
      }
      while(transport.pedalPtr<song.pedals.length&&song.pedals[transport.pedalPtr].t<=t+.006){
        const pe=song.pedals[transport.pedalPtr++];controller.pedal('sustain',pe.on,'song:pedal');
      }
      transport.lastSongTime=t;
    }
    const shown=Math.max(0,Math.min(song.duration,t));bp.progress.style.width=(shown/song.duration*100).toFixed(2)+'%';bp.time.textContent=fmtBand(shown)+' / '+fmtBand(song.duration);
    if(t>=song.duration){
      transport.playing=false;transport.scheduledStops.clear();bp.play.textContent='▶ 再演一次';bp.progress.style.width='100%';bp.now.textContent='曲目演奏完成';clearSongVisuals();return;
    }
    transport.raf=requestAnimationFrame(bandTick);
  }
  async function startBand(){
    if(transport.playing){stopBand(true);return;}
    stopDemo();const song=SONGS[currentSongId];
    try{await ensureSongSoundfonts(song)}catch{return}
    if(bandAC.state==='suspended')await bandAC.resume();
    clearSongVisuals();transport.onPtr=transport.drumPtr=transport.offPtr=transport.pedalPtr=0;transport.lastSongTime=0;
    if(!visualOns.length)visualOns=song.events.filter(e=>e.i!=='drums').map(e=>({t:visualStartTime(e),id:e.id})).sort((a,b)=>a.t-b.t);
    if(!drumOns.length)drumOns=song.events.filter(e=>e.i==='drums').map(e=>({t:e.s,id:e.id})).sort((a,b)=>a.t-b.t);
    scheduleAllAudio(song);transport.playing=true;bp.play.textContent='■ 停止';bp.now.textContent=song.artist+' · '+song.title+' · 琴键击键点同步…';
    transport.raf=requestAnimationFrame(bandTick);markChanged();
  }
  function changeSong(id){
    if(!SONGS[id]||id===currentSongId)return;
    stopBand(false);currentSongId=id;renderSongMeta();bp.now.textContent='已切换 · 点击开始演奏';
  }

  async function importMidiFile(file){
    if(!file)return;
    if(!/\.(mid|midi)$/i.test(file.name||'')){bp.now.textContent='请选择 .mid / .midi 文件';return;}
    try{
      if(transport.playing)stopBand(false);
      if(live.mode==='practice')leavePracticeMode();
      else if(live.mode==='free')leaveFreeMode();
      bp.mode.value='song';live.mode='song';updateLiveUi();
      bp.now.textContent='正在解析 '+file.name+' …';
      const song=parseStandardMidi(await file.arrayBuffer(),file.name);
      if(!song.events.length)throw new Error('MIDI 中没有可演奏的 Note On');
      const id='import_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
      SONGS[id]=song;
      const option=document.createElement('option');option.value=id;option.textContent='⬆ '+song.title+' · 自动路由';bp.song.append(option);
      bp.song.value=id;currentSongId=id;renderSongMeta();updateLiveUi();
      const routed=song.cards.map(c=>c[0]+' '+c[2]).join(' · ');
      bp.now.textContent='导入完成 · '+routed;
      bp.map.innerHTML='<strong>通用 MIDI</strong> · 已按 GM Program / Channel 10 自动分配。没有专属 3D 模型的音色由键盘代理，但仍使用对应 SoundFont 发声。';
      stage.focus({preventScroll:true});
    }catch(err){
      console.error('[MIDI import]',err);bp.now.textContent='MIDI 导入失败 · '+(err?.message||err);
    }finally{
      bp.file.value='';
    }
  }
  bp.importBtn.addEventListener('click',()=>bp.file.click());
  bp.file.addEventListener('change',()=>importMidiFile(bp.file.files?.[0]));
  let midiDragDepth=0;
  document.addEventListener('dragenter',e=>{
    if([...e.dataTransfer?.types||[]].includes('Files')){midiDragDepth++;document.body.classList.add('midi-drag');e.preventDefault();}
  });
  document.addEventListener('dragover',e=>{if([...e.dataTransfer?.types||[]].includes('Files')){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';}});
  document.addEventListener('dragleave',e=>{if(midiDragDepth>0)midiDragDepth--;if(!midiDragDepth)document.body.classList.remove('midi-drag');});
  document.addEventListener('drop',e=>{
    midiDragDepth=0;document.body.classList.remove('midi-drag');
    const file=[...(e.dataTransfer?.files||[])].find(f=>/\.(mid|midi)$/i.test(f.name));
    if(file){e.preventDefault();importMidiFile(file);}
  });

  bp.play.addEventListener('click',()=>{live.mode==='practice'?startPractice():startBand();});
  bp.restart.addEventListener('click',()=>{if(live.mode==='practice'){practiceStop(true);startPractice();}else{stopBand(true);startBand();}});
  bp.song.addEventListener('change',()=>{live.mode==='practice'?changePracticeSong(bp.song.value):changeSong(bp.song.value);});
  bp.mode.addEventListener('change',()=>{
    if(bp.mode.value==='free'){
      if(live.mode==='practice')leavePracticeMode();
      enterFreeMode();
    }else if(bp.mode.value==='practice'){
      if(live.mode==='free')liveStopAll();
      enterPracticeMode();
    }else{
      if(live.mode==='practice')leavePracticeMode();
      else if(live.mode==='free')leaveFreeMode();
      else {live.mode='song';restoreSongStage();updateLiveUi();}
    }
  });
  bp.instrument.addEventListener('change',()=>changeLiveInstrument(bp.instrument.value));

  function changeElectricMode(value){
    const program=Number(value);
    if(!ELECTRIC_PROGRAM_PRESETS[program])return;
    if(live.mode==='free')liveStopAll();
    live.electricProgram=program;
    const p=ELECTRIC_PROGRAM_PRESETS[program];
    live.tone.electric={instrument:p.instrument,pan:0,volume:Math.round(p.volume*100)};
    applyElectricProgram(0,program,true);
    bp.now.textContent='电吉他模式 · '+p.name;
    bp.map.innerHTML=liveMapHtml();stage.focus({preventScroll:true});markChanged();
  }

  bp.bassLayout.addEventListener('change',()=>changeBassLayout(bp.bassLayout.value));
  bp.electricMode.addEventListener('change',()=>changeElectricMode(bp.electricMode.value));
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&transport.playing){syncVisualState(songNow());if(!transport.raf)transport.raf=requestAnimationFrame(bandTick);} if(!document.hidden&&practice.running){practice.lastDraw=0;if(!practice.raf)practice.raf=requestAnimationFrame(practiceTick);}
  });
  renderSongMeta();updateLiveUi();

  function addDemoNote(time,duration,tier,note,velocity,id){
    demoEvents.push({time,kind:'on',tier,note,velocity,source:'demo:'+id},{time:time+duration,kind:'off',tier,note,source:'demo:'+id});
  }
  const roots=[48,45,41,43,48,45,41,43],chords=[[60,64,67],[60,64,69],[60,65,69],[59,62,67]];
  const tune=[[72,76,79,76,74,72,71,74],[72,76,81,79,76,74,72,76],[77,79,81,79,77,76,74,72],[74,79,77,74,71,74,76,79]];
  let voiceId=0;
  for(let bar=0;bar<8;bar++){
    const time=bar*1.92,rootNote=roots[bar];
    [rootNote,rootNote+7].forEach(n=>addDemoNote(time,1.54,'lower',n,90,voiceId++));
    chords[bar%4].forEach((n,i)=>addDemoNote(time+.036*i,1.39,'lower',n,76+i*5,voiceId++));
    for(let beat=0;beat<8;beat++)addDemoNote(time+beat*.24,.178+(beat===7?.015:0),'upper',tune[bar%4][beat]+(bar>3&&beat===6?12:0),beat%2?88:108,voiceId++);
    demoEvents.push({time:time+.10,kind:'pedal',pressed:true},{time:time+1.70,kind:'pedal',pressed:false});
  }
  demoEvents.sort((a,b)=>a.time-b.time);
  function startDemo(){
    stopDemo();demoPlaying=true;demoStarted=performance.now();demoCursor=0;demoButton.setAttribute('aria-pressed','true');document.getElementById('demo-label').textContent='停止演示';markChanged();
  }
  function runDemo(now){
    if(!demoPlaying)return;
    let elapsed=(now-demoStarted)/1000;
    if(elapsed>=demoLength){controller.clearSources('demo:');demoStarted+=Math.floor(elapsed/demoLength)*demoLength*1000;demoCursor=0;elapsed=(now-demoStarted)/1000;}
    while(demoCursor<demoEvents.length&&demoEvents[demoCursor].time<=elapsed){
      const e=demoEvents[demoCursor++];
      if(e.kind==='on')controller.press(e.note,e.velocity,e.tier,e.source);
      else if(e.kind==='off')controller.release(e.note,e.tier,e.source);
      else controller.pedal('sustain',e.pressed,'demo:pedal');
    }
  }
  function selectPreset(id,instant=false){
    const p=presets[id];if(!p)return false;preset=id;zoom=1;momentumX=momentumY=0;
    want.target.copy(p.target);want.yaw=current.yaw+Math.atan2(Math.sin(p.yaw-current.yaw),Math.cos(p.yaw-current.yaw));want.pitch=p.pitch;want.distance=distanceFor(p);
    if(instant||reducedMotion){current.target.copy(want.target);current.yaw=want.yaw;current.pitch=want.pitch;current.distance=want.distance;}
    if(id==='lower'||id==='upper')setInputTier(id);
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===id)));markChanged();return true;
  }
  function changeZoom(factor){zoom=clamp(zoom*factor,.25,1.75);want.distance=distanceFor(presets[preset])*zoom;markChanged();}
  function pan(dx,dy){
    const scale=current.distance*2*Math.tan(T.MathUtils.degToRad(camera.fov/2))/height;
    want.target.addScaledVector(V(1,0,0).applyQuaternion(camera.quaternion),-dx*scale);
    want.target.addScaledVector(V(0,1,0).applyQuaternion(camera.quaternion),dy*scale);markChanged();
  }
  function resize(){
    width=stage.clientWidth;height=stage.clientHeight;if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();want.distance=distanceFor(presets[preset])*zoom;current.distance=want.distance;markChanged();
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{selectPreset(b.dataset.view);stage.focus({preventScroll:true});}));
  document.getElementById('zoom-in').addEventListener('click',()=>changeZoom(.82));document.getElementById('zoom-out').addEventListener('click',()=>changeZoom(1/.82));
  document.getElementById('reset').addEventListener('click',()=>selectPreset('whole'));
  demoButton.addEventListener('click',()=>{demoPlaying?stopDemo():startDemo();stage.focus({preventScroll:true});});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    stage.focus({preventScroll:true});const hit=e.button===0&&!e.shiftKey?hitAt(e.clientX,e.clientY):null;
    const p={id:e.pointerId,x:e.clientX,y:e.clientY,mode:hit?'play':e.shiftKey||e.button!==0?'pan':'orbit',hit:null};
    pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);momentumX=momentumY=0;previousGesture=null;
    if(hit)playHit(p,hit);else canvas.classList.add('dragging');markChanged();
  });
  canvas.addEventListener('pointermove',e=>{
    const p=pointers.get(e.pointerId);
    if(!p){if(e.pointerType==='mouse')canvas.classList.toggle('playable',!!hitAt(e.clientX,e.clientY));return;}
    const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(p.mode==='play'){playHit(p,hitAt(e.clientX,e.clientY));return;}
    const navigating=[...pointers.values()].filter(p=>p.mode!=='play');
    if(navigating.length>=2){
      const a=navigating[0],b=navigating[1],d=Math.hypot(a.x-b.x,a.y-b.y),x=(a.x+b.x)/2,y=(a.y+b.y)/2;
      if(previousGesture&&d>0){changeZoom(previousGesture.d/d);pan(x-previousGesture.x,y-previousGesture.y);}previousGesture={d,x,y};momentumX=momentumY=0;
    }else if(p.mode==='pan')pan(dx,dy);
    else{momentumX=-dx*.0055;momentumY=dy*.0047;want.yaw+=momentumX;want.pitch=clamp(want.pitch+momentumY,-.10,1.35);markChanged();}
  });
  function pointerEnd(e){const p=pointers.get(e.pointerId);if(p)releaseHit(p);pointers.delete(e.pointerId);previousGesture=null;if(![...pointers.values()].some(p=>p.mode!=='play'))canvas.classList.remove('dragging');markChanged();}
  canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('lostpointercapture',pointerEnd);
  canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(Math.exp(clamp(e.deltaY,-150,150)*.0018));},{passive:false});
  const computerMap={KeyA:60,KeyW:61,KeyS:62,KeyE:63,KeyD:64,KeyF:65,KeyT:66,KeyG:67,KeyY:68,KeyH:69,KeyU:70,KeyJ:71,KeyK:72,KeyO:73,KeyL:74,KeyP:75,Semicolon:76};
  stage.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.altKey||e.metaKey)return;
    let handled=true;
    if(computerMap[e.code]!==undefined){if(!computerKeys.has(e.code)){const k={note:computerMap[e.code],tier:inputTier};computerKeys.set(e.code,k);controller.press(k.note,104,k.tier,'computer:'+e.code);}}
    else if(e.code==='Space')controller.pedal('sustain',true,'computer:pedal');
    else if(e.code==='Digit1')setInputTier('lower');
    else if(e.code==='Digit2')setInputTier('upper');
    else if(e.code==='ArrowLeft')want.yaw-=.10;
    else if(e.code==='ArrowRight')want.yaw+=.10;
    else if(e.code==='ArrowUp')want.pitch=clamp(want.pitch+.08,-.10,1.35);
    else if(e.code==='ArrowDown')want.pitch=clamp(want.pitch-.08,-.10,1.35);
    else if(e.code==='KeyR')selectPreset('whole');
    else handled=false;
    if(handled){e.preventDefault();markChanged();}
  });
  window.addEventListener('keyup',e=>{
    const k=computerKeys.get(e.code);if(k){controller.release(k.note,k.tier,'computer:'+e.code);computerKeys.delete(e.code);}
    if(e.code==='Space')controller.pedal('sustain',false,'computer:pedal');
  });
  window.addEventListener('keydown',e=>{if(e.code==='Escape'){controller.api.panic();drumController.panic();electricControllers.forEach(c=>c.api.panic());e.preventDefault();}});
  window.addEventListener('blur',()=>{controller.clearSources('computer:');controller.clearSources('pointer:');drumController.allNotesOff?.();electricControllers.forEach(c=>c.api.allNotesOff());computerKeys.clear();pointers.clear();canvas.classList.remove('dragging');});
  const electronBoolean=v=>!!v;
  let drumVisualErrorShown=false;
  function frame(now){
    raf=0;inFrame=true;const dt=clamp((now-lastTime)/1000,.001,.05);lastTime=now;
    runDemo(now);
    let animation={moved:false,animating:false},bandAnimation=false,drumAnimation={moved:false,animating:false},electricAnimation={moved:false,animating:false};
    try{animation=controller.tick(dt);}catch(err){console.error('[Keyboard animation]',err);}
    try{bandAnimation=updateBandVisuals(dt,now);}catch(err){console.error('[Band string animation]',err);}
    try{drumAnimation=drumController.tick(dt);}catch(err){
      console.error('[DrumRig animation]',err);
      if(!drumVisualErrorShown){drumVisualErrorShown=true;bp.now.textContent='鼓动画异常已隔离 · 其余播放继续';}
    }
    try{
      for(const ec of electricControllers){
        const ea=ec.tick(dt);electricAnimation.moved=electronBoolean(electricAnimation.moved||ea.moved);electricAnimation.animating=electronBoolean(electricAnimation.animating||ea.animating);
      }
    }catch(err){console.error('[ElectricRig animation]',err);}
    if(animation.moved||bandAnimation||drumAnimation.moved||electricAnimation.moved){needsRender=true;}
    if(!pointers.size&&!reducedMotion&&Math.abs(momentumX)+Math.abs(momentumY)>.0001){
      const damping=Math.exp(-dt*11);momentumX*=damping;momentumY*=damping;want.yaw+=momentumX*dt*23;want.pitch=clamp(want.pitch+momentumY*dt*23,-.10,1.35);needsRender=true;
    }
    const ease=reducedMotion?1:1-Math.exp(-dt*13);
    current.yaw+=(want.yaw-current.yaw)*ease;current.pitch+=(want.pitch-current.pitch)*ease;current.distance+=(want.distance-current.distance)*ease;current.target.lerp(want.target,ease);
    const moving=Math.abs(want.yaw-current.yaw)+Math.abs(want.pitch-current.pitch)+Math.abs(want.distance-current.distance)+current.target.distanceTo(want.target)>.00015;
    if(needsRender||moving){
      const cp=Math.cos(current.pitch);camera.position.set(current.target.x+Math.sin(current.yaw)*cp*current.distance,Math.max(.13,current.target.y+Math.sin(current.pitch)*current.distance),current.target.z+Math.cos(current.yaw)*cp*current.distance);
      camera.lookAt(current.target);try{renderer.render(scene,camera);needsRender=false;}catch(err){console.error('[Renderer]',err);needsRender=true;}
    }
    inFrame=false;if(demoPlaying||animation.animating||bandAnimation||drumAnimation.animating||electricAnimation.animating||moving||Math.abs(momentumX)+Math.abs(momentumY)>.0001)raf=requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe(stage);resize();selectPreset('whole',true);updateStatus();
  Object.assign(controller.api,{selectView:selectPreset,setInputTier,playDemo:startDemo,stopDemo});
  window.StageRig=controller.api;window.DrumRig=drumController.api;window.ElectricRig=electricControllers[0].api;window.ElectricRigs=electricControllers.map(c=>c.api);resolveStageRig(controller.api);
  requestAnimationFrame(()=>{const loading=document.getElementById('loading');if(loading){loading.style.opacity='0';loading.style.pointerEvents='none';setTimeout(()=>loading.remove(),450);}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopDemo();if(raf)cancelAnimationFrame(raf);raf=0;fail('3D 画面暂时中断，请刷新页面重新打开。');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopDemo();if(raf)cancelAnimationFrame(raf);raf=0;}else{lastTime=performance.now();markChanged();}});
  window.addEventListener('pagehide',()=>{if(raf)cancelAnimationFrame(raf);raf=0;});
  window.addEventListener('pageshow',()=>{lastTime=performance.now();markChanged();});
}
requestAnimationFrame(()=>setTimeout(()=>{try{start();}catch(error){console.error(error);fail('键盘未能启动，请用支持 WebGL 2 的 Chrome、Edge 或 Safari 打开。');}},20));
