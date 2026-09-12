import * as THREE from 'three';
import type { Instrument, InstrumentInteraction } from '../Instrument';
import { createGrandPiano } from './createGrandPiano';

export interface PianoAudio {
  setProgram(program: number): boolean;
  noteOn(source: string, note: number, velocity: number): void;
  noteOff(source: string): void;
  cc(controller: number, value: number): void;
  reset(): void;
  dispose(): void;
}

/** Model animation never emits audio during MIDI playback; live notes use the shared SF2 host. */
export class GrandPianoInstrument implements Instrument {
  id = 'piano.main';
  readonly role = 'piano';
  readonly label = '三角钢琴';
  readonly model = createGrandPiano();
  readonly root = this.model.root;
  private readonly held = new Map<number, Set<string>>();
  private readonly sustain = new Set<string>();
  private disposed = false;

  static async create(audio: PianoAudio): Promise<GrandPianoInstrument> { return new GrandPianoInstrument(audio); }
  constructor(private readonly audio: PianoAudio) { this.setInstanceId(this.id); }
  setInstanceId(id: string): void { this.id = id; this.root.userData.instrumentId = id; }
  setProgram(program: number | string): boolean {
    return typeof program === 'number' && [0, 1, 3].includes(program) && this.audio.setProgram(program);
  }
  noteOn(note: number, velocity: number, source = 'live'): void {
    if (!this.model.keys.has(note)) return;
    if (velocity <= 0) { this.noteOff(note, source); return; }
    this.hold(note, source, true);
    this.audio.noteOn(`${source}:${note}`, note, Math.min(127, Math.round(velocity)));
  }
  noteOff(note: number, source = 'live'): void { this.hold(note, source, false); this.audio.noteOff(`${source}:${note}`); }
  visualNoteOn(note: number): void { this.hold(note, 'score', true); }
  visualNoteOff(note: number): void { this.hold(note, 'score', false); }
  setSustain(pressed: boolean, source = 'live'): void {
    if (pressed) this.sustain.add(source); else this.sustain.delete(source);
    this.audio.cc(64, this.sustain.size ? 127 : 0);
  }
  interact({ partId, phase, velocity }: InstrumentInteraction): boolean {
    if (partId === 'pedal:sustain') { this.setSustain(phase === 'start', 'pointer'); return true; }
    const match = /^key:(\d+)$/.exec(partId);
    if (!match || !this.model.keys.has(Number(match[1]))) return false;
    const note = Number(match[1]);
    if (phase === 'start') this.noteOn(note, velocity, 'pointer'); else this.noteOff(note, 'pointer');
    return true;
  }
  interactionDragBehavior(): 'retarget' { return 'retarget'; }
  update(dt: number): { moved: boolean; animating: boolean } {
    let moving = false;
    const alpha = 1 - Math.exp(-Math.max(0, dt) * 32);
    for (const [note, { pivot }] of this.model.keys) {
      const target = this.held.get(note)?.size ? .035 : 0;
      pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, target, alpha);
      if (Math.abs(pivot.rotation.x - target) < .00005) pivot.rotation.x = target;
      else moving = true;
    }
    const pedal = this.model.pedals[2], target = this.sustain.size ? .14 : 0;
    pedal.rotation.x = THREE.MathUtils.lerp(pedal.rotation.x, target, alpha);
    if (Math.abs(pedal.rotation.x - target) > .0001) moving = true;
    return { moved: moving, animating: moving };
  }
  reset(): void {
    this.held.clear(); this.sustain.clear(); this.audio.reset();
    for (const { pivot } of this.model.keys.values()) pivot.rotation.x = 0;
    this.model.pedals[2].rotation.x = 0;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.reset(); this.audio.dispose(); this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
  }
  private hold(note: number, source: string, pressed: boolean): void {
    if (!this.model.keys.has(note)) return;
    const sources = this.held.get(note) ?? new Set<string>();
    if (pressed) sources.add(source); else sources.delete(source);
    if (sources.size) this.held.set(note, sources); else this.held.delete(note);
  }
}
