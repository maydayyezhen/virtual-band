import * as THREE from 'three';
import type { InstrumentRegistry } from './Instrument';

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
    this.element.addEventListener('pointerdown', this.onPointerDown);
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return;

    const rect = this.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const roots = this.instruments.list().map((instrument) => instrument.root).filter((root) => root.visible);
    for (const root of roots) root.updateWorldMatrix(true, true);

    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObjects(roots, true);
    for (const intersection of intersections) {
      let node: THREE.Object3D | null = intersection.object;
      let partId: string | null = null;
      let instrumentId: string | null = null;

      while (node) {
        if (!partId && typeof node.userData.hit === 'string') partId = node.userData.hit;
        if (typeof node.userData.instrumentId === 'string') {
          instrumentId = node.userData.instrumentId;
          break;
        }
        node = node.parent;
      }

      if (!instrumentId || !partId) continue;
      const instrument = this.instruments.get(instrumentId);
      if (!instrument?.interact) continue;

      const intensity = event.pointerType === 'pen' && event.pressure > 0
        ? Math.min(1, Math.max(0.15, event.pressure))
        : 0.9;

      if (instrument.interact({ partId, intensity })) return;
    }
  };
}
