import * as THREE from 'three';
import { applyElectricVariant, type ElectricModelVariant } from './applyElectricVariant';
import type { ElectricGuitarAudio } from '../../audio/InstrumentAudio';
import {
  DEFAULT_ELECTRIC_GUITAR_PROGRAM,
  getElectricGuitarProgram,
  type ElectricGuitarProgramId,
} from '../../audio/ElectricGuitarProgram';
import type { Instrument, InstrumentFrameResult, InstrumentInteraction } from '../Instrument';
import {
  applyFingeringMarkerStyle,
  createFingeringPreviewMarker,
  FINGERING_MARKER_STYLES,
} from '../shared/FingeringMarkerStyle';
import { StringFingeringState, type StringFingeringValue } from '../shared/StringFingeringState';
import {
  buildLegacyElectricAsset,
  type ElectricControlId,
  type ElectricStrumDirection,
  type LegacyElectricController,
  type LegacyElectricHitEvent,
  type LegacyElectricModel,
} from './legacyElectricAsset';

interface InteractionVoice {
  note: number;
  stringNumber: number;
}

const STRING_ORDER = [6, 5, 4, 3, 2, 1] as const;

export class ElectricGuitarInstrument implements Instrument {
  private instanceId = 'electric.main';


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
  readonly role = 'electric';
  get label(): string {
    return this.variant === 'flying-v' ? 'Atelier · Amber V'
      : this.variant === 'single-cut' ? 'Atelier · Garnet Electric' : 'Atelier · Volt Electric';
  }
  readonly root: THREE.Group;

  private readonly model: LegacyElectricModel;
  private readonly controller: LegacyElectricController;
  private readonly sampler: ElectricGuitarAudio;
  private readonly interactionVoices = new Map<string, InteractionVoice>();
  private readonly fingeringState = new StringFingeringState(STRING_ORDER, 22);
  private readonly previewMarker: THREE.Mesh;
  private fingeringPreview: { stringNumber: number; fret: number } | null = null;
  private pendingStrumHits: number[] = [];
  private pendingDirectPluckString: number | null = null;

  private constructor(
    model: LegacyElectricModel,
    controller: LegacyElectricController,
    sampler: ElectricGuitarAudio,
    readonly variant: ElectricModelVariant,
  ) {
    this.model = model;
    this.controller = controller;
    this.sampler = sampler;
    this.root = model.root;
    this.root.userData.instrumentId = this.id;
    const markerSource = [...this.model.strings.values()][0]?.marker;
    if (!markerSource) throw new Error('Electric guitar has no fingering marker source');
    this.previewMarker = createFingeringPreviewMarker(markerSource, 'Electric fingering hover preview');
    this.root.add(this.previewMarker);
    for (const string of this.model.strings.values()) string.marker.raycast = () => {};
    this.syncFingeringMarkers();
  }

  static async create(sampler: ElectricGuitarAudio, variant: ElectricModelVariant = 'classic'): Promise<ElectricGuitarInstrument> {
    let instrument: ElectricGuitarInstrument | null = null;
    const { model, controller } = await buildLegacyElectricAsset({
      onHit: (event) => instrument?.playAudio(event),
    });
    applyElectricVariant(model, variant);
    instrument = new ElectricGuitarInstrument(model, controller, sampler, variant);
    instrument.setProgram(DEFAULT_ELECTRIC_GUITAR_PROGRAM);
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

  pluck(stringNumber: number, velocity = 100, fret = 0): LegacyElectricHitEvent | false {
    this.pendingDirectPluckString = stringNumber;
    try {
      return this.controller.api.pluck(stringNumber, velocity, fret);
    } finally {
      this.pendingDirectPluckString = null;
    }
  }

  pluckCurrentString(stringNumber: number, velocity = 100): LegacyElectricHitEvent | false {
    const fret = this.fingeringState.get(stringNumber);
    if (fret === null) return false;
    return this.pluck(stringNumber, velocity, fret);
  }

  strum(
    frets: Array<number | null>,
    velocity = 100,
    direction: ElectricStrumDirection = 'down',
  ): boolean {
    const handled = this.controller.api.strum(frets, velocity, direction);
    if (!handled) {
      this.pendingStrumHits = [];
      return false;
    }

    for (let stringNumber = 1; stringNumber <= 6; stringNumber += 1) {
      this.sampler.muteString(stringNumber, 0.04);
    }
    this.pendingStrumHits = strumStringOrder(frets, direction);
    return true;
  }

  strumCurrentFingering(
    velocity = 100,
    direction: ElectricStrumDirection = 'down',
  ): boolean {
    return this.strum(this.fingering, velocity, direction);
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

  get program(): ElectricGuitarProgramId {
    return this.sampler.program;
  }

  setProgram(value: number): boolean {
    const preset = getElectricGuitarProgram(value);
    if (!preset) return false;

    this.controller.api.setControl('pickup', preset.pickup);
    this.controller.api.setControl('tone', preset.tone);
    this.controller.api.setControl('volume', preset.volume);
    return this.sampler.setProgram(preset.id);
  }

  programChange(value: number): boolean {
    return this.setProgram(value);
  }

  setPitchBend(value: number): boolean {
    if (!this.controller.api.setPitchBend(value)) return false;
    return this.sampler.setPitchBend(value);
  }

  setControl(id: ElectricControlId, value: number): boolean {
    if (!this.controller.api.setControl(id, value)) return false;
    if (id === 'volume') this.sampler.setVolume(value);
    else if (id === 'tone') this.sampler.setTone(value);
    else if (id === 'pickup') this.sampler.setPickup(value);
    return true;
  }

  controlChange(cc: number, value: number): boolean {
    const activeBefore = [...this.model.strings.values()]
      .filter((string) => string.held)
      .map((string) => string.number);
    const handled = this.controller.api.controlChange(cc, value);
    if (!handled) return false;

    if (cc === 64) this.sampler.setSustain(value >= 64);
    else if (cc === 7) this.sampler.setVolume(value / 127);
    else if (cc === 74) this.sampler.setTone(value / 127);
    else if (cc === 120) this.sampler.reset();
    else if (cc === 123) {
      for (const stringNumber of activeBefore) this.sampler.muteString(stringNumber, 0.04);
    } else if (cc === 121) {
      this.sampler.setSustain(false);
      this.sampler.setPitchBend(0);
    }
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
    this.pendingStrumHits = [];
    this.pendingDirectPluckString = null;
    this.fingeringPreview = null;
    this.clearFingering();
  }

  resolveHit(intersection: THREE.Intersection): string | null {
    let node: THREE.Object3D | null = intersection.object;
    while (node && node !== this.root) {
      const control = node.userData.control;
      if (control === 'volume' || control === 'tone' || control === 'pickup') {
        return `control:${control}`;
      }
      node = node.parent;
    }

    const point = this.root.worldToLocal(intersection.point.clone());
    const lastFret = Math.min(22, this.model.frets.length - 1);
    const fingerboardZone = point.y > this.model.frets[lastFret] - 0.04
      && point.y < this.model.nutY - 0.03;
    const pluckZone = point.y <= this.model.frets[lastFret] - 0.04;

    if (
      point.z < 0.275
      || point.y < this.model.bridgeY - 0.14
      || point.y > this.model.nutY + 0.065
    ) return null;

    const t = THREE.MathUtils.clamp(
      (point.y - this.model.bridgeY) / this.model.scale,
      0,
      1,
    );
    const strings = [...this.model.strings.values()].sort((a, b) => {
      const ax = THREE.MathUtils.lerp(a.saddle.x, a.nut.x, t);
      const bx = THREE.MathUtils.lerp(b.saddle.x, b.nut.x, t);
      return Math.abs(point.x - ax) - Math.abs(point.x - bx);
    });
    const string = strings[0];
    if (!string) return null;

    const stringX = THREE.MathUtils.lerp(string.saddle.x, string.nut.x, t);
    const hitTolerance = pluckZone ? 0.09 : 0.062;
    if (Math.abs(point.x - stringX) > hitTolerance) return null;

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
    const controlMatch = /^control:(volume|tone|pickup)$/.exec(partId);
    if (controlMatch) {
      if (phase === 'end') return true;
      const id = controlMatch[1] as ElectricControlId;
      const control = this.model.controls[id];
      const next = id === 'pickup'
        ? (Math.round(control.value) + 1) % 3
        : (control.value + 0.2 > 1 ? 0 : control.value + 0.2);
      return this.setControl(id, next);
    }

    const fretMatch = /^fret:([1-6]):(\d{1,2})$/.exec(partId);
    if (fretMatch) {
      if (phase === 'end') return true;
      return this.toggleStringFret(Number(fretMatch[1]), Number(fretMatch[2]));
    }

    const pluckMatch = /^pluck:([1-6])$/.exec(partId);
    if (!pluckMatch) return false;

    if (phase === 'end') {
      const voice = this.interactionVoices.get(partId);
      if (!voice) return true;
      this.interactionVoices.delete(partId);
      this.controller.api.noteOff(voice.note);
      // Manual plucks are impulses. Input release only clears donor hold state;
      // the sampler keeps the old string tail until natural decay or re-pluck.
      this.sampler.noteOff(voice.stringNumber);
      return true;
    }

    const stringNumber = Number(pluckMatch[1]);
    const previous = this.interactionVoices.get(partId);
    if (previous) {
      this.controller.api.noteOff(previous.note);
      this.sampler.noteOff(previous.stringNumber);
    }

    const result = this.pluckCurrentString(stringNumber, velocity);
    if (!result) return true;
    this.interactionVoices.set(partId, {
      note: result.note,
      stringNumber: result.string,
    });
    return true;
  }

  interactionDragBehavior(partId: string): 'retarget' | 'lock' {
    return /^fret:([1-6]):(\d{1,2})$/.test(partId) ? 'lock' : 'retarget';
  }

  previewInteraction(partId: string | null): void {
    const match = partId ? /^fret:([1-6]):(\d{1,2})$/.exec(partId) : null;
    const next = match
      ? { stringNumber: Number(match[1]), fret: Number(match[2]) }
      : null;
    if (
      this.fingeringPreview?.stringNumber === next?.stringNumber
      && this.fingeringPreview?.fret === next?.fret
    ) return;
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
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materialList) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  }

  private playAudio(event: LegacyElectricHitEvent): void {
    if (this.visualOnly) return;
    const strum = this.pendingStrumHits[0] === event.string;
    if (strum) this.pendingStrumHits.shift();
    const directPluck = this.pendingDirectPluckString === event.string;
    const gesture = strum ? 'strum' : directPluck ? 'pluck' : 'gated';
    this.sampler.noteOn(event.string, event.note, event.velocity, gesture);
  }

  private syncFingeringMarkers(): void {
    const lastFret = Math.min(22, this.model.frets.length - 1);
    for (const string of this.model.strings.values()) {
      const fret = this.fingeringState.get(string.number);
      const visible = fret !== null && fret > 0 && fret <= lastFret;
      if (visible) string.marker.position.copy(this.fretMarkerPoint(string.number, fret));
      applyFingeringMarkerStyle(
        string.marker,
        FINGERING_MARKER_STYLES.electricGuitar,
        { visible, preview: false, attack: string.energy },
      );
    }

    const preview = this.fingeringPreview;
    const committed = preview ? this.fingeringState.get(preview.stringNumber) : 0;
    const visible = Boolean(
      preview
      && preview.fret > 0
      && preview.fret <= lastFret
      && committed !== preview.fret
      && this.model.strings.has(preview.stringNumber)
    );
    if (visible && preview) {
      this.previewMarker.position.copy(this.fretMarkerPoint(preview.stringNumber, preview.fret));
    }
    applyFingeringMarkerStyle(
      this.previewMarker,
      FINGERING_MARKER_STYLES.electricGuitar,
      { visible, preview: true },
    );
  }

  private fretMarkerPoint(stringNumber: number, fret: number): THREE.Vector3 {
    const string = this.model.strings.get(stringNumber);
    if (!string) return new THREE.Vector3();
    const y = (this.model.frets[fret - 1] + this.model.frets[fret]) * 0.5;
    const denominator = string.nut.y - string.saddle.y;
    const t = denominator === 0
      ? 0
      : THREE.MathUtils.clamp((y - string.saddle.y) / denominator, 0, 1);
    return string.saddle.clone().lerp(string.nut, t).add(new THREE.Vector3(0, 0, 0.024));
  }
}

function strumStringOrder(
  frets: Array<number | null>,
  direction: ElectricStrumDirection,
): number[] {
  const indices = direction === 'down' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
  return indices
    .filter((index) => frets[index] !== null)
    .map((index) => 6 - index);
}
