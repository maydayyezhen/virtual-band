import type { AudioEngine, AudioVoice } from './AudioEngine';
import type { ViolinArticulation } from '../instruments/violin/legacyViolinAsset';
import { fluidR3SamplePath, type SampleLibrary } from './SampleLibrary';

const SAMPLE_SET: Record<ViolinArticulation, string> = {
  arco: 'violin',
  pizzicato: 'pizzicato_strings',
};
const COMMON_NOTES = [55, 62, 67, 69, 71, 74, 76, 81, 88] as const;

interface VoiceState {
  voice: AudioVoice | null;
  released: boolean;
  articulation: ViolinArticulation;
  generation: number;
}

export class ViolinSampler {
  private readonly audio: AudioEngine;
  private readonly samples: SampleLibrary;
  private readonly voices = new Map<number, VoiceState>();
  private generation = 0;

  constructor(audio: AudioEngine, samples: SampleLibrary) {
    this.audio = audio;
    this.samples = samples;
  }

  noteOn(
    stringNumber: number,
    note: number,
    velocity: number,
    articulation: ViolinArticulation,
  ): void {
    if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 4) return;
    if (!Number.isInteger(note) || note < 0 || note > 127) return;

    this.stopString(stringNumber, 0.025);
    const state: VoiceState = {
      voice: null,
      released: false,
      articulation,
      generation: ++this.generation,
    };
    this.voices.set(stringNumber, state);

    const gain = Math.pow(clamp01(velocity / 127), 1.18) * (articulation === 'arco' ? 0.74 : 0.88);
    void this.load(articulation, note).then((buffer) => {
      if (!buffer || this.voices.get(stringNumber) !== state) return;
      if (state.released && articulation === 'arco') {
        this.voices.delete(stringNumber);
        return;
      }

      const voice = this.audio.playBuffer(buffer, gain);
      state.voice = voice;
      voice?.onEnded(() => {
        if (this.voices.get(stringNumber) === state) this.voices.delete(stringNumber);
      });
      if (state.released && articulation === 'arco') this.stopString(stringNumber, 0.08);
    });
  }

  noteOff(stringNumber: number): void {
    const state = this.voices.get(stringNumber);
    if (!state) return;
    state.released = true;
    if (state.articulation === 'arco') this.stopString(stringNumber, 0.11);
  }

  async preloadCommon(): Promise<void> {
    await this.samples.preload([
      ...COMMON_NOTES.map((note) => fluidR3SamplePath(SAMPLE_SET.arco, note)),
      ...COMMON_NOTES.map((note) => fluidR3SamplePath(SAMPLE_SET.pizzicato, note)),
    ]);
  }

  reset(): void {
    for (const stringNumber of [...this.voices.keys()]) this.stopString(stringNumber, 0.025);
  }

  private stopString(stringNumber: number, fadeSeconds: number): void {
    const state = this.voices.get(stringNumber);
    if (!state) return;
    this.voices.delete(stringNumber);
    state.voice?.stop(fadeSeconds);
  }

  private load(articulation: ViolinArticulation, note: number): Promise<AudioBuffer | null> {
    return this.samples.load(fluidR3SamplePath(SAMPLE_SET[articulation], note));
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
