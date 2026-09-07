import * as THREE from 'three';

interface LegacyDrumFactories {
  createModel: () => LegacyDrumModel;
  createController: (model: LegacyDrumModel, hooks?: Record<string, unknown>) => LegacyDrumController;
}

export interface LegacyDrumModel {
  root: THREE.Group;
  pieces: Map<string, unknown>;
  pedals: Record<string, unknown>;
}

export interface LegacyDrumController {
  noteOn(note: number, velocity?: number): boolean;
  noteOff(note: number): boolean;
  hit(id: string, velocity?: number): boolean;
  setHiHat(value: number): boolean;
  panic(): boolean;
  tick(dt: number): { moved: boolean; animating: boolean };
}

const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type WoodKind = 'spruce' | 'rosewood' | 'ebony' | 'mahogany' | 'maple' | 'walnut';

function canvasTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function woodTexture(kind: WoodKind, size = 1024): THREE.CanvasTexture {
  return canvasTexture(size, size, (ctx, width, height) => {
    const pixels = ctx.createImageData(width, height);
    const data = pixels.data;
    const base = {
      spruce: [209, 166, 104],
      rosewood: [90, 43, 25],
      ebony: [36, 27, 22],
      mahogany: [120, 62, 37],
      maple: [216, 183, 132],
      walnut: [103, 62, 38],
    }[kind];
    const columns = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      const t = (kind === 'rosewood' ? Math.abs(x - width / 2) : x) / width;
      columns[x] = t * (kind === 'spruce' ? 920 : 210) + Math.sin(t * 46) * 2.8 + Math.sin(t * 115) * 0.7;
    }
    let seed = 1257;
    for (let y = 0; y < height; y += 1) {
      const fy = y / height;
      const warp = Math.sin(fy * 8.3) * (kind === 'spruce' ? 0.11 : 2.7) + Math.sin(fy * 21) * 0.18;
      for (let x = 0; x < width; x += 1) {
        const f = columns[x] + warp;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = (seed >>> 24) / 255 - 0.5;
        const fine = Math.sin(f * 4.1 + Math.sin(f * 0.087) * 3);
        const band = Math.sin(f + Math.sin(f * 0.18) * 2);
        let delta: number;
        if (kind === 'spruce') {
          const grain = Math.pow(0.5 + 0.5 * Math.sin(f), 12);
          delta = -grain * 18 + band * 3 + fine * 2 + noise * 5;
          delta += Math.sin(fy * 220 + x * 0.06) * Math.sin(x * 0.23) * 1.5;
        } else if (kind === 'rosewood') {
          delta = band * 16 + Math.pow(0.5 + fine * 0.5, 7) * -18 + noise * 5;
        } else {
          delta = band * 7 + fine * 3 + noise * 5;
        }
        const index = (y * width + x) * 4;
        data[index] = clamp(base[0] + delta * 1.08, 0, 255);
        data[index + 1] = clamp(base[1] + delta * 0.8, 0, 255);
        data[index + 2] = clamp(base[2] + delta * 0.54, 0, 255);
        data[index + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
  });
}

const legacyWindow = window as typeof window & Record<string, unknown>;
let factoriesPromise: Promise<LegacyDrumFactories> | null = null;

function installModelGlobals(): () => void {
  legacyWindow.T = THREE;
  legacyWindow.V = V;
  legacyWindow.TAU = TAU;
  legacyWindow.canvasTexture = canvasTexture;
  legacyWindow.woodTexture = woodTexture;

  return () => {
    delete legacyWindow.T;
    delete legacyWindow.V;
    delete legacyWindow.TAU;
    delete legacyWindow.canvasTexture;
    delete legacyWindow.woodTexture;
  };
}

function loadFactories(): Promise<LegacyDrumFactories> {
  if (factoriesPromise) return factoriesPromise;

  factoriesPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/legacy-assets/drums.js';
    script.async = false;
    script.onload = () => {
      const createModel = legacyWindow.createDrumModel;
      const createController = legacyWindow.createDrumController;
      script.remove();
      delete legacyWindow.createDrumModel;
      delete legacyWindow.createDrumController;

      if (typeof createModel !== 'function' || typeof createController !== 'function') {
        reject(new Error('Legacy drum factories were not exported by the donor asset'));
        return;
      }
      resolve({
        createModel: createModel as LegacyDrumFactories['createModel'],
        createController: createController as LegacyDrumFactories['createController'],
      });
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Failed to load the frozen legacy drum asset'));
    };
    document.head.appendChild(script);
  });

  return factoriesPromise;
}

/**
 * Builds the exact donor drum model/controller from nocturne-integrated-fix behind a
 * narrow compatibility boundary. The legacy script is frozen source; V2 runtime code
 * never depends on its globals, DOM, renderer or frame loop.
 */
export async function buildLegacyDrumAsset(): Promise<{
  model: LegacyDrumModel;
  controller: LegacyDrumController;
}> {
  const factories = await loadFactories();
  const cleanup = installModelGlobals();
  try {
    const model = factories.createModel();
    const controller = factories.createController(model, {});
    return { model, controller };
  } finally {
    cleanup();
  }
}
