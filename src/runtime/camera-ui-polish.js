'use strict';

// Product-facing Camera Library UI.
// Camera Library remains the data/API source; this module replaces native selects and
// legacy button grids with one compact custom picker and a small control footer.
(() => {
  const library = window.VirtualBandCameraLibrary;
  const camera = window.VirtualBandCamera;
  const menu = document.getElementById('camera-menu');
  const panel = menu?.querySelector('.camera-panel');
  const nativeSection = panel?.querySelector('.camera-library-section');
  const nativeSubject = document.getElementById('camera-library-subject');
  const nativeSelect = document.getElementById('camera-library-select');
  const nativeGo = document.getElementById('camera-library-go');
  const nativeEdit = document.getElementById('camera-library-edit');
  const nativeZoomIn = panel?.querySelector('#zoom-in');
  const nativeZoomOut = panel?.querySelector('#zoom-out');
  const nativeReset = panel?.querySelector('#reset');
  const verticalSelect = panel?.querySelector('#camera-vertical-mode');
  const sensitivitySelect = panel?.querySelector('#camera-sensitivity');
  if (!library || !camera || !menu || !panel || !nativeSection || !nativeSubject || !nativeSelect || !nativeGo || !nativeEdit) return;

  const icon = {
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 7.3h3l1.4-2h5.6l1.4 2h3A2.8 2.8 0 0 1 22 10.1v7.1A2.8 2.8 0 0 1 19.2 20H4.8A2.8 2.8 0 0 1 2 17.2v-7.1a2.8 2.8 0 0 1 2.8-2.8Z"/><circle cx="12" cy="13.3" r="4.1"/></svg>',
    chevron: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5"/></svg>',
    edit: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13.8 3.2 3 3-9.4 9.4-3.8.8.8-3.8 9.4-9.4Z"/></svg>',
    back: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m11.8 4.5-5.5 5.5 5.5 5.5M6.5 10h8"/></svg>',
    home: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3.5 9.2 6.5-5.4 6.5 5.4v7.1h-4.2v-4.4H7.7v4.4H3.5V9.2Z"/></svg>',
    gear: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.7 2.8h2.6l.5 2a6 6 0 0 1 1.2.7l2-.6 1.3 2.2-1.5 1.4c.1.5.1 1 0 1.5l1.5 1.4-1.3 2.2-2-.6c-.4.3-.8.5-1.2.7l-.5 2H8.7l-.5-2a6 6 0 0 1-1.2-.7l-2 .6-1.3-2.2L5.2 10a6 6 0 0 1 0-1.5L3.7 7.1 5 4.9l2 .6c.4-.3.8-.5 1.2-.7l.5-2Z"/><circle cx="10" cy="9.3" r="2.2"/></svg>',
  };

  // The trigger itself becomes a compact camera glyph instead of another text pill.
  const summary = menu.querySelector('summary');
  if (summary) {
    summary.innerHTML = `${icon.camera}<span class="sr-only">镜头</span>`;
    summary.title = '镜头';
  }

  const studio = document.createElement('section');
  studio.className = 'camera-studio';
  studio.innerHTML = `
    <div class="camera-studio-head">
      <div class="camera-studio-heading">
        <span class="camera-studio-kicker">CAMERA</span>
        <strong id="camera-studio-subject">整体 / 场景</strong>
      </div>
      <button class="camera-studio-edit" type="button" title="编辑镜头">${icon.edit}<span>编辑</span></button>
    </div>

    <button class="camera-shot-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span class="camera-shot-copy">
        <small id="camera-shot-type">场景机位</small>
        <strong id="camera-shot-name">正面</strong>
      </span>
      <span class="camera-shot-chevron">${icon.chevron}</span>
    </button>

    <div class="camera-shot-menu" role="listbox" hidden></div>

    <div class="camera-studio-footer">
      <button class="camera-studio-back" type="button" title="返回整体" hidden>${icon.back}<span>整体</span></button>
      <div class="camera-studio-nav" aria-label="镜头导航">
        <button type="button" data-action="zoom-out" title="拉远">−</button>
        <button type="button" data-action="home" title="舞台正面">${icon.home}</button>
        <button type="button" data-action="zoom-in" title="推近">＋</button>
      </div>
      <button class="camera-studio-settings-button" type="button" title="镜头设置" aria-expanded="false">${icon.gear}</button>
    </div>

    <div class="camera-studio-settings" hidden>
      <div class="camera-setting-row">
        <span>上下拖动</span>
        <div class="camera-segments" data-setting="vertical">
          <button type="button" data-value="standard">标准</button>
          <button type="button" data-value="inverted">反向</button>
        </div>
      </div>
      <div class="camera-setting-row">
        <span>灵敏度</span>
        <div class="camera-segments" data-setting="sensitivity">
          <button type="button" data-value="low">低</button>
          <button type="button" data-value="medium">中</button>
          <button type="button" data-value="high">高</button>
        </div>
      </div>
    </div>`;

  panel.prepend(studio);

  const style = document.createElement('style');
  style.id = 'camera-studio-style';
  style.textContent = `
    /* Product camera surface */
    #camera-menu>summary{
      width:42px!important;min-width:42px!important;padding:0!important;border-radius:13px!important;
      background:rgba(18,29,35,.68)!important;border-color:#d4e2de1b!important;
      box-shadow:0 9px 30px #0003!important
    }
    #camera-menu>summary svg{width:17px;height:17px;fill:none;stroke:#dce6e2;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}
    #camera-menu[open]>summary{background:rgba(33,48,55,.92)!important;border-color:#d9e6e13a!important}
    #camera-menu .camera-panel{
      width:292px!important;padding:13px!important;border-radius:18px!important;
      border:1px solid #dbe8e31d!important;
      background:linear-gradient(155deg,rgba(20,31,37,.97),rgba(11,19,23,.96))!important;
      box-shadow:0 30px 90px #000a, inset 0 1px #ffffff0a!important;
      backdrop-filter:blur(28px) saturate(118%)!important
    }
    #camera-menu .camera-library-section,
    #camera-menu .controls,
    #camera-menu .camera-focus-section,
    #camera-menu .camera-venue-section,
    #camera-menu .camera-pref-section,
    #camera-menu .right-tools,
    #camera-menu #camera-v2-note{display:none!important}

    .camera-studio{position:relative;display:grid;gap:10px}
    .camera-studio-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 2px 1px}
    .camera-studio-heading{display:grid;gap:3px;min-width:0}
    .camera-studio-kicker{font-size:7px;letter-spacing:.22em;color:#d6b987;text-transform:uppercase}
    .camera-studio-heading strong{font-size:13px;font-weight:560;letter-spacing:.01em;color:#edf2ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .camera-studio-edit{height:27px;display:flex;align-items:center;gap:5px;padding:0 8px;border:1px solid #d8e5e01b;border-radius:8px;background:#ffffff04;color:#94a7aa;font-size:8px;cursor:pointer;transition:.16s ease}
    .camera-studio-edit svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}
    .camera-studio-edit:hover{color:#e6eeeb;background:#ffffff09;border-color:#d8e5e02c}

    .camera-shot-trigger{width:100%;min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #d9e6e021;border-radius:13px;background:linear-gradient(135deg,#ffffff08,#ffffff03);color:#e8efec;text-align:left;cursor:pointer;box-shadow:inset 0 1px #ffffff08;transition:.17s ease}
    .camera-shot-trigger:hover,.camera-shot-trigger[aria-expanded="true"]{border-color:#d8e4df38;background:linear-gradient(135deg,#ffffff0d,#ffffff05);transform:translateY(-1px)}
    .camera-shot-copy{display:grid;gap:4px;min-width:0}
    .camera-shot-copy small{font-size:7px;letter-spacing:.08em;color:#758a90}
    .camera-shot-copy strong{font-size:12px;font-weight:560;color:#edf2ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .camera-shot-chevron{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:#ffffff05;color:#879b9f;flex:0 0 auto;transition:transform .16s ease}
    .camera-shot-chevron svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .camera-shot-trigger[aria-expanded="true"] .camera-shot-chevron{transform:rotate(180deg)}

    .camera-shot-menu{display:grid;gap:10px;max-height:min(310px,48vh);overflow:auto;padding:9px;border:1px solid #dce7e21d;border-radius:13px;background:#0e181deF;box-shadow:0 18px 48px #0009,inset 0 1px #ffffff08;scrollbar-width:thin;scrollbar-color:#ffffff20 transparent}
    .camera-shot-menu[hidden]{display:none!important}
    .camera-shot-group{display:grid;gap:4px}.camera-shot-group+.camera-shot-group{padding-top:8px;border-top:1px solid #ffffff0b}
    .camera-shot-group-label{padding:0 7px 3px;font-size:7px;letter-spacing:.15em;color:#687c83;text-transform:uppercase}
    .camera-shot-option{width:100%;height:35px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 8px 0 10px;border:0;border-radius:9px;background:transparent;color:#aab9ba;text-align:left;cursor:pointer;transition:.13s ease}
    .camera-shot-option:hover{background:#ffffff08;color:#eef3f0}
    .camera-shot-option[aria-selected="true"]{background:#dfe9e5;color:#142027}
    .camera-shot-option-main{min-width:0;display:flex;align-items:center;gap:8px;font-size:10px;font-weight:520}
    .camera-shot-dot{width:5px;height:5px;border-radius:999px;background:#7d9295;box-shadow:0 0 0 3px #7d929510;flex:0 0 auto}
    .camera-shot-option[aria-selected="true"] .camera-shot-dot{background:#48675f;box-shadow:0 0 0 3px #48675f18}
    .camera-shot-tag{font-size:7px;letter-spacing:.06em;color:#71858b}.camera-shot-option[aria-selected="true"] .camera-shot-tag{color:#527067}

    .camera-studio-footer{display:flex;align-items:center;justify-content:space-between;gap:7px;padding-top:1px}
    .camera-studio-footer button{border:1px solid #d8e5e019;background:#ffffff035;color:#8ea0a4;cursor:pointer;transition:.14s ease}
    .camera-studio-footer button:hover{background:#ffffff09;color:#e5edeb;border-color:#d8e5e029}
    .camera-studio-back{height:30px;display:flex;align-items:center;gap:5px;padding:0 8px;border-radius:9px!important;font-size:8px}
    .camera-studio-back svg,.camera-studio-settings-button svg,.camera-studio-nav svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
    .camera-studio-nav{display:flex;align-items:center;gap:4px;margin-left:auto}
    .camera-studio-nav button,.camera-studio-settings-button{width:30px;height:30px;display:grid;place-items:center;padding:0;border-radius:9px!important;font-size:13px}

    .camera-studio-settings{display:grid;gap:9px;padding:10px;border:1px solid #ffffff0e;border-radius:11px;background:#ffffff025}
    .camera-studio-settings[hidden]{display:none!important}
    .camera-setting-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.camera-setting-row>span{font-size:8px;color:#778b91;white-space:nowrap}
    .camera-segments{display:flex;gap:2px;padding:2px;border-radius:8px;background:#0b151a;border:1px solid #ffffff0c}
    .camera-segments button{height:24px;min-width:38px;padding:0 7px;border:0;border-radius:6px;background:transparent;color:#71858b;font-size:7px;cursor:pointer}
    .camera-segments button.active{background:#dce7e3;color:#172329;box-shadow:0 2px 8px #0003}

    @media(max-width:680px){#camera-menu .camera-panel{width:min(292px,calc(100vw - 24px))!important}.camera-shot-menu{max-height:36vh}}
  `;
  document.head.appendChild(style);

  const subjectEl = studio.querySelector('#camera-studio-subject');
  const typeEl = studio.querySelector('#camera-shot-type');
  const nameEl = studio.querySelector('#camera-shot-name');
  const trigger = studio.querySelector('.camera-shot-trigger');
  const shotMenu = studio.querySelector('.camera-shot-menu');
  const editButton = studio.querySelector('.camera-studio-edit');
  const backButton = studio.querySelector('.camera-studio-back');
  const settingsButton = studio.querySelector('.camera-studio-settings-button');
  const settings = studio.querySelector('.camera-studio-settings');

  let selectedId = nativeSelect.value || '';
  let lastSignature = '';
  let raf = 0;

  const isScene = () => String(library.subject || '').startsWith('scene:');
  const visibleEntries = () => library.entries().filter(item => !item.hidden);

  function groupEntries(entries) {
    if (isScene()) {
      return [
        ['场景机位', entries.filter(item => item.system), 'SCENE'],
        ['我的镜头', entries.filter(item => !item.system), 'USER'],
      ].filter(([, items]) => items.length);
    }
    return [
      ['展示', entries.filter(item => item.system && !String(item.id).startsWith('observe')), 'DISPLAY'],
      ['演奏', entries.filter(item => item.system && String(item.id).startsWith('observe')), 'LIVE'],
      ['我的镜头', entries.filter(item => !item.system), 'USER'],
    ].filter(([, items]) => items.length);
  }

  function itemType(item) {
    if (!item) return isScene() ? '场景机位' : '乐器机位';
    if (!item.system) return '我的镜头';
    if (!isScene() && String(item.id).startsWith('observe')) return '演奏机位';
    return isScene() ? '场景机位' : '展示机位';
  }

  function choose(id, close = true) {
    const entries = visibleEntries();
    const item = entries.find(x => x.id === id) || entries[0];
    if (!item) return;
    selectedId = item.id;
    nativeSelect.value = item.id;
    nativeGo.click();
    updateSelected();
    if (close) setPicker(false);
  }

  function setPicker(open) {
    const next = !!open;
    trigger.setAttribute('aria-expanded', String(next));
    shotMenu.hidden = !next;
    if (next) renderMenu();
  }

  function renderMenu() {
    const entries = visibleEntries();
    shotMenu.innerHTML = '';
    for (const [label, items, tag] of groupEntries(entries)) {
      const group = document.createElement('div');
      group.className = 'camera-shot-group';
      const heading = document.createElement('div');
      heading.className = 'camera-shot-group-label';
      heading.textContent = label;
      group.appendChild(heading);
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'camera-shot-option';
        button.dataset.viewId = item.id;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(item.id === selectedId));
        button.innerHTML = `<span class="camera-shot-option-main"><i class="camera-shot-dot"></i><span></span></span><small class="camera-shot-tag">${tag}</small>`;
        button.querySelector('.camera-shot-option-main span').textContent = item.label;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          choose(item.id);
        });
        group.appendChild(button);
      }
      shotMenu.appendChild(group);
    }
  }

  function updateSelected() {
    const entries = visibleEntries();
    if (!entries.some(item => item.id === selectedId)) selectedId = nativeSelect.value || entries[0]?.id || '';
    const item = entries.find(x => x.id === selectedId) || entries[0] || null;
    if (item) selectedId = item.id;
    subjectEl.textContent = nativeSubject.textContent || (isScene() ? '整体 / 场景' : library.subject);
    typeEl.textContent = itemType(item);
    nameEl.textContent = item?.label || '暂无镜头';
    backButton.hidden = isScene();
    if (!shotMenu.hidden) renderMenu();
  }

  function syncSegments() {
    const vertical = verticalSelect?.value || 'standard';
    const sensitivity = sensitivitySelect?.value || 'medium';
    studio.querySelectorAll('[data-setting="vertical"] button').forEach(b => b.classList.toggle('active', b.dataset.value === vertical));
    studio.querySelectorAll('[data-setting="sensitivity"] button').forEach(b => b.classList.toggle('active', b.dataset.value === sensitivity));
  }

  function signature() {
    return `${library.subject}|${nativeSubject.textContent}|${nativeSelect.value}|${visibleEntries().map(x => `${x.id}:${x.label}:${x.system ? 1 : 0}`).join('|')}`;
  }

  function sync() {
    raf = 0;
    const sig = signature();
    if (sig === lastSignature) return;
    lastSignature = sig;
    if (nativeSelect.value) selectedId = nativeSelect.value;
    updateSelected();
    syncSegments();
  }

  function queueSync() {
    if (raf) return;
    raf = requestAnimationFrame(sync);
  }

  trigger.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    setPicker(trigger.getAttribute('aria-expanded') !== 'true');
  });
  editButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); nativeEdit.click(); });
  backButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); camera.home?.(); setPicker(false); requestAnimationFrame(queueSync); });
  studio.querySelector('[data-action="zoom-out"]').addEventListener('click', () => nativeZoomOut?.click());
  studio.querySelector('[data-action="zoom-in"]').addEventListener('click', () => nativeZoomIn?.click());
  studio.querySelector('[data-action="home"]').addEventListener('click', () => { nativeReset?.click(); setPicker(false); });
  settingsButton.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    const open = settings.hidden;
    settings.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
    syncSegments();
  });

  studio.querySelectorAll('.camera-segments').forEach(group => {
    group.addEventListener('click', event => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      const select = group.dataset.setting === 'vertical' ? verticalSelect : sensitivitySelect;
      if (!select) return;
      select.value = button.dataset.value;
      select.dispatchEvent(new Event('change', {bubbles:true}));
      syncSegments();
    });
  });

  document.addEventListener('pointerdown', event => {
    if (!shotMenu.hidden && !studio.contains(event.target)) setPicker(false);
  }, true);
  menu.addEventListener('toggle', () => { if (!menu.open) setPicker(false); queueSync(); });
  new MutationObserver(queueSync).observe(nativeSelect, {childList:true, subtree:true, attributes:true});
  new MutationObserver(queueSync).observe(nativeSubject, {childList:true, subtree:true, characterData:true});
  nativeSelect.addEventListener('change', queueSync);
  window.addEventListener('virtual-band-camera-library-change', queueSync);
  window.addEventListener('virtual-band-venue-change', () => requestAnimationFrame(queueSync));

  updateSelected();
  syncSegments();
  console.info('[Camera UI] polished custom camera surface attached');
})();
