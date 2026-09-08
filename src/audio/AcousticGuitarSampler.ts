import type { AudioEngine, AudioVoice } from './AudioEngine';
import {
  ACOUSTIC_GUITAR_PROGRAM_IDS,
  DEFAULT_ACOUSTIC_GUITAR_PROGRAM,
  getAcousticGuitarProgram,
  type AcousticGuitarProgramId,
} from './AcousticGuitarProgram';
import { fluidR3SamplePath, type SampleLibrary } from './SampleLibrary';

const PITCH_BEND_SEMITONES = 2;
const COMMON_NOTES = [40, 45, 50, 55, 59, 64, 67, 69, 71, 72, 74, 76, 79, 81, 84] as const;

interface VoiceState {
  voice: AudioVoice | null;
  released: boolean;
  baseGain: number;
}

export class AcousticGuitarSampler {
  private readonly audio: AudioEngine;
  private readonly samples: SampleLibrary;
  private readonly voices = new Map<number, VoiceState>();
  private sustain = false;
  private volume = 0.86;
  private pitchBend = 0;
  private programId: AcousticGuitarProgramId = DEFAULT_ACOUSTIC_GUITAR_PROGRAM;

  constructor(audio: AudioEngine, samples: SampleLibrary) {
    this.audio = audio;
    this.samples = samples;
  }

  get program(): AcousticGuitarProgramId {
    return this.programId;
  }

  setProgram(value: number): boolean {
    const preset = getAcousticGuitarProgram(value);
    if (!preset) return false;
    this.programId = preset.id;
    void this.preloadProgram(preset.id);
    return true;
  }

  noteOn(stringNumber: number, note: number, velocity: number): void {
    if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 6) return;
    if (!Number.isInteger(note) || note < 0 || note > 127) return;

    const preset = getAcousticGuitarProgram(this.programId);
    if (!preset) return;

    this.stopString(stringNumber, 0.014);
    const baseGain = Math.pow(clamp01(velocity / 127), 1.12) * 0.86;
    const state: VoiceState = { voice: null, released: false, baseGain };
    this.voices.set(stringNumber, state);

    void this.load(preset.sampleSet, note).then((buffer) => {
      if (!buffer || this.voices.get(stringNumber) !== state) return;
      if (state.released && !this.sustain) {
        this.voices.delete(stringNumber);
        return;
      }

      const voice = this.audio.playBuffer(buffer, baseGain * this.volume);
      state.voice = voice;
      voice?.setPlaybackRate(pitchRate(this.pitchBend), 0);
      voice?.onEnded(() => {
        if (this.voices.get(stringNumber) === state) this.voices.delete(stringNumber);
      });
      if (state.released && !this.sustain) this.stopString(stringNumber, 0.13);
    });
  }

  noteOff(stringNumber: number): void {
    const state = this.voices.get(stringNumber);
    if (!state) return;
    state.released = true;
    if (!this.sustain) this.stopString(stringNumber, 0.14);
  }

  setSustain(pressed: boolean): void {
    if (this.sustain === pressed) return;
    this.sustain = pressed;
    if (pressed) return;
    for (const [stringNumber, state] of this.voices) {
      if (state.released) this.stopString(stringNumber, 0.14);
    }
  }

  setVolume(value: number): void {
    this.volume = clamp01(value);
    for (const state of this.voices.values()) {
      state.voice?.setGain(state.baseGain * this.volume, 0.025);
    }
  }

  setPitchBend(value: number): boolean {
    if (!Number.isFinite(value) || value < -1 || value > 1) return false;
    this.pitchBend = value;
    const rate = pitchRate(value);
    for (const state of this.voices.values()) state.voice?.setPlaybackRate(rate, 0.018);
    return true;
  }

  preloadCommon(): Promise<void> {
    return this.preloadProgram(this.programId);
  }

  async preloadProgram(value: number): Promise<void> {
    const preset = getAcousticGuitarProgram(value);
    if (!preset) return;
    await this.samples.preload(COMMON_NOTES.map((note) => fluidR3SamplePath(preset.sampleSet, note)));
  }

  async preloadShowcase(): Promise<void> {
    await Promise.allSettled(
      ACOUSTIC_GUITAR_PROGRAM_IDS.map((program) => this.preloadProgram(program)),
    );
  }

  reset(): void {
    this.sustain = false;
    this.pitchBend = 0;
    for (const stringNumber of [...this.voices.keys()]) this.stopString(stringNumber, 0.03);
  }

  dispose(): void {
    this.reset();
  }

  private stopString(stringNumber: number, fadeSeconds: number): void {
    const state = this.voices.get(stringNumber);
    if (!state) return;
    this.voices.delete(stringNumber);
    state.voice?.stop(fadeSeconds);
  }

  private load(sampleSet: string, note: number): Promise<AudioBuffer | null> {
    return this.samples.load(fluidR3SamplePath(sampleSet, note));
  }
}

function pitchRate(value: number): number {
  return 2 ** ((value * PITCH_BEND_SEMITONES) / 12);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
