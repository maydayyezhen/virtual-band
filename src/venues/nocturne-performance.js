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

  let runtime=null,app=null,renderer=null;
  let originalPixelRatio=1;
  let shadowTimer=0;
  let configured=false;
  const screenOriginals=new Map();
  const screenSizes=new Map();
  const fixtureVisibility=new Map();

  function active(){return window.VirtualBandVenues?.current==='nocturne';}

  function resizeBloom(){
    if(!app?.glow||!renderer)return;
    const size=renderer.getDrawingBufferSize(new T.Vector2());
    // Preserve the full-resolution source image but remove expensive 4x MSAA.
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
      if(!fixtureVisibility.has(id))fixtureVisibility.set(id,fixture.light.visible);
      // The lens/glare/beam cone/spill remain fully animated. Only a small representative
      // subset contributes costly real-time SpotLight shading to every PBR material.
      fixture.light.visible=REAL_FIXTURE_LIGHTS.has(id);
    }
    // LED bloom already communicates screen spill very effectively; three additional
    // real PointLights buy little visually and cost another three light evaluations.
    for(const screen of app.screens?.values?.()||[]){
      if(screen.glow)screen.glow.visible=false;
    }
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
        // Brightness is cheap and should still react immediately even between redraws.
        this.material.uniforms.brightness.value=this.brightness;
        if(this.glow)this.glow.intensity=this.brightness*40;
        accumulator+=Math.max(0,dt||0);
        if(!this.dirty&&accumulator<step)return;
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

  function applyBalanced(){
    if(!app||!renderer)return;
    configureFixtureLights();
    configureHaze();
    configureScreens();
    applyRendererBudget();
    startShadowBudget();
    configured=true;
  }

  function syncVenue(){
    if(active())applyBalanced();
    else restoreRendererBudget();
  }

  async function attach(){
    await window.VirtualBandVenuesReady;
    runtime=window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
    app=window.VirtualBandVenues?.stage;
    renderer=runtime?.renderer;
    if(!app||!renderer)throw new Error('NOCTURNE performance runtime unavailable');
    originalPixelRatio=renderer.getPixelRatio();
    applyBalanced();
    window.addEventListener('virtual-band-venue-change',syncVenue);
    window.addEventListener('resize',()=>requestAnimationFrame(()=>{if(active())applyRendererBudget();}));

    window.NocturnePerformance={
      profile:PROFILE,
      apply:applyBalanced,
      get stats(){return {
        profile:PROFILE,
        realFixtureLights:[...REAL_FIXTURE_LIGHTS],
        totalFixtures:app.lights?.size||0,
        shadowHz:Math.round(1000/SHADOW_INTERVAL*10)/10,
        hazeDrawCount:app.haze?.points?.geometry?.drawRange?.count||0,
        ledFps:{...LED_FPS},
        bloomDivisor:BLOOM_DIVISOR,
        pixelRatio:renderer.getPixelRatio(),
      };},
    };
    console.info('[Venue perf] NOCTURNE balanced profile attached',window.NocturnePerformance.stats);
  }

  attach().catch(error=>console.error('[Venue perf] failed',error));
})();
