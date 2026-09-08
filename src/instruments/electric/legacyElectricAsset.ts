import * as THREE from 'three';

export type ElectricControlId = 'volume' | 'tone' | 'pickup';
export type ElectricStrumDirection = 'down' | 'up';

export interface LegacyElectricHitEvent {
  note: number;
  velocity: number;
  string: number;
  fret: number;
}

export interface LegacyElectricStringRecord {
  number: number;
  openNote: number;
  mesh: THREE.Mesh;
  marker: THREE.Mesh;
  nut: THREE.Vector3;
  saddle: THREE.Vector3;
  radius: number;
  rows: number;
  sides: number;
  energy: number;
  phase: number;
  note: number | null;
  fret: number;
  amount: number;
  target: number;
  held: boolean;
  released: boolean;
  age: number;
}

export interface LegacyElectricControl {
  group: THREE.Group;
  value: number;
}

export interface LegacyElectricControls {
  volume: LegacyElectricControl;
  tone: LegacyElectricControl;
  pickup: LegacyElectricControl;
  tremolo: THREE.Group;
}

export interface LegacyElectricModel {
  root: THREE.Group;
  strings: Map<number, LegacyElectricStringRecord>;
  controls: LegacyElectricControls;
  pick: THREE.Group;
  frets: number[];
  nutY: number;
  scale: number;
  bridgeY: number;
  boardZ(x: number, y: number): number;
  boardHalf(y: number): number;
}

export interface LegacyElectricApi {
  noteOn(note: number, velocity?: number, stringNumber?: number | null): LegacyElectricHitEvent | false;
  noteOff(note: number): boolean;
  pluck(stringNumber: number, velocity?: number, fret?: number): LegacyElectricHitEvent | false;
  strum(
    frets?: Array<number | null>,
    velocity?: number,
    direction?: ElectricStrumDirection,
  ): boolean;
  allNotesOff(): boolean;
  panic(): boolean;
  setPitchBend(value: number): boolean;
  setControl(id: ElectricControlId, value: number): boolean;
  controlChange(cc: number, value: number): boolean;
  handleMIDIMessage(eventOrData: MIDIMessageEvent | ArrayLike<number>): boolean | LegacyElectricHitEvent;
  setMIDIChannel(value: number): boolean;
  readonly midiChannel: number;
  readonly activeNotes: number[];
  getFingering(): Array<{ string: number; fret: number; note: number }>;
  strings: Map<number, LegacyElectricStringRecord>;
  root: THREE.Group;
  controls: LegacyElectricControls;
  minNote: number;
  maxNote: number;
}

export interface LegacyElectricController {
  api: LegacyElectricApi;
  tick(dt: number): { moved: boolean; animating: boolean };
}

export interface LegacyElectricControllerHooks {
  wake?: () => void;
  onHit?: (event: LegacyElectricHitEvent) => void;
  onPanic?: () => void;
}

interface LegacyElectricFactories {
  createModel: () => LegacyElectricModel;
  createController: (
    model: LegacyElectricModel,
    hooks?: LegacyElectricControllerHooks,
  ) => LegacyElectricController;
}

const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type WoodKind = 'maple' | 'rosewood';

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
    const base = kind === 'rosewood' ? [90, 43, 25] : [216, 183, 132];
    const columns = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      const t = (kind === 'rosewood' ? Math.abs(x - width / 2) : x) / width;
      columns[x] = t * 210 + Math.sin(t * 46) * 2.8 + Math.sin(t * 115) * 0.7;
    }

    let seed = 1257;
    for (let y = 0; y < height; y += 1) {
      const fy = y / height;
      const warp = Math.sin(fy * 8.3) * 2.7 + Math.sin(fy * 21) * 0.18;
      for (let x = 0; x < width; x += 1) {
        const f = columns[x] + warp;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = (seed >>> 24) / 255 - 0.5;
        const fine = Math.sin(f * 4.1 + Math.sin(f * 0.087) * 3);
        const band = Math.sin(f + Math.sin(f * 0.18) * 2);
        const delta = kind === 'rosewood'
          ? band * 16 + Math.pow(0.5 + fine * 0.5, 7) * -18 + noise * 5
          : band * 7 + fine * 3 + noise * 5;
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

let factoriesPromise: Promise<LegacyElectricFactories> | null = null;

async function loadFactories(): Promise<LegacyElectricFactories> {
  if (factoriesPromise) return factoriesPromise;

  factoriesPromise = (async () => {
    const urls = [1, 2, 3, 4].map((index) => `/legacy-assets/electric-0${index}.js`);
    const responses = await Promise.all(urls.map((url) => fetch(url)));
    const failed = responses.find((response) => !response.ok);
    if (failed) throw new Error(`Failed to load frozen electric guitar donor: ${failed.status}`);
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
      `${source}\nreturn { createModel: createElectricModel, createController: createElectricController };`,
    ) as (
      T: typeof THREE,
      vectorFactory: typeof V,
      tau: number,
      canvasTextureFactory: typeof canvasTexture,
      woodTextureFactory: typeof woodTexture,
      clampFactory: typeof clamp,
      reducedMotionValue: boolean,
    ) => LegacyElectricFactories;

    const factories = compile(THREE, V, TAU, canvasTexture, woodTexture, clamp, reducedMotion);
    if (typeof factories.createModel !== 'function' || typeof factories.createController !== 'function') {
      throw new Error('Frozen electric guitar donor did not expose the expected factories');
    }
    return factories;
  })();

  return factoriesPromise;
}

export async function buildLegacyElectricAsset(
  hooks: LegacyElectricControllerHooks = {},
): Promise<{ model: LegacyElectricModel; controller: LegacyElectricController }> {
  const factories = await loadFactories();
  const model = factories.createModel();
  const controller = factories.createController(model, hooks);
  return { model, controller };
}
