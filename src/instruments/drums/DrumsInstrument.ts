import * as THREE from 'three';
import {
  DEFAULT_DRUM_KIT,
  DRUM_KIT_IDS,
  getDrumKit,
  type DrumKitId,
} from '../../audio/DrumProgram';
import { HI_HAT_NOTES, type DrumSampler } from '../../audio/DrumSampler';
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
  hatPedal: HI_HAT_NOTES.pedal,
  crashLeft: 49,
  crashRight: 57,
  ride: 51,
  splash: 55,
};

const HI_HAT_CLOSED_MAX = 0.16;

/**
 * Parts that carry two sounds depending on where they are struck.
 *
 * `innerFraction` is how much of the part's radius counts as the inner zone: 0 is dead centre and
 * 1 is the outer edge. Both pairs are real performance distinctions rather than fallbacks:
 *
 * - A side stick is the snare struck out on the rim, so it reads well away from the centre.
 * - A ride's bell is the raised dome in the middle; everything outside it is the bow.
 */
const PART_ZONE: Readonly<Record<string, { inner: number; outer: number; innerFraction: number }>> =
  Object.freeze({
    snare: { inner: 38, outer: 37, innerFraction: 0.62 },
    ride: { inner: 53, outer: 51, innerFraction: 0.38 },
  });
const HI_HAT_MOUSE_OPENNESS = 0.8;

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

  private hiHatOpenness = 0;
  private interactiveHiHatNote: number | null = null;

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
    const instrument = new DrumsInstrument(model.root, controller, sampler, hitListeners, panicListeners);
    instrument.setProgram(DEFAULT_DRUM_KIT);
    return instrument;
  }

  private kitId: DrumKitId = DEFAULT_DRUM_KIT;

  get program(): DrumKitId {
    return this.kitId;
  }

  /**
   * Swap the kit. Every GM2 percussion preset shares one note map, so no hit can land on the
   * wrong piece; only the sound changes. The model keeps its acoustic look either way, which is
   * a mismatch for the electronic kits but harmless for the acoustic ones.
   */
  setProgram(value: number): boolean {
    const kit = getDrumKit(value);
    if (!kit) return false;
    if (!this.sampler.setProgram(kit.id)) return false;
    this.kitId = kit.id;
    return true;
  }

  stepProgram(delta: -1 | 1): DrumKitId {
    const index = DRUM_KIT_IDS.indexOf(this.kitId);
    const next = (index + delta + DRUM_KIT_IDS.length) % DRUM_KIT_IDS.length;
    this.setProgram(DRUM_KIT_IDS[next]);
    return this.kitId;
  }

  noteOn(note: number, velocity: number): void {
    const accepted = this.controller.noteOn(note, velocity);
    if (!accepted) {
      // The kit has no piece for this note, so nothing can move — but the percussion bank does
      // hold a sample for it. Sound it anyway rather than dropping it silently: there are 27
      // notes like this (hand clap, tambourine, cowbell, the Latin percussion, the effects) and
      // several of them are common in ordinary MIDI. A piece that sounds without moving beats a
      // note that is simply missing.
      this.sampler.noteOn(note, velocity);
      return;
    }

    if (note === HI_HAT_NOTES.closed || note === HI_HAT_NOTES.pedal) {
      this.hiHatOpenness = 0;
      this.sampler.setHiHatOpenness(0);
    } else if (note === HI_HAT_NOTES.open) {
      this.hiHatOpenness = Math.max(0.78, this.hiHatOpenness);
      this.sampler.setHiHatOpenness(this.hiHatOpenness);
    }

    this.sampler.noteOn(note, velocity);
  }

  noteOff(note: number): void {
    this.controller.noteOff(note);
  }

  update(dt: number): InstrumentFrameResult {
    return this.controller.tick(dt);
  }

  reset(): void {
    this.hiHatOpenness = 0;
    this.interactiveHiHatNote = null;
    this.sampler.resetHiHat();
    this.controller.panic();
  }

  setHiHat(openness: number): boolean {
    if (!Number.isFinite(openness)) return false;
    const next = Math.max(0, Math.min(1, openness));
    const accepted = this.controller.setHiHat(next);
    if (!accepted) return false;

    this.hiHatOpenness = next;
    this.sampler.setHiHatOpenness(next);
    return true;
  }

  controlChange(cc: number, value: number): boolean {
    if (cc === 4 && Number.isInteger(value) && value >= 0 && value <= 127) {
      // GM/foot-controller convention used by the donor: 0=open, 127=closed.
      return this.setHiHat(1 - value / 127);
    }

    const accepted = this.controller.controlChange(cc, value);
    if (!accepted) return false;

    if (cc === 120 || cc === 121) {
      this.hiHatOpenness = 0;
      this.interactiveHiHatNote = null;
      this.sampler.resetHiHat();
    }
    return true;
  }

  choke(id: string | number): boolean {
    const accepted = this.controller.choke(id);
    if (
      id === 'hihat'
      || id === HI_HAT_NOTES.closed
      || id === HI_HAT_NOTES.pedal
      || id === HI_HAT_NOTES.open
    ) this.sampler.chokeHiHat();
    return accepted;
  }

  subscribeHit(listener: HitListener): () => void {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }

  subscribePanic(listener: PanicListener): () => void {
    this.panicListeners.add(listener);
    return () => this.panicListeners.delete(listener);
  }

  interact({ partId, velocity, phase, point }: InstrumentInteraction): boolean {
    if (partId === 'hihat') {
      if (phase === 'start') return this.strikePhysicalHiHat(velocity);
      if (this.interactiveHiHatNote !== null) this.controller.noteOff(this.interactiveHiHatNote);
      this.interactiveHiHatNote = null;
      return true;
    }

    if (partId === 'hatPedal') {
      if (phase === 'end') {
        this.noteOff(HI_HAT_NOTES.pedal);
        return true;
      }

      if (this.hiHatOpenness <= HI_HAT_CLOSED_MAX) {
        return this.setHiHat(HI_HAT_MOUSE_OPENNESS);
      }

      this.noteOn(HI_HAT_NOTES.pedal, velocity);
      return true;
    }

    const note = point ? this.zoneNote(partId, point) : PART_NOTE[partId];
    if (note === undefined) return false;

    if (phase === 'start') {
      this.noteOn(note, velocity);
      return true;
    }

    this.noteOff(note);
    return true;
  }

  /**
   * Which note a struck point produces on a two-sound part.
   *
   * The part's own meshes supply the frame, so no world coordinates are hard-coded: the point is
   * measured against the combined bounding box of every mesh carrying this part id, in the plane
   * of the head. Falls back to the part's single note for anything without zones.
   */
  private zoneNote(partId: string, point: readonly [number, number, number]): number | undefined {
    const zone = PART_ZONE[partId];
    if (!zone) return PART_NOTE[partId];

    this.root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    this.root.traverse((node) => {
      if (node.userData?.hit === partId) bounds.expandByObject(node);
    });
    if (bounds.isEmpty()) return PART_NOTE[partId];

    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) / 2;
    if (radius <= 1e-4) return PART_NOTE[partId];

    const radial = Math.hypot(point[0] - centre.x, point[2] - centre.z) / radius;
    return radial <= zone.innerFraction ? zone.inner : zone.outer;
  }

  dispose(): void {
    this.sampler.resetHiHat();
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

  private strikePhysicalHiHat(velocity: number): boolean {
    const openness = this.hiHatOpenness;
    const visualNote = openness <= HI_HAT_CLOSED_MAX
      ? HI_HAT_NOTES.closed
      : HI_HAT_NOTES.open;

    const accepted = this.controller.noteOn(visualNote, velocity);
    if (!accepted) return false;

    // The frozen donor uses note 42/46 both as articulation and as a state hint.
    // A physical 3D strike must not move the pedal, so immediately restore the
    // continuous pedal position after injecting the hit energy into the donor.
    this.controller.setHiHat(openness);
    this.sampler.setHiHatOpenness(openness);
    this.sampler.hitHiHat(openness, velocity);
    this.interactiveHiHatNote = visualNote;
    return true;
  }
}
