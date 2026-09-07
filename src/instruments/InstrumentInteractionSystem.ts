import * as THREE from 'three';
import type { InstrumentInteractionPhase, InstrumentRegistry } from './Instrument';

export interface InstrumentHit {
  instrumentId: string;
  partId: string;
}

export class InstrumentInteractionSystem {
  private readonly element: HTMLCanvasElement;
  private readonly camera: THREE.Camera;
  private readonly instruments: InstrumentRegistry;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(options: {
    element: HTMLCanvasElement;
    camera: THREE.Camera;
    instruments: InstrumentRegistry;
  }) {
    this.element = options.element;
    this.camera = options.camera;
    this.instruments = options.instruments;
  }

  hitTest(clientX: number, clientY: number, instrumentId?: string): InstrumentHit | null {
    const rect = this.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    const candidates = instrumentId
      ? [this.instruments.get(instrumentId)].filter((instrument) => Boolean(instrument?.root.visible))
      : this.instruments.list().filter((instrument) => instrument.root.visible);
    const roots = candidates.map((instrument) => instrument!.root);
    for (const root of roots) root.updateWorldMatrix(true, true);

    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // The donor viewer intentionally considers only the nearest rendered surface.
    // If that first surface is not marked playable, it blocks objects behind it.
    let node: THREE.Object3D | null = this.raycaster.intersectObjects(roots, true)[0]?.object ?? null;
    let partId: string | null = null;
    let resolvedInstrumentId: string | null = null;

    while (node) {
      if (!partId && typeof node.userData.hit === 'string') partId = node.userData.hit;
      if (typeof node.userData.instrumentId === 'string') {
        resolvedInstrumentId = node.userData.instrumentId;
        break;
      }
      node = node.parent;
    }

    if (!resolvedInstrumentId || !partId) return null;
    if (instrumentId && resolvedInstrumentId !== instrumentId) return null;
    return { instrumentId: resolvedInstrumentId, partId };
  }

  dispatch(hit: InstrumentHit, phase: InstrumentInteractionPhase, velocity: number): boolean {
    const instrument = this.instruments.get(hit.instrumentId);
    if (!instrument?.interact) return false;
    return instrument.interact({
      partId: hit.partId,
      velocity: Math.max(0, Math.min(127, Math.round(velocity))),
      phase,
    });
  }

  dispose(): void {}
}
