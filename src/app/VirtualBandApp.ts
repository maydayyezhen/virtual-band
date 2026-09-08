import * as THREE from 'three';
import { AppState } from './AppState';
import { AcousticGuitarSampler } from '../audio/AcousticGuitarSampler';
import { AudioEngine } from '../audio/AudioEngine';
import { DrumSampler } from '../audio/DrumSampler';
import { ElectricGuitarSampler } from '../audio/ElectricGuitarSampler';
import { KeyboardSampler } from '../audio/KeyboardSampler';
import { SampleLibrary } from '../audio/SampleLibrary';
import { Sf2BankLibrary } from '../audio/sf2/Sf2BankLibrary';
import { Sf2KeyboardBackend } from '../audio/sf2/Sf2KeyboardBackend';
import { Sf2ViolinBackend } from '../audio/sf2/Sf2ViolinBackend';
import { ViolinSampler } from '../audio/ViolinSampler';
import { CameraRegistry } from '../camera/CameraRegistry';
import { CameraSystem } from '../camera/CameraSystem';
import { ATELIER_ACOUSTIC_VIEWS } from '../camera/presets/AtelierAcousticViews';
import { ATELIER_DRUM_VIEWS } from '../camera/presets/AtelierDrumViews';
import { ATELIER_ELECTRIC_VIEWS } from '../camera/presets/AtelierElectricViews';
import { ATELIER_KEYBOARD_VIEWS } from '../camera/presets/AtelierKeyboardViews';
import { ATELIER_VIOLIN_VIEWS } from '../camera/presets/AtelierViolinViews';
import { Engine } from '../engine/Engine';
import { RendererHost } from '../engine/RendererHost';
import { AcousticGuitarInstrument } from '../instruments/acoustic/AcousticGuitarInstrument';
import { InstrumentRegistry } from '../instruments/Instrument';
import { InstrumentInteractionSystem } from '../instruments/InstrumentInteractionSystem';
import { DrumsInstrument } from '../instruments/drums/DrumsInstrument';
import { ElectricGuitarInstrument } from '../instruments/electric/ElectricGuitarInstrument';
import { KeyboardInstrument } from '../instruments/keyboard/KeyboardInstrument';
import { ViolinInstrument } from '../instruments/violin/ViolinInstrument';
import { AtelierAcousticShowcaseMode } from '../presentation/atelier/AtelierAcousticShowcaseMode';
import { AtelierDrumShowcaseMode } from '../presentation/atelier/AtelierDrumShowcaseMode';
import { AtelierElectricShowcaseMode } from '../presentation/atelier/AtelierElectricShowcaseMode';
import { AtelierKeyboardShowcaseMode } from '../presentation/atelier/AtelierKeyboardShowcaseMode';
import { AtelierViolinShowcaseMode } from '../presentation/atelier/AtelierViolinShowcaseMode';
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
  readonly samples = new SampleLibrary(this.audio);
  readonly sf2Banks = new Sf2BankLibrary();
  readonly drumSampler = new DrumSampler(this.audio, this.samples);
  readonly electricSampler = new ElectricGuitarSampler(this.audio, this.samples);
  readonly acousticSampler = new AcousticGuitarSampler(this.audio, this.samples);
  readonly keyboardSf2 = new Sf2KeyboardBackend(this.audio, this.sf2Banks);
  readonly keyboardSampler = new KeyboardSampler(this.audio, this.samples, this.keyboardSf2);
  readonly violinSf2 = new Sf2ViolinBackend(this.audio, this.sf2Banks);
  readonly violinSampler = new ViolinSampler(this.audio, this.samples, this.violinSf2);
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
  private violin: ViolinInstrument | null = null;
  private electric: ElectricGuitarInstrument | null = null;
  private acoustic: AcousticGuitarInstrument | null = null;
  private atelierMode: AtelierDrumShowcaseMode | null = null;
  private keyboardMode: AtelierKeyboardShowcaseMode | null = null;
  private violinMode: AtelierViolinShowcaseMode | null = null;
  private electricMode: AtelierElectricShowcaseMode | null = null;
  private acousticMode: AtelierAcousticShowcaseMode | null = null;
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
      // MP3 preload and experimental SF2 keyboard/violin warmup run in parallel
      // with donor/model setup. The visual scene never waits for the 148 MB bank.
      void this.prepareShowcaseAudio();

      const [drums, keyboard, violin, electric, acoustic] = await Promise.all([
        DrumsInstrument.create(this.drumSampler),
        KeyboardInstrument.create(this.keyboardSampler),
        ViolinInstrument.create(this.violinSampler),
        ElectricGuitarInstrument.create(this.electricSampler),
        AcousticGuitarInstrument.create(this.acousticSampler),
      ]);
      this.drums = drums;
      this.keyboard = keyboard;
      this.violin = violin;
      this.electric = electric;
      this.acoustic = acoustic;

      this.instruments.register(drums);
      this.instruments.register(keyboard);
      this.instruments.register(violin);
      this.instruments.register(electric);
      this.instruments.register(acoustic);
      this.instrumentLayer.add(drums.root, keyboard.root, violin.root, electric.root, acoustic.root);

      // Saved views are reusable camera assets, not presentation-mode data.
      this.cameraRegistry.setInstrumentViews(drums.id, ATELIER_DRUM_VIEWS);
      this.cameraRegistry.setInstrumentViews(keyboard.id, ATELIER_KEYBOARD_VIEWS);
      this.cameraRegistry.setInstrumentViews(violin.id, ATELIER_VIOLIN_VIEWS);
      this.cameraRegistry.setInstrumentViews(electric.id, ATELIER_ELECTRIC_VIEWS);
      this.cameraRegistry.setInstrumentViews(acoustic.id, ATELIER_ACOUSTIC_VIEWS);

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
      const violinMode = new AtelierViolinShowcaseMode({
        element: this.renderer.renderer.domElement,
        camera: this.camera,
        cameraRegistry: this.cameraRegistry,
        violin,
        interactions: this.interactions,
      });
      const electricMode = new AtelierElectricShowcaseMode({
        element: this.renderer.renderer.domElement,
        camera: this.camera,
        cameraRegistry: this.cameraRegistry,
        electric,
        interactions: this.interactions,
      });
      const acousticMode = new AtelierAcousticShowcaseMode({
        element: this.renderer.renderer.domElement,
        camera: this.camera,
        cameraRegistry: this.cameraRegistry,
        acoustic,
        interactions: this.interactions,
      });
      this.atelierMode = drumMode;
      this.keyboardMode = keyboardMode;
      this.violinMode = violinMode;
      this.electricMode = electricMode;
      this.acousticMode = acousticMode;
      this.presentation.register(drumMode);
      this.presentation.register(keyboardMode);
      this.presentation.register(violinMode);
      this.presentation.register(electricMode);
      this.presentation.register(acousticMode);

      this.showcaseSwitch = new ShowcaseSwitchController({
        instruments: this.instruments,
        presentation: this.presentation,
        entries: [
          { instrumentId: drums.id, presentationId: drumMode.id },
          { instrumentId: keyboard.id, presentationId: keyboardMode.id },
          { instrumentId: violin.id, presentationId: violinMode.id },
          { instrumentId: electric.id, presentationId: electricMode.id },
          { instrumentId: acoustic.id, presentationId: acousticMode.id },
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

  async prepareShowcaseAudio(): Promise<void> {
    await Promise.allSettled([
      this.drumSampler.preload(),
      this.keyboardSampler.preloadCommon(),
      this.violinSampler.preloadCommon(),
      this.electricSampler.preloadShowcase(),
      this.acousticSampler.preloadShowcase(),
    ]);
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

  requireViolin(): ViolinInstrument {
    if (!this.violin) throw new Error('Atelier violin is not ready');
    return this.violin;
  }

  requireElectricGuitar(): ElectricGuitarInstrument {
    if (!this.electric) throw new Error('Atelier electric guitar is not ready');
    return this.electric;
  }

  requireAcousticGuitar(): AcousticGuitarInstrument {
    if (!this.acoustic) throw new Error('Atelier acoustic guitar is not ready');
    return this.acoustic;
  }

  requireAtelierShowcase(): AtelierDrumShowcaseMode {
    if (!this.atelierMode) throw new Error('Atelier drum showcase is not ready');
    return this.atelierMode;
  }

  requireKeyboardShowcase(): AtelierKeyboardShowcaseMode {
    if (!this.keyboardMode) throw new Error('Atelier keyboard showcase is not ready');
    return this.keyboardMode;
  }

  requireViolinShowcase(): AtelierViolinShowcaseMode {
    if (!this.violinMode) throw new Error('Atelier violin showcase is not ready');
    return this.violinMode;
  }

  requireElectricShowcase(): AtelierElectricShowcaseMode {
    if (!this.electricMode) throw new Error('Atelier electric guitar showcase is not ready');
    return this.electricMode;
  }

  requireAcousticShowcase(): AtelierAcousticShowcaseMode {
    if (!this.acousticMode) throw new Error('Atelier acoustic guitar showcase is not ready');
    return this.acousticMode;
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
    this.violinMode = null;
    this.electricMode = null;
    this.acousticMode = null;
    if (this.drums) this.cameraRegistry.clearInstrumentViews(this.drums.id);
    if (this.keyboard) this.cameraRegistry.clearInstrumentViews(this.keyboard.id);
    if (this.violin) this.cameraRegistry.clearInstrumentViews(this.violin.id);
    if (this.electric) this.cameraRegistry.clearInstrumentViews(this.electric.id);
    if (this.acoustic) this.cameraRegistry.clearInstrumentViews(this.acoustic.id);
    this.interactions.dispose();
    this.control.clear();
    this.instruments.dispose();
    this.drums = null;
    this.keyboard = null;
    this.violin = null;
    this.electric = null;
    this.acoustic = null;
    this.keyboardSampler.dispose();
    this.violinSampler.dispose();
    this.sf2Banks.dispose();
    this.samples.dispose();
    this.audio.dispose();
    this.instrumentLayer.removeFromParent();
    this.venues.dispose();
    this.renderer.dispose();
    this.state.patch({ running: false, error: null, venueId: null });
  }
}
