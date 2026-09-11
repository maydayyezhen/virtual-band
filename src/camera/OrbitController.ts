import * as THREE from 'three';
import { distanceForOrbitView } from './CameraFraming';
import type { CameraSystem } from './CameraSystem';
import type { InstrumentOrbitCameraView } from './CameraRegistry';

/**
 * The one place that turns pointer and wheel input into camera orbit.
 *
 * Before this existed, "drag to look around" was written twice: once in the band view and once
 * inside each of the six Atelier showcase modes. Both computed the same thing and behaved
 * differently — the modes coasted after release, panned and pinched; the band view stopped dead.
 *
 * Conventions preserved from the modes so a migration is behaviour-preserving:
 *
 * - Two-stage smoothing: pointer input writes `want`, `update()` eases `current` toward it, and
 *   the pose is pushed to `CameraSystem` instantly. The easing lives here, not in the camera.
 * - Orbit parameters are expressed in the **subject's local frame**. Pass an instrument root for
 *   a close-up, or leave `subject` unset to orbit in world space.
 * - Panning moves the target by exactly the pixels dragged at the target plane, converted through
 *   the subject's frame so a local-space target stays correct.
 */

export interface OrbitControllerOptions {
  readonly camera: CameraSystem;
  /** Element whose client size defines the viewport the framing is computed against. */
  readonly element: HTMLElement;
  /** Subject the orbit is centred on. Omit to orbit in world space. */
  readonly subject?: THREE.Object3D | null;
  readonly pitchRange?: readonly [number, number];
  /** Horizontal pointer gain, radians per pixel. */
  readonly orbitGainX?: number;
  /** Vertical pointer gain, radians per pixel. */
  readonly orbitGainY?: number;
  /** Called after the controller changes the camera, so a host can mark itself dirty. */
  readonly onChange?: () => void;
  /**
   * Keeps the camera above the subject's authored floor. Each mode used its own constant
   * (drums 0.13, violin -2.17, acoustic -3.65), so it is per-host.
   */
  readonly floorY?: number;
}

interface OrbitState {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}

const DEFAULT_PITCH_RANGE: readonly [number, number] = [0.04, 1.43];
const DEFAULT_GAIN_X = 0.0055;
const DEFAULT_GAIN_Y = 0.0047;
/** Momentum decay and follow rates, matching the modes' easing exactly. */
const MOMENTUM_DECAY = 11;
const FOLLOW_RATE = 13;
const ZOOM_MIN = 0.28;
const ZOOM_MAX = 1.75;

export class OrbitController {
  private readonly camera: CameraSystem;
  private readonly element: HTMLElement;
  private subject: THREE.Object3D | null;
  private readonly pitchRange: readonly [number, number];
  private readonly gainX: number;
  private readonly gainY: number;
  private readonly floorY: number;
  private readonly onChange?: () => void;
  private readonly reducedMotion: MediaQueryList;

  private readonly want: OrbitState = {
    target: new THREE.Vector3(),
    yaw: 0,
    pitch: 0.34,
    distance: 10,
  };
  private readonly current: OrbitState = {
    target: new THREE.Vector3(),
    yaw: 0,
    pitch: 0.34,
    distance: 10,
  };

  private momentumYaw = 0;
  private momentumPitch = 0;
  private zoom = 1;
  private fov = 42;
  private view: InstrumentOrbitCameraView | null = null;
  /** Distance that zoom is measured against: the view's framing, or wherever the orbit started. */
  private referenceDistance = 10;
  private orbiting = false;
  private width = 1;
  private height = 1;

  constructor(options: OrbitControllerOptions) {
    this.camera = options.camera;
    this.element = options.element;
    this.subject = options.subject ?? null;
    this.pitchRange = options.pitchRange ?? DEFAULT_PITCH_RANGE;
    this.gainX = options.orbitGainX ?? DEFAULT_GAIN_X;
    this.gainY = options.orbitGainY ?? DEFAULT_GAIN_Y;
    this.floorY = options.floorY ?? 0.13;
    this.onChange = options.onChange;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.measureViewport();
  }

  /** Swap the subject, e.g. when a band view hands the camera to a close-up. */
  setSubject(subject: THREE.Object3D | null): void {
    this.subject = subject;
  }

  get activeViewId(): string | null {
    return this.view ? this.view.id : null;
  }

  get distance(): number {
    return this.current.distance;
  }

  get viewport(): readonly [number, number] {
    return [this.width, this.height];
  }

  /**
   * Adopt a saved view. `instant` snaps instead of easing, which is what entering a showcase wants.
   */
  setView(view: InstrumentOrbitCameraView, instant = false): void {
    this.view = view;
    this.fov = view.fov;
    this.zoom = 1;
    this.momentumYaw = 0;
    this.momentumPitch = 0;
    this.camera.setLens({ fov: view.fov, near: view.near, far: view.far });

    this.want.target.set(...view.target);
    // Shortest way round, so a view on the far side does not sweep the long way.
    this.want.yaw = this.current.yaw + Math.atan2(
      Math.sin(view.yaw - this.current.yaw),
      Math.cos(view.yaw - this.current.yaw),
    );
    this.want.pitch = view.pitch;
    this.want.distance = this.distanceFor(view);
    this.referenceDistance = this.want.distance;

    if (instant || this.reducedMotion.matches) {
      this.current.target.copy(this.want.target);
      this.current.yaw = this.want.yaw;
      this.current.pitch = this.want.pitch;
      this.current.distance = this.want.distance;
      this.applyCamera();
    }
  }

  /**
   * Seed the orbit from wherever the camera currently is.
   *
   * This is how a host hands over after `CameraSystem.goToView()` has resolved a view of any
   * kind: the controller reads the pose back rather than needing to understand preset shapes,
   * so it stays agnostic between instrument-orbit views and band-orbit views.
   */
  adoptCamera(): void {
    const position = this.camera.output.position.clone();
    const target = this.camera.targetPosition.clone();
    if (this.subject) {
      this.subject.updateWorldMatrix(true, false);
      this.subject.worldToLocal(position);
      this.subject.worldToLocal(target);
    }
    const offset = position.sub(target);
    const radius = offset.length();

    this.current.target.copy(target);
    this.want.target.copy(target);
    this.current.distance = radius;
    this.want.distance = radius;
    if (radius > 1e-4) {
      this.current.yaw = Math.atan2(offset.x, offset.z);
      this.current.pitch = Math.asin(THREE.MathUtils.clamp(offset.y / radius, -1, 1));
      this.want.yaw = this.current.yaw;
      this.want.pitch = this.current.pitch;
    }
    this.fov = this.camera.output.fov;
    this.referenceDistance = radius;
    this.zoom = 1;
    this.momentumYaw = 0;
    this.momentumPitch = 0;
  }

  /** Pointer went down on the subject: momentum stops until the next drag. */
  beginOrbit(): void {
    this.orbiting = true;
    this.momentumYaw = 0;
    this.momentumPitch = 0;
  }

  /** Pointer moved while orbiting. */
  orbitBy(dx: number, dy: number): void {
    this.momentumYaw = -dx * this.gainX;
    this.momentumPitch = dy * this.gainY;
    this.want.yaw += this.momentumYaw;
    this.want.pitch = THREE.MathUtils.clamp(
      this.want.pitch + this.momentumPitch,
      this.pitchRange[0],
      this.pitchRange[1],
    );
  }

  /** Pointer released: let the drag coast. */
  endOrbit(): void {
    this.orbiting = false;
  }

  /**
   * Move the target so the subject tracks the pointer one-to-one at the target plane.
   * Only `want` changes; the next `update()` applies it, matching how the modes pan.
   */
  panBy(dx: number, dy: number): void {
    if (this.height <= 0) return;
    const scale = this.current.distance * 2 * Math.tan(THREE.MathUtils.degToRad(this.fov / 2)) / this.height;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.output.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.output.quaternion);

    if (this.subject) {
      this.subject.updateWorldMatrix(true, false);
      const worldTarget = this.subject.localToWorld(this.current.target.clone());
      this.want.target.copy(
        this.subject.worldToLocal(
          worldTarget.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale),
        ),
      );
    } else {
      this.want.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    }
  }

  /**
   * Zoom is a multiplier on a reference framing distance, clamped the way the modes clamp it.
   * The reference is the view's own framing distance when a view is set, otherwise the distance
   * the orbit was adopted at — either way zoom stays bounded instead of drifting.
   */
  zoomBy(factor: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const distance = this.referenceDistance * this.zoom;
    this.want.distance = distance;
    this.current.distance = distance;
    this.applyCamera();
  }

  /** Re-derive the framing distance after the viewport changed, keeping the viewer's zoom. */
  resyncViewport(force = false): void {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    if (!width || !height) return;
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    if (this.view) this.referenceDistance = this.distanceFor(this.view);
    const distance = this.referenceDistance * this.zoom;
    this.want.distance = distance;
    this.current.distance = distance;
  }

  update(dt: number): void {
    this.resyncViewport();

    if (!this.orbiting && !this.reducedMotion.matches
      && Math.abs(this.momentumYaw) + Math.abs(this.momentumPitch) > 0.0001) {
      const damping = Math.exp(-dt * MOMENTUM_DECAY);
      this.momentumYaw *= damping;
      this.momentumPitch *= damping;
      this.want.yaw += this.momentumYaw * dt * 23;
      this.want.pitch = THREE.MathUtils.clamp(
        this.want.pitch + this.momentumPitch * dt * 23,
        this.pitchRange[0],
        this.pitchRange[1],
      );
    }

    const ease = this.reducedMotion.matches ? 1 : 1 - Math.exp(-dt * FOLLOW_RATE);
    this.current.yaw += (this.want.yaw - this.current.yaw) * ease;
    this.current.pitch += (this.want.pitch - this.current.pitch) * ease;
    this.current.distance += (this.want.distance - this.current.distance) * ease;
    this.current.target.lerp(this.want.target, ease);

    this.applyCamera();
  }

  private distanceFor(view: InstrumentOrbitCameraView): number {
    return distanceForOrbitView(view, this.width, this.height);
  }

  private measureViewport(): void {
    this.width = this.element.clientWidth || 1;
    this.height = this.element.clientHeight || 1;
  }

  private applyCamera(): void {
    const cp = Math.cos(this.current.pitch);
    const local = new THREE.Vector3(
      this.current.target.x + Math.sin(this.current.yaw) * cp * this.current.distance,
      Math.max(this.floorY, this.current.target.y + Math.sin(this.current.pitch) * this.current.distance),
      this.current.target.z + Math.cos(this.current.yaw) * cp * this.current.distance,
    );

    const position = this.subject
      ? this.subject.localToWorld(local)
      : local;
    const target = this.subject
      ? this.subject.localToWorld(this.current.target.clone())
      : this.current.target.clone();

    this.camera.setPose({ position, target, fov: this.fov }, true);
    this.onChange?.();
  }
}
