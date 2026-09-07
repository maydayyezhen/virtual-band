'use strict';

// Compatibility UI bridge for Camera Library v1.
// Camera v2 still owns the old instrument "展示 / 演奏观察" button grid. Rebuild that
// grid from the unified Camera Library so user-created / hidden / overridden views use
// the same data source as the editor instead of leaving a stale second camera catalog.
(() => {
  const library = window.VirtualBandCameraLibrary;
  const menu = document.getElementById('camera-menu');
  const panel = menu?.querySelector('.camera-panel');
  const section = menu?.querySelector('.camera-focus-section');
  const title = menu?.querySelector('#camera-focus-title');
  const views = menu?.querySelector('#camera-focus-views');
  const mainSelect = document.getElementById('camera-library-select');
  const goButton = document.getElementById('camera-library-go');
  if (!library || !menu || !panel || !section || !views || !mainSelect || !goButton) return;

  const style = document.createElement('style');
  style.id = 'camera-library-display-sync-style';
  style.textContent = `
    /* Camera Library is the stage-view catalog now; remove the legacy duplicate row. */
    #camera-menu .controls{display:none!important}
    #camera-menu .camera-venue-section{display:none!important}
    #camera-menu .camera-focus-section.camera-library-synced{display:block}
    #camera-menu .camera-library-custom-label{color:#9fb8b2}
  `;
  document.head.appendChild(style);

  let syncing = false;
  let queued = false;

  const isSceneSubject = subject => String(subject || '').startsWith('scene:');
  const visibleEntries = () => library.entries().filter(item => !item.hidden);

  function expectedGroups(entries) {
    const display = entries.filter(item => item.system && !String(item.id).startsWith('observe'));
    const perform = entries.filter(item => item.system && String(item.id).startsWith('observe'));
    const custom = entries.filter(item => !item.system);
    return [
      {label:'展示', items:display},
      {label:'演奏观察', items:perform},
      {label:'自定义', items:custom, custom:true},
    ].filter(group => group.items.length);
  }

  function domMatches(entries) {
    const actual = [...views.querySelectorAll('[data-library-view]')].map(button => button.dataset.libraryView);
    const expected = entries.map(item => item.id);
    return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
  }

  function makeButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'view camera-subview';
    button.dataset.libraryView = item.id;
    button.textContent = item.label;
    button.setAttribute('aria-pressed', String(mainSelect.value === item.id));
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      mainSelect.value = item.id;
      goButton.click();
      queueSync();
    });
    return button;
  }

  function rebuild(entries) {
    views.innerHTML = '';
    for (const group of expectedGroups(entries)) {
      const block = document.createElement('div');
      block.className = 'camera-view-group';
      const label = document.createElement('div');
      label.className = `camera-view-group-label${group.custom ? ' camera-library-custom-label' : ''}`;
      label.textContent = group.label;
      block.appendChild(label);
      const grid = document.createElement('div');
      grid.className = 'camera-subviews-grid';
      for (const item of group.items) grid.appendChild(makeButton(item));
      block.appendChild(grid);
      views.appendChild(block);
    }
  }

  function sync() {
    queued = false;
    if (syncing) return;
    syncing = true;
    try {
      const subject = library.subject;
      if (isSceneSubject(subject)) {
        section.classList.remove('camera-library-synced');
        section.hidden = true;
        menu.classList.remove('instrument-focus');
        return;
      }

      const entries = visibleEntries();
      section.hidden = false;
      section.classList.add('camera-library-synced');
      menu.classList.add('instrument-focus');
      if (title) title.textContent = document.getElementById('camera-library-subject')?.textContent || subject;

      if (!domMatches(entries)) rebuild(entries);
      for (const button of views.querySelectorAll('[data-library-view]')) {
        button.setAttribute('aria-pressed', String(button.dataset.libraryView === mainSelect.value));
      }
    } finally {
      syncing = false;
    }
  }

  function queueSync() {
    if (queued) return;
    queued = true;
    queueMicrotask(sync);
  }

  new MutationObserver(queueSync).observe(mainSelect, {childList:true, subtree:true});
  new MutationObserver(() => { if (!syncing) queueSync(); }).observe(views, {childList:true, subtree:true});
  mainSelect.addEventListener('change', queueSync);
  menu.addEventListener('click', queueSync, true);
  window.addEventListener('virtual-band-camera-library-change', queueSync);
  window.addEventListener('virtual-band-venue-change', () => requestAnimationFrame(sync));

  sync();
  console.info('[Camera Library] legacy instrument display now mirrors unified library');
})();
