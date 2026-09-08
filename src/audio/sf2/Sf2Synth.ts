import type { AudioBus, AudioEngine } from '../AudioEngine';
import type { ProgramToneNoteOptions } from '../ProgramToneBackend';
import type { Sf2BankLibrary } from './Sf2BankLibrary';
import {
  buildSf2VolumeEnvelopePlan,
  centibelsToGain,
  decayGainFactor,
  releaseDurationSeconds,
  SF2_SILENCE_GAIN,
} from './Sf2Envelope';
import { parseSf2, type Sf2PresetInfo, type Sf2Region, type Sf2SoundFont } from './Sf2Parser';

interface VoiceEnvelopeState {
  readonly startTime: number;
  readonly peakGain: number;
  readonly sustainGain: number;
  readonly sustainAttenuationCentibels: number;
  readonly attackSeconds: number;
  readonly holdSeconds: number;
  readonly decaySeconds: number;
}

interface ActiveVoice {
  readonly voiceKey: string;
  readonly note: number;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
  readonly releaseSeconds: number;
  readonly loopMode: number;
  readonly exclusiveClass: number;
  readonly basePlaybackRate: number;
  readonly envelope: VoiceEnvelopeState;
  keyReleased: boolean;
  stopped: boolean;
}

export interface Sf2RegionInspection {
  readonly sample: string;
  readonly keyRange: readonly [number, number];
  readonly velocityRange: readonly [number, number];
  readonly loopMode: number;
  readonly exclusiveClass: number;
  readonly loopStartSeconds: number;
  readonly loopEndSeconds: number;
  readonly attackSeconds: number;
  readonly holdSeconds: number;
  readonly decaySeconds: number;
  readonly sustainAttenuationCentibels: number;
  readonly releaseSeconds: number;
  readonly keynumToVolEnvHold: number;
  readonly keynumToVolEnvDecay: number;
}

export class Sf2Synth {
  private readonly audio: AudioEngine;
  private readonly bus: AudioBus;
  private readonly banks: Sf2BankLibrary | null;
  private readonly audioBuffers = new Map<string, AudioBuffer>();
  private readonly voices = new Map<string, Set<ActiveVoice>>();
  private font: Sf2SoundFont | null = null;
  private bank = 0;
  private program = 0;
  private sustain = false;
  private pitchBend = 0;
  private pitchBendSemitones = 2;
  private loadedBytes = 0;

  constructor(audio: AudioEngine, banks: Sf2BankLibrary | null = null) {
    this.audio = audio;
    this.banks = banks;
    this.bus = audio.createBus(0.9);
  }

  get isLoaded(): boolean {
    return this.font !== null;
  }

  get byteLength(): number {
    return this.loadedBytes;
  }

  async load(url = '/soundfonts/FluidR3_GM.sf2'): Promise<Sf2SoundFont> {
    let font: Sf2SoundFont;
    let byteLength: number;

    if (this.banks) {
      ({ font, byteLength } = await this.banks.load(url));
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`SF2 load failed: HTTP ${response.status} for ${url}`);
      const data = await response.arrayBuffer();
      font = parseSf2(data);
      byteLength = data.byteLength;
    }

    this.allNotesOff(0.02);
    this.font = font;
    this.loadedBytes = byteLength;
    this.audioBuffers.clear();
    return font;
  }

  listPresets(): Sf2PresetInfo[] {
    return this.requireFont().listPresets();
  }

  programChange(program: number, bank = this.bank): boolean {
    if (!Number.isInteger(program) || program < 0 || program > 127) return false;
    if (!Number.isInteger(bank) || bank < 0 || bank > 16383) return false;
    this.program = program;
    this.bank = bank;
    return true;
  }

  setOutputGain(value: number, rampSeconds = 0.025): void {
    this.bus.setGain(clamp(value, 0, 1), Math.max(0, rampSeconds));
  }

  setPitchBend(value: number, semitones = this.pitchBendSemitones): boolean {
    if (!Number.isFinite(value) || value < -1 || value > 1) return false;
    if (!Number.isFinite(semitones) || semitones <= 0 || semitones > 24) return false;
    this.pitchBend = value;
    this.pitchBendSemitones = semitones;
    const ratio = 2 ** ((value * semitones) / 12);
    const now = this.audio.getContext().currentTime;
    for (const voiceSet of this.voices.values()) {
      for (const voice of voiceSet) {
        voice.source.playbackRate.cancelScheduledValues(now);
        voice.source.playbackRate.setValueAtTime(voice.source.playbackRate.value, now);
        voice.source.playbackRate.linearRampToValueAtTime(voice.basePlaybackRate * ratio, now + 0.018);
      }
    }
    return true;
  }

  setSustain(pressed: boolean): void {
    if (this.sustain === pressed) return;
    this.sustain = pressed;
    if (pressed) return;
    for (const voiceSet of this.voices.values()) {
      for (const voice of [...voiceSet]) {
        if (voice.keyReleased) this.releaseVoice(voice);
      }
    }
  }

  noteOn(note: number, velocity = 100): number {
    const midi = clampMidi(note);
    const vel = clampMidi(velocity);
    if (vel === 0) {
      this.noteOff(midi);
      return 0;
    }
    return this.noteOnVoice(midiVoiceKey(midi), midi, vel);
  }

  noteOff(note: number, forcedReleaseSeconds?: number): void {
    this.noteOffVoice(midiVoiceKey(clampMidi(note)), forcedReleaseSeconds);
  }

  /**
   * Starts a note under a caller-owned voice key. This is useful for physical
   * instruments where two strings can legitimately resolve to the same MIDI note.
   * The normal MIDI noteOn/noteOff API remains note-keyed.
   */
  noteOnVoice(
    voiceKey: string,
    note: number,
    velocity = 100,
    options?: ProgramToneNoteOptions,
  ): number {
    const font = this.requireFont();
    const key = normalizeVoiceKey(voiceKey);
    const midi = clampMidi(note);
    const vel = clampMidi(velocity);
    if (vel === 0) {
      this.noteOffVoice(key);
      return 0;
    }

    const regions = font.resolveRegions(this.bank, this.program, midi, vel);
    if (regions.length === 0) return 0;

    void this.audio.resume();
    this.noteOffVoice(key, 0.015);
    this.chokeExclusiveClasses(regions);

    const voiceSet = new Set<ActiveVoice>();
    this.voices.set(key, voiceSet);
    for (const region of regions) {
      const voice = this.startRegionVoice(key, region, midi, vel, options);
      if (voice) voiceSet.add(voice);
    }
    if (voiceSet.size === 0) this.voices.delete(key);
    return voiceSet.size;
  }

  noteOffVoice(voiceKey: string, forcedReleaseSeconds?: number): void {
    const key = normalizeVoiceKey(voiceKey);
    const voiceSet = this.voices.get(key);
    if (!voiceSet) return;
    for (const voice of [...voiceSet]) {
      voice.keyReleased = true;
      if (!this.sustain || forcedReleaseSeconds !== undefined) {
        this.releaseVoice(voice, forcedReleaseSeconds);
      }
    }
  }

  allNotesOff(releaseSeconds = 0.03): void {
    for (const voiceSet of this.voices.values()) {
      for (const voice of [...voiceSet]) this.releaseVoice(voice, releaseSeconds);
    }
    this.voices.clear();
    this.sustain = false;
  }

  inspect(note: number, velocity = 100, program = this.program, bank = this.bank): Sf2RegionInspection[] {
    const midi = clampMidi(note);
    const regions = this.requireFont().resolveRegions(bank, program, midi, clampMidi(velocity));
    return regions.map((region) => {
      const envelope = buildSf2VolumeEnvelopePlan(region, midi);
      return {
        sample: region.sample.name,
        keyRange: region.keyRange,
        velocityRange: region.velocityRange,
        loopMode: region.sampleModes,
        exclusiveClass: region.exclusiveClass,
        loopStartSeconds: Math.max(0, (region.loopStart - region.start) / region.sample.sampleRate),
        loopEndSeconds: Math.max(0, (region.loopEnd - region.start) / region.sample.sampleRate),
        attackSeconds: envelope.attackSeconds,
        holdSeconds: envelope.holdSeconds,
        decaySeconds: envelope.decaySeconds,
        sustainAttenuationCentibels: envelope.sustainAttenuationCentibels,
        releaseSeconds: envelope.releaseSecondsFromFullScale,
        keynumToVolEnvHold: region.keynumToVolEnvHold,
        keynumToVolEnvDecay: region.keynumToVolEnvDecay,
      };
    });
  }

  dispose(): void {
    this.allNotesOff(0.01);
    this.audioBuffers.clear();
    this.font = null;
    this.loadedBytes = 0;
    this.bus.disconnect();
  }

  private startRegionVoice(
    voiceKey: string,
    region: Sf2Region,
    note: number,
    velocity: number,
    options?: ProgramToneNoteOptions,
  ): ActiveVoice | null {
    const context = this.audio.getContext();
    const buffer = this.getAudioBuffer(region);
    if (!buffer) return null;

    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const now = context.currentTime;
    const basePlaybackRate = playbackRateForRegion(region, note);
    const pitchBendRatio = 2 ** ((this.pitchBend * this.pitchBendSemitones) / 12);
    const loopMode = region.sampleModes & 0x3;

    source.buffer = buffer;
    source.playbackRate.value = basePlaybackRate * pitchBendRatio;
    source.loop = loopMode === 1 || loopMode === 3;
    if (source.loop && region.loopEnd > region.loopStart + 1) {
      source.loopStart = (region.loopStart - region.start) / region.sample.sampleRate;
      source.loopEnd = (region.loopEnd - region.start) / region.sample.sampleRate;
    } else {
      source.loop = false;
    }

    const velocityGain = Math.pow(velocity / 127, 1.35);
    const attenuationGain = centibelsToGain(Math.max(0, region.initialAttenuation));
    const gainScale = clamp(options?.gainScale ?? 1, 0, 4);
    const peakGain = Math.max(1e-8, Math.min(1, velocityGain * attenuationGain * gainScale));
    const envelopePlan = buildSf2VolumeEnvelopePlan(region, note);
    const sustainGain = Math.max(
      peakGain * SF2_SILENCE_GAIN,
      peakGain * envelopePlan.sustainGainFactor,
    );
    const envelope: VoiceEnvelopeState = {
      startTime: now,
      peakGain,
      sustainGain,
      sustainAttenuationCentibels: envelopePlan.sustainAttenuationCentibels,
      attackSeconds: envelopePlan.attackSeconds,
      holdSeconds: envelopePlan.holdSeconds,
      decaySeconds: envelopePlan.decaySeconds,
    };

    scheduleEnvelope(gain.gain, envelope);
    panner.pan.value = clamp(region.pan / 500, -1, 1);
    source.connect(gain).connect(panner).connect(options?.destination ?? this.bus.input);

    const voice: ActiveVoice = {
      voiceKey,
      note,
      source,
      gain,
      panner,
      releaseSeconds: envelopePlan.releaseSecondsFromFullScale,
      loopMode,
      exclusiveClass: region.exclusiveClass,
      basePlaybackRate,
      envelope,
      keyReleased: false,
      stopped: false,
    };

    source.addEventListener('ended', () => this.cleanupVoice(voice), { once: true });
    source.start(now);
    return voice;
  }

  private chokeExclusiveClasses(regions: readonly Sf2Region[]): void {
    const classes = new Set(
      regions.map((region) => region.exclusiveClass).filter((value) => value > 0),
    );
    if (classes.size === 0) return;

    for (const voiceSet of this.voices.values()) {
      for (const voice of [...voiceSet]) {
        if (classes.has(voice.exclusiveClass)) this.releaseVoice(voice, 0.008);
      }
    }
  }

  private releaseVoice(voice: ActiveVoice, forcedReleaseSeconds?: number): void {
    if (voice.stopped) return;
    voice.stopped = true;
    const context = this.audio.getContext();
    const now = context.currentTime;
    const currentGain = envelopeGainAt(voice.envelope, now);
    const baseRelease = clamp(forcedReleaseSeconds ?? voice.releaseSeconds, 0.005, 30);
    const release = forcedReleaseSeconds !== undefined
      ? baseRelease
      : clamp(
        releaseDurationSeconds(baseRelease, currentGain, voice.envelope.peakGain),
        0.005,
        30,
      );

    if (voice.loopMode === 3) voice.source.loop = false;

    // SoundFont volume decay/release is linear in envelope attenuation, which
    // means exponential in Web Audio gain. Reconstruct the exact audible level
    // at Note Off, then ramp by constant dB/time down to the -100 dB SF2 floor.
    const floorGain = Math.max(1e-8, voice.envelope.peakGain * SF2_SILENCE_GAIN);
    voice.gain.gain.cancelScheduledValues(now);
    if (currentGain > floorGain * 1.001 && release > 0.001) {
      voice.gain.gain.setValueAtTime(Math.max(currentGain, floorGain), now);
      voice.gain.gain.exponentialRampToValueAtTime(floorGain, now + release);
      voice.gain.gain.setValueAtTime(0, now + release + 0.001);
    } else {
      voice.gain.gain.setValueAtTime(0, now);
    }

    try {
      voice.source.stop(now + release + 0.006);
    } catch {}
  }

  private cleanupVoice(voice: ActiveVoice): void {
    const voiceSet = this.voices.get(voice.voiceKey);
    voiceSet?.delete(voice);
    if (voiceSet?.size === 0) this.voices.delete(voice.voiceKey);
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.panner.disconnect();
  }

  private getAudioBuffer(region: Sf2Region): AudioBuffer | null {
    const font = this.font;
    if (!font) return null;
    const key = `${region.sampleId}:${region.start}:${region.end}`;
    const cached = this.audioBuffers.get(key);
    if (cached) return cached;

    const pcm = font.getPcm16(region.start, region.end);
    if (pcm.length === 0 || region.sample.sampleRate <= 0) return null;

    const buffer = this.audio.getContext().createBuffer(1, pcm.length, region.sample.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index += 1) channel[index] = pcm[index] / 32768;
    this.audioBuffers.set(key, buffer);
    return buffer;
  }

  private requireFont(): Sf2SoundFont {
    if (!this.font) throw new Error('SF2 is not loaded. Prepare the tone backend first.');
    return this.font;
  }
}

function midiVoiceKey(note: number): string {
  return `midi:${note}`;
}

function normalizeVoiceKey(value: string): string {
  const key = value.trim();
  if (!key) throw new Error('SF2 voice key must not be empty');
  return key;
}

function playbackRateForRegion(region: Sf2Region, note: number): number {
  const keyDistanceCents = (note - region.rootKey) * region.scaleTuning;
  const tuningCents = region.coarseTune * 100 + region.fineTune + region.sample.pitchCorrection;
  return 2 ** ((keyDistanceCents + tuningCents) / 1200);
}

function scheduleEnvelope(param: AudioParam, envelope: VoiceEnvelopeState): void {
  const {
    startTime,
    peakGain,
    sustainGain,
    sustainAttenuationCentibels,
    attackSeconds,
    holdSeconds,
    decaySeconds,
  } = envelope;

  param.cancelScheduledValues(startTime);
  if (attackSeconds > 0.001) {
    // SF2 volume attack is convex in envelope/dB space but nominally linear
    // in audible amplitude, so a linear GainNode attack is appropriate.
    param.setValueAtTime(0, startTime);
    param.linearRampToValueAtTime(peakGain, startTime + attackSeconds);
  } else {
    param.setValueAtTime(peakGain, startTime);
  }

  const holdEnd = startTime + attackSeconds + holdSeconds;
  param.setValueAtTime(peakGain, holdEnd);
  if (decaySeconds > 0.001 && sustainAttenuationCentibels > 0) {
    param.exponentialRampToValueAtTime(sustainGain, holdEnd + decaySeconds);
  } else {
    param.setValueAtTime(sustainGain, holdEnd);
  }
}

function envelopeGainAt(envelope: VoiceEnvelopeState, time: number): number {
  const elapsed = Math.max(0, time - envelope.startTime);
  const attackEnd = envelope.attackSeconds;
  if (envelope.attackSeconds > 0.001 && elapsed < attackEnd) {
    const t = clamp(elapsed / envelope.attackSeconds, 0, 1);
    return envelope.peakGain * t;
  }

  const holdEnd = attackEnd + envelope.holdSeconds;
  if (elapsed < holdEnd) return envelope.peakGain;

  const decayEnd = holdEnd + envelope.decaySeconds;
  if (envelope.decaySeconds > 0.001 && elapsed < decayEnd) {
    const t = clamp((elapsed - holdEnd) / envelope.decaySeconds, 0, 1);
    return envelope.peakGain * decayGainFactor(envelope.sustainAttenuationCentibels, t);
  }

  return envelope.sustainGain;
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
