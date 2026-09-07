import type * as THREE from 'three';

export type InstrumentRole = 'keyboard' | 'drums' | 'bass' | 'acoustic' | 'electric' | string;

export interface InstrumentInteraction {
  partId: string;
  intensity: number;
}

export interface Instrument {
  id: string;
  role: InstrumentRole;
  label: string;
  root: THREE.Object3D;
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  update(dt: number): void;
  reset(): void;
  interact?(interaction: InstrumentInteraction): boolean;
  dispose(): void;
}

export class InstrumentRegistry {
  private readonly items = new Map<string, Instrument>();

  register(instrument: Instrument): void {
    if (this.items.has(instrument.id)) throw new Error(`Instrument already registered: ${instrument.id}`);
    this.items.set(instrument.id, instrument);
  }

  unregister(id: string): Instrument | null {
    const instrument = this.items.get(id) ?? null;
    if (!instrument) return null;
    this.items.delete(id);
    return instrument;
  }

  get(id: string): Instrument | null {
    return this.items.get(id) ?? null;
  }

  list(): Instrument[] {
    return [...this.items.values()];
  }

  update(dt: number): void {
    for (const instrument of this.items.values()) instrument.update(dt);
  }

  resetAll(): void {
    for (const instrument of this.items.values()) instrument.reset();
  }

  dispose(): void {
    for (const instrument of this.items.values()) instrument.dispose();
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }
}
