import * as THREE from 'three';
import { AppState } from './AppState';
import { createBandAudioGraph } from '../audio/BandAudioGraph';
import { CameraRegistry } from '../camera/CameraRegistry';
import { CameraSystem } from '../camera/CameraSystem';
import { createAtelierShowcase, registerAtelierViews } from '../presentation/atelier/createAtelierShowcase';
import { Engine } from '../engine/Engine';
import { RendererHost } from '../engine/RendererHost';
import { AcousticGuitarInstrument } from '../instruments/acoustic/AcousticGuitarInstrument';
import { BassInstrument } from '../instruments/bass/BassInstrument';
import { InstrumentRegistry } from '../instruments/Instrument';
import { InstrumentInteractionSystem } from '../instruments/InstrumentInteractionSystem';
import { DrumsInstrument } from '../instruments/drums/DrumsInstrument';
import { ElectricGuitarInstrument } from '../instruments/electric/ElectricGuitarInstrument';
import { KeyboardInstrument } from '../instruments/keyboard/KeyboardInstrument';
import { ViolinInstrument } from '../instruments/violin/ViolinInstrument';
import { AtelierAcousticShowcaseMode } from '../presentation/atelier/AtelierAcousticShowcaseMode';
import { AtelierBassShowcaseMode } from '../presentation/atelier/AtelierBassShowcaseMode';
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

  // One shared audio graph. Field names are kept as aliases so existing callers and the dev
  // console handle (`window.virtualBandV2.audio`, `.violinSf2`) keep working unchanged.
  private readonly graph = createBandAudioGraph();
  readonly audio = this.graph.audio;
  readonly samples = this.graph.samples;
  readonly sf2Banks = this.graph.banks;

  readonly drumsSf2 = this.graph.drumsSf2;
  readonly drumSampler = this.graph.drumSampler;
  readonly electricSf2 = this.graph.electricSf2;
  readonly electricSampler = this.graph.electricSampler;
  readonly acousticSf2 = this.graph.acousticSf2;
  readonly acousticSampler = this.graph.acousticSampler;
  readonly bassSf2 = this.graph.bassSf2;
  readonly bassSampler = this.graph.bassSampler;
  readonly keyboardSf2 = this.graph.keyboardSf2;
  readonly keyboardSampler = this.graph.keyboardSampler;
  readonly violinSf2 = this.graph.violinSf2;
  readonly violinSampler = this.graph.violinSampler;

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
  private bass: BassInstrument | null = null;
  private atelierMode: AtelierDrumShowcaseMode | null = null;
  private keyboardMode: AtelierKeyboardShowcaseMode | null = null;
  private violinMode: AtelierViolinShowcaseMode | null = null;
  private electricMode: AtelierElectricShowcaseMode | null = null;
  private acousticMode: AtelierAcousticShowcaseMode | null = null;
  private bassMode: AtelierBassShowcaseMode | null = null;
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
      // One shared SF2 bank warms in parallel with MP3 fallback samples and donor
      // setup. The visual scene never waits for the 148 MB SoundFont to parse.
      void this.prepareShowcaseAudio();

      const [drums, keyboard, violin, electric, acoustic, bass] = await Promise.all([
        DrumsInstrument.create(this.drumSampler),
        KeyboardInstrument.create(this.keyboardSampler),
        ViolinInstrument.create(this.violinSampler),
        ElectricGuitarInstrument.create(this.electricSampler),
        AcousticGuitarInstrument.create(this.acousticSampler),
        BassInstrument.create(this.bassSampler),
      ]);
      this.drums = drums;
      this.keyboard = keyboard;
      this.violin = violin;
      this.electric = electric;
      this.acoustic = acoustic;
      this.bass = bass;

      this.instruments.register(drums);
      this.instruments.register(keyboard);
      this.instruments.register(violin);
      this.instruments.register(electric);
      this.instruments.register(acoustic);
      this.instruments.register(bass);
      this.instrumentLayer.add(drums.root, keyboard.root, violin.root, electric.root, acoustic.root, bass.root);

      // Saved views are reusable camera assets, not presentation-mode data.
      registerAtelierViews(this.cameraRegistry, { drums, keyboard, violin, electric, acoustic, bass });

      this.activateVenue('atelier-studio');

      const showcase = createAtelierShowcase({
        element: this.renderer.renderer.domElement,
        camera: this.camera,
        cameraRegistry: this.cameraRegistry,
        interactions: this.interactions,
        instruments: { drums, keyboard, violin, electric, acoustic, bass },
      });
      this.atelierMode = showcase.drums;
      this.keyboardMode = showcase.keyboard;
      this.violinMode = showcase.violin;
      this.electricMode = showcase.electric;
      this.acousticMode = showcase.acoustic;
      this.bassMode = showcase.bass;
      for (const mode of showcase.modes) this.presentation.register(mode);

      this.showcaseSwitch = new ShowcaseSwitchController({
        instruments: this.instruments,
        presentation: this.presentation,
        entries: [
          { instrumentId: drums.id, presentationId: showcase.drums.id },
          { instrumentId: keyboard.id, presentationId: showcase.keyboard.id },
          { instrumentId: violin.id, presentationId: showcase.violin.id },
          { instrumentId: electric.id, presentationId: showcase.electric.id },
          { instrumentId: acoustic.id, presentationId: showcase.acoustic.id },
          { instrumentId: bass.id, presentationId: showcase.bass.id },
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
    await this.graph.prepare();
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

  requireBass(): BassInstrument {
    if (!this.bass) throw new Error('Atelier bass is not ready');
    return this.bass;
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

  requireBassShowcase(): AtelierBassShowcaseMode {
    if (!this.bassMode) throw new Error('Atelier bass showcase is not ready');
    return this.bassMode;
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
    this.bassMode = null;
    if (this.drums) this.cameraRegistry.clearInstrumentViews(this.drums.id);
    if (this.keyboard) this.cameraRegistry.clearInstrumentViews(this.keyboard.id);
    if (this.violin) this.cameraRegistry.clearInstrumentViews(this.violin.id);
    if (this.electric) this.cameraRegistry.clearInstrumentViews(this.electric.id);
    if (this.acoustic) this.cameraRegistry.clearInstrumentViews(this.acoustic.id);
    if (this.bass) this.cameraRegistry.clearInstrumentViews(this.bass.id);
    this.interactions.dispose();
    this.control.clear();
    this.instruments.dispose();
    this.drums = null;
    this.keyboard = null;
    this.violin = null;
    this.electric = null;
    this.acoustic = null;
    this.bass = null;
    this.drumSampler.dispose();
    this.keyboardSampler.dispose();
    this.violinSampler.dispose();
    this.electricSampler.dispose();
    this.acousticSampler.dispose();
    this.bassSampler.dispose();
    this.sf2Banks.dispose();
    this.samples.dispose();
    this.audio.dispose();
    this.instrumentLayer.removeFromParent();
    this.venues.dispose();
    this.renderer.dispose();
    this.state.patch({ running: false, error: null, venueId: null });
  }
}
