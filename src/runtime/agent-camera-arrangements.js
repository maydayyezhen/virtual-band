'use strict';

// Agent-authored camera arrangements sit above the MIDI auto director.
// Priority: user manual control > agent arrangement > MIDI auto director.
(() => {
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const menu = $('camera-menu');
  const songSelect = $('bp-song');
  const modeSelect = $('bp-mode');
  const playButton = $('bp-play');
  const progress = $('bp-progress');
  const STORE = 'vb-agent-camera-arrangement';
  const AUTO_STORE = 'vb-director-enabled';
  const TICK = 120;
  const MANUAL_HOLD = 8000;

  const registry = new Map();
  let camera = null;
  let director = null;
  const storedArrangement = localStorage.getItem(STORE);
  let selectedId = storedArrangement === null ? 'wish-demo' : storedArrangement;
  let activeRun = null;
  let cueIndex = 0;
  let lastProgress = 0;
  let manualUntil = 0;
  let autoSuspended = false;
  let autoWasEnabled = false;
  let attached = false;
  let tries = 0;
  let timer = 0;

  const WISH_DEMO = {
    id: 'wish-demo',
    song: 'wish',
    label: 'Wish You Were Here · Agent Demo',
    cues: [
      {p:0.000, kind:'stage', view:'front', label:'开场全景'},
      {p:0.035, kind:'instrument', target:'acoustic 1', view:'overall', label:'木吉他 1'},
      {p:0.075, kind:'instrument', target:'acoustic 1', view:'neck', label:'木吉他 1 指板'},
      {p:0.115, kind:'stage', view:'left', label:'舞台左侧'},
      {p:0.155, kind:'instrument', target:'acoustic 2', view:'overall', label:'木吉他 2'},
      {p:0.195, kind:'instrument', target:'keyboard', view:'observeAll', label:'键盘演奏'},
      {p:0.235, kind:'instrument', target:'drums', view:'observeAll', label:'鼓组演奏'},
      {p:0.275, kind:'instrument', target:'bass', view:'overall', label:'Bass'},
      {p:0.315, kind:'instrument', target:'electric 1', view:'overall', label:'电吉他 1'},
      {p:0.355, kind:'stage', view:'front', label:'回全景'},
      {p:0.395, kind:'instrument', target:'keyboard', view:'observeLower', label:'下层键盘'},
      {p:0.435, kind:'instrument', target:'drums', view:'observeLeft', label:'鼓组左侧'},
      {p:0.475, kind:'instrument', target:'acoustic 3', view:'overall', label:'木吉他 3'},
      {p:0.515, kind:'instrument', target:'bass', view:'neck', label:'Bass 指板'},
      {p:0.555, kind:'instrument', target:'electric 2', view:'overall', label:'电吉他 2'},
      {p:0.595, kind:'stage', view:'right', label:'舞台右侧'},
      {p:0.635, kind:'instrument', target:'keyboard', view:'observeUpper', label:'上层键盘'},
      {p:0.675, kind:'instrument', target:'drums', view:'observeRight', label:'鼓组右侧'},
      {p:0.715, kind:'instrument', target:'electric 3', view:'neck', label:'电吉他 3 指板'},
      {p:0.755, kind:'instrument', target:'acoustic 1', view:'overall', label:'木吉他回访'},
      {p:0.795, kind:'stage', view:'top', label:'高机位'},
      {p:0.835, kind:'instrument', target:'bass', view:'overall', label:'Bass 回访'},
      {p:0.875, kind:'instrument', target:'keyboard', view:'observeAll', label:'键盘回访'},
      {p:0.915, kind:'instrument', target:'drums', view:'observeAll', label:'鼓组回访'},
      {p:0.955, kind:'stage', view:'front', label:'收尾全景'},
    ],
  };

  function register(arrangement) {
    if (!arrangement?.id || !arrangement?.song || !Array.isArray(arrangement.cues)) return false;
    const cues = arrangement.cues
      .map(cue => ({...cue, p:Number(cue.p)}))
      .filter(cue => Number.isFinite(cue.p) && cue.p >= 0 && cue.p <= 1)
      .sort((a,b) => a.p - b.p);
    registry.set(arrangement.id, {...arrangement, cues});
    rebuildSelect();
    return true;
  }

  function isPlaying() {
    return modeSelect?.value === 'song' && /停止/.test(playButton?.textContent || '');
  }

  function progressRatio() {
    const p = parseFloat(progress?.style.width || '');
    return Number.isFinite(p) ? Math.max(0, Math.min(1, p / 100)) : 0;
  }

  function resolveRoot(target) {
    const text = String(target || '').toLowerCase();
    const roots = camera?.roots || [];
    if (text === 'keyboard' || text.includes('键盘')) return roots.find(r => (r.name || '').includes('dual-tier')) || null;
    if (text === 'drums' || text.includes('鼓')) return roots.find(r => (r.name || '').includes('Band Drums')) || null;
    if (text === 'bass') return roots.find(r => (r.name || '').includes('Fingered Bass')) || null;
    let m = text.match(/(?:acoustic|木吉他)\s*(\d+)?/);
    if (m) {
      const index = Math.max(1, Number(m[1]) || 1);
      return roots.find(r => new RegExp(`Wish Acoustic ${index}$`).test(r.name || '')) || null;
    }
    m = text.match(/(?:electric|电吉他)\s*(\d+)?/);
    if (m) {
      const index = Math.max(1, Number(m[1]) || 1);
      return roots.find(r => new RegExp(`Electric ${index}$`).test(r.name || '')) || null;
    }
    return null;
  }

  function normalizeView(root, view) {
    const name = root?.name || '';
    if (view !== 'overall') return view;
    if (name.includes('dual-tier')) return 'observeAll';
    if (name.includes('Band Drums')) return 'observeAll';
    return view;
  }

  function setStatus(text, active=false) {
    const status = $('camera-agent-status');
    const section = menu?.querySelector('.camera-agent-section');
    if (status) status.textContent = text;
    section?.classList.toggle('active', active);
  }

  function suspendAuto() {
    if (autoSuspended || !director) return;
    autoWasEnabled = !!director.state?.enabled;
    if (autoWasEnabled) {
      director.disable();
      // Suspending auto for an Agent timeline is temporary; do not persist it as a user preference.
      localStorage.setItem(AUTO_STORE, '1');
    }
    autoSuspended = true;
  }

  function restoreAuto() {
    if (!autoSuspended || !director) return;
    const restore = autoWasEnabled;
    autoSuspended = false;
    autoWasEnabled = false;
    if (restore) director.enable();
  }

  function executeCue(cue) {
    if (!cue || performance.now() < manualUntil) return false;
    if (cue.kind === 'stage') {
      camera.view(cue.view || 'front');
      setStatus(`Agent · ${cue.label || cue.view || '舞台'}`, true);
      return true;
    }
    if (cue.kind === 'instrument') {
      const root = resolveRoot(cue.target);
      if (!root) return false;
      camera.focusView(root, normalizeView(root, cue.view || 'overall'));
      setStatus(`Agent · ${cue.label || cue.target}`, true);
      return true;
    }
    return false;
  }

  function latestCueIndex(cues, p) {
    let i = 0;
    while (i < cues.length && cues[i].p <= p + 1e-6) i++;
    return i;
  }

  function resetRun(arrangement, p=0, executeLatest=false) {
    activeRun = arrangement;
    cueIndex = latestCueIndex(arrangement.cues, p);
    lastProgress = p;
    if (executeLatest && cueIndex > 0) executeCue(arrangement.cues[cueIndex - 1]);
  }

  function tick() {
    camera = window.VirtualBandCamera || camera;
    director = window.VirtualBandDirector || director;
    if (!camera || !director) return;

    const arrangement = registry.get(selectedId) || null;
    const matches = arrangement && arrangement.song === songSelect?.value;
    const playing = !!matches && isPlaying();

    if (!playing) {
      if (autoSuspended) restoreAuto();
      if (arrangement && !matches) setStatus(`仅 ${arrangement.label}`, false);
      else if (arrangement) setStatus('等待播放', false);
      else setStatus('自动导播', false);
      activeRun = null;
      cueIndex = 0;
      lastProgress = 0;
      return;
    }

    suspendAuto();
    const p = progressRatio();

    if (activeRun !== arrangement || p + .015 < lastProgress) {
      resetRun(arrangement, p, true);
      return;
    }

    if (performance.now() < manualUntil) {
      setStatus(`用户接管 ${Math.max(1, Math.ceil((manualUntil - performance.now()) / 1000))}s`, true);
      lastProgress = p;
      return;
    }

    let lastDue = null;
    while (cueIndex < arrangement.cues.length && arrangement.cues[cueIndex].p <= p + 1e-6) {
      lastDue = arrangement.cues[cueIndex++];
    }
    if (lastDue) executeCue(lastDue);
    lastProgress = p;
  }

  function manualTakeover() {
    if (!activeRun || !isPlaying()) return;
    manualUntil = performance.now() + MANUAL_HOLD;
    setStatus('用户接管 8s', true);
  }

  function activate(id) {
    selectedId = registry.has(id) ? id : '';
    localStorage.setItem(STORE, selectedId);
    activeRun = null;
    cueIndex = 0;
    lastProgress = 0;
    syncSelect();
    if (!selectedId) restoreAuto();
    return selectedId;
  }

  function rebuildSelect() {
    const select = $('camera-agent-select');
    if (!select) return;
    const value = selectedId;
    select.innerHTML = '<option value="">自动 · MIDI 导播</option>' + [...registry.values()]
      .map(a => `<option value="${a.id}">${a.label}</option>`).join('');
    select.value = registry.has(value) ? value : '';
  }

  function syncSelect() {
    const select = $('camera-agent-select');
    if (select) select.value = registry.has(selectedId) ? selectedId : '';
  }

  function setupUi() {
    const panel = menu?.querySelector('.camera-panel');
    if (!panel) return;
    panel.querySelector('.camera-agent-section')?.remove();
    const section = document.createElement('div');
    section.className = 'camera-agent-section';
    section.innerHTML = '<label>镜头编排<select id="camera-agent-select"></select></label><small id="camera-agent-status">自动导播</small>';
    const directorSection = panel.querySelector('.camera-director-section');
    if (directorSection) directorSection.insertAdjacentElement('afterend', section);
    else panel.prepend(section);

    $('camera-agent-style')?.remove();
    const style = document.createElement('style');
    style.id = 'camera-agent-style';
    style.textContent =
      '.camera-agent-section{display:grid;gap:5px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}'+
      '.camera-agent-section label{display:grid;gap:4px;font-size:8px;color:#73878e}.camera-agent-section select{width:100%;height:29px;border:1px solid var(--line);border-radius:7px;background:#ffffff05;color:#b8c5c6;padding:0 6px;font-size:9px}'+
      '.camera-agent-section small{font-size:8px;color:#71858d}.camera-agent-section.active small{color:#cddbd7}';
    document.head.appendChild(style);

    rebuildSelect();
    $('camera-agent-select')?.addEventListener('change', event => activate(event.target.value));
  }

  function installManualHooks() {
    stage?.addEventListener('pointerdown', manualTakeover, {capture:true, passive:true});
    stage?.addEventListener('wheel', manualTakeover, {capture:true, passive:true});
    menu?.addEventListener('click', event => {
      if (event.target.closest('#camera-agent-select,#camera-director-toggle')) return;
      if (event.target.closest('[data-camera],[data-focus-view],#zoom-in,#zoom-out,#reset,#camera-focus-back')) manualTakeover();
    }, true);
  }

  function attach() {
    if (attached) return true;
    camera = window.VirtualBandCamera;
    director = window.VirtualBandDirector;
    if (!camera || !director || !stage || !menu || !songSelect || !modeSelect || !playButton || !progress) return false;

    register(WISH_DEMO);
    setupUi();
    installManualHooks();
    timer = setInterval(tick, TICK);

    window.VirtualBandAgentCamera = {
      register,
      activate,
      deactivate(){return activate('');},
      useAuto(){return activate('');},
      get arrangements(){return [...registry.values()].map(a => ({...a, cues:a.cues.map(c => ({...c}))}));},
      get state(){return {selectedId, active:!!activeRun && isPlaying(), song:songSelect.value, cueIndex, autoSuspended, manualHoldMs:Math.max(0, manualUntil - performance.now())};},
    };

    attached = true;
    console.info('[Agent Camera] arrangement layer attached · user > agent > auto');
    return true;
  }

  function wait() {
    if (attach()) return;
    if (++tries < 600) requestAnimationFrame(wait);
    else console.warn('[Agent Camera] director/camera unavailable after waiting.');
  }

  wait();
})();
