import type { MusicAnalysis, MusicFrame } from '../../lighting/MusicAnalysis';

export interface TheatreAct { key: string; beat: number; title: string; time: number; endBeat: number; index: number }
export interface TheatreFrame extends MusicFrame { chapter: { kind: string } }
export function createMidiTheatre(analysis: MusicAnalysis): {
  readonly acts: readonly TheatreAct[];
  sceneAt(time: number): TheatreAct;
  screenWeight(id: string, time: number): number;
  draw(ctx: CanvasRenderingContext2D, frame: { screen: { id: string }; width: number; height: number }, music: TheatreFrame): void;
  dispose(): void;
};
