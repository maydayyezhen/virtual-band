import * as THREE from 'three';
import type { BandAudioGraph } from '../../audio/BandAudioGraph';
import type { Instrument, InstrumentRegistry } from '../../instruments/Instrument';
import { createInstrumentInstance, type InstrumentDescriptor } from '../../instruments/InstrumentDefinitions';
import { INSTRUMENT_ASSETS } from '../../instruments/InstrumentAssets';
import type { BandInstrumentType } from '../../midi';
import type { BandPlan } from '../../midi/planBand';

export interface BuiltInstrument {
  readonly type: BandInstrumentType;
  /** Zero-based among instruments of this type, matching `TrackAssignment.instance`. */
  readonly instance: number;
  /** Catalog asset chosen for this stage instance; unrelated to its MIDI program. */
  readonly assetId: string;
  readonly instrument: Instrument;
  readonly dispose: () => void;
}

export interface BuiltBand {
  readonly root: THREE.Group;
  readonly built: readonly BuiltInstrument[];
  /** `type.instance` to the instrument, so the player can address one directly. */
  readonly byKey: ReadonlyMap<string, BuiltInstrument>;
  /** Roll back newly created resources only; reused instances remain owned by the live registry. */
  discard(): void;
}

export async function buildMidiBand(plan: BandPlan, graph: BandAudioGraph, existing?: InstrumentRegistry): Promise<BuiltBand> {
  const root = new THREE.Group();
  root.name = 'MIDI band';
  const built: BuiltInstrument[] = [];
  const byKey = new Map<string, BuiltInstrument>();
  const disposers: Array<() => void> = [];

  try {
    for (const entry of plan.instruments) {
      const assets = INSTRUMENT_ASSETS.filter(asset => asset.type === entry.type);
      if (!assets.length) throw new Error(`缺少乐器资产：${entry.type}`);
      const used = new Set<string>();
      for (let instance = 0; instance < entry.count; instance += 1) {
        const id = instance === 0 ? `${entry.type}.main` : `${entry.type}.${instance + 1}`;
        const previous = existing?.get(id);
        const variant = previous && 'variant' in previous ? previous.variant : undefined;
        const previousAsset = previous?.role === entry.type
          ? assets.find(asset => asset.variant === variant) ?? assets[0] : undefined;
        // Keep an existing choice when possible, but exhaust the catalog before repeating a style.
        if (used.size === assets.length) used.clear();
        const asset = previousAsset && !used.has(previousAsset.id)
          ? previousAsset : assets.find(candidate => !used.has(candidate.id))!;
        used.add(asset.id);
        const descriptor: InstrumentDescriptor = {
          type: entry.type,
          id,
          variant: asset.variant,
        };
        const reused = previousAsset?.id === asset.id ? previous : undefined;
        const instrument = reused ?? await createInstrumentInstance(descriptor, graph.live);
        const record: BuiltInstrument = {
          type: entry.type,
          instance,
          assetId: asset.id,
          instrument,
          dispose: () => instrument.dispose(),
        };
        built.push(record);
        byKey.set(`${entry.type}.${instance}`, record);
        if (!reused) { disposers.push(record.dispose); root.add(instrument.root); }
      }
    }
  } catch (error) {
    for (const dispose of disposers) dispose();
    throw error;
  }

  return {
    root,
    built,
    byKey,
    discard: () => {
      for (const dispose of disposers) dispose();
      root.removeFromParent();
    },
  };
}
