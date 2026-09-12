import * as THREE from 'three';
import type { BassAudio } from '../../audio/InstrumentAudio';
import { DEFAULT_BASS_PROGRAM, getBassProgram, type BassProgramId } from '../../audio/BassProgram';
import type { Instrument, InstrumentFrameResult, InstrumentInteraction } from '../Instrument';
import {
  applyFingeringMarkerStyle,
  createFingeringPreviewMarker,
  FINGERING_MARKER_STYLES,
} from '../shared/FingeringMarkerStyle';
import { StringFingeringState, type StringFingeringValue } from '../shared/StringFingeringState';
import {
  buildLegacyBassAsset,
  type LegacyBassController,
  type LegacyBassHitEvent,
  type LegacyBassModel,
} from './legacyBassAsset';

interface InteractionVoice {
  note: number;
  stringNumber: number;
}

const STRING_ORDER = [4, 3, 2, 1] as const;

export class BassInstrument implements Instrument {
  private instanceId = 'bass.main';


  /**

   * Instance name. One instrument type can stand on stage more than once — two violins are

   * `violin.1` and `violin.2` — so the name belongs to the instance, not the class. This is

   * the default for the first one.

   */

  get id(): string {

    return this.instanceId;

  }


  /** Name this instance. Call before registering it, while nothing refers to it yet. */

  setInstanceId(value: string): void {

    this.instanceId = value;
    this.root.userData.instrumentId = value;

  }
  readonly role = 'bass';
  readonly label = 'Atelier · Electric Bass 02';
  readonly root: THREE.Group;

  private readonly model: LegacyBassModel;
  private readonly controller: LegacyBassController;
  private readonly sampler: BassAudio;
  private readonly fingeringState = new StringFingeringState(STRING_ORDER, 21);
  private readonly interactionVoices = new Map<string, InteractionVoice>();
  private readonly previewMarker: THREE.Mesh;
  private fingeringPreview: { stringNumber: number; fret: number } | null = null;
  private pendingDirectPluckString: number | null = null;

  private constructor(model: LegacyBassModel, controller: LegacyBassController, sampler: BassAudio) {
    this.model = model;
    this.controller = controller;
    this.sampler = sampler;
    this.root = model.root;
    this.root.userData.instrumentId = this.id;
    const markerSource = [...model.strings.values()][0]?.marker;
    if (!markerSource) throw new Error('Bass has no fingering marker source');
    this.previewMarker = createFingeringPreviewMarker(markerSource, 'Bass fingering hover preview');
    this.root.add(this.previewMarker);
    this.syncFingeringMarkers();
  }

  static async create(sampler: BassAudio): Promise<BassInstrument> {
    let instrument: BassInstrument | null = null;
    const { model, controller } = await buildLegacyBassAsset({
      onHit: (event) => instrument?.playAudio(event),
    });
    instrument = new BassInstrument(model, controller, sampler);
    instrument.setProgram(DEFAULT_BASS_PROGRAM);
    return instrument;
  }

  private visualOnly = false;

  visualNoteOn(note: number, velocity: number): void {
    this.visualOnly = true;
    try { this.controller.api.noteOn(note, velocity); }
    finally { this.visualOnly = false; }
  }

  visualNoteOff(note: number): void { this.controller.api.noteOff(note); }

  noteOn(note: number, velocity: number): void {
    this.controller.api.noteOn(note, velocity);
  }

  noteOff(note: number): void {
    this.controller.api.noteOff(note);
    this.sampler.noteOffPitch(note);
  }

  pluck(stringNumber: number, velocity = 100, fret = 0): LegacyBassHitEvent | false {
    this.pendingDirectPluckString = stringNumber;
    try {
      return this.controller.api.pluck(stringNumber, velocity, fret);
    } finally {
      this.pendingDirectPluckString = null;
    }
  }

  pluckCurrentString(stringNumber: number, velocity = 100): LegacyBassHitEvent | false {
    const fret = this.fingeringState.get(stringNumber);
    return fret === null ? false : this.pluck(stringNumber, velocity, fret);
  }

  get fingering(): Array<number | null> {
    return this.fingeringState.snapshot();
  }

  setFingering(frets: readonly StringFingeringValue[]): boolean {
    if (!this.fingeringState.setAll(frets)) return false;
    this.syncFingeringMarkers();
    return true;
  }

  clearFingering(): void {
    this.fingeringState.clear();
    this.syncFingeringMarkers();
  }

  setStringFret(stringNumber: number, fret: number): boolean {
    if (!this.fingeringState.set(stringNumber, fret)) return false;
    this.syncFingeringMarkers();
    return true;
  }

  toggleStringFret(stringNumber: number, fret: number): boolean {
    if (!this.fingeringState.toggle(stringNumber, fret)) return false;
    this.syncFingeringMarkers();
    return true;
  }

  get program(): BassProgramId {
    return this.sampler.program;
  }

  setProgram(value: number): boolean {
    return Boolean(getBassProgram(value)) && this.sampler.setProgram(value);
  }

  stepProgram(delta: -1 | 1): BassProgramId {
    return this.sampler.stepProgram(delta);
  }

  programChange(value: number): boolean {
    return this.setProgram(value);
  }

  setPitchBend(value: number): boolean {
    if (!this.controller.api.setPitchBend(value)) return false;
    return this.sampler.setPitchBend(value);
  }

  controlChange(cc: number, value: number): boolean {
    if (!Number.isInteger(cc) || cc < 0 || cc > 127 || !Number.isInteger(value) || value < 0 || value > 127) return false;
    if (cc === 7) return this.sampler.setVolume(value / 127);
    const active = this.controller.api.getFingering().map((fingering) => fingering.string);
    if (!this.controller.api.controlChange(cc, value)) return false;
    if (cc === 64) this.sampler.setSustain(value >= 64);
    else if (cc === 120) this.sampler.reset();
    else if (cc === 123) for (const stringNumber of active) this.sampler.muteString(stringNumber);
    else if (cc === 121) { this.sampler.setSustain(false); this.sampler.setPitchBend(0); }
    return true;
  }

  get activeNotes(): number[] {
    return this.controller.api.activeNotes;
  }

  update(dt: number): InstrumentFrameResult {
    const result = this.controller.tick(dt);
    this.syncFingeringMarkers();
    return result;
  }

  reset(): void {
    this.controller.api.panic();
    this.sampler.reset();
    this.interactionVoices.clear();
    this.pendingDirectPluckString = null;
    this.fingeringPreview = null;
    this.clearFingering();
  }

  resolveHit(intersection: THREE.Intersection): string | null {
    const point = this.root.worldToLocal(intersection.point.clone());
    const lastFret = this.model.frets.length - 1;
    const fingerboardZone = point.y > this.model.frets[lastFret] - 0.04 && point.y < this.model.nutY - 0.025;
    const pluckZone = point.y <= this.model.frets[lastFret] - 0.04;
    if (
      point.y < this.model.bridgeY - 0.18
      || point.y > this.model.nutY + 0.08
      || point.z < 0.24
      || !isFrontFacingInteraction(intersection, this.root)
    ) return null;

    const t = THREE.MathUtils.clamp((point.y - this.model.bridgeY) / (this.model.nutY - this.model.bridgeY), 0, 1);
    const string = [...this.model.strings.values()].sort((a, b) => {
      const ax = THREE.MathUtils.lerp(a.a.x, a.b.x, t);
      const bx = THREE.MathUtils.lerp(b.a.x, b.b.x, t);
      return Math.abs(point.x - ax) - Math.abs(point.x - bx);
    })[0];
    if (!string) return null;
    const stringX = THREE.MathUtils.lerp(string.a.x, string.b.x, t);
    if (Math.abs(point.x - stringX) > (pluckZone ? 0.12 : 0.078)) return null;
    if (pluckZone) return `pluck:${string.number}`;
    if (!fingerboardZone) return null;
    let fret = lastFret;
    for (let index = 1; index <= lastFret; index += 1) {
      if (point.y <= this.model.frets[index - 1] && point.y > this.model.frets[index]) {
        fret = index;
        break;
      }
    }
    return `fret:${string.number}:${fret}`;
  }

  interact({ partId, velocity, phase }: InstrumentInteraction): boolean {
    const fretMatch = /^fret:([1-4]):(\d{1,2})$/.exec(partId);
    if (fretMatch) return phase === 'end' || this.toggleStringFret(Number(fretMatch[1]), Number(fretMatch[2]));
    const pluckMatch = /^pluck:([1-4])$/.exec(partId);
    if (!pluckMatch) return false;
    if (phase === 'end') {
      const voice = this.interactionVoices.get(partId);
      if (!voice) return true;
      this.interactionVoices.delete(partId);
      this.controller.api.noteOff(voice.note);
      this.sampler.noteOff(voice.stringNumber);
      return true;
    }
    const stringNumber = Number(pluckMatch[1]);
    const previous = this.interactionVoices.get(partId);
    if (previous) { this.controller.api.noteOff(previous.note); this.sampler.muteString(previous.stringNumber); }
    const result = this.pluckCurrentString(stringNumber, velocity);
    if (result) this.interactionVoices.set(partId, { note: result.note, stringNumber: result.string });
    return true;
  }

  interactionDragBehavior(partId: string): 'retarget' | 'lock' {
    return /^fret:([1-4]):(\d{1,2})$/.test(partId) ? 'lock' : 'retarget';
  }

  previewInteraction(partId: string | null): void {
    const match = partId ? /^fret:([1-4]):(\d{1,2})$/.exec(partId) : null;
    const next = match ? { stringNumber: Number(match[1]), fret: Number(match[2]) } : null;
    if (this.fingeringPreview?.stringNumber === next?.stringNumber && this.fingeringPreview?.fret === next?.fret) return;
    this.fingeringPreview = next;
    this.syncFingeringMarkers();
  }

  dispose(): void {
    this.reset();
    this.sampler.dispose();
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry) geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }

  private playAudio(event: LegacyBassHitEvent): void {
    if (this.visualOnly) return;
    this.sampler.noteOn(event.string, event.note, event.velocity, this.pendingDirectPluckString === event.string ? 'pluck' : 'gated');
  }

  private syncFingeringMarkers(): void {
    const lastFret = this.model.frets.length - 1;
    for (const string of this.model.strings.values()) {
      const fret = this.fingeringState.get(string.number);
      const visible = fret !== null && fret > 0 && fret <= lastFret;
      if (visible) string.marker.position.copy(this.fretMarkerPoint(string.number, fret));
      applyFingeringMarkerStyle(string.marker, FINGERING_MARKER_STYLES.bass, { visible, attack: string.energy });
    }
    const preview = this.fingeringPreview;
    const visible = Boolean(preview && preview.fret > 0 && preview.fret <= lastFret && this.fingeringState.get(preview.stringNumber) !== preview.fret);
    if (visible && preview) this.previewMarker.position.copy(this.fretMarkerPoint(preview.stringNumber, preview.fret));
    applyFingeringMarkerStyle(this.previewMarker, FINGERING_MARKER_STYLES.bass, { visible, preview: true });
  }

  private fretMarkerPoint(stringNumber: number, fret: number): THREE.Vector3 {
    const string = this.model.strings.get(stringNumber);
    if (!string) return new THREE.Vector3();
    const y = (this.model.frets[fret - 1] + this.model.frets[fret]) * 0.5;
    const t = THREE.MathUtils.clamp((y - string.a.y) / (string.b.y - string.a.y), 0, 1);
    return string.a.clone().lerp(string.b, t).add(new THREE.Vector3(0, 0, 0.032));
  }
}

function isFrontFacingInteraction(intersection: THREE.Intersection, root: THREE.Object3D): boolean {
  if (!intersection.face) return false;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld);
  const worldNormal = intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize();
  const localNormal = worldNormal.applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
  return localNormal.z > 0.12;
}
