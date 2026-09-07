import * as THREE from 'three';
import type { InstrumentRegistry } from './Instrument';

interface PointerPress {
  id: number;
  x: number;
  y: number;
  time: number;
}

interface InstrumentPick {
  instrumentId: string;
  partId: string | null;
}

export class InstrumentInteractionSystem {
  private readonly element: HTMLCanvasElement;
  private readonly camera: THREE.Camera;
  private readonly instruments: InstrumentRegistry;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private press: PointerPress | null = null;

  constructor(options: {
    element: HTMLCanvasElement;
    camera: THREE.Camera;
    instruments: InstrumentRegistry;
  }) {
    this.element = options.element;
    this.camera = options.camera;
    this.instruments = options.instruments;
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerCancel);
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerCancel);
  }

  pickInstrumentAt(clientX: number, clientY: number): string | null {
    return this.pickAt(clientX, clientY)?.instrumentId ?? null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return;
    this.press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.press?.id === event.pointerId) this.press = null;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press;
    this.press = null;
    if (!press || press.id !== event.pointerId || !event.isPrimary || event.button !== 0) return;

    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    const elapsed = performance.now() - press.time;
    if (distance > 6 || elapsed > 700) return;

    this.interactAt(event);
  };

  private interactAt(event: PointerEvent): void {
    const pick = this.pickAt(event.clientX, event.clientY);
    if (!pick?.partId) return;

    const instrument = this.instruments.get(pick.instrumentId);
    if (!instrument?.interact) return;

    const intensity = event.pointerType === 'pen' && event.pressure > 0
      ? Math.min(1, Math.max(0.15, event.pressure))
      : 0.9;

    instrument.interact({ partId: pick.partId, intensity });
  }

  private pickAt(clientX: number, clientY: number): InstrumentPick | null {
    const rect = this.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
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

      if (instrumentId) return { instrumentId, partId };
    }

    return null;
  }
}
