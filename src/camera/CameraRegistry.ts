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

export type CameraView = WorldCameraView | InstrumentCameraView | InstrumentOrbitCameraView;

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
    for (const view of views) this.register(view);
  }

  clearInstrumentViews(instrumentId: string): void {
    for (const [id, view] of this.views) {
      if (view.kind !== 'world' && view.instrumentId === instrumentId) this.views.delete(id);
    }
  }

  get size(): number {
    return this.views.size;
  }
}
