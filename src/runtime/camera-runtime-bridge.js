'use strict';

// Runs after app.js. core.js owns `renderer` in the shared classic-script lexical
// environment, while camera-capture.js exposes the stage Scene and Camera on window.
// Combine those three exact objects into one runtime only when all are ready.
(() => {
  let tries = 0;

  function bind() {
    let stageRenderer = null;
    try {
      if (typeof renderer !== 'undefined' && renderer?.isWebGLRenderer) stageRenderer = renderer;
    } catch {}

    const scene = window.__VIRTUAL_BAND_STAGE_SCENE__;
    const camera = window.__VIRTUAL_BAND_STAGE_CAMERA__;

    if (stageRenderer && scene && camera) {
      window.__VIRTUAL_BAND_CAMERA_RUNTIME__ = { renderer: stageRenderer, scene, camera };
      console.info('[Camera v2] runtime bridge attached');
      return;
    }

    if (++tries < 600) requestAnimationFrame(bind);
    else console.warn('[Camera v2] runtime bridge could not resolve renderer/scene/camera');
  }

  bind();
})();
