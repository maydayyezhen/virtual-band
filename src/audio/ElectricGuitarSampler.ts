import type { AudioBus, AudioEngine, AudioVoice } from './AudioEngine';
import { mixGain } from './AudioMixProfile';
import {
  DEFAULT_ELECTRIC_GUITAR_PROGRAM,
  ELECTRIC_GUITAR_PROGRAM_IDS,
  ELECTRIC_GUITAR_PROGRAMS,
  getElectricGuitarProgram,
  type ElectricGuitarProgramId,
  type ElectricPickupPosition,
} from './ElectricGuitarProgram';
import type {
  ProgramToneBackend,
  ProgramToneNoteOptions,
  ProgramTonePerformanceProfile,
} from './ProgramToneBackend';
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
  readonly program: ElectricGuitarProgramId;
  input: BiquadFilterNode;
  pickupLow: BiquadFilterNode;
  pickupHigh: BiquadFilterNode;
  toneFilter: BiquadFilterNode;
  bus: AudioBus;
  pickup: ElectricPickupPosition;
  tone: number;
  volume: number;
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

const PERFORMANCE_PROFILE: Readonly<Record<
  ElectricGuitarProgramId,
  ProgramTonePerformanceProfile
>> = {
  26: { brightnessCents: -420, velocityToFilterCents: -720, filterEnvelopeScale: 0.9 },
  27: { brightnessCents: -40, velocityToFilterCents: -850, filterEnvelopeScale: 1 },
  28: { brightnessCents: -880, velocityToFilterCents: -480, filterEnvelopeScale: 0.65 },
  29: { brightnessCents: -140, velocityToFilterCents: -650, filterEnvelopeScale: 1.05 },
  30: { brightnessCents: -240, velocityToFilterCents: -520, filterEnvelopeScale: 1.05 },
  31: { brightnessCents: 260, velocityToFilterCents: -700, filterEnvelopeScale: 1.2 },
};

export class ElectricGuitarSampler {
  private readonly audio: AudioEngine;
  private readonly samples: SampleLibrary;
  private readonly toneBackend: ProgramToneBackend | null;
  private readonly voices = new Map<number, VoiceState>();
  private readonly toneChains = new Map<ElectricGuitarProgramId, ToneChain>();
  private sustain = false;
  private volume = DEFAULT_PRESET.volume;
  private tone = DEFAULT_PRESET.tone;
  private pickup: ElectricPickupPosition = DEFAULT_PRESET.pickup;
  private programId: ElectricGuitarProgramId = DEFAULT_ELECTRIC_GUITAR_PROGRAM;
  private pitchBend = 0;

  constructor(
    audio: AudioEngine,
    samples: SampleLibrary,
    toneBackend: ProgramToneBackend | null = null,
  ) {
    this.audio = audio;
    this.samples = samples;
    this.toneBackend = toneBackend;
    this.toneBackend?.setProgram(this.programId, 0);
    this.toneBackend?.setPerformanceProfile(PERFORMANCE_PROFILE[this.programId]);
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
    this.toneBackend?.setPerformanceProfile(PERFORMANCE_PROFILE[preset.id]);

    const existingChain = this.toneChains.get(preset.id);
    if (existingChain) {
      // Program changes only select the processing chain for future notes. Existing
      // tails keep flowing through the chain they were born into, so switching
      // patches cannot recolor or re-level notes that are already ringing.
      this.pickup = existingChain.pickup;
      this.tone = existingChain.tone;
      this.volume = existingChain.volume;
    } else {
      this.pickup = preset.pickup;
      this.tone = preset.tone;
      this.volume = preset.volume;
    }

    void this.preloadProgram(preset.id);
    return true;
  }

  setPickup(value: number): boolean {
    if (!Number.isInteger(value) || value < 0 || value > 2) return false;
    this.pickup = value as ElectricPickupPosition;
    const chain = this.toneChains.get(this.programId);
    if (chain) {
      chain.pickup = this.pickup;
      this.updateToneChain(chain);
    }
    return true;
  }

  setTone(value: number): boolean {
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
    this.tone = value;
    const chain = this.toneChains.get(this.programId);
    if (chain) {
      chain.tone = this.tone;
      this.updateToneChain(chain);
    }
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
    const chain = this.toneChains.get(this.programId);
    if (chain) {
      chain.volume = this.volume;
      chain.bus.setGain(this.outputGain(chain), 0.025);
    }
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
    for (const chain of this.toneChains.values()) this.disposeToneChain(chain);
    this.toneChains.clear();
  }

  private outputGain(chain: ToneChain): number {
    return chain.volume * mixGain('electric', chain.program);
  }

  private ensureToneChain(): ToneChain {
    const existing = this.toneChains.get(this.programId);
    if (existing) return existing;

    const context = this.audio.getContext();
    const pickupLow = context.createBiquadFilter();
    pickupLow.type = 'lowshelf';
    pickupLow.frequency.value = 420;

    const pickupHigh = context.createBiquadFilter();
    pickupHigh.type = 'highshelf';
    pickupHigh.frequency.value = 2600;

    const toneFilter = context.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.Q.value = 0.48;

    const chain: ToneChain = {
      program: this.programId,
      input: pickupLow,
      pickupLow,
      pickupHigh,
      toneFilter,
      bus: this.audio.createBus(1),
      pickup: this.pickup,
      tone: this.tone,
      volume: this.volume,
    };
    pickupLow.connect(pickupHigh).connect(toneFilter).connect(chain.bus.input);

    this.toneChains.set(this.programId, chain);
    this.updateToneChain(chain);
    return chain;
  }

  private updateToneChain(chain: ToneChain): void {
    const context = this.audio.getContext();
    const now = context.currentTime;
    const pickupProfiles = [
      { low: 2.8, high: -4.2 },
      { low: 0.5, high: -1.0 },
      { low: -1.4, high: 3.6 },
    ] as const;
    const profile = pickupProfiles[chain.pickup];
    const maxCutoff = Math.min(18000, context.sampleRate * 0.45);
    const cutoff = Math.min(maxCutoff, 900 + chain.tone * chain.tone * 16500);

    rampParam(chain.pickupLow.gain, profile.low, now, 0.025);
    rampParam(chain.pickupHigh.gain, profile.high, now, 0.025);
    rampParam(chain.toneFilter.frequency, cutoff, now, 0.025);
    chain.bus.setGain(this.outputGain(chain), 0.025);
  }

  private disposeToneChain(chain: ToneChain): void {
    chain.pickupLow.disconnect();
    chain.pickupHigh.disconnect();
    chain.toneFilter.disconnect();
    chain.bus.disconnect();
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
