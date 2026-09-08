import type { AudioEngine, AudioVoice } from './AudioEngine';
import { mixGain } from './AudioMixProfile';
import type { ViolinArticulation } from '../instruments/violin/legacyViolinAsset';
import { fluidR3SamplePath, type SampleLibrary } from './SampleLibrary';
import type { ViolinSustainBackend } from './ViolinSustainBackend';

const SAMPLE_SET: Record<ViolinArticulation, string> = {
  arco: 'violin',
  pizzicato: 'pizzicato_strings',
};
const COMMON_NOTES = [55, 62, 67, 69, 71, 74, 76, 81, 88] as const;
const MP3_ARCO_RELEASE_SECONDS = 0.11;

type VoiceBackend = 'mp3' | 'sustain';

interface VoiceState {
  voice: AudioVoice | null;
  backend: VoiceBackend;
  released: boolean;
  articulation: ViolinArticulation;
  generation: number;
}

export class ViolinSampler {
  private readonly audio: AudioEngine;
  private readonly samples: SampleLibrary;
  private readonly sustainBackend: ViolinSustainBackend | null;
  private readonly voices = new Map<number, VoiceState>();
  private generation = 0;

  constructor(
    audio: AudioEngine,
    samples: SampleLibrary,
    sustainBackend: ViolinSustainBackend | null = null,
  ) {
    this.audio = audio;
    this.samples = samples;
    this.sustainBackend = sustainBackend;
    this.sustainBackend?.setGain(mixGain('violin.arco'), 0);
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

    if (articulation === 'arco' && this.sustainBackend?.noteOn(stringNumber, note, velocity)) {
      this.voices.set(stringNumber, {
        voice: null,
        backend: 'sustain',
        released: false,
        articulation,
        generation: ++this.generation,
      });
      return;
    }

    const state: VoiceState = {
      voice: null,
      backend: 'mp3',
      released: false,
      articulation,
      generation: ++this.generation,
    };
    this.voices.set(stringNumber, state);

    const target = articulation === 'arco' ? 'violin.arco' : 'violin.pizzicato';
    const gain = Math.pow(clamp01(velocity / 127), 1.18) * mixGain(target);
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

  /** Returns the audible release-tail duration for this physical string. */
  noteOff(stringNumber: number): number {
    const state = this.voices.get(stringNumber);
    if (!state) return 0;
    state.released = true;

    if (state.backend === 'sustain') {
      this.voices.delete(stringNumber);
      return this.sustainBackend?.noteOff(stringNumber).durationSeconds ?? 0;
    }

    if (state.articulation === 'arco') {
      this.stopString(stringNumber, MP3_ARCO_RELEASE_SECONDS);
      return MP3_ARCO_RELEASE_SECONDS;
    }

    return 0;
  }

  setPitchBend(value: number): boolean {
    return this.sustainBackend?.setPitchBend(value) ?? false;
  }

  async preloadCommon(): Promise<void> {
    await Promise.allSettled([
      this.samples.preload([
        ...COMMON_NOTES.map((note) => fluidR3SamplePath(SAMPLE_SET.arco, note)),
        ...COMMON_NOTES.map((note) => fluidR3SamplePath(SAMPLE_SET.pizzicato, note)),
      ]),
      this.sustainBackend?.prepare() ?? Promise.resolve(false),
    ]);
  }

  reset(): void {
    this.sustainBackend?.reset();
    for (const stringNumber of [...this.voices.keys()]) this.stopString(stringNumber, 0.025);
  }

  dispose(): void {
    this.reset();
    this.sustainBackend?.dispose();
  }

  private stopString(stringNumber: number, fadeSeconds: number): void {
    const state = this.voices.get(stringNumber);
    if (!state) return;
    this.voices.delete(stringNumber);

    if (state.backend === 'sustain') {
      this.sustainBackend?.noteOff(stringNumber);
      return;
    }

    state.voice?.stop(fadeSeconds);
  }

  private load(articulation: ViolinArticulation, note: number): Promise<AudioBuffer | null> {
    return this.samples.load(fluidR3SamplePath(SAMPLE_SET[articulation], note));
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
