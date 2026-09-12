import { INSTRUMENT_DEFINITIONS, type InstrumentType } from '../../instruments/InstrumentDefinitions';
import type { Instrument } from '../../instruments/Instrument';
import type { CameraRegistry } from '../../camera/CameraRegistry';
import type { CameraSystem } from '../../camera/CameraSystem';
import type { InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { PresentationMode } from '../PresentationManager';
import type { DrumsInstrument } from '../../instruments/drums/DrumsInstrument';
import type { AtelierDrumShowcaseMode } from './AtelierDrumShowcaseMode';
import type { KeyboardInstrument } from '../../instruments/keyboard/KeyboardInstrument';
import type { AtelierKeyboardShowcaseMode } from './AtelierKeyboardShowcaseMode';
import type { ViolinInstrument } from '../../instruments/violin/ViolinInstrument';
import type { AtelierViolinShowcaseMode } from './AtelierViolinShowcaseMode';
import type { ElectricGuitarInstrument } from '../../instruments/electric/ElectricGuitarInstrument';
import type { AtelierElectricShowcaseMode } from './AtelierElectricShowcaseMode';
import type { AcousticGuitarInstrument } from '../../instruments/acoustic/AcousticGuitarInstrument';
import type { AtelierAcousticShowcaseMode } from './AtelierAcousticShowcaseMode';
import type { BassInstrument } from '../../instruments/bass/BassInstrument';
import type { AtelierBassShowcaseMode } from './AtelierBassShowcaseMode';
import type { GrandPianoInstrument } from '../../instruments/piano/GrandPianoInstrument';
import type { PianoShowcaseMode } from './PianoShowcaseMode';
import type { SaxophoneInstrument } from '../../instruments/saxophone/SaxophoneInstrument';
import type { SaxophoneShowcaseMode } from './SaxophoneShowcaseMode';
import type { CelloInstrument } from '../../instruments/cello/CelloInstrument';
import type { CelloShowcaseMode } from './CelloShowcaseMode';

export interface AtelierShowcaseInstruments {
  cello?: CelloInstrument;
  saxophone?: SaxophoneInstrument;
  piano?: GrandPianoInstrument;
  drums?: DrumsInstrument;
  keyboard?: KeyboardInstrument;
  violin?: ViolinInstrument;
  electric?: ElectricGuitarInstrument;
  acoustic?: AcousticGuitarInstrument;
  bass?: BassInstrument;
}

export interface AtelierShowcaseInput {
  element: HTMLCanvasElement;
  camera: CameraSystem;
  cameraRegistry: CameraRegistry;
  interactions: InstrumentInteractionSystem;
  instruments: AtelierShowcaseInstruments | readonly Instrument[];
}

export interface AtelierShowcase {
  readonly cello: CelloShowcaseMode | null;
  readonly saxophone: SaxophoneShowcaseMode | null;
  readonly piano: PianoShowcaseMode | null;
  /** Each is null when the band has no instrument of that type. */
  readonly drums: AtelierDrumShowcaseMode | null;
  readonly keyboard: AtelierKeyboardShowcaseMode | null;
  readonly violin: AtelierViolinShowcaseMode | null;
  readonly electric: AtelierElectricShowcaseMode | null;
  readonly acoustic: AtelierAcousticShowcaseMode | null;
  readonly bass: AtelierBassShowcaseMode | null;
  /** Every mode, in canonical stage order, ready for `PresentationManager.register()`. */
  readonly modes: readonly PresentationMode[];
  /** instrumentId → its presentation mode, for switching and focus. */
  readonly byInstrumentId: ReadonlyMap<string, PresentationMode>;
  /** instrumentId → its `whole` view, the pose a stage flies to before handing over. */
  readonly wholeViewIds: ReadonlyMap<string, string>;
}

function instances(input: AtelierShowcaseInput['instruments']): Instrument[] {
  return Object.values(input).filter((instrument): instrument is Instrument => Boolean(instrument));
}

export function createAtelierShowcase(input: AtelierShowcaseInput): AtelierShowcase {
  const byInstrumentId = new Map<string, PresentationMode>();
  const wholeViewIds = new Map<string, string>();
  const first: Partial<Record<InstrumentType, PresentationMode>> = {};
  for (const instrument of instances(input.instruments)) {
    const type = instrument.role as InstrumentType;
    const definition = INSTRUMENT_DEFINITIONS[type];
    if (!definition) throw new Error(`No presentation definition for ${instrument.role}`);
    const mode = definition.createMode(instrument, input);
    byInstrumentId.set(instrument.id, mode);
    wholeViewIds.set(instrument.id, `${instrument.id}:whole`);
    first[type] ??= mode;
  }
  return {
    cello: (first.cello as CelloShowcaseMode | undefined) ?? null,
    saxophone: (first.saxophone as SaxophoneShowcaseMode | undefined) ?? null,
    piano: (first.piano as PianoShowcaseMode | undefined) ?? null,
    drums: (first.drums as AtelierDrumShowcaseMode | undefined) ?? null,
    keyboard: (first.keyboard as AtelierKeyboardShowcaseMode | undefined) ?? null,
    violin: (first.violin as AtelierViolinShowcaseMode | undefined) ?? null,
    electric: (first.electric as AtelierElectricShowcaseMode | undefined) ?? null,
    acoustic: (first.acoustic as AtelierAcousticShowcaseMode | undefined) ?? null,
    bass: (first.bass as AtelierBassShowcaseMode | undefined) ?? null,
    modes: [...byInstrumentId.values()], byInstrumentId, wholeViewIds,
  };
}

export function registerAtelierViews(registry: CameraRegistry, input: AtelierShowcaseInput['instruments']): void {
  for (const instrument of instances(input)) {
    const definition = INSTRUMENT_DEFINITIONS[instrument.role as InstrumentType];
    if (!definition) throw new Error(`No camera definition for ${instrument.role}`);
    registry.setInstrumentViews(instrument.id, [...definition.views]);
  }
}
