'use strict';

// Main-LED Canvas animation test bench.
// Visual concepts are reimplemented from scratch after three p5.js Examples themes:
// Kaleidoscope, Noise and Smoke Particles. We intentionally do not copy the example code
// or add p5.js as a runtime dependency; the purpose here is to validate the exact native
// Canvas -> NOCTURNE ScreenSurface -> CanvasTexture path used by future generated visuals.
(() => {
  const venue=window.VirtualBandVenues;
  const menu=document.getElementById('venue-menu');
  if(!venue||!menu)return;

  const W=1792,H=560,TAU=Math.PI*2;
  let active=false,mode='kaleidoscope',paused=false,lastNow=performance.now(),time=0,raf=0,drawAcc=0;
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d',{alpha:false});
  const particles=[];

  const panel=menu.querySelector('.venue-panel');if(!panel)return;
  const section=document.createElement('div');section.className='venue-led-canvas-test';
  section.innerHTML=`
    <div class="led-canvas-title"><strong>LED Canvas 测试</strong><small id="led-canvas-status">主屏 · 待机</small></div>
    <div class="led-canvas-actions">
      <button data-led-canvas="kaleidoscope" type="button">万花筒</button>
      <button data-led-canvas="noise" type="button">噪声流场</button>
      <button data-led-canvas="smoke" type="button">烟雾粒子</button>
    </div>
    <div class="led-canvas-row"><button id="led-canvas-pause" type="button" disabled>暂停动画</button><button id="led-canvas-restore" type="button">恢复动态</button></div>
    <label class="led-canvas-bright">亮度 <input id="led-canvas-brightness" type="range" min="20" max="120" value="72"><span id="led-canvas-brightness-value">72%</span></label>`;
  panel.appendChild(section);

  const style=document.createElement('style');style.id='venue-led-canvas-test-style';style.textContent=`
    .venue-panel{max-height:calc(100vh - 72px);overflow-y:auto;overscroll-behavior:contain}
    .venue-led-canvas-test{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #cad9e016}
    .led-canvas-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.led-canvas-title strong{font-size:10px;font-weight:600;color:#dce7e5}.led-canvas-title small{font-size:8px;color:#71858d}
    .led-canvas-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.led-canvas-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .venue-led-canvas-test button{height:30px;border:1px solid #cad9e023;border-radius:8px;background:#182830;color:#cfdad8;padding:0 6px;font-size:9px;cursor:pointer}.venue-led-canvas-test button:hover:not(:disabled){background:#223740}.venue-led-canvas-test button.active{border-color:#8eb9b066;background:#284048;color:#eff7f4}.venue-led-canvas-test button:disabled{opacity:.42;cursor:default}
    .led-canvas-bright{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:7px;color:#7f9298;font-size:8px}.led-canvas-bright input{width:100%;accent-color:#b7c8c3}.led-canvas-bright span{min-width:30px;text-align:right;color:#afbfbd}`;
  document.head.appendChild(style);

  const $=id=>document.getElementById(id),status=$('led-canvas-status'),pause=$('led-canvas-pause'),brightness=$('led-canvas-brightness');
  const brightnessValue=()=>Math.max(.2,Math.min(1.2,(+brightness.value||72)/100));
  const setStatus=text=>{if(status)status.textContent=text;};
  const labels={kaleidoscope:'万花筒',noise:'噪声流场',smoke:'烟雾粒子'};
  const fire=()=>window.dispatchEvent(new CustomEvent('nocturne-led-canvas-test-change',{detail:{active,mode,paused,brightness:brightnessValue()}}));

  function rand01(n){const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);}
  function smoothstep(t){return t*t*(3-2*t);}
  function noise2(x,y,z=0){
    // Tiny deterministic value-noise field: enough for an LED flow test without bringing
    // p5's noise implementation into the project.
    const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=smoothstep(xf),v=smoothstep(yf);
    const h=(a,b)=>rand01(a*127.1+b*311.7+z*17.17);
    const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
    return (a+(b-a)*u)+((c+(d-c)*u)-(a+(b-a)*u))*v;
  }

  function clear(fill='#05060d',alpha=1){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=alpha;ctx.fillStyle=fill;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}

  function drawKaleidoscope(t){
    clear('#05060d',.14);
    ctx.save();ctx.translate(W/2,H/2);ctx.globalCompositeOperation='lighter';
    const sectors=12,step=TAU/sectors,r=Math.hypot(W,H)*.42;
    for(let s=0;s<sectors;s++){
      ctx.save();ctx.rotate(s*step+(s&1?step:0));if(s&1)ctx.scale(1,-1);
      for(let j=0;j<7;j++){
        const phase=t*.38+j*.72;
        const rr=70+j*58+Math.sin(phase*1.3+j)*28;
        const y=Math.sin(phase+j*.55)*70;
        const hue=(205+j*22+s*3+t*13)%360;
        ctx.strokeStyle=`hsla(${hue},92%,66%,${.16+j*.045})`;ctx.lineWidth=2+j*.34;
        ctx.beginPath();ctx.moveTo(18,y*.15);
        ctx.bezierCurveTo(rr*.32,y-58,rr*.72,y+58,Math.min(r,rr+220),Math.sin(phase*.72)*90);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalCompositeOperation='source-over';
  }

  function drawNoise(t){
    clear('#050814',1);
    const cols=72,rows=24,cw=W/cols,ch=H/rows;
    ctx.globalCompositeOperation='lighter';
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const n=noise2(x*.115+t*.11,y*.14-t*.055,Math.floor(t*.08));
        const n2=noise2(x*.08-t*.035,y*.10+t*.07,37+Math.floor(t*.05));
        const angle=(n-.5)*TAU*1.8+t*.22;
        const len=5+n2*18;
        const px=(x+.5)*cw,py=(y+.5)*ch;
        const hue=185+n*105+t*6;
        ctx.strokeStyle=`hsla(${hue},92%,64%,${.10+n*.42})`;ctx.lineWidth=.7+n*2.2;
        ctx.beginPath();ctx.moveTo(px-Math.cos(angle)*len,py-Math.sin(angle)*len);ctx.lineTo(px+Math.cos(angle)*len,py+Math.sin(angle)*len);ctx.stroke();
      }
    }
    ctx.globalCompositeOperation='source-over';
    const g=ctx.createLinearGradient(0,0,W,0);g.addColorStop(0,'rgba(0,0,0,.30)');g.addColorStop(.5,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.30)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }

  function spawnSmoke(t){
    const count=3;
    for(let i=0;i<count;i++){
      const seed=t*1000+i+particles.length*7.1;
      particles.push({
        x:W*.18+rand01(seed)*W*.10,
        y:H*.82+(rand01(seed+3)-.5)*30,
        vx:25+rand01(seed+7)*48,
        vy:-24-rand01(seed+11)*38,
        life:0,max:2.8+rand01(seed+13)*2.2,
        size:15+rand01(seed+17)*28,
        hue:185+rand01(seed+19)*120,
        wobble:rand01(seed+23)*TAU,
      });
    }
    while(particles.length>220)particles.shift();
  }
  function drawSmoke(t,dt){
    clear('#060713',.18);spawnSmoke(t);
    ctx.globalCompositeOperation='lighter';
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];p.life+=dt;if(p.life>=p.max){particles.splice(i,1);continue;}
      const age=p.life/p.max;p.vx+=Math.sin(t*1.8+p.wobble)*dt*9;p.vy-=dt*2.5;p.x+=p.vx*dt;p.y+=p.vy*dt;
      const r=p.size*(1+age*2.5),a=(1-age)*.22;
      const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);grad.addColorStop(0,`hsla(${p.hue},95%,68%,${a})`);grad.addColorStop(.42,`hsla(${p.hue+20},90%,58%,${a*.55})`);grad.addColorStop(1,`hsla(${p.hue+40},80%,45%,0)`);
      ctx.fillStyle=grad;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
  }

  function drawFrame(dt){
    if(mode==='kaleidoscope')drawKaleidoscope(time);
    else if(mode==='noise')drawNoise(time);
    else drawSmoke(time,dt);
  }

  function apply(){
    if(!active||venue.current!=='nocturne')return false;
    try{
      venue.controls?.setScreenContent?.('main',canvas,{fit:'cover',brightness:brightnessValue(),playing:true});
      setStatus(`主屏 · ${labels[mode]} · Canvas`);
      return true;
    }catch(error){console.warn('[LED Canvas test]',error);setStatus('Canvas 显示失败');return false;}
  }

  function setActiveMode(next){
    if(!labels[next])return false;
    // One main-screen test owner at a time.
    if(window.NocturneLedImageTest?.active)window.NocturneLedImageTest.restore?.();
    if(window.NocturneLedVideoTest?.active)window.NocturneLedVideoTest.restore?.();
    mode=next;active=true;paused=false;time=0;drawAcc=0;lastNow=performance.now();particles.length=0;clear('#05060d',1);drawFrame(1/30);apply();
    pause.disabled=false;pause.textContent='暂停动画';
    for(const b of section.querySelectorAll('[data-led-canvas]'))b.classList.toggle('active',b.dataset.ledCanvas===mode);
    fire();return true;
  }

  function togglePause(){
    if(!active)return;
    paused=!paused;pause.textContent=paused?'继续动画':'暂停动画';setStatus(`主屏 · ${labels[mode]} · ${paused?'暂停':'Canvas'}`);fire();
  }

  function release({restoreDynamic=true}={}){
    if(!active)return false;
    active=false;paused=false;particles.length=0;pause.disabled=true;pause.textContent='暂停动画';for(const b of section.querySelectorAll('[data-led-canvas]'))b.classList.remove('active');fire();
    if(restoreDynamic){
      if(window.AutoShowDirector?.running)window.AutoShowDirector.refresh?.();
      else if(venue.current==='nocturne')try{venue.controls?.setScreenPattern?.('main','orbital',{brightness:.85,playing:true});}catch{}
      setStatus('主屏 · 动态');
    }else setStatus('主屏 · 待机');
    return true;
  }

  function loop(frameNow){
    raf=requestAnimationFrame(loop);
    const dt=Math.min(.05,Math.max(0,(frameNow-lastNow)/1000));lastNow=frameNow;
    if(!active||paused||venue.current!=='nocturne')return;
    drawAcc+=dt;if(drawAcc<1/30)return;
    const step=Math.min(.05,drawAcc);drawAcc=0;time+=step;drawFrame(step);
    // ScreenSurface reads this Canvas as media at its own ~30fps cadence. Matching that
    // cadence avoids spending extra CPU/GPU work on frames the LED surface would skip.
  }

  section.addEventListener('click',event=>{const b=event.target.closest('[data-led-canvas]');if(b)setActiveMode(b.dataset.ledCanvas);});
  pause?.addEventListener('click',togglePause);
  $('led-canvas-restore')?.addEventListener('click',()=>release({restoreDynamic:true}));
  brightness?.addEventListener('input',()=>{const v=Math.round(brightnessValue()*100);$('led-canvas-brightness-value').textContent=`${v}%`;if(active)try{venue.stage?.screens?.get('main')?.setOptions?.({brightness:v/100});}catch{}fire();});
  window.addEventListener('virtual-band-venue-change',event=>{if(event.detail?.id==='nocturne'&&active)requestAnimationFrame(apply);});
  window.addEventListener('nocturne-led-image-test-change',event=>{if(event.detail?.active&&active)release({restoreDynamic:false});});
  window.addEventListener('nocturne-led-video-test-change',event=>{if(event.detail?.active&&active)release({restoreDynamic:false});});

  window.NocturneLedCanvasTest={
    get active(){return active;},
    show:setActiveMode,
    restore(){return release({restoreDynamic:true});},
    pause:togglePause,
    get canvas(){return canvas;},
    get state(){return{active,mode,paused,brightness:brightnessValue(),width:W,height:H};},
  };
  raf=requestAnimationFrame(loop);
  console.info('[LED Canvas test] p5-inspired Kaleidoscope / Noise / Smoke examples attached');
})();
