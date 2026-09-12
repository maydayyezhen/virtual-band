import type { CameraCue, CameraMotionContext, ShotView } from '../shows/CameraShow';

export const smoothMotion = (x: number): number => x * x * (3 - 2 * x);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const vector = (a: number[], b: number[], k: number): [number, number, number] =>
  a.map((n, i) => mix(n, b[i], k)) as [number, number, number];

/** The existing orbit/framing motion, also available to original authored trajectories. */
export function interpolateShot(from: ShotView, to: ShotView, progress: number): ShotView {
  const common = { subject: from.subject, target: vector(from.target, to.target, progress), fov: mix(from.fov, to.fov, progress) };
  if ('position' in from && 'position' in to)
    return { ...common, position: vector(from.position, to.position, progress) };
  if (!('position' in from) && !('position' in to))
    return { ...common, yaw: mix(from.yaw, to.yaw, progress), pitch: mix(from.pitch, to.pitch, progress),
      width: mix(from.width, to.width, progress), height: mix(from.height, to.height, progress) };
  throw new Error('同一镜头的起止构图必须使用相同坐标形式');
}

export function validateShot(view: ShotView): void {
  const v = (value: number[]) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (!view || !v(view.target) || !Number.isFinite(view.fov) || view.fov <= 0 || view.fov >= 180)
    throw new Error('镜头目标或视角无效');
  if (view.subject && (!view.subject.type || !Number.isInteger(view.subject.instance) || view.subject.instance < 0))
    throw new Error('镜头乐器实例无效');
  if ('position' in view) {
    if (!v(view.position) || view.position.every((n, i) => n === view.target[i])) throw new Error('镜头位置无效或与目标重合');
  } else if (![view.yaw, view.pitch, view.width, view.height].every(Number.isFinite) || view.width <= 0 || view.height <= 0)
    throw new Error('镜头构图无效');
}

/** A custom motion receives a frozen-in-time sample, never wall clock or accumulated delta. */
export function sampleShot(cue: CameraCue, time: number, end: number, reducedMotion = false): ShotView {
  const duration = end - cue.time;
  const progress = reducedMotion ? .5 : Math.max(0, Math.min(1, (time - cue.time) / duration));
  const from = structuredClone(cue.from), to = { ...structuredClone(cue.from), ...structuredClone(cue.to) } as ShotView;
  const frame: CameraMotionContext = { time: reducedMotion ? cue.time + duration / 2 : time,
    elapsed: progress * duration, duration, progress, from, to };
  const view = cue.motion ? cue.motion(frame) : interpolateShot(from, to, smoothMotion(progress));
  validateShot(view);
  // Metadata used to verify active performers must describe the entire shot, including custom paths.
  if (view.subject?.type !== cue.from.subject?.type || view.subject?.instance !== cue.from.subject?.instance)
    throw new Error('镜头运动不能偷偷更换主体，请另建镜头');
  return view;
}
