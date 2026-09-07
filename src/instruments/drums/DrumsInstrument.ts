import * as THREE from 'three';
import type { DrumSampler } from '../../audio/DrumSampler';
import type { Instrument, InstrumentFrameResult, InstrumentInteraction } from '../Instrument';
import {
  buildLegacyDrumAsset,
  type LegacyDrumController,
  type LegacyDrumHitEvent,
} from './legacyDrumAsset';

const PART_NOTE: Record<string, number> = {
  kick: 36,
  kickPedal: 36,
  snare: 38,
  floorTom: 43,
  tomMid: 47,
  tomHigh: 50,
  hihat: 42,
  hatPedal: 44,
  crashLeft: 49,
  crashRight: 57,
  ride: 51,
  splash: 55,
};

type HitListener = (event: LegacyDrumHitEvent) => void;
type PanicListener = () => void;

export class DrumsInstrument implements Instrument {
  readonly id = 'drums.main';
  readonly role = 'drums';
  readonly label = 'Atelier Session 04 · Band Drums';
  readonly root: THREE.Group;

  private readonly controller: LegacyDrumController;
  private readonly sampler: DrumSampler;
  private readonly hitListeners: Set<HitListener>;
  private readonly panicListeners: Set<PanicListener>;

  private constructor(
    root: THREE.Group,
    controller: LegacyDrumController,
    sampler: DrumSampler,
    hitListeners: Set<HitListener>,
    panicListeners: Set<PanicListener>,
  ) {
    this.root = root;
    this.root.userData.instrumentId = this.id;
    this.controller = controller;
    this.sampler = sampler;
    this.hitListeners = hitListeners;
    this.panicListeners = panicListeners;
  }

  static async create(sampler: DrumSampler): Promise<DrumsInstrument> {
    const hitListeners = new Set<HitListener>();
    const panicListeners = new Set<PanicListener>();
    const { model, controller } = await buildLegacyDrumAsset({
      onHit: (event) => {
        for (const listener of hitListeners) listener(event);
      },
      onPanic: () => {
        for (const listener of panicListeners) listener();
      },
    });
    return new DrumsInstrument(model.root, controller, sampler, hitListeners, panicListeners);
  }

  noteOn(note: number, velocity: number): void {
    const accepted = this.controller.noteOn(note, velocity);
    if (!accepted) return;
    this.sampler.noteOn(note, velocity);
  }

  noteOff(note: number): void {
    this.controller.noteOff(note);
  }

  update(dt: number): InstrumentFrameResult {
    return this.controller.tick(dt);
  }

  reset(): void {
    this.controller.panic();
  }

  setHiHat(openness: number): boolean {
    return this.controller.setHiHat(openness);
  }

  controlChange(cc: number, value: number): boolean {
    return this.controller.controlChange(cc, value);
  }

  choke(id: string | number): boolean {
    return this.controller.choke(id);
  }

  subscribeHit(listener: HitListener): () => void {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }

  subscribePanic(listener: PanicListener): () => void {
    this.panicListeners.add(listener);
    return () => this.panicListeners.delete(listener);
  }

  interact({ partId, velocity, phase }: InstrumentInteraction): boolean {
    const note = PART_NOTE[partId];
    if (note === undefined) return false;

    if (phase === 'start') {
      this.noteOn(note, velocity);
      return true;
    }

    this.noteOff(note);
    if (partId === 'hatPedal') this.setHiHat(0.8);
    return true;
  }

  dispose(): void {
    this.controller.panic();
    this.hitListeners.clear();
    this.panicListeners.clear();
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
