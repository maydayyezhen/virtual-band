import type { AudioEngine, AudioVoice } from './AudioEngine';

const SAMPLE_BASE =
  'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_guitar_steel-mp3/';
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PITCH_BEND_SEMITONES = 2;

interface VoiceState {
  voice: AudioVoice | null;
  released: boolean;
  baseGain: number;
}

export class AcousticGuitarSampler {
  private readonly audio: AudioEngine;
  private readonly buffers = new Map<number, Promise<AudioBuffer | null>>();
  private readonly voices = new Map<number, VoiceState>();
  private sustain = false;
  private volume = 0.86;
  private pitchBend = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  noteOn(stringNumber: number, note: number, velocity: number): void {
    if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 6) return;
    if (!Number.isInteger(note) || note < 0 || note > 127) return;

    this.stopString(stringNumber, 0.014);
    const baseGain = Math.pow(clamp01(velocity / 127), 1.12) * 0.86;
    const state: VoiceState = { voice: null, released: false, baseGain };
    this.voices.set(stringNumber, state);

    void this.load(note).then((buffer) => {
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

  async preloadCommon(): Promise<void> {
    const notes = [40, 45, 50, 55, 59, 64, 67, 69, 71, 72, 74, 76, 79, 81, 84];
    await Promise.allSettled(notes.map((note) => this.load(note)));
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

  private load(note: number): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(note);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await fetch(`${SAMPLE_BASE}${midiFlatName(note)}.mp3`);
        if (!response.ok) return null;
        return await this.audio.decode(await response.arrayBuffer());
      } catch {
        return null;
      }
    })();
    this.buffers.set(note, promise);
    return promise;
  }
}

function midiFlatName(note: number): string {
  return `${FLAT_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

function pitchRate(value: number): number {
  return 2 ** ((value * PITCH_BEND_SEMITONES) / 12);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
