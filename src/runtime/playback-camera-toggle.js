'use strict';

// Compact transport-level switch for the existing Camera v3.2 director.
// AUTO keeps the MIDI-driven live camera running; FIXED leaves the camera where the
// user places it. The camera menu's existing director toggle remains the same source of
// truth, so both controls stay synchronized.
(() => {
  const transport=document.querySelector('.bp-transport');
  const timeline=transport?.querySelector('.transport-timeline');
  const mode=document.getElementById('bp-mode');
  if(!transport||!timeline)return;

  const button=document.createElement('button');
  button.id='bp-camera-auto';
  button.type='button';
  button.className='transport-camera-mode';
  button.title='播放镜头：自动导播 / 固定手动机位';
  button.setAttribute('aria-label','切换播放镜头模式');
  transport.insertBefore(button,timeline);

  const style=document.createElement('style');
  style.id='playback-camera-toggle-style';
  style.textContent=`
    .transport-camera-mode{height:38px;min-width:72px;flex:0 0 auto;padding:0 10px;border:1px solid #cad9e025;border-radius:11px;background:#17262d;color:#93a5a8;font-size:9px;font-weight:600;letter-spacing:.035em;cursor:pointer;white-space:nowrap}
    .transport-camera-mode:hover{background:#22343d;color:#d8e3e0}
    .transport-camera-mode[aria-pressed="true"]{border-color:#78958e;background:#8fb6aa1b;color:#dce9e5}
    .transport-camera-mode .cam-mode{color:#d5bf8f;margin-left:3px}
    .transport-camera-mode[aria-pressed="false"] .cam-mode{color:#829296}
    body:not([data-mode="song"]) .transport-camera-mode{display:none}
    @media(max-width:900px){.transport-camera-mode{min-width:62px;padding:0 8px}.transport-camera-mode .cam-word{display:none}}
    @media(max-width:700px){.transport-camera-mode{height:34px;min-width:54px;padding:0 7px;font-size:8px}}
    @media(max-height:520px) and (orientation:landscape){.transport-camera-mode{height:32px}}
  `;
  document.head.appendChild(style);

  function director(){return window.VirtualBandDirector;}
  function sync(){
    const d=director();
    const enabled=d?.state?.enabled ?? localStorage.getItem('vb-director-enabled')!=='0';
    button.setAttribute('aria-pressed',String(enabled));
    button.innerHTML=enabled
      ? '<span class="cam-word">镜头</span><span class="cam-mode">AUTO</span>'
      : '<span class="cam-word">镜头</span><span class="cam-mode">固定</span>';
    button.title=enabled
      ? '播放镜头：自动导播开启；点击切换为固定手动机位'
      : '播放镜头：固定手动机位；点击开启自动导播';
  }

  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    const d=director();
    if(d?.toggle)d.toggle();
    else localStorage.setItem('vb-director-enabled',localStorage.getItem('vb-director-enabled')==='0'?'1':'0');
    sync();
  });

  // Mirror the existing toggle inside the camera menu.
  const connectMenuToggle=()=>{
    const other=document.getElementById('camera-director-toggle');
    if(!other)return false;
    new MutationObserver(sync).observe(other,{attributes:true,attributeFilter:['aria-pressed']});
    other.addEventListener('click',()=>queueMicrotask(sync));
    return true;
  };
  if(!connectMenuToggle()){
    const observer=new MutationObserver(()=>{if(connectMenuToggle())observer.disconnect();});
    observer.observe(document.body,{childList:true,subtree:true});
  }

  mode?.addEventListener('change',sync);
  window.addEventListener('storage',event=>{if(event.key==='vb-director-enabled')sync();});
  sync();
  console.info('[Player] playback camera AUTO/FIXED switch attached');
})();
