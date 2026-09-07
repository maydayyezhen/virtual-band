'use strict';

// NOCTURNE camera preset editor.
// The editor is intentionally a non-destructive layer: system views can be hidden or
// overridden, custom views are registered under user:* ids, and every draft can be
// exported as JSON for later baking into camera-preset-config.js.
(() => {
  const T = THREE;
  const cameraApi = window.VirtualBandCamera;
  const runtime = window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
  const menu = document.getElementById('camera-menu');
  const panel = menu?.querySelector('.camera-panel');
  if (!T || !cameraApi?.registerView || !runtime?.camera || !menu || !panel) return;

  const SCHEMA = 'virtual-band-camera-presets/v1';
  const SCOPE = 'nocturne';
  const STORE = 'vb-camera-preset-draft-v1';
  const SYSTEM = [
    { id: 'front', label: '正面' },
    { id: 'left', label: '左侧' },
    { id: 'right', label: '右侧' },
    { id: 'top', label: '高机位' },
    { id: 'nocturne:panorama', label: '场馆全景' },
    { id: 'nocturne:stage', label: '舞台正面' },
    { id: 'nocturne:wing', label: '舞台侧翼' },
    { id: 'nocturne:balcony', label: '看台视角' },
    { id: 'nocturne:reverse', label: '回望场馆' },
  ];
  const systemMeta = new Map(SYSTEM.map(item => [item.id, item]));
  const baselineRegistered = new Map(
    Object.entries(cameraApi.registeredViews || {}).map(([id, spec]) => [id, cloneSpec(spec)]),
  );
  const appliedIds = new Set();
  const rawView = cameraApi.view.bind(cameraApi);
  const rawHome = cameraApi.home?.bind(cameraApi);

  let editing = false;
  let autoWasEnabled = false;
  let selectedId = '';
  let toastTimer = 0;
  let config = loadDraft();

  function cloneSpec(spec = {}) {
    return {
      ...spec,
      position: Array.isArray(spec.position) ? [...spec.position] : spec.position,
      target: Array.isArray(spec.target) ? [...spec.target] : spec.target,
    };
  }
  function finite3(value) {
    return Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite);
  }
  function normalize(input) {
    const src = input && typeof input === 'object' ? input : {};
    const hidden = [...new Set(Array.isArray(src.hidden) ? src.hidden.map(String) : [])];
    const overrides = {};
    for (const [id, spec] of Object.entries(src.overrides || {})) {
      if (!finite3(spec?.position) || !finite3(spec?.target)) continue;
      overrides[String(id)] = {
        id: String(id),
        label: String(spec.label || systemMeta.get(String(id))?.label || id),
        position: spec.position.slice(0, 3).map(Number),
        target: spec.target.slice(0, 3).map(Number),
        fov: Number.isFinite(+spec.fov) ? +spec.fov : 57,
        duration: Number.isFinite(+spec.duration) ? +spec.duration : 700,
      };
    }
    const custom = [];
    const seen = new Set();
    for (const item of Array.isArray(src.custom) ? src.custom : []) {
      if (!finite3(item?.position) || !finite3(item?.target)) continue;
      const id = String(item.id || '');
      if (!id.startsWith('user:') || seen.has(id)) continue;
      seen.add(id);
      custom.push({
        id,
        label: String(item.label || id),
        position: item.position.slice(0, 3).map(Number),
        target: item.target.slice(0, 3).map(Number),
        fov: Number.isFinite(+item.fov) ? +item.fov : 57,
        duration: Number.isFinite(+item.duration) ? +item.duration : 700,
      });
    }
    return { schema: SCHEMA, scope: SCOPE, hidden, overrides, custom };
  }
  function bakedConfig() {
    const baked = window.VIRTUAL_BAND_CAMERA_PRESET_CONFIG;
    return baked?.schema === SCHEMA && baked?.scope === SCOPE ? normalize(baked) : normalize({});
  }
  function loadDraft() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (parsed?.schema === SCHEMA && parsed?.scope === SCOPE) return normalize(parsed);
    } catch {}
    return bakedConfig();
  }
  function saveDraft() {
    localStorage.setItem(STORE, JSON.stringify(config));
  }
  function activeScope() {
    return window.VirtualBandVenues?.current === SCOPE;
  }
  function round(value, digits = 3) {
    const p = 10 ** digits;
    return Math.round((Number(value) || 0) * p) / p;
  }
  function capturePose(label = '') {
    runtime.camera.updateMatrixWorld(true);
    const position = runtime.camera.position.clone();
    const stateTarget = cameraApi.state?.target;
    const target = stateTarget?.isVector3
      ? stateTarget.clone()
      : stateTarget && Number.isFinite(stateTarget.x)
        ? new T.Vector3(stateTarget.x, stateTarget.y, stateTarget.z)
        : position.clone().add(runtime.camera.getWorldDirection(new T.Vector3()).multiplyScalar(20));
    return {
      label,
      position: position.toArray().map(v => round(v, 3)),
      target: target.toArray().map(v => round(v, 3)),
      fov: round(runtime.camera.fov, 2),
      duration: 700,
    };
  }
  function isHidden(id) {
    return activeScope() && config.hidden.includes(String(id));
  }
  function restoreApplied() {
    for (const id of appliedIds) {
      const baseline = baselineRegistered.get(id);
      if (baseline) cameraApi.registerView(id, cloneSpec(baseline));
      else cameraApi.unregisterView(id);
    }
    appliedIds.clear();
  }
  function applyConfig() {
    restoreApplied();
    if (activeScope()) {
      for (const [id, spec] of Object.entries(config.overrides)) {
        cameraApi.registerView(id, cloneSpec(spec));
        appliedIds.add(id);
      }
      for (const spec of config.custom) {
        cameraApi.registerView(spec.id, cloneSpec(spec));
        appliedIds.add(spec.id);
      }
    }
    refreshSystemButtons();
    renderLists();
  }

  // Venue buttons call VirtualBandCamera.view dynamically. Respect safe-deleted views.
  cameraApi.view = id => {
    if (isHidden(id)) return false;
    return rawView(id);
  };
  if (rawHome) {
    cameraApi.home = () => {
      if (!isHidden('front')) return rawHome();
      const fallback = SYSTEM.find(item => !isHidden(item.id) && !item.id.startsWith('nocturne:'));
      return fallback ? rawView(fallback.id) : false;
    };
  }

  const section = document.createElement('div');
  section.className = 'camera-preset-editor';
  section.innerHTML = `
    <div class="camera-editor-head">
      <div><strong>镜头编辑</strong><small id="camera-editor-status">NOCTURNE · 草稿层</small></div>
      <button id="camera-editor-toggle" type="button">进入编辑</button>
    </div>
    <div class="camera-editor-body" id="camera-editor-body" hidden>
      <div class="camera-editor-capture">
        <input id="camera-editor-name" type="text" maxlength="32" placeholder="新视角名称">
        <button id="camera-editor-save" type="button">＋ 保存当前</button>
      </div>
      <div class="camera-editor-pose" id="camera-editor-pose">移动镜头后保存当前构图</div>
      <div class="camera-editor-group"><div class="camera-editor-group-title">系统视角</div><div id="camera-editor-system"></div></div>
      <div class="camera-editor-group"><div class="camera-editor-group-title">自定义视角</div><div id="camera-editor-custom"></div></div>
      <div class="camera-editor-io">
        <button id="camera-editor-copy" type="button">复制 JSON</button>
        <button id="camera-editor-download" type="button">下载 JSON</button>
        <button id="camera-editor-import" type="button">导入 JSON</button>
        <button id="camera-editor-reset" type="button">恢复项目版</button>
      </div>
      <input id="camera-editor-file" type="file" accept="application/json,.json" hidden>
      <div class="camera-editor-tip">系统视角“删除”是安全隐藏；“覆盖”保存当前机位。自定义视角可真正删除。</div>
    </div>`;
  const note = panel.querySelector('#camera-v2-note');
  panel.insertBefore(section, note || null);

  const style = document.createElement('style');
  style.id = 'camera-preset-editor-style';
  style.textContent = `
    .camera-preset-editor{margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}
    .camera-editor-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.camera-editor-head>div{display:grid;gap:2px}.camera-editor-head strong{font-size:10px;font-weight:600;color:#dce7e5}.camera-editor-head small{font-size:8px;color:#6f838a}
    .camera-preset-editor button,.camera-preset-editor input{border:1px solid #cad9e023;border-radius:7px;background:#17262d;color:#cfdad8;font-size:8px}.camera-preset-editor button{height:27px;padding:0 7px;cursor:pointer}.camera-preset-editor button:hover{background:#223740}.camera-preset-editor button.active{border-color:#78958e;background:#8fb6aa18;color:#e6f0ed}
    .camera-editor-body{display:grid;gap:8px;margin-top:8px}.camera-editor-capture{display:grid;grid-template-columns:1fr auto;gap:5px}.camera-editor-capture input{min-width:0;height:28px;padding:0 7px;outline:none}.camera-editor-capture input:focus{border-color:#78958e}
    .camera-editor-pose{padding:6px 7px;border-radius:7px;background:#ffffff04;font-size:8px;line-height:1.45;color:#73878e;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    .camera-editor-group{display:grid;gap:5px}.camera-editor-group-title{font-size:8px;letter-spacing:.12em;color:#71858d}.camera-editor-list{display:grid;gap:4px}.camera-editor-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:5px;padding:4px 0;border-top:1px solid #cad9e00d}.camera-editor-row:first-child{border-top:0}.camera-editor-label{min-width:0;display:grid;gap:1px}.camera-editor-label strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px;font-weight:500;color:#c5d2d1}.camera-editor-label small{font-size:7px;color:#61747a}.camera-editor-row.hidden-view .camera-editor-label{opacity:.42}.camera-editor-row.overridden .camera-editor-label strong::after{content:'  • 已覆盖';color:#c8a86f;font-size:7px}.camera-editor-actions{display:flex;gap:3px}.camera-editor-actions button{height:24px;padding:0 5px;font-size:7px}.camera-editor-actions .danger{color:#c98989}
    .camera-editor-empty{padding:5px 0;font-size:8px;color:#61747a}.camera-editor-io{display:grid;grid-template-columns:1fr 1fr;gap:5px}.camera-editor-tip{font-size:7px;line-height:1.5;color:#61747a}.camera-preset-editor[hidden]{display:none!important}
    #camera-menu [data-camera].vb-camera-hidden-preset{display:none!important}`;
  document.head.appendChild(style);

  const $ = id => document.getElementById(id);
  const body = $('camera-editor-body');
  const toggle = $('camera-editor-toggle');
  const nameInput = $('camera-editor-name');
  const systemList = $('camera-editor-system');
  const customList = $('camera-editor-custom');
  const poseLabel = $('camera-editor-pose');
  const status = $('camera-editor-status');
  const fileInput = $('camera-editor-file');

  function toast(text) {
    if (toastTimer) clearTimeout(toastTimer);
    status.textContent = text;
    toastTimer = setTimeout(() => {
      status.textContent = editing ? 'NOCTURNE · 编辑中 · 镜头已固定' : 'NOCTURNE · 草稿层';
      toastTimer = 0;
    }, 1600);
  }
  function updatePoseReadout() {
    if (!editing) return;
    const p = capturePose();
    poseLabel.textContent = `P ${p.position.join(', ')}  ·  T ${p.target.join(', ')}  ·  FOV ${p.fov}`;
  }
  function enterEditing() {
    if (editing || !activeScope()) return false;
    editing = true;
    autoWasEnabled = !!window.VirtualBandPlaybackCamera?.enabled;
    window.VirtualBandPlaybackCamera?.disable?.();
    body.hidden = false;
    toggle.textContent = '退出编辑';
    toggle.classList.add('active');
    status.textContent = 'NOCTURNE · 编辑中 · 镜头已固定';
    updatePoseReadout();
    return true;
  }
  function exitEditing() {
    if (!editing) return false;
    editing = false;
    body.hidden = true;
    toggle.textContent = '进入编辑';
    toggle.classList.remove('active');
    status.textContent = 'NOCTURNE · 草稿层';
    if (autoWasEnabled) window.VirtualBandPlaybackCamera?.enable?.();
    autoWasEnabled = false;
    return true;
  }
  function nextCustomId() {
    let n = 1;
    const used = new Set(config.custom.map(item => item.id));
    while (used.has(`user:nocturne:${String(n).padStart(3, '0')}`)) n++;
    return `user:nocturne:${String(n).padStart(3, '0')}`;
  }
  function addCurrent() {
    if (!editing) return;
    const label = nameInput.value.trim() || `自定义视角 ${config.custom.length + 1}`;
    const id = nextCustomId();
    config.custom.push({ id, ...capturePose(label) });
    selectedId = id;
    nameInput.value = '';
    saveDraft();
    applyConfig();
    toast(`已保存：${label}`);
  }
  function overrideSystem(id) {
    const meta = systemMeta.get(id);
    if (!meta || !editing) return;
    config.overrides[id] = { id, ...capturePose(meta.label) };
    config.hidden = config.hidden.filter(x => x !== id);
    selectedId = id;
    saveDraft();
    applyConfig();
    toast(`已覆盖：${meta.label}`);
  }
  function resetSystem(id) {
    delete config.overrides[id];
    saveDraft();
    applyConfig();
    toast(`已恢复默认：${systemMeta.get(id)?.label || id}`);
  }
  function toggleHidden(id) {
    if (config.hidden.includes(id)) config.hidden = config.hidden.filter(x => x !== id);
    else config.hidden.push(id);
    saveDraft();
    applyConfig();
  }
  function deleteCustom(id) {
    config.custom = config.custom.filter(item => item.id !== id);
    if (selectedId === id) selectedId = '';
    saveDraft();
    applyConfig();
    toast('自定义视角已删除');
  }
  function overrideCustom(id) {
    const item = config.custom.find(entry => entry.id === id);
    if (!item || !editing) return;
    Object.assign(item, capturePose(item.label));
    saveDraft();
    applyConfig();
    toast(`已更新：${item.label}`);
  }
  function go(id) {
    selectedId = id;
    rawView(id);
    requestAnimationFrame(updatePoseReadout);
    renderLists();
  }

  function button(text, action, className = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (className) b.className = className;
    b.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return b;
  }
  function renderSystem() {
    systemList.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'camera-editor-list';
    for (const meta of SYSTEM) {
      const row = document.createElement('div');
      const hidden = config.hidden.includes(meta.id);
      const overridden = !!config.overrides[meta.id];
      row.className = `camera-editor-row${hidden ? ' hidden-view' : ''}${overridden ? ' overridden' : ''}`;
      const label = document.createElement('div');
      label.className = 'camera-editor-label';
      label.innerHTML = `<strong>${meta.label}</strong><small>${meta.id}</small>`;
      const actions = document.createElement('div');
      actions.className = 'camera-editor-actions';
      actions.appendChild(button('看', () => go(meta.id)));
      actions.appendChild(button('覆盖', () => overrideSystem(meta.id)));
      if (overridden) actions.appendChild(button('默认', () => resetSystem(meta.id)));
      actions.appendChild(button(hidden ? '恢复' : '删除', () => toggleHidden(meta.id), hidden ? '' : 'danger'));
      row.append(label, actions);
      list.appendChild(row);
    }
    systemList.appendChild(list);
  }
  function renderCustom() {
    customList.innerHTML = '';
    if (!config.custom.length) {
      customList.innerHTML = '<div class="camera-editor-empty">还没有自定义视角。</div>';
      return;
    }
    const list = document.createElement('div');
    list.className = 'camera-editor-list';
    for (const item of config.custom) {
      const row = document.createElement('div');
      row.className = 'camera-editor-row';
      const label = document.createElement('div');
      label.className = 'camera-editor-label';
      label.innerHTML = `<strong>${item.label}</strong><small>${item.id}</small>`;
      const actions = document.createElement('div');
      actions.className = 'camera-editor-actions';
      actions.appendChild(button('看', () => go(item.id)));
      actions.appendChild(button('覆盖', () => overrideCustom(item.id)));
      actions.appendChild(button('删除', () => deleteCustom(item.id), 'danger'));
      row.append(label, actions);
      list.appendChild(row);
    }
    customList.appendChild(list);
  }
  function renderLists() {
    if (!systemList || !customList) return;
    renderSystem();
    renderCustom();
  }
  function refreshSystemButtons() {
    const scoped = activeScope();
    menu.querySelectorAll('[data-camera]').forEach(node => {
      const hidden = scoped && config.hidden.includes(node.dataset.camera || '');
      node.classList.toggle('vb-camera-hidden-preset', hidden);
    });
    section.hidden = !scoped;
    if (!scoped && editing) exitEditing();
  }

  function exportObject() {
    return normalize(config);
  }
  function exportText() {
    return JSON.stringify(exportObject(), null, 2);
  }
  async function copyJson() {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      toast('JSON 已复制');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast('JSON 已复制');
    }
  }
  function downloadJson() {
    const blob = new Blob([exportText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nocturne-camera-presets.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('JSON 已下载');
  }
  async function importJson(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.schema !== SCHEMA || parsed?.scope !== SCOPE) throw new Error('schema mismatch');
      config = normalize(parsed);
      saveDraft();
      applyConfig();
      toast('JSON 已导入');
    } catch (error) {
      console.warn('[Camera preset editor] import failed', error);
      toast('JSON 格式不匹配');
    }
  }
  function resetToBaked() {
    config = bakedConfig();
    localStorage.removeItem(STORE);
    applyConfig();
    toast('已恢复项目内置版本');
  }

  toggle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    editing ? exitEditing() : enterEditing();
  });
  $('camera-editor-save')?.addEventListener('click', addCurrent);
  nameInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); addCurrent(); }
  });
  $('camera-editor-copy')?.addEventListener('click', copyJson);
  $('camera-editor-download')?.addEventListener('click', downloadJson);
  $('camera-editor-import')?.addEventListener('click', () => fileInput?.click());
  $('camera-editor-reset')?.addEventListener('click', resetToBaked);
  fileInput?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) importJson(file);
  });

  // Venue UI rebuilds its camera buttons when the scene changes. Keep hidden-state styling
  // synchronized without modifying the venue manager's source camera list.
  const observer = new MutationObserver(() => refreshSystemButtons());
  observer.observe(menu, { childList: true, subtree: true });
  window.addEventListener('virtual-band-venue-change', () => {
    applyConfig();
    requestAnimationFrame(refreshSystemButtons);
  });

  let readoutRaf = 0;
  function readoutLoop() {
    readoutRaf = requestAnimationFrame(readoutLoop);
    if (editing) updatePoseReadout();
  }
  readoutRaf = requestAnimationFrame(readoutLoop);

  window.VirtualBandCameraPresetEditor = {
    enter: enterEditing,
    exit: exitEditing,
    capture(label = '') { return capturePose(label); },
    add(label = '') {
      if (!editing) enterEditing();
      if (nameInput) nameInput.value = label;
      addCurrent();
      return config.custom.at(-1) || null;
    },
    apply(value) {
      config = normalize(value);
      saveDraft();
      applyConfig();
      return exportObject();
    },
    reset: resetToBaked,
    export() { return exportObject(); },
    exportText,
    get editing() { return editing; },
    get config() { return exportObject(); },
  };

  applyConfig();
  refreshSystemButtons();
  console.info('[Camera preset editor] NOCTURNE add / override / safe-delete / JSON workflow attached');
})();
