'use strict';

// Camera Library v1 — one camera data model for every venue.
// Scene views are venue-local; instrument views are root-local and shared across venues.
// This replaces the old NOCTURNE-only preset/context editors without rewriting Camera v2.
(() => {
  const T = window.THREE;
  const camera = window.VirtualBandCamera;
  const runtime = window.__VIRTUAL_BAND_CAMERA_RUNTIME__;
  const menu = document.getElementById('camera-menu');
  const panel = menu?.querySelector('.camera-panel');
  if (!T || !camera || !runtime?.camera || !menu || !panel) return;

  const SCHEMA = 'virtual-band-camera-library/v1';
  const STORE = 'vb-camera-library-v1';
  const LEGACY_STAGE_STORE = 'vb-camera-preset-draft-v1';
  const LEGACY_INSTRUMENT_STORE = 'vb-camera-instrument-draft-v1';
  const DEFAULT_FOV = 42;
  const SCENE_TRANSITION_MS = 700;
  const INSTRUMENT_TRANSITION_MS = 450;

  const SCENE_SYSTEM = {
    none: [
      ['front', '正面'], ['left', '左侧'], ['right', '右侧'], ['top', '高机位'],
    ],
    nocturne: [
      ['front', '正面'], ['left', '左侧'], ['right', '右侧'], ['top', '高机位'],
      ['nocturne:panorama', '场馆全景'], ['nocturne:stage', '舞台正面'],
      ['nocturne:wing', '舞台侧翼'], ['nocturne:balcony', '看台视角'],
      ['nocturne:reverse', '回望场馆'],
    ],
  };

  const INSTRUMENT_SYSTEM = {
    keyboard: [
      ['overall', '整体'], ['lower', '88 键'], ['upper', '61 键'], ['panel', '控制面板'],
      ['pedals', '踏板'], ['observeAll', '演奏总览'], ['observeLower', '下层观察'], ['observeUpper', '上层观察'],
    ],
    drums: [
      ['overall', '整体'], ['front', '正面'], ['left34', '左前 3/4'], ['right34', '右前 3/4'],
      ['top', '高机位'], ['observeAll', '演奏总览'], ['observeLeft', '左侧观察'], ['observeRight', '右侧观察'],
    ],
    acoustic: [['overall', '整体'], ['body', '琴身'], ['neck', '指板'], ['side', '侧面']],
    electric: [['overall', '整体'], ['body', '琴身'], ['neck', '指板'], ['side', '侧面']],
    bass: [['overall', '整体'], ['body', '琴身'], ['neck', '指板'], ['side', '侧面']],
  };

  const rawView = camera.view.bind(camera);
  const rawHome = camera.home?.bind(camera);
  const rawFocus = camera.focus?.bind(camera);
  const rawFocusView = camera.focusView?.bind(camera);
  const rawPose = camera.pose?.bind(camera);

  let editing = false;
  let lockedRootName = '';
  let autoWasEnabled = false;
  let toastTimer = 0;
  let lastSignature = '';
  let config = loadConfig();

  const round = (value, digits = 3) => {
    const p = 10 ** digits;
    return Math.round((Number(value) || 0) * p) / p;
  };
  const sceneId = () => window.VirtualBandVenues?.current === 'nocturne' ? 'nocturne' : 'none';
  const rootByName = name => (camera.roots || []).find(root => root.name === name) || null;
  const liveRoot = () => rootByName(camera.state?.focused || '');

  function typeOf(root) {
    const name = root?.name || '';
    if (name.includes('dual-tier')) return 'keyboard';
    if (name.includes('Band Drums')) return 'drums';
    if (name.includes('Fingered Bass')) return 'bass';
    if (/^Wish Acoustic \d+$/.test(name)) return 'acoustic';
    if (/Electric \d+$/.test(name)) return 'electric';
    return '';
  }

  function subjectOf(root) {
    const type = typeOf(root);
    const name = root?.name || '';
    if (type === 'acoustic') return `acoustic:${(/(\d+)$/.exec(name) || [])[1] || 1}`;
    if (type === 'electric') return `electric:${(/(\d+)$/.exec(name) || [])[1] || 1}`;
    return type;
  }

  function labelOf(root) {
    const type = typeOf(root);
    const name = root?.name || '';
    if (type === 'keyboard') return '双层键盘';
    if (type === 'drums') return '架子鼓';
    if (type === 'bass') return 'Bass';
    if (type === 'acoustic') return `木吉他 ${(/(\d+)$/.exec(name) || [])[1] || ''}`.trim();
    if (type === 'electric') return `电吉他 ${(/(\d+)$/.exec(name) || [])[1] || ''}`.trim();
    return name || '乐器';
  }

  function key(subject, id) { return `${subject}::${id}`; }

  function emptyScene() { return { hidden: [], overrides: {}, custom: [] }; }
  function emptyConfig() {
    return {
      schema: SCHEMA,
      scenes: { none: emptyScene(), nocturne: emptyScene() },
      instruments: { hidden: [], overrides: {}, custom: [] },
    };
  }

  function finite3(value) {
    return Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(v => Number.isFinite(Number(v)));
  }

  function normalizeScene(value) {
    const src = value && typeof value === 'object' ? value : {};
    const hidden = [...new Set(Array.isArray(src.hidden) ? src.hidden.map(String) : [])];
    const overrides = {};
    for (const [id, item] of Object.entries(src.overrides || {})) {
      if (!finite3(item?.position) || !finite3(item?.target)) continue;
      overrides[String(id)] = {
        id: String(id),
        label: String(item.label || id),
        position: item.position.slice(0, 3).map(Number),
        target: item.target.slice(0, 3).map(Number),
        fov: Number.isFinite(Number(item.fov)) ? Number(item.fov) : DEFAULT_FOV,
        duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : SCENE_TRANSITION_MS,
      };
    }
    const custom = [];
    const seen = new Set();
    for (const item of Array.isArray(src.custom) ? src.custom : []) {
      const id = String(item?.id || '');
      if (!id.startsWith('user:') || seen.has(id) || !finite3(item?.position) || !finite3(item?.target)) continue;
      seen.add(id);
      custom.push({
        id,
        label: String(item.label || id),
        position: item.position.slice(0, 3).map(Number),
        target: item.target.slice(0, 3).map(Number),
        fov: Number.isFinite(Number(item.fov)) ? Number(item.fov) : DEFAULT_FOV,
        duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : SCENE_TRANSITION_MS,
      });
    }
    return { hidden, overrides, custom };
  }

  function normalizeInstruments(value) {
    const src = value && typeof value === 'object' ? value : {};
    const hidden = [...new Set(Array.isArray(src.hidden) ? src.hidden.map(String) : [])];
    const overrides = {};
    for (const [k, item] of Object.entries(src.overrides || {})) {
      const anchor = item?.anchor;
      if (!finite3(anchor?.camera) || !finite3(anchor?.target)) continue;
      overrides[String(k)] = {
        subject: String(item.subject || ''),
        id: String(item.id || ''),
        label: String(item.label || item.id || ''),
        anchor: {
          camera: anchor.camera.slice(0, 3).map(Number),
          target: anchor.target.slice(0, 3).map(Number),
          fov: Number.isFinite(Number(anchor.fov)) ? Number(anchor.fov) : DEFAULT_FOV,
        },
      };
    }
    const custom = [];
    for (const item of Array.isArray(src.custom) ? src.custom : []) {
      const anchor = item?.anchor;
      const id = String(item?.id || '');
      if (!item?.subject || !id.startsWith('user:') || !finite3(anchor?.camera) || !finite3(anchor?.target)) continue;
      custom.push({
        subject: String(item.subject), id, label: String(item.label || id),
        anchor: {
          camera: anchor.camera.slice(0, 3).map(Number),
          target: anchor.target.slice(0, 3).map(Number),
          fov: Number.isFinite(Number(anchor.fov)) ? Number(anchor.fov) : DEFAULT_FOV,
        },
      });
    }
    return { hidden, overrides, custom };
  }

  function normalizeConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    return {
      schema: SCHEMA,
      scenes: {
        none: normalizeScene(src.scenes?.none),
        nocturne: normalizeScene(src.scenes?.nocturne),
      },
      instruments: normalizeInstruments(src.instruments),
    };
  }

  function safeParse(text) {
    try { return JSON.parse(text || 'null'); } catch { return null; }
  }

  function migrateLegacy() {
    const baked = window.VIRTUAL_BAND_CAMERA_LIBRARY_CONFIG;
    const out = baked?.schema === SCHEMA ? normalizeConfig(baked) : emptyConfig();

    // Preserve the old baked NOCTURNE library for projects that have not moved to the
    // unified schema yet, then let browser drafts win exactly as before.
    const oldBaked = window.VIRTUAL_BAND_CAMERA_PRESET_CONFIG;
    if (oldBaked?.scope === 'nocturne' && !out.scenes.nocturne.custom.length && !Object.keys(out.scenes.nocturne.overrides).length) {
      out.scenes.nocturne = normalizeScene(oldBaked);
    }

    const oldStage = safeParse(localStorage.getItem(LEGACY_STAGE_STORE));
    if (oldStage?.scope === 'nocturne') out.scenes.nocturne = normalizeScene(oldStage);

    const oldInstrument = safeParse(localStorage.getItem(LEGACY_INSTRUMENT_STORE));
    if (oldInstrument) out.instruments = normalizeInstruments(oldInstrument);
    return out;
  }

  function loadConfig() {
    const stored = safeParse(localStorage.getItem(STORE));
    if (stored?.schema === SCHEMA) return normalizeConfig(stored);
    const migrated = migrateLegacy();
    localStorage.setItem(STORE, JSON.stringify(migrated));
    return migrated;
  }

  function persist() {
    localStorage.setItem(STORE, JSON.stringify(config));
  }

  function currentRoot() {
    const live = liveRoot();
    if (live) {
      lockedRootName = live.name;
      return live;
    }
    return lockedRootName ? rootByName(lockedRootName) : null;
  }

  function captureWorld(label = '') {
    runtime.camera.updateMatrixWorld(true);
    const position = runtime.camera.position.clone();
    const stateTarget = camera.state?.target;
    const target = stateTarget?.isVector3
      ? stateTarget.clone()
      : stateTarget && Number.isFinite(stateTarget.x)
        ? new T.Vector3(stateTarget.x, stateTarget.y, stateTarget.z)
        : position.clone().add(runtime.camera.getWorldDirection(new T.Vector3()).multiplyScalar(20));
    return {
      label,
      position: position.toArray().map(v => round(v)),
      target: target.toArray().map(v => round(v)),
      fov: round(runtime.camera.fov, 2),
      duration: SCENE_TRANSITION_MS,
    };
  }

  function captureAnchor(root) {
    if (!root) return null;
    runtime.camera.updateMatrixWorld(true);
    root.updateWorldMatrix(true, true);
    const world = captureWorld();
    const cameraLocal = root.worldToLocal(new T.Vector3(...world.position));
    const targetLocal = root.worldToLocal(new T.Vector3(...world.target));
    return {
      camera: cameraLocal.toArray().map(v => round(v)),
      target: targetLocal.toArray().map(v => round(v)),
      fov: world.fov,
    };
  }

  function showAnchor(root, anchor, durationMs = INSTRUMENT_TRANSITION_MS) {
    if (!root || !anchor) return false;
    root.updateWorldMatrix(true, true);
    const position = root.localToWorld(new T.Vector3(...anchor.camera));
    const target = root.localToWorld(new T.Vector3(...anchor.target));
    return rawPose?.({
      position: position.toArray(), target: target.toArray(),
      fov: anchor.fov || DEFAULT_FOV, durationMs,
    }, false) ?? false;
  }

  function sceneConfig(id = sceneId()) { return config.scenes[id] || config.scenes.none; }
  function instrumentConfig() { return config.instruments; }

  function sceneEntries(id = sceneId()) {
    const cfg = sceneConfig(id);
    const base = (SCENE_SYSTEM[id] || SCENE_SYSTEM.none).map(([viewId, label]) => ({
      id: viewId, label, system: true,
      hidden: cfg.hidden.includes(viewId), overridden: !!cfg.overrides[viewId],
    }));
    const custom = cfg.custom.map(item => ({ id: item.id, label: item.label, system: false, hidden: false, overridden: false }));
    return [...base, ...custom];
  }

  function instrumentEntries(root) {
    if (!root) return [];
    const type = typeOf(root), subject = subjectOf(root), cfg = instrumentConfig();
    const base = (INSTRUMENT_SYSTEM[type] || []).map(([viewId, label]) => ({
      id: viewId, label, system: true,
      hidden: cfg.hidden.includes(key(subject, viewId)), overridden: !!cfg.overrides[key(subject, viewId)],
    }));
    const custom = cfg.custom
      .filter(item => item.subject === subject)
      .map(item => ({ id: item.id, label: item.label, system: false, hidden: false, overridden: false }));
    return [...base, ...custom];
  }

  function selectedEntries() {
    const root = currentRoot();
    return root ? instrumentEntries(root) : sceneEntries();
  }

  function sceneSpec(id) {
    const cfg = sceneConfig();
    return cfg.overrides[id] || cfg.custom.find(item => item.id === id) || null;
  }

  function instrumentSpec(root, id) {
    if (!root) return null;
    const cfg = instrumentConfig(), subject = subjectOf(root);
    return cfg.overrides[key(subject, id)] || cfg.custom.find(item => item.subject === subject && item.id === id) || null;
  }

  // One camera API surface for every scene. Scene custom views are venue-local;
  // instrument custom/override views resolve from the same shared root-local library.
  camera.view = function libraryView(id) {
    if (!editing) lockedRootName = '';
    const cfg = sceneConfig();
    const viewId = String(id || 'front');
    if (cfg.hidden.includes(viewId)) return false;
    const spec = sceneSpec(viewId);
    if (spec) return rawPose?.({...spec, durationMs: spec.duration || SCENE_TRANSITION_MS}, false) ?? false;
    return rawView(viewId);
  };

  if (rawHome) camera.home = () => { lockedRootName = ''; return camera.view('front'); };

  camera.focusView = function libraryFocusView(root, id = 'overall') {
    if (!root) return false;
    const subject = subjectOf(root), viewId = String(id || 'overall'), cfg = instrumentConfig();
    if (cfg.hidden.includes(key(subject, viewId))) return false;
    const spec = instrumentSpec(root, viewId);
    if (spec?.anchor) {
      lockedRootName = root.name;
      return showAnchor(root, spec.anchor);
    }
    const result = rawFocusView ? rawFocusView(root, viewId) : rawFocus?.(root);
    if (result !== false) lockedRootName = root.name;
    return result;
  };

  if (rawFocus) camera.focus = root => {
    const result = camera.focusView(root, 'overall');
    if (result !== false && root) lockedRootName = root.name;
    return result;
  };

  const section = document.createElement('div');
  section.className = 'camera-library-section';
  section.innerHTML = `
    <div class="camera-library-head">
      <div><span>镜头库</span><strong id="camera-library-subject">整体 / 场景</strong></div>
      <button id="camera-library-edit" type="button">编辑</button>
    </div>
    <div class="camera-library-row">
      <select id="camera-library-select" aria-label="选择镜头"></select>
      <button id="camera-library-go" type="button">看</button>
    </div>`;
  const prefs = panel.querySelector('.camera-pref-section');
  panel.insertBefore(section, prefs || null);

  const style = document.createElement('style');
  style.id = 'camera-library-style';
  style.textContent = `
    #camera-menu .camera-venue-section{display:none!important}
    .camera-library-section{display:grid;gap:7px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}
    .camera-library-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .camera-library-head>div{display:grid;gap:2px}.camera-library-head span{font-size:7px;letter-spacing:.12em;color:#71858d}.camera-library-head strong{font-size:10px;color:#dce7e5;font-weight:600}
    .camera-library-head button,.camera-library-row button{border:1px solid #cad9e022;border-radius:7px;background:#ffffff05;color:#aebdc0;cursor:pointer}
    .camera-library-head button{height:26px;padding:0 9px;font-size:8px}.camera-library-row{display:grid;grid-template-columns:minmax(0,1fr) 46px;gap:5px}
    .camera-library-row select{min-width:0;width:100%;height:30px;border:1px solid #cad9e023;border-radius:7px;background:#17262d;color:#d6e0de;padding:0 7px;font-size:9px}.camera-library-row button{font-size:9px}
    .camera-library-shell[hidden]{display:none!important}.camera-library-shell{position:fixed;z-index:10020;top:74px;right:18px;width:min(350px,calc(100vw - 36px));max-height:calc(100vh - 104px);overflow:auto;border:1px solid #cad9e025;border-radius:14px;background:#101b20f7;box-shadow:0 18px 55px #0009;backdrop-filter:blur(16px);color:#dce7e5}
    .camera-library-shell *{box-sizing:border-box}.camera-library-title{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:12px 13px 10px;background:#101b20f2;border-bottom:1px solid #cad9e012}.camera-library-title div{display:grid;gap:2px}.camera-library-title strong{font-size:11px}.camera-library-title small{font-size:7px;color:#71858d}.camera-library-title button{border:0;background:transparent;color:#8fa0a4;font-size:17px;cursor:pointer}
    .camera-library-body{display:grid;gap:9px;padding:10px}.camera-library-context{display:flex;align-items:center;justify-content:space-between;gap:8px}.camera-library-context>div{display:grid;gap:2px}.camera-library-context small{font-size:7px;color:#71858d}.camera-library-context strong{font-size:10px}.camera-library-context button{height:27px;border:1px solid #cad9e020;border-radius:7px;background:#ffffff05;color:#aebdc0;font-size:8px;cursor:pointer}
    .camera-library-body select,.camera-library-body input{width:100%;height:31px;border:1px solid #cad9e023;border-radius:7px;background:#17262d;color:#d6e0de;padding:0 8px;font-size:9px;outline:none}.camera-library-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.camera-library-actions button,.camera-library-save button,.camera-library-io button{height:30px;border:1px solid #cad9e020;border-radius:7px;background:#ffffff05;color:#b8c5c6;font-size:8px;cursor:pointer}.camera-library-actions button[hidden]{display:none!important}
    .camera-library-save{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;padding-top:8px;border-top:1px solid #cad9e012}.camera-library-io{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;padding-top:8px;border-top:1px solid #cad9e012}.camera-library-status{min-height:14px;font-size:7px;color:#74878d;line-height:1.5}
    @media(max-width:680px){.camera-library-shell{top:auto;left:10px;right:10px;bottom:10px;width:auto;max-height:62vh}}
  `;
  document.head.appendChild(style);

  const shell = document.createElement('div');
  shell.className = 'camera-library-shell';
  shell.hidden = true;
  shell.innerHTML = `
    <div class="camera-library-title"><div><strong>镜头库编辑</strong><small>全场景统一 · 乐器镜头跨场景共享</small></div><button id="camera-library-close" type="button" aria-label="关闭">×</button></div>
    <div class="camera-library-body">
      <div class="camera-library-context"><div><small>当前对象</small><strong id="camera-library-edit-subject">整体 / 场景</strong></div><button id="camera-library-stage" type="button" hidden>回到整体</button></div>
      <select id="camera-library-edit-select" aria-label="编辑镜头"></select>
      <div class="camera-library-actions"><button id="camera-library-preview" type="button">看</button><button id="camera-library-overwrite" type="button">覆盖</button><button id="camera-library-hide" type="button">隐藏</button><button id="camera-library-default" type="button" hidden>恢复默认</button></div>
      <div class="camera-library-save"><input id="camera-library-name" placeholder="新视角名称"><button id="camera-library-add" type="button">＋ 保存当前</button></div>
      <div class="camera-library-io"><button id="camera-library-copy" type="button">复制 JSON</button><button id="camera-library-download" type="button">下载 JSON</button><button id="camera-library-import" type="button">导入 JSON</button></div>
      <input id="camera-library-file" type="file" accept="application/json,.json" hidden>
      <div class="camera-library-status" id="camera-library-status">乐器镜头保存在乐器局部坐标，切换场景后仍然可用。</div>
    </div>`;
  document.body.appendChild(shell);

  const $ = id => document.getElementById(id);
  const mainSubject = $('camera-library-subject');
  const mainSelect = $('camera-library-select');
  const editSubject = $('camera-library-edit-subject');
  const editSelect = $('camera-library-edit-select');
  const stageButton = $('camera-library-stage');
  const hideButton = $('camera-library-hide');
  const defaultButton = $('camera-library-default');
  const status = $('camera-library-status');

  function itemFor(select) {
    const list = selectedEntries();
    return list.find(item => item.id === select.value) || list[0] || null;
  }

  function renderSelect(select, prefer = '') {
    const list = selectedEntries();
    const old = prefer || select.value;
    select.innerHTML = '';
    for (const item of list) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.label}${item.hidden ? ' · 已隐藏' : ''}${item.overridden ? ' · 已覆盖' : ''}`;
      select.appendChild(option);
    }
    if (list.some(item => item.id === old)) select.value = old;
    else if (list.length) select.value = list[0].id;
  }

  function render(prefer = '') {
    const root = currentRoot();
    const subject = root ? labelOf(root) : `整体 / ${sceneId() === 'nocturne' ? 'NOCTURNE' : '纯乐队'}`;
    mainSubject.textContent = subject;
    editSubject.textContent = subject;
    stageButton.hidden = !root;
    renderSelect(mainSelect, prefer);
    renderSelect(editSelect, prefer || mainSelect.value);
    syncActions();
  }

  function syncActions() {
    const item = itemFor(editSelect);
    if (!item) return;
    hideButton.textContent = item.system ? (item.hidden ? '恢复' : '隐藏') : '删除';
    defaultButton.hidden = !(item.system && item.overridden);
  }

  function goSelected(select = editSelect) {
    const item = itemFor(select);
    if (!item) return false;
    const root = currentRoot();
    const result = root ? camera.focusView(root, item.id) : camera.view(item.id);
    if (select !== mainSelect) mainSelect.value = item.id;
    return result;
  }

  function overwriteSelected() {
    const item = itemFor(editSelect);
    if (!item) return;
    const root = currentRoot();
    if (root) {
      const subject = subjectOf(root), cfg = instrumentConfig(), anchor = captureAnchor(root);
      if (!anchor) return;
      if (item.system) {
        cfg.overrides[key(subject, item.id)] = {subject, id: item.id, label: item.label, anchor};
        cfg.hidden = cfg.hidden.filter(k => k !== key(subject, item.id));
      } else {
        const target = cfg.custom.find(x => x.subject === subject && x.id === item.id);
        if (target) target.anchor = anchor;
      }
    } else {
      const cfg = sceneConfig(), pose = captureWorld(item.label);
      if (item.system) {
        cfg.overrides[item.id] = {id: item.id, ...pose};
        cfg.hidden = cfg.hidden.filter(id => id !== item.id);
      } else {
        const target = cfg.custom.find(x => x.id === item.id);
        if (target) Object.assign(target, {id: item.id, ...pose});
      }
    }
    persist(); render(item.id); flash(`已覆盖：${item.label}`);
  }

  function hideSelected() {
    const item = itemFor(editSelect);
    if (!item) return;
    const root = currentRoot();
    if (root) {
      const subject = subjectOf(root), cfg = instrumentConfig(), k = key(subject, item.id);
      if (item.system) cfg.hidden = cfg.hidden.includes(k) ? cfg.hidden.filter(x => x !== k) : [...cfg.hidden, k];
      else cfg.custom = cfg.custom.filter(x => !(x.subject === subject && x.id === item.id));
    } else {
      const cfg = sceneConfig();
      if (item.system) cfg.hidden = cfg.hidden.includes(item.id) ? cfg.hidden.filter(x => x !== item.id) : [...cfg.hidden, item.id];
      else cfg.custom = cfg.custom.filter(x => x.id !== item.id);
    }
    persist(); render();
  }

  function resetSelected() {
    const item = itemFor(editSelect);
    if (!item?.system) return;
    const root = currentRoot();
    if (root) delete instrumentConfig().overrides[key(subjectOf(root), item.id)];
    else delete sceneConfig().overrides[item.id];
    persist(); render(item.id); flash(`已恢复默认：${item.label}`);
  }

  function nextSceneCustom() {
    const scene = sceneId(), used = new Set(sceneConfig().custom.map(item => item.id));
    let n = 1;
    while (used.has(`user:scene:${scene}:${String(n).padStart(3, '0')}`)) n++;
    return `user:scene:${scene}:${String(n).padStart(3, '0')}`;
  }

  function nextInstrumentCustom(subject) {
    const used = new Set(instrumentConfig().custom.filter(item => item.subject === subject).map(item => item.id));
    let n = 1;
    while (used.has(`user:${subject}:${String(n).padStart(3, '0')}`)) n++;
    return `user:${subject}:${String(n).padStart(3, '0')}`;
  }

  function addCurrent() {
    const input = $('camera-library-name');
    const root = currentRoot();
    const label = input.value.trim() || `自定义视角 ${selectedEntries().filter(x => !x.system).length + 1}`;
    let id = '';
    if (root) {
      const subject = subjectOf(root), anchor = captureAnchor(root);
      if (!anchor) return;
      id = nextInstrumentCustom(subject);
      instrumentConfig().custom.push({subject, id, label, anchor});
    } else {
      id = nextSceneCustom();
      sceneConfig().custom.push({id, ...captureWorld(label)});
    }
    persist(); input.value = ''; render(id); flash(`已保存：${label}`);
  }

  function exportBundle() { return normalizeConfig(config); }
  function exportText() { return JSON.stringify(exportBundle(), null, 2); }

  async function copyJson() {
    try { await navigator.clipboard.writeText(exportText()); flash('完整镜头库 JSON 已复制'); }
    catch { flash('复制失败，请使用下载 JSON'); }
  }

  function downloadJson() {
    const blob = new Blob([exportText()], {type: 'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'virtual-band-camera-library.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('完整镜头库 JSON 已下载');
  }

  function importJson(value) {
    if (value?.schema === 'virtual-band-camera-workbench/v1') {
      const migrated = emptyConfig();
      migrated.scenes.nocturne = normalizeScene(value.stage);
      migrated.instruments = normalizeInstruments(value.instruments);
      config = migrated;
    } else if (value?.schema === SCHEMA) config = normalizeConfig(value);
    else throw new Error('不支持的镜头 JSON schema');
    persist(); render(); flash('镜头库已导入');
    window.dispatchEvent(new CustomEvent('virtual-band-camera-library-change'));
  }

  function flash(text) {
    status.textContent = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      status.textContent = '乐器镜头保存在乐器局部坐标，切换场景后仍然可用。';
    }, 1700);
  }

  function enterEditing() {
    if (editing) return;
    editing = true;
    autoWasEnabled = !!window.VirtualBandPlaybackCamera?.enabled;
    window.VirtualBandPlaybackCamera?.disable?.();
    shell.hidden = false;
    render();
  }

  function exitEditing() {
    if (!editing) return;
    editing = false;
    shell.hidden = true;
    if (autoWasEnabled) window.VirtualBandPlaybackCamera?.enable?.();
    autoWasEnabled = false;
  }

  $('camera-library-edit').addEventListener('click', enterEditing);
  $('camera-library-go').addEventListener('click', () => goSelected(mainSelect));
  $('camera-library-close').addEventListener('click', exitEditing);
  $('camera-library-preview').addEventListener('click', () => goSelected(editSelect));
  $('camera-library-overwrite').addEventListener('click', overwriteSelected);
  hideButton.addEventListener('click', hideSelected);
  defaultButton.addEventListener('click', resetSelected);
  $('camera-library-add').addEventListener('click', addCurrent);
  $('camera-library-copy').addEventListener('click', copyJson);
  $('camera-library-download').addEventListener('click', downloadJson);
  editSelect.addEventListener('change', syncActions);
  mainSelect.addEventListener('change', () => {});
  stageButton.addEventListener('click', () => {
    lockedRootName = '';
    camera.view('front');
    render('front');
  });

  const fileInput = $('camera-library-file');
  $('camera-library-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try { importJson(JSON.parse(await file.text())); }
    catch (error) { console.error('[Camera Library] import failed', error); flash(error?.message || '导入失败'); }
    finally { fileInput.value = ''; }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && editing) exitEditing();
  });

  window.addEventListener('virtual-band-venue-change', () => {
    lockedRootName = '';
    lastSignature = '';
    requestAnimationFrame(() => render());
  });

  // Venue Manager still contains its legacy scene-camera DOM builder. Keep it hidden and
  // let this one library section be the single visible camera catalog in every venue.
  new MutationObserver(() => {
    panel.querySelectorAll('.camera-venue-section').forEach(node => node.setAttribute('aria-hidden', 'true'));
  }).observe(panel, {childList: true, subtree: true});

  function loop() {
    requestAnimationFrame(loop);
    const live = liveRoot();
    if (live) lockedRootName = live.name;
    const root = currentRoot();
    const sig = `${sceneId()}|${root?.name || 'stage'}|${camera.state?.focusedView || ''}|${sceneConfig().custom.length}|${instrumentConfig().custom.length}|${instrumentConfig().hidden.length}|${Object.keys(instrumentConfig().overrides).length}`;
    if (sig !== lastSignature) {
      lastSignature = sig;
      render();
    }
  }

  window.VirtualBandCameraLibrary = {
    get schema() { return SCHEMA; },
    get config() { return exportBundle(); },
    get scene() { return sceneId(); },
    get subject() { const root = currentRoot(); return root ? subjectOf(root) : `scene:${sceneId()}`; },
    entries() { return selectedEntries().map(item => ({...item})); },
    export: exportBundle,
    exportText,
    import: importJson,
    enterEditing,
    exitEditing,
    capture(label = '') { return currentRoot() ? captureAnchor(currentRoot()) : captureWorld(label); },
  };

  render();
  requestAnimationFrame(loop);
  console.info('[Camera Library] unified scene + global instrument camera library attached');
})();
