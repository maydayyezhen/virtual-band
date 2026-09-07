import * as THREE from 'three';

export type KeyboardTier = 'lower' | 'upper';

export interface LegacyKeyboardKeyRecord {
  note: number;
  tier: KeyboardTier;
  black: boolean;
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  sources: Map<string, number>;
  amount: number;
  target: number;
  velocity: number;
  angle: number;
}

export interface LegacyKeyboardWheelRecord {
  pivot: THREE.Group;
  amount: number;
  target: number;
}

export interface LegacyKeyboardLayer {
  id: KeyboardTier;
  minNote: number;
  maxNote: number;
  width: number;
  keyCenter: number;
  keys: Map<number, LegacyKeyboardKeyRecord>;
  group: THREE.Group;
  pitchWheel: LegacyKeyboardWheelRecord;
  modWheel: LegacyKeyboardWheelRecord;
}

export interface LegacyKeyboardPedalRecord {
  id: 'soft' | 'sostenuto' | 'sustain';
  pivot: THREE.Group;
  amount: number;
  target: number;
  sources: Map<string, boolean>;
  angle: number;
}

export interface LegacyKeyboardModel {
  root: THREE.Group;
  layers: Record<KeyboardTier, LegacyKeyboardLayer>;
  pedals: Record<'soft' | 'sostenuto' | 'sustain', LegacyKeyboardPedalRecord>;
  pickables: THREE.Object3D[];
  drawScreen(layer: LegacyKeyboardLayer, notes?: number[]): void;
}

interface LegacyKeyboardFactories {
  createModel: () => LegacyKeyboardModel;
}

const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const noteName = (note: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12] + (Math.floor(note / 12) - 1);
const isBlack = (note: number) => [1, 3, 6, 8, 10].includes(note % 12);

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

let factoriesPromise: Promise<LegacyKeyboardFactories> | null = null;

async function loadFactories(): Promise<LegacyKeyboardFactories> {
  if (factoriesPromise) return factoriesPromise;

  factoriesPromise = (async () => {
    const urls = [1, 2, 3, 4].map((index) => `/legacy-assets/keyboard-0${index}.js`);
    const responses = await Promise.all(urls.map((url) => fetch(url)));
    const failed = responses.find((response) => !response.ok);
    if (failed) throw new Error(`Failed to load frozen keyboard donor: ${failed.status}`);
    const source = (await Promise.all(responses.map((response) => response.text()))).join('\n');

    const compile = new Function(
      'T',
      'V',
      'TAU',
      'canvasTexture',
      'woodTexture',
      'noteName',
      'isBlack',
      `${source}\nreturn { createModel: createStageModel };`,
    ) as (
      T: typeof THREE,
      vectorFactory: typeof V,
      tau: number,
      canvasTextureFactory: typeof canvasTexture,
      woodTextureFactory: typeof woodTexture,
      noteNameFactory: typeof noteName,
      isBlackFactory: typeof isBlack,
    ) => LegacyKeyboardFactories;

    const factories = compile(THREE, V, TAU, canvasTexture, woodTexture, noteName, isBlack);
    if (typeof factories.createModel !== 'function') {
      throw new Error('Frozen keyboard donor did not expose createStageModel');
    }
    return factories;
  })();

  return factoriesPromise;
}

export async function buildLegacyKeyboardAsset(): Promise<LegacyKeyboardModel> {
  const factories = await loadFactories();
  const model = factories.createModel();

  for (const object of model.pickables) {
    const key = object.userData.key as LegacyKeyboardKeyRecord | undefined;
    const pedal = object.userData.pedal as LegacyKeyboardPedalRecord | undefined;
    if (key) object.userData.hit = `key:${key.tier}:${key.note}`;
    else if (pedal) object.userData.hit = `pedal:${pedal.id}`;
  }

  return model;
}
