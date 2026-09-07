import type { CameraSystem } from '../camera/CameraSystem';
import type { InstrumentRegistry } from '../instruments/Instrument';
import type { ShowScheduler } from '../show/ShowScheduler';
import type { Transport } from '../transport/Transport';
import type { VenueManager } from '../venues/VenueManager';
import type { RendererHost } from './RendererHost';

export class Engine {
  private readonly renderer: RendererHost;
  private readonly camera: CameraSystem;
  private readonly transport: Transport;
  private readonly instruments: InstrumentRegistry;
  private readonly venues: VenueManager;
  private readonly show: ShowScheduler;

  private raf = 0;
  private lastFrame = 0;

  constructor(options: {
    renderer: RendererHost;
    camera: CameraSystem;
    transport: Transport;
    instruments: InstrumentRegistry;
    venues: VenueManager;
    show: ShowScheduler;
  }) {
    this.renderer = options.renderer;
    this.camera = options.camera;
    this.transport = options.transport;
    this.instruments = options.instruments;
    this.venues = options.venues;
    this.show = options.show;
  }

  start(): void {
    if (this.raf) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastFrame = 0;
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;

    this.transport.update(dt);
    this.instruments.update(dt);
    this.venues.update(dt);
    this.show.update(this.transport.snapshot.time);
    this.camera.update(dt);

    const aspect = this.renderer.resizeIfNeeded();
    this.camera.setAspect(aspect);
    this.renderer.render(this.camera.output);

    this.raf = requestAnimationFrame(this.frame);
  };
}
