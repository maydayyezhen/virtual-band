'use strict';

// Full-band art direction layer.
// Keep instrument models/controllers untouched; this only changes the ensemble
// placement and the song-mode presentation of the oversized dual-keyboard rig.
(() => {
  const layout = {
    // Back line: two genuinely separate stations rather than one combined equipment
    // cluster. The keyboard is intentionally smaller than its showcase-model scale.
    keyboard: {
      x: -10.80, y: 0, z: -8.10,
      songScale: 0.84,
      songRy: Math.PI + 0.12,
      focusScale: 1,
      focusRy: 0.12,
    },
    drums: { x: 3.80, y: 0, z: -7.15, ry: -0.02, scale: 2.28 },

    // Front-left acoustic arc.
    acoustics: [
      { x: -10.10, y: 3.90, z: 4.95, ry:  0.28, scale: 0.57 },
      { x:  -5.80, y: 3.90, z: 7.35, ry:  0.15, scale: 0.58 },
      { x:  -1.25, y: 3.90, z: 6.05, ry:  0.04, scale: 0.57 },
    ],

    // Bass gets its own front-centre pocket.
    bass: { x: 3.45, y: 3.91, z: 7.55, ry: -0.06, scale: 0.55 },

    // Right-side electric line opens outward and backward.
    electrics: [
      { x:  7.15, y: 2.28, z: 6.15, ry: -0.13, scale: 0.59 },
      { x: 10.55, y: 2.28, z: 2.80, ry: -0.23, scale: 0.58 },
      { x: 12.35, y: 2.28, z: -1.55, ry: -0.31, scale: 0.57 },
    ],
  };

  let keyboardRoot = null;

  const apply = (object, p) => {
    object.position.set(p.x, p.y, p.z);
    if (Number.isFinite(p.ry)) object.rotation.y = p.ry;
    if (Number.isFinite(p.scale)) object.scale.setScalar(p.scale);
  };

  function syncKeyboardPresentation() {
    if (!keyboardRoot) return;
    const mode = document.getElementById('bp-mode')?.value || 'song';
    const song = mode === 'song';
    keyboardRoot.scale.setScalar(song ? layout.keyboard.songScale : layout.keyboard.focusScale);
    keyboardRoot.rotation.y = song ? layout.keyboard.songRy : layout.keyboard.focusRy;
    window.refreshVirtualBandShadows?.();
  }

  const originalAdd = THREE.Scene.prototype.add;
  let captured = 0;

  THREE.Scene.prototype.add = function (...objects) {
    const result = originalAdd.apply(this, objects);

    for (const object of objects) {
      const name = object?.name || '';

      if (name === 'Atelier — dual-tier stage rig') {
        keyboardRoot = object;

        // app.js immediately writes the legacy keyboard position after Scene.add().
        // Intercept only that write so liveOriginal snapshots the new song-stage home.
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

        // app.js also writes rotation.y=.12 just after add(). Apply song-mode scale and
        // the physically correct 180-degree keyboard orientation once start() has
        // finished its synchronous setup. Free/Practice restore the original showcase
        // orientation/scale because their camera framing expects the isolated model.
        queueMicrotask(syncKeyboardPresentation);
        document.getElementById('bp-mode')?.addEventListener('change', () => {
          queueMicrotask(syncKeyboardPresentation);
        });

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
    if (captured >= 9) THREE.Scene.prototype.add = originalAdd;
    return result;
  };

  window.VIRTUAL_BAND_STAGE_LAYOUT = layout;
})();
