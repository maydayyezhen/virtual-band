'use strict';

// One-time calibration for the imported venue geometry. It keeps the authored room
// language while adapting two details to the existing Virtual Band camera system.
(() => {
  let tries = 0;
  function apply() {
    const scene = window.__VIRTUAL_BAND_CAMERA_RUNTIME__?.scene;
    const venue = scene?.children?.find?.(o => o.name === 'Venue · NOCTURNE Livehouse');
    if (!venue) return false;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    venue.traverse(object => {
      // The source cone axis is opposite Three.js ConeGeometry after the static import.
      if (object.isMesh && !object.userData.nocturneBeamCalibrated) {
        const material = object.material;
        if (object.geometry?.type === 'ConeGeometry' && material?.blending === THREE.AdditiveBlending && Math.abs((material.opacity ?? 1) - .045) < 1e-4) {
          object.rotateX(Math.PI);
          object.userData.nocturneBeamCalibrated = true;
        }
      }

      // The standalone venue had a solid 22 m roof. The band's high-angle director
      // occasionally places a virtual camera just above it, so lift only that roof slab
      // while retaining all ceiling trusses and the enclosed-room silhouette.
      if (object.isInstancedMesh && object.geometry?.type === 'BoxGeometry' && !object.userData.nocturneRoofCalibrated) {
        let changed = false;
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix);
          matrix.decompose(position, quaternion, scale);
          if (Math.abs(scale.x - 61) < .12 && Math.abs(scale.y - .5) < .08 && Math.abs(scale.z - 77) < .12 && Math.abs(position.y - 22.25) < .2) {
            position.y = 38;
            matrix.compose(position, quaternion, scale);
            object.setMatrixAt(i, matrix);
            changed = true;
          }
        }
        if (changed) object.instanceMatrix.needsUpdate = true;
        object.userData.nocturneRoofCalibrated = true;
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
