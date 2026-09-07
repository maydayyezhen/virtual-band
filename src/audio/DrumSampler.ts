import type { AudioEngine } from './AudioEngine';

const SAMPLE_BASE = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/percussion-mp3/';
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const DEFAULT_DRUM_NOTES = [36, 38, 42, 43, 44, 46, 47, 49, 50, 51, 55, 57] as const;

export class DrumSampler {
  private readonly audio: AudioEngine;
  private readonly buffers = new Map<number, AudioBuffer>();
  private readonly pending = new Map<number, Promise<AudioBuffer>>();
  private readonly failed = new Set<number>();

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  preload(notes: Iterable<number> = DEFAULT_DRUM_NOTES): Promise<void> {
    const jobs = [...notes].map((note) => this.load(note).then(() => undefined).catch(() => undefined));
    return Promise.all(jobs).then(() => undefined);
  }

  noteOn(note: number, velocity = 100): void {
    const midi = clampMidi(note);
    const gain = Math.max(0.025, Math.min(1, velocity / 127)) * 0.8;
    const ready = this.buffers.get(midi);

    if (ready) {
      this.audio.playBuffer(ready, gain);
      return;
    }

    if (this.failed.has(midi)) return;
    void this.load(midi)
      .then((buffer) => this.audio.playBuffer(buffer, gain))
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

function clampMidi(note: number): number {
  return Math.max(0, Math.min(127, Math.round(note)));
}
