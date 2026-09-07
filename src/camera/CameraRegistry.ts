export interface WorldCameraView {
  kind: 'world';
  id: string;
  label: string;
  venueId: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface InstrumentCameraView {
  kind: 'instrument';
  id: string;
  label: string;
  instrumentId: string;
  camera: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export type CameraView = WorldCameraView | InstrumentCameraView;

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

  get size(): number {
    return this.views.size;
  }
}
