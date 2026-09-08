import type { AudioEngine, AudioVoice } from './AudioEngine';
import {
  ACOUSTIC_GUITAR_PROGRAM_IDS,
  DEFAULT_ACOUSTIC_GUITAR_PROGRAM,
  getAcousticGuitarProgram,
  type AcousticGuitarProgramId,
} from './AcousticGuitarProgram';
import type { ProgramToneBackend, ProgramToneNoteOptions } from './ProgramToneBackend';
import { fluidR3SamplePath, type SampleLibrary } from './SampleLibrary';

const PITCH_BEND_SEMITONES = 2;
const COMMON_NOTES = [40, 45, 50, 55, 59, 64, 67, 69, 71, 72, 74, 76, 79, 81, 84] as const;

type VoiceBackend = 'mp3' | 'tone';
type GuitarGesture = 'gated' | 'strum';

interface VoiceState {
  voice: AudioVoice | null;
  released: boolean;
  baseGain: number;
  backend: VoiceBackend;
}

export class AcousticGuitarSampler {
  private readonly audio: AudioEngine;
  private readonly samples: SampleLibrary;
  private readonly toneBackend: ProgramToneBackend | null;
  private readonly voices = new Map<number, VoiceState>();
  private sustain = false;
  private volume = 0.86;
  private pitchBend = 0;
  private programId: AcousticGuitarProgramId = DEFAULT_ACOUSTIC_GUITAR_PROGRAM;

  constructor(
    audio: AudioEngine,
    samples: SampleLibrary,
    toneBackend: ProgramToneBackend | null = null,
  ) {
    this.audio = audio;
    this.samples = samples;
    this.toneBackend = toneBackend;
    this.toneBackend?.setGain(this.volume, 0);
    this.toneBackend?.setProgram(this.programId, 0);
  }

  get program(): AcousticGuitarProgramId {
    return this.programId;
  }

  setProgram(value: number): boolean {
    const preset = getAcousticGuitarProgram(value);
    if (!preset) return false;
    this.programId = preset.id;
    this.toneBackend?.setProgram(preset.id, 0);
    void this.preloadProgram(preset.id);
    return true;
  }

  noteOn(
    stringNumber: number,
    note: number,
    velocity: number,
    gesture: GuitarGesture = 'gated',
  ): void {
    if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 6) return;
    if (!Number.isInteger(note) || note < 0 || note > 127) return;

    const preset = getAcousticGuitarProgram(this.programId);
    if (!preset) return;

    // A new strike on the same physical string mutes the previous string voice
    // quickly. Do not let the old SF2 release tail pile underneath the new note.
    this.stopString(stringNumber, 0.014);
    const baseGain = Math.pow(clamp01(velocity / 127), 1.12) * 0.86;
    const toneOptions = gesture === 'strum'
      ? acousticStrumToneOptions(this.programId, note)
      : undefined;

    if (this.toneBackend?.noteOn(voiceId(stringNumber), note, velocity, toneOptions)) {
      this.voices.set(stringNumber, {
        voice: null,
        released: false,
        baseGain,
        backend: 'tone',
      });
      return;
    }

    const state: VoiceState = {
      voice: null,
      released: false,
      baseGain,
      backend: 'mp3',
    };
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

    if (state.backend === 'tone') {
      this.voices.delete(stringNumber);
      this.toneBackend?.noteOff(voiceId(stringNumber));
      return;
    }

    if (!this.sustain) this.stopString(stringNumber, 0.14);
  }

  setSustain(pressed: boolean): void {
    if (this.sustain === pressed) return;
    this.sustain = pressed;
    this.toneBackend?.setSustain(pressed);
    if (pressed) return;
    for (const [stringNumber, state] of this.voices) {
      if (state.backend === 'mp3' && state.released) this.stopString(stringNumber, 0.14);
    }
  }

  setVolume(value: number): void {
    this.volume = clamp01(value);
    this.toneBackend?.setGain(this.volume, 0.025);
    for (const state of this.voices.values()) {
      if (state.backend === 'mp3') state.voice?.setGain(state.baseGain * this.volume, 0.025);
    }
  }

  setPitchBend(value: number): boolean {
    if (!Number.isFinite(value) || value < -1 || value > 1) return false;
    this.pitchBend = value;
    this.toneBackend?.setPitchBend(value);
    const rate = pitchRate(value);
    for (const state of this.voices.values()) {
      if (state.backend === 'mp3') state.voice?.setPlaybackRate(rate, 0.018);
    }
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
    await Promise.allSettled([
      this.toneBackend?.prepare() ?? Promise.resolve(false),
      ...ACOUSTIC_GUITAR_PROGRAM_IDS.map((program) => this.preloadProgram(program)),
    ]);
  }

  reset(): void {
    this.sustain = false;
    this.pitchBend = 0;
    this.toneBackend?.reset();
    for (const stringNumber of [...this.voices.keys()]) this.stopString(stringNumber, 0.03);
  }

  dispose(): void {
    this.reset();
    this.toneBackend?.dispose();
  }

  private stopString(stringNumber: number, fadeSeconds: number): void {
    const state = this.voices.get(stringNumber);
    if (!state) return;
    this.voices.delete(stringNumber);

    if (state.backend === 'tone') {
      this.toneBackend?.noteOff(voiceId(stringNumber), fadeSeconds);
      return;
    }

    state.voice?.stop(fadeSeconds);
  }

  private load(sampleSet: string, note: number): Promise<AudioBuffer | null> {
    return this.samples.load(fluidR3SamplePath(sampleSet, note));
  }
}

function acousticStrumToneOptions(
  program: AcousticGuitarProgramId,
  note: number,
): ProgramToneNoteOptions {
  // A physical strum is an impulse, not a key that can remain held forever.
  // These are generous ceilings; the corrected SF2 decay envelope normally
  // becomes inaudible before the ceiling. Lower notes are allowed to ring a bit
  // longer, matching real-string damping trends.
  const baseRingSeconds = program === 24 ? 3.4 : 3.9;
  const pitchScale = 2 ** ((60 - clamp(note, 40, 84)) / 72);
  return {
    autoReleaseSeconds: clamp(baseRingSeconds * pitchScale, 2.2, 5.2),
    autoReleaseFadeSeconds: 0.18,
  };
}

function voiceId(stringNumber: number): string {
  return `string:${stringNumber}`;
}

function pitchRate(value: number): number {
  return 2 ** ((value * PITCH_BEND_SEMITONES) / 12);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
