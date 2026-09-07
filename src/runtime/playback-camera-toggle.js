'use strict';

// Transport-level master gate for playback camera automation.
// This is intentionally separate from the camera menu's MIDI director toggle: FIXED
// suppresses both Agent-authored cues and the automatic director without touching the
// lighting/LED show layer. AUTO restores whichever camera arrangement/director state the
// user had before entering FIXED mode.
(() => {
  const transport=document.querySelector('.bp-transport');
  const timeline=transport?.querySelector('.transport-timeline');
  const mode=document.getElementById('bp-mode');
  if(!transport||!timeline)return;

  const STORE='vb-playback-camera-enabled';
  const AGENT_BACKUP='vb-playback-camera-agent-backup';
  const LONG_HOLD=24*60*60*1000;
  let automatic=localStorage.getItem(STORE)!=='0';
  let savedAgentId='';
  let savedDirectorPreference=true;
  let captured=false;

  const button=document.createElement('button');
  button.id='bp-camera-auto';
  button.type='button';
  button.className='transport-camera-mode';
  button.title='播放镜头：自动运镜 / 固定手动机位';
  button.setAttribute('aria-label','切换播放镜头自动运转');
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

  const director=()=>window.VirtualBandDirector;
  const agent=()=>window.VirtualBandAgentCamera;

  function sync(){
    button.setAttribute('aria-pressed',String(automatic));
    button.innerHTML=automatic
      ? '<span class="cam-word">镜头</span><span class="cam-mode">AUTO</span>'
      : '<span class="cam-word">镜头</span><span class="cam-mode">固定</span>';
    button.title=automatic
      ? '播放镜头会按当前自动/Agent 编排运行；点击固定镜头'
      : '播放时不执行任何自动/Agent 镜头；灯光和 LED 继续运行';
  }

  function captureCameraState(){
    if(captured)return;
    const a=agent(),d=director();
    savedAgentId=a?.state?.selectedId||localStorage.getItem(AGENT_BACKUP)||'';
    savedDirectorPreference=localStorage.getItem('vb-director-enabled')!=='0';
    if(savedAgentId)localStorage.setItem(AGENT_BACKUP,savedAgentId);
    captured=true;
  }

  function applyFixed(){
    captureCameraState();
    const a=agent(),d=director();
    // Agent cues call Camera v2 directly, so they must be suspended as well as the MIDI
    // director. Deactivate only the camera arrangement; the MIDI player/show keeps going.
    if(a?.state?.selectedId)a.deactivate?.();
    // HOLD keeps the director/render bridge alive while pinning it to the current manual
    // camera. Do not call disable(): this master switch must not affect the show renderer.
    if(d?.state?.enabled)d.hold?.(LONG_HOLD);
    window.dispatchEvent(new CustomEvent('virtual-band-playback-camera-change',{detail:{enabled:false}}));
  }

  function applyAutomatic(){
    const d=director(),a=agent();
    const restoreAgent=savedAgentId||localStorage.getItem(AGENT_BACKUP)||'';
    if(savedDirectorPreference)d?.enable?.();
    else d?.disable?.();
    if(restoreAgent)a?.activate?.(restoreAgent);
    captured=false;
    window.dispatchEvent(new CustomEvent('virtual-band-playback-camera-change',{detail:{enabled:true}}));
  }

  function setAutomatic(value){
    automatic=!!value;
    localStorage.setItem(STORE,automatic?'1':'0');
    if(automatic)applyAutomatic();else applyFixed();
    sync();
    return automatic;
  }

  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    setAutomatic(!automatic);
  });

  // If someone changes the lower-level director while FIXED is active, immediately
  // re-assert the master hold. FIXED always wins over individual camera subsystems.
  document.getElementById('camera-director-toggle')?.addEventListener('click',()=>{
    if(!automatic)queueMicrotask(applyFixed);
  });
  document.getElementById('camera-agent-select')?.addEventListener('change',event=>{
    if(automatic)return;
    const value=event.target.value||'';
    if(value){savedAgentId=value;localStorage.setItem(AGENT_BACKUP,value);}
    queueMicrotask(applyFixed);
  });

  mode?.addEventListener('change',()=>{if(!automatic)applyFixed();sync();});
  window.addEventListener('storage',event=>{
    if(event.key!==STORE)return;
    automatic=event.newValue!=='0';
    if(automatic)applyAutomatic();else applyFixed();
    sync();
  });

  window.VirtualBandPlaybackCamera={
    enable(){return setAutomatic(true);},
    disable(){return setAutomatic(false);},
    toggle(){return setAutomatic(!automatic);},
    get enabled(){return automatic;},
  };

  if(!automatic)applyFixed();
  sync();
  console.info('[Player] playback camera master AUTO/FIXED switch attached',automatic?'AUTO':'FIXED');
})();
