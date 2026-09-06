'use strict';

// Full-band art direction layer.
// Keep the instrument models/controllers untouched; this only changes the initial
// ensemble placement before app.js snapshots it as the song-stage home layout.
(() => {
  // Wide-stage pass: favour breathing room over keeping every instrument close to
  // the original compact camera footprint. Camera composition can be tuned after
  // the stage spacing itself feels right.
  const layout = {
    // Back line: keep the very wide keyboard rig clearly separated from the drums.
    keyboard: { x: -9.60, y: 0, z: -6.35 },
    drums:    { x:  1.55, y: 0, z: -7.05, ry: -0.02, scale: 1.92 },

    // Front-left acoustic arc. The instruments are intentionally staggered in depth
    // rather than forming a straight retail-display row.
    acoustics: [
      { x: -10.10, y: 3.90, z: 4.95, ry:  0.28, scale: 0.57 },
      { x:  -5.80, y: 3.90, z: 7.35, ry:  0.15, scale: 0.58 },
      { x:  -1.25, y: 3.90, z: 6.05, ry:  0.04, scale: 0.57 },
    ],

    // Bass gets its own front-centre pocket instead of sitting inside the electric
    // cluster.
    bass: { x: 3.45, y: 3.91, z: 7.55, ry: -0.06, scale: 0.55 },

    // Right-side electric line opens outward and backward, leaving visible floor
    // between every instrument even from a high camera angle.
    electrics: [
      { x:  7.15, y: 2.28, z: 6.15, ry: -0.13, scale: 0.59 },
      { x: 10.55, y: 2.28, z: 2.80, ry: -0.23, scale: 0.58 },
      { x: 12.35, y: 2.28, z: -1.55, ry: -0.31, scale: 0.57 },
    ],
  };

  const apply = (object, p) => {
    object.position.set(p.x, p.y, p.z);
    if (Number.isFinite(p.ry)) object.rotation.y = p.ry;
    if (Number.isFinite(p.scale)) object.scale.setScalar(p.scale);
  };

  const originalAdd = THREE.Scene.prototype.add;
  let captured = 0;

  THREE.Scene.prototype.add = function (...objects) {
    const result = originalAdd.apply(this, objects);

    for (const object of objects) {
      const name = object?.name || '';

      // app.js positions the keyboard root immediately *after* Scene.add(). Intercept
      // only that first legacy set() so the new position is already present when
      // liveOriginal snapshots the song-stage layout later in start().
      if (name === 'Atelier — dual-tier stage rig') {
        const vec = object.position;
        const originalSet = vec.set.bind(vec);
        let waitingForLegacySet = true;
        vec.set = function (x, y, z) {
          if (waitingForLegacySet && Math.abs(x + 6.15) < 0.01 && Math.abs(z + 1.55) < 0.01) {
            waitingForLegacySet = false;
            return originalSet(layout.keyboard.x, layout.keyboard.y, layout.keyboard.z);
          }
          waitingForLegacySet = false;
          return originalSet(x, y, z);
        };
        captured++;
        continue;
      }

      const acoustic = /^Wish Acoustic (\d+)$/.exec(name);
      if (acoustic) {
        const p = layout.acoustics[Number(acoustic[1]) - 1];
        if (p) apply(object, p);
        captured++;
        continue;
      }

      if (name === 'Wish Fingered Bass') {
        apply(object, layout.bass);
        captured++;
        continue;
      }

      const electric = /Electric (\d+)$/.exec(name);
      if (electric) {
        const p = layout.electrics[Number(electric[1]) - 1];
        if (p) apply(object, p);
        captured++;
        continue;
      }

      if (name === 'Atelier Session 04 · Band Drums') {
        apply(object, layout.drums);
        captured++;
      }
    }

    // Nine ensemble roots: keyboard, 3 acoustics, bass, 3 electrics and drums.
    // Restore the prototype as soon as the initial stage is assembled.
    if (captured >= 9) THREE.Scene.prototype.add = originalAdd;
    return result;
  };

  window.VIRTUAL_BAND_STAGE_LAYOUT = layout;
})();
