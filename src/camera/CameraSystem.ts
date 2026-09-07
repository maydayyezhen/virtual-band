import * as THREE from 'three';
import type { InstrumentRegistry } from '../instruments/Instrument';
import type { CameraRegistry, CameraView } from './CameraRegistry';

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export class CameraSystem {
  readonly output = new THREE.PerspectiveCamera(42, 1, 0.05, 300);

  private readonly registry: CameraRegistry;
  private readonly instruments: InstrumentRegistry;
  private target = new THREE.Vector3(0, 2.4, 0);
  private desired: CameraPose | null = null;
  private transitionSpeed = 7;

  constructor(registry: CameraRegistry, instruments: InstrumentRegistry) {
    this.registry = registry;
    this.instruments = instruments;
    this.output.position.set(0, 8, 18);
    this.output.lookAt(this.target);
  }

  setAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0 || Math.abs(this.output.aspect - aspect) < 1e-4) return;
    this.output.aspect = aspect;
    this.output.updateProjectionMatrix();
  }

  goToView(id: string, instant = false): boolean {
    const view = this.registry.get(id);
    if (!view) return false;
    const pose = this.resolve(view);
    if (!pose) return false;
    if (instant) {
      this.applyPose(pose);
      this.desired = null;
      return true;
    }
    this.desired = pose;
    return true;
  }

  update(dt: number): void {
    if (!this.desired) return;
    const alpha = 1 - Math.exp(-Math.max(0, dt) * this.transitionSpeed);
    this.output.position.lerp(this.desired.position, alpha);
    this.target.lerp(this.desired.target, alpha);
    this.output.fov += (this.desired.fov - this.output.fov) * alpha;
    this.output.lookAt(this.target);
    this.output.updateProjectionMatrix();

    if (
      this.output.position.distanceToSquared(this.desired.position) < 1e-4 &&
      this.target.distanceToSquared(this.desired.target) < 1e-4 &&
      Math.abs(this.output.fov - this.desired.fov) < 1e-3
    ) {
      this.applyPose(this.desired);
      this.desired = null;
    }
  }

  private resolve(view: CameraView): CameraPose | null {
    if (view.kind === 'world') {
      return {
        position: new THREE.Vector3(...view.position),
        target: new THREE.Vector3(...view.target),
        fov: view.fov,
      };
    }

    const instrument = this.instruments.get(view.instrumentId);
    if (!instrument) return null;
    instrument.root.updateWorldMatrix(true, true);
    return {
      position: instrument.root.localToWorld(new THREE.Vector3(...view.camera)),
      target: instrument.root.localToWorld(new THREE.Vector3(...view.target)),
      fov: view.fov,
    };
  }

  private applyPose(pose: CameraPose): void {
    this.output.position.copy(pose.position);
    this.target.copy(pose.target);
    this.output.fov = pose.fov;
    this.output.lookAt(this.target);
    this.output.updateProjectionMatrix();
    this.output.updateMatrixWorld(true);
  }
}
