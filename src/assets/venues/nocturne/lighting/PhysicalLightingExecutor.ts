import * as THREE from 'three';
import type { LightingStage } from './DustLightingDirector';

type FixturePatch = Record<string, unknown>;

type ScanPatch = {
  pan: number;
  tilt: number;
  speed: number;
  phase: number;
};

type RawFixture = {
  id: string;
  type: string;
  state: Record<string, any>;
  effective?: Record<string, any>;
  transition?: unknown;
  set: (patch: FixturePatch, duration?: number) => unknown;
};

type MotionState = {
  pan: number;
  tilt: number;
  angle: number;
  distance: number;
  vPan: number;
  vTilt: number;
  vAngle: number;
  vDistance: number;
};

type MotionTarget = Pick<MotionState, 'pan' | 'tilt' | 'angle' | 'distance'>;

type MotionPlan = {
  target: MotionTarget;
  arriveAt: number;
  startAt: number;
  scan: unknown;
  started: boolean;
};

type EffectState = {
  color: THREE.Color;
  intensity: number;
  fromColor: THREE.Color;
  toColor: THREE.Color;
  fromIntensity: number;
  toIntensity: number;
  startedAt: number;
  duration: number;
  active: boolean;
};

type ScanBlendState = {
  fromPan: number;
  fromTilt: number;
  to: ScanPatch | null;
  speed: number;
  phase: number;
  startedAt: number;
  duration: number;
  active: boolean;
};

type WrappedFixture = {
  raw: RawFixture;
  originalSet: (patch: FixturePatch, duration?: number) => unknown;
  motion: MotionState;
  plan: MotionPlan | null;
  effect: EffectState;
  scanBlend: ScanBlendState;
};

type DirectorInternals = {
  cues?: Array<{ time: number }>;
  cueIndex?: number;
  currentTime?: () => number;
  applyCueAtTime?: (time: number, force?: boolean) => void;
};

const CONTROLLED_KEYS = new Set(['pan', 'tilt', 'angle', 'distance', 'target', 'scan', 'color', 'intensity']);
const LOOKAHEAD_SECONDS = 1.8;
const PAN_SPEED = 250;
const PAN_ACCEL = 900;
const TILT_SPEED = 190;
const TILT_ACCEL = 760;
const ANGLE_SPEED = 90;
const ANGLE_ACCEL = 320;
const DISTANCE_SPEED = 100;
const DISTANCE_ACCEL = 280;
const SCAN_BLEND_SECONDS = 0.32;
const EPSILON = 1e-4;
const TAU = Math.PI * 2;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number): number => Number.isFinite(Number(value)) ? Number(value) : fallback;

function readColor(value: unknown): THREE.Color {
  if (value instanceof THREE.Color) return value.clone();
  try {
    return new THREE.Color(value as THREE.ColorRepresentation);
  } catch {
    return new THREE.Color('#ffffff');
  }
}

function readScan(value: unknown): ScanPatch | null {
  if (!value || typeof value !== 'object') return null;
  const scan = value as Partial<ScanPatch>;
  if (![scan.pan, scan.tilt, scan.speed, scan.phase].every((item) => Number.isFinite(Number(item)))) return null;
  return {
    pan: Number(scan.pan),
    tilt: Number(scan.tilt),
    speed: Number(scan.speed),
    phase: Number(scan.phase),
  };
}

function minTravelTime(distance: number, maxSpeed: number, maxAccel: number): number {
  const d = Math.abs(distance);
  if (d < EPSILON) return 0;
  const accelDistance = (maxSpeed * maxSpeed) / maxAccel;
  if (d <= accelDistance) return 2 * Math.sqrt(d / maxAccel);
  return 2 * (maxSpeed / maxAccel) + (d - accelDistance) / maxSpeed;
}

function estimateTravel(motion: MotionState, target: MotionTarget): number {
  const time = Math.max(
    minTravelTime(target.pan - motion.pan, PAN_SPEED, PAN_ACCEL),
    minTravelTime(target.tilt - motion.tilt, TILT_SPEED, TILT_ACCEL),
    minTravelTime(target.angle - motion.angle, ANGLE_SPEED, ANGLE_ACCEL),
    minTravelTime(target.distance - motion.distance, DISTANCE_SPEED, DISTANCE_ACCEL),
  );
  return clamp(time + 0.04, 0.08, 1.45);
}

function stepAxis(
  current: number,
  velocity: number,
  target: number,
  dt: number,
  remaining: number,
  maxSpeed: number,
  maxAccel: number,
): [number, number] {
  const error = target - current;
  if (Math.abs(error) < 0.0005 && Math.abs(velocity) < 0.005) return [target, 0];
  const desiredVelocity = clamp(error / Math.max(remaining, 0.045), -maxSpeed, maxSpeed);
  const deltaVelocity = clamp(desiredVelocity - velocity, -maxAccel * dt, maxAccel * dt);
  let nextVelocity = velocity + deltaVelocity;
  let next = current + nextVelocity * dt;
  if ((target - current) * (target - next) <= 0) {
    next = target;
    nextVelocity = 0;
  }
  return [next, nextVelocity];
}

function motionClose(a: MotionTarget, b: MotionTarget): boolean {
  return Math.abs(a.pan - b.pan) < 0.25
    && Math.abs(a.tilt - b.tilt) < 0.25
    && Math.abs(a.angle - b.angle) < 0.12
    && Math.abs(a.distance - b.distance) < 0.25;
}

function splitPatch(patch: FixturePatch): { forwarded: FixturePatch; controlled: FixturePatch } {
  const forwarded: FixturePatch = {};
  const controlled: FixturePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (CONTROLLED_KEYS.has(key)) controlled[key] = value;
    else forwarded[key] = value;
  }
  return { forwarded, controlled };
}

function resolveMotionTarget(wrapped: WrappedFixture, patch: FixturePatch): MotionTarget {
  const { raw, originalSet, motion } = wrapped;
  const probe: FixturePatch = {};
  for (const key of ['pan', 'tilt', 'angle', 'distance', 'target']) {
    if (key in patch) probe[key] = patch[key];
  }
  if (!Object.keys(probe).length) {
    return { pan: motion.pan, tilt: motion.tilt, angle: motion.angle, distance: motion.distance };
  }

  const savedState = { ...raw.state };
  const savedTransition = raw.transition;
  originalSet(probe, 0);
  const target: MotionTarget = {
    pan: finite(raw.state.pan, motion.pan),
    tilt: finite(raw.state.tilt, motion.tilt),
    angle: finite(raw.state.angle, motion.angle),
    distance: finite(raw.state.distance, motion.distance),
  };
  Object.assign(raw.state, savedState);
  raw.transition = savedTransition;
  return target;
}

export class PhysicalLightingExecutor {
  private readonly stage: LightingStage;
  private readonly wrapped = new Map<string, WrappedFixture>();
  private director: DirectorInternals | null = null;
  private captureArrival: number | null = null;
  private capturedCues = new Set<number>();
  private lastSongTime = 0;
  private lastFrame = performance.now();
  private frame = 0;

  constructor(stage: LightingStage) {
    this.stage = stage;
    for (const [id, fixture] of stage.lights) this.wrapFixture(id, fixture as unknown as RawFixture);
    this.frame = requestAnimationFrame(this.tick);
  }

  attachDirector(director: object): void {
    this.director = director as DirectorInternals;
    this.capturedCues.clear();
    this.lastSongTime = this.songTime();
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    for (const wrapped of this.wrapped.values()) wrapped.raw.set = wrapped.originalSet;
    this.wrapped.clear();
  }

  private wrapFixture(id: string, raw: RawFixture): void {
    const originalSet = raw.set.bind(raw);
    raw.transition = null;
    const pan = finite(raw.effective?.pan, finite(raw.state.pan, 0));
    const tilt = finite(raw.effective?.tilt, finite(raw.state.tilt, 0));
    const angle = finite(raw.state.angle, 4);
    const distance = finite(raw.state.distance, 48);
    const color = readColor(raw.state.color ?? '#ffffff');
    const intensity = finite(raw.state.intensity, 0);
    const initialScan = readScan(raw.state.scan);
    const wrapped: WrappedFixture = {
      raw,
      originalSet,
      motion: { pan, tilt, angle, distance, vPan: 0, vTilt: 0, vAngle: 0, vDistance: 0 },
      plan: null,
      effect: {
        color: color.clone(),
        intensity,
        fromColor: color.clone(),
        toColor: color.clone(),
        fromIntensity: intensity,
        toIntensity: intensity,
        startedAt: 0,
        duration: 0,
        active: false,
      },
      scanBlend: {
        fromPan: initialScan?.pan ?? 0,
        fromTilt: initialScan?.tilt ?? 0,
        to: initialScan,
        speed: initialScan?.speed ?? 0,
        phase: initialScan?.phase ?? 0,
        startedAt: 0,
        duration: 0,
        active: false,
      },
    };

    raw.set = (patch: FixturePatch = {}, duration = 0) => {
      this.handleSet(wrapped, patch, duration);
      return raw;
    };
    this.wrapped.set(id, wrapped);
  }

  private handleSet(wrapped: WrappedFixture, patch: FixturePatch, duration: number): void {
    const now = this.songTime();
    this.advanceEffect(wrapped, now);
    this.advanceScanBlend(wrapped, now);
    const { forwarded, controlled } = splitPatch(patch);
    const hasMotion = ['pan', 'tilt', 'angle', 'distance', 'target'].some((key) => key in controlled);
    const hasScan = 'scan' in controlled;

    // Predictive cue capture is allowed to schedule only physical movement.
    // It must not fire brightness/color/strobe/enabled changes before the musical cue actually happens.
    if (this.captureArrival != null) {
      if (hasMotion || hasScan) {
        const target = hasMotion ? resolveMotionTarget(wrapped, controlled) : {
          pan: wrapped.motion.pan,
          tilt: wrapped.motion.tilt,
          angle: wrapped.motion.angle,
          distance: wrapped.motion.distance,
        };
        const scan = hasScan ? controlled.scan : readScan(wrapped.raw.state.scan);
        this.scheduleMotion(wrapped, target, this.captureArrival, scan);
      }
      return;
    }

    if (Object.keys(forwarded).length) wrapped.originalSet(forwarded, 0);
    if ('color' in controlled || 'intensity' in controlled) {
      this.startEffect(wrapped, controlled, Math.max(0, Number(duration) || 0), now);
    }

    if (!hasMotion && hasScan) {
      this.startScanBlend(wrapped, controlled.scan, now, Math.max(0.18, Math.min(Number(duration) || SCAN_BLEND_SECONDS, 0.5)));
      return;
    }
    if (!hasMotion) return;

    const target = resolveMotionTarget(wrapped, controlled);
    const scan = hasScan ? controlled.scan : readScan(wrapped.raw.state.scan);

    if (wrapped.plan && motionClose(wrapped.plan.target, target) && wrapped.plan.arriveAt <= now + 0.22) {
      wrapped.plan.scan = scan;
      return;
    }

    const currentTarget: MotionTarget = {
      pan: wrapped.motion.pan,
      tilt: wrapped.motion.tilt,
      angle: wrapped.motion.angle,
      distance: wrapped.motion.distance,
    };
    if (!wrapped.plan && motionClose(currentTarget, target)) {
      if (hasScan) this.startScanBlend(wrapped, scan, now, SCAN_BLEND_SECONDS);
      return;
    }

    const travel = estimateTravel(wrapped.motion, target);
    this.scheduleMotion(wrapped, target, now + travel, scan);
  }

  private startEffect(wrapped: WrappedFixture, patch: FixturePatch, duration: number, now: number): void {
    const effect = wrapped.effect;
    effect.fromColor.copy(effect.color);
    effect.toColor.copy('color' in patch ? readColor(patch.color) : effect.color);
    effect.fromIntensity = effect.intensity;
    effect.toIntensity = 'intensity' in patch ? finite(patch.intensity, effect.intensity) : effect.intensity;
    effect.startedAt = now;
    effect.duration = duration;
    effect.active = duration > 0.001;
    if (!effect.active) {
      effect.color.copy(effect.toColor);
      effect.intensity = effect.toIntensity;
      wrapped.originalSet({ color: `#${effect.color.getHexString()}`, intensity: effect.intensity }, 0);
    }
  }

  private advanceEffect(wrapped: WrappedFixture, now: number): void {
    const effect = wrapped.effect;
    if (!effect.active) return;
    const k = clamp((now - effect.startedAt) / Math.max(effect.duration, 0.001), 0, 1);
    const eased = k * k * (3 - 2 * k);
    effect.color.copy(effect.fromColor).lerp(effect.toColor, eased);
    effect.intensity = effect.fromIntensity + (effect.toIntensity - effect.fromIntensity) * eased;
    wrapped.originalSet({ color: `#${effect.color.getHexString()}`, intensity: effect.intensity }, 0);
    if (k >= 1) effect.active = false;
  }

  private startScanBlend(wrapped: WrappedFixture, value: unknown, now: number, duration = SCAN_BLEND_SECONDS): void {
    const target = readScan(value);
    const current = readScan(wrapped.raw.state.scan);
    if (!current && !target) {
      wrapped.scanBlend.active = false;
      wrapped.originalSet({ scan: null }, 0);
      return;
    }

    const stageTime = finite(this.stage.time, 0);
    const speed = target?.speed ?? current?.speed ?? 0;
    let phase = target?.phase ?? current?.phase ?? 0;
    if (current && target) {
      const absolutePhase = stageTime * TAU * current.speed + current.phase;
      phase = absolutePhase - stageTime * TAU * speed;
    }

    wrapped.scanBlend = {
      fromPan: current?.pan ?? 0,
      fromTilt: current?.tilt ?? 0,
      to: target,
      speed,
      phase,
      startedAt: now,
      duration: Math.max(0, duration),
      active: duration > 0.001,
    };

    if (!wrapped.scanBlend.active) {
      wrapped.originalSet({ scan: target ? { ...target, speed, phase } : null }, 0);
      return;
    }

    // Switching the oscillator's speed/phase is position-continuous here; amplitude starts at the current value.
    wrapped.originalSet({ scan: {
      pan: current?.pan ?? 0,
      tilt: current?.tilt ?? 0,
      speed,
      phase,
    } }, 0);
  }

  private advanceScanBlend(wrapped: WrappedFixture, now: number): void {
    const blend = wrapped.scanBlend;
    if (!blend.active) return;
    const k = clamp((now - blend.startedAt) / Math.max(blend.duration, 0.001), 0, 1);
    const eased = k * k * (3 - 2 * k);
    const toPan = blend.to?.pan ?? 0;
    const toTilt = blend.to?.tilt ?? 0;
    const scan: ScanPatch = {
      pan: blend.fromPan + (toPan - blend.fromPan) * eased,
      tilt: blend.fromTilt + (toTilt - blend.fromTilt) * eased,
      speed: blend.speed,
      phase: blend.phase,
    };
    wrapped.originalSet({ scan }, 0);
    if (k < 1) return;
    blend.active = false;
    wrapped.originalSet({ scan: blend.to ? scan : null }, 0);
  }

  private scheduleMotion(wrapped: WrappedFixture, target: MotionTarget, arriveAt: number, scan: unknown): void {
    const travel = estimateTravel(wrapped.motion, target);
    wrapped.plan = {
      target,
      arriveAt,
      startAt: arriveAt - travel,
      scan,
      started: false,
    };
  }

  private startPlan(wrapped: WrappedFixture, now: number): void {
    const plan = wrapped.plan;
    if (!plan || plan.started) return;
    this.advanceScanBlend(wrapped, now);

    // Freeze the beam exactly where it is visually before taking control away from the scan oscillator.
    // This avoids the classic scan -> base-position snap at the beginning of a move.
    const currentPan = finite(wrapped.raw.effective?.pan, wrapped.motion.pan);
    const currentTilt = finite(wrapped.raw.effective?.tilt, wrapped.motion.tilt);
    wrapped.motion.pan = currentPan;
    wrapped.motion.tilt = currentTilt;
    wrapped.scanBlend.active = false;
    wrapped.originalSet({ pan: currentPan, tilt: currentTilt, angle: wrapped.motion.angle, distance: wrapped.motion.distance, scan: null }, 0);
    plan.started = true;
  }

  private updateMotion(wrapped: WrappedFixture, now: number, dt: number): void {
    const plan = wrapped.plan;
    if (!plan || now + 0.0001 < plan.startAt) return;
    this.startPlan(wrapped, now);
    const remaining = Math.max(plan.arriveAt - now, 0.045);
    const m = wrapped.motion;

    [m.pan, m.vPan] = stepAxis(m.pan, m.vPan, plan.target.pan, dt, remaining, PAN_SPEED, PAN_ACCEL);
    [m.tilt, m.vTilt] = stepAxis(m.tilt, m.vTilt, plan.target.tilt, dt, remaining, TILT_SPEED, TILT_ACCEL);
    [m.angle, m.vAngle] = stepAxis(m.angle, m.vAngle, plan.target.angle, dt, remaining, ANGLE_SPEED, ANGLE_ACCEL);
    [m.distance, m.vDistance] = stepAxis(m.distance, m.vDistance, plan.target.distance, dt, remaining, DISTANCE_SPEED, DISTANCE_ACCEL);

    wrapped.originalSet({ pan: m.pan, tilt: m.tilt, angle: m.angle, distance: m.distance, scan: null }, 0);

    const arrived = Math.abs(m.pan - plan.target.pan) < 0.08
      && Math.abs(m.tilt - plan.target.tilt) < 0.08
      && Math.abs(m.angle - plan.target.angle) < 0.06
      && Math.abs(m.distance - plan.target.distance) < 0.1;
    if (!arrived) return;

    m.pan = plan.target.pan;
    m.tilt = plan.target.tilt;
    m.angle = plan.target.angle;
    m.distance = plan.target.distance;
    m.vPan = m.vTilt = m.vAngle = m.vDistance = 0;
    const nextScan = plan.scan;
    wrapped.originalSet({ pan: m.pan, tilt: m.tilt, angle: m.angle, distance: m.distance, scan: null }, 0);
    wrapped.plan = null;

    // A preset scan is never switched on at full amplitude. Start from zero amplitude and grow into it.
    // Therefore reaching a cue cannot make the beam teleport by +/- scanPan or +/- scanTilt.
    this.startScanBlend(wrapped, nextScan, now, SCAN_BLEND_SECONDS);
  }

  private songTime(): number {
    return finite(this.director?.currentTime?.(), 0);
  }

  private captureFutureCue(cueIndex: number, cueTime: number): void {
    const director = this.director;
    if (!director?.applyCueAtTime) return;
    const previousIndex = director.cueIndex;
    this.captureArrival = cueTime;
    try {
      director.applyCueAtTime(cueTime, true);
      this.capturedCues.add(cueIndex);
    } finally {
      this.captureArrival = null;
      director.cueIndex = previousIndex;
    }
  }

  private predict(now: number): void {
    const cues = this.director?.cues;
    if (!cues?.length) return;
    if (now + 0.35 < this.lastSongTime) this.capturedCues.clear();
    this.lastSongTime = now;

    for (let index = 0; index < cues.length; index += 1) {
      if (this.capturedCues.has(index)) continue;
      const cueTime = finite(cues[index]?.time, -1);
      const lead = cueTime - now;
      if (lead <= 0.03 || lead > LOOKAHEAD_SECONDS) continue;
      this.captureFutureCue(index, cueTime);
    }
  }

  private readonly tick = (): void => {
    const wallNow = performance.now();
    const dt = clamp((wallNow - this.lastFrame) / 1000, 0, 0.05);
    this.lastFrame = wallNow;
    const now = this.songTime();

    this.predict(now);
    for (const wrapped of this.wrapped.values()) {
      this.advanceEffect(wrapped, now);
      this.advanceScanBlend(wrapped, now);
      this.updateMotion(wrapped, now, dt);
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
