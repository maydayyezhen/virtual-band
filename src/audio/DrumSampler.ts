import type { AudioEngine, AudioVoice } from './AudioEngine';
import { DRUM_KIT_BANK } from './DrumProgram';
import { mixGain } from './AudioMixProfile';
import type { ProgramToneBackend } from './ProgramToneBackend';
import { percussionSamplePath, type SampleLibrary } from './SampleLibrary';

export const HI_HAT_NOTES = Object.freeze({
  closed: 42,
  pedal: 44,
  open: 46,
});

export const DEFAULT_DRUM_NOTES = [36, 38, 42, 43, 44, 46, 47, 49, 50, 51, 55, 57] as const;

const CLOSED_MAX = 0.16;
const OPEN_MIN = 0.68;
const CHOKE_THRESHOLD = 0.2;
const DRUM_MIX_GAIN = mixGain('drums');

export class DrumSampler {
  private readonly audio: AudioEngine;
  private readonly samples: SampleLibrary;
  private readonly toneBackend: ProgramToneBackend | null;
  private readonly openHatVoices = new Set<AudioVoice>();

  private hiHatOpenness = 0;
  private hiHatGeneration = 0;
  private openHatSerial = 0;
  private voiceSerial = 0;

  constructor(
    audio: AudioEngine,
    samples: SampleLibrary,
    toneBackend: ProgramToneBackend | null = null,
  ) {
    this.audio = audio;
    this.samples = samples;
    this.toneBackend = toneBackend;
    this.toneBackend?.setGain(DRUM_MIX_GAIN, 0);
  }

  /** GM2 percussion program currently loaded, or null when there is no tone backend. */
  get program(): number | null {
    return this.toneBackend?.program ?? null;
  }

  /**
   * Swap the whole kit. Every GM2 percussion preset shares one note map, so a hit never lands on
   * the wrong piece — only the sound changes.
   */
  setProgram(program: number): boolean {
    if (!this.toneBackend) return false;
    return this.toneBackend.setProgram(program, DRUM_KIT_BANK);
  }

  async preload(notes: Iterable<number> = DEFAULT_DRUM_NOTES): Promise<void> {
    await Promise.allSettled([
      this.samples.preload([...notes].map((note) => percussionSamplePath(clampMidi(note)))),
      this.toneBackend?.prepare() ?? Promise.resolve(false),
    ]);
  }

  noteOn(note: number, velocity = 100): void {
    const midi = clampMidi(note);

    if (midi === HI_HAT_NOTES.closed) {
      this.setHiHatOpenness(0);
      this.playDiscrete(midi, velocity);
      return;
    }

    if (midi === HI_HAT_NOTES.pedal) {
      this.setHiHatOpenness(0);
      this.playDiscrete(midi, velocity);
      return;
    }

    if (midi === HI_HAT_NOTES.open) {
      this.hiHatOpenness = Math.max(0.78, this.hiHatOpenness);
      this.playOpenHat(velocity);
      return;
    }

    this.playDiscrete(midi, velocity);
  }

  /**
   * Plays the physical hi-hat according to its current continuous pedal opening.
   * The SF2 percussion bank is discrete, so partial opening keeps the project's
   * shortened open-tail model while closed/open endpoints use native SF2 voices.
   */
  hitHiHat(openness: number, velocity = 100): void {
    const amount = clamp01(openness);
    this.hiHatOpenness = amount;

    if (amount <= CLOSED_MAX) {
      this.playDiscrete(HI_HAT_NOTES.closed, velocity);
      return;
    }

    if (amount >= OPEN_MIN) {
      this.playOpenHat(velocity);
      return;
    }

    const mix = (amount - CLOSED_MAX) / (OPEN_MIN - CLOSED_MAX);
    const sustain = 0.10 + mix * 0.52;
    const toneScale = Math.sin(mix * Math.PI * 0.5);

    if (this.toneBackend?.ready) {
      this.playOpenHat(velocity, sustain, 0.055 + mix * 0.12, Math.max(0.2, toneScale));
      return;
    }

    const gain = velocityGain(velocity);
    const closedGain = gain * Math.cos(mix * Math.PI * 0.5);
    const openGain = gain * Math.sin(mix * Math.PI * 0.5);

    if (closedGain > 0.01) this.playSample(HI_HAT_NOTES.closed, closedGain);
    if (openGain > 0.01) this.playOpenHatSample(openGain, sustain, 0.055 + mix * 0.12);
  }

  setHiHatOpenness(openness: number): void {
    const next = clamp01(openness);
    const previous = this.hiHatOpenness;
    this.hiHatOpenness = next;

    if (next < previous && next <= CHOKE_THRESHOLD) {
      const fade = next <= 0.04 ? 0.024 : 0.055;
      this.chokeHiHat(fade);
    }
  }

  chokeHiHat(fadeSeconds = 0.035): void {
    this.hiHatGeneration += 1;
    this.openHatSerial += 1;
    this.toneBackend?.noteOff('hihat:open');
    for (const voice of this.openHatVoices) voice.stop(fadeSeconds);
  }

  resetHiHat(): void {
    this.hiHatOpenness = 0;
    this.chokeHiHat(0.02);
  }

  dispose(): void {
    this.resetHiHat();
    this.toneBackend?.dispose();
  }

  private playDiscrete(note: number, velocity: number): void {
    const midi = clampMidi(note);
    const id = `hit:${midi}:${++this.voiceSerial}`;
    if (this.toneBackend?.noteOn(id, midi, velocity, { gainScale: 0.8 })) return;
    this.playSample(midi, velocityGain(velocity));
  }

  private playOpenHat(
    velocity: number,
    sustain?: number,
    fade = 0.08,
    gainScale = 0.8,
  ): void {
    const serial = ++this.openHatSerial;
    const generation = this.hiHatGeneration;

    if (this.toneBackend?.noteOn(
      'hihat:open',
      HI_HAT_NOTES.open,
      velocity,
      { gainScale },
    )) {
      if (sustain !== undefined) {
        window.setTimeout(() => {
          if (generation !== this.hiHatGeneration || serial !== this.openHatSerial) return;
          this.toneBackend?.noteOff('hihat:open');
        }, Math.max(0, sustain + fade) * 1000);
      }
      return;
    }

    this.playOpenHatSample(velocityGain(velocity), sustain, fade, generation);
  }

  private playOpenHatSample(
    gain: number,
    sustain?: number,
    fade = 0.08,
    generation = this.hiHatGeneration,
  ): void {
    this.playSample(HI_HAT_NOTES.open, gain, (voice) => {
      if (generation !== this.hiHatGeneration && this.hiHatOpenness <= CHOKE_THRESHOLD) {
        voice.stop(0.01);
        return;
      }

      this.openHatVoices.add(voice);
      voice.onEnded(() => this.openHatVoices.delete(voice));
      if (sustain !== undefined) voice.stop(fade, sustain);
    });
  }

  private playSample(note: number, gain: number, onVoice?: (voice: AudioVoice) => void): void {
    const midi = clampMidi(note);
    void this.load(midi).then((buffer) => {
      if (!buffer) return;
      const voice = this.audio.playBuffer(buffer, gain * DRUM_MIX_GAIN);
      if (voice) onVoice?.(voice);
    });
  }

  private load(note: number): Promise<AudioBuffer | null> {
    return this.samples.load(percussionSamplePath(clampMidi(note)));
  }
}

function velocityGain(velocity: number): number {
  return Math.max(0.025, Math.min(1, velocity / 127)) * 0.8;
}

function clampMidi(note: number): number {
  return Math.max(0, Math.min(127, Math.round(note)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
