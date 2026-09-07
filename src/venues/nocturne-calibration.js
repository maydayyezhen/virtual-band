'use strict';

// The source venue authored its volumetric cone along the opposite local axis from
// Three.js ConeGeometry. Correct the imported static beams once without adding a loop.
(() => {
  let tries = 0;
  function apply() {
    const scene = window.__VIRTUAL_BAND_CAMERA_RUNTIME__?.scene;
    const venue = scene?.children?.find?.(o => o.name === 'Venue · NOCTURNE Livehouse');
    if (!venue) return false;
    venue.traverse(object => {
      if (!object.isMesh || object.userData.nocturneBeamCalibrated) return;
      const material = object.material;
      if (object.geometry?.type === 'ConeGeometry' && material?.blending === THREE.AdditiveBlending && Math.abs((material.opacity ?? 1) - .045) < 1e-4) {
        object.rotateX(Math.PI);
        object.userData.nocturneBeamCalibrated = true;
      }
    });
    return true;
  }
  function wait() {
    if (apply()) return;
    if (++tries < 120) requestAnimationFrame(wait);
  }
  wait();
})();
