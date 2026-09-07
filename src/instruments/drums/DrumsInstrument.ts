import * as THREE from 'three';
import type { DrumSampler } from '../../audio/DrumSampler';
import type { Instrument, InstrumentInteraction } from '../Instrument';
import { buildLegacyDrumAsset, type LegacyDrumController } from './legacyDrumAsset';

const PART_NOTE: Record<string, number> = {
  kick: 36,
  kickPedal: 36,
  snare: 38,
  floorTom: 43,
  tomMid: 47,
  tomHigh: 50,
  crashLeft: 49,
  crashRight: 57,
  ride: 51,
  splash: 55,
};

export class DrumsInstrument implements Instrument {
  readonly id = 'drums.main';
  readonly role = 'drums';
  readonly label = 'Atelier Session 04 · Band Drums';
  readonly root: THREE.Group;

  private readonly controller: LegacyDrumController;
  private readonly sampler: DrumSampler;
  private hiHatOpen = false;

  private constructor(root: THREE.Group, controller: LegacyDrumController, sampler: DrumSampler) {
    this.root = root;
    this.root.userData.instrumentId = this.id;
    this.controller = controller;
    this.sampler = sampler;
  }

  static async create(sampler: DrumSampler): Promise<DrumsInstrument> {
    const { model, controller } = await buildLegacyDrumAsset();
    return new DrumsInstrument(model.root, controller, sampler);
  }

  noteOn(note: number, velocity: number): void {
    const accepted = this.controller.noteOn(note, velocity);
    if (!accepted) return;

    if (note === 42 || note === 44) this.hiHatOpen = false;
    else if (note === 46) this.hiHatOpen = true;

    this.sampler.noteOn(note, velocity);
  }

  noteOff(note: number): void {
    this.controller.noteOff(note);
  }

  update(dt: number): void {
    this.controller.tick(dt);
  }

  reset(): void {
    this.hiHatOpen = false;
    this.controller.panic();
  }

  interact({ partId, intensity }: InstrumentInteraction): boolean {
    const velocity = Math.round(72 + Math.min(1, Math.max(0, intensity)) * 55);

    if (partId === 'hatPedal') {
      this.hiHatOpen = !this.hiHatOpen;
      const changed = this.controller.setHiHat(this.hiHatOpen ? 1 : 0);
      if (!changed) return false;

      // Closing the real pedal produces the characteristic foot-chick (GM note 44).
      if (!this.hiHatOpen) this.noteOn(44, velocity);
      return true;
    }

    const note = partId === 'hihat' ? (this.hiHatOpen ? 46 : 42) : PART_NOTE[partId];
    if (note === undefined) return false;

    this.noteOn(note, velocity);
    return true;
  }

  dispose(): void {
    this.controller.panic();
    this.root.removeFromParent();

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
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
}
