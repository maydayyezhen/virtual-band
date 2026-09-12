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
export interface CameraCue {
  time: number;
  name: string;
  from: ShotFraming;
  /** Same subject throughout a shot; changing the subject is an edit, not a flying camera. */
  to?: Partial<Omit<ShotFraming, 'subject'>>;
  /** Glide is for adjacent, compatible setups only; all other edits cut. */
  transition?: { kind: 'glide'; seconds: number };
}
export interface CameraShow { id: string; duration: number; cues: readonly CameraCue[] }
