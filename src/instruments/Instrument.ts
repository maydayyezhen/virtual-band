import type * as THREE from 'three';

export type InstrumentRole = 'keyboard' | 'drums' | 'bass' | 'acoustic' | 'electric' | string;

export type InstrumentInteractionPhase = 'start' | 'end';
export type InstrumentInteractionDragBehavior = 'retarget' | 'lock';

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
  /**
   * Optional authored hit resolver for instruments whose playable region cannot be
   * represented by one static userData.hit tag (for example a fretless fingerboard).
   * The shared InteractionSystem still owns raycasting; the instrument only maps the
   * nearest intersection to a stable partId.
   */
  resolveHit?(intersection: THREE.Intersection): string | null;
  interact?(interaction: InstrumentInteraction): boolean;
  /**
   * Optional transient interaction preview. This must not mutate musical state;
   * it only projects the currently hoverable target into instrument visuals.
   */
  previewInteraction?(partId: string | null): void;
  /**
   * Declares whether a held pointer may retarget to another part while moving.
   * Discrete selectors such as frets/stopped positions should return `lock` so a
   * click commits exactly one state change; continuous play surfaces may retarget.
   */
  interactionDragBehavior?(partId: string): InstrumentInteractionDragBehavior;
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
