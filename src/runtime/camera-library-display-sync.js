'use strict';

// Compact presentation layer for Camera Library v1.
// The editor remains a floating workbench; normal use gets one subject, one grouped
// selector and one preview button. Legacy Camera v2 grids stay hidden so there is only
// one visible camera catalog in every venue.
(() => {
  const library = window.VirtualBandCameraLibrary;
  const camera = window.VirtualBandCamera;
  const menu = document.getElementById('camera-menu');
  const panel = menu?.querySelector('.camera-panel');
  const section = panel?.querySelector('.camera-library-section');
  const subject = document.getElementById('camera-library-subject');
  const select = document.getElementById('camera-library-select');
  const go = document.getElementById('camera-library-go');
  const edit = document.getElementById('camera-library-edit');
  if (!library || !camera || !menu || !panel || !section || !subject || !select || !go || !edit) return;

  const style = document.createElement('style');
  style.id = 'camera-library-display-sync-style';
  style.textContent = `
    /* One normal camera UI. The old quick-view grids still exist for compatibility only. */
    #camera-menu .controls,
    #camera-menu .camera-venue-section,
    #camera-menu .camera-focus-section,
    #camera-menu #camera-v2-note{display:none!important}

    #camera-menu .camera-library-section{
      margin:0!important;padding:0 0 9px!important;border-top:0!important;gap:8px!important
    }
    #camera-menu .camera-library-head{align-items:flex-end!important}
    #camera-menu .camera-library-head>div{gap:3px!important;min-width:0}
    #camera-menu .camera-library-head span{
      font-size:7px!important;letter-spacing:.14em!important;text-transform:uppercase;color:#71858d!important
    }
    #camera-menu .camera-library-head strong{
      max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      font-size:12px!important;line-height:1.15;color:#e4ece9!important
    }
    #camera-menu .camera-library-head-actions{display:flex;align-items:center;gap:5px;flex:0 0 auto}
    #camera-menu .camera-library-back,
    #camera-menu #camera-library-edit{
      height:25px!important;padding:0 8px!important;border:1px solid #cad9e01e!important;
      border-radius:7px!important;background:#ffffff04!important;color:#8fa1a4!important;
      font-size:8px!important;white-space:nowrap
    }
    #camera-menu .camera-library-back:hover,
    #camera-menu #camera-library-edit:hover{background:#ffffff09!important;color:#d7e2df!important}
    #camera-menu .camera-library-row{
      grid-template-columns:minmax(0,1fr) 34px!important;gap:6px!important
    }
    #camera-menu #camera-library-select{
      height:34px!important;border-radius:9px!important;background:#17262d!important;
      border-color:#cad9e024!important;color:#dce6e3!important;padding:0 9px!important;font-size:10px!important
    }
    #camera-menu #camera-library-go{
      width:34px;height:34px!important;border-radius:9px!important;padding:0!important;
      background:#ffffff06!important;color:#d5e0dd!important;font-size:11px!important
    }
    #camera-menu #camera-library-go:hover{background:#ffffff0d!important}
  `;
  document.head.appendChild(style);

  // Turn the existing header into a compact two-level title without changing the editor.
  const kicker = section.querySelector('.camera-library-head span');
  if (kicker) kicker.textContent = '镜头';
  edit.textContent = '编辑镜头';
  go.textContent = '▶';
  go.title = '切换到所选镜头';
  go.setAttribute('aria-label', '切换到所选镜头');

  const head = section.querySelector('.camera-library-head');
  const actions = document.createElement('div');
  actions.className = 'camera-library-head-actions';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'camera-library-back';
  back.textContent = '← 整体';
  back.hidden = true;
  head?.appendChild(actions);
  actions.append(back, edit);

  let syncing = false;
  let queued = false;
  let lastSignature = '';

  const isScene = () => String(library.subject || '').startsWith('scene:');

  function groups(entries) {
    if (isScene()) {
      return [
        ['场景机位', entries.filter(item => item.system)],
        ['我的镜头', entries.filter(item => !item.system)],
      ].filter(([, items]) => items.length);
    }
    return [
      ['展示', entries.filter(item => item.system && !String(item.id).startsWith('observe'))],
      ['演奏', entries.filter(item => item.system && String(item.id).startsWith('observe'))],
      ['我的镜头', entries.filter(item => !item.system)],
    ].filter(([, items]) => items.length);
  }

  function rebuild() {
    const entries = library.entries().filter(item => !item.hidden);
    const previous = select.value;
    syncing = true;
    try {
      select.innerHTML = '';
      for (const [label, items] of groups(entries)) {
        const group = document.createElement('optgroup');
        group.label = label;
        for (const item of items) {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.label;
          group.appendChild(option);
        }
        select.appendChild(group);
      }
      if (entries.some(item => item.id === previous)) select.value = previous;
      else if (entries.length) select.value = entries[0].id;
      back.hidden = isScene();
    } finally {
      syncing = false;
    }
  }

  function signature() {
    const entries = library.entries().filter(item => !item.hidden);
    return `${library.subject}|${entries.map(item => `${item.id}:${item.label}:${item.system ? 1 : 0}`).join('|')}`;
  }

  function isGroupedDom() {
    const children = [...select.children];
    return !children.length || children.every(node => node.tagName === 'OPTGROUP');
  }

  function sync() {
    queued = false;
    const sig = signature();
    // Camera Library may repaint this select with flat <option> nodes even when the data
    // itself did not change. Re-group whenever that happens, not only on data changes.
    if (sig === lastSignature && isGroupedDom()) {
      back.hidden = isScene();
      return;
    }
    lastSignature = sig;
    rebuild();
  }

  function queueSync() {
    if (syncing || queued) return;
    queued = true;
    queueMicrotask(sync);
  }

  back.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    camera.home?.();
    requestAnimationFrame(() => {
      lastSignature = '';
      sync();
    });
  });

  // Camera Library itself refreshes this select whenever focus/scene/config changes.
  // Regroup those flat options immediately, but do not maintain a second button catalog.
  new MutationObserver(queueSync).observe(select, {childList:true, subtree:true});
  window.addEventListener('virtual-band-camera-library-change', () => { lastSignature = ''; queueSync(); });
  window.addEventListener('virtual-band-venue-change', () => requestAnimationFrame(() => { lastSignature = ''; sync(); }));
  menu.addEventListener('toggle', queueSync);

  rebuild();
  lastSignature = signature();
  console.info('[Camera Library] compact single-selector presentation attached');
})();
