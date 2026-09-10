import type { CameraSystem } from '../../camera/CameraSystem';
import type { InstrumentRegistry } from '../../instruments/Instrument';
import type { PresentationManager, PresentationMode } from '../../presentation/PresentationManager';

/**
 * The band view has exactly two states.
 *
 * - `band`   — six instruments on stage. The pointer only orbits the stage; a double click
 *              steps into an instrument.
 * - `focus`  — the camera has flown to one instrument and that instrument's presentation mode
 *              owns every input (playing, sliding across parts, fretting, orbit, pan, zoom,
 *              keymap, saved views).
 *
 * The instruments are never hidden. Focus is a camera and input state, not a visibility state:
 * the rest of the band stays on stage the way it would in a real wide-to-close shot.
 */

export type StageFocus =
  | { readonly kind: 'band' }
  | { readonly kind: 'instrument'; readonly instrumentId: string };

export interface StageDirectorOptions {
  readonly camera: CameraSystem;
  readonly instruments: InstrumentRegistry;
  readonly presentation: PresentationManager;
  /** instrumentId → its presentation mode. Activation settles that instrument's own framing. */
  readonly modes: ReadonlyMap<string, PresentationMode>;
  /** instrumentId → the saved view the flight aims at before the mode takes over. */
  readonly entryViewIds: ReadonlyMap<string, string>;
  /** Named camera view of the whole stage, flown back to on the way out. */
  readonly bandViewId: string;
  readonly onChange?: (focus: StageFocus) => void;
}

const BAND: StageFocus = { kind: 'band' };

export class StageDirector {
  private readonly camera: CameraSystem;
  private readonly instruments: InstrumentRegistry;
  private readonly presentation: PresentationManager;
  private readonly modes: ReadonlyMap<string, PresentationMode>;
  private readonly entryViewIds: ReadonlyMap<string, string>;
  private readonly onChange?: (focus: StageFocus) => void;
  private bandViewId: string;

  private focus: StageFocus = BAND;
  /** Instrument we are currently flying towards; the mode activates when the flight lands. */
  private arriving: string | null = null;

  constructor(options: StageDirectorOptions) {
    this.camera = options.camera;
    this.instruments = options.instruments;
    this.presentation = options.presentation;
    this.modes = options.modes;
    this.entryViewIds = options.entryViewIds;
    this.bandViewId = options.bandViewId;
    this.onChange = options.onChange;
  }

  get current(): StageFocus {
    return this.focus;
  }

  get focusedInstrumentId(): string | null {
    return this.focus.kind === 'instrument' ? this.focus.instrumentId : null;
  }

  get isBand(): boolean {
    return this.focus.kind === 'band';
  }

  canFocus(instrumentId: string): boolean {
    return this.modes.has(instrumentId) && Boolean(this.instruments.get(instrumentId));
  }

  /**
   * Step into one instrument. The camera flies there first (`goToView` with easing), and the
   * presentation mode is activated by `update()` once the flight lands — activating it earlier
   * would hard-cut, because a mode settles its own pose on `activate()`.
   *
   * `instant` skips the flight and cuts straight in, which is the other half of the same pair:
   * a move and a cut.
   */
  focusInstrument(instrumentId: string, instant = false): boolean {
    if (!this.canFocus(instrumentId)) return false;
    if (this.focus.kind === 'instrument' && this.focus.instrumentId === instrumentId) return true;

    this.releaseCamera();
    const viewId = this.entryViewIds.get(instrumentId);
    if (!viewId || !this.camera.goToView(viewId, instant)) {
      // No authored view to fly to: fall back to stepping in immediately.
      this.activate(instrumentId);
      return true;
    }

    this.focus = { kind: 'instrument', instrumentId };
    this.onChange?.(this.focus);

    if (instant) {
      // Nothing to wait for; let the mode settle its own pose right away.
      this.activate(instrumentId);
      return true;
    }

    this.arriving = instrumentId;
    return true;
  }

  /**
   * Pick which stage view `showBand()` returns to. The flight itself is driven by the caller
   * through `CameraSystem.goToView`, so it can choose a move or a cut.
   */
  setBandView(viewId: string): void {
    this.bandViewId = viewId;
  }

  get activeBandViewId(): string {
    return this.bandViewId;
  }

  /** Step back out to the whole band. The camera flies back the same way. */
  showBand(instant = false): void {
    if (this.focus.kind === 'band' && this.arriving === null) return;
    this.arriving = null;
    this.releaseCamera();
    this.focus = BAND;
    this.camera.goToView(this.bandViewId, instant);
    this.onChange?.(this.focus);
  }

  /**
   * Hands the camera back before a flight.
   *
   * A live mode writes its own pose every frame, which would cancel the transition instantly,
   * and it resets the lens on the way out (`CameraSystem.resetLens`, fov 42) — so the current
   * fov is restored to keep the flight from popping.
   */
  private releaseCamera(): void {
    const fov = this.camera.output.fov;
    if (this.presentation.active) this.presentation.deactivate();
    this.camera.setLens({ fov });
  }

  /** Double-click target: step into an instrument, or drop back out if already inside it. */
  toggle(instrumentId: string, instant = false): void {
    if (this.focus.kind === 'instrument' && this.focus.instrumentId === instrumentId) {
      this.showBand(instant);
      return;
    }
    this.focusInstrument(instrumentId, instant);
  }

  /**
   * Drives the hand-off from "flying" to "the mode is in charge". `CameraSystem` clears its
   * desired pose once it arrives, which is the landing signal.
   */
  update(): void {
    if (this.arriving === null) return;
    if (this.camera.isTransitioning) return;
    const instrumentId = this.arriving;
    this.arriving = null;
    this.activate(instrumentId);
  }

  private activate(instrumentId: string): void {
    const mode = this.modes.get(instrumentId);
    if (!mode) return;
    this.presentation.activate(mode.id);
  }
}
