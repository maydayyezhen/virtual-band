'use strict';

// Full NOCTURNE venue adapter.
// The authored venue application is kept verbatim in nocturne-stage-source.js and is
// decompressed here. Only host-ownership points are patched: reuse the band's existing
// Scene/WebGLRenderer/Camera, skip the venue's standalone UI/render loop, and expose its
// original scene/fixtures/LED/haze APIs through the venue preset layer.
(() => {
  const T = THREE;
  const select = document.getElementById('bp-venue');
  const menu = document.getElementById('venue-menu');
  const STORE = 'vb-venue-preset-v2';
  const SOURCE = () => window.__NOCTURNE_STAGE_SOURCE_GZIP_BASE64__;
  const CAMERA_PRESETS = {
    panorama:{label:'场馆全景',position:[0,7.8,28],target:[0,5.3,-1],fov:57},
    stage:{label:'舞台正面',position:[0,4.9,17.5],target:[0,5,-2],fov:68},
    wing:{label:'舞台侧翼',position:[-20,5.5,12],target:[1,4,-1],fov:65},
    balcony:{label:'看台视角',position:[24,8.1,40],target:[0,5,-1],fov:58},
    reverse:{label:'回望场馆',position:[0,4.8,3],target:[0,7,43],fov:72},
  };
  const isBandRoot = object => {
    const n=object?.name||'';
    return n==='Atelier — dual-tier stage rig'||/^Wish Acoustic \d+$/.test(n)||
      n==='Wish Fingered Bass'||/Electric \d+$/.test(n)||n==='Atelier Session 04 · Band Drums';
  };

  let runtime=null,scene=null,renderer=null,camera=null,app=null;
  let venueObjects=[],preExisting=[],bandHomes=new Map(),sceneSnapshot=null,rendererSnapshot=null;
  let activeId='',lastOuterRender=-Infinity,lastUpdate=0,inGlow=false,renderLoop=0,attached=false;
  let resolveReady,rejectReady;
  window.VirtualBandVenuesReady=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  window.VirtualBandVenuesReady.catch(()=>{});

  async function gunzipBase64(base64){
    if(!base64)throw new Error('NOCTURNE source payload missing');
    if(typeof DecompressionStream!=='function')throw new Error('This browser does not support DecompressionStream');
    const raw=atob(base64),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  function patchSource(source){
    const hostLine='"use strict";\n        const __HOST__ = window.__NOCTURNE_HOST_RUNTIME__;';
    if(!source.includes('"use strict";'))throw new Error('NOCTURNE source header not found');
    source=source.replace('"use strict";',hostLine);
    source=source.replace('            this.bind();','            if (!__HOST__?.embedded) this.bind();');

    const marker='        class StageEngine {';
    const index=source.indexOf(marker);
    if(index<0)throw new Error('NOCTURNE StageEngine not found');
    let head=source.slice(0,index),tail=source.slice(index);
    tail=tail.replace('            this.scene = new T.Scene();','            this.scene = __HOST__.scene;');
    tail=tail.replace(
`            this.camera = new T.PerspectiveCamera(
              57,
              innerWidth / innerHeight,
              0.08,
              160,
            );`,
`            this.camera = __HOST__.camera;
            this.camera.fov = 57;
            this.camera.near = 0.08;
            this.camera.far = 160;
            this.camera.updateProjectionMatrix();`
    );
    tail=tail.replace(
`            this.renderer = new T.WebGLRenderer({
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
            });`,
`            this.renderer = __HOST__.renderer;`
    );
    tail=tail.replace('            el("viewport").appendChild(this.renderer.domElement);','');
    tail=tail.replace(
/            this\.setStageMode\("nocturne"\);[\s\S]*?          }\n          emit\(name, detail\) \{/,
`            this.setStageMode("nocturne");
          }
          emit(name, detail) {`
    );
    tail=tail.replace('          syncMode() {','          syncMode() { if (__HOST__?.embedded) return;');
    tail=tail.replace('          syncTransport() {','          syncTransport() { if (__HOST__?.embedded) return;');
    source=head+tail;

    source=source.replace('          window.stage = app;','          window.__NOCTURNE_IMPORTED_STAGE__ = app;');
    source=source.replace('            window[name] = app[name].bind(app);','            (window.__NOCTURNE_IMPORTED_API__ ||= {})[name] = app[name].bind(app);');
    source=source.replace('          bindUI(app);','          // host application owns UI');
    source=source.replace('          app.start();','          // host renderer owns animation and presentation');
    source=source.replace('          window.stageReady = Promise.resolve(app);','          window.__NOCTURNE_IMPORTED_READY__ = Promise.resolve(app);');
    source=source.replace('          window.dispatchEvent(new CustomEvent("stage-ready", { detail: app }));','          window.dispatchEvent(new CustomEvent("nocturne-stage-ready", { detail: app }));');

    const catchStart=source.lastIndexOf('        } catch (error) {');
    const iifeEnd=source.lastIndexOf('        }\n      })();');
    if(catchStart<0||iifeEnd<catchStart)throw new Error('NOCTURNE bootstrap tail not found');
    source=source.slice(0,catchStart)+
`        } catch (error) {
          console.error('[NOCTURNE embedded]', error);
          window.__NOCTURNE_IMPORTED_ERROR__ = error;
        }
      })();`+source.slice(iifeEnd+'        }\n      })();'.length);
    return source;
  }

  function snapshotHost(){
    const roots=(window.VirtualBandCamera?.roots||scene.children.filter(isBandRoot)).filter(Boolean);
    preExisting=scene.children.map(object=>({object,visible:object.visible,band:roots.includes(object)||isBandRoot(object)}));
    bandHomes.clear();
    for(const root of roots)bandHomes.set(root,{position:root.position.clone(),rotation:root.rotation.clone(),scale:root.scale.clone()});
    sceneSnapshot={
      background:scene.background,
      fog:scene.fog,
      environment:scene.environment,
      mats:scene.userData?.mats,
    };
    const clear=new T.Color();renderer.getClearColor(clear);
    rendererSnapshot={
      outputColorSpace:renderer.outputColorSpace,
      toneMapping:renderer.toneMapping,
      exposure:renderer.toneMappingExposure,
      shadowEnabled:renderer.shadowMap.enabled,
      shadowType:renderer.shadowMap.type,
      shadowAutoUpdate:renderer.shadowMap.autoUpdate,
      clearColor:clear.clone(),
      clearAlpha:renderer.getClearAlpha(),
    };
    return new Set(scene.children);
  }

  function restoreBand(offsetY){
    for(const [root,home] of bandHomes){
      if(!root.parent)scene.add(root);
      root.position.copy(home.position);root.position.y+=offsetY;
      root.rotation.copy(home.rotation);root.scale.copy(home.scale);
    }
    scene.updateMatrixWorld(true);
    renderer.shadowMap.needsUpdate=true;
    window.refreshVirtualBandShadows?.();
  }

  function setPreExistingVisible(venueOn){
    for(const item of preExisting){
      if(item.band)continue;
      item.object.visible=venueOn?false:item.visible;
    }
  }
  function setVenueVisible(on){for(const object of venueObjects)object.visible=on;}

  function applyVenueSceneState(){
    scene.background=new T.Color('#080e19');
    scene.fog=new T.FogExp2('#0b1322',0.009);
    if(app?.envRT?.texture)scene.environment=app.envRT.texture;
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.08;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=true;
  }
  function restoreSceneState(){
    scene.background=sceneSnapshot.background;
    scene.fog=sceneSnapshot.fog;
    scene.environment=sceneSnapshot.environment;
    if(sceneSnapshot.mats===undefined)delete scene.userData.mats;else scene.userData.mats=sceneSnapshot.mats;
    renderer.outputColorSpace=rendererSnapshot.outputColorSpace;
    renderer.toneMapping=rendererSnapshot.toneMapping;
    renderer.toneMappingExposure=rendererSnapshot.exposure;
    renderer.shadowMap.enabled=rendererSnapshot.shadowEnabled;
    renderer.shadowMap.type=rendererSnapshot.shadowType;
    renderer.shadowMap.autoUpdate=rendererSnapshot.shadowAutoUpdate;
    renderer.setClearColor(rendererSnapshot.clearColor,rendererSnapshot.clearAlpha);
    renderer.shadowMap.needsUpdate=true;
  }

  function resizeGlow(){
    if(!app?.glow)return;
    const size=renderer.getDrawingBufferSize(new T.Vector2());
    app.glow.resize(size.x,size.y,true);
  }

  function updateVenue(now=performance.now()){
    if(!app||activeId!=='nocturne')return;
    const realDt=lastUpdate?Math.min(.08,Math.max(0,(now-lastUpdate)/1000)):1/60;
    lastUpdate=now;
    const dt=app.paused?0:realDt;
    app.time+=dt;if(app.demo)app.demoTime+=dt;
    app.beat.value*=Math.exp((-dt*4)/app.beat.duration);if(app.beat.value<.001)app.beat.value=0;
    if(app.demo&&!app.paused&&app.demoTime>=app.nextDemoBeat&&app.mode!=='blackout'){
      app.triggerBeat(app.beat.index%4===0?.9:.5,{source:'demo'});
      app.nextDemoBeat=app.demoTime+60/app.bpm;
    }
    const frame={dt,time:app.time,beat:app.beat.value,bpm:app.bpm,stage:app};
    for(const fn of [...app.updates]){
      try{fn(frame);}catch(error){app.updates.delete(fn);console.error(error);}
    }
    for(const item of app.instruments.values())if(item.update){
      try{item.update(frame,item.root);}catch(error){item.update=null;console.error(error);}
    }
    app.haze.update(dt);
    for(const fixture of app.lights.values())fixture.update(dt);
    for(const screen of app.screens.values())screen.update(dt);
    const main=app.screens.get('main');
    if(main&&app.reflection){
      app.reflection.uniforms.source.value=main.material.uniforms.source.value;
      app.reflection.uniforms.brightness.value=main.brightness;
      app.reflection.uniforms.decodeSRGB.value=main.material.uniforms.decodeSRGB.value;
    }
  }

  function installRendererBridge(){
    const hostRender=renderer.render.bind(renderer);
    renderer.render=function(s,c){
      if(activeId!=='nocturne'||s!==scene||c!==camera||inGlow)return hostRender(s,c);
      const now=performance.now();lastOuterRender=now;updateVenue(now);
      if(!app?.glow)return hostRender(s,c);
      inGlow=true;
      try{return app.glow.render(s,c);}finally{inGlow=false;}
    };
    const tick=now=>{
      renderLoop=requestAnimationFrame(tick);
      if(activeId!=='nocturne')return;
      if(now-lastOuterRender>42)renderer.render(scene,camera);
    };
    renderLoop=requestAnimationFrame(tick);
  }

  function registerCameras(){
    const cam=window.VirtualBandCamera;if(!cam?.registerView)return;
    for(const [name,preset] of Object.entries(CAMERA_PRESETS)){
      cam.registerView(`nocturne:${name}`,{...preset,duration:700});
    }
  }

  function renderCameraUi(){
    const panel=document.querySelector('#camera-menu .camera-panel');if(!panel)return;
    panel.querySelector('.camera-venue-section')?.remove();
    if(activeId!=='nocturne')return;
    const section=document.createElement('div');section.className='camera-venue-section';
    section.innerHTML='<div class="camera-view-group-label">NOCTURNE 场馆机位</div><div class="camera-subviews-grid"></div>';
    const grid=section.querySelector('.camera-subviews-grid');
    for(const [name,preset] of Object.entries(CAMERA_PRESETS)){
      const button=document.createElement('button');button.type='button';button.className='view';
      button.dataset.camera=`nocturne:${name}`;button.textContent=preset.label;
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();window.VirtualBandCamera?.view(`nocturne:${name}`);});
      grid.appendChild(button);
    }
    const prefs=panel.querySelector('.camera-pref-section');panel.insertBefore(section,prefs||null);
  }

  function syncBpm(){
    const songId=document.getElementById('bp-song')?.value;
    const song=window.VIRTUAL_BAND_SONGS?.[songId];
    const m=String(song?.bpm??'').match(/[\d.]+/);const bpm=m?Number(m[0]):NaN;
    if(app&&Number.isFinite(bpm)&&bpm>=30&&bpm<=240)app.setBPM(bpm);
  }

  function activate(id,{persist=true,cameraPreset=true}={}){
    id=id==='none'?'none':'nocturne';activeId=id;
    const on=id==='nocturne';
    setVenueVisible(on);setPreExistingVisible(on);
    if(on){
      applyVenueSceneState();restoreBand(1.2);lastUpdate=0;syncBpm();
      if(cameraPreset)window.VirtualBandCamera?.view('nocturne:panorama');
    }else{
      restoreBand(0);restoreSceneState();window.VirtualBandCamera?.refit?.();
    }
    if(select)select.value=id;
    if(persist)localStorage.setItem(STORE,id);
    renderCameraUi();
    window.dispatchEvent(new CustomEvent('virtual-band-venue-change',{detail:{id,stage:app}}));
    return true;
  }

  function exposeApi(){
    const methods=['setLight','setLightGroup','setScreenPattern','setScreenContent','setStageMode','triggerBeat','addInstrument','removeInstrument','registerScreenPattern','setHaze','setDemo','setPaused','setAudioData','setSongSection'];
    const controls={};
    for(const name of methods)if(typeof app[name]==='function')controls[name]=app[name].bind(app);
    controls.setCamera=(options={})=>window.VirtualBandCamera?.pose?.(options,false);
    controls.focusOn=(target,options={})=>{
      const object=typeof target==='string'?app.instruments.get(target)?.root:target;
      if(object?.isObject3D)return window.VirtualBandCamera?.focus?.(object);
      if(Array.isArray(target)||target?.isVector3){
        const point=target?.isVector3?target.toArray():target;
        const distance=options.distance??8;
        return window.VirtualBandCamera?.pose?.({position:[point[0],point[1]+distance*.25,point[2]+distance],target:point,fov:options.fov??42},false);
      }
      return false;
    };
    window.NocturneVenue=controls;
    window.VirtualBandVenues={
      activate,
      get current(){return activeId;},
      get stage(){return app;},
      get controls(){return controls;},
      get cameras(){return Object.fromEntries(Object.entries(CAMERA_PRESETS).map(([id,v])=>[id,{...v}]));},
      get presets(){return [{id:'nocturne',label:'NOCTURNE · Livehouse',surfaceY:1.2},{id:'none',label:'无 · 纯乐队',surfaceY:0}]},
      camera:name=>window.VirtualBandCamera?.view(`nocturne:${name}`),
    };
  }

  async function attach(){
    if(attached)return;
    runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
    if(!runtime||!window.VirtualBandCamera||!SOURCE())throw new Error('venue runtime unavailable');
    ({scene,renderer,camera}=runtime);
    const before=snapshotHost();
    const source=await gunzipBase64(SOURCE());
    const patched=patchSource(source);
    window.__NOCTURNE_HOST_RUNTIME__={scene,renderer,camera,embedded:true};
    window.__NOCTURNE_IMPORTED_STAGE__=null;window.__NOCTURNE_IMPORTED_ERROR__=null;
    (0,Function)(patched)();
    if(window.__NOCTURNE_IMPORTED_ERROR__)throw window.__NOCTURNE_IMPORTED_ERROR__;
    app=window.__NOCTURNE_IMPORTED_STAGE__;
    if(!app)throw new Error('NOCTURNE StageEngine did not initialize');
    venueObjects=scene.children.filter(object=>!before.has(object));
    resizeGlow();registerCameras();installRendererBridge();exposeApi();
    window.addEventListener('resize',resizeGlow);
    document.getElementById('bp-song')?.addEventListener('change',syncBpm);
    select?.addEventListener('change',()=>{activate(select.value);menu?.removeAttribute('open');});
    const initial=localStorage.getItem(STORE)==='none'?'none':'nocturne';
    activate(initial,{persist:false,cameraPreset:initial==='nocturne'});
    attached=true;resolveReady(window.VirtualBandVenues);
    console.info(`[Venue] full NOCTURNE imported · ${app.lights.size} fixtures · ${app.screens.size} LED screens · 5 native camera presets`);
  }

  let tries=0;
  function wait(){
    if(window.__VIRTUAL_BAND_CAMERA_RUNTIME__&&window.VirtualBandCamera&&SOURCE()){
      attach().catch(error=>{console.error('[Venue] full NOCTURNE import failed',error);rejectReady(error);});return;
    }
    if(++tries<600)requestAnimationFrame(wait);else rejectReady(new Error('venue runtime unavailable'));
  }
  wait();
})();
