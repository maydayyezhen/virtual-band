'use strict';

// Capture the actual stage Scene and PerspectiveCamera without touching renderer.render.
// Three.js WebGLRenderer installs render as an instance method, so prototype-render hooks
// are unreliable. Scene.add + PerspectiveCamera.lookAt are stable points in this app.
(() => {
  if (window.__VIRTUAL_BAND_CAMERA_CAPTURE_INSTALLED__) return;
  window.__VIRTUAL_BAND_CAMERA_CAPTURE_INSTALLED__ = true;

  const T = THREE;

  const isBandRoot = (object) => {
    const name = object?.name || '';
    return name === 'Atelier — dual-tier stage rig' ||
      /^Wish Acoustic \d+$/.test(name) ||
      name === 'Wish Fingered Bass' ||
      /Electric \d+$/.test(name) ||
      name === 'Atelier Session 04 · Band Drums';
  };

  // Capture the scene as soon as any top-level band root is added. Other runtime hooks
  // may wrap Scene.add too; they all chain through this wrapper, so this remains stable.
  const rawSceneAdd = T.Scene.prototype.add;
  T.Scene.prototype.add = function (...objects) {
    const result = rawSceneAdd.apply(this, objects);
    if (!window.__VIRTUAL_BAND_STAGE_SCENE__ && objects.some(isBandRoot)) {
      window.__VIRTUAL_BAND_STAGE_SCENE__ = this;
      console.info('[Camera v2] stage scene captured');
    }
    return result;
  };

  // app.js calls camera.lookAt(target) in its render loop. By the time the band scene
  // exists, PMREM setup has already finished, so the first matching perspective camera
  // is the real stage camera rather than an environment-map helper.
  const rawLookAt = T.PerspectiveCamera.prototype.lookAt;
  T.PerspectiveCamera.prototype.lookAt = function (...args) {
    if (!window.__VIRTUAL_BAND_STAGE_CAMERA__ &&
        window.__VIRTUAL_BAND_STAGE_SCENE__ &&
        this?.isPerspectiveCamera &&
        Math.abs((this.fov || 0) - 34) < 2) {
      window.__VIRTUAL_BAND_STAGE_CAMERA__ = this;
      console.info('[Camera v2] stage camera captured');
    }
    return rawLookAt.apply(this, args);
  };
})();
