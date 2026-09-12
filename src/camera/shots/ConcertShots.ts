import type { ShotFraming } from '../../shows/CameraShow';

/** Stage compositions authored for NOCTURNE; other venues can provide their own objects. */
const wide: ShotFraming = { target: [0, 5, -1], yaw: 0, pitch: .12, width: 30, height: 11, fov: 42 };
const stageShots = {
  wide,
  medium: { ...wide, target: [0, 3.2, 0], width: 19, height: 6.5, pitch: .18, fov: 36 } as ShotFraming,
};
/** Model-local coordinates, matching the current authored instrument assets (not world metres). */
const instrumentShots = {
  piano: { subject: { type: 'piano', instance: 0 }, target: [0, .83, -.2], yaw: .55, pitch: .42, width: 3, height: 1.9, fov: 38 },
  keys: { subject: { type: 'piano', instance: 0 }, target: [0, .80, .47], yaw: -.35, pitch: .68, width: 1.7, height: .75, fov: 40 },
  guitar: { subject: { type: 'electric', instance: 0 }, target: [0, .7, .2], yaw: -.22, pitch: .13, width: 5.5, height: 8.8, fov: 35 },
  bridge: { subject: { type: 'electric', instance: 0 }, target: [0, -1.45, .38], yaw: .24, pitch: .24, width: 2.1, height: 2.8, fov: 40 },
  bass: { subject: { type: 'bass', instance: 0 }, target: [0, .7, .2], yaw: -.3, pitch: .15, width: 5, height: 8, fov: 36 },
  sax: { subject: { type: 'saxophone', instance: 0 }, target: [0, .48, .05], yaw: .45, pitch: .12, width: 1.2, height: 1.3, fov: 38 },
  keyboard: { subject: { type: 'keyboard', instance: 0 }, target: [0, 9.1, -.15], yaw: .18, pitch: .60, width: 15.4, height: 7.2, fov: 36 },
  drums: { subject: { type: 'drums', instance: 0 }, target: [0, 1.65, -.4], yaw: Math.PI - .3, pitch: .86, width: 7.5, height: 4.6, fov: 36 },
} satisfies Record<string, ShotFraming>;

export function nocturneShot(name: keyof typeof stageShots): ShotFraming { return structuredClone(stageShots[name]); }
export function instrumentShot(name: keyof typeof instrumentShots, instance = 0): ShotFraming {
  const shot = structuredClone(instrumentShots[name]); shot.subject.instance = instance; return shot;
}
