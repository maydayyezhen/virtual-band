'use strict';

(() => {
  let contactShadow = null;

  function looksLikeStageContactShadow(object) {
    const p = object?.geometry?.parameters;
    return !!(
      object?.isMesh &&
      object.material?.isMeshBasicMaterial &&
      object.material.transparent === true &&
      object.material.depthWrite === false &&
      Math.abs((p?.width || 0) - 12.3) < 0.01 &&
      Math.abs((p?.height || 0) - 7.2) < 0.01
    );
  }

  // app.js creates the broad painted contact shadow inside start(), so it is not
  // directly exposed. Capture that mesh while the scene is being assembled.
  const sceneAdd = THREE.Scene.prototype.add;
  THREE.Scene.prototype.add = function (...objects) {
    const result = sceneAdd.apply(this, objects);
    if (!contactShadow) {
      contactShadow = objects.find(looksLikeStageContactShadow) || null;
      if (contactShadow) THREE.Scene.prototype.add = sceneAdd;
    }
    return result;
  };

  function syncContactShadow() {
    if (!contactShadow) return;
    const mode = document.getElementById('bp-mode')?.value || 'song';

    // The painted patch is only useful as broad grounding for the full ensemble.
    // Focused Free/Practice scenes rely on the real directional-light shadow.
    contactShadow.visible = mode === 'song';
    if (mode === 'song') {
      // New band arrangement is wider and deeper than the old product-display row.
      contactShadow.position.set(0, -0.004, -0.75);
      contactShadow.scale.set(1.46, 1.63, 1);
    }
  }

  function refreshShadows() {
    if (typeof renderer === 'undefined' || !renderer?.shadowMap) return;
    renderer.shadowMap.needsUpdate = true;
  }

  function refreshAfterLayoutChange() {
    syncContactShadow();
    refreshShadows();
    queueMicrotask(() => {
      syncContactShadow();
      refreshShadows();
    });
  }

  for (const id of ['bp-song', 'bp-mode', 'bp-instrument', 'pr-target']) {
    document.getElementById(id)?.addEventListener('change', refreshAfterLayoutChange);
  }

  const title = document.getElementById('bp-title');
  if (title) {
    new MutationObserver(refreshAfterLayoutChange).observe(title, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Initial scene assembly also needs one sync after app.js has created everything.
  requestAnimationFrame(() => requestAnimationFrame(refreshAfterLayoutChange));

  window.refreshVirtualBandShadows = refreshAfterLayoutChange;
})();
