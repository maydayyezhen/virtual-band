'use strict';

// Keep temporary LED media tests above Auto LED without disabling the lighting director.
// Image and video tests share this one priority guard: Auto LED may continue driving the
// side screens, while the main screen stays owned by whichever local-media test is active.
(() => {
  const venue=window.VirtualBandVenues;
  const controls=venue?.controls;
  if(!venue||!controls?.setScreenContent||!controls?.setScreenPattern)return;

  const rawContent=controls.setScreenContent.bind(controls);
  const rawPattern=controls.setScreenPattern.bind(controls);
  let held=null;

  const imageActive=()=>!!window.NocturneLedImageTest?.active;
  const videoActive=()=>!!window.NocturneLedVideoTest?.active;
  const active=()=>imageActive()||videoActive();
  const isMainTarget=id=>id==='main'||id==null;
  const activeState=()=>videoActive()?(window.NocturneLedVideoTest?.state||{}):(window.NocturneLedImageTest?.state||{});
  const expectedMode=source=>source?.tagName==='VIDEO'?'video':'media';

  controls.setScreenContent=function(id,content,options={}){
    let target=id,source=content,opts=options;
    if(arguments.length===1||typeof id!=='string'){
      opts=content??{};source=id;target='main';
    }
    const result=rawContent(target,source,opts);
    if(active()&&isMainTarget(target))held={content:source,options:{...opts},mode:expectedMode(source)};
    return result;
  };

  controls.setScreenPattern=function(id,pattern,options={}){
    if(active()&&id==='main')return [venue.stage?.screens?.get('main')].filter(Boolean);
    if(active()&&id==='all'){
      const out=[];
      try{out.push(...rawPattern('left',pattern,options));}catch{}
      try{out.push(...rawPattern('right',pattern,options));}catch{}
      return out;
    }
    return rawPattern(id,pattern,options);
  };

  function tick(){
    requestAnimationFrame(tick);
    if(!active()||!held||venue.current!=='nocturne')return;
    const main=venue.stage?.screens?.get('main');if(!main)return;
    const state=activeState();
    const brightness=Number.isFinite(state.brightness)?state.brightness:(held.options.brightness??.72);
    const fit=state.fit||held.options.fit||'cover';
    const playing=held.mode==='video'?(state.playing!==false):false;

    // Stage-mode changes can replace screen content below this wrapper. Reassert media
    // only when ownership was actually lost; otherwise let ScreenSurface update normally.
    if(main.patternName!==held.mode||main.source!==held.content){
      try{rawContent('main',held.content,{...held.options,fit,brightness,playing});}catch{}
      return;
    }
    if(Math.abs((main.brightness??brightness)-brightness)>.006){
      try{main.setOptions?.({brightness});}catch{}
    }
  }

  const clearIfIdle=()=>{if(!active())held=null;};
  window.addEventListener('nocturne-led-image-test-change',clearIfIdle);
  window.addEventListener('nocturne-led-video-test-change',clearIfIdle);
  requestAnimationFrame(tick);
  console.info('[LED media test] main-screen image/video priority guard attached');
})();
