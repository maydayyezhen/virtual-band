import * as THREE from 'three';
import { RendererHost } from '../../engine/RendererHost';
import type { VenueSceneProfile } from '../../venues/Venue';
import { LayoutEditorRuntime } from './LayoutEditorRuntime';
import sourcePart01 from './nocturne-legacy/nocturne-stage-source-01.js?raw';
import sourcePart02 from './nocturne-legacy/nocturne-stage-source-02.js?raw';
import sourcePart03 from './nocturne-legacy/nocturne-stage-source-03.js?raw';
import sourcePart04 from './nocturne-legacy/nocturne-stage-source-04.js?raw';
import sourcePart05 from './nocturne-legacy/nocturne-stage-source-05.js?raw';
import sourcePart06 from './nocturne-legacy/nocturne-stage-source-06.js?raw';
import sourcePart07 from './nocturne-legacy/nocturne-stage-source-07.js?raw';

const STAGE_SURFACE_Y = 1.2;
const sourceParts = [
  sourcePart01,
  sourcePart02,
  sourcePart03,
  sourcePart04,
  sourcePart05,
  sourcePart06,
  sourcePart07,
];

const NOCTURNE_PROFILE: VenueSceneProfile = {
  clearColor: 0x080e19,
  clearAlpha: 1,
  outputColorSpace: THREE.SRGBColorSpace,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.08,
  shadows: {
    enabled: true,
    type: THREE.PCFSoftShadowMap,
    autoUpdate: true,
  },
  pixelRatio: {
    desktopMax: 1.65,
    mobileMax: 1.1,
    mobileBreakpoint: 700,
  },
};

interface DisposableLike {
  dispose?: () => void;
}

interface LegacyGlow {
  resize: (width: number, height: number, high: boolean) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  sceneRT?: DisposableLike;
  ping?: DisposableLike;
  pong?: DisposableLike;
  extract?: DisposableLike;
  blur?: DisposableLike;
  combine?: DisposableLike;
  quad?: THREE.Mesh;
}

interface LegacyHaze {
  update: (dt: number) => void;
}

interface LegacyUpdatable {
  update: (dt: number) => void;
}

interface LegacyScreen extends LegacyUpdatable {
  brightness?: number;
  material?: THREE.ShaderMaterial;
}

interface StageFrame {
  dt: number;
  time: number;
  beat: number;
  bpm: number;
  stage: LegacyStage;
}

interface LegacyInstrumentEntry {
  root: THREE.Object3D;
  update?: ((frame: StageFrame, root: THREE.Object3D) => void) | null;
}

interface LegacyStage {
  scene: THREE.Scene;
  quality: 'high' | 'standard' | 'low';
  glow?: LegacyGlow;
  envRT?: THREE.WebGLRenderTarget;
  haze?: LegacyHaze;
  lights?: Map<string, LegacyUpdatable>;
  screens?: Map<string, LegacyScreen>;
  reflection?: THREE.ShaderMaterial;
  updates?: Set<(frame: StageFrame) => void>;
  instruments?: Map<string, LegacyInstrumentEntry>;
  time: number;
  demoTime: number;
  demo: boolean;
  paused: boolean;
  bpm: number;
  mode: string;
  nextDemoBeat: number;
  beat: {
    value: number;
    index: number;
    duration: number;
  };
  triggerBeat?: (strength?: number, options?: Record<string, unknown>) => unknown;
}

interface LayoutStageHandle {
  root: THREE.Group;
  stage: LegacyStage;
  dispose: () => void;
}

interface StageState {
  disposed: boolean;
  loading: Promise<void> | null;
  handle: LayoutStageHandle | null;
  lastFrameTime: number;
}

interface LegacyGlobals {
  THREE?: typeof THREE;
  __NOCTURNE_LAYOUT_HOST__?: {
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    embedded: true;
  };
  __NOCTURNE_LAYOUT_STAGE__?: LegacyStage;
  __NOCTURNE_LAYOUT_ERROR__?: unknown;
  __NOCTURNE_LAYOUT_API__?: Record<string, (...args: unknown[]) => unknown>;
  __NOCTURNE_LAYOUT_READY__?: Promise<LegacyStage>;
}

type RuntimeWithStagePlane = LayoutEditorRuntime & {
  instrumentLayer: THREE.Group;
  grid: THREE.GridHelper;
  groundPlane: THREE.Plane;
};

const states = new WeakMap<RendererHost, StageState>();
const drawingBufferSize = new THREE.Vector2();
let installed = false;

/**
 * Layout Lab only.
 *
 * The attached NOCTURNE single-file scene is the source of truth for the venue,
 * materials, environment, default lighting, stage fixtures, LED surfaces, haze
 * and glow pass. The editor keeps only its own instrument manipulation and camera.
 */
export function installNocturneLayoutStage(): void {
  if (installed) return;
  installed = true;

  const originalApplySceneProfile = RendererHost.prototype.applySceneProfile;
  const originalRender = RendererHost.prototype.render;
  const originalDispose = RendererHost.prototype.dispose;

  RendererHost.prototype.applySceneProfile = function applyNocturneProfile(_profile) {
    // LayoutEditorRuntime still constructs AtelierStudioVenue for now, but it is no
    // longer part of the Layout Lab scene. Do not apply its environment or lights.
    this.scene.getObjectByName('venue:atelier-studio')?.removeFromParent();
    originalApplySceneProfile.call(this, NOCTURNE_PROFILE);
    void ensureStage(this);
  };

  RendererHost.prototype.render = function renderNocturneLayout(camera) {
    const state = states.get(this);
    const handle = state?.handle;
    if (!state || !handle) {
      originalRender.call(this, camera);
      return;
    }

    const now = performance.now();
    const dt = state.lastFrameTime
      ? THREE.MathUtils.clamp((now - state.lastFrameTime) / 1000, 0, 0.08)
      : 1 / 60;
    state.lastFrameTime = now;
    updateLegacyStage(handle.stage, dt);

    const glow = handle.stage.glow;
    if (!glow || handle.stage.quality === 'low') {
      originalRender.call(this, camera);
      return;
    }

    this.renderer.getDrawingBufferSize(drawingBufferSize);
    glow.resize(
      Math.max(1, drawingBufferSize.x),
      Math.max(1, drawingBufferSize.y),
      handle.stage.quality === 'high',
    );
    glow.render(this.scene, camera);
  };

  RendererHost.prototype.dispose = function disposeNocturneLayout() {
    const state = states.get(this);
    if (state) {
      state.disposed = true;
      state.handle?.dispose();
      state.handle = null;
      states.delete(this);
    }
    originalDispose.call(this);
  };

  const runtimePrototype = LayoutEditorRuntime.prototype;
  const originalStart = runtimePrototype.start;
  runtimePrototype.start = async function startOnNocturneStage() {
    alignEditorToStageSurface(this);
    return originalStart.call(this);
  };
}

function alignEditorToStageSurface(runtime: LayoutEditorRuntime): void {
  const internals = runtime as RuntimeWithStagePlane;
  internals.instrumentLayer.position.y = STAGE_SURFACE_Y;
  internals.grid.position.y = STAGE_SURFACE_Y + 0.003;
  internals.groundPlane.set(new THREE.Vector3(0, 1, 0), -STAGE_SURFACE_Y);
}

async function ensureStage(host: RendererHost): Promise<void> {
  let state = states.get(host);
  if (!state) {
    state = {
      disposed: false,
      loading: null,
      handle: null,
      lastFrameTime: 0,
    };
    states.set(host, state);
  }
  if (state.disposed || state.handle || state.loading) return;

  state.loading = buildLayoutStage(host)
    .then((handle) => {
      if (state?.disposed) {
        handle.dispose();
        return;
      }
      state!.handle = handle;
      state!.lastFrameTime = 0;
      host.invalidateShadows();
      console.info('[Layout Lab] NOCTURNE source scene attached');
    })
    .catch((error) => {
      console.error('[Layout Lab] NOCTURNE source scene failed to load', error);
    })
    .finally(() => {
      if (state) state.loading = null;
    });

  await state.loading;
}

async function buildLayoutStage(host: RendererHost): Promise<LayoutStageHandle> {
  const source = await decodeSource();
  const patched = patchSourceForLayoutLab(source);
  const globals = window as unknown as Window & LegacyGlobals;
  const previousThree = globals.THREE;
  const camera = new THREE.PerspectiveCamera(57, 1, 0.08, 160);
  const scene = host.scene;
  const originalChildren = new Set(scene.children);
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  const previousEnvironment = scene.environment;
  let stage: LegacyStage | undefined;

  globals.THREE = THREE;
  globals.__NOCTURNE_LAYOUT_HOST__ = {
    scene,
    renderer: host.renderer,
    camera,
    embedded: true,
  };
  globals.__NOCTURNE_LAYOUT_STAGE__ = undefined;
  globals.__NOCTURNE_LAYOUT_ERROR__ = undefined;

  try {
    Function(patched)();
    if (globals.__NOCTURNE_LAYOUT_ERROR__) throw globals.__NOCTURNE_LAYOUT_ERROR__;
    stage = globals.__NOCTURNE_LAYOUT_STAGE__;
    if (!stage) throw new Error('NOCTURNE StageEngine did not initialize');

    const root = new THREE.Group();
    root.name = 'layout-editor:nocturne-source-stage';
    root.userData.layoutEditorVenue = 'nocturne-source';

    for (const child of [...scene.children]) {
      if (!originalChildren.has(child)) root.add(child);
    }
    scene.add(root);
    stage.scene = scene;

    let meshCount = 0;
    let lightCount = 0;
    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshCount += 1;
      if ((object as THREE.Light).isLight) lightCount += 1;
    });
    if (meshCount < 20 || lightCount < 5) {
      throw new Error(`NOCTURNE import incomplete: ${meshCount} meshes, ${lightCount} lights`);
    }

    return {
      root,
      stage,
      dispose: () => {
        if (scene.environment === stage?.envRT?.texture) scene.environment = null;
        disposeObject(root);
        disposeGlow(stage?.glow);
        safeDispose(stage?.envRT);
      },
    };
  } catch (error) {
    for (const child of [...scene.children]) {
      if (originalChildren.has(child)) continue;
      disposeObject(child);
    }
    scene.background = previousBackground;
    scene.fog = previousFog;
    scene.environment = previousEnvironment;
    disposeGlow(stage?.glow);
    safeDispose(stage?.envRT);
    throw error;
  } finally {
    delete globals.__NOCTURNE_LAYOUT_HOST__;
    delete globals.__NOCTURNE_LAYOUT_STAGE__;
    delete globals.__NOCTURNE_LAYOUT_ERROR__;
    delete globals.__NOCTURNE_LAYOUT_API__;
    delete globals.__NOCTURNE_LAYOUT_READY__;
    if (previousThree === undefined) delete globals.THREE;
    else globals.THREE = previousThree;
  }
}

function updateLegacyStage(stage: LegacyStage, realDt: number): void {
  const dt = stage.paused ? 0 : realDt;
  stage.time += dt;
  if (stage.demo) stage.demoTime += dt;

  stage.beat.value *= Math.exp((-dt * 4) / Math.max(0.001, stage.beat.duration));
  if (stage.beat.value < 0.001) stage.beat.value = 0;

  if (
    stage.demo
    && !stage.paused
    && stage.demoTime >= stage.nextDemoBeat
    && stage.mode !== 'blackout'
  ) {
    stage.triggerBeat?.(stage.beat.index % 4 === 0 ? 0.9 : 0.5, { source: 'demo' });
    stage.nextDemoBeat = stage.demoTime + 60 / Math.max(1, stage.bpm);
  }

  const frame: StageFrame = {
    dt,
    time: stage.time,
    beat: stage.beat.value,
    bpm: stage.bpm,
    stage,
  };

  if (stage.updates) {
    for (const callback of [...stage.updates]) {
      try {
        callback(frame);
      } catch (error) {
        stage.updates.delete(callback);
        console.warn('[Layout Lab] NOCTURNE update callback stopped', error);
      }
    }
  }

  if (stage.instruments) {
    for (const item of stage.instruments.values()) {
      if (!item.update) continue;
      try {
        item.update(frame, item.root);
      } catch (error) {
        item.update = null;
        console.warn('[Layout Lab] NOCTURNE instrument update stopped', error);
      }
    }
  }

  try {
    stage.haze?.update(dt);
  } catch (error) {
    console.warn('[Layout Lab] NOCTURNE haze update failed', error);
  }

  if (stage.lights) {
    for (const fixture of stage.lights.values()) {
      try {
        fixture.update(dt);
      } catch (error) {
        console.warn('[Layout Lab] NOCTURNE light update failed', error);
      }
    }
  }

  if (stage.screens) {
    for (const screen of stage.screens.values()) {
      try {
        screen.update(dt);
      } catch (error) {
        console.warn('[Layout Lab] NOCTURNE screen update failed', error);
      }
    }
  }

  const main = stage.screens?.get('main');
  const reflection = stage.reflection;
  const sourceUniform = main?.material?.uniforms?.source;
  if (main && reflection && sourceUniform) {
    reflection.uniforms.source.value = sourceUniform.value;
    reflection.uniforms.brightness.value = main.brightness ?? 0.85;
    const decode = main.material?.uniforms?.decodeSRGB;
    if (decode) reflection.uniforms.decodeSRGB.value = decode.value;
  }
}

async function decodeSource(): Promise<string> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not support DecompressionStream');
  }

  const base64 = sourceParts.map(extractSourceChunk).join('');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  if (!source.includes('NOCTURNE — 单文件、离线、程序化全景演出场馆')) {
    throw new Error('NOCTURNE source signature not found');
  }
  if (!source.includes('function buildVenue(app)') || !source.includes('class StageEngine')) {
    throw new Error('NOCTURNE source is incomplete');
  }
  return source;
}

function extractSourceChunk(rawModule: string): string {
  const match = rawModule.match(/\.push\('([A-Za-z0-9+/=]+)'\);?/);
  if (!match) throw new Error('NOCTURNE source chunk is malformed');
  return match[1];
}

function patchSourceForLayoutLab(source: string): string {
  const hostHeader = '"use strict";\n        const __HOST__ = window.__NOCTURNE_LAYOUT_HOST__;';
  if (!source.includes('"use strict";')) throw new Error('NOCTURNE source header not found');
  let patched = source.replace('"use strict";', hostHeader);

  // Keep the original CameraRig object for scene API compatibility, but the Layout
  // Lab owns pointer/keyboard camera input.
  patched = patched.replace('            this.bind();', '            if (!__HOST__?.embedded) this.bind();');

  const marker = '        class StageEngine {';
  const markerIndex = patched.indexOf(marker);
  if (markerIndex < 0) throw new Error('NOCTURNE StageEngine not found');
  const head = patched.slice(0, markerIndex);
  let tail = patched.slice(markerIndex);

  tail = tail.replace('            this.scene = new T.Scene();', '            this.scene = __HOST__.scene;');
  tail = tail.replace(
    `            this.camera = new T.PerspectiveCamera(\n              57,\n              innerWidth / innerHeight,\n              0.08,\n              160,\n            );`,
    `            this.camera = __HOST__.camera;\n            this.camera.fov = 57;\n            this.camera.near = 0.08;\n            this.camera.far = 160;\n            this.camera.updateProjectionMatrix();`,
  );
  tail = tail.replace(
    `            this.renderer = new T.WebGLRenderer({\n              antialias: true,\n              alpha: false,\n              powerPreference: "high-performance",\n            });`,
    '            this.renderer = __HOST__.renderer;',
  );
  tail = tail.replace('            el("viewport").appendChild(this.renderer.domElement);', '');

  // The source scene itself is kept intact. Only browser-page ownership is removed:
  // no original resize listeners, context UI, camera input or private RAF loop.
  tail = tail.replace(
    /            this\.setStageMode\("nocturne"\);[\s\S]*?          }\n          emit\(name, detail\) \{/,
    `            this.setStageMode("nocturne");\n          }\n          emit(name, detail) {`,
  );
  tail = tail.replace(
    '          report(message) {',
    `          report(message) {\n            if (__HOST__?.embedded) {\n              console.warn('[NOCTURNE Layout Lab]', message);\n              this.emit('stageerror', { message });\n              return;\n            }`,
  );
  tail = tail.replace('          syncMode() {', '          syncMode() { if (__HOST__?.embedded) return;');
  tail = tail.replace('          syncTransport() {', '          syncTransport() { if (__HOST__?.embedded) return;');
  patched = head + tail;

  patched = patched.replace('          window.stage = app;', '          window.__NOCTURNE_LAYOUT_STAGE__ = app;');
  patched = patched.replace(
    '            window[name] = app[name].bind(app);',
    '            (window.__NOCTURNE_LAYOUT_API__ ||= {})[name] = app[name].bind(app);',
  );
  patched = patched.replace('          bindUI(app);', '          // Layout Lab owns the UI.');
  patched = patched.replace('          app.start();', '          // Layout Lab owns the RAF/render loop.');
  patched = patched.replace(
    '          window.stageReady = Promise.resolve(app);',
    '          window.__NOCTURNE_LAYOUT_READY__ = Promise.resolve(app);',
  );
  patched = patched.replace(
    '          window.dispatchEvent(new CustomEvent("stage-ready", { detail: app }));',
    '          // Keep the embedded stage private to Layout Lab.',
  );

  const catchStart = patched.lastIndexOf('        } catch (error) {');
  const iifeEnd = patched.lastIndexOf('        }\n      })();');
  if (catchStart < 0 || iifeEnd < catchStart) throw new Error('NOCTURNE bootstrap tail not found');
  patched = patched.slice(0, catchStart)
    + `        } catch (error) {\n          console.error('[NOCTURNE Layout Lab]', error);\n          window.__NOCTURNE_LAYOUT_ERROR__ = error;\n        }\n      })();`
    + patched.slice(iifeEnd + '        }\n      })();'.length);

  return patched;
}

function disposeGlow(glow: LegacyGlow | undefined): void {
  if (!glow) return;
  safeDispose(glow.sceneRT);
  safeDispose(glow.ping);
  safeDispose(glow.pong);
  safeDispose(glow.extract);
  safeDispose(glow.blur);
  safeDispose(glow.combine);
  try {
    glow.quad?.geometry.dispose();
  } catch (error) {
    console.warn('[Layout Lab] NOCTURNE glow geometry did not dispose cleanly', error);
  }
}

function safeDispose(value: DisposableLike | undefined): void {
  try {
    value?.dispose?.();
  } catch (error) {
    console.warn('[Layout Lab] NOCTURNE resource did not dispose cleanly', error);
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const renderable = object as THREE.Mesh | THREE.Points;
    if (renderable.geometry?.isBufferGeometry) geometries.add(renderable.geometry);
    const rawMaterial = renderable.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(rawMaterial) ? rawMaterial : rawMaterial ? [rawMaterial] : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
      if (material instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms) as Array<{ value?: unknown }>) {
          if (uniform?.value instanceof THREE.Texture) textures.add(uniform.value);
        }
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
