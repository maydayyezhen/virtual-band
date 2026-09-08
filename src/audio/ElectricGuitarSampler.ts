import type { AudioBus, AudioEngine, AudioVoice } from './AudioEngine';
import {
  DEFAULT_ELECTRIC_GUITAR_PROGRAM,
  ELECTRIC_GUITAR_PROGRAM_IDS,
  ELECTRIC_GUITAR_PROGRAMS,
  getElectricGuitarProgram,
  type ElectricGuitarProgramId,
  type ElectricPickupPosition,
} from './ElectricGuitarProgram';
import type { ProgramToneBackend, ProgramToneNoteOptions } from './ProgramToneBackend';
import { fluidR3SamplePath, type SampleLibrary } from './SampleLibrary';

const DEFAULT_PRESET = ELECTRIC_GUITAR_PROGRAMS[DEFAULT_ELECTRIC_GUITAR_PROGRAM];
const PITCH_BEND_SEMITONES = 2;
const COMMON_NOTES = [40, 45, 50, 55, 59, 64, 67, 69, 71, 74, 76, 79, 83, 86] as const;

type VoiceBackend = 'mp3' | 'tone';
type GuitarGesture = 'gated' | 'strum';

interface VoiceState {
  voice: AudioVoice | null;
  released: boolean;
  backend: VoiceBackend;
}

interface ToneChain {
  input: BiquadFilterNode;
  pickupLow: BiquadFilterNode;
  pickupHigh: BiquadFilterNode;
  tone: BiquadFilterNode;
  bus: AudioBus;
}

const STRUM_PROFILE: Readonly<Record<
  ElectricGuitarProgramId,
  { ringSeconds: number; fadeSeconds: number }
>> = {
  26: { ringSeconds: 3.8, fadeSeconds: 0.15 },
  27: { ringSeconds: 4.2, fadeSeconds: 0.15 },
  28: { ringSeconds: 0.55, fadeSeconds: 0.06 },
  29: { ringSeconds: 4.8, fadeSeconds: 0.17 },
  30: { ringSeconds: 5.0, fadeSeconds: 0.17 },
  31: { ringSeconds: 2.8, fadeSeconds: 0.14 },
};

export class ElectricGuitarSampler {
  private readonly audio: AudioEngine;
  private readonly samples: SampleLibrary;
  private readonly toneBackend: ProgramToneBackend | null;
  private readonly voices = new Map<number, VoiceState>();
  private sustain = false;
  private volume = DEFAULT_PRESET.volume;
  private tone = DEFAULT_PRESET.tone;
  private pickup: ElectricPickupPosition = DEFAULT_PRESET.pickup;
  private programId: ElectricGuitarProgramId = DEFAULT_ELECTRIC_GUITAR_PROGRAM;
  private pitchBend = 0;
  private toneChain: ToneChain | null = null;

  constructor(
    audio: AudioEngine,
    samples: SampleLibrary,
    toneBackend: ProgramToneBackend | null = null,
  ) {
    this.audio = audio;
    this.samples = samples;
    this.toneBackend = toneBackend;
    this.toneBackend?.setProgram(this.programId, 0);
  }

  get program(): ElectricGuitarProgramId {
    return this.programId;
  }

  noteOn(
    stringNumber: number,
    note: number,
    velocity: number,
    gesture: GuitarGesture = 'gated',
  ): void {
    if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 6) return;
    if (!Number.isInteger(note) || note < 0 || note > 127) return;

    // Retriggering a physical string should mute its previous voice quickly;
    // otherwise long SF2 release tails stack under fast strums and repeated notes.
    this.stopString(stringNumber, 0.018);
    const preset = ELECTRIC_GUITAR_PROGRAMS[this.programId];
    const accentedVelocity = clamp01((velocity / 127) * preset.accent);
    const backendVelocity = Math.round(accentedVelocity * 127);
    const baseGain = Math.pow(accentedVelocity, 1.16) * 0.82;
    const chain = this.ensureToneChain();
    const toneOptions = gesture === 'strum'
      ? electricStrumToneOptions(this.programId, note, chain.input)
      : { destination: chain.input, gainScale: 0.82 };

    if (this.toneBackend?.noteOn(
      voiceId(stringNumber),
      note,
      backendVelocity,
      toneOptions,
    )) {
      this.voices.set(stringNumber, {
        voice: null,
        released: false,
        backend: 'tone',
      });
      return;
    }

    const state: VoiceState = {
      voice: null,
      released: false,
      backend: 'mp3',
    };
    this.voices.set(stringNumber, state);

    void this.load(preset.sampleSet, note).then((buffer) => {
      if (!buffer || this.voices.get(stringNumber) !== state) return;
      if (state.released && !this.sustain) {
        this.voices.delete(stringNumber);
        return;
      }

      const voice = this.audio.playBuffer(buffer, baseGain, undefined, chain.input);
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

    if (state.backend === 'tone') {
      this.voices.delete(stringNumber);
      this.toneBackend?.noteOff(voiceId(stringNumber));
      return;
    }

    if (!this.sustain) this.stopString(stringNumber, 0.10);
  }

  setProgram(value: number): boolean {
    const preset = getElectricGuitarProgram(value);
    if (!preset) return false;
    this.programId = preset.id;
    this.toneBackend?.setProgram(preset.id, 0);
    this.pickup = preset.pickup;
    this.tone = preset.tone;
    this.setVolume(preset.volume);
    this.updateToneChain();
    void this.preloadProgram(preset.id);
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
    this.toneBackend?.setPitchBend(value);
    const rate = pitchRate(value);
    for (const state of this.voices.values()) {
      if (state.backend === 'mp3') state.voice?.setPlaybackRate(rate, 0.018);
    }
    return true;
  }

  setSustain(pressed: boolean): void {
    if (this.sustain === pressed) return;
    this.sustain = pressed;
    this.toneBackend?.setSustain(pressed);
    if (pressed) return;
    for (const [stringNumber, state] of this.voices) {
      if (state.backend === 'mp3' && state.released) this.stopString(stringNumber, 0.11);
    }
  }

  setVolume(value: number): void {
    this.volume = clamp01(value);
    this.toneChain?.bus.setGain(this.volume, 0.025);
  }

  preloadCommon(): Promise<void> {
    return this.preloadProgram(this.programId);
  }

  async preloadProgram(value: number): Promise<void> {
    const preset = getElectricGuitarProgram(value);
    if (!preset) return;
    await this.samples.preload(COMMON_NOTES.map((note) => fluidR3SamplePath(preset.sampleSet, note)));
  }

  async preloadShowcase(): Promise<void> {
    await Promise.allSettled([
      this.toneBackend?.prepare() ?? Promise.resolve(false),
      ...ELECTRIC_GUITAR_PROGRAM_IDS.map((program) => this.preloadProgram(program)),
    ]);
  }

  reset(): void {
    this.sustain = false;
    this.pitchBend = 0;
    this.toneBackend?.reset();
    for (const stringNumber of [...this.voices.keys()]) this.stopString(stringNumber, 0.025);
  }

  dispose(): void {
    this.reset();
    this.toneBackend?.dispose();
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

    const bus = this.audio.createBus(this.volume);
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
    chain.bus.setGain(this.volume, 0.025);
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

function electricStrumToneOptions(
  program: ElectricGuitarProgramId,
  note: number,
  destination: AudioNode,
): ProgramToneNoteOptions {
  const profile = STRUM_PROFILE[program];
  const pitchScale = 2 ** ((60 - clamp(note, 40, 86)) / 84);
  return {
    destination,
    gainScale: 0.82,
    autoReleaseSeconds: clamp(profile.ringSeconds * pitchScale, 0.35, 6.0),
    autoReleaseFadeSeconds: profile.fadeSeconds,
  };
}

function voiceId(stringNumber: number): string {
  return `string:${stringNumber}`;
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
