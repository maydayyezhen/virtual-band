import * as THREE from 'three';
import type { CameraShow, CameraCue, ShotFraming } from '../shows/CameraShow';
import type { CameraSystem, CameraPoseInput } from './CameraSystem';

const mix = THREE.MathUtils.lerp;
const ease = (x: number) => x * x * (3 - 2 * x);

/** Stateless song-time evaluation: seek, pause and slow rendering cannot desynchronise the shot. */
export class CameraShowPlayer {
  private show: CameraShow | null = null;
  private subjects = new Map<string, string>();
  readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private readonly camera: CameraSystem) {}
  setShow(show: CameraShow | null, subjects: readonly { type: string; instance: number; instrumentId: string }[] = []): void {
    this.show = show;
    this.subjects = new Map(subjects.map(b => [`${b.type}.${b.instance}`, b.instrumentId]));
  }
  get available(): boolean { return !!this.show; }
  get cues(): readonly CameraCue[] { return this.show?.cues ?? []; }
  update(seconds: number): string {
    if (!this.show || !Number.isFinite(seconds)) return '';
    const t = THREE.MathUtils.clamp(seconds, 0, this.show.duration);
    let index = 0;
    while (index + 1 < this.show.cues.length && this.show.cues[index + 1].time <= t) index++;
    const cue = this.show.cues[index];
    if (!cue) return '';
    const end = this.show.cues[index + 1]?.time ?? this.show.duration;
    const progress = this.reducedMotion.matches ? .5 : ease(THREE.MathUtils.clamp((t - cue.time) / Math.max(.001, end - cue.time), 0, 1));
    let pose = this.resolve(cue, progress);
    if (!pose) pose = this.resolve(this.show.cues[0], 0);
    if (!pose) return '';
    const transition = cue.transition;
    if (index > 0 && transition && !this.reducedMotion.matches && t - cue.time < transition.seconds) {
      const prior = this.resolve(this.show.cues[index - 1], 1);
      if (prior) {
        const k = ease((t - cue.time) / transition.seconds);
        pose = { position: prior.position.lerp(pose.position, k), target: prior.target.lerp(pose.target, k), fov: mix(prior.fov, pose.fov, k) };
      }
    }
    this.camera.setLens({ near: .02, far: 160 });
    this.camera.setPose(pose, true);
    return cue.name;
  }
  private resolve(cue: CameraCue, progress: number): CameraPoseInput | null {
    const a = cue.from, b = { ...a, ...cue.to };
    const framing: ShotFraming = { ...a,
      target: a.target.map((n, i) => mix(n, b.target[i], progress)) as ShotFraming['target'],
      yaw: mix(a.yaw, b.yaw, progress), pitch: mix(a.pitch, b.pitch, progress),
      width: mix(a.width, b.width, progress), height: mix(a.height, b.height, progress), fov: mix(a.fov, b.fov, progress),
    };
    if (a.subject) {
      const instrumentId = this.subjects.get(`${a.subject.type}.${a.subject.instance}`);
      if (!instrumentId) return null;
      return this.camera.resolve({ ...framing, kind: 'instrument-orbit', id: 'show:shot', label: cue.name, instrumentId });
    }
    return this.camera.resolve({ kind: 'band-orbit', id: 'show:shot', label: cue.name, scope: 'show',
      target: framing.target, yaw: framing.yaw, pitch: framing.pitch, fov: framing.fov,
      framing: { width: framing.width, height: framing.height, depth: 0 } });
  }
}
