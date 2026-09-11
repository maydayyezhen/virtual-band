import * as THREE from 'three';
import type { BandAudioGraph } from '../../audio/BandAudioGraph';
import { DEFAULT_ACOUSTIC_GUITAR_PROGRAM } from '../../audio/AcousticGuitarProgram';
import { AcousticGuitarSampler } from '../../audio/AcousticGuitarSampler';
import { DEFAULT_BASS_PROGRAM } from '../../audio/BassProgram';
import { BassSampler } from '../../audio/BassSampler';
import { DrumSampler } from '../../audio/DrumSampler';
import { ElectricGuitarSampler } from '../../audio/ElectricGuitarSampler';
import { DEFAULT_ELECTRIC_GUITAR_PROGRAM } from '../../audio/ElectricGuitarProgram';
import { KeyboardSampler } from '../../audio/KeyboardSampler';
import { Sf2KeyboardBackend } from '../../audio/sf2/Sf2KeyboardBackend';
import { Sf2ProgramBackend } from '../../audio/sf2/Sf2ProgramBackend';
import { Sf2ViolinBackend } from '../../audio/sf2/Sf2ViolinBackend';
import { ViolinSampler } from '../../audio/ViolinSampler';
import { AcousticGuitarInstrument } from '../../instruments/acoustic/AcousticGuitarInstrument';
import { BassInstrument } from '../../instruments/bass/BassInstrument';
import { DrumsInstrument } from '../../instruments/drums/DrumsInstrument';
import { ElectricGuitarInstrument } from '../../instruments/electric/ElectricGuitarInstrument';
import type { Instrument } from '../../instruments/Instrument';
import { KeyboardInstrument } from '../../instruments/keyboard/KeyboardInstrument';
import { ViolinInstrument } from '../../instruments/violin/ViolinInstrument';
import type { BandInstrumentType } from '../../midi';
import type { BandPlan } from '../../midi/planBand';

/**
 * Build the band an analysis asked for.
 *
 * The plan decides how many of each instrument stand on stage, so this cannot use the fixed six the
 * instrument library builds. Each instance gets its own sampler — voices are per-sampler state and
 * two violins must not overwrite each other's notes — but every sampler shares the one audio engine,
 * sample library and SF2 bank, so the SoundFont is still read once.
 */

export interface BuiltInstrument {
  readonly type: BandInstrumentType;
  /** Zero-based among instruments of this type, matching `TrackAssignment.instance`. */
  readonly instance: number;
  readonly instrument: Instrument;
  readonly dispose: () => void;
}

/** One instrument of one type, with a sampler of its own over the shared audio. */
async function buildOne(type: BandInstrumentType, graph: BandAudioGraph): Promise<BuiltInstrument['instrument'] & { dispose(): void }> {
  const { audio, samples, banks } = graph;
  switch (type) {
    case 'drums': {
      const sampler = new DrumSampler(
        audio,
        samples,
        new Sf2ProgramBackend(audio, banks, { bank: 128, program: 0, label: 'drums' }),
      );
      const instrument = await DrumsInstrument.create(sampler);
      return Object.assign(instrument, { dispose: () => sampler.dispose() });
    }
    case 'bass': {
      const sampler = new BassSampler(
        new Sf2ProgramBackend(audio, banks, {
          bank: 0,
          program: DEFAULT_BASS_PROGRAM,
          label: 'bass',
        }),
      );
      const instrument = await BassInstrument.create(sampler);
      return Object.assign(instrument, { dispose: () => sampler.dispose() });
    }
    case 'keyboard': {
      const sampler = new KeyboardSampler(audio, samples, new Sf2KeyboardBackend(audio, banks));
      const instrument = await KeyboardInstrument.create(sampler);
      return Object.assign(instrument, { dispose: () => sampler.dispose() });
    }
    case 'violin': {
      const sampler = new ViolinSampler(audio, samples, new Sf2ViolinBackend(audio, banks));
      const instrument = await ViolinInstrument.create(sampler);
      return Object.assign(instrument, { dispose: () => sampler.dispose() });
    }
    case 'electric': {
      const sampler = new ElectricGuitarSampler(
        audio,
        samples,
        new Sf2ProgramBackend(audio, banks, {
          bank: 0,
          program: DEFAULT_ELECTRIC_GUITAR_PROGRAM,
          label: 'electric',
        }),
      );
      const instrument = await ElectricGuitarInstrument.create(sampler);
      return Object.assign(instrument, { dispose: () => sampler.dispose() });
    }
    case 'acoustic': {
      const sampler = new AcousticGuitarSampler(
        audio,
        samples,
        new Sf2ProgramBackend(audio, banks, {
          bank: 0,
          program: DEFAULT_ACOUSTIC_GUITAR_PROGRAM,
          label: 'acoustic',
          gain: 0.86,
        }),
      );
      const instrument = await AcousticGuitarInstrument.create(sampler);
      return Object.assign(instrument, { dispose: () => sampler.dispose() });
    }
    default:
      throw new Error(`Unsupported instrument type: ${String(type)}`);
  }
}

export interface BuiltBand {
  readonly root: THREE.Group;
  readonly built: readonly BuiltInstrument[];
  /** `type.instance` to the instrument, so the player can address one directly. */
  readonly byKey: ReadonlyMap<string, BuiltInstrument>;
  dispose(): void;
}

export async function buildMidiBand(plan: BandPlan, graph: BandAudioGraph): Promise<BuiltBand> {
  const root = new THREE.Group();
  root.name = 'MIDI band';
  const built: BuiltInstrument[] = [];
  const byKey = new Map<string, BuiltInstrument>();
  const disposers: Array<() => void> = [];

  for (const entry of plan.instruments) {
    for (let instance = 0; instance < entry.count; instance += 1) {
      const instrument = await buildOne(entry.type, graph);
      // A named instance, so the registry and the player can tell two of a kind apart.
      instrument.setInstanceId(`${entry.type}.${instance + 1}`);
      const record: BuiltInstrument = {
        type: entry.type,
        instance,
        instrument,
        dispose: instrument.dispose,
      };
      built.push(record);
      byKey.set(`${entry.type}.${instance}`, record);
      disposers.push(instrument.dispose);
      root.add(instrument.root);
    }
  }

  return {
    root,
    built,
    byKey,
    dispose: () => {
      for (const dispose of disposers) dispose();
      root.removeFromParent();
    },
  };
}
