import * as THREE from 'three';
import type { AcousticGuitarSampler } from '../../audio/AcousticGuitarSampler';
import {
  DEFAULT_ACOUSTIC_GUITAR_PROGRAM,
  getAcousticGuitarProgram,
  type AcousticGuitarProgramId,
} from '../../audio/AcousticGuitarProgram';
import type { Instrument, InstrumentFrameResult, InstrumentInteraction } from '../Instrument';
import {
  applyFingeringMarkerStyle,
  FINGERING_MARKER_STYLES,
} from '../shared/FingeringMarkerStyle';
import {
  buildLegacyAcousticAsset,
  type AcousticStrumDirection,
  type LegacyAcousticController,
  type LegacyAcousticHitEvent,
  type LegacyAcousticModel,
} from './legacyAcousticAsset';

interface InteractionVoice {
  note: number;
  stringNumber: number;
}

export class AcousticGuitarInstrument implements Instrument {
  readonly id = 'acoustic.main';
  readonly role = 'acoustic';
  readonly label = 'Atelier · Acoustic 01';
  readonly root: THREE.Group;

  private readonly model: LegacyAcousticModel;
  private readonly controller: LegacyAcousticController;
  private readonly sampler: AcousticGuitarSampler;
  private readonly interactionVoices = new Map<string, InteractionVoice>();
  private pendingStrumHits: number[] = [];
  private pendingDirectPluckString: number | null = null;

  private constructor(
    model: LegacyAcousticModel,
    controller: LegacyAcousticController,
    sampler: AcousticGuitarSampler,
  ) {
    this.model = model;
    this.controller = controller;
    this.sampler = sampler;
    this.root = model.root;
    this.root.userData.instrumentId = this.id;
  }

  static async create(sampler: AcousticGuitarSampler): Promise<AcousticGuitarInstrument> {
    let instrument: AcousticGuitarInstrument | null = null;
    const { model, controller } = await buildLegacyAcousticAsset({
      onHit: (event) => instrument?.playAudio(event),
    });
    instrument = new AcousticGuitarInstrument(model, controller, sampler);
    instrument.setProgram(DEFAULT_ACOUSTIC_GUITAR_PROGRAM);
    return instrument;
  }

  noteOn(note: number, velocity: number): void {
    this.controller.api.noteOn(note, velocity);
  }

  noteOff(note: number): void {
    const affectedStrings = this.controller.api.getFingering()
      .filter((fingering) => fingering.note === note)
      .map((fingering) => fingering.string);
    if (!this.controller.api.noteOff(note)) return;
    for (const stringNumber of affectedStrings) this.sampler.noteOff(stringNumber);
  }

  pluck(stringNumber: number, velocity = 100, fret = 0): LegacyAcousticHitEvent | false {
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
    direction: AcousticStrumDirection = 'down',
  ): boolean {
    const handled = this.controller.api.strum(frets, velocity, direction);
    if (!handled) {
      this.pendingStrumHits = [];
      return false;
    }

    // The donor emits the six strikes later from tick(). Explicitly damp the
    // previous physical-string voices now, then tag those delayed hits as
    // impulses so each new strike gets its own natural decay lifecycle.
    for (let stringNumber = 1; stringNumber <= 6; stringNumber += 1) {
      this.sampler.muteString(stringNumber, 0.04);
    }
    this.pendingStrumHits = strumStringOrder(frets, direction);
    return true;
  }

  get program(): AcousticGuitarProgramId {
    return this.sampler.program;
  }

  setProgram(value: number): boolean {
    const preset = getAcousticGuitarProgram(value);
    if (!preset) return false;
    return this.sampler.setProgram(preset.id);
  }

  programChange(value: number): boolean {
    return this.setProgram(value);
  }

  setPitchBend(value: number): boolean {
    if (!this.controller.api.setPitchBend(value)) return false;
    return this.sampler.setPitchBend(value);
  }

  controlChange(cc: number, value: number): boolean {
    if (!Number.isInteger(cc) || cc < 0 || cc > 127) return false;
    if (!Number.isInteger(value) || value < 0 || value > 127) return false;

    if (cc === 7) {
      this.sampler.setVolume(value / 127);
      return true;
    }

    const activeBefore = this.controller.api.getFingering().map((fingering) => fingering.string);
    const handled = this.controller.api.controlChange(cc, value);
    if (!handled) return false;

    if (cc === 64) this.sampler.setSustain(value >= 64);
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
    applyFingeringMarkerStyle(this.model.strings.values(), FINGERING_MARKER_STYLES.acousticGuitar);
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
    const point = this.root.worldToLocal(intersection.point.clone());
    const lastFret = this.model.frets.length - 1;
    const bodyPluckZone = point.y <= this.model.frets[lastFret] - 0.04;

    if (
      point.y < this.model.bridgeY - 0.16
      || point.y > this.model.nutY + 0.08
      || (
        point.z < 0.48
        && !(bodyPluckZone && isFrontFacingInteraction(intersection, this.root))
      )
    ) return null;

    const t = THREE.MathUtils.clamp(
      (point.y - this.model.bridgeY) / (this.model.nutY - this.model.bridgeY),
      0,
      1,
    );
    const strings = [...this.model.strings.values()].sort((a, b) => {
      const ax = THREE.MathUtils.lerp(a.a.x, a.b.x, t);
      const bx = THREE.MathUtils.lerp(b.a.x, b.b.x, t);
      return Math.abs(point.x - ax) - Math.abs(point.x - bx);
    });
    const string = strings[0];
    if (!string) return null;

    const stringX = THREE.MathUtils.lerp(string.a.x, string.b.x, t);
    const hitTolerance = bodyPluckZone ? 0.105 : 0.072;
    if (Math.abs(point.x - stringX) > hitTolerance) return null;

    let fret = 0;
    if (point.y > this.model.frets[lastFret] - 0.04 && point.y < this.model.nutY - 0.025) {
      for (let index = 1; index <= lastFret; index += 1) {
        if (point.y <= this.model.frets[index - 1] && point.y > this.model.frets[index]) {
          fret = index;
          break;
        }
      }
      if (point.y <= this.model.frets[lastFret]) fret = lastFret;
    } else if (bodyPluckZone) {
      const held = this.controller.api.getFingering().find((item) => item.string === string.number);
      fret = held?.fret ?? 0;
    }

    return `string:${string.number}:${fret}`;
  }

  interact({ partId, velocity, phase }: InstrumentInteraction): boolean {
    const stringMatch = /^string:([1-6]):(\d{1,2})$/.exec(partId);
    if (!stringMatch) return false;

    if (phase === 'end') {
      const voice = this.interactionVoices.get(partId);
      if (!voice) return true;
      this.interactionVoices.delete(partId);
      this.controller.api.noteOff(voice.note);
      // Manual plucks are impulses: pointer/key release only releases the visual
      // fingering state. AcousticGuitarSampler.noteOff intentionally ignores the
      // impulse voice so the string can keep decaying naturally.
      this.sampler.noteOff(voice.stringNumber);
      return true;
    }

    const stringNumber = Number(stringMatch[1]);
    const fret = Number(stringMatch[2]);
    if (fret < 0 || fret > 20) return false;

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
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }

  private playAudio(event: LegacyAcousticHitEvent): void {
    const strum = this.pendingStrumHits[0] === event.string;
    if (strum) this.pendingStrumHits.shift();
    const directPluck = this.pendingDirectPluckString === event.string;
    const gesture = strum ? 'strum' : directPluck ? 'pluck' : 'gated';
    this.sampler.noteOn(event.string, event.note, event.velocity, gesture);
  }
}

function strumStringOrder(
  frets: Array<number | null>,
  direction: AcousticStrumDirection,
): number[] {
  const indices = direction === 'down' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
  return indices
    .filter((index) => frets[index] !== null)
    .map((index) => 6 - index);
}

function isFrontFacingInteraction(
  intersection: THREE.Intersection,
  root: THREE.Object3D,
): boolean {
  if (!intersection.face) return false;

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld);
  const worldNormal = intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize();
  const rootWorldRotation = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const localNormal = worldNormal.applyQuaternion(rootWorldRotation);
  return localNormal.z > 0.15;
}
