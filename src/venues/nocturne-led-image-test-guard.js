'use strict';

// Keep the temporary image-test layer above Auto LED without disabling the lighting
// director. This wrapper captures whichever image the test panel puts on the main screen,
// blocks lower-priority main-screen pattern writes, and reasserts the image if a stage-mode
// change replaces it internally.
(() => {
  const venue=window.VirtualBandVenues;
  const controls=venue?.controls;
  if(!venue||!controls?.setScreenContent||!controls?.setScreenPattern)return;

  const rawContent=controls.setScreenContent.bind(controls);
  const rawPattern=controls.setScreenPattern.bind(controls);
  let held=null;

  const active=()=>!!window.NocturneLedImageTest?.active;
  const isMainTarget=id=>id==='main'||id==null;

  controls.setScreenContent=function(id,content,options={}){
    let target=id,source=content,opts=options;
    if(arguments.length===1||typeof id!=='string'){
      opts=content??{};source=id;target='main';
    }
    const result=rawContent(target,source,opts);
    if(active()&&isMainTarget(target))held={content:source,options:{...opts}};
    return result;
  };

  controls.setScreenPattern=function(id,pattern,options={}){
    // Auto LED only needs to yield the main display. Side screens keep their normal
    // animated patterns so the image test still sits inside a live venue.
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
    const state=window.NocturneLedImageTest?.state||{};
    const brightness=Number.isFinite(state.brightness)?state.brightness:(held.options.brightness??.72);
    const fit=state.fit||held.options.fit||'cover';
    // setStageMode() can touch screens through the underlying StageEngine directly.
    // Reassert only when ownership was actually lost; otherwise do not redraw the image.
    if(main.patternName!=='media'||main.source!==held.content){
      try{rawContent('main',held.content,{...held.options,fit,brightness,playing:false});}catch{}
      return;
    }
    if(Math.abs((main.brightness??brightness)-brightness)>.006){
      try{main.setOptions?.({brightness});}catch{}
    }
  }

  window.addEventListener('nocturne-led-image-test-change',event=>{
    if(event.detail?.active===false)held=null;
  });
  requestAnimationFrame(tick);
  console.info('[LED image test] main-screen priority guard attached');
})();
