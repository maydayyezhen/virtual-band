import type { CameraSystem } from '../camera/CameraSystem';
import type { InstrumentRegistry } from '../instruments/Instrument';
import type { PresentationManager } from '../presentation/PresentationManager';
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
  private readonly presentation: PresentationManager;

  private raf = 0;
  private lastFrame = 0;

  constructor(options: {
    renderer: RendererHost;
    camera: CameraSystem;
    transport: Transport;
    instruments: InstrumentRegistry;
    venues: VenueManager;
    show: ShowScheduler;
    presentation: PresentationManager;
  }) {
    this.renderer = options.renderer;
    this.camera = options.camera;
    this.transport = options.transport;
    this.instruments = options.instruments;
    this.venues = options.venues;
    this.show = options.show;
    this.presentation = options.presentation;
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

    const viewport = this.renderer.resizeIfNeeded();
    this.camera.setViewport(viewport.width, viewport.height);

    this.transport.update(dt);
    this.show.update(this.transport.snapshot.time);
    this.camera.update(dt);

    // Presentation is a command producer. It runs inside the same RAF and can drive
    // demo notes before the instrument animation tick, matching the donor viewer.
    this.presentation.update(dt);

    const instrumentFrame = this.instruments.update(dt);
    if (instrumentFrame.moved) this.renderer.invalidateShadows();
    this.venues.update(dt);

    this.renderer.render(this.camera.output);
    this.raf = requestAnimationFrame(this.frame);
  };
}
