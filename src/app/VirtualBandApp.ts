import * as THREE from 'three';
import { AppState } from './AppState';
import { AudioEngine } from '../audio/AudioEngine';
import { DrumSampler } from '../audio/DrumSampler';
import { CameraRegistry } from '../camera/CameraRegistry';
import { CameraSystem } from '../camera/CameraSystem';
import { InstrumentOrbitMode } from '../camera/modes/InstrumentOrbitMode';
import { Engine } from '../engine/Engine';
import { RendererHost } from '../engine/RendererHost';
import { InstrumentRegistry } from '../instruments/Instrument';
import { InstrumentInteractionSystem } from '../instruments/InstrumentInteractionSystem';
import { DrumsInstrument } from '../instruments/drums/DrumsInstrument';
import { ControlArbiter } from '../show/ControlArbiter';
import { ShowScheduler } from '../show/ShowScheduler';
import { Transport } from '../transport/Transport';
import { AtelierStudioVenue } from '../venues/atelier-studio/AtelierStudioVenue';
import { EmptyStageVenue } from '../venues/empty-stage/EmptyStageVenue';
import { VenueManager } from '../venues/VenueManager';

export class VirtualBandApp {
  readonly state = new AppState();
  readonly transport = new Transport();
  readonly audio = new AudioEngine();
  readonly drumSampler = new DrumSampler(this.audio);
  readonly instruments = new InstrumentRegistry();
  readonly cameraRegistry = new CameraRegistry();
  readonly control = new ControlArbiter();
  readonly show = new ShowScheduler();
  readonly renderer: RendererHost;
  readonly camera: CameraSystem;
  readonly interactions: InstrumentInteractionSystem;
  readonly showcase: InstrumentOrbitMode;
  readonly venues: VenueManager;
  readonly engine: Engine;

  private readonly instrumentLayer = new THREE.Group();
  private started = false;
  private lastStateTime = -Infinity;

  constructor(options: { mount: HTMLElement }) {
    this.renderer = new RendererHost(options.mount);
    this.instrumentLayer.name = 'virtual-band:instruments';
    this.renderer.scene.add(this.instrumentLayer);

    this.camera = new CameraSystem(this.cameraRegistry, this.instruments);
    this.interactions = new InstrumentInteractionSystem({
      element: this.renderer.renderer.domElement,
      camera: this.camera.output,
      instruments: this.instruments,
    });
    this.showcase = new InstrumentOrbitMode({
      element: this.renderer.renderer.domElement,
      camera: this.camera,
      instruments: this.instruments,
    });
    this.venues = new VenueManager(this.renderer, this.instruments);
    this.engine = new Engine({
      renderer: this.renderer,
      camera: this.camera,
      transport: this.transport,
      instruments: this.instruments,
      venues: this.venues,
      show: this.show,
    });

    this.venues.register(new EmptyStageVenue());
    this.venues.register(new AtelierStudioVenue());

    this.transport.subscribe((snapshot) => {
      const statusChanged = snapshot.status !== this.state.getSnapshot().transport.status;
      if (statusChanged || Math.abs(snapshot.time - this.lastStateTime) >= 0.1 || snapshot.time === 0) {
        this.lastStateTime = snapshot.time;
        this.state.patch({ transport: snapshot });
      }
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    try {
      const drums = await DrumsInstrument.create(this.drumSampler);
      this.instruments.register(drums);
      this.instrumentLayer.add(drums.root);
      void this.drumSampler.preload();

      this.activateVenue('atelier-studio');
      this.showcase.enter(drums.id);
      this.engine.start();
      this.state.patch({ running: true });
    } catch (error) {
      this.started = false;
      throw error;
    }
  }

  activateVenue(id: string): void {
    const previous = this.venues.active?.id;
    const venue = this.venues.activate(id);
    if (previous && previous !== venue.id) this.cameraRegistry.clearVenueViews(previous);
    this.cameraRegistry.setVenueViews(venue.id, venue.cameraViews);
    this.camera.goToView(venue.cameraViews[0]?.id ?? '', true);
    this.state.patch({
      venueId: venue.id,
      counts: {
        instruments: this.instruments.size,
        cameraViews: this.cameraRegistry.size,
        showCues: this.show.cueCount,
      },
    });
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.engine.stop();
    this.showcase.dispose();
    this.interactions.dispose();
    this.control.clear();
    this.instruments.dispose();
    this.audio.dispose();
    this.instrumentLayer.removeFromParent();
    this.venues.dispose();
    this.renderer.dispose();
    this.state.patch({ running: false, venueId: null });
  }
}
