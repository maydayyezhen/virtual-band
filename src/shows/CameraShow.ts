import type { BandInstrumentType } from '../midi/types';

export interface ShotFraming {
  /** Omitted for venue coordinates; otherwise framing is local to the exact band member. */
  subject?: { type: BandInstrumentType; instance: number };
  target: [number, number, number];
  yaw: number;
  pitch: number;
  width: number;
  height: number;
  fov: number;
}
/** Explicit camera placement; world metres unless bound to an instrument's model-local frame. */
export interface PositionedShot {
  subject?: ShotFraming['subject'];
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}
export type ShotView = ShotFraming | PositionedShot;
export interface CameraMotionContext {
  time: number;
  elapsed: number;
  duration: number;
  /** Linear 0..1, independent of previous render calls. */
  progress: number;
  from: ShotView;
  to: ShotView;
}
export type CameraMotion = (frame: CameraMotionContext) => ShotView;
export interface CameraTransitionContext {
  time: number;
  progress: number;
  /** Resolved world poses, independent of the currently displayed camera. */
  from: Omit<PositionedShot, 'subject'>;
  to: Omit<PositionedShot, 'subject'>;
}
export type CameraTransition = { kind: 'glide'; seconds: number } | {
  kind: 'custom'; seconds: number;
  sample(frame: CameraTransitionContext): Omit<PositionedShot, 'subject'>;
};
export interface CameraCue {
  time: number;
  name: string;
  from: ShotView;
  /** Same subject throughout a shot; changing the subject is an edit, not a flying camera. */
  to?: Partial<Omit<ShotFraming & PositionedShot, 'subject'>>;
  /** Optional original trajectory. No registry entry or core switch branch is required. */
  motion?: CameraMotion;
  /** Glide is for adjacent, compatible setups only; all other edits cut. */
  transition?: CameraTransition;
}
export interface CameraShow { id: string; duration: number; cues: readonly CameraCue[] }
