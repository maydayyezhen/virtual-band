import { createDefaultInstruments, createInstrumentInstance } from '../../instruments/InstrumentDefinitions';
import { parseLayoutDocument } from '../../layout/LayoutDocument';
import * as THREE from 'three';
import { createBandAudioGraph } from '../../audio/BandAudioGraph';
import { CameraRegistry } from '../../camera/CameraRegistry';
import { CameraSystem } from '../../camera/CameraSystem';
import { FreeCameraController } from '../../camera/FreeCameraController';
import { BandCameraPanel } from './BandCameraPanel';
import { OrbitController } from '../../camera/OrbitController';
import { RendererHost } from '../../engine/RendererHost';
import { InstrumentRegistry } from '../../instruments/Instrument';
import { InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import { createAtelierShowcase, registerAtelierViews } from '../../presentation/atelier/createAtelierShowcase';
import { PresentationManager } from '../../presentation/PresentationManager';
import type { Instrument } from '../../instruments/Instrument';
import { NocturneVenue } from '../../venues/nocturne/NocturneVenue';
import { NOCTURNE_STAGE, NOCTURNE_CAMERA_VOLUME } from '../../venues/nocturne/NocturneSpec';
import { BandSession } from '../../layout/BandSession';
import { registerBandViews } from './BandViews';
import { analyzeMidi } from '../../midi';
import { buildMidiBand, type BuiltBand } from './buildMidiBand';
import { BandPlayer } from './BandPlayer';
import { MidiPlayback } from '../../audio/MidiPlayback';
import { DropHint, TransportBar } from './TransportBar';
import type { LayoutInstrumentType } from '../../layout/LayoutDocument';
import { StageDirector } from './StageDirector';
import { LightingSession } from '../../lighting/LightingSession';
import { SHOW_EXAMPLES, prepareMatchingShow, type PreparedBandShow } from '../../shows/catalog';
import { LightingPanel } from './LightingPanel';
import { SongScreens } from '../../screens/SongScreens';
import { ScreenSession } from '../../screens/ScreenSession';
import { ScreenAudioTap } from '../../screens/ScreenAudioTap';
import { ScreenPanel } from './ScreenPanel';
import { CameraShowPlayer } from '../../camera/CameraShowPlayer';
import { DirectorPanel } from './DirectorPanel';
import { TitleLayer } from '../../titles/TitleLayer';
import { OfflineStage } from '../../export/OfflineStage';
import { StageShell } from '../../app/stage/StageShell';
import { LoadingCurtain } from '../../app/stage/LoadingCurtain';
import type { LibrarySong } from '../../app/stage/SongLibrary';
import { GameAudio } from '../../audio/GameAudio';

const offlineMode = import.meta.env.DEV && new URLSearchParams(location.search).get('offline') === '1';
const startupParams = new URLSearchParams(location.search);
// Explicit workbench/model-preview URLs keep their direct entry, including the exporter.
const directWorkspace = offlineMode || startupParams.get('workspace') === '1' || startupParams.has('electric') || startupParams.has('acoustic');
let shell: StageShell | null = null;
const loadingCurtain = offlineMode ? null : new LoadingCurtain();

const STAGE_SURFACE_Y = NOCTURNE_STAGE.surfaceY;
const MAX_FRAME_SECONDS = 0.05;
const PITCH_RANGE: readonly [number, number] = [-0.15, 1.35];
/**
 * NOCTURNE's full hall, including the audience floor and upper galleries. Keep the rear
 * limit in front of the opaque LED wall; free movement uses an additional floor clearance.
 */
const VENUE_CAMERA_BOUNDS = new THREE.Box3(
  new THREE.Vector3(...NOCTURNE_CAMERA_VOLUME.min),
  new THREE.Vector3(...NOCTURNE_CAMERA_VOLUME.max),
);



const mount = document.querySelector<HTMLElement>('[data-band-view]');
if (!mount) throw new Error('Band view mount is missing');

/* ------------------------------------------------------------------ *
 * Audio — the same shared graph the instrument library builds.
 * ------------------------------------------------------------------ */
const graph = createBandAudioGraph();
const { audio, live } = graph;
const gameAudio = directWorkspace ? null : new GameAudio(audio);

const prepareAudio = (): Promise<void> => graph.prepare();
const midiOutput = audio.createBus(1);
const playback = new MidiPlayback(audio.getContext(), midiOutput.input);

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
host.renderer.domElement.removeAttribute('aria-hidden');
host.renderer.domElement.setAttribute('aria-label', '乐队三维场景');
host.renderer.domElement.tabIndex = 0;
const venue = new NocturneVenue(host);
const lighting = new LightingSession(venue.lighting);
const screens = new ScreenSession(venue.screens);
const songScreens = new SongScreens(screens);
const screenAudio = new ScreenAudioTap(audio);

const cameraRegistry = new CameraRegistry();
const camera = new CameraSystem(cameraRegistry, instruments);
const cameraShow = new CameraShowPlayer(camera);
const titles = new TitleLayer();

/** Holds the current band. Replaced whenever the band is rebuilt from a score. */
let band = new THREE.Group();
band.name = 'band:instruments';
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
  for (const root of roots) root.updateWorldMatrix(true, true);
  for (const intersection of pickRaycaster.intersectObjects(roots, true)) {
    let visible = true;
    for (let node: THREE.Object3D | null = intersection.object; node; node = node.parent) visible &&= node.visible;
    if (!visible) continue;
    const owner = instruments.ownerOf(intersection.object);
    if (owner) return owner.id;
  }
  return null;
}

let presentation = new PresentationManager();

/** Stage views, filled in once the layout is known. Index 0 is the audience view. */
let bandViewIds: string[] = [];


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

const audience = new FreeCameraController(camera, host.renderer.domElement, VENUE_CAMERA_BOUNDS, STAGE_SURFACE_Y);
let stage: StageDirector | null = null;
audience.onUnlock = () => { if (stage?.current.kind === 'audience') stage.showBand(); };
const cameraPanel = new BandCameraPanel({
  onBandView: (id) => stage?.selectBandView(id),
  onAudience: () => stage?.enterAudience(),
  onBack: () => stage?.showBand(),
  onLock: () => audience.lockPointer(),
  onHome: () => audience.resetPosition(),
  onMove: (key, down) => audience.setMoveKey(key, down),
  onArrange: () => {
    if (!bandSession) return;
    try { mountBand(bandSession.rearrange(), instruments.list()); dropHint.setVisible(false); }
    catch (error) { dropHint.setText(String(error)); dropHint.setVisible(true); }
  },
});
const lightingPanel = new LightingPanel(lighting, {
  loadExample: id => { void loadLightingExample(id); },
  toggle: enabled => { lighting.setEnabled(enabled, player?.time ?? 0); lightingPanel.update(); },
  seek: seconds => player?.seek(seconds),
});
cameraPanel.appendPanel(lightingPanel.element);
const screenPanel = new ScreenPanel(screens, songScreens);
cameraPanel.appendPanel(screenPanel.element);
const directorPanel = new DirectorPanel({
  toggle: enabled => {
    if (enabled && cameraShow.available) stage?.startBroadcast();
    else if (stage?.current.kind === 'broadcast') stage.takeBandControl();
  },
  seek: time => { player?.seek(time); if (cameraShow.available) stage?.startBroadcast(); },
  toggleTitles: enabled => { titles.enabled = enabled; },
});
cameraPanel.appendPanel(directorPanel.element);
function refreshCameraScene(): void {
  const bounds = bandBounds();
  camera.setTransitionClearance(bounds.max.y + 1);
  audience.setScene(bounds);
}

function bandBounds(): THREE.Box3 {
  const bounds = new THREE.Box3().setFromObject(band);
  return bounds.isEmpty() ? venue.overviewBounds.clone() : bounds;
}


let bandSession: BandSession | null = null;

/** One commit path for startup and MIDI changes. All placement has succeeded before this runs. */
function mountBand(next: BandSession, list: readonly Instrument[], instant = false): void {
  audience.exit();
  presentation.dispose();
  const retained = new Set(list);
  for (const previous of instruments.list()) {
    cameraRegistry.clearInstrumentViews(previous.id);
    instruments.unregister(previous.id);
    if (!retained.has(previous)) previous.dispose();
  }
  presentation = new PresentationManager();
  for (const instrument of list) instruments.register(instrument);
  const presented = next.apply();
  host.scene.remove(band);
  band = presented.group;
  host.scene.add(band);
  bandSession = next;
  registerAtelierViews(cameraRegistry, list);
  const showcase = createAtelierShowcase({ element: host.renderer.domElement, camera, cameraRegistry, interactions, instruments: list });
  for (const mode of showcase.modes) presentation.register(mode);
  bandViewIds = registerBandViews(cameraRegistry, bandBounds(), venue.overviewBounds);
  refreshCameraScene();
  stage = new StageDirector({ camera, instruments, presentation,
    modes: showcase.byInstrumentId, entryViewIds: showcase.wholeViewIds,
    bandViewId: bandViewIds[0], orbit, audience,
    onChange: focus => {
      cameraPanel.update(focus, instruments, stage?.activeBandViewId);
      directorPanel.update(focus.kind === 'broadcast');
    },
  });
  camera.setCameraBounds(venue.cameraBounds);
  stage.selectBandView(bandViewIds[0], instant);
  host.invalidateShadows();
}

async function buildBand(): Promise<void> {
  const variant = new URLSearchParams(location.search).get('electric');
  const acousticVariant = new URLSearchParams(location.search).get('acoustic');
  const defaults = await createDefaultInstruments(live,
    variant === 'single-cut' || variant === 'flying-v' ? variant : 'classic',
    acousticVariant === 'cutaway-sunburst' ? acousticVariant : 'natural');
  const list = Object.values(defaults);
  try {
    const next = BandSession.prepare(Object.entries(defaults).map(([type, instrument]) =>
      ({ id: instrument.id, type: type as LayoutInstrumentType, root: instrument.root })), venue.layout);
    mountBand(next, list, true);
    if (variant === 'single-cut' || variant === 'flying-v') stage?.focusInstrument(defaults.electric.id, true);
    else if (acousticVariant === 'cutaway-sunburst') stage?.focusInstrument(defaults.acoustic.id, true);
  } catch(error) { for (const instrument of list) instrument.dispose(); throw error; }
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
  element.addEventListener('contextmenu', event => event.preventDefault());
  let press: {
    x: number;
    y: number;
    button: number;
    moved: boolean;
  } | null = null;

  element.addEventListener('pointerdown', (event) => {
    void unlockAudio();
    if (!stage) return;
    press = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      moved: false,
    };
    if ((stage?.isBand || stage?.current.kind === 'broadcast') && event.button === 0) {
      capturePointer(element, event.pointerId);
      stage.takeBandControl();
    }
  });

  element.addEventListener('pointermove', (event) => {
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    press.moved = true;

    if (press.button !== 0 || !stage?.isBand) return;
    orbit.orbitBy(dx, dy);
    press.x = event.clientX;
    press.y = event.clientY;
  });

  const release = (event: PointerEvent): void => {
    releasePointer(element, event.pointerId);
    const gesture = press;
    press = null;
    if (!gesture || gesture.moved || event.button !== gesture.button) return;

    if (gesture.button !== 2) return;
    // Right click steps back out; right *drag* stays as the mode's pan.
    if (stage?.current.kind === 'instrument') stage.showBand();
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);

  element.addEventListener('wheel', (event) => {
    if (!stage?.isBand && stage?.current.kind !== 'broadcast') return;
    event.preventDefault();
    stage.takeBandControl();
    orbit.zoomBy(Math.exp(event.deltaY * 0.001));
  }, { passive: false });

  // Double click is the one way in and the one way across: from the wide band it steps into an
  // instrument, and from inside one it moves the close-up to another. Single click deliberately
  // does nothing at stage level — inside an instrument it belongs to the presentation mode.
  element.addEventListener('dblclick', (event) => {
    const instrumentId = instrumentAt(event.clientX, event.clientY);
    if (!instrumentId) return;
    if (instrumentId === stage?.focusedInstrumentId) return;
    stage?.focusInstrument(instrumentId);
  });

  document.addEventListener('keydown', (event) => {
    if (shell?.inLobby || shell?.isPaused) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;

    // Inside an instrument the mode owns the number keys (its own saved views), so this only
    // answers while the whole band is on screen.
    if (event.code === 'Escape') {
      document.body.classList.remove('concert-watch');
      if (!stage?.isBand) stage?.showBand();
      return;
    }
    if (!stage?.isBand && stage?.current.kind !== 'broadcast') return;

    // Stage views. The camera layer takes both a move and a cut; this call site asks for the
    // default (a move) and nothing more.
    const digit = /^Digit([1-9])$/.exec(event.code);
    if (!digit) return;
    const index = Number(digit[1]) - 1;
    const viewId = bandViewIds[index];
    if (!viewId) return;
    event.preventDefault();
    stage?.selectBandView(viewId);
  });
}

function resize(): void {
  const viewport = host.resizeIfNeeded();
  camera.setViewport(viewport.width, viewport.height);
}

let lastFrame = performance.now();
function loop(): void {
  if (offlineMode) return; // The export controller owns time and rendering in its isolated page.
  const now = performance.now();
  const dt = shell?.isPaused ? 0 : Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
  lastFrame = now;

  player?.update();
  lighting.update(player?.time ?? 0);
  screens.update(dt, player ? { time: player.time, playing: player.isPlaying } : null, shell?.isPaused ? undefined : screenAudio.sample());
  venue.update(dt);
  lightingPanel.update();
  screenPanel.update();
  instruments.update(dt);
  resize();
  if (stage?.current.kind === 'broadcast') directorPanel.update(true, cameraShow.update(player?.time ?? 0));
  stage?.update(dt);
  host.render(camera.output);
  titles.update(player?.time ?? 0);
  titles.render(host.renderer);
  if (player) transport.update(player.time, player.total, player.isPlaying);
  if (previewSong && !previewLooping && !document.hidden && shell?.inLobby &&
    (!playback.isPlaying || playback.time >= Math.min(playback.total, previewSong.previewAt + previewSong.previewSeconds))) {
    const request = previewVersion;
    playback.seek(previewSong.previewAt); previewLooping = true;
    void playback.play().catch(() => { if (request === previewVersion) cancelPreview(); }).finally(() => { previewLooping = false; });
  }
  shell?.updatePreview(playback.time, playback.isPlaying);
  if (gameAudio) shell?.updateAudio(gameAudio.sample(), gameAudio.time);
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ *
 * Performance mode — drop a MIDI file and this band plays it
 * ------------------------------------------------------------------ */

/**
 * Dropping a file replaces the six-instrument band with whatever that file asks for.
 *
 * The arrangement is not a fixed ensemble: a file with two guitar parts gets two guitars, one whose
 * keyboard writing needs three manuals gets three keyboards. `src/midi` decides all of that from the
 * file alone, and this only puts the answer on the stage.
 *
 * Every planned instance gets its own views and interaction mode, including repeated types.
 */
const transport = new TransportBar({
  onPlay: () => { void player?.play().catch((error) => {
    dropHint.setVisible(true);
    dropHint.setText(String(error));
  }); },
  onPause: () => player?.pause(),
  onStop: () => player?.stop(),
  onSeek: (seconds) => player?.seek(seconds),
});
const dropHint = new DropHint();
let performanceBand: BuiltBand | null = null;
/** The stage view is being flown to; the orbit takes over once it lands. */
let player: BandPlayer | null = null;
let loading = false;
let previewVersion = 0;
let previewQueue: Promise<void> = Promise.resolve();
let previewAbort: AbortController | null = null;
let previewSong: LibrarySong | null = null;
let previewLooping = false;

function cancelPreview(): void {
  previewVersion++; previewAbort?.abort(); previewAbort = null; previewSong = null;
  if (!player) playback.stop();
  gameAudio?.setMenuPlaying(true);
}

function previewSelection(song: LibrarySong): Promise<void> {
  cancelPreview();
  const request = previewVersion;
  const controller = new AbortController(); previewAbort = controller;
  const work = previewQueue.catch(() => {}).then(async () => {
    if (request !== previewVersion) return;
    await audio.resume();
    const entry = SHOW_EXAMPLES.find(entry => entry.id === song.id);
    if (!entry) throw new Error('找不到这首歌曲');
    const response = await fetch(entry.midiUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`歌曲下载失败：${response.status}`);
    const binary = await response.arrayBuffer();
    if (request !== previewVersion) return;
    await playback.load(binary, song.title);
    if (request !== previewVersion) return;
    playback.seek(song.previewAt); await playback.play();
    if (request !== previewVersion) { playback.stop(); return; }
    previewSong = song; gameAudio?.setMenuPlaying(false);
  });
  previewQueue = work;
  return work;
}


async function loadMidiFile(file: File): Promise<void> {
  const loaded = await loadMidiSource(() => Promise.resolve(file), file.name);
  if (loaded && shell?.inLobby && !shell.isBusy) shell.enterPerformance(true);
}

async function loadLightingExample(id: string): Promise<boolean> {
  const example = SHOW_EXAMPLES.find(item => item.id === id);
  if (!example) throw new Error('未知灯光示例');
  return loadMidiSource(async () => {
    const response = await fetch(example.midiUrl);
    if (!response.ok) throw new Error(`示例下载失败：${response.status}`);
    return new File([await response.arrayBuffer()], `${example.title}.mid`, { type: 'audio/midi' });
  }, example.title, example.id);
}

async function loadMidiSource(source: () => Promise<File>, label: string, exampleId?: string): Promise<boolean> {
  if (loading) return false;
  loading = true;
  lightingPanel.setBusy(true);
  dropHint.setVisible(true);
  dropHint.setText(`正在解析 ${label} …`);
  const reveal = await loadingCurtain?.begin();

  try {
    if (shell) { cancelPreview(); await previewQueue.catch(() => {}); }
    await initialBandReady;
    await audio.resume();
    const file = await source();
    const binary = await file.arrayBuffer();
    const show = await prepareMatchingShow(binary, venue.lighting.rig, exampleId);
    const analysis = analyzeMidi(new Uint8Array(binary));
    if (!analysis.plan.totalInstruments) throw new Error("MIDI 中没有可显示的音符");
    dropHint.setText('正在准备乐队和布局…');
    dropHint.setText(
      `${file.name}\n${analysis.plan.totalInstruments} 件乐器，正在搭建…`,
    );
    await enterPerformanceMode(analysis, file.name, binary, show);
    return true;
  } catch (error) {
    console.error('[Band View] MIDI 装载失败', error);
    dropHint.setVisible(true);
    dropHint.setText(`${label} 载入失败\n${String(error)}`);
    return false;
  } finally {
    await reveal?.();
    loading = false;
    lightingPanel.setBusy(false);
  }
}

/** The editor's JSON is applied by ID, using exactly the same normalized models and transforms. */
async function loadLayoutFile(file: File): Promise<void> {
  if (loading) return;
  loading = true;
  lightingPanel.setBusy(true);
  const created: Instrument[] = [];
  const reveal = await loadingCurtain?.begin('给每件乐器找个好位置');
  try {
    await initialBandReady;
    if (file.size > 1_000_000) throw new Error('布局文件不能超过 1 MB');
    const layout = parseLayoutDocument(JSON.parse(await file.text()));
    const list: Instrument[] = [];
    for (const descriptor of layout.instances) {
      const existing = instruments.get(descriptor.id);
      if (existing && existing.role !== descriptor.type) throw new Error(`${descriptor.id} 的类型与当前实例不符`);
      const instrument = existing ?? await createInstrumentInstance(descriptor, live);
      if (!existing) created.push(instrument);
      list.push(instrument);
    }
    const next = BandSession.fromLayout(list.map((instrument, i) => ({ id: instrument.id, type: layout.instances[i].type, root: instrument.root })), layout, venue.layout);
    player?.stop(); player?.dispose(); player = null;
    cameraShow.setShow(null); directorPanel.setShow(null);
    titles.setShow(null); directorPanel.setTitles(null);
    lighting.setShow(null);
    await screenPanel.setSong(null);
    mountBand(next, list);
    performanceBand = null;
    transport.setVisible(false);
    dropHint.setVisible(false);
    if (shell?.inLobby) shell.enterPerformance(true);
  } catch (error) {
    for (const instrument of created) if (instruments.get(instrument.id) !== instrument) instrument.dispose();
    dropHint.setText(`布局未应用：${String(error)}`); dropHint.setVisible(true);
  } finally { await reveal?.(); loading = false; lightingPanel.setBusy(false); }
}

async function enterPerformanceMode(
  analysis: ReturnType<typeof analyzeMidi>,
  fileName: string,
  binary: ArrayBuffer,
  show: PreparedBandShow | null,
): Promise<void> {
  const built = await buildMidiBand(analysis.plan, graph, instruments);
  let next: BandSession;
  try {
    next = BandSession.prepare(built.built.map(record => ({ id: record.instrument.id, type: record.type, root: record.instrument.root })), venue.layout, bandSession);
    player?.pause();
    await playback.load(binary, fileName);
  } catch(error) { built.discard(); throw error; }
  player?.dispose();
  mountBand(next, built.built.map(record => record.instrument));
  performanceBand = built;
  player = new BandPlayer({
    playback,
    band: built,
    plan: analysis.plan,
    onEnded: () => { transport.update(playback.total, playback.total, false); gameAudio?.setMenuPlaying(true); },
  });
  lighting.setShow(show?.lighting ?? null, player.time);
  cameraShow.setShow(show?.camera ?? null, built.built.map(b => ({ type: b.type, instance: b.instance, instrumentId: b.instrument.id })));
  directorPanel.setShow(show?.camera ?? null);
  titles.setShow(show?.titles ?? null); titles.enabled = true;
  directorPanel.setTitles(show?.titles ?? null);
  if (show?.camera) stage?.startBroadcast();
  screens.update(0, { time: player.time, playing: player.isPlaying });
  await screenPanel.setSong(show?.screens ?? null);
  transport.setDuration(player.total);
  transport.setSummary(summarisePlan(analysis, fileName));
  transport.setVisible(true);
  transport.update(0, player.total, false);
  dropHint.setVisible(false);
  console.info('[Band View]\n' + analysis.report);
}

function summarisePlan(analysis: ReturnType<typeof analyzeMidi>, fileName: string): string {
  const label: Record<string, string> = {
    drums: '鼓',
    bass: '贝斯',
    keyboard: '键盘',
    piano: '钢琴',
    cello: '大提琴',
    saxophone: '萨克斯',
    acoustic: '木吉他',
    electric: '电吉他',
    violin: '提琴',
  };
  const parts = analysis.plan.instruments.map((entry) => `${label[entry.type] ?? entry.type}×${entry.count}`);
  return `${fileName}    ${parts.join('   ')}    共 ${analysis.plan.totalInstruments} 件    ${analysis.midi.tracks.length} 条轨`;
}

// The band page stays free of interface, so the drop target only announces itself while a file is
// actually being dragged over it.
for (const type of ['dragenter', 'dragover'] as const) {
  window.addEventListener(type, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!loading && !performanceBand) dropHint.setVisible(true);
  });
}
window.addEventListener('dragleave', (event) => {
  if (event.relatedTarget) return;
  if (!loading && !performanceBand) dropHint.setVisible(false);
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  if (shell?.isBusy) return;
  if (shell?.inLobby) shell.stopPreview();
  const file = event.dataTransfer?.files?.[0];
  if (file) void (/\.json$/i.test(file.name) ? loadLayoutFile(file) : loadMidiFile(file));
  else dropHint.setVisible(false);
});

// Audio continues in the worklet; only the visual pose needs rebuilding on return.
document.addEventListener('visibilitychange', () => {
  if (shell?.inLobby && previewSong) {
    if (document.hidden) playback.pause();
    else { playback.seek(previewSong.previewAt); void playback.play(); }
  }
  if (!document.hidden) player?.resumeFromSuspension();
});

live.onError = (error) => {
  console.error('[自由弹奏]', error);
  dropHint.setText(`自由弹奏音源载入失败：${String(error)}`);
  dropHint.setVisible(true);
};
// The lobby starts with real empty geometry, without constructing the default instrument set.
function mountEmptyStage(): void {
  mountBand(BandSession.prepare([], venue.layout), [], true);
  stage?.selectBandView('band:venue', true);
}
const initialBandReady = directWorkspace ? (async () => {
  const reveal = await loadingCurtain?.begin();
  try { await buildBand(); } finally { await reveal?.(); }
})() : Promise.resolve().then(mountEmptyStage);
void initialBandReady.catch((error) => {
  console.error('[Band View] 装配失败：', error);
  dropHint.setText(`乐队载入失败：${String(error)}`); dropHint.setVisible(true);
});

if (!directWorkspace) {
  shell = new StageShell({
    preview: previewSelection,
    stopPreview: cancelPreview,
    onView: view => gameAudio?.setMenuPlaying(view !== 'performance'),
    pause: () => { player?.pause(); if (document.pointerLockElement) document.exitPointerLock(); },
    resume: async () => { await player?.play(); gameAudio?.setMenuPlaying(false); },
    uiSound: kind => gameAudio?.uiSound(kind),
    start: async song => {
      if (!await loadLightingExample(song.id)) throw new Error('歌曲载入失败');
      await player?.play();
      gameAudio?.setMenuPlaying(false);
    },
    home: async () => {
      player?.stop(); player?.dispose(); player = null; performanceBand = null;
      cameraShow.setShow(null); directorPanel.setShow(null);
      titles.setShow(null); directorPanel.setTitles(null); lighting.setShow(null);
      await screenPanel.setSong(null); screens.restore();
      transport.setVisible(false); dropHint.setVisible(false);
      const previous = instruments.list(); mountEmptyStage();
      for (const instrument of previous) instrument.dispose();
    },
    importFile: async file => {
      if (!await loadMidiSource(() => Promise.resolve(file), file.name)) throw new Error('MIDI 载入失败');
      await player?.play();
    },
    roam: () => stage?.enterAudience(),
    broadcast: () => { if (cameraShow.available) stage?.startBroadcast(); else stage?.showBand(); },
  }, loadingCurtain!);
}

attachStageInput();
resize();
loop();
if (directWorkspace) void prepareAudio().catch(live.onError);

window.addEventListener('pagehide', () => {
  shell?.dispose();
  loadingCurtain?.dispose();
  gameAudio?.dispose();
  player?.dispose();
  playback.dispose();
  midiOutput.disconnect();
  interactions.dispose();
  presentation.dispose();
  instruments.dispose();
  graph.dispose();
  audience.dispose();
  cameraPanel.dispose();
  lightingPanel.dispose();
  lighting.dispose();
  screenPanel.dispose();
  directorPanel.dispose();
  titles.dispose();
  screens.dispose();
  screenAudio.dispose();
  host.dispose();
}, { once: true });

// Same dev-only escape hatch the main app exposes from src/main.tsx.
if (import.meta.env.DEV) {
  Object.defineProperty(window, 'bandView', {
    configurable: true,
    value: {
      host, venue, lighting, screens, instruments, interactions, camera, cameraRegistry, audio, live, playback,
      get presentation() { return presentation; },
      instrumentAt, audience,
      get band() { return band; },
      get session() { return bandSession; },
      get stage() { return stage; },
      get orbit() { return orbit; },
      get player() { return player; },
      get performanceBand() { return performanceBand; },
      cameraShow, titles, gameAudio,
      get previewState() { return { id: previewSong?.id ?? null, time: playback.time, playing: playback.isPlaying, version: previewVersion }; },
      offline: offlineMode ? new OfflineStage({ player: () => player, instruments, lighting, screens, venue, camera, cameraShow, titles, host }) : null,
      loadMidiFile,
      loadLightingExample,
      loadLayoutFile,
      analyzeMidi,
    },
  });
}
