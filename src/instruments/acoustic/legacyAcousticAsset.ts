import * as THREE from 'three';

export type AcousticStrumDirection = 'down' | 'up';

export interface LegacyAcousticHitEvent {
  note: number;
  velocity: number;
  string: number;
  fret: number;
}

export interface LegacyAcousticStringRecord {
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
  amount: number;
  target: number;
  held: boolean;
  released: boolean;
  age: number;
  basePosition: Float32Array;
  tValues: Float32Array;
}

export interface LegacyAcousticModel {
  root: THREE.Group;
  strings: Map<number, LegacyAcousticStringRecord>;
  pick: THREE.Group;
  frets: number[];
  nutY: number;
  scale: number;
  bridgeY: number;
}

export interface LegacyAcousticApi {
  noteOn(note: number, velocity?: number, stringNumber?: number | null): LegacyAcousticHitEvent | false;
  noteOff(note: number): boolean;
  pluck(stringNumber: number, velocity?: number, fret?: number): LegacyAcousticHitEvent | false;
  strum(
    frets?: Array<number | null>,
    velocity?: number,
    direction?: AcousticStrumDirection,
  ): boolean;
  allNotesOff(): boolean;
  panic(): boolean;
  setPitchBend(value: number): boolean;
  controlChange(cc: number, value: number): boolean;
  readonly activeNotes: number[];
  getFingering(): Array<{ string: number; fret: number; note: number }>;
  strings: Map<number, LegacyAcousticStringRecord>;
  root: THREE.Group;
  minNote: number;
  maxNote: number;
}

export interface LegacyAcousticController {
  api: LegacyAcousticApi;
  tick(dt: number): { moved: boolean; animating: boolean };
}

export interface LegacyAcousticControllerHooks {
  wake?: () => void;
  onHit?: (event: LegacyAcousticHitEvent) => void;
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

const TUNING = [40, 45, 50, 55, 59, 64] as const;
const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type WoodKind = 'spruce' | 'rosewood' | 'ebony' | 'mahogany';

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
    }[kind];
    const columns = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      const t = (kind === 'rosewood' ? Math.abs(x - width / 2) : x) / width;
      columns[x] = t * (kind === 'spruce' ? 920 : 210)
        + Math.sin(t * 46) * 2.8
        + Math.sin(t * 115) * 0.7;
    }

    let seed = 1257;
    for (let y = 0; y < height; y += 1) {
      const fy = y / height;
      const warp = Math.sin(fy * 8.3) * (kind === 'spruce' ? 0.11 : 2.7)
        + Math.sin(fy * 21) * 0.18;
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

function tortoiseTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#251008';
    ctx.fillRect(0, 0, width, height);
    let seed = 123;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    for (let index = 0; index < 155; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 7 + random() * 41;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(random() * TAU);
      ctx.scale(1, 0.3 + random());
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, index % 3 ? '#bc652885' : '#e2a04475');
      gradient.addColorStop(0.6, '#89401950');
      gradient.addColorStop(1, '#35150900');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  });
}

let donorFactoryPromise: Promise<() => THREE.Group> | null = null;

async function loadDonorFactory(): Promise<() => THREE.Group> {
  if (donorFactoryPromise) return donorFactoryPromise;
  donorFactoryPromise = (async () => {
    const response = await fetch('/legacy-assets/acoustic-guitar.js');
    if (!response.ok) throw new Error(`Failed to load frozen acoustic guitar donor: ${response.status}`);
    const source = await response.text();
    const compile = new Function(
      'T',
      'V',
      'TAU',
      'canvasTexture',
      'woodTexture',
      'tortoiseTexture',
      'clamp',
      `${source}\nreturn createGuitar;`,
    ) as (
      T: typeof THREE,
      vectorFactory: typeof V,
      tau: number,
      canvasTextureFactory: typeof canvasTexture,
      woodTextureFactory: typeof woodTexture,
      tortoiseTextureFactory: typeof tortoiseTexture,
      clampFactory: typeof clamp,
    ) => () => THREE.Group;
    return compile(THREE, V, TAU, canvasTexture, woodTexture, tortoiseTexture, clamp);
  })();
  return donorFactoryPromise;
}

export async function buildLegacyAcousticAsset(
  hooks: LegacyAcousticControllerHooks = {},
): Promise<{ model: LegacyAcousticModel; controller: LegacyAcousticController }> {
  const createGuitar = await loadDonorFactory();
  const root = createGuitar();
  const donorStrings = (root.userData.playableStrings ?? []) as DonorStringRecord[];
  const fretGeometry = root.userData.fretGeometry as DonorFretGeometry | undefined;
  if (donorStrings.length !== 6 || !fretGeometry?.frets?.length) {
    throw new Error('Frozen acoustic guitar donor did not expose playable strings and fret geometry');
  }

  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xe6c9a1,
    emissive: 0x5b3218,
    emissiveIntensity: 0.28,
    roughness: 0.54,
  });
  const strings = new Map<number, LegacyAcousticStringRecord>();
  for (const donor of donorStrings) {
    const position = donor.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setUsage(THREE.DynamicDrawUsage);
    const basePosition = new Float32Array(position.array.length);
    for (let index = 0; index < position.array.length; index += 1) {
      basePosition[index] = Number(position.array[index]);
    }
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

    const number = 6 - donor.index;
    donor.mesh.userData.dynamic = true;
    donor.mesh.userData.string = number;
    donor.mesh.frustumCulled = false;

    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), markerMaterial.clone());
    marker.name = `Animated fretting fingertip ${number}`;
    marker.scale.set(0.066, 0.092, 0.034);
    marker.visible = false;
    marker.castShadow = true;
    marker.userData.dynamic = true;
    root.add(marker);

    strings.set(number, {
      ...donor,
      number,
      openNote: TUNING[donor.index],
      marker,
      energy: 0,
      note: null,
      fret: 0,
      amount: 0,
      target: 0,
      held: false,
      released: true,
      age: 0,
      basePosition,
      tValues,
    });
  }

  const pick = createPick(root);
  const model: LegacyAcousticModel = {
    root,
    strings,
    pick,
    frets: [...fretGeometry.frets],
    nutY: fretGeometry.nutY,
    scale: fretGeometry.scaleLength,
    bridgeY: donorStrings[0].a.y,
  };
  const controller = createController(model, hooks);
  return { model, controller };
}

function createPick(root: THREE.Group): THREE.Group {
  const pick = new THREE.Group();
  pick.name = 'Animated acoustic plectrum';
  pick.userData.dynamic = true;
  const shape = new THREE.Shape();
  shape.moveTo(-0.085, 0.072);
  shape.quadraticCurveTo(0, 0.14, 0.085, 0.072);
  shape.quadraticCurveTo(0.09, 0.018, 0, -0.11);
  shape.quadraticCurveTo(-0.09, 0.018, -0.085, 0.072);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
    curveSegments: 18,
  });
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe7d6b6,
    roughness: 0.36,
    clearcoat: 0.42,
    clearcoatRoughness: 0.28,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  pick.add(mesh);
  pick.position.set(0.08, -0.9, 0.755);
  pick.visible = false;
  root.add(pick);
  return pick;
}

function createController(
  model: LegacyAcousticModel,
  hooks: LegacyAcousticControllerHooks,
): LegacyAcousticController {
  const voices = [...model.strings.values()];
  let clock = 0;
  let pending: Array<{
    time: number;
    string: number;
    fret: number;
    velocity: number;
    direction: AcousticStrumDirection;
  }> = [];
  let sustain = false;
  let dirty = true;
  let bend = 0;
  let wantBend = 0;
  let pickAge = 10;
  let pickString = 6;
  let pickDirection: AcousticStrumDirection = 'down';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const midiByte = (value: number) => Number.isInteger(value) && value >= 0 && value <= 127;
  const validFret = (value: number) => Number.isInteger(value) && value >= 0 && value <= 20;
  const wake = (): void => {
    dirty = true;
    hooks.wake?.();
  };

  const strike = (
    string: LegacyAcousticStringRecord,
    velocity: number,
    fret: number,
    direction: AcousticStrumDirection,
  ): LegacyAcousticHitEvent => {
    const note = string.openNote + fret;
    string.note = note;
    string.fret = fret;
    string.held = true;
    string.released = false;
    string.target = fret > 0 ? 1 : 0;
    string.energy = Math.min(1.14, string.energy * 0.18 + Math.pow(velocity / 127, 0.72));
    string.phase = 0;
    string.age = clock;
    string.active = true;
    string.amp = 0.036 * Math.pow(velocity / 127, 0.78) * (1.08 - string.index * 0.04);
    pickAge = 0;
    pickString = string.number;
    pickDirection = direction;
    const event = { note, velocity, string: string.number, fret };
    hooks.onHit?.(event);
    wake();
    return event;
  };

  const noteOn = (
    note: number,
    velocity = 100,
    stringNumber: number | null = null,
  ): LegacyAcousticHitEvent | false => {
    if (!midiByte(note) || !midiByte(velocity) || note < 40 || note > 84) return false;
    if (stringNumber !== null && !model.strings.has(stringNumber)) return false;
    if (!velocity) return noteOff(note) ? { note, velocity, string: stringNumber ?? 6, fret: 0 } : false;
    const eligible = voices.filter((string) => {
      const fret = note - string.openNote;
      return validFret(fret) && (stringNumber === null || string.number === stringNumber);
    });
    if (!eligible.length) return false;
    let chosen = eligible.find((string) => string.held && string.note === note);
    if (!chosen) {
      chosen = [...eligible].sort((a, b) => {
        const aFret = note - a.openNote;
        const bFret = note - b.openNote;
        const score = (string: LegacyAcousticStringRecord, fret: number) =>
          (string.held ? 80 : 0) + fret * 0.45 + string.energy * 0.4;
        return score(a, aFret) - score(b, bFret);
      })[0];
    }
    if (!chosen) return false;
    return strike(chosen, velocity, note - chosen.openNote, 'down');
  };

  const noteOff = (note: number): boolean => {
    if (!midiByte(note) || note < 40 || note > 84) return false;
    for (const string of voices) {
      if (string.note !== note || !string.held) continue;
      string.held = false;
      string.released = !sustain;
      if (!sustain) string.target = 0;
    }
    wake();
    return true;
  };

  const pluck = (stringNumber: number, velocity = 100, fret = 0): LegacyAcousticHitEvent | false => {
    const string = model.strings.get(stringNumber);
    if (!string || !validFret(fret) || !midiByte(velocity)) return false;
    if (!velocity) return noteOff(string.openNote + fret) ? {
      note: string.openNote + fret,
      velocity,
      string: stringNumber,
      fret,
    } : false;
    return strike(string, velocity, fret, 'down');
  };

  const strum = (
    frets: Array<number | null> = [0, 2, 2, 0, 0, 0],
    velocity = 100,
    direction: AcousticStrumDirection = 'down',
  ): boolean => {
    if (
      !Array.isArray(frets)
      || frets.length !== 6
      || !frets.every((fret) => fret === null || validFret(fret))
      || !midiByte(velocity)
      || (direction !== 'down' && direction !== 'up')
    ) return false;
    if (!velocity) return allNotesOff();

    pending = [];
    for (const string of voices) {
      string.held = false;
      string.released = true;
      string.target = 0;
    }
    const order = direction === 'down' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
    let sequence = 0;
    for (const index of order) {
      const fret = frets[index];
      if (fret === null) continue;
      pending.push({
        time: clock + sequence * 0.026,
        string: 6 - index,
        fret,
        velocity: Math.max(1, velocity - Math.min(index * 2, 10)),
        direction,
      });
      sequence += 1;
    }
    wake();
    return true;
  };

  const allNotesOff = (): boolean => {
    pending = [];
    for (const string of voices) {
      string.held = false;
      string.released = true;
      string.target = 0;
    }
    wake();
    return true;
  };

  const panic = (): boolean => {
    pending = [];
    sustain = false;
    bend = 0;
    wantBend = 0;
    pickAge = 10;
    model.pick.visible = false;
    for (const string of voices) {
      string.note = null;
      string.held = false;
      string.released = true;
      string.energy = 0;
      string.amount = 0;
      string.target = 0;
      string.phase = 0;
      string.amp = 0;
      string.active = false;
      restoreString(string);
      string.marker.visible = false;
    }
    hooks.onPanic?.();
    wake();
    return true;
  };

  const setPitchBend = (value: number): boolean => {
    if (!Number.isFinite(value) || value < -1 || value > 1) return false;
    wantBend = value;
    wake();
    return true;
  };

  const controlChange = (cc: number, value: number): boolean => {
    if (!midiByte(cc) || !midiByte(value)) return false;
    if (cc === 64) {
      sustain = value >= 64;
      if (!sustain) {
        for (const string of voices) {
          if (!string.held) {
            string.released = true;
            string.target = 0;
          }
        }
      }
      wake();
      return true;
    }
    if (cc === 120) return panic();
    if (cc === 123) return allNotesOff();
    if (cc === 121) {
      sustain = false;
      setPitchBend(0);
      for (const string of voices) {
        if (!string.held) {
          string.released = true;
          string.target = 0;
        }
      }
      return true;
    }
    return false;
  };

  const tick = (dt: number): { moved: boolean; animating: boolean } => {
    if (!Number.isFinite(dt) || dt <= 0) return { moved: false, animating: false };
    dt = Math.min(dt, 0.05);
    clock += dt;
    while (pending.length && pending[0].time <= clock) {
      const event = pending.shift();
      if (!event) break;
      const string = model.strings.get(event.string);
      if (string) strike(string, event.velocity, event.fret, event.direction);
    }

    let moved = dirty;
    let animating = pending.length > 0;
    const oldBend = bend;
    bend += (wantBend - bend) * (1 - Math.exp(-dt * 19));
    if (Math.abs(bend - wantBend) < 0.0002) bend = wantBend;
    if (oldBend !== bend) {
      moved = true;
      animating ||= bend !== wantBend;
    }

    for (const string of voices) {
      const changed = dirty || string.energy > 0 || string.amount !== string.target || oldBend !== bend;
      string.phase += dt * TAU * string.visualHz;
      string.energy *= Math.exp(-dt * (string.released ? 8.8 : 2.75));
      if (string.energy < 0.0012) string.energy = 0;
      string.amp *= Math.exp(-dt * (string.released ? 8.2 : string.decay));
      if (string.amp < 0.00035) string.amp = 0;
      string.amount += (string.target - string.amount) * (1 - Math.exp(-dt * 28));
      if (Math.abs(string.amount - string.target) < 0.0002) string.amount = string.target;
      string.active = string.energy > 0 || string.amp > 0;
      if (changed) {
        drawString(model, string, bend, reducedMotion);
        moved = true;
      }
      animating ||= string.active || string.amount !== string.target;
    }

    if (pickAge < 0.24) {
      pickAge += dt;
      drawPick(model, pickString, pickAge, pickDirection);
      moved = true;
      animating = true;
    } else if (model.pick.visible) {
      model.pick.visible = false;
      moved = true;
    }

    dirty = false;
    return { moved, animating };
  };

  const api: LegacyAcousticApi = {
    noteOn,
    noteOff,
    pluck,
    strum,
    allNotesOff,
    panic,
    setPitchBend,
    controlChange,
    get activeNotes() {
      return [...new Set(voices.filter((string) => string.held).map((string) => string.note!))];
    },
    getFingering() {
      return voices
        .filter((string) => string.held && string.note !== null)
        .map((string) => ({ string: string.number, fret: string.fret, note: string.note! }));
    },
    strings: model.strings,
    root: model.root,
    minNote: 40,
    maxNote: 84,
  };

  tick(0.016);
  return { api, tick };
}

function drawString(
  model: LegacyAcousticModel,
  string: LegacyAcousticStringRecord,
  bend: number,
  reducedMotion: boolean,
): void {
  const position = string.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const fretY = string.fret > 0 ? model.frets[string.fret] : model.nutY;
  const at = string.fret > 0
    ? clamp((fretY - string.a.y) / (string.b.y - string.a.y), 0.05, 0.98)
    : 1;
  const amplitude = string.energy * 0.033 * (reducedMotion ? 0.45 : 1);

  for (let index = 0; index < position.count; index += 1) {
    const baseIndex = index * 3;
    const t = string.tValues[index];
    const local = Math.min(1, t / at);
    const vibrating = t <= at;
    const envelope = vibrating ? Math.sin(local * Math.PI) : 0;
    const wave = envelope * amplitude * (
      Math.sin(string.phase + local * (15.6 + string.index * 0.8))
      + 0.22 * Math.sin(string.phase * 1.9 + local * 37)
    );
    const pressDistance = string.fret > 0 ? (t - at) / 0.055 : 10;
    const press = string.fret > 0
      ? -0.027 * string.amount * Math.exp(-(pressDistance * pressDistance))
      : 0;
    const bendEnvelope = t < at ? t / at : (1 - t) / Math.max(0.001, 1 - at);
    const bendX = string.fret > 0 ? bend * 0.026 * string.amount * Math.max(0, bendEnvelope) : 0;

    position.setXYZ(
      index,
      string.basePosition[baseIndex] + wave + bendX,
      string.basePosition[baseIndex + 1],
      string.basePosition[baseIndex + 2] + press + wave * 0.22 * Math.sin(string.phase * 0.73),
    );
  }
  position.needsUpdate = true;

  const material = string.mesh.material;
  if (material instanceof THREE.MeshStandardMaterial) {
    material.emissive.setHex(0xd0a566);
    material.emissiveIntensity = string.energy * 0.11;
  }

  string.marker.visible = string.fret > 0 && string.amount > 0.04 && (string.energy > 0.008 || string.held);
  if (string.marker.visible) {
    const previousFretY = model.frets[Math.max(0, string.fret - 1)];
    const y = fretY + (previousFretY - fretY) * 0.27;
    const t = clamp((y - string.a.y) / (string.b.y - string.a.y), 0, 1);
    const x = THREE.MathUtils.lerp(string.a.x, string.b.x, t) + bend * 0.026 * string.amount;
    const z = THREE.MathUtils.lerp(string.a.z, string.b.z, t) + 0.078;
    string.marker.position.set(x, y, z);
    const pulse = 1 + Math.sin(Math.min(1, string.energy * 1.8) * Math.PI) * 0.06;
    string.marker.scale.set(0.066 * pulse, 0.092 * pulse, 0.034 * pulse);
  }
}

function restoreString(string: LegacyAcousticStringRecord): void {
  const position = string.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const baseIndex = index * 3;
    position.setXYZ(
      index,
      string.basePosition[baseIndex],
      string.basePosition[baseIndex + 1],
      string.basePosition[baseIndex + 2],
    );
  }
  position.needsUpdate = true;
}

function drawPick(
  model: LegacyAcousticModel,
  stringNumber: number,
  age: number,
  direction: AcousticStrumDirection,
): void {
  const string = model.strings.get(stringNumber);
  if (!string) return;
  const duration = 0.22;
  const progress = clamp(age / duration, 0, 1);
  const pickY = -0.86;
  const t = clamp((pickY - string.a.y) / (string.b.y - string.a.y), 0, 1);
  const x = THREE.MathUtils.lerp(string.a.x, string.b.x, t);
  const directionSign = direction === 'down' ? 1 : -1;
  model.pick.visible = progress < 1;
  model.pick.position.set(
    x + Math.sin(progress * Math.PI) * 0.072 * directionSign,
    pickY,
    0.755 + Math.sin(progress * Math.PI) * 0.018,
  );
  model.pick.rotation.z = directionSign * (-0.19 + Math.sin(progress * Math.PI) * 0.38);
}
