'use strict';

// NOCTURNE performance profile.
// Keep the authored venue and its visible lighting language intact while reducing the
// expensive work behind it: real-time PBR lights, shadow refresh rate, HDR MSAA,
// bloom resolution, haze overdraw and CanvasTexture upload frequency.
(() => {
  const T = THREE;
  const PROFILE = 'balanced';
  const REAL_FIXTURE_LIGHTS = new Set([
    'beam-02','beam-05',
    'par-02','par-05','par-08','par-13',
  ]);
  const SHADOW_INTERVAL = 120; // ~8.3 Hz; the main picture can still render at full rate.
  const HAZE_COUNT = 78;
  const HAZE_MAX_POINT = 280;
  const LED_FPS = {main:24,left:18,right:18};
  const LED_SCALE = {main:.75,left:.78,right:.78};
  const BLOOM_DIVISOR = 5; // scene stays full-res; only extract/blur buffers get smaller.
  const DPR_CAP = matchMedia('(max-width: 700px)').matches ? 1.25 : 1.5;

  let runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__||null;
  let app=null,renderer=runtime?.renderer||null;
  let originalPixelRatio=renderer?.getPixelRatio?.()||1;
  let shadowTimer=0;
  let reported=false;
  const screenOriginals=new Map();
  const screenSizes=new Map();

  function active(){return window.VirtualBandVenues?.current==='nocturne';}

  function resizeBloom(){
    if(!app?.glow||!renderer)return;
    const size=renderer.getDrawingBufferSize(new T.Vector2());
    // Preserve the full-resolution scene source but remove expensive 4x render-target
    // MSAA. Only the already-soft glow extract/blur buffers run at lower resolution.
    app.glow.sceneRT.setSize(size.x,size.y);
    app.glow.sceneRT.samples=0;
    const w=Math.max(1,Math.floor(size.x/BLOOM_DIVISOR));
    const h=Math.max(1,Math.floor(size.y/BLOOM_DIVISOR));
    app.glow.w=w;app.glow.h=h;
    app.glow.ping.setSize(w,h);app.glow.pong.setSize(w,h);
  }

  function configureHaze(){
    const haze=app?.haze;if(!haze?.points)return;
    const geometry=haze.points.geometry;
    geometry.setDrawRange(0,Math.min(HAZE_COUNT,geometry.getAttribute('position')?.count||HAZE_COUNT));
    const material=haze.material;
    if(material?.vertexShader?.includes('min(480.')){
      material.vertexShader=material.vertexShader.replace('min(480.','min('+HAZE_MAX_POINT+'.');
      material.needsUpdate=true;
    }
  }

  function configureFixtureLights(){
    if(!app?.lights)return;
    for(const [id,fixture] of app.lights){
      if(!fixture?.light)continue;
      // Lens/glare/volumetric beam/spill stay fully animated. Only six representative
      // fixtures participate in expensive real-time PBR lighting.
      fixture.light.visible=REAL_FIXTURE_LIGHTS.has(id);
    }
    // The post glow already sells LED spill; these three PointLights are redundant.
    for(const screen of app.screens?.values?.()||[])if(screen.glow)screen.glow.visible=false;
  }

  function configureScreens(){
    for(const [id,screen] of app?.screens||[]){
      if(!screenOriginals.has(id))screenOriginals.set(id,screen.update.bind(screen));
      if(!screenSizes.has(id))screenSizes.set(id,[screen.canvas.width,screen.canvas.height]);

      const base=screenSizes.get(id),scale=LED_SCALE[id]??.78;
      const targetW=Math.max(64,Math.round(base[0]*scale));
      const targetH=Math.max(64,Math.round(base[1]*scale));
      if(screen.canvas.width!==targetW||screen.canvas.height!==targetH){
        screen.canvas.width=targetW;screen.canvas.height=targetH;screen.dirty=true;
      }

      if(screen.__balancedUpdate)continue;
      const original=screenOriginals.get(id),fps=LED_FPS[id]||18,step=1/fps;
      let accumulator=0;
      screen.update=function(dt){
        this.material.uniforms.brightness.value=this.brightness;
        if(this.glow)this.glow.intensity=this.brightness*40;
        const running=this.playing&&(!this.demoOwner||this.app.demo);
        if(running&&dt>0)accumulator+=dt;
        if(this.dirty){
          const elapsed=accumulator;accumulator=0;
          return original(elapsed);
        }
        if(!running||accumulator<step)return;
        const elapsed=accumulator;accumulator=0;
        return original(elapsed);
      };
      screen.__balancedUpdate=true;
    }
  }

  function applyRendererBudget(){
    if(!renderer)return;
    renderer.shadowMap.autoUpdate=false;
    renderer.shadowMap.needsUpdate=true;
    const current=renderer.getPixelRatio();
    if(current>DPR_CAP)renderer.setPixelRatio(DPR_CAP);
    resizeBloom();
  }

  function restoreRendererBudget(){
    if(!renderer)return;
    if(Math.abs(renderer.getPixelRatio()-originalPixelRatio)>.001)renderer.setPixelRatio(originalPixelRatio);
  }

  function startShadowBudget(){
    if(shadowTimer)return;
    shadowTimer=window.setInterval(()=>{
      if(active()&&!document.hidden&&renderer?.shadowMap?.enabled)renderer.shadowMap.needsUpdate=true;
    },SHADOW_INTERVAL);
  }

  function configureStaticCost(){
    if(!app)return;
    configureFixtureLights();
    configureHaze();
    configureScreens();
  }

  function applyBalanced(){
    if(!app||!renderer)return;
    configureStaticCost();
    applyRendererBudget();
    startShadowBudget();
  }

  function installApi(){
    if(window.NocturnePerformance)return;
    window.NocturnePerformance={
      profile:PROFILE,
      apply:applyBalanced,
      get stats(){return {
        profile:PROFILE,
        realFixtureLights:[...REAL_FIXTURE_LIGHTS],
        totalFixtures:app?.lights?.size||0,
        shadowHz:Math.round(1000/SHADOW_INTERVAL*10)/10,
        hazeDrawCount:app?.haze?.points?.geometry?.drawRange?.count||0,
        ledFps:{...LED_FPS},
        bloomDivisor:BLOOM_DIVISOR,
        pixelRatio:renderer?.getPixelRatio?.()||1,
      };},
    };
  }

  function report(){
    if(reported||!app)return;reported=true;
    installApi();
    console.info('[Venue perf] NOCTURNE balanced profile attached',window.NocturnePerformance.stats);
  }

  // Loaded before venue-manager: the original stage dispatches this synchronously while
  // being constructed. This lets us disable 24 of 30 real SpotLights and reduce haze/LED
  // work before the first expensive venue render can happen.
  window.addEventListener('nocturne-stage-ready',event=>{
    runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__||runtime;
    renderer=runtime?.renderer||renderer;
    if(renderer&&!originalPixelRatio)originalPixelRatio=renderer.getPixelRatio();
    app=event.detail||window.__NOCTURNE_IMPORTED_STAGE__||app;
    configureStaticCost();
  });

  // venue-manager dispatches this after applying its renderer state but before returning
  // from activate(), so the balanced shadow/glow/DPR budget wins before the next frame.
  window.addEventListener('virtual-band-venue-change',event=>{
    if(!app)app=event.detail?.stage||window.VirtualBandVenues?.stage||null;
    runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__||runtime;
    renderer=runtime?.renderer||renderer;
    if(event.detail?.id==='nocturne')applyBalanced();
    else restoreRendererBudget();
    report();
  });

  window.addEventListener('resize',()=>requestAnimationFrame(()=>{
    if(active())applyRendererBudget();
  }));

  // Fallback for cached/late execution.
  const wait=()=>{
    runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__||runtime;
    renderer=runtime?.renderer||renderer;
    app=window.VirtualBandVenues?.stage||window.__NOCTURNE_IMPORTED_STAGE__||app;
    if(app&&renderer){if(active())applyBalanced();configureStaticCost();report();return;}
    requestAnimationFrame(wait);
  };
  wait();
})();
