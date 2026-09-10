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
/** Scratch vectors for the orbit-space transition; `update` runs every frame. */
const TRANSITION_A = new THREE.Vector3();
const TRANSITION_B = new THREE.Vector3();
const MIN_ORBIT_RADIUS = 1e-3;
/**
 * Camera moves are paced by travel distance, not by a fixed time constant.
 *
 * A pure exponential settles in the same ~0.5 s whatever the distance, so a cross-stage move
 * (bass at the front to keyboard at the back, ~7 m) whips while a nudge takes just as long.
 * `MOVE_SPEED` is the cruise speed and therefore the speed cap; the two bounds keep tiny
 * adjustments snappy and stop a very long move from dragging.
 */
const MOVE_SPEED = 4;
const MIN_MOVE_SECONDS = 0.5;
const MAX_MOVE_SECONDS = 2.6;

/** Time a move needs at cruise speed, clamped so short moves stay snappy and long ones do not drag. */
function moveSeconds(from: CameraPose, to: CameraPose): number {
  const travel = Math.max(
    from.position.distanceTo(to.position),
    from.target.distanceTo(to.target),
  );
  return THREE.MathUtils.clamp(travel / MOVE_SPEED, MIN_MOVE_SECONDS, MAX_MOVE_SECONDS);
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
    if (instant) {
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

  update(dt: number): void {
    if (!this.desired || !this.from) return;

    this.elapsed += Math.max(0, dt);
    const t = this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
    const alpha = t * t * (3 - 2 * t); // smoothstep: gentle at both ends

    // Ease the orbit, not the raw position.
    //
    // Interpolating positions walks the camera along a straight line between the two standpoints:
    // for a cross-stage move that line runs through the middle of the band. Interpolating the
    // offset *vector* instead fixes that but breaks the opposite case — the great circle between
    // two opposing standpoints passes over the target's zenith, where `lookAt` is degenerate and
    // the camera's roll snaps (measured: audience → rear peaked at 75° above the target).
    //
    // So interpolate the orbit itself — yaw, pitch, radius — which sweeps around the subject and
    // never crosses the pole unless both ends are already near it.
    const fromOffset = TRANSITION_A.copy(this.from.position).sub(this.from.target);
    const toOffset = TRANSITION_B.copy(this.desired.position).sub(this.desired.target);
    const fromRadius = fromOffset.length();
    const toRadius = toOffset.length();

    this.target.lerpVectors(this.from.target, this.desired.target, alpha);

    if (fromRadius > MIN_ORBIT_RADIUS && toRadius > MIN_ORBIT_RADIUS) {
      const fromYaw = Math.atan2(fromOffset.x, fromOffset.z);
      const fromPitch = Math.asin(THREE.MathUtils.clamp(fromOffset.y / fromRadius, -1, 1));
      const toYaw = Math.atan2(toOffset.x, toOffset.z);
      const toPitch = Math.asin(THREE.MathUtils.clamp(toOffset.y / toRadius, -1, 1));

      // Shortest way round, so an opposing view does not sweep the long way by accident.
      const yawDelta = Math.atan2(Math.sin(toYaw - fromYaw), Math.cos(toYaw - fromYaw));
      orbitPosition(
        this.target,
        fromRadius + (toRadius - fromRadius) * alpha,
        fromYaw + yawDelta * alpha,
        fromPitch + (toPitch - fromPitch) * alpha,
        this.output.position,
      );
    } else {
      this.output.position.lerpVectors(this.from.position, this.desired.position, alpha);
    }

    this.output.fov = this.from.fov + (this.desired.fov - this.from.fov) * alpha;
    this.output.lookAt(this.target);
    this.output.updateProjectionMatrix();

    if (t >= 1) {
      this.applyPose(this.desired);
      this.desired = null;
      this.from = null;
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
