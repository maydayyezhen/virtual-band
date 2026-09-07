import type { DrumsInstrument } from '../../instruments/drums/DrumsInstrument';

interface DemoEvent {
  time: number;
  note: number;
  velocity: number;
}

type Listener = () => void;

export class AtelierDrumDemo {
  private readonly drums: DrumsInstrument;
  private readonly events: DemoEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly beat = 60 / 108;
  private readonly length = this.beat * 16;
  private elapsed = 0;
  private cursor = 0;
  private isPlaying = false;
  private readonly unsubscribePanic: () => void;

  constructor(drums: DrumsInstrument) {
    this.drums = drums;
    this.buildEvents();
    this.unsubscribePanic = this.drums.subscribePanic(() => this.stop());
  }

  start(): void {
    this.stop();
    this.isPlaying = true;
    this.elapsed = 0;
    this.cursor = 0;
    this.emit();
  }

  stop(): void {
    if (!this.isPlaying && this.elapsed === 0 && this.cursor === 0) return;
    this.isPlaying = false;
    this.elapsed = 0;
    this.cursor = 0;
    this.emit();
  }

  toggle(): void {
    if (this.isPlaying) this.stop();
    else this.start();
  }

  update(dt: number): void {
    if (!this.isPlaying) return;
    this.elapsed += Math.max(0, dt);

    if (this.elapsed >= this.length) {
      this.elapsed %= this.length;
      this.cursor = 0;
    }

    while (this.cursor < this.events.length && this.events[this.cursor].time <= this.elapsed) {
      const event = this.events[this.cursor++];
      this.drums.noteOn(event.note, event.velocity);
      this.drums.noteOff(event.note);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  dispose(): void {
    this.unsubscribePanic();
    this.listeners.clear();
  }

  private add(time: number, note: number, velocity: number): void {
    this.events.push({ time, note, velocity });
  }

  private buildEvents(): void {
    for (let bar = 0; bar < 4; bar += 1) {
      const t = bar * this.beat * 4;
      for (let i = 0; i < 8; i += 1) {
        this.add(t + i * this.beat * 0.5, bar === 3 && i === 7 ? 46 : 42, i % 2 ? 62 : 86);
      }
      [0, 1.5, 2, bar % 2 ? 3.5 : 2.75].forEach((beat, index) => {
        this.add(t + beat * this.beat, 36, index === 0 ? 112 : 96);
      });
      [1, 3].forEach((beat) => this.add(t + beat * this.beat, 38, 108));
      if (bar === 0 || bar === 2) this.add(t, bar === 0 ? 49 : 57, 102);
      if (bar === 1) this.add(t + 2.75 * this.beat, 38, 39);
      if (bar === 2) {
        this.add(t + 2.5 * this.beat, 51, 77);
        this.add(t + 3.5 * this.beat, 55, 81);
      }
      if (bar === 3) {
        [50, 47, 43, 38].forEach((note, index) => {
          this.add(t + (3 + index * 0.25) * this.beat, note, 85 + index * 9);
        });
      }
    }
    this.events.sort((a, b) => a.time - b.time);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
