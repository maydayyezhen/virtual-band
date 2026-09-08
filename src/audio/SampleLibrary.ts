import type { AudioEngine } from './AudioEngine';

const FLUID_R3_ROOT = '/soundfonts/FluidR3_GM';
const PERCUSSION_ROOT = '/soundfonts/abcjs/percussion-mp3';
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export class SampleLibrary {
  private readonly audio: AudioEngine;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  load(path: string): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(path);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await this.audio.decode(await response.arrayBuffer());
      } catch (error) {
        console.warn(`[SampleLibrary] sample unavailable: ${path}`, error);
        return null;
      }
    })();

    this.buffers.set(path, promise);
    return promise;
  }

  async preload(paths: Iterable<string>): Promise<void> {
    const unique = new Set(paths);
    await Promise.allSettled([...unique].map((path) => this.load(path)));
  }

  dispose(): void {
    this.buffers.clear();
  }
}

export function fluidR3SamplePath(sampleSet: string, note: number): string {
  return `${FLUID_R3_ROOT}/${sampleSet}-mp3/${midiFlatName(note)}.mp3`;
}

export function percussionSamplePath(note: number): string {
  return `${PERCUSSION_ROOT}/${midiFlatName(note)}.mp3`;
}

export function midiFlatName(note: number): string {
  const midi = clampMidi(note);
  return `${FLAT_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function clampMidi(note: number): number {
  return Math.max(0, Math.min(127, Math.round(note)));
}
