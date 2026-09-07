import type * as THREE from 'three';

export type InstrumentRole = 'keyboard' | 'drums' | 'bass' | 'acoustic' | 'electric' | string;

export type InstrumentInteractionPhase = 'start' | 'end';

export interface InstrumentInteraction {
  partId: string;
  velocity: number;
  phase: InstrumentInteractionPhase;
}

export interface InstrumentFrameResult {
  moved?: boolean;
  animating?: boolean;
}

export interface Instrument {
  id: string;
  role: InstrumentRole;
  label: string;
  root: THREE.Object3D;
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  update(dt: number): InstrumentFrameResult | void;
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

  update(dt: number): InstrumentFrameResult {
    let moved = false;
    let animating = false;
    for (const instrument of this.items.values()) {
      const result = instrument.update(dt);
      moved ||= Boolean(result?.moved);
      animating ||= Boolean(result?.animating);
    }
    return { moved, animating };
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
