'use strict';

// Main-LED local-video test bench. Uses the donated ScreenSurface media path directly,
// keeps video muted/looping so it never competes with the MIDI audio, and yields back to
// Auto LED when restored. No video bytes are committed to the repository.
(() => {
  const venue=window.VirtualBandVenues;
  const menu=document.getElementById('venue-menu');
  if(!venue||!menu)return;

  let active=false,video=null,objectUrl='',currentLabel='';
  const panel=menu.querySelector('.venue-panel');if(!panel)return;
  const section=document.createElement('div');section.className='venue-led-video-test';
  section.innerHTML=`<div class="led-video-title"><strong>LED 视频测试</strong><small id="led-video-test-status">主屏 · 待机</small></div><div class="led-video-actions"><button id="led-video-local" type="button">本地视频</button><button id="led-video-pause" type="button" disabled>暂停视频</button></div><div class="led-video-row"><select id="led-video-fit" aria-label="LED 视频适配"><option value="cover">Cover · 铺满</option><option value="contain">Contain · 完整</option></select><button id="led-video-restore" type="button">恢复动态</button></div><label class="led-video-bright">亮度 <input id="led-video-brightness" type="range" min="20" max="120" value="72"><span id="led-video-brightness-value">72%</span></label><input id="led-video-file" type="file" accept="video/mp4,video/webm,video/ogg,video/*" hidden>`;
  panel.appendChild(section);

  const style=document.createElement('style');style.id='venue-led-video-test-style';style.textContent=`.venue-led-video-test{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #cad9e016}.led-video-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.led-video-title strong{font-size:10px;font-weight:600;color:#dce7e5}.led-video-title small{font-size:8px;color:#71858d}.led-video-actions,.led-video-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}.venue-led-video-test button,.venue-led-video-test select{height:30px;border:1px solid #cad9e023;border-radius:8px;background:#182830;color:#cfdad8;padding:0 8px;font-size:9px;cursor:pointer}.venue-led-video-test button:hover:not(:disabled){background:#223740}.venue-led-video-test button:disabled{opacity:.42;cursor:default}.led-video-bright{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:7px;color:#7f9298;font-size:8px}.led-video-bright input{width:100%;accent-color:#b7c8c3}.led-video-bright span{min-width:30px;text-align:right;color:#afbfbd}`;document.head.appendChild(style);

  const $=id=>document.getElementById(id),fit=$('led-video-fit'),brightness=$('led-video-brightness'),status=$('led-video-test-status'),file=$('led-video-file'),pause=$('led-video-pause');
  const brightnessValue=()=>Math.max(.2,Math.min(1.2,(+brightness.value||72)/100));
  const setStatus=text=>{if(status)status.textContent=text;};
  const fire=()=>window.dispatchEvent(new CustomEvent('nocturne-led-video-test-change',{detail:{active,label:currentLabel,fit:fit?.value,playing:!!video&&!video.paused}}));

  function disposeVideo(){
    if(video){try{video.pause();}catch{}try{video.removeAttribute('src');video.load();}catch{}}
    video=null;
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}
  }

  function applyCurrent(){
    if(!active||!video||venue.current!=='nocturne')return false;
    try{
      venue.controls?.setScreenContent?.('main',video,{fit:fit.value,brightness:brightnessValue(),playing:true});
      setStatus(`主屏 · ${currentLabel} · ${fit.value}`);
      return true;
    }catch(error){console.warn('[LED video test]',error);setStatus('显示失败');return false;}
  }

  async function loadVideo(picked){
    if(!picked)return false;
    // Image test and video test should never fight for the same main screen.
    if(window.NocturneLedImageTest?.active)window.NocturneLedImageTest.restore?.();
    disposeVideo();
    objectUrl=URL.createObjectURL(picked);
    const v=document.createElement('video');
    v.preload='auto';v.muted=true;v.defaultMuted=true;v.loop=true;v.playsInline=true;v.crossOrigin='anonymous';v.src=objectUrl;
    try{
      await new Promise((resolve,reject)=>{
        const ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(v.error||new Error('video decode failed'));};
        const cleanup=()=>{v.removeEventListener('loadeddata',ok);v.removeEventListener('error',bad);};
        v.addEventListener('loadeddata',ok,{once:true});v.addEventListener('error',bad,{once:true});v.load();
      });
      video=v;currentLabel=picked.name;active=true;
      await video.play();
      pause.disabled=false;pause.textContent='暂停视频';
      applyCurrent();fire();
      console.info('[LED video test] local video playing',{name:picked.name,width:video.videoWidth,height:video.videoHeight,duration:video.duration});
      return true;
    }catch(error){
      console.warn('[LED video test] video unavailable',error);setStatus('视频无法播放');active=false;disposeVideo();fire();return false;
    }
  }

  function togglePause(){
    if(!active||!video)return;
    if(video.paused){video.play().then(()=>{pause.textContent='暂停视频';fire();}).catch(()=>setStatus('无法继续播放'));}
    else{video.pause();pause.textContent='继续视频';fire();}
  }

  function release({restoreDynamic=true}={}){
    if(!active&&!video)return false;
    active=false;currentLabel='';pause.disabled=true;pause.textContent='暂停视频';disposeVideo();fire();
    if(restoreDynamic){
      if(window.AutoShowDirector?.running)window.AutoShowDirector.refresh?.();
      else if(venue.current==='nocturne')try{venue.controls?.setScreenPattern?.('main','orbital',{brightness:.85,playing:true});}catch{}
      setStatus('主屏 · 动态');
    }else setStatus('主屏 · 待机');
    return true;
  }

  $('led-video-local')?.addEventListener('click',()=>file?.click());
  file?.addEventListener('change',event=>{const picked=event.target.files?.[0];event.target.value='';if(picked)loadVideo(picked);});
  pause?.addEventListener('click',togglePause);
  fit?.addEventListener('change',()=>applyCurrent());
  brightness?.addEventListener('input',()=>{const v=Math.round(brightnessValue()*100);$('led-video-brightness-value').textContent=`${v}%`;if(active){try{venue.stage?.screens?.get('main')?.setOptions?.({brightness:v/100});}catch{}}});
  $('led-video-restore')?.addEventListener('click',()=>release({restoreDynamic:true}));
  window.addEventListener('virtual-band-venue-change',event=>{if(event.detail?.id==='nocturne'&&active)requestAnimationFrame(applyCurrent);});
  window.addEventListener('nocturne-led-image-test-change',event=>{if(event.detail?.active&&active)release({restoreDynamic:false});});

  window.NocturneLedVideoTest={
    get active(){return active;},
    open(){file?.click();},
    restore(){return release({restoreDynamic:true});},
    pause(){if(video&&!video.paused)togglePause();},
    play(){if(video&&video.paused)togglePause();},
    get state(){return{active,label:currentLabel,fit:fit?.value,brightness:brightnessValue(),playing:!!video&&!video.paused,width:video?.videoWidth||0,height:video?.videoHeight||0,duration:Number.isFinite(video?.duration)?video.duration:0};},
  };
  console.info('[LED video test] main-screen local video test attached');
})();
