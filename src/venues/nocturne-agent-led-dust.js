'use strict';

// Queen · Another One Bites the Dust — three-screen Agent LED arrangement.
// Uses the MIDI-derived cue plan from AgentLightingDust as the macro timeline, then
// renders a restrained groove-noir visual language into the authored main + wing LED
// ScreenSurfaces. Temporary image/video/Canvas test benches always keep higher priority.
(() => {
  const SONG_ID='dust';
  const songs=window.VIRTUAL_BAND_SONGS||{};
  const venue=window.VirtualBandVenues;
  const controls=venue?.controls;
  const songSelect=document.getElementById('bp-song');
  const modeSelect=document.getElementById('bp-mode');
  const playButton=document.getElementById('bp-play');
  const progress=document.getElementById('bp-progress');
  if(!venue||!controls?.setScreenContent||!songs[SONG_ID]||!songSelect||!playButton||!progress)return;

  const MAIN_W=1792,MAIN_H=560,WING_W=192,WING_H=928,TAU=Math.PI*2;
  const mainCanvas=document.createElement('canvas');mainCanvas.width=MAIN_W;mainCanvas.height=MAIN_H;
  const leftCanvas=document.createElement('canvas');leftCanvas.width=WING_W;leftCanvas.height=WING_H;
  const rightCanvas=document.createElement('canvas');rightCanvas.width=WING_W;rightCanvas.height=WING_H;
  const ctx=mainCanvas.getContext('2d',{alpha:false});
  const lctx=leftCanvas.getContext('2d',{alpha:false});
  const rctx=rightCanvas.getContext('2d',{alpha:false});

  const LOOK={black:'#050507',ink:'#09090d',red:'#b8323c',deepRed:'#631821',white:'#f4f0e7',steel:'#788391',blue:'#465a78'};
  const brightness={main:.74,wing:.78};
  let running=false,suspended=false,plan=null,cueIndex=-1,currentCue=null,currentScene='intro',lastTime=0,lastBar=-1,eventPtr=0;
  let bassPulse=0,kickPulse=0,snarePulse=0,crashPulse=0,sceneAge=0,lastFrame=performance.now(),lastPaint=0,raf=0;

  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const bpmOf=s=>{const m=String(s?.bpm??'').match(/[\d.]+/);const n=m?Number(m[0]):110;return Number.isFinite(n)&&n>20?n:110;};
  const drumKind=n=>[35,36].includes(n)?'kick':[37,38,39,40].includes(n)?'snare':[49,52,55,57].includes(n)?'crash':'other';
  const mediaTestActive=()=>!!(window.NocturneLedImageTest?.active||window.NocturneLedVideoTest?.active||window.NocturneLedCanvasTest?.active);

  function songTime(song){
    const pct=clamp(parseFloat(progress.style.width)||0,0,100);
    return clamp((Number(song.duration)||0)*pct/100,0,Number(song.duration)||0);
  }
  function isPlaying(){
    return venue.current==='nocturne'&&modeSelect?.value==='song'&&songSelect.value===SONG_ID&&(/停止/.test(playButton.textContent||'')||/^■/.test((playButton.textContent||'').trim()));
  }
  function lowerBound(events,t){let lo=0,hi=events.length;while(lo<hi){const m=(lo+hi)>>1;if((+events[m].s||0)<t)lo=m+1;else hi=m;}return lo;}

  function sceneFor(cue,index,total){
    if(index===0)return'intro';
    switch(cue?.style){
      case'opening-lock':case'bass-lock':return'bass';
      case'groove-left':case'groove-right':return'groove';
      case'stagger-groove':case'cross-groove':return'split';
      case'build-fan':return'rise';
      case'knife-drive':return'knife';
      case'knife-hit':return'impact';
      case'climax-grid':return'anthem';
      case'void':case'outro-shadow':return index>=total-2?'outro':'void';
      default:return cue?.energy>.78?'anthem':cue?.energy>.55?'knife':'groove';
    }
  }

  function buildPlan(){
    const lighting=window.AgentLightingDust?.plan;
    const bpm=lighting?.bpm||bpmOf(songs[SONG_ID]);
    const beat=60/bpm,bar=beat*4;
    let cues=(lighting?.cues||[]).map((cue,index,arr)=>({...cue,scene:sceneFor(cue,index,arr.length)}));
    if(!cues.length){
      const bars=Math.max(1,Math.ceil((Number(songs[SONG_ID].duration)||1)/bar));
      cues=[];for(let b=0;b<bars;b+=4){const q=b/Math.max(1,bars-1);const style=q<.12?'opening-lock':q<.35?'groove-left':q<.58?'cross-groove':q<.78?'knife-drive':q<.93?'climax-grid':'outro-shadow';cues.push({bar:b,time:b*bar,endBar:Math.min(bars,b+4),style,energy:clamp(.28+q*.68,0,1),focus:'bass',scene:sceneFor({style,energy:.28+q*.68},cues.length,Math.ceil(bars/4))});}
    }
    return{song:SONG_ID,bpm,beat,bar,cues,events:[...(songs[SONG_ID].events||[])].sort((a,b)=>(+a.s||0)-(+b.s||0))};
  }

  function cueAtBar(bar){
    const cues=plan?.cues||[];let lo=0,hi=cues.length;
    while(lo<hi){const m=(lo+hi)>>1;if((cues[m].bar||0)<=bar)lo=m+1;else hi=m;}
    return Math.max(0,lo-1);
  }

  function screens(){return{main:venue.stage?.screens?.get('main'),left:venue.stage?.screens?.get('left'),right:venue.stage?.screens?.get('right')};}
  function attach(){
    if(!running||mediaTestActive()||venue.current!=='nocturne')return false;
    try{
      controls.setScreenContent('main',mainCanvas,{fit:'cover',brightness:brightness.main,playing:true});
      controls.setScreenContent('left',leftCanvas,{fit:'cover',brightness:brightness.wing,playing:true});
      controls.setScreenContent('right',rightCanvas,{fit:'cover',brightness:brightness.wing,playing:true});
      return true;
    }catch(error){console.warn('[Agent LED · Dust] attach failed',error);return false;}
  }
  function ensureOwnership(){
    if(!running||mediaTestActive()||venue.current!=='nocturne')return;
    const s=screens();
    if(s.main?.source!==mainCanvas||s.left?.source!==leftCanvas||s.right?.source!==rightCanvas)attach();
  }

  function clear(c,w,h,color=LOOK.black){c.save();c.globalCompositeOperation='source-over';c.globalAlpha=1;c.fillStyle=color;c.fillRect(0,0,w,h);c.restore();}
  function trackText(c,text,x,y,size,spacing,color,align='center'){
    c.save();c.font=`900 ${size}px Arial Black, Impact, sans-serif`;c.fillStyle=color;c.textBaseline='middle';
    const chars=[...text],width=chars.reduce((sum,ch)=>sum+c.measureText(ch).width,0)+spacing*Math.max(0,chars.length-1);
    let px=align==='center'?x-width/2:align==='right'?x-width:x;
    for(const ch of chars){c.fillText(ch,px,y);px+=c.measureText(ch).width+spacing;}
    c.restore();
  }
  function vignette(){
    const g=ctx.createRadialGradient(MAIN_W*.5,MAIN_H*.48,MAIN_H*.12,MAIN_W*.5,MAIN_H*.48,MAIN_W*.60);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.58)');ctx.fillStyle=g;ctx.fillRect(0,0,MAIN_W,MAIN_H);
  }
  function beatInfo(t){const beat=plan?.beat||.5;const phase=(t%beat)/beat;return{phase,pulse:Math.exp(-phase*7.5),beat};}

  function drawIntro(t,cue){
    clear(ctx,MAIN_W,MAIN_H,'#040406');const b=beatInfo(t),e=cue?.energy||.3;
    ctx.save();ctx.globalCompositeOperation='lighter';
    const mid=MAIN_H*.52;
    for(let i=0;i<11;i++){
      const off=(i-5)*20,amp=18+e*46+b.pulse*18;
      ctx.strokeStyle=i===5?'rgba(244,240,231,.58)':`rgba(184,50,60,${.06+Math.abs(5-i)*.008})`;ctx.lineWidth=i===5?2.2:1;
      ctx.beginPath();
      for(let x=0;x<=MAIN_W;x+=18){const y=mid+off+Math.sin(x*.012+t*2.7+i*.43)*amp*(i===5?1:.45);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
    }
    ctx.restore();trackText(ctx,'QUEEN',MAIN_W*.5,MAIN_H*.30,28,10,'rgba(244,240,231,.72)');trackText(ctx,'ANOTHER ONE BITES THE DUST',MAIN_W*.5,MAIN_H*.73,34,5,'rgba(120,131,145,.42)');vignette();
  }

  function drawBass(t,cue){
    clear(ctx,MAIN_W,MAIN_H,'#050507');const b=beatInfo(t),p=Math.max(bassPulse,b.pulse*.48),e=cue?.energy||.42;
    const y=MAIN_H*.50,barW=MAIN_W*(.08+.16*p+.06*e);
    ctx.fillStyle=`rgba(184,50,60,${.18+.38*p})`;ctx.fillRect(MAIN_W*.5-barW,y-3,barW*2,6);
    ctx.strokeStyle=`rgba(244,240,231,${.18+.34*p})`;ctx.lineWidth=1.5;ctx.beginPath();
    for(let x=0;x<=MAIN_W;x+=12){const d=Math.abs(x-MAIN_W*.5)/(MAIN_W*.5),amp=(1-d)*48*(.35+p);const yy=y+Math.sin(x*.018+t*5.4)*amp;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}ctx.stroke();
    for(let i=0;i<6;i++){const r=55+i*58+p*46;ctx.strokeStyle=`rgba(99,24,33,${.18-i*.018})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(MAIN_W*.5,y,r*2.7,r,0,0,TAU);ctx.stroke();}
    trackText(ctx,'BASS / GROOVE',70,52,20,3,'rgba(120,131,145,.55)','left');vignette();
  }

  function drawGroove(t,cue){
    clear(ctx,MAIN_W,MAIN_H,'#060609');const mirror=cue?.style==='groove-left'?-1:1,b=beatInfo(t),e=cue?.energy||.5;
    ctx.save();ctx.translate(MAIN_W*.5,MAIN_H*.5);ctx.globalCompositeOperation='lighter';
    for(let i=-8;i<=8;i++){
      const x=i*112+((t*90*mirror)%112),w=18+(i&1?8:0);ctx.save();ctx.rotate(mirror*.22);ctx.fillStyle=`rgba(${i%3===0?'244,240,231':'184,50,60'},${.055+e*.07+b.pulse*.035})`;ctx.fillRect(x-10,-MAIN_H,w,MAIN_H*2);ctx.restore();
    }
    ctx.restore();
    for(let y=50;y<MAIN_H;y+=58){ctx.strokeStyle='rgba(120,131,145,.065)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(MAIN_W,y);ctx.stroke();}
    trackText(ctx,mirror<0?'← GROOVE':'GROOVE →',MAIN_W*.5,MAIN_H*.50,48,8,'rgba(244,240,231,.16)');vignette();
  }

  function drawSplit(t,cue){
    clear(ctx,MAIN_W,MAIN_H,'#050507');const b=beatInfo(t),e=cue?.energy||.58;
    ctx.save();ctx.translate(MAIN_W*.5,MAIN_H*.5);ctx.globalCompositeOperation='lighter';
    for(let side of[-1,1])for(let i=0;i<7;i++){
      const r=70+i*58+Math.sin(t*1.6+i*.8)*18;ctx.strokeStyle=side<0?`rgba(184,50,60,${.13+e*.05})`:`rgba(120,131,145,${.10+e*.05})`;ctx.lineWidth=1.5+(i%3)*.5;
      ctx.beginPath();ctx.arc(side*170,0,r,-1.08,1.08);ctx.stroke();
    }
    ctx.restore();ctx.fillStyle=`rgba(244,240,231,${.08+.17*b.pulse})`;ctx.fillRect(MAIN_W*.5-1,0,2,MAIN_H);vignette();
  }

  function drawRise(t,cue){
    clear(ctx,MAIN_W,MAIN_H,'#050609');const b=beatInfo(t),e=cue?.energy||.68;
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(let i=0;i<10;i++){
      const phase=(t*.18+i/10)%1,r=80+phase*760;ctx.strokeStyle=i%2?`rgba(184,50,60,${.20*(1-phase)})`:`rgba(70,90,120,${.18*(1-phase)})`;ctx.lineWidth=1+e*2;ctx.beginPath();ctx.ellipse(MAIN_W*.5,MAIN_H*.56,r*1.9,r*.38,0,0,TAU);ctx.stroke();
    }
    ctx.restore();trackText(ctx,'RISE',MAIN_W*.5,MAIN_H*.49,72,18,`rgba(244,240,231,${.12+.20*b.pulse})`);vignette();
  }

  function drawKnife(t,cue){
    clear(ctx,MAIN_W,MAIN_H,'#070609');const b=beatInfo(t),e=cue?.energy||.72;
    ctx.save();ctx.translate(MAIN_W*.5,MAIN_H*.5);ctx.rotate(-.28);ctx.globalCompositeOperation='lighter';
    for(let i=-8;i<=8;i++){const x=i*125+((t*155)%125);ctx.fillStyle=i%4===0?`rgba(244,240,231,${.08+.15*snarePulse})`:`rgba(184,50,60,${.07+e*.06})`;ctx.fillRect(x,-MAIN_H,20+(i%3)*8,MAIN_H*2);}ctx.restore();
    ctx.strokeStyle=`rgba(244,240,231,${.15+.34*b.pulse})`;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,MAIN_H*.70);ctx.lineTo(MAIN_W,MAIN_H*.32);ctx.stroke();vignette();
  }

  function drawImpact(t){
    clear(ctx,MAIN_W,MAIN_H,'#090508');const hit=Math.max(snarePulse,crashPulse,kickPulse),scale=1+hit*.08;
    ctx.save();ctx.translate(MAIN_W*.5,MAIN_H*.50);ctx.scale(scale,scale);ctx.shadowColor='rgba(184,50,60,.85)';ctx.shadowBlur=42;trackText(ctx,'DUST',0,0,190,18,LOOK.white);ctx.restore();
    ctx.fillStyle=`rgba(184,50,60,${.10+.28*hit})`;for(let i=0;i<18;i++){const x=(i/18)*MAIN_W+Math.sin(i*4.2+t*6)*35;ctx.fillRect(x,0,4+(i%4)*2,MAIN_H);}vignette();
  }

  function drawAnthem(t,cue){
    clear(ctx,MAIN_W,MAIN_H,'#080609');const b=beatInfo(t),hit=Math.max(crashPulse,snarePulse,b.pulse*.55),e=cue?.energy||.9;
    ctx.fillStyle=`rgba(99,24,33,${.22+e*.18})`;ctx.fillRect(0,MAIN_H*.16,MAIN_W,MAIN_H*.68);
    ctx.save();ctx.translate(MAIN_W*.5,MAIN_H*.51);ctx.scale(1+hit*.035,1+hit*.035);ctx.shadowColor='rgba(184,50,60,.65)';ctx.shadowBlur=32;
    trackText(ctx,'ANOTHER ONE',0,-72,74,9,LOOK.white);trackText(ctx,'BITES THE DUST',0,48,112,8,LOOK.white);ctx.restore();
    trackText(ctx,'QUEEN',MAIN_W*.5,MAIN_H*.84,22,10,'rgba(120,131,145,.72)');
    ctx.strokeStyle=`rgba(244,240,231,${.14+.30*hit})`;ctx.lineWidth=2;for(let i=0;i<9;i++){const x=(i+1)*MAIN_W/10;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,MAIN_H);ctx.stroke();}vignette();
  }

  function drawVoid(t,outro=false){
    clear(ctx,MAIN_W,MAIN_H,'#030304');const b=beatInfo(t);const alpha=outro?.20:.34;
    for(let i=0;i<58;i++){const x=(Math.sin(i*91.77)*.5+.5)*MAIN_W,y=(Math.sin(i*37.13+t*.18)*.5+.5)*MAIN_H,r=1+(i%4)*.7;ctx.fillStyle=`rgba(120,131,145,${alpha*(.25+(i%5)/6)})`;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
    ctx.fillStyle=`rgba(184,50,60,${outro?.08:.14+.12*b.pulse})`;ctx.fillRect(MAIN_W*.18,MAIN_H*.51,MAIN_W*.64,1.5);
    if(outro)trackText(ctx,'QUEEN',MAIN_W*.5,MAIN_H*.48,28,12,'rgba(244,240,231,.18)');vignette();
  }

  function drawMain(t){
    const cue=currentCue||{};
    switch(currentScene){
      case'intro':drawIntro(t,cue);break;case'bass':drawBass(t,cue);break;case'groove':drawGroove(t,cue);break;case'split':drawSplit(t,cue);break;case'rise':drawRise(t,cue);break;case'knife':drawKnife(t,cue);break;case'impact':drawImpact(t,cue);break;case'anthem':drawAnthem(t,cue);break;case'void':drawVoid(t,false);break;default:drawVoid(t,true);break;
    }
    const fade=clamp(1-sceneAge/Math.max(.18,(plan?.beat||.5)*.42),0,1);if(fade>0){ctx.fillStyle=`rgba(0,0,0,${fade*.62})`;ctx.fillRect(0,0,MAIN_W,MAIN_H);}
    const flash=clamp(crashPulse*.34+snarePulse*.10,0,.36);if(flash>0){ctx.fillStyle=`rgba(255,255,255,${flash})`;ctx.fillRect(0,0,MAIN_W,MAIN_H);}
  }

  function wingBackground(c){clear(c,WING_W,WING_H,'#040407');const g=c.createLinearGradient(0,0,0,WING_H);g.addColorStop(0,'rgba(70,90,120,.14)');g.addColorStop(.5,'rgba(99,24,33,.18)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,WING_W,WING_H);}
  function wingWords(c,words,red=false){
    wingBackground(c);const total=words.length,step=WING_H/(total+1);words.forEach((w,i)=>{const size=Math.min(42,Math.max(21,150/Math.max(3,w.length)));trackText(c,w,WING_W*.5,step*(i+1),size,1,red&&i===total-1?LOOK.red:LOOK.white);});
  }
  function wingAbstract(c,side,t,kind){
    wingBackground(c);c.save();c.globalCompositeOperation='lighter';const sign=side==='left'?-1:1;
    if(kind==='bass'||kind==='intro'){
      for(let i=0;i<9;i++){const x=WING_W*.5+Math.sin(t*1.5+i*.72)*46*sign,y=(i+.5)*WING_H/9,r=7+20*Math.max(bassPulse,kickPulse*.6);c.strokeStyle=i%2?'rgba(184,50,60,.32)':'rgba(120,131,145,.25)';c.lineWidth=1.5;c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();}
    }else if(kind==='groove'||kind==='knife'){
      c.rotate(sign*.11);for(let i=-4;i<18;i++){const y=i*70+((t*110)%70);c.fillStyle=i%4===0?'rgba(244,240,231,.16)':'rgba(184,50,60,.13)';c.fillRect(-30,y,260,9+(i%3)*4);}
    }else{
      for(let i=0;i<12;i++){const phase=(t*.15+i/12)%1,y=WING_H*(1-phase),x=WING_W*.5+Math.sin(i*1.7+t*.55)*62*sign;c.strokeStyle=i%2?'rgba(184,50,60,.22)':'rgba(120,131,145,.18)';c.beginPath();c.moveTo(WING_W*.5,WING_H);c.quadraticCurveTo(x,y+120,x,y);c.stroke();}
    }
    c.restore();
  }
  function drawWings(t){
    if(currentScene==='anthem'){wingWords(lctx,['ANOTHER','ONE'],false);wingWords(rctx,['BITES','THE','DUST'],true);return;}
    if(currentScene==='impact'){wingWords(lctx,['ANOTHER','ONE'],false);wingWords(rctx,['DUST'],true);return;}
    if(currentScene==='outro'){wingWords(lctx,['QUEEN'],false);wingWords(rctx,['DUST'],true);return;}
    wingAbstract(lctx,'left',t,currentScene);wingAbstract(rctx,'right',t,currentScene);
  }

  function setCue(index){
    cueIndex=clamp(index,0,Math.max(0,(plan?.cues?.length||1)-1));currentCue=plan?.cues?.[cueIndex]||null;currentScene=currentCue?.scene||'groove';sceneAge=0;
    console.info('[Agent LED · Dust] cue',{index:cueIndex,bar:currentCue?.bar,style:currentCue?.style,scene:currentScene,energy:+(currentCue?.energy||0).toFixed(2)});
  }

  function begin(){
    plan=buildPlan();running=true;suspended=mediaTestActive();lastTime=songTime(songs[SONG_ID]);lastBar=-1;eventPtr=lowerBound(plan.events,Math.max(0,lastTime-.03));
    const bar=Math.max(0,Math.floor(lastTime/plan.bar));setCue(cueAtBar(bar));lastBar=bar;bassPulse=kickPulse=snarePulse=crashPulse=0;
    if(!suspended)attach();
    console.info('[Agent LED · Dust] Queen three-screen arrangement started',{cues:plan.cues.length,bpm:plan.bpm,priority:'media test > Agent LED > Auto LED'});
  }
  function stop(){
    if(!running)return;running=false;suspended=false;plan=null;cueIndex=-1;currentCue=null;lastBar=-1;eventPtr=0;
    if(!mediaTestActive()){
      if(window.AutoShowDirector?.running)window.AutoShowDirector.refresh?.();
      else if(venue.current==='nocturne')try{controls.setScreenPattern('all','orbital',{brightness:.78,playing:true});}catch{}
    }
    console.info('[Agent LED · Dust] released to Auto LED');
  }

  function processEvents(t){
    if(!plan)return;
    if(t<lastTime-.18||t>lastTime+.8)eventPtr=lowerBound(plan.events,Math.max(0,t-.03));
    while(eventPtr<plan.events.length&&(+plan.events[eventPtr].s||0)<=t+.035){
      const ev=plan.events[eventPtr++],et=+ev.s||0;if(et<lastTime-.05)continue;const vel=clamp((+ev.v||90)/127,0,1);
      if(ev.i==='bass')bassPulse=Math.max(bassPulse,vel);
      if(ev.i==='drums'){const kind=drumKind(+ev.n);if(kind==='kick')kickPulse=Math.max(kickPulse,vel);else if(kind==='snare')snarePulse=Math.max(snarePulse,vel);else if(kind==='crash')crashPulse=Math.max(crashPulse,vel);}
    }
  }

  function frame(now){
    raf=requestAnimationFrame(frame);
    const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    if(!isPlaying()){if(running)stop();return;}
    if(!running)begin();
    if(!plan)return;

    const testNow=mediaTestActive();
    if(testNow){suspended=true;lastTime=songTime(songs[SONG_ID]);return;}
    if(suspended){suspended=false;attach();sceneAge=0;}

    const t=songTime(songs[SONG_ID]);processEvents(t);
    const bar=Math.max(0,Math.floor(t/plan.bar));
    if(bar!==lastBar){lastBar=bar;const next=cueAtBar(bar);if(next!==cueIndex)setCue(next);ensureOwnership();}
    else ensureOwnership();

    bassPulse*=Math.exp(-dt*8.5);kickPulse*=Math.exp(-dt*11);snarePulse*=Math.exp(-dt*13);crashPulse*=Math.exp(-dt*5.5);sceneAge+=dt;
    if(now-lastPaint>=32){lastPaint=now;drawMain(t);drawWings(t);}
    lastTime=t;
  }

  window.AgentLedDust={
    get running(){return running;},
    get suspended(){return suspended;},
    get cue(){return currentCue?{...currentCue}:null;},
    get state(){return{running,suspended,scene:currentScene,cueIndex,bar:lastBar,priority:'media test > Agent LED > Auto LED'};},
    get plan(){const p=plan||buildPlan();return{song:p.song,bpm:p.bpm,cues:p.cues.map(c=>({...c}))};},
    refresh(){if(running&&!mediaTestActive()){attach();sceneAge=0;}},
  };

  lastFrame=performance.now();raf=requestAnimationFrame(frame);
  console.info('[Agent LED · Dust] Queen-specific main + wing LED planner attached');
})();
