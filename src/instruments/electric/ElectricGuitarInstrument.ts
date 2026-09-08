import * as THREE from 'three';
import type { ElectricGuitarSampler } from '../../audio/ElectricGuitarSampler';
import {
  DEFAULT_ELECTRIC_GUITAR_PROGRAM,
  getElectricGuitarProgram,
  type ElectricGuitarProgramId,
} from '../../audio/ElectricGuitarProgram';
import type { Instrument, InstrumentFrameResult, InstrumentInteraction } from '../Instrument';
import {
  applyFingeringMarkerStyle,
  FINGERING_MARKER_STYLES,
} from '../shared/FingeringMarkerStyle';
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

export class ElectricGuitarInstrument implements Instrument {
  readonly id = 'electric.main';
  readonly role = 'electric';
  readonly label = 'Atelier · Volt Electric';
  readonly root: THREE.Group;

  private readonly model: LegacyElectricModel;
  private readonly controller: LegacyElectricController;
  private readonly sampler: ElectricGuitarSampler;
  private readonly interactionVoices = new Map<string, InteractionVoice>();
  private pendingStrumHits: number[] = [];
  private pendingDirectPluckString: number | null = null;

  private constructor(
    model: LegacyElectricModel,
    controller: LegacyElectricController,
    sampler: ElectricGuitarSampler,
  ) {
    this.model = model;
    this.controller = controller;
    this.sampler = sampler;
    this.root = model.root;
    this.root.userData.instrumentId = this.id;
  }

  static async create(sampler: ElectricGuitarSampler): Promise<ElectricGuitarInstrument> {
    let instrument: ElectricGuitarInstrument | null = null;
    const { model, controller } = await buildLegacyElectricAsset({
      onHit: (event) => instrument?.playAudio(event),
    });
    instrument = new ElectricGuitarInstrument(model, controller, sampler);
    instrument.setProgram(DEFAULT_ELECTRIC_GUITAR_PROGRAM);
    return instrument;
  }

  noteOn(note: number, velocity: number): void {
    this.controller.api.noteOn(note, velocity);
  }

  noteOff(note: number): void {
    const affectedStrings = [...this.model.strings.values()]
      .filter((string) => string.held && string.note === note)
      .map((string) => string.number);
    if (!this.controller.api.noteOff(note)) return;
    for (const stringNumber of affectedStrings) this.sampler.noteOff(stringNumber);
  }

  pluck(stringNumber: number, velocity = 100, fret = 0): LegacyElectricHitEvent | false {
    this.pendingDirectPluckString = stringNumber;
    try {
      return this.controller.api.pluck(stringNumber, velocity, fret);
    } finally {
      this.pendingDirectPluckString = null;
    }
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
    applyFingeringMarkerStyle(this.model.strings.values(), FINGERING_MARKER_STYLES.electricGuitar);
    return result;
  }

  reset(): void {
    this.controller.api.panic();
    this.sampler.reset();
    this.interactionVoices.clear();
    this.pendingStrumHits = [];
    this.pendingDirectPluckString = null;
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
    if (Math.abs(point.x - stringX) > 0.062) return null;

    let fret = 0;
    if (point.y > this.model.frets[22] - 0.04 && point.y < this.model.nutY - 0.03) {
      for (let index = 1; index <= 22; index += 1) {
        if (point.y <= this.model.frets[index - 1] && point.y > this.model.frets[index]) {
          fret = index;
          break;
        }
      }
      if (point.y <= this.model.frets[22]) fret = 22;
    } else if (point.y <= this.model.frets[22] - 0.04) {
      fret = string.held ? string.fret : 0;
    }

    return `string:${string.number}:${fret}`;
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

    const stringMatch = /^string:([1-6]):(\d{1,2})$/.exec(partId);
    if (!stringMatch) return false;

    if (phase === 'end') {
      const voice = this.interactionVoices.get(partId);
      if (!voice) return true;
      this.interactionVoices.delete(partId);
      this.controller.api.noteOff(voice.note);
      // Direct pointer/keyboard plucks are impulses. Releasing the input only
      // clears the held visual state; the sampler keeps the plucked string's
      // natural decay until it ends, is re-plucked, or is explicitly muted.
      this.sampler.noteOff(voice.stringNumber);
      return true;
    }

    const stringNumber = Number(stringMatch[1]);
    const fret = Number(stringMatch[2]);
    if (fret < 0 || fret > 22) return false;

    const previous = this.interactionVoices.get(partId);
    if (previous) {
      this.controller.api.noteOff(previous.note);
      this.sampler.noteOff(previous.stringNumber);
    }

    const result = this.pluck(stringNumber, velocity, fret);
    if (!result) return false;
    this.interactionVoices.set(partId, {
      note: result.note,
      stringNumber: result.string,
    });
    return true;
  }

  dispose(): void {
    this.reset();
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
    const strum = this.pendingStrumHits[0] === event.string;
    if (strum) this.pendingStrumHits.shift();
    const directPluck = this.pendingDirectPluckString === event.string;
    const gesture = strum ? 'strum' : directPluck ? 'pluck' : 'gated';
    this.sampler.noteOn(event.string, event.note, event.velocity, gesture);
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
