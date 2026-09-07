'use strict';

// Playback camera master switch. FIXED disables every automatic camera owner while
// leaving the MIDI player and NOCTURNE lighting/LED show completely untouched.
(() => {
  const transport=document.querySelector('.bp-transport');
  const timeline=transport?.querySelector('.transport-timeline');
  const mode=document.getElementById('bp-mode');
  if(!transport||!timeline)return;

  const STORE='vb-playback-camera-enabled';
  const AGENT_BACKUP='vb-playback-camera-agent-backup';
  const DIRECTOR_BACKUP='vb-playback-camera-director-backup';
  let automatic=localStorage.getItem(STORE)!=='0';
  let savedAgentId=localStorage.getItem(AGENT_BACKUP)||'';
  let savedDirectorPreference=localStorage.getItem(DIRECTOR_BACKUP)!=='0';
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
      ? '播放时允许 Auto Director / Agent 镜头运行；点击固定镜头'
      : '播放时禁用所有自动镜头；灯光和 LED 独立继续运行';
  }

  function capturePreferences(){
    if(captured)return;
    const a=agent(),d=director();
    savedAgentId=a?.state?.selectedId||savedAgentId||'';
    savedDirectorPreference=!!(d?.state?.enabled ?? (localStorage.getItem('vb-director-enabled')!=='0'));
    localStorage.setItem(AGENT_BACKUP,savedAgentId);
    localStorage.setItem(DIRECTOR_BACKUP,savedDirectorPreference?'1':'0');
    captured=true;
  }

  function applyFixed({capture=true}={}){
    if(capture)capturePreferences();
    const a=agent(),d=director();

    // Agent cues move the real Camera v2 object directly, so remove the active plan.
    // Keep its id in our own backup so AUTO can restore it later.
    if(a?.state?.selectedId){
      savedAgentId=a.state.selectedId;
      localStorage.setItem(AGENT_BACKUP,savedAgentId);
      a.deactivate?.();
    }

    // Disable Camera v3.2 outright. Do not HOLD it: HOLD still renders through the
    // cloned PROGRAM camera and therefore is not a true fixed-camera mode.
    d?.disable?.();

    window.dispatchEvent(new CustomEvent('virtual-band-playback-camera-change',{detail:{enabled:false}}));
  }

  function applyAutomatic(){
    const d=director(),a=agent();
    if(savedDirectorPreference)d?.enable?.();
    else d?.disable?.();
    if(savedAgentId)a?.activate?.(savedAgentId);
    captured=false;
    window.dispatchEvent(new CustomEvent('virtual-band-playback-camera-change',{detail:{enabled:true}}));
  }

  function setAutomatic(value){
    const next=!!value;
    if(next===automatic){
      if(!next)applyFixed({capture:false});
      sync();
      return automatic;
    }
    automatic=next;
    localStorage.setItem(STORE,automatic?'1':'0');
    if(automatic)applyAutomatic();else applyFixed({capture:true});
    sync();
    return automatic;
  }

  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    setAutomatic(!automatic);
  });

  // FIXED is the master gate. If a lower camera control is changed while fixed, remember
  // the user's choice but immediately suppress it again.
  document.getElementById('camera-director-toggle')?.addEventListener('click',()=>{
    if(automatic)return;
    queueMicrotask(()=>{
      savedDirectorPreference=!!director()?.state?.enabled;
      localStorage.setItem(DIRECTOR_BACKUP,savedDirectorPreference?'1':'0');
      applyFixed({capture:false});
    });
  });
  document.getElementById('camera-agent-select')?.addEventListener('change',event=>{
    if(automatic)return;
    const value=event.target.value||'';
    if(value){savedAgentId=value;localStorage.setItem(AGENT_BACKUP,value);}
    queueMicrotask(()=>applyFixed({capture:false}));
  });

  mode?.addEventListener('change',()=>{if(!automatic)applyFixed({capture:false});sync();});
  window.addEventListener('storage',event=>{
    if(event.key!==STORE)return;
    automatic=event.newValue!=='0';
    if(automatic)applyAutomatic();else applyFixed({capture:false});
    sync();
  });

  window.VirtualBandPlaybackCamera={
    enable(){return setAutomatic(true);},
    disable(){return setAutomatic(false);},
    toggle(){return setAutomatic(!automatic);},
    get enabled(){return automatic;},
  };

  if(!automatic)applyFixed({capture:false});
  sync();
  console.info('[Player] playback camera master attached',automatic?'AUTO':'FIXED');
})();
