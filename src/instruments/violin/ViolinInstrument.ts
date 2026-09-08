import * as THREE from 'three';
import type { ViolinSampler } from '../../audio/ViolinSampler';
import type { Instrument, InstrumentFrameResult, InstrumentInteraction } from '../Instrument';
import {
  applyFingeringMarkerStyle,
  FINGERING_MARKER_STYLES,
} from '../shared/FingeringMarkerStyle';
import {
  buildLegacyViolinAsset,
  type LegacyViolinController,
  type LegacyViolinHitEvent,
  type LegacyViolinModel,
  type LegacyViolinStringRecord,
  type ViolinArticulation,
} from './legacyViolinAsset';

interface InteractionVoice {
  note: number;
  stringNumber: number;
}

interface VisualReleaseTail {
  readonly durationSeconds: number;
  readonly startEnergy: number;
  elapsedSeconds: number;
}

export class ViolinInstrument implements Instrument {
  readonly id = 'violin.main';
  readonly role = 'violin';
  readonly label = 'Atelier · Arco Violin';
  readonly root: THREE.Group;

  private readonly model: LegacyViolinModel;
  private readonly controller: LegacyViolinController;
  private readonly sampler: ViolinSampler;
  private readonly interactionVoices = new Map<string, InteractionVoice>();
  private readonly releaseTails = new Map<number, VisualReleaseTail>();

  private constructor(
    model: LegacyViolinModel,
    controller: LegacyViolinController,
    sampler: ViolinSampler,
  ) {
    this.model = model;
    this.controller = controller;
    this.sampler = sampler;
    this.root = model.root;
    this.root.userData.instrumentId = this.id;
  }

  static async create(sampler: ViolinSampler): Promise<ViolinInstrument> {
    const { model, controller } = await buildLegacyViolinAsset();
    return new ViolinInstrument(model, controller, sampler);
  }

  noteOn(note: number, velocity: number): void {
    const result = this.controller.api.noteOn(note, velocity);
    if (result) this.playAudio(result);
  }

  noteOff(note: number): void {
    const affectedStrings = [...this.model.strings.values()]
      .filter((string) => string.held && string.note === note)
      .map((string) => string.number);
    if (!this.controller.api.noteOff(note)) return;
    for (const stringNumber of affectedStrings) {
      this.beginReleaseTail(stringNumber, this.sampler.noteOff(stringNumber));
    }
  }

  playString(stringNumber: number, velocity = 100, semitones = 0): LegacyViolinHitEvent | false {
    const result = this.controller.api.playString(stringNumber, velocity, semitones);
    if (result) this.playAudio(result);
    return result;
  }

  setArticulation(value: ViolinArticulation): boolean {
    if (!this.controller.api.setArticulation(value)) return false;

    // Audio is an adapter around the donor performance state. If articulation is
    // changed while notes are held, replace the sounding sample on each physical
    // string without touching the donor fingering/bow state.
    this.releaseTails.clear();
    this.sampler.reset();
    for (const string of this.model.strings.values()) {
      if (!string.held || string.note === null) continue;
      this.sampler.noteOn(
        string.number,
        string.note,
        Math.round(string.velocity * 127),
        value,
      );
    }
    return true;
  }

  setVibrato(value: number): boolean {
    return this.controller.api.setVibrato(value);
  }

  setBow(options: { speed?: number; pressure?: number }): boolean {
    return this.controller.api.setBow(options);
  }

  setPitchBend(value: number): boolean {
    const visualHandled = this.controller.api.setPitchBend(value);
    if (!visualHandled) return false;
    this.sampler.setPitchBend(value);
    return true;
  }

  controlChange(cc: number, value: number): boolean {
    const handled = this.controller.api.controlChange(cc, value);
    if (!handled) return false;
    if (cc === 120 || cc === 123) {
      this.releaseTails.clear();
      this.sampler.reset();
    }
    return true;
  }

  get articulation(): ViolinArticulation {
    return this.controller.api.articulation;
  }

  get activeNotes(): number[] {
    return this.controller.api.activeNotes;
  }

  update(dt: number): InstrumentFrameResult {
    const result = this.controller.tick(dt);
    const releaseMoved = this.syncReleaseTailVisuals(dt);
    applyFingeringMarkerStyle(this.model.strings.values(), FINGERING_MARKER_STYLES.violin);
    return {
      moved: result.moved || releaseMoved,
      animating: result.animating || this.releaseTails.size > 0,
    };
  }

  reset(): void {
    this.releaseTails.clear();
    this.controller.api.panic();
    this.sampler.reset();
    this.interactionVoices.clear();
  }

  resolveHit(intersection: THREE.Intersection): string | null {
    let node: THREE.Object3D | null = intersection.object;
    while (node && node !== this.root) {
      if (node === this.model.bow) return null;
      node = node.parent;
    }

    const point = this.root.worldToLocal(intersection.point.clone());
    if (
      point.z < 0.375
      || point.y < this.model.bridgeY - 0.04
      || point.y > this.model.nutY + 0.055
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
    if (Math.abs(point.x - stringX) > 0.051) return null;

    let semitones = 0;
    if (point.y >= this.model.boardEnd && point.y < this.model.nutY - 0.05) {
      semitones = THREE.MathUtils.clamp(
        Math.round(-12 * Math.log2((point.y - this.model.bridgeY) / this.model.scale)),
        0,
        24,
      );
    } else if (point.y < this.model.boardEnd) {
      semitones = string.held ? string.interval : 0;
    }

    return `string:${string.number}:${semitones}`;
  }

  interact({ partId, velocity, phase }: InstrumentInteraction): boolean {
    const match = /^string:([1-4]):(\d{1,2})$/.exec(partId);
    if (!match) return false;

    if (phase === 'end') {
      const voice = this.interactionVoices.get(partId);
      if (!voice) return true;
      this.interactionVoices.delete(partId);
      this.controller.api.noteOff(voice.note);
      this.beginReleaseTail(voice.stringNumber, this.sampler.noteOff(voice.stringNumber));
      return true;
    }

    const stringNumber = Number(match[1]);
    const semitones = Number(match[2]);
    if (semitones < 0 || semitones > 24) return false;

    const previous = this.interactionVoices.get(partId);
    if (previous) {
      this.controller.api.noteOff(previous.note);
      this.beginReleaseTail(previous.stringNumber, this.sampler.noteOff(previous.stringNumber));
    }

    const result = this.playString(stringNumber, velocity, semitones);
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

  private playAudio(result: LegacyViolinHitEvent): void {
    this.releaseTails.delete(result.string);
    this.sampler.noteOn(
      result.string,
      result.note,
      result.velocity,
      this.controller.api.articulation,
    );
  }

  private beginReleaseTail(stringNumber: number, durationSeconds: number): void {
    const string = this.model.strings.get(stringNumber);
    if (!string || durationSeconds <= 0 || this.controller.api.articulation !== 'arco') {
      this.releaseTails.delete(stringNumber);
      return;
    }

    this.releaseTails.set(stringNumber, {
      durationSeconds,
      startEnergy: Math.max(0, string.energy),
      elapsedSeconds: 0,
    });
  }

  private syncReleaseTailVisuals(dt: number): boolean {
    if (this.releaseTails.size === 0) return false;
    const frameDt = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    let moved = false;

    for (const [stringNumber, tail] of [...this.releaseTails]) {
      const string = this.model.strings.get(stringNumber);
      if (!string || string.held) {
        this.releaseTails.delete(stringNumber);
        continue;
      }

      tail.elapsedSeconds = Math.min(tail.durationSeconds, tail.elapsedSeconds + frameDt);
      const progress = tail.durationSeconds > 0
        ? Math.max(0, 1 - tail.elapsedSeconds / tail.durationSeconds)
        : 0;
      string.energy = tail.startEnergy * progress;
      this.redrawStringVibration(string);
      moved = true;

      if (progress <= 0) this.releaseTails.delete(stringNumber);
    }

    return moved;
  }

  /**
   * The frozen donor already exposes stringPoint(), so the adapter can redraw the
   * dynamic tube after overriding only release-tail energy. This keeps donor code
   * frozen and avoids making the audio backend aware of Three.js visuals.
   */
  private redrawStringVibration(string: LegacyViolinStringRecord): void {
    const positions = string.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let row = 0; row <= string.rows; row += 1) {
      const y = THREE.MathUtils.lerp(string.saddle.y, string.nut.y, row / string.rows);
      const point = this.controller.stringPoint(string, y, true);
      for (let side = 0; side <= string.sides; side += 1) {
        const angle = side / string.sides * Math.PI * 2;
        positions.setXYZ(
          row * (string.sides + 1) + side,
          point.x + Math.cos(angle) * string.radius,
          y,
          point.z + Math.sin(angle) * string.radius,
        );
      }
    }
    positions.needsUpdate = true;
    string.mesh.geometry.computeBoundingSphere();

    const materials = Array.isArray(string.mesh.material)
      ? string.mesh.material
      : [string.mesh.material];
    for (const material of materials) {
      if ('emissiveIntensity' in material) {
        (material as THREE.MeshStandardMaterial).emissiveIntensity = string.energy * 0.12;
      }
    }
  }
}
