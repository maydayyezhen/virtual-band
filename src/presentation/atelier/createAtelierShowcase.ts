import type { CameraRegistry } from '../../camera/CameraRegistry';
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

export interface AtelierShowcaseInstruments {
  drums: DrumsInstrument;
  keyboard: KeyboardInstrument;
  violin: ViolinInstrument;
  electric: ElectricGuitarInstrument;
  acoustic: AcousticGuitarInstrument;
  bass: BassInstrument;
}

export interface AtelierShowcaseInput {
  element: HTMLCanvasElement;
  camera: CameraSystem;
  cameraRegistry: CameraRegistry;
  interactions: InstrumentInteractionSystem;
  instruments: AtelierShowcaseInstruments;
}

export interface AtelierShowcase {
  readonly drums: AtelierDrumShowcaseMode;
  readonly keyboard: AtelierKeyboardShowcaseMode;
  readonly violin: AtelierViolinShowcaseMode;
  readonly electric: AtelierElectricShowcaseMode;
  readonly acoustic: AtelierAcousticShowcaseMode;
  readonly bass: AtelierBassShowcaseMode;
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

  const drumMode = new AtelierDrumShowcaseMode({ ...shared, drums });
  const keyboardMode = new AtelierKeyboardShowcaseMode({ ...shared, keyboard });
  const violinMode = new AtelierViolinShowcaseMode({ ...shared, violin });
  const electricMode = new AtelierElectricShowcaseMode({ ...shared, electric });
  const acousticMode = new AtelierAcousticShowcaseMode({ ...shared, acoustic });
  const bassMode = new AtelierBassShowcaseMode({ ...shared, bass });

  const modes: PresentationMode[] = [
    drumMode,
    keyboardMode,
    violinMode,
    electricMode,
    acousticMode,
    bassMode,
  ];

  const byInstrumentId = new Map<string, PresentationMode>([
    [drums.id, drumMode],
    [keyboard.id, keyboardMode],
    [violin.id, violinMode],
    [electric.id, electricMode],
    [acoustic.id, acousticMode],
    [bass.id, bassMode],
  ]);

  const wholeViewIds = new Map<string, string>([
    [drums.id, ATELIER_DRUM_VIEW_IDS.whole],
    [keyboard.id, ATELIER_KEYBOARD_VIEW_IDS.whole],
    [violin.id, ATELIER_VIOLIN_VIEW_IDS.whole],
    [electric.id, ATELIER_ELECTRIC_VIEW_IDS.whole],
    [acoustic.id, ATELIER_ACOUSTIC_VIEW_IDS.whole],
    [bass.id, ATELIER_BASS_VIEW_IDS.whole],
  ]);

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
  registry.setInstrumentViews(instruments.drums.id, ATELIER_DRUM_VIEWS);
  registry.setInstrumentViews(instruments.keyboard.id, ATELIER_KEYBOARD_VIEWS);
  registry.setInstrumentViews(instruments.violin.id, ATELIER_VIOLIN_VIEWS);
  registry.setInstrumentViews(instruments.electric.id, ATELIER_ELECTRIC_VIEWS);
  registry.setInstrumentViews(instruments.acoustic.id, ATELIER_ACOUSTIC_VIEWS);
  registry.setInstrumentViews(instruments.bass.id, ATELIER_BASS_VIEWS);
}
