export type TransportStatus = 'stopped' | 'playing' | 'paused';

export interface AppSnapshot {
  running: boolean;
  venueId: string | null;
  transport: {
    status: TransportStatus;
    time: number;
    duration: number;
  };
  counts: {
    instruments: number;
    cameraViews: number;
    showCues: number;
  };
}

type Listener = () => void;

export class AppState {
  private snapshot: AppSnapshot = {
    running: false,
    venueId: null,
    transport: { status: 'stopped', time: 0, duration: 0 },
    counts: { instruments: 0, cameraViews: 0, showCues: 0 },
  };

  private readonly listeners = new Set<Listener>();

  readonly getSnapshot = (): AppSnapshot => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  patch(patch: Partial<AppSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      transport: patch.transport ? { ...this.snapshot.transport, ...patch.transport } : this.snapshot.transport,
      counts: patch.counts ? { ...this.snapshot.counts, ...patch.counts } : this.snapshot.counts,
    };
    for (const listener of this.listeners) listener();
  }
}
