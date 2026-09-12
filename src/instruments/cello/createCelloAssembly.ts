import * as THREE from 'three';
import { createCelloModel } from './createCelloModel';
import { createCelloBow } from './createCelloBow';

/** Shared static assembly for the study, layout editor and playable instrument. */
export function createCelloAssembly() {
  const root = new THREE.Group(); root.name = 'Atelier / Cello';
  const model = createCelloModel(), bow = createCelloBow(); root.add(model.root, bow.root);
  function parkBow() { bow.root.position.set(.33, .018, .08); bow.root.rotation.set(0, 0, Math.PI / 2 - .055); }
  parkBow();
  return { root, model, bow, parkBow, dispose() { model.dispose(); bow.dispose(); root.removeFromParent(); root.clear(); } };
}
