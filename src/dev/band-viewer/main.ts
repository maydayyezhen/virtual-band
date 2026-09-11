import * as THREE from 'three';
import { createBandAudioGraph } from '../../audio/BandAudioGraph';
import { CameraRegistry } from '../../camera/CameraRegistry';
import { CameraSystem } from '../../camera/CameraSystem';
import { OrbitController } from '../../camera/OrbitController';
import { RendererHost } from '../../engine/RendererHost';
import { AcousticGuitarInstrument } from '../../instruments/acoustic/AcousticGuitarInstrument';
import { BassInstrument } from '../../instruments/bass/BassInstrument';
import { DrumsInstrument } from '../../instruments/drums/DrumsInstrument';
import { ElectricGuitarInstrument } from '../../instruments/electric/ElectricGuitarInstrument';
import { InstrumentRegistry } from '../../instruments/Instrument';
import { InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import { KeyboardInstrument } from '../../instruments/keyboard/KeyboardInstrument';
import { ViolinInstrument } from '../../instruments/violin/ViolinInstrument';
import { createAtelierShowcase, registerAtelierViews } from '../../presentation/atelier/createAtelierShowcase';
import { PresentationManager } from '../../presentation/PresentationManager';
import { AtelierStudioVenue } from '../../venues/atelier-studio/AtelierStudioVenue';
import { autoArrangeLayout, type InstrumentFootprints } from '../layout-editor/AutoLayout';
import { normalizeInstrument } from '../layout-editor/BandPresentation';
import { registerBandViews } from './BandViews';
import { createDefaultLayout, type LayoutInstrumentType } from '../layout-editor/LayoutDocument';
import { installNocturneLayoutStage } from '../layout-editor/NocturneLayoutStage';
import { StageDirector } from './StageDirector';

/**
 * Band View — the band exactly as the Layout Lab arranges it, with no interface at all.
 *
 * Two states, owned by `StageDirector`:
 *   band  — six instruments, inert; drag orbits the stage, double click steps inside.
 *   focus — one instrument running its own Atelier presentation mode, which owns every input.
 *
 * The instruments are the project's real `Instrument` instances and the presentation modes are
 * the same six the instrument library uses, assembled by the same factory — nothing about
 * playing, sliding or camera framing is re-implemented here.
 */

const STAGE_SURFACE_Y = 1.2;
const MAX_FRAME_SECONDS = 0.05;
const PITCH_RANGE: readonly [number, number] = [-0.15, 1.35];
/**
 * The volume a camera may sit in, from the NOCTURNE venue: a 30 × 16 m deck spanning z ∈ [-8, 8],
 * with the LED wall at z ≈ -8.2 and the truss top around y = 14. Declared so `validateViews()`
 * can catch a stage view that would park the camera inside a wall.
 */
const VENUE_CAMERA_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-16, 0.4, -8),
  new THREE.Vector3(16, 15, 11),
);

installNocturneLayoutStage();

const mount = document.querySelector<HTMLElement>('[data-band-view]');
if (!mount) throw new Error('Band view mount is missing');

/* ------------------------------------------------------------------ *
 * Audio — the same shared graph the instrument library builds.
 * ------------------------------------------------------------------ */
const graph = createBandAudioGraph();
const {
  audio,
  drumSampler,
  keyboardSampler,
  violinSampler,
  electricSampler,
  acousticSampler,
  bassSampler,
} = graph;

/**
 * Warms every sampler at load. Not optional: `BassSampler` is the one instrument with no MP3
 * fallback, so an unprepared bass backend silently drops every note. None of it needs a user
 * gesture — only starting the AudioContext does — and the scene never waits for it.
 */
const prepareAudio = (): Promise<void> => graph.prepare();

/** Browsers only allow an AudioContext to start inside a user gesture. */
let audioUnlocked = false;
async function unlockAudio(): Promise<void> {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    await audio.resume();
  } catch (error) {
    console.warn('[Band View] 音频未能启动：', error);
  }
}

/* ------------------------------------------------------------------ *
 * Scene
 * ------------------------------------------------------------------ */
const instruments = new InstrumentRegistry();
const host = new RendererHost(mount);
const venue = new AtelierStudioVenue();
host.scene.add(venue.root);
host.applySceneProfile(venue.sceneProfile);

const cameraRegistry = new CameraRegistry();
const camera = new CameraSystem(cameraRegistry, instruments);

/** Holds the six instruments; lifted so their bases land on the stage deck. */
const band = new THREE.Group();
band.name = 'band:instruments';
band.position.y = STAGE_SURFACE_Y;
host.scene.add(band);

const interactions = new InstrumentInteractionSystem({
  element: host.renderer.domElement,
  camera: camera.output,
  instruments,
});

/**
 * Which instrument is under the pointer — any of its geometry counts.
 *
 * Deliberately not `InstrumentInteractionSystem.hitTest()`: that one resolves a *playable
 * part* and returns null for stands, hardware and guitar bodies, which would make the
 * close-up unreachable anywhere except the sounding surfaces.
 */
const pickRaycaster = new THREE.Raycaster();
const pickPointer = new THREE.Vector2();
function instrumentAt(clientX: number, clientY: number): string | null {
  const rect = host.renderer.domElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  pickPointer.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  camera.output.updateMatrixWorld(true);
  pickRaycaster.setFromCamera(pickPointer, camera.output);

  const roots = instruments.list().filter((item) => item.root.visible).map((item) => item.root);
  for (const intersection of pickRaycaster.intersectObjects(roots, true)) {
    let node: THREE.Object3D | null = intersection.object;
    while (node) {
      if (typeof node.userData?.instrumentId === 'string') return node.userData.instrumentId;
      node = node.parent;
    }
  }
  return null;
}

const presentation = new PresentationManager();

/** Stage views, filled in once the layout is known. Index 0 is the audience view. */
let bandViewIds: string[] = [];
let bandViewIndex = 0;

/**
 * Stage orbit. World space (no subject), so the camera swings around the whole band rather than
 * around one instrument — the same controller the instrument close-ups use, which is what makes
 * the two feel alike.
 */
const orbit = new OrbitController({
  camera,
  element: host.renderer.domElement,
  pitchRange: PITCH_RANGE,
});

let stage!: StageDirector;

async function buildBand(): Promise<void> {
  const [drums, keyboard, violin, electric, acoustic, bass] = await Promise.all([
    DrumsInstrument.create(drumSampler),
    KeyboardInstrument.create(keyboardSampler),
    ViolinInstrument.create(violinSampler),
    ElectricGuitarInstrument.create(electricSampler),
    AcousticGuitarInstrument.create(acousticSampler),
    BassInstrument.create(bassSampler),
  ]);

  const members = { drums, keyboard, violin, electric, acoustic, bass };
  for (const instrument of Object.values(members)) instruments.register(instrument);

  // Saved instrument views: the same 29 the instrument library uses.
  registerAtelierViews(cameraRegistry, members);

  const donors: Record<LayoutInstrumentType, THREE.Object3D> = {
    drums: drums.root,
    keyboard: keyboard.root,
    violin: violin.root,
    electric: electric.root,
    acoustic: acoustic.root,
    bass: bass.root,
  };

  const footprints = {} as InstrumentFootprints;
  const holders = new Map<LayoutInstrumentType, THREE.Group>();
  for (const type of Object.keys(donors) as LayoutInstrumentType[]) {
    // Keep userData: the interaction system hit-tests userData.hit / userData.instrumentId.
    const normalized = normalizeInstrument(type, donors[type], { stripUserData: false });
    footprints[type] = normalized.footprint;
    holders.set(type, normalized.holder);
  }

  const document = autoArrangeLayout(createDefaultLayout(), footprints);
  for (const instance of document.instances) {
    const holder = holders.get(instance.type);
    if (!holder) continue;
    holder.position.x = instance.transform.position[0];
    holder.position.y += instance.transform.position[1];
    holder.position.z = instance.transform.position[2];
    holder.rotation.y = instance.transform.rotation[1];
    holder.scale.multiplyScalar(instance.transform.scale);
    band.add(holder);
  }
  host.invalidateShadows();

  band.updateMatrixWorld(true);

  // Declarative stage views: angles around the band's own box, so the framing survives both a
  // layout change and a viewport change. A `world` view stores a finished position and does neither.
  bandViewIds = registerBandViews(cameraRegistry, new THREE.Box3().setFromObject(band));
  bandViewIndex = 0;

  // Anything outside this is behind the LED wall (z ≈ -8.2) or off the deck, and renders black.
  camera.setCameraBounds(VENUE_CAMERA_BOUNDS);
  const diagnostics = camera.validateViews();
  if (diagnostics.length) {
    console.warn(`[Band View] ${diagnostics.length} 个机位不可用：`);
    for (const item of diagnostics) {
      console.warn(`  · ${item.viewId} (${item.label}) — ${item.problem}`);
    }
  }

  const showcase = createAtelierShowcase({
    element: host.renderer.domElement,
    camera,
    cameraRegistry,
    interactions,
    instruments: members,
  });
  for (const mode of showcase.modes) presentation.register(mode);

  stage = new StageDirector({
    camera,
    instruments,
    presentation,
    modes: showcase.byInstrumentId,
    entryViewIds: showcase.wholeViewIds,
    bandViewId: bandViewIds[0],
  });

  camera.goToView(bandViewIds[0], true);

  // Seed the orbit from the resolved view, so the first drag continues from where it landed.
  orbit.adoptCamera();
}

/* ------------------------------------------------------------------ *
 * Stage input.
 *
 * Inside an instrument the presentation mode owns playing, sliding, orbiting and panning.
 * This layer only keeps the two stage-level gestures, and it tells them apart from a drag by
 * movement, because every button is already spoken for while a mode is live:
 *
 *   band  · drag orbits · double click steps in
 *   focus · clean left click on another instrument switches  (right drag still pans)
 *         · clean right click steps back out
 * ------------------------------------------------------------------ */
const DRAG_THRESHOLD_PX = 6;

/** Pointer capture throws when there is no live pointer for that id; never let it abort a gesture. */
function capturePointer(element: HTMLElement, pointerId: number): void {
  try { element.setPointerCapture(pointerId); } catch { /* synthetic or already released */ }
}
function releasePointer(element: HTMLElement, pointerId: number): void {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch { /* nothing to release */ }
}

function attachStageInput(): void {
  const element = host.renderer.domElement;
  let press: {
    x: number;
    y: number;
    button: number;
    moved: boolean;
  } | null = null;

  element.addEventListener('pointerdown', (event) => {
    void unlockAudio();
    press = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      moved: false,
    };
    if (stage.isBand && event.button === 0) {
      capturePointer(element, event.pointerId);
      orbit.beginOrbit();
    }
  });

  element.addEventListener('pointermove', (event) => {
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    press.moved = true;

    if (press.button !== 0 || !stage.isBand) return;
    orbit.orbitBy(dx, dy);
    press.x = event.clientX;
    press.y = event.clientY;
  });

  const release = (event: PointerEvent): void => {
    releasePointer(element, event.pointerId);
    orbit.endOrbit();
    const gesture = press;
    press = null;
    if (!gesture || gesture.moved || event.button !== gesture.button) return;

    if (gesture.button !== 2) return;
    // Right click steps back out; right *drag* stays as the mode's pan.
    if (!stage.isBand) stage.showBand();
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);

  element.addEventListener('wheel', (event) => {
    if (!stage.isBand) return;
    event.preventDefault();
    orbit.zoomBy(Math.exp(event.deltaY * 0.001));
  }, { passive: false });

  // Double click is the one way in and the one way across: from the wide band it steps into an
  // instrument, and from inside one it moves the close-up to another. Single click deliberately
  // does nothing at stage level — inside an instrument it belongs to the presentation mode.
  element.addEventListener('dblclick', (event) => {
    const instrumentId = instrumentAt(event.clientX, event.clientY);
    if (!instrumentId) return;
    if (instrumentId === stage.focusedInstrumentId) return;
    stage.focusInstrument(instrumentId);
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;

    // Inside an instrument the mode owns the number keys (its own saved views), so this only
    // answers while the whole band is on screen.
    if (event.code === 'Escape') {
      if (!stage.isBand) stage.showBand();
      return;
    }
    if (!stage.isBand) return;

    // Stage views. The camera layer takes both a move and a cut; this call site asks for the
    // default (a move) and nothing more.
    const digit = /^Digit([1-9])$/.exec(event.code);
    if (!digit) return;
    const index = Number(digit[1]) - 1;
    const viewId = bandViewIds[index];
    if (!viewId) return;
    event.preventDefault();
    bandViewIndex = index;
    stage.setBandView(viewId);
    camera.goToView(viewId);
  });
}

function resize(): void {
  const viewport = host.resizeIfNeeded();
  camera.setViewport(viewport.width, viewport.height);
}

let lastFrame = performance.now();
function loop(): void {
  const now = performance.now();
  const dt = Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
  lastFrame = now;

  instruments.update(dt);
  presentation.update(dt);
  stage?.update();
  // Only the band state drives the orbit controller; a live mode owns the camera itself.
  if (stage?.isBand) orbit.update(dt);
  camera.update(dt);
  resize();
  host.render(camera.output);
  requestAnimationFrame(loop);
}

attachStageInput();
resize();
loop();
void prepareAudio();

buildBand().catch((error) => {
  console.error('[Band View] 装配失败：', error);
});

window.addEventListener('pagehide', () => {
  interactions.dispose();
  presentation.dispose();
  instruments.dispose();
  graph.dispose();
  host.dispose();
}, { once: true });

// Same dev-only escape hatch the main app exposes from src/main.tsx.
if (import.meta.env.DEV) {
  Object.defineProperty(window, 'bandView', {
    configurable: true,
    value: {
      host, band, instruments, interactions, camera, cameraRegistry, presentation, audio,
      instrumentAt,
      get stage() { return stage; },
      get orbit() { return orbit; },
    },
  });
}
