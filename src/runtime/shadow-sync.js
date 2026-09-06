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
  // directly exposed. Capture that one mesh while the scene is being assembled,
  // then immediately restore Three.js' original Scene.add implementation.
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

    // The painted contact patch was authored for the full ensemble layout. When
    // Free/Practice mode recentres a single instrument it otherwise stays behind
    // at the old band position and reads as a "ghost" shadow. Let the real
    // directional-light shadow ground focused instruments instead.
    contactShadow.visible = mode === 'song';
    if (mode === 'song') {
      contactShadow.position.set(0, -0.004, -2.05);
      contactShadow.scale.set(1, 1, 1);
    }
  }

  function refreshShadows() {
    if (typeof renderer === 'undefined' || !renderer?.shadowMap) return;
    renderer.shadowMap.needsUpdate = true;
  }

  function refreshAfterLayoutChange() {
    syncContactShadow();
    refreshShadows();
    // Some mode handlers update visibility/positions near the end of the same task.
    // One microtask invalidation keeps the cached map aligned without enabling
    // expensive per-frame shadow updates during key/string animation.
    queueMicrotask(() => {
      syncContactShadow();
      refreshShadows();
    });
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
