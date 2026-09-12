import type { LightingRig, PreparedLightingShow } from '../lighting/Lighting';
import type { MusicAnalysis } from '../lighting/MusicAnalysis';
import type { ScreenContent } from '../screens/ScreenContent';
import type { CameraShow } from './CameraShow';
import type { TitleShow } from '../titles/TitleShow';

export interface PreparedBandShow { lighting: PreparedLightingShow; screens: ScreenContent; camera: CameraShow; titles: TitleShow }

/** A work's assets, menu presentation and execution belong to the same registration. */
export interface ShowDefinition {
  id: string;
  title: string;
  artist: string;
  credit: string;
  midiUrl: string;
  sha256: string;
  /** null keeps technical studies out of the game's music selection. */
  menu: {
    title: string; subtitle: string; duration: string; cover: string; description: string;
    previewAt: number; previewSeconds: number;
  } | null;
  /** Explicit author declaration: live video/audio analysis is not automatically offline-safe. */
  offline: { supported: true } | { supported: false; reason: string };
  prepare(music: MusicAnalysis, rig: LightingRig): PreparedBandShow;
}
