import * as THREE from 'three';
import { RendererHost } from '../../engine/RendererHost';
import legacyPart01 from './nocturne-legacy/nocturne-stage-source-01.js?raw';
import legacyPart02 from './nocturne-legacy/nocturne-stage-source-02.js?raw';
import legacyPart03 from './nocturne-legacy/nocturne-stage-source-03.js?raw';
import legacyPart04 from './nocturne-legacy/nocturne-stage-source-04.js?raw';
import legacyPart05 from './nocturne-legacy/nocturne-stage-source-05.js?raw';
import legacyPart06 from './nocturne-legacy/nocturne-stage-source-06.js?raw';
import legacyPart07 from './nocturne-legacy/nocturne-stage-source-07.js?raw';

const LEGACY_SOURCE_LENGTH = 127_767;
const LEGACY_STAGE_SURFACE_Y = 1.2;
const legacyParts = [
  legacyPart01,
  legacyPart02,
  legacyPart03,
  legacyPart04,
  legacyPart05,
  legacyPart06,
  legacyPart07,
];

interface DisposableLike {
  dispose?: () => void;
}

interface LegacyStage {
  glow?: DisposableLike;
  envRT?: DisposableLike;
}

interface StaticBackdropHandle {
  root: THREE.Group;
  dispose: () => void;
}

interface LegacyGlobals {
  THREE?: typeof THREE;
  __NOCTURNE_LAYOUT_STATIC_HOST__?: {
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    embedded: true;
  };
  __NOCTURNE_LAYOUT_STATIC_STAGE__?: LegacyStage;
  __NOCTURNE_LAYOUT_STATIC_ERROR__?: unknown;
  __NOCTURNE_LAYOUT_STATIC_API__?: Record<string, (...args: unknown[]) => unknown>;
  __NOCTURNE_LAYOUT_STATIC_READY__?: Promise<LegacyStage>;
}

interface BackdropState {
  disposed: boolean;
  loading: Promise<void> | null;
  handle: StaticBackdropHandle | null;
}

const states = new WeakMap<RendererHost, BackdropState>();
let installed = false;

/**
 * Layout Lab only: attach the exact legacy NOCTURNE venue geometry to RendererHost.
 * The old lighting, haze, camera controls, UI and animation loop stay disabled.
 *
 * This installer is imported only by src/dev/layout-editor/main.tsx, so the normal
 * application entry points never execute this compatibility layer.
 */
export function installNocturneStaticBackdrop(): void {
  if (installed) return;
  installed = true;

  const originalApplySceneProfile = RendererHost.prototype.applySceneProfile;
  const originalDispose = RendererHost.prototype.dispose;

  RendererHost.prototype.applySceneProfile = function applySceneProfileWithStaticNocturne(profile) {
    originalApplySceneProfile.call(this, profile);
    void ensureBackdrop(this);
  };

  RendererHost.prototype.dispose = function disposeWithStaticNocturne() {
    const state = states.get(this);
    if (state) {
      state.disposed = true;
      state.handle?.dispose();
      state.handle = null;
    }
    originalDispose.call(this);
  };
}

async function ensureBackdrop(host: RendererHost): Promise<void> {
  let state = states.get(host);
  if (!state) {
    state = { disposed: false, loading: null, handle: null };
    states.set(host, state);
  }
  if (state.disposed || state.handle || state.loading) return;

  state.loading = buildStaticBackdrop(host.renderer)
    .then((handle) => {
      if (state?.disposed) {
        handle.dispose();
        return;
      }
      state!.handle = handle;
      host.scene.add(handle.root);
      host.invalidateShadows();
      console.info('[Layout Lab] NOCTURNE static venue geometry attached');
    })
    .catch((error) => {
      console.error('[Layout Lab] NOCTURNE static venue geometry failed to load', error);
    })
    .finally(() => {
      if (state) state.loading = null;
    });

  await state.loading;
}

async function buildStaticBackdrop(renderer: THREE.WebGLRenderer): Promise<StaticBackdropHandle> {
  const source = await decodeLegacySource();
  const patched = patchLegacySource(source);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(57, 1, 0.08, 160);
  const globals = window as unknown as Window & LegacyGlobals;
  const previousThree = globals.THREE;
  const rendererState = snapshotRenderer(renderer);
  let stage: LegacyStage | undefined;

  globals.THREE = THREE;
  globals.__NOCTURNE_LAYOUT_STATIC_HOST__ = {
    scene,
    renderer,
    camera,
    embedded: true,
  };
  globals.__NOCTURNE_LAYOUT_STATIC_STAGE__ = undefined;
  globals.__NOCTURNE_LAYOUT_STATIC_ERROR__ = undefined;

  try {
    (0, Function)(patched)();
    if (globals.__NOCTURNE_LAYOUT_STATIC_ERROR__) {
      throw globals.__NOCTURNE_LAYOUT_STATIC_ERROR__;
    }
    stage = globals.__NOCTURNE_LAYOUT_STATIC_STAGE__;
    if (!stage) throw new Error('Legacy NOCTURNE StageEngine did not initialize');

    const root = new THREE.Group();
    root.name = 'layout-editor:nocturne-static-backdrop';
    root.position.y = -LEGACY_STAGE_SURFACE_Y;
    root.userData.layoutEditorBackdrop = 'nocturne-static';

    for (const child of [...scene.children]) root.add(child);
    freezeToGeometryOnly(root);

    let meshCount = 0;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshCount += 1;
      // The editor keeps its existing neutral Atelier lighting. The imported venue
      // is a visual/spatial reference only, so it does not need to cast large shadows.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    });
    if (meshCount < 10) {
      disposeObject(root);
      throw new Error(`Legacy NOCTURNE geometry import produced only ${meshCount} meshes`);
    }

    // Glow is post-processing only and has no role in the static layout reference.
    safeDispose(stage.glow);
    const retainedEnvironment = stage.envRT;

    return {
      root,
      dispose: () => {
        disposeObject(root);
        safeDispose(retainedEnvironment);
      },
    };
  } catch (error) {
    disposeObject(scene);
    safeDispose(stage?.glow);
    safeDispose(stage?.envRT);
    throw error;
  } finally {
    restoreRenderer(renderer, rendererState);
    delete globals.__NOCTURNE_LAYOUT_STATIC_HOST__;
    delete globals.__NOCTURNE_LAYOUT_STATIC_STAGE__;
    delete globals.__NOCTURNE_LAYOUT_STATIC_ERROR__;
    delete globals.__NOCTURNE_LAYOUT_STATIC_API__;
    delete globals.__NOCTURNE_LAYOUT_STATIC_READY__;
    if (previousThree === undefined) delete globals.THREE;
    else globals.THREE = previousThree;
  }
}

async function decodeLegacySource(): Promise<string> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not support DecompressionStream');
  }

  const base64 = legacyParts.map(extractLegacyChunk).join('');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  if (source.length !== LEGACY_SOURCE_LENGTH) {
    throw new Error(`Legacy NOCTURNE source length mismatch: ${source.length}`);
  }
  return source;
}

function extractLegacyChunk(rawModule: string): string {
  const match = rawModule.match(/\.push\('([A-Za-z0-9+/=]+)'\);?/);
  if (!match) throw new Error('Legacy NOCTURNE source chunk is malformed');
  return match[1];
}

function patchLegacySource(source: string): string {
  const hostHeader = '"use strict";\n        const __HOST__ = window.__NOCTURNE_LAYOUT_STATIC_HOST__;';
  if (!source.includes('"use strict";')) throw new Error('Legacy NOCTURNE source header not found');
  let patched = source.replace('"use strict";', hostHeader);
  patched = patched.replace('            this.bind();', '            if (!__HOST__?.embedded) this.bind();');

  const marker = '        class StageEngine {';
  const markerIndex = patched.indexOf(marker);
  if (markerIndex < 0) throw new Error('Legacy NOCTURNE StageEngine not found');
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
  tail = tail.replace(
    /            this\.setStageMode\("nocturne"\);[\s\S]*?          }\n          emit\(name, detail\) \{/,
    `            this.setStageMode("nocturne");\n          }\n          emit(name, detail) {`,
  );
  tail = tail.replace('          syncMode() {', '          syncMode() { if (__HOST__?.embedded) return;');
  tail = tail.replace('          syncTransport() {', '          syncTransport() { if (__HOST__?.embedded) return;');
  patched = head + tail;

  patched = patched.replace(
    '          window.stage = app;',
    '          window.__NOCTURNE_LAYOUT_STATIC_STAGE__ = app;',
  );
  patched = patched.replace(
    '            window[name] = app[name].bind(app);',
    '            (window.__NOCTURNE_LAYOUT_STATIC_API__ ||= {})[name] = app[name].bind(app);',
  );
  patched = patched.replace('          bindUI(app);', '          // Layout Lab owns all UI.');
  patched = patched.replace('          app.start();', '          // Layout Lab owns the render loop.');
  patched = patched.replace(
    '          window.stageReady = Promise.resolve(app);',
    '          window.__NOCTURNE_LAYOUT_STATIC_READY__ = Promise.resolve(app);',
  );
  patched = patched.replace(
    '          window.dispatchEvent(new CustomEvent("stage-ready", { detail: app }));',
    '          // Keep the legacy venue private to the layout editor.',
  );

  const catchStart = patched.lastIndexOf('        } catch (error) {');
  const iifeEnd = patched.lastIndexOf('        }\n      })();');
  if (catchStart < 0 || iifeEnd < catchStart) throw new Error('Legacy NOCTURNE bootstrap tail not found');
  patched = patched.slice(0, catchStart)
    + `        } catch (error) {\n          console.error('[NOCTURNE layout static]', error);\n          window.__NOCTURNE_LAYOUT_STATIC_ERROR__ = error;\n        }\n      })();`
    + patched.slice(iifeEnd + '        }\n      })();'.length);

  return patched;
}

function freezeToGeometryOnly(root: THREE.Object3D): void {
  root.traverse((object) => {
    const light = object as THREE.Light;
    if (light.isLight) {
      light.visible = false;
      light.intensity = 0;
      return;
    }

    const points = object as THREE.Points;
    if (points.isPoints) {
      points.visible = false;
      return;
    }

    const sprite = object as THREE.Sprite;
    if (sprite.isSprite) sprite.visible = false;
  });
}

function snapshotRenderer(renderer: THREE.WebGLRenderer) {
  const clearColor = new THREE.Color();
  renderer.getClearColor(clearColor);
  return {
    size: renderer.getSize(new THREE.Vector2()),
    pixelRatio: renderer.getPixelRatio(),
    clearColor,
    clearAlpha: renderer.getClearAlpha(),
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    shadowEnabled: renderer.shadowMap.enabled,
    shadowType: renderer.shadowMap.type,
    shadowAutoUpdate: renderer.shadowMap.autoUpdate,
  };
}

function restoreRenderer(renderer: THREE.WebGLRenderer, state: ReturnType<typeof snapshotRenderer>): void {
  renderer.setPixelRatio(state.pixelRatio);
  renderer.setSize(state.size.x, state.size.y, false);
  renderer.setClearColor(state.clearColor, state.clearAlpha);
  renderer.outputColorSpace = state.outputColorSpace;
  renderer.toneMapping = state.toneMapping;
  renderer.toneMappingExposure = state.toneMappingExposure;
  renderer.shadowMap.enabled = state.shadowEnabled;
  renderer.shadowMap.type = state.shadowType;
  renderer.shadowMap.autoUpdate = state.shadowAutoUpdate;
  renderer.shadowMap.needsUpdate = true;
}

function safeDispose(value: DisposableLike | undefined): void {
  try {
    value?.dispose?.();
  } catch (error) {
    console.warn('[Layout Lab] NOCTURNE auxiliary resource did not dispose cleanly', error);
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry?.isBufferGeometry) geometries.add(renderable.geometry);
    const rawMaterial = renderable.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(rawMaterial) ? rawMaterial : rawMaterial ? [rawMaterial] : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
      if (material instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms)) {
          if (uniform?.value instanceof THREE.Texture) textures.add(uniform.value);
        }
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
