import type { Texture } from 'three';

export interface ScreenDescriptor { id: string; width: number; height: number; pixelWidth: number; pixelHeight: number }
export type ScreenSurface = CanvasImageSource | Texture;
export interface ScreenAudio { waveform: Float32Array; spectrum: Float32Array }
export interface ScreenFrame {
  time: number;
  delta: number;
  playing: boolean;
  width: number;
  height: number;
  audio?: ScreenAudio;
}
export interface ScreenPlayer {
  readonly surface: ScreenSurface;
  /** Return false if no pixels changed. Never start a separate render loop. */
  update(frame: ScreenFrame): boolean | void;
  dispose(): void;
}
/** Extension point: each screen gets an independent player with explicit resource ownership. */
export interface ScreenContent {
  readonly label: string;
  create(screen: ScreenDescriptor, signal: AbortSignal): ScreenPlayer | Promise<ScreenPlayer>;
}
export interface ScreenOptions {
  fit: 'contain' | 'cover';
  brightness: number;
  clock: 'song' | 'local';
  playing: boolean;
}
export interface ScreenControl {
  present(surface: ScreenSurface, options: Pick<ScreenOptions, 'fit' | 'brightness'>): void;
  invalidate(): void;
  release(): void;
}
export interface ScreenPort {
  readonly screens: readonly ScreenDescriptor[];
  acquire(id: string): ScreenControl;
}
