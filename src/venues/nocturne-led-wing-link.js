'use strict';

// Three-screen LED test linker.
// The main display keeps whichever Image / Video / Canvas test owns it. The two narrow
// 192x928 wing displays can then either crop the main source, mirror one crop, or run an
// independent vertical Canvas animation. Auto LED yields only the wing screens while a
// linked media test is active; lighting / camera / haze remain untouched.
(() => {
  const venue=window.VirtualBandVenues;
  const controls=venue?.controls;
  const menu=document.getElementById('venue-menu');
  if(!venue||!controls?.setScreenContent||!controls?.setScreenPattern||!menu)return;

  const W=192,H=928,TAU=Math.PI*2;
  const leftCanvas=document.createElement('canvas');leftCanvas.width=W;leftCanvas.height=H;
  const rightCanvas=document.createElement('canvas');rightCanvas.width=W;rightCanvas.height=H;
  const lctx=leftCanvas.getContext('2d',{alpha:false});
  const rctx=rightCanvas.getContext('2d',{alpha:false});

  const previousPattern=controls.setScreenPattern.bind(controls);
  const previousContent=controls.setScreenContent.bind(controls);
  let mode='sync',engaged=false,boundSource=null,lastFrame=0,time=0,raf=0;

  const panel=menu.querySelector('.venue-panel');if(!panel)return;
  const section=document.createElement('div');section.className='venue-led-wing-link';
  section.innerHTML=`
    <div class="led-wing-title"><strong>三屏联动</strong><small id="led-wing-status">等待主屏素材</small></div>
    <div class="led-wing-actions">
      <button data-led-wing="sync" type="button">同步裁切</button>
      <button data-led-wing="mirror" type="button">镜像辅助</button>
      <button data-led-wing="independent" type="button">独立动画</button>
    </div>
    <label class="led-wing-bright">侧屏亮度 <input id="led-wing-brightness" type="range" min="20" max="120" value="78"><span id="led-wing-brightness-value">78%</span></label>`;
  panel.appendChild(section);

  const style=document.createElement('style');style.id='venue-led-wing-link-style';style.textContent=`
    .venue-led-wing-link{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #cad9e016}
    .led-wing-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.led-wing-title strong{font-size:10px;font-weight:600;color:#dce7e5}.led-wing-title small{font-size:8px;color:#71858d}
    .led-wing-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.venue-led-wing-link button{height:30px;border:1px solid #cad9e023;border-radius:8px;background:#182830;color:#cfdad8;padding:0 5px;font-size:9px;cursor:pointer}.venue-led-wing-link button:hover{background:#223740}.venue-led-wing-link button.active{border-color:#8eb9b066;background:#284048;color:#eff7f4}
    .led-wing-bright{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:7px;color:#7f9298;font-size:8px}.led-wing-bright input{width:100%;accent-color:#b7c8c3}.led-wing-bright span{min-width:30px;text-align:right;color:#afbfbd}`;
  document.head.appendChild(style);

  const $=id=>document.getElementById(id),status=$('led-wing-status'),brightness=$('led-wing-brightness');
  const brightnessValue=()=>Math.max(.2,Math.min(1.2,(+brightness.value||78)/100));
  const setStatus=text=>{if(status)status.textContent=text;};
  const mainTestActive=()=>!!(window.NocturneLedImageTest?.active||window.NocturneLedVideoTest?.active||window.NocturneLedCanvasTest?.active);
  const mainScreen=()=>venue.stage?.screens?.get('main')||null;
  const sourceSize=src=>({
    w:src?.videoWidth||src?.naturalWidth||src?.width||0,
    h:src?.videoHeight||src?.naturalHeight||src?.height||0,
  });

  function setButtons(){for(const b of section.querySelectorAll('[data-led-wing]'))b.classList.toggle('active',b.dataset.ledWing===mode);}
  setButtons();

  function wingScreens(){return{left:venue.stage?.screens?.get('left'),right:venue.stage?.screens?.get('right')};}
  function applyWingContent(){
    if(!engaged||venue.current!=='nocturne')return;
    const b=brightnessValue();
    try{
      previousContent('left',leftCanvas,{fit:'cover',brightness:b,playing:true});
      previousContent('right',rightCanvas,{fit:'cover',brightness:b,playing:true});
    }catch(error){console.warn('[LED wing link] content attach failed',error);}
  }

  function clearCanvas(ctx,alpha=1){ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=alpha;ctx.fillStyle='#04060d';ctx.fillRect(0,0,W,H);ctx.restore();}

  function drawCrop(ctx,src,side,mirror=false){
    const {w:sw,h:sh}=sourceSize(src);if(!sw||!sh)return false;
    const cropW=Math.max(1,Math.min(sw,sh*(W/H)));
    let sx=side==='left'?0:sw-cropW;
    if(mode==='mirror')sx=Math.max(0,Math.min(sw-cropW,sw*.22-cropW*.5));
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    if(mirror){ctx.translate(W,0);ctx.scale(-1,1);}
    try{ctx.drawImage(src,sx,0,cropW,sh,0,0,W,H);}catch{ctx.restore();return false;}
    ctx.restore();return true;
  }

  function drawIndependent(ctx,side,t){
    clearCanvas(ctx,1);
    const mirror=side==='right'?-1:1;
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#06101c');g.addColorStop(.48,'#171337');g.addColorStop(1,'#05060d');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(let i=0;i<14;i++){
      const phase=t*(.34+i*.012)+i*.63;
      const x=W*.5+Math.sin(phase*1.7+i)*W*.34*mirror;
      const y=((i/14*H+t*(28+i*1.7))%(H+180))-90;
      const hue=190+(i*13+t*10)%105;
      ctx.strokeStyle=`hsla(${hue},95%,68%,${.16+(i%4)*.05})`;ctx.lineWidth=1.1+(i%3)*.8;
      ctx.beginPath();ctx.moveTo(x-28*mirror,y-115);ctx.bezierCurveTo(x+44*mirror,y-45,x-38*mirror,y+45,x+24*mirror,y+135);ctx.stroke();
    }
    for(let i=0;i<26;i++){
      const p=(t*(.08+(i%5)*.012)+i/26)%1,y=H*(1-p),x=W*(.5+.42*Math.sin(i*1.71+t*.5*mirror));
      const a=.08+.22*(1-p);ctx.fillStyle=`rgba(210,235,255,${a})`;ctx.beginPath();ctx.arc(x,y,1.1+(i%3)*.7,0,TAU);ctx.fill();
    }
    ctx.restore();
  }

  function restoreSides(){
    boundSource=null;
    try{
      if(window.AutoShowDirector?.running)window.AutoShowDirector.refresh?.();
      else{
        previousPattern('left','ribbons',{brightness:.66,playing:true,params:{text:false}});
        previousPattern('right','ribbons',{brightness:.66,playing:true,time:8,params:{text:false}});
      }
    }catch{}
  }

  function updateEngagement(){
    const should=venue.current==='nocturne'&&mainTestActive();
    if(should&&!engaged){engaged=true;boundSource=null;applyWingContent();setStatus(`侧屏 · ${mode==='sync'?'同步裁切':mode==='mirror'?'镜像辅助':'独立动画'}`);}
    else if(!should&&engaged){engaged=false;restoreSides();setStatus('等待主屏素材');}
    return should;
  }

  // Loaded after the main-media guard, so this is the highest temporary LED test layer.
  // When linked content is active, lower-priority Auto LED writes to either wing are
  // swallowed. Main-screen writes still pass to the existing guard unchanged.
  controls.setScreenPattern=function(id,pattern,options={}){
    if(engaged&&(id==='left'||id==='right'))return [venue.stage?.screens?.get(id)].filter(Boolean);
    if(engaged&&id==='all')return [venue.stage?.screens?.get('main')].filter(Boolean);
    return previousPattern(id,pattern,options);
  };

  function frame(now){
    raf=requestAnimationFrame(frame);
    const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    if(!updateEngagement())return;
    if(now-(frame._paint||0)<32)return;frame._paint=now;time+=dt;

    const src=mainScreen()?.source||window.NocturneLedCanvasTest?.canvas||null;
    if(mode!=='independent'&&!src){setStatus('主屏素材未就绪');return;}
    if(src!==boundSource||wingScreens().left?.source!==leftCanvas||wingScreens().right?.source!==rightCanvas){boundSource=src;applyWingContent();}

    if(mode==='sync'){
      drawCrop(lctx,src,'left',false);drawCrop(rctx,src,'right',false);
    }else if(mode==='mirror'){
      drawCrop(lctx,src,'left',false);drawCrop(rctx,src,'right',true);
    }else{
      drawIndependent(lctx,'left',time);drawIndependent(rctx,'right',time);
    }

    const b=brightnessValue();
    try{wingScreens().left?.setOptions?.({brightness:b});wingScreens().right?.setOptions?.({brightness:b});}catch{}
  }

  section.addEventListener('click',event=>{
    const b=event.target.closest('[data-led-wing]');if(!b)return;
    mode=b.dataset.ledWing;boundSource=null;setButtons();
    if(engaged){applyWingContent();setStatus(`侧屏 · ${mode==='sync'?'同步裁切':mode==='mirror'?'镜像辅助':'独立动画'}`);}
  });
  brightness?.addEventListener('input',()=>{const v=Math.round(brightnessValue()*100);$('led-wing-brightness-value').textContent=`${v}%`;if(engaged)try{wingScreens().left?.setOptions?.({brightness:v/100});wingScreens().right?.setOptions?.({brightness:v/100});}catch{}});
  window.addEventListener('virtual-band-venue-change',()=>{boundSource=null;});
  for(const name of['nocturne-led-image-test-change','nocturne-led-video-test-change','nocturne-led-canvas-test-change'])window.addEventListener(name,()=>requestAnimationFrame(updateEngagement));

  window.NocturneLedWingLink={
    get active(){return engaged;},
    get mode(){return mode;},
    setMode(value){if(['sync','mirror','independent'].includes(value)){mode=value;boundSource=null;setButtons();return true;}return false;},
    get canvases(){return{left:leftCanvas,right:rightCanvas};},
    get state(){return{active:engaged,mode,brightness:brightnessValue(),source:mainScreen()?.patternName||''};},
  };
  lastFrame=performance.now();raf=requestAnimationFrame(frame);
  console.info('[LED wing link] three-screen crop / mirror / independent Canvas test attached');
})();
