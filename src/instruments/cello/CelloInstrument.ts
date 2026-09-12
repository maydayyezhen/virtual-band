import * as THREE from 'three';
import type { LiveChannel } from '../../audio/LiveAudioEngine';
import type { Instrument, InstrumentInteraction } from '../Instrument';
import { createCelloAssembly } from './createCelloAssembly';
import { CelloStringMotion } from './CelloStringMotion';

type CelloAudio = Pick<LiveChannel, 'noteOn' | 'noteOff' | 'setProgram' | 'reset' | 'dispose'>;
type Articulation = 'arco' | 'pizzicato';
interface Held { note: number; velocity: number; articulation: Articulation }
const TUNING = [36, 43, 50, 57] as const;
const BRIDGE_X = [-.027, -.009, .009, .027];
const NUT_X = [-.0112, -.00373, .00373, .0112];

/** Audio stays in the shared SF2 engine; this adapter owns gesture state and visible bowing. */
export class CelloInstrument implements Instrument {
  id = 'cello.main'; readonly role = 'cello'; readonly label = '大提琴';
  readonly assembly = createCelloAssembly(); readonly model = this.assembly.model;
  readonly root = this.assembly.root; readonly bow = this.assembly.bow;
  private readonly stringMotion = new CelloStringMotion(this.model.strings);
  private readonly held = new Map<string, Held>();
  private readonly score = new Map<number, Held>();
  private readonly markerGeometry = new THREE.SphereGeometry(.0035, 12, 8);
  private readonly markerMaterial = new THREE.MeshStandardMaterial({ color: 0xe9cf8d, emissive: 0x8d5e20, emissiveIntensity: .45 });
  private readonly markers = TUNING.map(() => new THREE.Mesh(this.markerGeometry, this.markerMaterial));
  private readonly hitGeometry = new THREE.PlaneGeometry(.066, .7);
  private readonly hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide });
  private readonly hitArea = new THREE.Mesh(this.hitGeometry, this.hitMaterial);
  private readonly parkedPosition = this.bow.root.position.clone();
  private readonly parkedRotation = this.bow.root.quaternion.clone();
  private engagement = 0; private phase = 0; private lastNote = 48; private disposed = false;
  private liveArticulation: Articulation = 'arco';

  static async create(audio: CelloAudio): Promise<CelloInstrument> { return new CelloInstrument(audio); }
  constructor(private readonly audio: CelloAudio) {
    this.setInstanceId(this.id);
    this.hitArea.name = 'Cello continuous playing surface'; this.hitArea.position.set(0, .93, .177);
    this.root.add(this.hitArea);
    this.markers.forEach(marker => { marker.visible = false; marker.position.set(0, 1.2, .12); marker.raycast = () => {}; this.root.add(marker); });
  }
  setInstanceId(id: string): void { this.id = id; this.root.userData.instrumentId = id; }
  setProgram(value: number | string): boolean { return value === 42 && this.audio.setProgram(this.liveArticulation === 'pizzicato' ? 45 : 42); }
  get articulation(): Articulation { return this.liveArticulation; }
  setArticulation(value: Articulation): boolean {
    if (value !== 'arco' && value !== 'pizzicato') return false;
    if (value === this.liveArticulation) return true;
    this.held.clear(); this.audio.reset(); this.stringMotion.reset();
    this.liveArticulation = value; return this.audio.setProgram(value === 'pizzicato' ? 45 : 42);
  }
  get activeNote(): number | null { return [...this.held.values()].at(-1)?.note ?? [...this.score.values()].at(-1)?.note ?? null; }
  noteOn(note: number, velocity: number, source = 'live'): void {
    if (!Number.isInteger(note) || note < 0 || note > 127 || !Number.isFinite(velocity)) return;
    if (velocity <= 0) { this.noteOff(note, source); return; }
    const token = `${source}:${note}`; this.held.delete(token);
    this.held.set(token, { note, velocity, articulation: this.liveArticulation });
    this.audio.noteOn(token, note, velocity, this.liveArticulation === 'pizzicato' ? 3 : undefined);
  }
  noteOff(note: number, source = 'live'): void {
    const token = `${source}:${note}`, held = this.held.get(token); this.held.delete(token);
    if (held?.articulation !== 'pizzicato') this.audio.noteOff(token);
  }
  visualNoteOn(note: number, velocity: number, _tier?: 'lower' | 'upper', program?: number): void {
    if (!Number.isInteger(note) || note < 0 || note > 127 || !Number.isFinite(velocity)) return;
    if (velocity <= 0) { this.visualNoteOff(note); return; }
    this.score.delete(note); this.score.set(note, { note, velocity, articulation: program === 45 ? 'pizzicato' : 'arco' });
  }
  visualNoteOff(note: number): void { this.score.delete(note); }
  resolveHit(hit: THREE.Intersection): string | null {
    if (hit.object !== this.hitArea) return null;
    const p = this.root.worldToLocal(hit.point.clone()), t = THREE.MathUtils.clamp((p.y - .58) / .7, 0, 1);
    const xs = BRIDGE_X.map((x, i) => THREE.MathUtils.lerp(x, NUT_X[i], t));
    const string = xs.reduce((best, x, i) => Math.abs(x - p.x) < Math.abs(xs[best] - p.x) ? i : best, 0);
    // The area between bridge and fingerboard plays the open string. On the board, distance determines pitch.
    const interval = p.y < .726 ? 0 : THREE.MathUtils.clamp(Math.round(-12 * Math.log2(Math.max(.25, t))), 0, 24);
    return `key:${TUNING[string] + interval}`;
  }
  interact({ partId, phase, velocity }: InstrumentInteraction): boolean {
    const match = /^key:(\d+)$/.exec(partId); if (!match) return false;
    if (phase === 'start') this.noteOn(Number(match[1]), velocity, 'pointer'); else this.noteOff(Number(match[1]), 'pointer');
    return true;
  }
  interactionDragBehavior(): 'retarget' { return 'retarget'; }
  private stringFor(note: number): number { return TUNING.reduce<number>((index, open, i) => open <= note ? i : index, 0); }
  private stringPoint(string: number, y: number): THREE.Vector3 {
    const t = (y - .580) / .7, x = BRIDGE_X[string];
    const bridgeZ = this.root.getObjectByName('cello:bridge')!.position.z + .0785 - .0095 * (x / .0305) ** 2;
    return new THREE.Vector3(THREE.MathUtils.lerp(x, NUT_X[string], t), y,
      THREE.MathUtils.lerp(bridgeZ, .1123 - NUT_X[string] ** 2 / .13, t) + .001);
  }
  update(dt: number): { moved: boolean; animating: boolean } {
    const delta = Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
    const note = this.activeNote, before = this.engagement;
    const current = [...this.held.values()].at(-1) ?? [...this.score.values()].at(-1);
    const bowed = current?.articulation === 'arco';
    this.engagement = THREE.MathUtils.lerp(before, bowed ? 1 : 0, 1 - Math.exp(-delta * 15));
    if (note !== null && bowed) { this.lastNote = note; this.phase += delta * 4.2; }
    this.markers.forEach(marker => { marker.visible = false; });
    const stringNotes: (Held | undefined)[] = new Array(4);
    for (const held of [...this.score.values(), ...this.held.values()]) {
      const string = this.stringFor(held.note), semitones = held.note - TUNING[string];
      if (semitones < 0 || semitones > 24) continue;
      stringNotes[string] = held;
      const marker = this.markers[string]; marker.visible = true;
      marker.position.copy(this.stringPoint(string, .58 + .7 * 2 ** (-semitones / 12))); marker.position.z += .004;
    }
    const strings = this.stringMotion.update(delta, stringNotes);
    if (!bowed && this.engagement < .001) {
      this.engagement = 0; this.assembly.parkBow(); return { moved: before !== 0 || strings.moved, animating: strings.animating };
    }
    const string = this.stringFor(this.lastNote), contact = this.stringPoint(string, .65);
    const tilt = (string - 1.5) * .20;
    const playingRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    playingRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tilt));
    const offset = new THREE.Vector3(.39 + Math.sin(this.phase) * .17, 0, 0).applyQuaternion(playingRotation);
    const playingPosition = contact.sub(offset);
    this.bow.root.position.lerpVectors(this.parkedPosition, playingPosition, this.engagement);
    this.bow.root.position.z += Math.sin(Math.PI * this.engagement) * .20;
    this.bow.root.quaternion.slerpQuaternions(this.parkedRotation, playingRotation, this.engagement);
    return { moved: true, animating: true };
  }
  reset(): void {
    this.held.clear(); this.score.clear(); this.audio.reset(); this.engagement = 0; this.phase = 0;
    this.stringMotion.reset();
    this.markers.forEach(marker => { marker.visible = false; }); this.assembly.parkBow();
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.reset(); this.audio.dispose();
    this.markerGeometry.dispose(); this.markerMaterial.dispose(); this.hitGeometry.dispose(); this.hitMaterial.dispose(); this.assembly.dispose();
  }
}
