'use strict';

(() => {
  function refreshShadows() {
    if (typeof renderer === 'undefined' || !renderer?.shadowMap) return;
    renderer.shadowMap.needsUpdate = true;
  }

  function refreshAfterLayoutChange() {
    refreshShadows();
    queueMicrotask(refreshShadows);
  }

  // These controls can change which instrument groups are visible or where they sit.
  // The renderer intentionally keeps shadowMap.autoUpdate=false for performance, so
  // layout changes must invalidate the cached shadow map explicitly.
  for (const id of ['bp-song', 'bp-mode', 'bp-instrument', 'pr-target']) {
    document.getElementById(id)?.addEventListener('change', refreshAfterLayoutChange);
  }

  // Imported MIDI is parsed asynchronously. Song metadata changes after its stage
  // layout has been applied, which gives us a reliable post-import invalidation point.
  const title = document.getElementById('bp-title');
  if (title) {
    new MutationObserver(refreshAfterLayoutChange).observe(title, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Keep an explicit hook for future scene/layout code without turning dynamic
  // shadows back on globally.
  window.refreshVirtualBandShadows = refreshAfterLayoutChange;
})();
