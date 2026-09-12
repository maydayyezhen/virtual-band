import * as THREE from 'three';
import type { LiveChannel } from '../../audio/LiveAudioEngine';
import type { Instrument, InstrumentInteraction } from '../Instrument';
import { createAltoSax } from './createAltoSax';

type SaxAudio = Pick<LiveChannel, 'noteOn' | 'noteOff' | 'setProgram' | 'reset' | 'dispose'>;
interface Held { note: number; velocity: number }
// Main-stack animation in written pitch. Alternate/palm fingerings are deliberately simplified.
const STACKS = [2, 0, 63, 63, 31, 15, 23, 7, 7, 3, 9, 1];
export function saxKeyPattern(concertNote: number): number {
  const written = Math.round(concertNote) + 9;
  return written < 62 ? 63 : STACKS[((written % 12) + 12) % 12];
}

/** One monophonic live channel per instance. Original MIDI polyphony remains with the sequencer. */
export class SaxophoneInstrument implements Instrument {
  id = 'saxophone.main';
  readonly role = 'saxophone';
  readonly label = '中音萨克斯';
  readonly model = createAltoSax();
  readonly root = this.model.root;
  private readonly held = new Map<string, Held>();
  private readonly score = new Map<number, Held>();
  private sounding: number | null = null;
  private disposed = false;
  static async create(audio: SaxAudio): Promise<SaxophoneInstrument> { return new SaxophoneInstrument(audio); }
  constructor(private readonly audio: SaxAudio) { this.setInstanceId(this.id); }
  setInstanceId(id: string): void { this.id = id; this.root.userData.instrumentId = id; }
  setProgram(value: number | string): boolean { return value === 65 && this.audio.setProgram(65); }
  get activeNote(): number | null { return this.latest(this.held)?.note ?? this.latest(this.score)?.note ?? null; }
  noteOn(note: number, velocity: number, source = 'live'): void {
    if (!Number.isInteger(note) || note < 0 || note > 127 || !Number.isFinite(velocity)) return;
    if (velocity <= 0) { this.noteOff(note, source); return; }
    const token = `${source}:${note}`; this.held.delete(token);
    this.held.set(token, { note, velocity: Math.max(1, Math.min(127, Math.round(velocity))) }); this.syncAudio();
  }
  noteOff(note: number, source = 'live'): void { this.held.delete(`${source}:${note}`); this.syncAudio(); }
  visualNoteOn(note: number, velocity: number): void {
    if (!Number.isInteger(note) || note < 0 || note > 127) return;
    this.score.delete(note); this.score.set(note, { note, velocity });
  }
  visualNoteOff(note: number): void { this.score.delete(note); }
  interact({ partId, phase, velocity }: InstrumentInteraction): boolean {
    const match = /^key:(\d+)$/.exec(partId); if (!match) return false;
    if (phase === 'start') this.noteOn(Number(match[1]), velocity, 'pointer'); else this.noteOff(Number(match[1]), 'pointer');
    return true;
  }
  interactionDragBehavior(): 'retarget' { return 'retarget'; }
  update(dt: number): { moved: boolean; animating: boolean } {
    const note = this.activeNote, pattern = note === null ? 0 : saxKeyPattern(note), alpha = 1 - Math.exp(-Math.max(0, dt) * 28);
    let moving = false;
    for (const key of this.model.keys) {
      const target = pattern & (1 << key.index) ? 0 : key.rest;
      key.pivot.rotation.y = THREE.MathUtils.lerp(key.pivot.rotation.y, target, alpha);
      if (Math.abs(key.pivot.rotation.y - target) < .0001) key.pivot.rotation.y = target; else moving = true;
    }
    return { moved: moving, animating: moving };
  }
  reset(): void {
    this.held.clear(); this.score.clear(); this.sounding = null; this.audio.reset();
    for (const key of this.model.keys) key.pivot.rotation.y = key.rest;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.reset(); this.audio.dispose(); this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
  private latest<K>(notes: Map<K, Held>): Held | undefined { return [...notes.values()].at(-1); }
  private syncAudio(): void {
    const next = this.latest(this.held);
    if ((next?.note ?? null) === this.sounding) return;
    this.audio.noteOff('wind'); this.sounding = next?.note ?? null;
    if (next) this.audio.noteOn('wind', next.note, next.velocity);
  }
}
