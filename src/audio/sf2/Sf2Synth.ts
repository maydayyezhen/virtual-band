import type { AudioBus, AudioEngine } from '../AudioEngine';
import { parseSf2, type Sf2PresetInfo, type Sf2Region, type Sf2SoundFont } from './Sf2Parser';

interface ActiveVoice {
  readonly voiceKey: string;
  readonly note: number;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
  readonly releaseSeconds: number;
  readonly loopMode: number;
  readonly basePlaybackRate: number;
  keyReleased: boolean;
  stopped: boolean;
}

export interface Sf2RegionInspection {
  readonly sample: string;
  readonly keyRange: readonly [number, number];
  readonly velocityRange: readonly [number, number];
  readonly loopMode: number;
  readonly loopStartSeconds: number;
  readonly loopEndSeconds: number;
  readonly attackSeconds: number;
  readonly decaySeconds: number;
  readonly releaseSeconds: number;
}

export class Sf2Synth {
  private readonly audio: AudioEngine;
  private readonly bus: AudioBus;
  private readonly audioBuffers = new Map<string, AudioBuffer>();
  private readonly voices = new Map<string, Set<ActiveVoice>>();
  private font: Sf2SoundFont | null = null;
  private bank = 0;
  private program = 0;
  private sustain = false;
  private pitchBend = 0;
  private pitchBendSemitones = 2;
  private loadedBytes = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.bus = audio.createBus(0.9);
  }

  get isLoaded(): boolean {
    return this.font !== null;
  }

  get byteLength(): number {
    return this.loadedBytes;
  }

  async load(url = '/soundfonts/FluidR3_GM.sf2'): Promise<Sf2SoundFont> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SF2 load failed: HTTP ${response.status} for ${url}`);
    const data = await response.arrayBuffer();
    const font = parseSf2(data);
    this.allNotesOff(0.02);
    this.font = font;
    this.loadedBytes = data.byteLength;
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
  noteOnVoice(voiceKey: string, note: number, velocity = 100): number {
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

    const voiceSet = new Set<ActiveVoice>();
    this.voices.set(key, voiceSet);
    for (const region of regions) {
      const voice = this.startRegionVoice(key, region, midi, vel);
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
    const regions = this.requireFont().resolveRegions(bank, program, clampMidi(note), clampMidi(velocity));
    return regions.map((region) => ({
      sample: region.sample.name,
      keyRange: region.keyRange,
      velocityRange: region.velocityRange,
      loopMode: region.sampleModes,
      loopStartSeconds: Math.max(0, (region.loopStart - region.start) / region.sample.sampleRate),
      loopEndSeconds: Math.max(0, (region.loopEnd - region.start) / region.sample.sampleRate),
      attackSeconds: timecentsToSeconds(region.attackVolEnv),
      decaySeconds: timecentsToSeconds(region.decayVolEnv),
      releaseSeconds: timecentsToSeconds(region.releaseVolEnv),
    }));
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
    const peakGain = Math.min(1, velocityGain * attenuationGain);
    const sustainGain = peakGain * centibelsToGain(Math.max(0, region.sustainVolEnv));
    const attack = timecentsToSeconds(region.attackVolEnv);
    const hold = timecentsToSeconds(region.holdVolEnv);
    const decay = timecentsToSeconds(region.decayVolEnv);
    const release = timecentsToSeconds(region.releaseVolEnv);

    scheduleEnvelope(gain.gain, now, peakGain, sustainGain, attack, hold, decay);
    panner.pan.value = clamp(region.pan / 500, -1, 1);
    source.connect(gain).connect(panner).connect(this.bus.input);

    const voice: ActiveVoice = {
      voiceKey,
      note,
      source,
      gain,
      panner,
      releaseSeconds: release,
      loopMode,
      basePlaybackRate,
      keyReleased: false,
      stopped: false,
    };

    source.addEventListener('ended', () => this.cleanupVoice(voice), { once: true });
    source.start(now);
    return voice;
  }

  private releaseVoice(voice: ActiveVoice, forcedReleaseSeconds?: number): void {
    if (voice.stopped) return;
    voice.stopped = true;
    const context = this.audio.getContext();
    const now = context.currentTime;
    const release = clamp(forcedReleaseSeconds ?? voice.releaseSeconds, 0.005, 30);

    if (voice.loopMode === 3) voice.source.loop = false;
    holdAudioParam(voice.gain.gain, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + release);
    try {
      voice.source.stop(now + release + 0.025);
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
    if (!this.font) throw new Error('SF2 is not loaded. Run sf2Experiment.load() first.');
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

function scheduleEnvelope(
  param: AudioParam,
  now: number,
  peakGain: number,
  sustainGain: number,
  attack: number,
  hold: number,
  decay: number,
): void {
  param.cancelScheduledValues(now);
  if (attack > 0.001) {
    param.setValueAtTime(0.000001, now);
    param.linearRampToValueAtTime(peakGain, now + attack);
  } else {
    param.setValueAtTime(peakGain, now);
  }

  const holdEnd = now + attack + hold;
  param.setValueAtTime(peakGain, holdEnd);
  if (decay > 0.001) param.linearRampToValueAtTime(sustainGain, holdEnd + decay);
  else param.setValueAtTime(sustainGain, holdEnd);
}

function holdAudioParam(param: AudioParam, now: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now);
    return;
  }
  const current = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(current, now);
}

function timecentsToSeconds(timecents: number): number {
  if (!Number.isFinite(timecents) || timecents <= -32768) return 0;
  return clamp(2 ** (timecents / 1200), 0, 100);
}

function centibelsToGain(centibels: number): number {
  return 10 ** (-centibels / 200);
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
