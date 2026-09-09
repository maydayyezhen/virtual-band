import * as THREE from 'three';

export interface LegacyBassHitEvent {
  note: number;
  velocity: number;
  string: number;
  fret: number;
}

export interface LegacyBassStringRecord {
  number: number;
  openNote: number;
  index: number;
  mesh: THREE.Mesh;
  marker: THREE.Mesh;
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
  phase: number;
  amp: number;
  active: boolean;
  visualHz: number;
  decay: number;
  energy: number;
  note: number | null;
  fret: number;
  held: boolean;
  released: boolean;
  basePosition: Float32Array;
  tValues: Float32Array;
}

export interface LegacyBassModel {
  root: THREE.Group;
  strings: Map<number, LegacyBassStringRecord>;
  frets: number[];
  nutY: number;
  scale: number;
  bridgeY: number;
}

export interface LegacyBassApi {
  noteOn(note: number, velocity?: number, stringNumber?: number | null): LegacyBassHitEvent | false;
  noteOff(note: number): boolean;
  pluck(stringNumber: number, velocity?: number, fret?: number): LegacyBassHitEvent | false;
  allNotesOff(): boolean;
  panic(): boolean;
  setPitchBend(value: number): boolean;
  controlChange(cc: number, value: number): boolean;
  readonly activeNotes: number[];
  getFingering(): Array<{ string: number; fret: number; note: number }>;
}

export interface LegacyBassController {
  api: LegacyBassApi;
  tick(dt: number): { moved: boolean; animating: boolean };
}

export interface LegacyBassControllerHooks {
  wake?: () => void;
  onHit?: (event: LegacyBassHitEvent) => void;
  onPanic?: () => void;
}

interface DonorStringRecord {
  mesh: THREE.Mesh;
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
  index: number;
  phase: number;
  amp: number;
  active: boolean;
  visualHz: number;
  decay: number;
}

interface DonorFretGeometry {
  nutY: number;
  scaleLength: number;
  frets: number[];
}

const TUNING = [28, 33, 38, 43] as const;
const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

function woodTexture(kind: 'maple' | 'ebony', size = 1024): THREE.CanvasTexture {
  return canvasTexture(size, size, (ctx, width, height) => {
    const pixels = ctx.createImageData(width, height);
    const data = pixels.data;
    const base = kind === 'ebony' ? [36, 27, 22] : [216, 183, 132];
    let seed = 1257;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const t = x / width;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = (seed >>> 24) / 255 - 0.5;
        const grain = Math.sin(t * 210 + Math.sin((y / height) * 13) * 2.7);
        const delta = grain * (kind === 'ebony' ? 7 : 10) + noise * 5;
        const index = (y * width + x) * 4;
        data[index] = clamp(base[0] + delta, 0, 255);
        data[index + 1] = clamp(base[1] + delta * 0.78, 0, 255);
        data[index + 2] = clamp(base[2] + delta * 0.55, 0, 255);
        data[index + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
  });
}

let donorFactoryPromise: Promise<() => THREE.Group> | null = null;

async function loadDonorFactory(): Promise<() => THREE.Group> {
  if (donorFactoryPromise) return donorFactoryPromise;
  donorFactoryPromise = (async () => {
    const response = await fetch('/legacy-assets/bass.js');
    if (!response.ok) throw new Error(`Failed to load frozen bass donor: ${response.status}`);
    const source = await response.text();
    const compile = new Function(
      'T', 'V', 'TAU', 'canvasTexture', 'woodTexture', 'clamp',
      `${source}\nreturn createBass;`,
    ) as (
      T: typeof THREE,
      vectorFactory: typeof V,
      tau: number,
      canvasTextureFactory: typeof canvasTexture,
      woodTextureFactory: typeof woodTexture,
      clampFactory: typeof clamp,
    ) => () => THREE.Group;
    return compile(THREE, V, TAU, canvasTexture, woodTexture, clamp);
  })();
  return donorFactoryPromise;
}

export async function buildLegacyBassAsset(
  hooks: LegacyBassControllerHooks = {},
): Promise<{ model: LegacyBassModel; controller: LegacyBassController }> {
  const createBass = await loadDonorFactory();
  const root = createBass();
  const donorStrings = (root.userData.playableStrings ?? []) as DonorStringRecord[];
  const fretGeometry = root.userData.fretGeometry as DonorFretGeometry | undefined;
  if (donorStrings.length !== 4 || !fretGeometry?.frets?.length) {
    throw new Error('Frozen bass donor did not expose four playable strings and fret geometry');
  }

  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xaadfd8,
    emissive: 0x145c61,
    emissiveIntensity: 0.34,
    roughness: 0.48,
  });
  const strings = new Map<number, LegacyBassStringRecord>();
  for (const donor of donorStrings) {
    const position = donor.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setUsage(THREE.DynamicDrawUsage);
    const basePosition = Float32Array.from(position.array as ArrayLike<number>);
    const tValues = new Float32Array(position.count);
    const axis = donor.b.clone().sub(donor.a);
    const denominator = axis.lengthSq() || 1;
    for (let index = 0; index < position.count; index += 1) {
      const offset = new THREE.Vector3(
        basePosition[index * 3] - donor.a.x,
        basePosition[index * 3 + 1] - donor.a.y,
        basePosition[index * 3 + 2] - donor.a.z,
      );
      tValues[index] = clamp(offset.dot(axis) / denominator, 0, 1);
    }

    const number = 4 - donor.index;
    donor.mesh.userData.dynamic = true;
    donor.mesh.userData.string = number;
    donor.mesh.frustumCulled = false;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), markerMaterial.clone());
    marker.name = `Bass fingering marker ${number}`;
    marker.visible = false;
    marker.userData.dynamic = true;
    marker.raycast = () => {};
    root.add(marker);

    strings.set(number, {
      ...donor,
      number,
      openNote: TUNING[donor.index],
      marker,
      energy: 0,
      note: null,
      fret: 0,
      held: false,
      released: true,
      basePosition,
      tValues,
    });
  }

  const model: LegacyBassModel = {
    root,
    strings,
    frets: [...fretGeometry.frets],
    nutY: fretGeometry.nutY,
    scale: fretGeometry.scaleLength,
    bridgeY: donorStrings[0].a.y,
  };
  return { model, controller: createController(model, hooks) };
}

function createController(model: LegacyBassModel, hooks: LegacyBassControllerHooks): LegacyBassController {
  const voices = [...model.strings.values()];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sustain = false;
  let dirty = true;

  const validByte = (value: number) => Number.isInteger(value) && value >= 0 && value <= 127;
  const validFret = (value: number) => Number.isInteger(value) && value >= 0 && value <= 21;
  const wake = (): void => { dirty = true; hooks.wake?.(); };

  const strike = (string: LegacyBassStringRecord, velocity: number, fret: number): LegacyBassHitEvent => {
    const note = string.openNote + fret;
    string.note = note;
    string.fret = fret;
    string.held = true;
    string.released = false;
    string.energy = Math.min(1.2, string.energy * 0.16 + Math.pow(velocity / 127, 0.7));
    string.phase = 0;
    string.amp = 0.045 * Math.pow(velocity / 127, 0.76) * (1.08 - string.index * 0.04);
    string.active = true;
    const event = { note, velocity, string: string.number, fret };
    hooks.onHit?.(event);
    wake();
    return event;
  };

  const noteOff = (note: number): boolean => {
    if (!validByte(note)) return false;
    let handled = false;
    for (const string of voices) {
      if (string.note !== note || !string.held) continue;
      string.held = false;
      string.released = !sustain;
      handled = true;
    }
    if (handled) wake();
    return handled;
  };

  const noteOn = (note: number, velocity = 100, stringNumber: number | null = null): LegacyBassHitEvent | false => {
    if (!validByte(note) || !validByte(velocity) || note < 28 || note > 64) return false;
    if (!velocity) return noteOff(note) ? { note, velocity, string: stringNumber ?? 4, fret: 0 } : false;
    const eligible = voices.filter((string) => {
      const fret = note - string.openNote;
      return validFret(fret) && (stringNumber === null || string.number === stringNumber);
    });
    const chosen = eligible.sort((a, b) => {
      const score = (string: LegacyBassStringRecord) =>
        (string.held ? 70 : 0) + (note - string.openNote) * 0.55 + string.energy;
      return score(a) - score(b);
    })[0];
    return chosen ? strike(chosen, velocity, note - chosen.openNote) : false;
  };

  const pluck = (stringNumber: number, velocity = 100, fret = 0): LegacyBassHitEvent | false => {
    const string = model.strings.get(stringNumber);
    if (!string || !validByte(velocity) || !validFret(fret)) return false;
    if (!velocity) return noteOff(string.openNote + fret) ? { note: string.openNote + fret, velocity, string: stringNumber, fret } : false;
    return strike(string, velocity, fret);
  };

  const allNotesOff = (): boolean => {
    for (const string of voices) { string.held = false; string.released = true; }
    wake();
    return true;
  };

  const panic = (): boolean => {
    sustain = false;
    for (const string of voices) {
      string.note = null;
      string.fret = 0;
      string.held = false;
      string.released = true;
      string.energy = 0;
      string.amp = 0;
      string.active = false;
      restoreString(string);
    }
    hooks.onPanic?.();
    wake();
    return true;
  };

  const controlChange = (cc: number, value: number): boolean => {
    if (!validByte(cc) || !validByte(value)) return false;
    if (cc === 64) {
      sustain = value >= 64;
      if (!sustain) for (const string of voices) if (!string.held) string.released = true;
      wake();
      return true;
    }
    if (cc === 120) return panic();
    if (cc === 123) return allNotesOff();
    if (cc === 121) { sustain = false; wake(); return true; }
    return false;
  };

  const tick = (dt: number): { moved: boolean; animating: boolean } => {
    if (!Number.isFinite(dt) || dt <= 0) return { moved: false, animating: false };
    dt = Math.min(dt, 0.05);
    let moved = dirty;
    let animating = false;
    for (const string of voices) {
      string.phase += dt * TAU * string.visualHz;
      string.energy *= Math.exp(-dt * (string.released ? 4.6 : 2.1));
      string.amp *= Math.exp(-dt * (string.released ? 4.2 : string.decay));
      if (string.energy < 0.001) string.energy = 0;
      if (string.amp < 0.0003) string.amp = 0;
      string.active = string.energy > 0 || string.amp > 0;
      if (dirty || string.active) {
        drawString(string, reducedMotion);
        moved = true;
      }
      animating ||= string.active;
    }
    dirty = false;
    return { moved, animating };
  };

  return {
    api: {
      noteOn,
      noteOff,
      pluck,
      allNotesOff,
      panic,
      setPitchBend: (value) => Number.isFinite(value) && value >= -1 && value <= 1,
      controlChange,
      get activeNotes() { return [...new Set(voices.filter((string) => string.held).map((string) => string.note!))]; },
      getFingering: () => voices.filter((string) => string.held && string.note !== null).map((string) => ({ string: string.number, fret: string.fret, note: string.note! })),
    },
    tick,
  };
}

function drawString(string: LegacyBassStringRecord, reducedMotion: boolean): void {
  const position = string.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const amplitude = string.energy * 0.046 * (reducedMotion ? 0.45 : 1);
  for (let index = 0; index < position.count; index += 1) {
    const baseIndex = index * 3;
    const t = string.tValues[index];
    const envelope = Math.sin(t * Math.PI);
    const wave = envelope * amplitude * (
      Math.sin(string.phase + t * (12.8 + string.index * 0.7))
      + 0.18 * Math.sin(string.phase * 1.73 + t * 29)
    );
    position.setXYZ(
      index,
      string.basePosition[baseIndex] + wave,
      string.basePosition[baseIndex + 1],
      string.basePosition[baseIndex + 2] + wave * 0.18,
    );
  }
  position.needsUpdate = true;
}

function restoreString(string: LegacyBassStringRecord): void {
  const position = string.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const baseIndex = index * 3;
    position.setXYZ(index, string.basePosition[baseIndex], string.basePosition[baseIndex + 1], string.basePosition[baseIndex + 2]);
  }
  position.needsUpdate = true;
}
