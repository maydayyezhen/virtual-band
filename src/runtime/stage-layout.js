'use strict';

// Full-band art direction layer.
// Keep the instrument models/controllers untouched; this only changes the initial
// ensemble placement before app.js snapshots it as the song-stage home layout.
(() => {
  const layout = {
    keyboard: { x: -6.40, y: 0, z: -3.90 },
    acoustics: [
      { x: -8.05, y: 3.90, z: 3.45, ry:  0.26, scale: 0.60 },
      { x: -4.55, y: 3.90, z: 5.15, ry:  0.14, scale: 0.61 },
      { x: -0.95, y: 3.90, z: 4.55, ry:  0.04, scale: 0.60 },
    ],
    bass: { x: 2.65, y: 3.91, z: 5.30, ry: -0.07, scale: 0.57 },
    electrics: [
      { x: 5.55, y: 2.28, z: 4.60, ry: -0.12, scale: 0.63 },
      { x: 8.00, y: 2.28, z: 2.55, ry: -0.22, scale: 0.62 },
      { x: 7.25, y: 2.28, z: -0.85, ry: -0.29, scale: 0.61 },
    ],
    drums: { x: 1.05, y: 0, z: -5.55, ry: -0.04, scale: 2.08 },
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
