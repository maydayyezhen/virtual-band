import * as THREE from 'three';
import type { CameraShow, CameraCue, ShotView, PositionedShot } from '../shows/CameraShow';
import type { CameraSystem, CameraPoseInput } from './CameraSystem';
import { sampleShot, validateShot } from './ShotMotion';

const mix = THREE.MathUtils.lerp;
const ease = (x: number) => x * x * (3 - 2 * x);

/** Stateless song-time evaluation: seek, pause and slow rendering cannot desynchronise the shot. */
export class CameraShowPlayer {
  private show: CameraShow | null = null;
  private subjects = new Map<string, string>();
  error: string | null = null;
  readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private readonly camera: CameraSystem) {}
  setShow(show: CameraShow | null, subjects: readonly { type: string; instance: number; instrumentId: string }[] = []): void {
    if (show) {
      if (!Number.isFinite(show.duration) || show.duration <= 0 || !show.cues.length || show.cues[0].time !== 0)
        throw new Error('导播必须从零开始，并有明确时长');
      for (const [i, cue] of show.cues.entries()) {
        const end = show.cues[i + 1]?.time ?? show.duration;
        if (!Number.isFinite(cue.time) || !Number.isFinite(end) || cue.time < 0 || end <= cue.time || end > show.duration)
          throw new Error(`镜头时间顺序无效：${cue.name}`);
        validateShot(cue.from);
        if (cue.to) validateShot({ ...cue.from, ...cue.to } as ShotView);
        if (cue.transition && (!Number.isFinite(cue.transition.seconds) || cue.transition.seconds <= 0 || cue.transition.seconds > end - cue.time))
          throw new Error(`镜头转场时长无效：${cue.name}`);
      }
    }
    this.show = show;
    this.error = null;
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
    try {
      let pose = this.resolve(sampleShot(cue, t, end, this.reducedMotion.matches), cue.name);
      if (!pose) throw new Error('镜头目标乐器不存在');
      const transition = cue.transition;
      if (index > 0 && transition && !this.reducedMotion.matches && t - cue.time < transition.seconds) {
        const previous = this.show.cues[index - 1];
        const prior = this.resolve(sampleShot(previous, cue.time, cue.time), previous.name);
        if (!prior) throw new Error('转场起点乐器不存在');
        const progress = (t - cue.time) / transition.seconds;
        if (transition.kind === 'custom') {
          const world = transition.sample({ time: t, progress, from: worldShot(prior), to: worldShot(pose) });
          validateShot(world);
          if ('subject' in world && world.subject) throw new Error('转场必须返回世界坐标');
          pose = { position: new THREE.Vector3(...world.position), target: new THREE.Vector3(...world.target), fov: world.fov };
        } else {
          const k = ease(progress);
          pose = { position: prior.position.lerp(pose.position, k), target: prior.target.lerp(pose.target, k), fov: mix(prior.fov, pose.fov, k) };
        }
      }
      this.camera.setLens({ near: .02, far: 160 });
      this.camera.setPose(pose, true);
      this.error = null;
      return cue.name;
    } catch (error) {
      this.error = `${cue.name}: ${String(error)}`;
      return this.error; // Preserve the last valid pose; don't kill audio or the host frame loop.
    }
  }
  private resolve(framing: ShotView, name: string): CameraPoseInput | null {
    if (framing.subject) {
      const instrumentId = this.subjects.get(`${framing.subject.type}.${framing.subject.instance}`);
      if (!instrumentId) return null;
      if ('position' in framing) return this.camera.resolve({ kind: 'instrument', id: 'show:shot', label: name,
        instrumentId, camera: framing.position, target: framing.target, fov: framing.fov });
      return this.camera.resolve({ ...framing, kind: 'instrument-orbit', id: 'show:shot', label: name, instrumentId });
    }
    if ('position' in framing) return { position: new THREE.Vector3(...framing.position), target: new THREE.Vector3(...framing.target), fov: framing.fov };
    return this.camera.resolve({ kind: 'band-orbit', id: 'show:shot', label: name, scope: 'show',
      target: framing.target, yaw: framing.yaw, pitch: framing.pitch, fov: framing.fov,
      framing: { width: framing.width, height: framing.height, depth: 0 } });
  }
}
function worldShot(pose: CameraPoseInput): Omit<PositionedShot, 'subject'> {
  return { position: pose.position.toArray(), target: pose.target.toArray(), fov: pose.fov };
}
