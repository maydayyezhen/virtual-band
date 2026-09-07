'use strict';

// Phase 1 venue integration: NOCTURNE runs as its own original Three.js application in
// an isolated iframe. No band roots, Camera v2, Agent director or host renderer are
// injected into the venue. This keeps scene/camera/render behavior independent while we
// verify the venue can live inside the project without changing its authored runtime.
(() => {
  const STORE='vb-venue-v2-scene';
  const root=document.body;
  let frame=null;
  let current='';

  const switcher=document.createElement('div');
  switcher.id='venue-v2-switcher';
  switcher.innerHTML=`
    <span>场景</span>
    <select id="venue-v2-select" aria-label="选择演出场景">
      <option value="nocturne">NOCTURNE · 原生模式</option>
      <option value="none">无 · 虚拟乐队</option>
    </select>`;
  document.body.appendChild(switcher);

  const style=document.createElement('style');
  style.id='venue-v2-style';
  style.textContent=`
    #venue-v2-switcher{position:fixed;z-index:1000;right:22px;top:20px;display:flex;align-items:center;gap:8px;padding:7px 8px 7px 11px;border:1px solid #cad9e025;border-radius:999px;background:rgba(12,19,24,.86);backdrop-filter:blur(18px);box-shadow:0 12px 36px #0006;color:#8fa0a5;font-size:9px;letter-spacing:.08em}
    #venue-v2-switcher select{height:30px;border:0;border-radius:999px;background:#1a2930;color:#e5ece9;padding:0 11px;outline:none;font-size:10px;letter-spacing:0}
    #venue-v2-switcher select:focus-visible{outline:2px solid #d6b987aa;outline-offset:2px}
    #nocturne-v2-frame{position:fixed;z-index:7;inset:0;width:100%;height:100%;border:0;background:#080b13}
    body[data-venue-v2="nocturne"]>.topbar,body[data-venue-v2="nocturne"]>.band-player,body[data-venue-v2="nocturne"]>#camera-menu,body[data-venue-v2="nocturne"]>#midi-drop,body[data-venue-v2="nocturne"]>.status{display:none!important}
    body[data-venue-v2="nocturne"]>#stage{visibility:hidden!important;pointer-events:none!important}
    @media(max-width:700px){#venue-v2-switcher{right:12px;top:12px;max-width:calc(100vw - 24px)}#venue-v2-switcher>span{display:none}#venue-v2-switcher select{max-width:190px}}
  `;
  document.head.appendChild(style);

  const select=document.getElementById('venue-v2-select');

  function mountNocturne(){
    if(frame?.isConnected)return;
    frame=document.createElement('iframe');
    frame.id='nocturne-v2-frame';
    frame.title='NOCTURNE 原生全景演出场景';
    frame.allow='autoplay; fullscreen';
    frame.src='./src/venues/nocturne-standalone.html';
    document.body.insertBefore(frame,document.body.firstChild);
  }

  function unmountNocturne(){
    frame?.remove();
    frame=null;
  }

  function activate(id,{persist=true}={}){
    id=id==='none'?'none':'nocturne';
    if(id===current)return;
    current=id;
    root.dataset.venueV2=id;
    select.value=id;
    if(id==='nocturne'){
      // Stop any current band playback before hiding the band runtime. The venue itself
      // runs independently and contains no virtual-band instruments in this phase.
      const play=document.getElementById('bp-play');
      if(/停止/.test(play?.textContent||''))play.click();
      mountNocturne();
    }else{
      unmountNocturne();
      requestAnimationFrame(()=>window.VirtualBandCamera?.refit?.());
    }
    if(persist)localStorage.setItem(STORE,id);
    window.dispatchEvent(new CustomEvent('virtual-band-venue-v2-change',{detail:{id}}));
  }

  select.addEventListener('change',()=>activate(select.value));

  window.VirtualBandVenueV2={
    activate,
    get current(){return current;},
    get frame(){return frame;},
  };

  // New key: older failed venue experiments cannot change this default.
  const initial=localStorage.getItem(STORE)==='none'?'none':'nocturne';
  activate(initial,{persist:false});
  console.info('[Venue v2] standalone isolation attached · default NOCTURNE · no band injection');
})();
