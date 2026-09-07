import * as THREE from 'three';

export type ViolinArticulation = 'arco' | 'pizzicato';

export interface LegacyViolinHitEvent {
  note: number;
  velocity: number;
  string: number;
  stringName: string;
  semitones: number;
}

export interface LegacyViolinStringRecord {
  number: number;
  name: string;
  openNote: number;
  nut: THREE.Vector3;
  saddle: THREE.Vector3;
  radius: number;
  rows: number;
  sides: number;
  mesh: THREE.Mesh;
  marker: THREE.Mesh;
  note: number | null;
  held: boolean;
  interval: number;
  currentInterval: number;
  amount: number;
  energy: number;
  velocity: number;
  phase: number;
  age: number;
  attackId: number;
}

export interface LegacyViolinModel {
  root: THREE.Group;
  strings: Map<number, LegacyViolinStringRecord>;
  bow: THREE.Group;
  nutY: number;
  bridgeY: number;
  scale: number;
  boardEnd: number;
  boardHalf(y: number): number;
  boardZ(x: number, y: number): number;
  frontPlate: THREE.Mesh;
  backPlate: THREE.Mesh;
  fholes: unknown[];
  rim: THREE.Vector2[];
}

export interface LegacyViolinApi {
  noteOn(note: number, velocity?: number, stringNumber?: number | null): LegacyViolinHitEvent | false;
  noteOff(note: number): boolean;
  playString(stringNumber: number, velocity?: number, semitones?: number): LegacyViolinHitEvent | false;
  allNotesOff(): boolean;
  panic(): boolean;
  setArticulation(value: ViolinArticulation): boolean;
  setPitchBend(value: number): boolean;
  setVibrato(value: number): boolean;
  setBow(options: { speed?: number; pressure?: number }): boolean;
  controlChange(cc: number, value: number): boolean;
  handleMIDIMessage(eventOrData: MIDIMessageEvent | ArrayLike<number>): boolean | LegacyViolinHitEvent;
  setMIDIChannel(value: number): boolean;
  readonly midiChannel: number;
  readonly articulation: ViolinArticulation;
  readonly activeNotes: number[];
  getFingering(): Array<{ string: number; note: number; semitones: number; positionY: number }>;
  strings: Map<number, LegacyViolinStringRecord>;
  bow: THREE.Group;
  root: THREE.Group;
  minNote: number;
  maxNote: number;
}

export interface LegacyViolinController {
  api: LegacyViolinApi;
  tick(dt: number): { moved: boolean; animating: boolean };
  stringPoint(string: LegacyViolinStringRecord, y: number, vibration?: boolean): THREE.Vector3;
}

export interface LegacyViolinControllerHooks {
  wake?: () => void;
  onHit?: (event: LegacyViolinHitEvent) => void;
  onMode?: (mode: ViolinArticulation) => void;
  onPanic?: () => void;
}

interface LegacyViolinFactories {
  createModel: () => LegacyViolinModel;
  createController: (
    model: LegacyViolinModel,
    hooks?: LegacyViolinControllerHooks,
  ) => LegacyViolinController;
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

let factoriesPromise: Promise<LegacyViolinFactories> | null = null;

async function loadFactories(): Promise<LegacyViolinFactories> {
  if (factoriesPromise) return factoriesPromise;

  factoriesPromise = (async () => {
    const urls = [1, 2, 3, 4].map((index) => `/legacy-assets/violin-0${index}.js`);
    const responses = await Promise.all(urls.map((url) => fetch(url)));
    const failed = responses.find((response) => !response.ok);
    if (failed) throw new Error(`Failed to load frozen violin donor: ${failed.status}`);
    const source = (await Promise.all(responses.map((response) => response.text()))).join('\n');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const compile = new Function(
      'T',
      'V',
      'TAU',
      'canvasTexture',
      'woodTexture',
      'clamp',
      'reducedMotion',
      `${source}\nreturn { createModel: createViolinModel, createController: createViolinController };`,
    ) as (
      T: typeof THREE,
      vectorFactory: typeof V,
      tau: number,
      canvasTextureFactory: typeof canvasTexture,
      woodTextureFactory: typeof woodTexture,
      clampFactory: typeof clamp,
      reducedMotionValue: boolean,
    ) => LegacyViolinFactories;

    const factories = compile(THREE, V, TAU, canvasTexture, woodTexture, clamp, reducedMotion);
    if (typeof factories.createModel !== 'function' || typeof factories.createController !== 'function') {
      throw new Error('Frozen violin donor did not expose the expected factories');
    }
    return factories;
  })();

  return factoriesPromise;
}

export async function buildLegacyViolinAsset(hooks: LegacyViolinControllerHooks = {}): Promise<{
  model: LegacyViolinModel;
  controller: LegacyViolinController;
}> {
  const factories = await loadFactories();
  const model = factories.createModel();
  const controller = factories.createController(model, hooks);
  return { model, controller };
}
