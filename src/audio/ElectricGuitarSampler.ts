import type { AudioBus, AudioEngine, AudioVoice } from './AudioEngine';
import {
  DEFAULT_ELECTRIC_GUITAR_PROGRAM,
  ELECTRIC_GUITAR_PROGRAMS,
  getElectricGuitarProgram,
  type ElectricGuitarProgramId,
  type ElectricPickupPosition,
} from './ElectricGuitarProgram';

const SAMPLE_ROOT = 'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/';
const DEFAULT_PRESET = ELECTRIC_GUITAR_PROGRAMS[DEFAULT_ELECTRIC_GUITAR_PROGRAM];
const PITCH_BEND_SEMITONES = 2;

interface VoiceState {
  voice: AudioVoice | null;
  released: boolean;
  baseGain: number;
}

interface ToneChain {
  input: BiquadFilterNode;
  pickupLow: BiquadFilterNode;
  pickupHigh: BiquadFilterNode;
  tone: BiquadFilterNode;
  bus: AudioBus;
}

export class ElectricGuitarSampler {
  private readonly audio: AudioEngine;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Map<number, VoiceState>();
  private sustain = false;
  private volume = DEFAULT_PRESET.volume;
  private tone = DEFAULT_PRESET.tone;
  private pickup: ElectricPickupPosition = DEFAULT_PRESET.pickup;
  private programId: ElectricGuitarProgramId = DEFAULT_ELECTRIC_GUITAR_PROGRAM;
  private pitchBend = 0;
  private toneChain: ToneChain | null = null;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  get program(): ElectricGuitarProgramId {
    return this.programId;
  }

  noteOn(stringNumber: number, note: number, velocity: number): void {
    if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 6) return;
    if (!Number.isInteger(note) || note < 0 || note > 127) return;

    this.stopString(stringNumber, 0.018);
    const preset = ELECTRIC_GUITAR_PROGRAMS[this.programId];
    const accentedVelocity = clamp01((velocity / 127) * preset.accent);
    const baseGain = Math.pow(accentedVelocity, 1.16) * 0.82;
    const state: VoiceState = { voice: null, released: false, baseGain };
    this.voices.set(stringNumber, state);

    void this.load(preset.sampleSet, note).then((buffer) => {
      if (!buffer || this.voices.get(stringNumber) !== state) return;
      if (state.released && !this.sustain) {
        this.voices.delete(stringNumber);
        return;
      }

      const chain = this.ensureToneChain();
      const voice = this.audio.playBuffer(buffer, baseGain * this.volume, undefined, chain.input);
      state.voice = voice;
      voice?.setPlaybackRate(pitchRate(this.pitchBend), 0);
      voice?.onEnded(() => {
        if (this.voices.get(stringNumber) === state) this.voices.delete(stringNumber);
      });
      if (state.released && !this.sustain) this.stopString(stringNumber, 0.09);
    });
  }

  noteOff(stringNumber: number): void {
    const state = this.voices.get(stringNumber);
    if (!state) return;
    state.released = true;
    if (!this.sustain) this.stopString(stringNumber, 0.10);
  }

  setProgram(value: number): boolean {
    const preset = getElectricGuitarProgram(value);
    if (!preset) return false;
    this.programId = preset.id;
    this.pickup = preset.pickup;
    this.tone = preset.tone;
    this.setVolume(preset.volume);
    this.updateToneChain();
    return true;
  }

  setPickup(value: number): boolean {
    if (!Number.isInteger(value) || value < 0 || value > 2) return false;
    this.pickup = value as ElectricPickupPosition;
    this.updateToneChain();
    return true;
  }

  setTone(value: number): boolean {
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
    this.tone = value;
    this.updateToneChain();
    return true;
  }

  setPitchBend(value: number): boolean {
    if (!Number.isFinite(value) || value < -1 || value > 1) return false;
    this.pitchBend = value;
    const rate = pitchRate(value);
    for (const state of this.voices.values()) state.voice?.setPlaybackRate(rate, 0.018);
    return true;
  }

  setSustain(pressed: boolean): void {
    if (this.sustain === pressed) return;
    this.sustain = pressed;
    if (pressed) return;
    for (const [stringNumber, state] of this.voices) {
      if (state.released) this.stopString(stringNumber, 0.11);
    }
  }

  setVolume(value: number): void {
    this.volume = clamp01(value);
    for (const state of this.voices.values()) {
      state.voice?.setGain(state.baseGain * this.volume, 0.025);
    }
  }

  async preloadCommon(): Promise<void> {
    const notes = [40, 45, 50, 55, 59, 64, 67, 69, 71, 74, 76, 79, 83, 86];
    const sampleSet = ELECTRIC_GUITAR_PROGRAMS[this.programId].sampleSet;
    await Promise.allSettled(notes.map((note) => this.load(sampleSet, note)));
  }

  reset(): void {
    this.sustain = false;
    this.pitchBend = 0;
    for (const stringNumber of [...this.voices.keys()]) this.stopString(stringNumber, 0.025);
  }

  dispose(): void {
    this.reset();
    const chain = this.toneChain;
    this.toneChain = null;
    if (!chain) return;
    chain.pickupLow.disconnect();
    chain.pickupHigh.disconnect();
    chain.tone.disconnect();
    chain.bus.disconnect();
  }

  private ensureToneChain(): ToneChain {
    if (this.toneChain) return this.toneChain;

    const context = this.audio.getContext();
    const pickupLow = context.createBiquadFilter();
    pickupLow.type = 'lowshelf';
    pickupLow.frequency.value = 420;

    const pickupHigh = context.createBiquadFilter();
    pickupHigh.type = 'highshelf';
    pickupHigh.frequency.value = 2600;

    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.48;

    const bus = this.audio.createBus();
    pickupLow.connect(pickupHigh).connect(tone).connect(bus.input);

    this.toneChain = {
      input: pickupLow,
      pickupLow,
      pickupHigh,
      tone,
      bus,
    };
    this.updateToneChain();
    return this.toneChain;
  }

  private updateToneChain(): void {
    const chain = this.toneChain;
    if (!chain) return;

    const context = this.audio.getContext();
    const now = context.currentTime;
    const pickupProfiles = [
      { low: 2.8, high: -4.2 },
      { low: 0.5, high: -1.0 },
      { low: -1.4, high: 3.6 },
    ] as const;
    const profile = pickupProfiles[this.pickup];
    const maxCutoff = Math.min(18000, context.sampleRate * 0.45);
    const cutoff = Math.min(maxCutoff, 900 + this.tone * this.tone * 16500);

    rampParam(chain.pickupLow.gain, profile.low, now, 0.025);
    rampParam(chain.pickupHigh.gain, profile.high, now, 0.025);
    rampParam(chain.tone.frequency, cutoff, now, 0.025);
  }

  private stopString(stringNumber: number, fadeSeconds: number): void {
    const state = this.voices.get(stringNumber);
    if (!state) return;
    this.voices.delete(stringNumber);
    state.voice?.stop(fadeSeconds);
  }

  private load(sampleSet: string, note: number): Promise<AudioBuffer | null> {
    const key = `${sampleSet}:${note}`;
    const existing = this.buffers.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await fetch(`${SAMPLE_ROOT}${sampleSet}-mp3/${midiFlatName(note)}.mp3`);
        if (!response.ok) return null;
        return await this.audio.decode(await response.arrayBuffer());
      } catch {
        return null;
      }
    })();
    this.buffers.set(key, promise);
    return promise;
  }
}

function midiFlatName(note: number): string {
  const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}

function pitchRate(value: number): number {
  return Math.pow(2, (clamp(value, -1, 1) * PITCH_BEND_SEMITONES) / 12);
}

function rampParam(param: AudioParam, value: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + Math.max(0, seconds));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
