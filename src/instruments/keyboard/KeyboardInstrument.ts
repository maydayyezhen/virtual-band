import * as THREE from 'three';
import type { KeyboardSampler } from '../../audio/KeyboardSampler';
import type { Instrument, InstrumentFrameResult, InstrumentInteraction } from '../Instrument';
import {
  buildLegacyKeyboardAsset,
  type KeyboardTier,
  type LegacyKeyboardKeyRecord,
  type LegacyKeyboardLayer,
  type LegacyKeyboardModel,
  type LegacyKeyboardPedalRecord,
} from './legacyKeyboardAsset';

export class KeyboardInstrument implements Instrument {
  readonly id = 'keyboard.main';
  readonly role = 'keyboard';
  readonly label = 'Atelier · Dual Stage Keys';
  readonly root: THREE.Group;

  private readonly model: LegacyKeyboardModel;
  private readonly sampler: KeyboardSampler;

  private constructor(model: LegacyKeyboardModel, sampler: KeyboardSampler) {
    this.model = model;
    this.sampler = sampler;
    this.root = model.root;
    this.root.userData.instrumentId = this.id;
  }

  static async create(sampler: KeyboardSampler): Promise<KeyboardInstrument> {
    return new KeyboardInstrument(await buildLegacyKeyboardAsset(), sampler);
  }

  noteOn(note: number, velocity: number): void {
    this.noteOnTier(note, velocity, 'lower', 'midi:default');
  }

  noteOff(note: number): void {
    this.noteOffTier(note, 'lower', 'midi:default');
  }

  noteOnTier(note: number, velocity: number, tier: KeyboardTier, source = 'runtime'): boolean {
    const key = this.getKey(note, tier);
    if (!key || !Number.isFinite(velocity)) return false;
    const nextVelocity = Math.max(0, Math.min(127, Math.round(velocity)));
    if (nextVelocity === 0) return this.noteOffTier(note, tier, source);

    key.sources.set(source, nextVelocity);
    this.recalculateKey(key);
    this.changed(tier);
    this.sampler.noteOn(tier, note, nextVelocity, source);
    return true;
  }

  noteOffTier(note: number, tier: KeyboardTier, source = 'runtime'): boolean {
    const key = this.getKey(note, tier);
    if (!key) return false;
    key.sources.delete(source);
    this.recalculateKey(key);
    this.changed(tier);
    this.sampler.noteOff(tier, note, source);
    return true;
  }

  setSustain(pressed: boolean, tier: KeyboardTier = 'lower', source = 'runtime'): boolean {
    this.sampler.setSustain(tier, pressed);
    if (tier !== 'lower') return true;
    return this.setPedal('sustain', pressed, source);
  }

  setPedal(
    id: 'soft' | 'sostenuto' | 'sustain',
    pressed: boolean,
    source = 'runtime',
  ): boolean {
    const pedal = this.model.pedals[id];
    if (!pedal) return false;
    if (pressed) pedal.sources.set(source, true);
    else pedal.sources.delete(source);
    pedal.target = pedal.sources.size ? 1 : 0;
    if (id === 'sustain') this.sampler.setSustain('lower', pedal.target > 0);
    return true;
  }

  controlChange(cc: number, value: number, tier: KeyboardTier = 'lower'): boolean {
    const layer = this.model.layers[tier];
    if (!layer || !Number.isInteger(cc) || !Number.isFinite(value)) return false;
    const normalized = Math.max(0, Math.min(127, Math.round(value)));

    if (cc === 1) {
      layer.modWheel.target = normalized / 127;
      return true;
    }
    if (cc === 64) return this.setSustain(normalized >= 64, tier, `midi:${tier}`);
    if (cc === 66 || cc === 67) {
      if (tier !== 'lower') return true;
      return this.setPedal(cc === 66 ? 'sostenuto' : 'soft', normalized >= 64, `midi:${tier}`);
    }
    if (cc === 120 || cc === 123) {
      this.allNotesOff(tier);
      return true;
    }
    if (cc === 121) {
      layer.pitchWheel.target = 0;
      layer.modWheel.target = 0;
      this.setSustain(false, tier, `midi:${tier}`);
      return true;
    }
    return false;
  }

  setPitchBend(value: number, tier: KeyboardTier = 'upper'): boolean {
    if (!Number.isFinite(value)) return false;
    const layer = this.model.layers[tier];
    if (!layer) return false;
    layer.pitchWheel.target = Math.max(-1, Math.min(1, value));
    return true;
  }

  allNotesOff(tier?: KeyboardTier): void {
    const tiers: KeyboardTier[] = tier ? [tier] : ['lower', 'upper'];
    for (const id of tiers) {
      const layer = this.model.layers[id];
      for (const key of layer.keys.values()) {
        for (const source of [...key.sources.keys()]) this.sampler.noteOff(id, key.note, source);
        key.sources.clear();
        this.recalculateKey(key);
      }
      this.changed(id);
      this.sampler.setSustain(id, false);
    }
  }

  update(dt: number): InstrumentFrameResult {
    let moved = false;
    let animating = false;
    const safeDt = Math.max(0, dt);

    for (const layer of Object.values(this.model.layers)) {
      for (const key of layer.keys.values()) {
        if (key.amount === key.target) continue;
        const rate = key.target ? 29 + key.velocity / 127 * 35 : 31;
        key.amount += (key.target - key.amount) * (1 - Math.exp(-rate * safeDt));
        if (Math.abs(key.target - key.amount) < 0.0008) key.amount = key.target;
        else animating = true;
        key.pivot.rotation.x = key.amount * key.angle;
        moved = true;
      }

      for (const [name, scale] of [['pitchWheel', 0.72], ['modWheel', 1.18]] as const) {
        const wheel = layer[name];
        if (wheel.amount === wheel.target) continue;
        wheel.amount += (wheel.target - wheel.amount) * (1 - Math.exp(-safeDt * 20));
        if (Math.abs(wheel.target - wheel.amount) < 0.0008) wheel.amount = wheel.target;
        else animating = true;
        wheel.pivot.rotation.x = wheel.amount * scale;
        moved = true;
      }
    }

    for (const pedal of Object.values(this.model.pedals)) {
      if (pedal.amount === pedal.target) continue;
      pedal.amount += (pedal.target - pedal.amount) * (1 - Math.exp(-safeDt * 18));
      if (Math.abs(pedal.target - pedal.amount) < 0.0008) pedal.amount = pedal.target;
      else animating = true;
      pedal.pivot.rotation.x = pedal.amount * pedal.angle;
      moved = true;
    }

    return { moved, animating };
  }

  reset(): void {
    this.sampler.reset();
    for (const tier of ['lower', 'upper'] as KeyboardTier[]) {
      const layer = this.model.layers[tier];
      for (const key of layer.keys.values()) {
        key.sources.clear();
        key.target = 0;
      }
      layer.pitchWheel.target = 0;
      layer.modWheel.target = 0;
      this.changed(tier);
    }
    for (const pedal of Object.values(this.model.pedals)) {
      pedal.sources.clear();
      pedal.target = 0;
    }
  }

  interact({ partId, velocity, phase }: InstrumentInteraction): boolean {
    const keyMatch = /^key:(lower|upper):(\d+)$/.exec(partId);
    if (keyMatch) {
      const tier = keyMatch[1] as KeyboardTier;
      const note = Number(keyMatch[2]);
      const source = `interaction:${partId}`;
      return phase === 'start'
        ? this.noteOnTier(note, velocity, tier, source)
        : this.noteOffTier(note, tier, source);
    }

    const pedalMatch = /^pedal:(soft|sostenuto|sustain)$/.exec(partId);
    if (pedalMatch) {
      const id = pedalMatch[1] as 'soft' | 'sostenuto' | 'sustain';
      return this.setPedal(id, phase === 'start', `interaction:${partId}`);
    }

    return false;
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

  private getKey(note: number, tier: KeyboardTier): LegacyKeyboardKeyRecord | null {
    if (!Number.isInteger(note)) return null;
    return this.model.layers[tier]?.keys.get(note) ?? null;
  }

  private recalculateKey(key: LegacyKeyboardKeyRecord): void {
    key.target = key.sources.size ? 1 : 0;
    if (key.sources.size) key.velocity = Math.max(...key.sources.values());
  }

  private changed(tier: KeyboardTier): void {
    const layer = this.model.layers[tier];
    const notes = [...layer.keys.values()]
      .filter((key) => key.sources.size > 0)
      .map((key) => key.note);
    this.model.drawScreen(layer, notes);
  }
}
