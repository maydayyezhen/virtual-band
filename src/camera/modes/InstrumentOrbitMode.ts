import * as THREE from 'three';
import type { InstrumentRegistry } from '../../instruments/Instrument';
import type { CameraSystem } from '../CameraSystem';

const DEFAULT_AZIMUTH = 0.36;
const DEFAULT_POLAR = Math.PI / 2 - 0.32;

export class InstrumentOrbitMode {
  private readonly element: HTMLCanvasElement;
  private readonly camera: CameraSystem;
  private readonly instruments: InstrumentRegistry;

  private instrumentId: string | null = null;
  private target = new THREE.Vector3();
  private radius = 8;
  private minRadius = 2;
  private maxRadius = 20;
  private azimuth = DEFAULT_AZIMUTH;
  private polar = DEFAULT_POLAR;
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(options: {
    element: HTMLCanvasElement;
    camera: CameraSystem;
    instruments: InstrumentRegistry;
  }) {
    this.element = options.element;
    this.camera = options.camera;
    this.instruments = options.instruments;

    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
  }

  enter(instrumentId: string): boolean {
    const instrument = this.instruments.get(instrumentId);
    if (!instrument) return false;

    instrument.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(instrument.root);
    if (box.isEmpty()) return false;

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.instrumentId = instrumentId;
    this.target.copy(sphere.center);

    const baseRadius = Math.max(0.5, sphere.radius);
    this.minRadius = baseRadius * 1.25;
    this.maxRadius = baseRadius * 5.5;
    this.radius = THREE.MathUtils.clamp(baseRadius * 2.65, this.minRadius, this.maxRadius);
    this.azimuth = DEFAULT_AZIMUTH;
    this.polar = DEFAULT_POLAR;
    this.applyCamera(true);
    return true;
  }

  exit(): void {
    this.instrumentId = null;
    this.pointerId = null;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
  }

  get activeInstrumentId(): string | null {
    return this.instrumentId;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.instrumentId || !event.isPrimary || event.button !== 0) return;
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.element.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.instrumentId || this.pointerId !== event.pointerId) return;

    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;

    const rect = this.element.getBoundingClientRect();
    const scale = Math.max(320, Math.min(rect.width, rect.height));
    this.azimuth -= (dx / scale) * Math.PI * 1.7;
    this.polar = THREE.MathUtils.clamp(
      this.polar + (dy / scale) * Math.PI * 1.35,
      0.12,
      Math.PI - 0.12,
    );
    this.applyCamera(true);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
    this.pointerId = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.instrumentId) return;
    event.preventDefault();
    const zoom = Math.exp(event.deltaY * 0.0011);
    this.radius = THREE.MathUtils.clamp(this.radius * zoom, this.minRadius, this.maxRadius);
    this.applyCamera(true);
  };

  private applyCamera(instant: boolean): void {
    if (!this.instrumentId) return;

    const sinPolar = Math.sin(this.polar);
    const position = new THREE.Vector3(
      this.target.x + this.radius * sinPolar * Math.sin(this.azimuth),
      this.target.y + this.radius * Math.cos(this.polar),
      this.target.z + this.radius * sinPolar * Math.cos(this.azimuth),
    );

    this.camera.setPose({ position, target: this.target, fov: 34 }, instant);
  }
}
