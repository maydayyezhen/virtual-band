import type { TransportStatus } from '../app/AppState';

export interface TransportSnapshot {
  status: TransportStatus;
  time: number;
  duration: number;
}

type Listener = (snapshot: TransportSnapshot) => void;

export class Transport {
  private status: TransportStatus = 'stopped';
  private time = 0;
  private duration = 0;
  private readonly listeners = new Set<Listener>();

  get snapshot(): TransportSnapshot {
    return { status: this.status, time: this.time, duration: this.duration };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  load(duration: number): void {
    this.duration = Math.max(0, duration || 0);
    this.time = 0;
    this.status = 'stopped';
    this.emit();
  }

  play(): void {
    if (this.duration <= 0) return;
    this.status = 'playing';
    this.emit();
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.status = 'paused';
    this.emit();
  }

  stop(): void {
    this.status = 'stopped';
    this.time = 0;
    this.emit();
  }

  seek(time: number): void {
    this.time = Math.min(this.duration, Math.max(0, time || 0));
    this.emit();
  }

  update(dt: number): void {
    if (this.status !== 'playing') return;
    const next = Math.min(this.duration, this.time + Math.max(0, dt));
    if (next === this.time) return;
    this.time = next;
    if (this.time >= this.duration) this.status = 'stopped';
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
