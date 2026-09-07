import * as THREE from 'three';
import { AppState } from './AppState';
import { AudioEngine } from '../audio/AudioEngine';
import { DrumSampler } from '../audio/DrumSampler';
import { KeyboardSampler } from '../audio/KeyboardSampler';
import { CameraRegistry } from '../camera/CameraRegistry';
import { CameraSystem } from '../camera/CameraSystem';
import { ATELIER_DRUM_VIEWS } from '../camera/presets/AtelierDrumViews';
import { ATELIER_KEYBOARD_VIEWS } from '../camera/presets/AtelierKeyboardViews';
import { Engine } from '../engine/Engine';
import { RendererHost } from '../engine/RendererHost';
import { InstrumentRegistry } from '../instruments/Instrument';
import { InstrumentInteractionSystem } from '../instruments/InstrumentInteractionSystem';
import { DrumsInstrument } from '../instruments/drums/DrumsInstrument';
import { KeyboardInstrument } from '../instruments/keyboard/KeyboardInstrument';
import { AtelierDrumShowcaseMode } from '../presentation/atelier/AtelierDrumShowcaseMode';
import { AtelierKeyboardShowcaseMode } from '../presentation/atelier/AtelierKeyboardShowcaseMode';
import { PresentationManager } from '../presentation/PresentationManager';
import { ShowcaseSwitchController } from '../presentation/ShowcaseSwitchController';
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
  readonly keyboardSampler = new KeyboardSampler(this.audio);
  readonly instruments = new InstrumentRegistry();
  readonly cameraRegistry = new CameraRegistry();
  readonly control = new ControlArbiter();
  readonly show = new ShowScheduler();
  readonly presentation = new PresentationManager();
  readonly renderer: RendererHost;
  readonly camera: CameraSystem;
  readonly interactions: InstrumentInteractionSystem;
  readonly venues: VenueManager;
  readonly engine: Engine;

  private readonly instrumentLayer = new THREE.Group();
  private drums: DrumsInstrument | null = null;
  private keyboard: KeyboardInstrument | null = null;
  private atelierMode: AtelierDrumShowcaseMode | null = null;
  private keyboardMode: AtelierKeyboardShowcaseMode | null = null;
  private showcaseSwitch: ShowcaseSwitchController | null = null;
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
    this.venues = new VenueManager(this.renderer, this.instruments);
    this.engine = new Engine({
      renderer: this.renderer,
      camera: this.camera,
      transport: this.transport,
      instruments: this.instruments,
      venues: this.venues,
      show: this.show,
      presentation: this.presentation,
    });

    this.venues.register(new AtelierStudioVenue());
    this.venues.register(new EmptyStageVenue());

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
    this.state.patch({ error: null });

    try {
      const [drums, keyboard] = await Promise.all([
        DrumsInstrument.create(this.drumSampler),
        KeyboardInstrument.create(this.keyboardSampler),
      ]);
      this.drums = drums;
      this.keyboard = keyboard;

      this.instruments.register(drums);
      this.instruments.register(keyboard);
      this.instrumentLayer.add(drums.root, keyboard.root);

      // Saved views are reusable camera assets, not presentation-mode data.
      this.cameraRegistry.setInstrumentViews(drums.id, ATELIER_DRUM_VIEWS);
      this.cameraRegistry.setInstrumentViews(keyboard.id, ATELIER_KEYBOARD_VIEWS);

      // Network sound loading never blocks the visual scene.
      void this.drumSampler.preload();
      void this.keyboardSampler.preloadCommon();

      this.activateVenue('atelier-studio');

      const drumMode = new AtelierDrumShowcaseMode({
        element: this.renderer.renderer.domElement,
        camera: this.camera,
        cameraRegistry: this.cameraRegistry,
        drums,
        interactions: this.interactions,
      });
      const keyboardMode = new AtelierKeyboardShowcaseMode({
        element: this.renderer.renderer.domElement,
        camera: this.camera,
        cameraRegistry: this.cameraRegistry,
        keyboard,
        interactions: this.interactions,
      });
      this.atelierMode = drumMode;
      this.keyboardMode = keyboardMode;
      this.presentation.register(drumMode);
      this.presentation.register(keyboardMode);

      this.showcaseSwitch = new ShowcaseSwitchController({
        instruments: this.instruments,
        presentation: this.presentation,
        entries: [
          { instrumentId: drums.id, presentationId: drumMode.id },
          { instrumentId: keyboard.id, presentationId: keyboardMode.id },
        ],
        initialInstrumentId: drums.id,
        onChanged: () => this.renderer.invalidateShadows(),
      });
      this.showcaseSwitch.activateInitial();

      this.engine.start();
      this.state.patch({ running: true, error: null });
    } catch (error) {
      this.started = false;
      const message = error instanceof Error ? error.message : String(error);
      this.state.patch({ running: false, error: message });
      throw error;
    }
  }

  activateVenue(id: string): void {
    if (id !== 'atelier-studio' && this.presentation.active) this.presentation.deactivate();

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

  requireDrumKit(): DrumsInstrument {
    if (!this.drums) throw new Error('Atelier drum kit is not ready');
    return this.drums;
  }

  requireKeyboard(): KeyboardInstrument {
    if (!this.keyboard) throw new Error('Atelier stage keyboard is not ready');
    return this.keyboard;
  }

  requireAtelierShowcase(): AtelierDrumShowcaseMode {
    if (!this.atelierMode) throw new Error('Atelier drum showcase is not ready');
    return this.atelierMode;
  }

  requireKeyboardShowcase(): AtelierKeyboardShowcaseMode {
    if (!this.keyboardMode) throw new Error('Atelier keyboard showcase is not ready');
    return this.keyboardMode;
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.engine.stop();
    this.showcaseSwitch?.dispose();
    this.showcaseSwitch = null;
    this.presentation.dispose();
    this.atelierMode = null;
    this.keyboardMode = null;
    if (this.drums) this.cameraRegistry.clearInstrumentViews(this.drums.id);
    if (this.keyboard) this.cameraRegistry.clearInstrumentViews(this.keyboard.id);
    this.interactions.dispose();
    this.control.clear();
    this.instruments.dispose();
    this.drums = null;
    this.keyboard = null;
    this.audio.dispose();
    this.instrumentLayer.removeFromParent();
    this.venues.dispose();
    this.renderer.dispose();
    this.state.patch({ running: false, error: null, venueId: null });
  }
}
