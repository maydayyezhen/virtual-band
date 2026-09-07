import * as THREE from 'three';
import type { Instrument, InstrumentInteraction } from '../Instrument';
import { buildLegacyDrumAsset, type LegacyDrumController } from './legacyDrumAsset';

export class DrumsInstrument implements Instrument {
  readonly id = 'drums.main';
  readonly role = 'drums';
  readonly label = 'Atelier Session 04 · Band Drums';
  readonly root: THREE.Group;

  private readonly controller: LegacyDrumController;
  private hiHatOpen = false;

  private constructor(root: THREE.Group, controller: LegacyDrumController) {
    this.root = root;
    this.root.userData.instrumentId = this.id;
    this.controller = controller;
  }

  static async create(): Promise<DrumsInstrument> {
    const { model, controller } = await buildLegacyDrumAsset();
    return new DrumsInstrument(model.root, controller);
  }

  noteOn(note: number, velocity: number): void {
    this.controller.noteOn(note, velocity);
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
    if (partId === 'hatPedal') {
      this.hiHatOpen = !this.hiHatOpen;
      return this.controller.setHiHat(this.hiHatOpen ? 1 : 0);
    }

    const resolvedPart = partId === 'kickPedal' ? 'kick' : partId;
    const velocity = Math.round(72 + Math.min(1, Math.max(0, intensity)) * 55);
    return this.controller.hit(resolvedPart, velocity);
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
