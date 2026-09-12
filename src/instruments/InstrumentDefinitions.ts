import type { Instrument } from './Instrument';
import type { LiveAudioEngine } from '../audio/LiveAudioEngine';
import { LiveDrumAudio, LiveKeyboardAudio, LiveStringAudio, LiveViolinAudio } from '../audio/LiveInstrumentAudio';
import type { CameraRegistry, InstrumentOrbitCameraView } from '../camera/CameraRegistry';
import type { CameraSystem } from '../camera/CameraSystem';
import type { InstrumentInteractionSystem } from './InstrumentInteractionSystem';
import type { PresentationMode } from '../presentation/PresentationManager';
import { BASS_PROGRAM_IDS, DEFAULT_BASS_PROGRAM } from '../audio/BassProgram';
import { ELECTRIC_GUITAR_PROGRAM_IDS, DEFAULT_ELECTRIC_GUITAR_PROGRAM } from '../audio/ElectricGuitarProgram';
import { ACOUSTIC_GUITAR_PROGRAM_IDS, DEFAULT_ACOUSTIC_GUITAR_PROGRAM } from '../audio/AcousticGuitarProgram';
import { DrumsInstrument } from './drums/DrumsInstrument';
import { AtelierDrumShowcaseMode } from '../presentation/atelier/AtelierDrumShowcaseMode';
import { ATELIER_DRUM_VIEWS } from '../camera/presets/AtelierDrumViews';
import { KeyboardInstrument } from './keyboard/KeyboardInstrument';
import { AtelierKeyboardShowcaseMode } from '../presentation/atelier/AtelierKeyboardShowcaseMode';
import { ATELIER_KEYBOARD_VIEWS } from '../camera/presets/AtelierKeyboardViews';
import { ViolinInstrument } from './violin/ViolinInstrument';
import { AtelierViolinShowcaseMode } from '../presentation/atelier/AtelierViolinShowcaseMode';
import { ATELIER_VIOLIN_VIEWS } from '../camera/presets/AtelierViolinViews';
import { ElectricGuitarInstrument } from './electric/ElectricGuitarInstrument';
import type { ElectricModelVariant } from './electric/applyElectricVariant';
import type { AcousticModelVariant } from './acoustic/legacyAcousticAsset';
import { AtelierElectricShowcaseMode } from '../presentation/atelier/AtelierElectricShowcaseMode';
import { ATELIER_ELECTRIC_VIEWS } from '../camera/presets/AtelierElectricViews';
import { AcousticGuitarInstrument } from './acoustic/AcousticGuitarInstrument';
import { AtelierAcousticShowcaseMode } from '../presentation/atelier/AtelierAcousticShowcaseMode';
import { ATELIER_ACOUSTIC_VIEWS } from '../camera/presets/AtelierAcousticViews';
import { BassInstrument } from './bass/BassInstrument';
import { AtelierBassShowcaseMode } from '../presentation/atelier/AtelierBassShowcaseMode';
import { ATELIER_BASS_VIEWS } from '../camera/presets/AtelierBassViews';
import { GrandPianoInstrument } from './piano/GrandPianoInstrument';
import { PianoShowcaseMode, PIANO_VIEWS } from '../presentation/atelier/PianoShowcaseMode';
import { SaxophoneInstrument } from './saxophone/SaxophoneInstrument';
import { SaxophoneShowcaseMode, SAXOPHONE_VIEWS } from '../presentation/atelier/SaxophoneShowcaseMode';
import { CelloInstrument } from './cello/CelloInstrument';
import { CelloShowcaseMode, CELLO_VIEWS } from '../presentation/atelier/CelloShowcaseMode';

export interface InstrumentPresentationContext {
  element: HTMLCanvasElement;
  camera: CameraSystem;
  cameraRegistry: CameraRegistry;
  interactions: InstrumentInteractionSystem;
}

export type InstrumentModelVariant = ElectricModelVariant | AcousticModelVariant;

function define<A extends { dispose(): void }, I extends Instrument, M extends PresentationMode>(
  sound: (audio: LiveAudioEngine) => A,
  model: (audio: A, variant?: InstrumentModelVariant) => Promise<I>,
  views: readonly InstrumentOrbitCameraView[],
  mode: (instrument: I, context: InstrumentPresentationContext) => M,
) {
  return {
    views,
    async create(audio: LiveAudioEngine, variant?: InstrumentModelVariant): Promise<I> {
      const port = sound(audio);
      try { return await model(port, variant); }
      catch (error) { port.dispose(); throw error; }
    },
    createMode: (instrument: Instrument, context: InstrumentPresentationContext): M => mode(instrument as I, context),
  };
}

/** One definition per type; hosts only add instance descriptors and register the resulting objects. */
export const INSTRUMENT_DEFINITIONS = {
  cello: define((audio) => audio.allocate(42), CelloInstrument.create, CELLO_VIEWS,
    (cello, context) => new CelloShowcaseMode(cello, context)),
  saxophone: define((audio) => audio.allocate(65), SaxophoneInstrument.create, SAXOPHONE_VIEWS,
    (saxophone, context) => new SaxophoneShowcaseMode(saxophone, context)),
  piano: define((audio) => audio.allocate(0), GrandPianoInstrument.create, PIANO_VIEWS,
    (piano, context) => new PianoShowcaseMode(piano, context)),
  drums: define((audio) => new LiveDrumAudio(audio), DrumsInstrument.create, ATELIER_DRUM_VIEWS,
    (drums, context) => new AtelierDrumShowcaseMode({ ...context, drums })),
  keyboard: define((audio) => new LiveKeyboardAudio(audio), KeyboardInstrument.create, ATELIER_KEYBOARD_VIEWS,
    (keyboard, context) => new AtelierKeyboardShowcaseMode({ ...context, keyboard })),
  violin: define((audio) => new LiveViolinAudio(audio), ViolinInstrument.create, ATELIER_VIOLIN_VIEWS,
    (violin, context) => new AtelierViolinShowcaseMode({ ...context, violin })),
  electric: define((audio) => new LiveStringAudio(audio, ELECTRIC_GUITAR_PROGRAM_IDS, DEFAULT_ELECTRIC_GUITAR_PROGRAM, 6),
    (audio, variant) => ElectricGuitarInstrument.create(audio, variant === 'single-cut' || variant === 'flying-v' ? variant : 'classic'), ATELIER_ELECTRIC_VIEWS,
    (electric, context) => new AtelierElectricShowcaseMode({ ...context, electric })),
  acoustic: define((audio) => new LiveStringAudio(audio, ACOUSTIC_GUITAR_PROGRAM_IDS, DEFAULT_ACOUSTIC_GUITAR_PROGRAM, 6),
    (audio, variant) => AcousticGuitarInstrument.create(audio, variant === 'cutaway-sunburst' ? variant : 'natural'), ATELIER_ACOUSTIC_VIEWS,
    (acoustic, context) => new AtelierAcousticShowcaseMode({ ...context, acoustic })),
  bass: define((audio) => new LiveStringAudio(audio, BASS_PROGRAM_IDS, DEFAULT_BASS_PROGRAM, 4), BassInstrument.create, ATELIER_BASS_VIEWS,
    (bass, context) => new AtelierBassShowcaseMode({ ...context, bass })),
} as const;

export type InstrumentType = keyof typeof INSTRUMENT_DEFINITIONS;
export interface InstrumentDescriptor { id: string; type: InstrumentType; variant?: InstrumentModelVariant }

export async function createInstrumentInstance(descriptor: InstrumentDescriptor, audio: LiveAudioEngine): Promise<Instrument> {
  if (!descriptor.id.trim()) throw new Error('Instrument ID must not be empty');
  const instance = await INSTRUMENT_DEFINITIONS[descriptor.type].create(audio, descriptor.variant);
  instance.setInstanceId(descriptor.id);
  return instance;
}

/** Initial library objects use the same catalog and release partial builds on failure. */
export async function createDefaultInstruments(audio: LiveAudioEngine, electricVariant?: ElectricModelVariant, acousticVariant?: AcousticModelVariant) {
  const types = Object.keys(INSTRUMENT_DEFINITIONS) as InstrumentType[];
  const results = await Promise.allSettled(types.map((type) =>
    INSTRUMENT_DEFINITIONS[type].create(audio, type === 'electric' ? electricVariant : type === 'acoustic' ? acousticVariant : undefined)));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    throw failed.reason;
  }
  return Object.fromEntries(results.map((result, index) => [types[index],
    (result as PromiseFulfilledResult<Instrument>).value,
  ])) as { [K in InstrumentType]: Awaited<ReturnType<typeof INSTRUMENT_DEFINITIONS[K]['create']>> };
}
