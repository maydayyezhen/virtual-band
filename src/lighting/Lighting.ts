/** Metres in venue world coordinates; colours are linear RGB, including HDR values. */
export type Vec3 = readonly [number, number, number];
export type RGB = Vec3;
export type FixtureGroup = 'rear' | 'floor' | 'side' | 'par';
export interface FixtureDescriptor {
  id: string;
  type: 'beam' | 'par';
  group: FixtureGroup;
  groups: readonly string[];
  position: Vec3;
}
export interface PixelDescriptor { id: string; row: number; index: number; count: number }
export interface GoboDescriptor { id: string; index: number }
export interface LightingRig {
  id: string;
  fixtures: readonly FixtureDescriptor[];
  pixels: readonly PixelDescriptor[];
  gobos: readonly GoboDescriptor[];
}
export interface FixtureFrame {
  id: string;
  target: Vec3;
  color: RGB;
  intensity: number; // 0..2, before the single master gain
  angle: number; // degrees
  distance: number; // metres
  beam: boolean;
}
/** Complete state, never an incremental patch. Seek and replay produce the same result. */
export interface LightingFrame {
  time: number;
  section: string;
  master: number;
  fixtures: readonly FixtureFrame[];
  pixels: readonly { id: string; color: RGB }[];
  gobos: readonly { id: string; color: RGB; opacity: number; rotation: number }[];
  environment: { key: number; ambient: number; background: RGB; hazeDensity: number; hazeTime: number };
}
export interface LightingControl {
  apply(frame: LightingFrame): void;
  release(): void;
}
/** The venue grants exclusive control and restores its decorative look on release. */
export interface LightingPort {
  readonly rig: LightingRig;
  acquire(): LightingControl;
}
export interface PreparedLightingShow {
  readonly id: string;
  readonly title: string;
  readonly sections: readonly { name: string; time: number }[];
  evaluate(seconds: number): LightingFrame;
}
