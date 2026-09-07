import * as THREE from 'three';
import type { InstrumentRegistry } from '../instruments/Instrument';
import { distanceForOrbitView } from './CameraFraming';
import type { CameraRegistry, CameraView } from './CameraRegistry';

export interface CameraPoseInput {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface CameraLensInput {
  fov?: number;
  near?: number;
  far?: number;
}

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

const DEFAULT_LENS = Object.freeze({ fov: 42, near: 0.05, far: 300 });

export class CameraSystem {
  readonly output = new THREE.PerspectiveCamera(
    DEFAULT_LENS.fov,
    1,
    DEFAULT_LENS.near,
    DEFAULT_LENS.far,
  );

  private readonly registry: CameraRegistry;
  private readonly instruments: InstrumentRegistry;
  private target = new THREE.Vector3(0, 2.4, 0);
  private desired: CameraPose | null = null;
  private transitionSpeed = 7;
  private viewportWidth = 1;
  private viewportHeight = 1;

  constructor(registry: CameraRegistry, instruments: InstrumentRegistry) {
    this.registry = registry;
    this.instruments = instruments;
    this.output.position.set(0, 8, 18);
    this.output.lookAt(this.target);
  }

  setViewport(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    const aspect = width / height;
    if (Math.abs(this.output.aspect - aspect) < 1e-4) return;
    this.output.aspect = aspect;
    this.output.updateProjectionMatrix();
  }

  setAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.setViewport(aspect, 1);
  }

  setLens(input: CameraLensInput): void {
    let changed = false;
    if (input.fov !== undefined && Number.isFinite(input.fov) && input.fov > 0 && this.output.fov !== input.fov) {
      this.output.fov = input.fov;
      changed = true;
    }
    if (input.near !== undefined && Number.isFinite(input.near) && input.near > 0 && this.output.near !== input.near) {
      this.output.near = input.near;
      changed = true;
    }
    if (input.far !== undefined && Number.isFinite(input.far) && input.far > this.output.near && this.output.far !== input.far) {
      this.output.far = input.far;
      changed = true;
    }
    if (changed) this.output.updateProjectionMatrix();
  }

  resetLens(): void {
    this.setLens(DEFAULT_LENS);
  }

  setPose(input: CameraPoseInput, instant = false): void {
    const pose: CameraPose = {
      position: input.position.clone(),
      target: input.target.clone(),
      fov: input.fov,
    };

    if (instant) {
      this.applyPose(pose);
      this.desired = null;
      return;
    }

    this.desired = pose;
  }

  goToView(id: string, instant = false): boolean {
    const view = this.registry.get(id);
    if (!view) return false;
    const pose = this.resolve(view);
    if (!pose) return false;
    this.setLens({ near: view.near, far: view.far });
    this.setPose(pose, instant);
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
      this.output.position.distanceToSquared(this.desired.position) < 1e-4
      && this.target.distanceToSquared(this.desired.target) < 1e-4
      && Math.abs(this.output.fov - this.desired.fov) < 1e-3
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

    if (view.kind === 'instrument') {
      return {
        position: instrument.root.localToWorld(new THREE.Vector3(...view.camera)),
        target: instrument.root.localToWorld(new THREE.Vector3(...view.target)),
        fov: view.fov,
      };
    }

    const localTarget = new THREE.Vector3(...view.target);
    const distance = distanceForOrbitView(view, this.viewportWidth, this.viewportHeight);
    const cp = Math.cos(view.pitch);
    const localPosition = new THREE.Vector3(
      localTarget.x + Math.sin(view.yaw) * cp * distance,
      localTarget.y + Math.sin(view.pitch) * distance,
      localTarget.z + Math.cos(view.yaw) * cp * distance,
    );

    return {
      position: instrument.root.localToWorld(localPosition),
      target: instrument.root.localToWorld(localTarget),
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
