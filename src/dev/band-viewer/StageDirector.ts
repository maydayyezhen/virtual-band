import type { CameraSystem } from '../../camera/CameraSystem';
import type { OrbitController } from '../../camera/OrbitController';
import type { FreeCameraController } from '../../camera/FreeCameraController';
import type { InstrumentRegistry } from '../../instruments/Instrument';
import type { PresentationManager, PresentationMode } from '../../presentation/PresentationManager';

export type StageFocus = { readonly kind: 'band' } | { readonly kind: 'audience' } | { readonly kind: 'broadcast' }
  | { readonly kind: 'instrument'; readonly instrumentId: string };
export interface StageDirectorOptions {
  camera: CameraSystem;
  instruments: InstrumentRegistry;
  presentation: PresentationManager;
  modes: ReadonlyMap<string, PresentationMode>;
  entryViewIds: ReadonlyMap<string, string>;
  bandViewId: string;
  orbit: OrbitController;
  audience: FreeCameraController;
  onChange?: (focus: StageFocus) => void;
}

/** The band's sole camera-mode owner: transition, orbit, showcase or free movement. */
export class StageDirector {
  private focus: StageFocus = { kind: 'band' };
  private arriving: string | null = null;
  private rebaseOrbit = true;
  private bandViewId: string;
  constructor(private readonly options: StageDirectorOptions) { this.bandViewId = options.bandViewId; }
  get current(): StageFocus { return this.focus; }
  get focusedInstrumentId(): string | null { return this.focus.kind === 'instrument' ? this.focus.instrumentId : null; }
  get isBand(): boolean { return this.focus.kind === 'band'; }
  get activeBandViewId(): string { return this.bandViewId; }
  canFocus(id: string): boolean { return this.options.modes.has(id) && !!this.options.instruments.get(id); }
  private leave(): void {
    this.arriving = null;
    this.options.presentation.deactivate();
    this.options.audience.exit();
  }
  private changed(focus: StageFocus): void { this.focus = focus; this.options.onChange?.(focus); }
  focusInstrument(id: string, instant = false): boolean {
    if (!this.canFocus(id)) return false;
    if (this.focusedInstrumentId === id) return true;
    this.leave();
    this.changed({ kind: 'instrument', instrumentId: id });
    const viewId = this.options.entryViewIds.get(id);
    if (viewId && this.options.camera.goToView(viewId, instant) && this.options.camera.isTransitioning) this.arriving = id;
    else this.activate(id);
    return true;
  }
  setBandView(id: string): void { this.bandViewId = id; }
  selectBandView(id: string, instant = false): void {
    this.leave();
    this.bandViewId = id;
    this.changed({ kind: 'band' });
    this.rebaseOrbit = true;
    this.options.camera.goToView(id, instant);
  }
  showBand(instant = false): void { this.selectBandView(this.bandViewId, instant); }
  startBroadcast(): void {
    this.leave();
    this.options.camera.cancelTransition();
    this.changed({ kind: 'broadcast' });
  }
  enterAudience(instant = false): void {
    if (this.focus.kind === 'audience') return;
    this.leave();
    this.changed({ kind: 'audience' });
    this.options.audience.enter(instant);
  }
  /** A drag interrupts a move at its visible pose and takes ownership immediately. */
  takeBandControl(): void {
    if (this.focus.kind === 'broadcast') {
      this.options.orbit.adoptCamera();
      this.rebaseOrbit = false;
      this.changed({ kind: 'band' });
    }
    if (!this.isBand) return;
    if (this.rebaseOrbit || this.options.camera.isTransitioning) this.options.orbit.adoptCamera();
    this.options.camera.cancelTransition();
    this.rebaseOrbit = false;
  }
  toggle(id: string, instant = false): void {
    if (this.focusedInstrumentId === id) this.showBand(instant);
    else this.focusInstrument(id, instant);
  }
  update(dt = 0): void {
    this.options.camera.update(dt);
    if (this.arriving && !this.options.camera.isTransitioning) this.activate(this.arriving);
    if (this.focus.kind === 'instrument') this.options.presentation.update(dt);
    else if (this.focus.kind === 'audience') this.options.audience.update(dt);
    else if (this.focus.kind === 'band' && !this.options.camera.isTransitioning) {
      if (this.rebaseOrbit) { this.options.orbit.adoptCamera(); this.rebaseOrbit = false; }
      this.options.orbit.update(dt);
    }
  }
  private activate(id: string): void {
    this.arriving = null;
    const mode = this.options.modes.get(id);
    if (mode) this.options.presentation.activate(mode.id);
  }
}
