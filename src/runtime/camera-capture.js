'use strict';

// Capture only the real stage renderer/scene/camera. PMREM also renders during startup,
// so match the PerspectiveCamera signature created by app.js instead of guessing from
// whichever renderer.render call happens first.
(() => {
  if (window.__VIRTUAL_BAND_CAMERA_CAPTURE_INSTALLED__) return;
  window.__VIRTUAL_BAND_CAMERA_CAPTURE_INSTALLED__ = true;

  const T = THREE;
  const rawRender = T.WebGLRenderer.prototype.render;

  T.WebGLRenderer.prototype.render = function (scene, camera) {
    if (!window.__VIRTUAL_BAND_CAMERA_RUNTIME__ &&
        camera?.isPerspectiveCamera &&
        Math.abs((camera.fov || 0) - 34) < 0.001 &&
        Math.abs((camera.near || 0) - 0.05) < 0.001 &&
        Math.abs((camera.far || 0) - 160) < 0.01) {
      window.__VIRTUAL_BAND_CAMERA_RUNTIME__ = {
        renderer: this,
        scene,
        camera,
        stageRender: T.WebGLRenderer.prototype.render,
        rawRender,
      };
      console.info('[Camera v2] stage camera captured');
    }
    return rawRender.call(this, scene, camera);
  };
})();