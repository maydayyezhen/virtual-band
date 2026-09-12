export interface WorldCameraView {
  kind: 'world';
  id: string;
  label: string;
  venueId: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near?: number;
  far?: number;
}

export interface InstrumentCameraView {
  kind: 'instrument';
  id: string;
  label: string;
  instrumentId: string;
  camera: [number, number, number];
  target: [number, number, number];
  fov: number;
  near?: number;
  far?: number;
}

export interface CameraViewportFraming {
  reservedHeight?: number;
  compactReservedHeight?: number;
  compactHeightBreakpoint?: number;
  minUsableHeightRatio?: number;
  horizontalMargin?: number;
  mobileHorizontalMargin?: number;
  mobileWidthBreakpoint?: number;
  minUsableWidth?: number;
}

/**
 * Authored orbit-style camera preset stored in instrument-local coordinates.
 * `height` / `width` describe the intended framed subject area. Optional viewport
 * framing preserves authored composition rules (including donor-safe areas)
 * without making the preset belong to a particular PresentationMode.
 */
export interface InstrumentOrbitCameraView {
  kind: 'instrument-orbit';
  id: string;
  label: string;
  instrumentId: string;
  target: [number, number, number];
  yaw: number;
  pitch: number;
  height: number;
  width: number;
  fov: number;
  near?: number;
  far?: number;
  viewportFraming?: CameraViewportFraming;
}

/**
 * Orbit-style preset in **world** space, framing an arbitrary subject rather than one
 * instrument: the whole band, a venue, a stage position.
 *
 * `framing` is the subject's extent in metres around `target`, so the distance is derived on
 * every resolve instead of being baked. That is what lets a stage view survive a viewport
 * change — a preset that stores a finished camera position cannot re-frame itself.
 */
export interface BandOrbitCameraView {
  kind: 'band-orbit';
  id: string;
  label: string;
  /** Free-form grouping, e.g. 'band'. Lets a host register and clear views as a set. */
  scope: string;
  target: [number, number, number];
  yaw: number;
  pitch: number;
  framing: {
    width: number;
    height: number;
    depth: number;
  };
  fov: number;
  near?: number;
  far?: number;
}

export type CameraView =
  | WorldCameraView
  | InstrumentCameraView
  | InstrumentOrbitCameraView
  | BandOrbitCameraView;

export class CameraRegistry {
  private readonly views = new Map<string, CameraView>();

  register(view: CameraView): void {
    this.views.set(view.id, view);
  }

  unregister(id: string): void {
    this.views.delete(id);
  }

  get(id: string): CameraView | null {
    return this.views.get(id) ?? null;
  }

  list(): CameraView[] {
    return [...this.views.values()];
  }

  setVenueViews(venueId: string, views: WorldCameraView[]): void {
    for (const [id, view] of this.views) {
      if (view.kind === 'world' && view.venueId === venueId) this.views.delete(id);
    }
    for (const view of views) this.register(view);
  }

  clearVenueViews(venueId: string): void {
    for (const [id, view] of this.views) {
      if (view.kind === 'world' && view.venueId === venueId) this.views.delete(id);
    }
  }

  setInstrumentViews(instrumentId: string, views: Array<InstrumentCameraView | InstrumentOrbitCameraView>): void {
    this.clearInstrumentViews(instrumentId);
    for (const template of views) {
      const name = template.id.slice(template.id.indexOf(':') + 1);
      this.register({ ...structuredClone(template), id: `${instrumentId}:${name}`, instrumentId });
    }
  }

  clearInstrumentViews(instrumentId: string): void {
    for (const [id, view] of this.views) {
      const isInstrumentView = view.kind === 'instrument' || view.kind === 'instrument-orbit';
      if (isInstrumentView && view.instrumentId === instrumentId) this.views.delete(id);
    }
  }

  /** Replace every `band-orbit` view belonging to a scope, e.g. all stage views of 'band'. */
  setScopedViews(scope: string, views: BandOrbitCameraView[]): void {
    this.clearScopedViews(scope);
    for (const view of views) this.register(view);
  }

  clearScopedViews(scope: string): void {
    for (const [id, view] of this.views) {
      if (view.kind === 'band-orbit' && view.scope === scope) this.views.delete(id);
    }
  }

  /** Views of one scope, in registration order. */
  scopedViews(scope: string): BandOrbitCameraView[] {
    const found: BandOrbitCameraView[] = [];
    for (const view of this.views.values()) {
      if (view.kind === 'band-orbit' && view.scope === scope) found.push(view);
    }
    return found;
  }

  get size(): number {
    return this.views.size;
  }
}
