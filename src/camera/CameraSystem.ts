import * as THREE from 'three';
import type { InstrumentRegistry } from '../instruments/Instrument';
import { distanceForOrbitView, frameBounds, orbitPosition } from './CameraFraming';
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

/** One named view that would not put the camera somewhere usable. */
export interface CameraViewDiagnostic {
  readonly viewId: string;
  readonly label: string;
  readonly position: [number, number, number] | null;
  readonly problem: string;
}

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

const DEFAULT_LENS = Object.freeze({ fov: 42, near: 0.05, far: 300 });
/** Finite, shared camera moves. Translation and gaze are interpolated independently. */
const MIN_MOVE_SECONDS = 0.65;
const MAX_MOVE_SECONDS = 1.9;

function moveSeconds(from: CameraPose, to: CameraPose): number {
  const travel = from.position.distanceTo(to.position);
  return THREE.MathUtils.clamp(0.6 + Math.sqrt(travel) * 0.24, MIN_MOVE_SECONDS, MAX_MOVE_SECONDS);
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const formatPoint = (point: THREE.Vector3): string =>
  `[${round3(point.x)}, ${round3(point.y)}, ${round3(point.z)}]`;

function clonePose(pose: CameraPose): CameraPose {  return {
    position: pose.position.clone(),
    target: pose.target.clone(),
    fov: pose.fov,
  };
}

function poseMatches(
  position: THREE.Vector3,
  target: THREE.Vector3,
  fov: number,
  pose: CameraPose,
): boolean {
  return position.distanceToSquared(pose.position) < 1e-6
    && target.distanceToSquared(pose.target) < 1e-6
    && Math.abs(fov - pose.fov) < 1e-3;
}

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
  private from: CameraPose | null = null;
  private elapsed = 0;
  private duration = 0;
  private readonly path = new THREE.CubicBezierCurve3();
  private clearanceY = 4.5;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private currentViewId: string | null = null;
  private currentViewPose: CameraPose | null = null;
  private bounds: THREE.Box3 | null = null;
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
    this.reframeCurrentView();
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

  /** True while an eased `setPose`/`goToView` is still on its way. */
  get isTransitioning(): boolean {
    return this.desired !== null;
  }

  setPose(input: CameraPoseInput, instant = false): void {
    // A pose handed in directly means the camera is no longer sitting on a named view.
    this.currentViewId = null;
    this.currentViewPose = null;
    this.startTransition(
      {
        position: input.position.clone(),
        target: input.target.clone(),
        fov: input.fov,
      },
      instant,
    );
  }

  private startTransition(pose: CameraPose, instant: boolean): void {
    if (this.bounds) this.bounds.clampPoint(pose.position, pose.position);
    if (instant || this.reducedMotion.matches) {
      this.applyPose(pose);
      this.desired = null;
      this.from = null;
      return;
    }

    // Restart from wherever the camera actually is, so an interrupted move stays continuous.
    this.from = {
      position: this.output.position.clone(),
      target: this.target.clone(),
      fov: this.output.fov,
    };
    this.desired = pose;
    this.elapsed = 0;
    this.duration = moveSeconds(this.from, pose);
    const start = this.from.position;
    const end = pose.position;
    this.path.v0.copy(start);
    this.path.v3.copy(end);
    this.path.v1.lerpVectors(start, end, 0.3);
    this.path.v2.lerpVectors(start, end, 0.7);
    // Long cross-stage moves travel above the instruments instead of spiralling around a moving pivot.
    if (Math.hypot(end.x - start.x, end.z - start.z) > 4) {
      const lift = Math.max(start.y, end.y, (this.clearanceY - 0.25 * Math.min(start.y, end.y)) / 0.75);
      this.path.v1.y = lift;
      this.path.v2.y = lift;
    }
    const fromBearing = new THREE.Vector2(start.x - this.from.target.x, start.z - this.from.target.z);
    const toBearing = new THREE.Vector2(end.x - pose.target.x, end.z - pose.target.z);
    if (fromBearing.lengthSq() > 0.01 && toBearing.lengthSq() > 0.01 && fromBearing.normalize().dot(toBearing.normalize()) < -0.25) {
      // Opposing views must bypass the look-at pole; a straight overhead crossing flips the horizon.
      const sideways = new THREE.Vector3(start.z - end.z, 0, end.x - start.x).normalize();
      const reach = Math.min(5, start.distanceTo(end) * 0.4);
      this.path.v1.addScaledVector(sideways, reach);
      this.path.v2.addScaledVector(sideways, reach);
    }
    if (this.bounds) {
      this.bounds.clampPoint(this.path.v1, this.path.v1);
      this.bounds.clampPoint(this.path.v2, this.path.v2);
    }
  }

  /**
   * Re-resolve the active named view after the viewport changed, but only while the camera is
   * still sitting exactly on it. Once the viewer has orbited or zoomed, their framing wins.
   */
  private reframeCurrentView(): void {
    if (!this.currentViewId || !this.currentViewPose || this.desired) return;
    if (!poseMatches(this.output.position, this.target, this.output.fov, this.currentViewPose)) return;
    const view = this.registry.get(this.currentViewId);
    if (!view) return;
    const pose = this.resolve(view);
    if (!pose) return;
    this.currentViewPose = clonePose(pose);
    this.applyPose(pose);
  }

  /**
   * Move to a named view.
   *
   * Both halves of a camera change are supported here and the choice belongs to the **caller**,
   * not to this class or to the input layer:
   *
   * - `instant = false` (default) eases there — a move, paced by travel distance.
   * - `instant = true` cuts straight there — no flight, settled before the call returns.
   *
   * Either way the view becomes the active one, so a later viewport change can re-frame it.
   */
  goToView(id: string, instant = false): boolean {
    const view = this.registry.get(id);
    if (!view) return false;
    const pose = this.resolve(view);
    if (!pose) return false;
    this.setLens({ near: view.near, far: view.far });
    this.currentViewId = id;
    this.currentViewPose = clonePose(pose);
    this.startTransition(pose, instant);
    return true;
  }

  /** Id of the named view the camera is sitting on, or null once it has been moved by hand. */
  get activeViewId(): string | null {
    return this.currentViewId;
  }

  /** Current look-at point. Read-only; mutate through `setPose`/`goToView`. */
  get targetPosition(): THREE.Vector3 {
    return this.target;
  }

  /**
   * Declares the world volume the camera is allowed to occupy.
   *
   * The failure this guards against is a named view whose framing needs more reach than the
   * venue has, which parks the camera behind a wall and renders solid black. NOCTURNE's rear
   * stage view had exactly that bug: levelling it needed ~8.9 m of reach in a direction where
   * the stage only has ~7 m.
   */
  setCameraBounds(bounds: THREE.Box3 | null): void {
    this.bounds = bounds;
  }

  /**
   * Resolves every registered view and reports the ones that fail or land the camera outside
   * the declared bounds. Meant to be called straight after a host registers its views, so a
   * broken view is reported at registration instead of discovered by looking at a black frame.
   */
  validateViews(): CameraViewDiagnostic[] {
    const diagnostics: CameraViewDiagnostic[] = [];
    for (const view of this.registry.list()) {
      const pose = this.resolve(view);
      if (!pose) {
        diagnostics.push({
          viewId: view.id,
          label: view.label,
          position: null,
          problem: 'view did not resolve (missing instrument, or empty framing)',
        });
        continue;
      }
      const position = pose.position;
      if (this.bounds && !this.bounds.containsPoint(position)) {
        diagnostics.push({
          viewId: view.id,
          label: view.label,
          position: [position.x, position.y, position.z].map(round3) as [number, number, number],
          problem: `camera lands outside the declared volume at ${formatPoint(position)}`,
        });
      }
    }
    return diagnostics;
  }

  /** Manual control takes over from the currently displayed pose, never a stale endpoint. */
  cancelTransition(): void {
    this.desired = null;
    this.from = null;
    this.currentViewId = null;
    this.currentViewPose = null;
  }

  setTransitionClearance(y: number): void { if (Number.isFinite(y)) this.clearanceY = y; }

  update(dt: number): void {
    if (!this.desired || !this.from || !Number.isFinite(dt)) return;
    this.elapsed += Math.max(0, dt);
    const t = Math.min(1, this.elapsed / this.duration);
    // Quintic easing has zero velocity and acceleration at both ends.
    const alpha = t * t * t * (t * (t * 6 - 15) + 10);
    this.path.getPoint(alpha, this.output.position);
    this.target.lerpVectors(this.from.target, this.desired.target, alpha);
    // Interpolate lens magnification rather than degrees to avoid a late zoom surge.
    const fromLens = 1 / Math.tan(THREE.MathUtils.degToRad(this.from.fov / 2));
    const toLens = 1 / Math.tan(THREE.MathUtils.degToRad(this.desired.fov / 2));
    this.output.fov = THREE.MathUtils.radToDeg(2 * Math.atan(1 / THREE.MathUtils.lerp(fromLens, toLens, alpha)));
    this.output.lookAt(this.target);
    this.output.updateProjectionMatrix();
    this.output.updateMatrixWorld(true);
    if (t >= 1) {
      this.applyPose(this.desired);
      this.desired = null;
      this.from = null;
    }
  }

  /** Resolve authored framing without taking camera ownership. */
  resolve(view: CameraView): CameraPoseInput | null {
    if (view.kind === 'world') {
      return {
        position: new THREE.Vector3(...view.position),
        target: new THREE.Vector3(...view.target),
        fov: view.fov,
      };
    }

    if (view.kind === 'band-orbit') {
      const target = new THREE.Vector3(...view.target);
      const half = view.framing;
      const bounds = new THREE.Box3(
        new THREE.Vector3(target.x - half.width / 2, target.y - half.height / 2, target.z - half.depth / 2),
        new THREE.Vector3(target.x + half.width / 2, target.y + half.height / 2, target.z + half.depth / 2),
      );
      const framed = frameBounds(bounds, {
        fovDeg: view.fov,
        aspect: this.viewportWidth / Math.max(1, this.viewportHeight),
        yaw: view.yaw,
        pitch: view.pitch,
      });
      if (!framed) return null;
      return {
        position: orbitPosition(framed.target, framed.distance, view.yaw, view.pitch),
        target: framed.target,
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
