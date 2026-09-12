import * as THREE from 'three';
import { distanceForOrbitView, orbitPosition } from './CameraFraming';
import type { CameraSystem } from './CameraSystem';
import type { InstrumentOrbitCameraView } from './CameraRegistry';

export interface OrbitControllerOptions {
  camera: CameraSystem;
  element: HTMLElement;
  subject?: THREE.Object3D | null;
  pitchRange?: readonly [number, number];
  floorY?: number;
  orbitGainX?: number;
  orbitGainY?: number;
  onChange?: () => void;
  framingView?: (view: InstrumentOrbitCameraView) => InstrumentOrbitCameraView;
}
interface OrbitState { target: THREE.Vector3; yaw: number; pitch: number; distance: number }

/** Shared by stage and every instrument. Named moves belong to CameraSystem; only manual input is damped here. */
export class OrbitController {
  private readonly current: OrbitState = { target: new THREE.Vector3(), yaw: 0, pitch: 0.3, distance: 10 };
  private readonly want: OrbitState = { target: new THREE.Vector3(), yaw: 0, pitch: 0.3, distance: 10 };
  private view: InstrumentOrbitCameraView | null = null;
  private subject: THREE.Object3D | null;
  private fov = 42;
  private referenceDistance = 10;
  private zoom = 1;
  private width = 1;
  private height = 1;
  private followingMove = false;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private readonly options: OrbitControllerOptions) {
    this.subject = options.subject ?? null;
    this.width = options.element.clientWidth || 1;
    this.height = options.element.clientHeight || 1;
  }
  setSubject(subject: THREE.Object3D | null): void { this.subject = subject; }
  get activeViewId(): string | null { return this.view?.id ?? null; }
  get distance(): number { return this.current.distance; }
  get viewport(): readonly [number, number] { return [this.width, this.height]; }

  setView(view: InstrumentOrbitCameraView, instant = false): void {
    this.view = view;
    this.zoom = 1;
    this.fov = view.fov;
    this.width = this.options.element.clientWidth || 1;
    this.height = this.options.element.clientHeight || 1;
    this.referenceDistance = this.distanceFor(view);
    this.options.camera.setLens({ near: view.near, far: view.far });
    this.options.camera.setPose(this.pose({ target: new THREE.Vector3(...view.target),
      yaw: view.yaw, pitch: view.pitch, distance: this.referenceDistance }), instant);
    this.followingMove = this.options.camera.isTransitioning;
    if (!this.followingMove) this.adoptCamera(true);
  }
  /** Rebase whenever ownership changes or a flight completes. */
  adoptCamera(keepView = false): void {
    if (!keepView) this.view = null;
    const position = this.options.camera.output.position.clone();
    const target = this.options.camera.targetPosition.clone();
    if (this.subject) {
      this.subject.updateWorldMatrix(true, false);
      this.subject.worldToLocal(position);
      this.subject.worldToLocal(target);
    }
    const offset = position.sub(target);
    const radius = Math.max(0.01, offset.length());
    this.current.target.copy(target);
    this.current.distance = radius;
    this.current.yaw = Math.atan2(offset.x, offset.z);
    this.current.pitch = Math.asin(THREE.MathUtils.clamp(offset.y / radius, -1, 1));
    this.want.target.copy(target);
    this.want.distance = radius;
    this.want.yaw = this.current.yaw;
    this.want.pitch = this.current.pitch;
    this.fov = this.options.camera.output.fov;
    this.referenceDistance = radius;
    this.zoom = 1;
    this.followingMove = false;
  }
  private takeControl(): void {
    const rebase = this.options.camera.isTransitioning || this.followingMove;
    this.options.camera.cancelTransition();
    if (rebase) this.adoptCamera(true);
  }
  orbitBy(dx: number, dy: number): void {
    this.rotateBy(-dx * (this.options.orbitGainX ?? 0.0055), dy * (this.options.orbitGainY ?? 0.0047));
  }
  rotateBy(yaw: number, pitch: number): void {
    this.takeControl();
    this.want.yaw += yaw;
    const range = this.options.pitchRange ?? [0.04, 1.43];
    this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + pitch, range[0], range[1]);
  }
  panBy(dx: number, dy: number): void {
    this.takeControl();
    const camera = this.options.camera.output;
    const target = this.subject ? this.subject.localToWorld(this.want.target.clone()) : this.want.target.clone();
    const scale = camera.position.distanceTo(target) * 2 * Math.tan(THREE.MathUtils.degToRad(this.fov / 2)) / this.height;
    target.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), -dx * scale);
    target.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), dy * scale);
    this.want.target.copy(this.subject ? this.subject.worldToLocal(target) : target);
  }
  zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.takeControl();
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 0.26, 1.75);
    this.want.distance = this.referenceDistance * this.zoom;
  }
  refreshFraming(): void {
    if (!this.view) return;
    this.referenceDistance = this.distanceFor(this.view);
    this.want.distance = this.referenceDistance * this.zoom;
  }
  resyncViewport(force = false): void {
    const width = this.options.element.clientWidth;
    const height = this.options.element.clientHeight;
    if (!width || !height || (!force && width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.refreshFraming();
  }
  update(dt: number): void {
    if (this.options.camera.isTransitioning) { this.followingMove = true; return; }
    if (this.followingMove) this.adoptCamera(true);
    // An untouched named stage view remains owned by CameraSystem, including viewport reframing.
    if (this.options.camera.activeViewId) { this.adoptCamera(true); return; }
    this.resyncViewport();
    const ease = this.reducedMotion.matches ? 1 : 1 - Math.exp(-Math.max(0, dt) * 18);
    this.current.target.lerp(this.want.target, ease);
    this.current.yaw += (this.want.yaw - this.current.yaw) * ease;
    this.current.pitch += (this.want.pitch - this.current.pitch) * ease;
    this.current.distance += (this.want.distance - this.current.distance) * ease;
    this.options.camera.setPose(this.pose(this.current), true);
    this.options.onChange?.();
  }
  private distanceFor(view: InstrumentOrbitCameraView): number {
    return distanceForOrbitView(this.options.framingView?.(view) ?? view, this.width, this.height);
  }
  private pose(state: OrbitState) {
    const position = orbitPosition(state.target, state.distance, state.yaw, state.pitch);
    position.y = Math.max(this.options.floorY ?? 0.13, position.y);
    const target = state.target.clone();
    if (this.subject) {
      this.subject.updateWorldMatrix(true, false);
      this.subject.localToWorld(position);
      this.subject.localToWorld(target);
    }
    return { position, target, fov: this.fov };
  }
}
