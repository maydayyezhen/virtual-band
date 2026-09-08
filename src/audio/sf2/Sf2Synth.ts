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
import {
  buildSf2FilterPlan,
  releaseSf2Filter,
  scheduleSf2Filter,
  type Sf2FilterPlan,
} from './Sf2Filter';
import {
  buildSf2LfoPlan,
  buildSf2ModEnvelopePlan,
  releaseSf2ModEnvelope,
  scheduleSf2ModEnvelope,
  startSf2Lfos,
  velocityAttenuationCentibels,
  type Sf2LfoPlan,
  type Sf2LfoRuntime,
  type Sf2ModEnvelopePlan,
} from './Sf2Modulation';
import { parseSf2, type Sf2PresetInfo, type Sf2Region, type Sf2SoundFont } from './Sf2Parser';

interface VoiceEnvelopeState {
  readonly startTime: number;
  readonly peakGain: number;
  readonly sustainGain: number;
  readonly sustainAttenuationCentibels: number;
  readonly delaySeconds: number;
  readonly attackSeconds: number;
  readonly holdSeconds: number;
  readonly decaySeconds: number;
}

interface ActiveVoice {
  readonly voiceKey: string;
  readonly note: number;
  readonly source: AudioBufferSourceNode;
  readonly filter: BiquadFilterNode;
  readonly filterPlan: Sf2FilterPlan;
  readonly lfoGain: GainNode;
  readonly lfoPlan: Sf2LfoPlan;
  readonly lfos: Sf2LfoRuntime;
  readonly modEnvelopePlan: Sf2ModEnvelopePlan;
  readonly modEnvToPitchCents: number;
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
  readonly delaySeconds: number;
  readonly attackSeconds: number;
  readonly holdSeconds: number;
  readonly decaySeconds: number;
  readonly sustainAttenuationCentibels: number;
  readonly releaseSeconds: number;
  readonly velocityAttenuationCentibels: number;
  readonly keynumToVolEnvHold: number;
  readonly keynumToVolEnvDecay: number;
  readonly filterCutoffHz: number;
  readonly filterQDb: number;
  readonly modEnvToPitch: number;
  readonly modEnvToFilterFc: number;
  readonly modLfoToPitch: number;
  readonly vibLfoToPitch: number;
  readonly modLfoToFilterFc: number;
  readonly modLfoToVolume: number;
  readonly modLfoDelaySeconds: number;
  readonly modLfoFrequencyHz: number;
  readonly vibLfoDelaySeconds: number;
  readonly vibLfoFrequencyHz: number;
  readonly filterEnvelopeDelaySeconds: number;
  readonly filterEnvelopeAttackSeconds: number;
  readonly filterEnvelopeHoldSeconds: number;
  readonly filterEnvelopeDecaySeconds: number;
  readonly filterEnvelopeSustainLevel: number;
  readonly filterEnvelopeReleaseSeconds: number;
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
    const vel = clampMidi(velocity);
    const context = this.audio.getContext();
    const regions = this.requireFont().resolveRegions(bank, program, midi, vel);
    return regions.map((region) => {
      const envelope = buildSf2VolumeEnvelopePlan(region, midi);
      const filter = buildSf2FilterPlan(region, midi, vel, context.sampleRate);
      const lfo = buildSf2LfoPlan(region);
      return {
        sample: region.sample.name,
        keyRange: region.keyRange,
        velocityRange: region.velocityRange,
        loopMode: region.sampleModes,
        exclusiveClass: region.exclusiveClass,
        loopStartSeconds: Math.max(0, (region.loopStart - region.start) / region.sample.sampleRate),
        loopEndSeconds: Math.max(0, (region.loopEnd - region.start) / region.sample.sampleRate),
        delaySeconds: envelope.delaySeconds,
        attackSeconds: envelope.attackSeconds,
        holdSeconds: envelope.holdSeconds,
        decaySeconds: envelope.decaySeconds,
        sustainAttenuationCentibels: envelope.sustainAttenuationCentibels,
        releaseSeconds: envelope.releaseSecondsFromFullScale,
        velocityAttenuationCentibels: velocityAttenuationCentibels(vel),
        keynumToVolEnvHold: region.keynumToVolEnvHold,
        keynumToVolEnvDecay: region.keynumToVolEnvDecay,
        filterCutoffHz: filter.baseCutoffHz,
        filterQDb: filter.resonanceDb,
        modEnvToPitch: region.modEnvToPitch,
        modEnvToFilterFc: region.modEnvToFilterFc,
        modLfoToPitch: lfo.modToPitchCents,
        vibLfoToPitch: lfo.vibToPitchCents,
        modLfoToFilterFc: lfo.modToFilterCents,
        modLfoToVolume: lfo.modToVolumeCentibels,
        modLfoDelaySeconds: lfo.modDelaySeconds,
        modLfoFrequencyHz: lfo.modFrequencyHz,
        vibLfoDelaySeconds: lfo.vibDelaySeconds,
        vibLfoFrequencyHz: lfo.vibFrequencyHz,
        filterEnvelopeDelaySeconds: filter.envelope.delaySeconds,
        filterEnvelopeAttackSeconds: filter.envelope.attackSeconds,
        filterEnvelopeHoldSeconds: filter.envelope.holdSeconds,
        filterEnvelopeDecaySeconds: filter.envelope.decaySeconds,
        filterEnvelopeSustainLevel: filter.envelope.sustainLevel,
        filterEnvelopeReleaseSeconds: filter.envelope.releaseSeconds,
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
    const filter = context.createBiquadFilter();
    const lfoGain = context.createGain();
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

    const velocityAttenuation = velocityAttenuationCentibels(velocity);
    const attenuationGain = centibelsToGain(
      clamp(region.initialAttenuation + velocityAttenuation, 0, 1440),
    );
    const gainScale = clamp(options?.gainScale ?? 1, 0, 4);
    const peakGain = Math.max(1e-8, Math.min(1, attenuationGain * gainScale));
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
      delaySeconds: envelopePlan.delaySeconds,
      attackSeconds: envelopePlan.attackSeconds,
      holdSeconds: envelopePlan.holdSeconds,
      decaySeconds: envelopePlan.decaySeconds,
    };
    const filterPlan = buildSf2FilterPlan(region, note, velocity, context.sampleRate, options);
    const modEnvelopePlan = buildSf2ModEnvelopePlan(region, note);
    const lfoPlan = buildSf2LfoPlan(region);

    scheduleEnvelope(gain.gain, envelope);
    scheduleSf2Filter(filter, filterPlan, now);
    scheduleSf2ModEnvelope(source.detune, modEnvelopePlan, region.modEnvToPitch, now, 0);
    panner.pan.value = clamp(region.pan / 500, -1, 1);
    source.connect(filter).connect(lfoGain).connect(gain).connect(panner)
      .connect(options?.destination ?? this.bus.input);
    const lfos = startSf2Lfos(context, source, filter, lfoGain, lfoPlan, now);

    const voice: ActiveVoice = {
      voiceKey,
      note,
      source,
      filter,
      filterPlan,
      lfoGain,
      lfoPlan,
      lfos,
      modEnvelopePlan,
      modEnvToPitchCents: region.modEnvToPitch,
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
    releaseSf2Filter(voice.filter, voice.filterPlan, voice.envelope.startTime, now, forcedReleaseSeconds);
    releaseSf2ModEnvelope(
      voice.source.detune,
      voice.modEnvelopePlan,
      voice.modEnvToPitchCents,
      voice.envelope.startTime,
      now,
      forcedReleaseSeconds,
      0,
    );

    const floorGain = Math.max(1e-8, voice.envelope.peakGain * SF2_SILENCE_GAIN);
    voice.gain.gain.cancelScheduledValues(now);
    if (currentGain > floorGain * 1.001 && release > 0.001) {
      voice.gain.gain.setValueAtTime(Math.max(currentGain, floorGain), now);
      voice.gain.gain.exponentialRampToValueAtTime(floorGain, now + release);
      voice.gain.gain.setValueAtTime(0, now + release + 0.001);
    } else {
      voice.gain.gain.setValueAtTime(0, now);
    }

    const stopTime = now + release + 0.006;
    voice.lfos.stop(stopTime);
    try { voice.source.stop(stopTime); } catch {}
  }

  private cleanupVoice(voice: ActiveVoice): void {
    const voiceSet = this.voices.get(voice.voiceKey);
    voiceSet?.delete(voice);
    if (voiceSet?.size === 0) this.voices.delete(voice.voiceKey);
    voice.lfos.disconnect();
    voice.source.disconnect();
    voice.filter.disconnect();
    voice.lfoGain.disconnect();
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
    delaySeconds,
    attackSeconds,
    holdSeconds,
    decaySeconds,
  } = envelope;

  const attackStart = startTime + delaySeconds;
  const attackEnd = attackStart + attackSeconds;
  const holdEnd = attackEnd + holdSeconds;

  param.cancelScheduledValues(startTime);
  param.setValueAtTime(0, startTime);
  if (delaySeconds > 0.001) param.setValueAtTime(0, attackStart);

  if (attackSeconds > 0.001) {
    param.linearRampToValueAtTime(peakGain, attackEnd);
  } else {
    param.setValueAtTime(peakGain, attackStart);
  }

  param.setValueAtTime(peakGain, holdEnd);
  if (decaySeconds > 0.001 && sustainAttenuationCentibels > 0) {
    param.exponentialRampToValueAtTime(sustainGain, holdEnd + decaySeconds);
  } else {
    param.setValueAtTime(sustainGain, holdEnd);
  }
}

function envelopeGainAt(envelope: VoiceEnvelopeState, time: number): number {
  const elapsed = Math.max(0, time - envelope.startTime);
  if (elapsed < envelope.delaySeconds) return 0;

  const afterDelay = elapsed - envelope.delaySeconds;
  if (envelope.attackSeconds > 0.001 && afterDelay < envelope.attackSeconds) {
    const t = clamp(afterDelay / envelope.attackSeconds, 0, 1);
    return envelope.peakGain * t;
  }

  const holdEnd = envelope.attackSeconds + envelope.holdSeconds;
  if (afterDelay < holdEnd) return envelope.peakGain;

  const decayEnd = holdEnd + envelope.decaySeconds;
  if (envelope.decaySeconds > 0.001 && afterDelay < decayEnd) {
    const t = clamp((afterDelay - holdEnd) / envelope.decaySeconds, 0, 1);
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
