import type {
  CameraRegistry,
  InstrumentCameraView,
  InstrumentOrbitCameraView,
} from '../../camera/CameraRegistry';
import type { CameraSystem } from '../../camera/CameraSystem';
import { ATELIER_ACOUSTIC_VIEWS, ATELIER_ACOUSTIC_VIEW_IDS } from '../../camera/presets/AtelierAcousticViews';
import { ATELIER_BASS_VIEWS, ATELIER_BASS_VIEW_IDS } from '../../camera/presets/AtelierBassViews';
import { ATELIER_DRUM_VIEWS, ATELIER_DRUM_VIEW_IDS } from '../../camera/presets/AtelierDrumViews';
import { ATELIER_ELECTRIC_VIEWS, ATELIER_ELECTRIC_VIEW_IDS } from '../../camera/presets/AtelierElectricViews';
import { ATELIER_KEYBOARD_VIEWS, ATELIER_KEYBOARD_VIEW_IDS } from '../../camera/presets/AtelierKeyboardViews';
import { ATELIER_VIOLIN_VIEWS, ATELIER_VIOLIN_VIEW_IDS } from '../../camera/presets/AtelierViolinViews';
import type { AcousticGuitarInstrument } from '../../instruments/acoustic/AcousticGuitarInstrument';
import type { BassInstrument } from '../../instruments/bass/BassInstrument';
import type { DrumsInstrument } from '../../instruments/drums/DrumsInstrument';
import type { ElectricGuitarInstrument } from '../../instruments/electric/ElectricGuitarInstrument';
import type { InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { KeyboardInstrument } from '../../instruments/keyboard/KeyboardInstrument';
import type { ViolinInstrument } from '../../instruments/violin/ViolinInstrument';
import type { PresentationMode } from '../PresentationManager';
import { AtelierAcousticShowcaseMode } from './AtelierAcousticShowcaseMode';
import { AtelierBassShowcaseMode } from './AtelierBassShowcaseMode';
import { AtelierDrumShowcaseMode } from './AtelierDrumShowcaseMode';
import { AtelierElectricShowcaseMode } from './AtelierElectricShowcaseMode';
import { AtelierKeyboardShowcaseMode } from './AtelierKeyboardShowcaseMode';
import { AtelierViolinShowcaseMode } from './AtelierViolinShowcaseMode';

/**
 * Single assembly point for the six Atelier presentation modes.
 *
 * Every mode takes the same shape — `{ element, camera, cameraRegistry, interactions }` plus
 * its own instrument — so building them here keeps the wiring in one place. The main app
 * (`VirtualBandApp`) and the band view both construct the same set; neither owns a private
 * copy.
 */

/**
 * The six instruments a showcase can be built from.
 *
 * Every field is optional because a band built from a score need not have all six — a file with no
 * strings has no violin to step into, and that is not an error. Only the instruments present get a
 * mode and a set of views.
 */
export interface AtelierShowcaseInstruments {
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
  instruments: AtelierShowcaseInstruments;
}

export interface AtelierShowcase {
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

export function createAtelierShowcase(input: AtelierShowcaseInput): AtelierShowcase {
  const shared = {
    element: input.element,
    camera: input.camera,
    cameraRegistry: input.cameraRegistry,
    interactions: input.interactions,
  };
  const { drums, keyboard, violin, electric, acoustic, bass } = input.instruments;

  const drumMode = drums ? new AtelierDrumShowcaseMode({ ...shared, drums }) : null;
  const keyboardMode = keyboard ? new AtelierKeyboardShowcaseMode({ ...shared, keyboard }) : null;
  const violinMode = violin ? new AtelierViolinShowcaseMode({ ...shared, violin }) : null;
  const electricMode = electric ? new AtelierElectricShowcaseMode({ ...shared, electric }) : null;
  const acousticMode = acoustic ? new AtelierAcousticShowcaseMode({ ...shared, acoustic }) : null;
  const bassMode = bass ? new AtelierBassShowcaseMode({ ...shared, bass }) : null;

  const modes = [drumMode, keyboardMode, violinMode, electricMode, acousticMode, bassMode].filter(
    (mode) => mode !== null,
  ) as PresentationMode[];

  const byInstrumentId = new Map<string, PresentationMode>();
  const wholeViewIds = new Map<string, string>();
  const pair = (
    mode: PresentationMode | null,
    instrument: { id: string } | undefined,
    viewId: string,
  ): void => {
    if (!mode || !instrument) return;
    byInstrumentId.set(instrument.id, mode);
    wholeViewIds.set(instrument.id, viewId);
  };
  pair(drumMode, drums, ATELIER_DRUM_VIEW_IDS.whole);
  pair(keyboardMode, keyboard, ATELIER_KEYBOARD_VIEW_IDS.whole);
  pair(violinMode, violin, ATELIER_VIOLIN_VIEW_IDS.whole);
  pair(electricMode, electric, ATELIER_ELECTRIC_VIEW_IDS.whole);
  pair(acousticMode, acoustic, ATELIER_ACOUSTIC_VIEW_IDS.whole);
  pair(bassMode, bass, ATELIER_BASS_VIEW_IDS.whole);

  return {
    drums: drumMode,
    keyboard: keyboardMode,
    violin: violinMode,
    electric: electricMode,
    acoustic: acousticMode,
    bass: bassMode,
    modes,
    byInstrumentId,
    wholeViewIds,
  };
}

/**
 * Registers the 29 authored instrument views. Kept beside the mode factory so a stage that
 * builds one always has the other — the views and the modes that select them are one unit.
 */
export function registerAtelierViews(
  registry: CameraRegistry,
  instruments: AtelierShowcaseInstruments,
): void {
  const bind = (
    instrument: { id: string } | undefined,
    views: readonly (InstrumentCameraView | InstrumentOrbitCameraView)[],
  ): void => {
    if (!instrument) return;
    registry.setInstrumentViews(instrument.id, [...views]);
  };
  bind(instruments.drums, ATELIER_DRUM_VIEWS);
  bind(instruments.keyboard, ATELIER_KEYBOARD_VIEWS);
  bind(instruments.violin, ATELIER_VIOLIN_VIEWS);
  bind(instruments.electric, ATELIER_ELECTRIC_VIEWS);
  bind(instruments.acoustic, ATELIER_ACOUSTIC_VIEWS);
  bind(instruments.bass, ATELIER_BASS_VIEWS);
}
