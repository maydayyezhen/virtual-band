import type { AudioEngine, AudioVoice } from './AudioEngine';

const SAMPLE_BASE = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/percussion-mp3/';
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const HI_HAT_NOTES = Object.freeze({
  closed: 42,
  pedal: 44,
  open: 46,
});

export const DEFAULT_DRUM_NOTES = [36, 38, 42, 43, 44, 46, 47, 49, 50, 51, 55, 57] as const;

const CLOSED_MAX = 0.16;
const OPEN_MIN = 0.68;
const CHOKE_THRESHOLD = 0.2;

export class DrumSampler {
  private readonly audio: AudioEngine;
  private readonly buffers = new Map<number, AudioBuffer>();
  private readonly pending = new Map<number, Promise<AudioBuffer>>();
  private readonly failed = new Set<number>();
  private readonly openHatVoices = new Set<AudioVoice>();

  private hiHatOpenness = 0;
  private hiHatGeneration = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  preload(notes: Iterable<number> = DEFAULT_DRUM_NOTES): Promise<void> {
    const jobs = [...notes].map((note) => this.load(note).then(() => undefined).catch(() => undefined));
    return Promise.all(jobs).then(() => undefined);
  }

  noteOn(note: number, velocity = 100): void {
    const midi = clampMidi(note);

    if (midi === HI_HAT_NOTES.closed) {
      this.setHiHatOpenness(0);
      this.playSample(midi, velocityGain(velocity));
      return;
    }

    if (midi === HI_HAT_NOTES.pedal) {
      this.setHiHatOpenness(0);
      this.playSample(midi, velocityGain(velocity));
      return;
    }

    if (midi === HI_HAT_NOTES.open) {
      this.hiHatOpenness = Math.max(0.78, this.hiHatOpenness);
      this.playOpenHat(velocityGain(velocity));
      return;
    }

    this.playSample(midi, velocityGain(velocity));
  }

  /**
   * Plays the physical hi-hat according to its current continuous pedal opening.
   * The source library has discrete Closed / Pedal / Open samples, so the middle
   * range is represented by an equal-power Closed/Open blend with a shortened
   * open tail. Visual openness can still remain fully continuous.
   */
  hitHiHat(openness: number, velocity = 100): void {
    const amount = clamp01(openness);
    this.hiHatOpenness = amount;
    const gain = velocityGain(velocity);

    if (amount <= CLOSED_MAX) {
      this.playSample(HI_HAT_NOTES.closed, gain);
      return;
    }

    if (amount >= OPEN_MIN) {
      this.playOpenHat(gain);
      return;
    }

    const mix = (amount - CLOSED_MAX) / (OPEN_MIN - CLOSED_MAX);
    const closedGain = gain * Math.cos(mix * Math.PI * 0.5);
    const openGain = gain * Math.sin(mix * Math.PI * 0.5);

    if (closedGain > 0.01) this.playSample(HI_HAT_NOTES.closed, closedGain);
    if (openGain > 0.01) {
      // A half-open hi-hat rings longer as the cymbals separate. The sample itself
      // stays untouched; only its tail is progressively shortened toward closed.
      const sustain = 0.10 + mix * 0.52;
      const fade = 0.055 + mix * 0.12;
      this.playOpenHat(openGain, sustain, fade);
    }
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
    for (const voice of this.openHatVoices) voice.stop(fadeSeconds);
  }

  resetHiHat(): void {
    this.hiHatOpenness = 0;
    this.chokeHiHat(0.02);
  }

  private playOpenHat(gain: number, sustain?: number, fade?: number): void {
    const generation = this.hiHatGeneration;
    this.playSample(HI_HAT_NOTES.open, gain, (voice) => {
      // If the pedal closed while the network sample was still loading, do not let
      // a stale open-hat tail begin after the choke event.
      if (generation !== this.hiHatGeneration && this.hiHatOpenness <= CHOKE_THRESHOLD) {
        voice.stop(0.01);
        return;
      }

      this.openHatVoices.add(voice);
      voice.onEnded(() => this.openHatVoices.delete(voice));
      if (sustain !== undefined) voice.stop(fade ?? 0.08, sustain);
    });
  }

  private playSample(note: number, gain: number, onVoice?: (voice: AudioVoice) => void): void {
    const midi = clampMidi(note);
    const ready = this.buffers.get(midi);

    if (ready) {
      const voice = this.audio.playBuffer(ready, gain);
      if (voice) onVoice?.(voice);
      return;
    }

    if (this.failed.has(midi)) return;
    void this.load(midi)
      .then((buffer) => {
        const voice = this.audio.playBuffer(buffer, gain);
        if (voice) onVoice?.(voice);
      })
      .catch((error) => {
        console.warn(`[DrumSampler] sample ${midi} unavailable`, error);
      });
  }

  private load(note: number): Promise<AudioBuffer> {
    const midi = clampMidi(note);
    const ready = this.buffers.get(midi);
    if (ready) return Promise.resolve(ready);

    const inflight = this.pending.get(midi);
    if (inflight) return inflight;

    const job = fetch(SAMPLE_BASE + noteFile(midi), { mode: 'cors' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => this.audio.decode(data))
      .then((buffer) => {
        this.buffers.set(midi, buffer);
        this.failed.delete(midi);
        return buffer;
      })
      .catch((error) => {
        this.failed.add(midi);
        throw error;
      })
      .finally(() => {
        this.pending.delete(midi);
      });

    this.pending.set(midi, job);
    return job;
  }
}

function noteFile(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  return `${FLAT_NAMES[note % 12]}${octave}.mp3`;
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
