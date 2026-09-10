type MidiEvent = {
  s: number;
  e?: number;
  v?: number;
  i?: string;
  n?: number;
};

type DustSong = {
  title?: string;
  artist?: string;
  bpm?: number | string;
  duration: number;
  events: MidiEvent[];
};

type ScanPatch = {
  pan: number;
  tilt: number;
  speed: number;
  phase: number;
};

type FixturePatch = Record<string, unknown>;

type Fixture = {
  id: string;
  type: string;
  groups: Set<string>;
  state?: { scan?: ScanPatch | null };
  set: (patch: FixturePatch, duration?: number) => unknown;
};

export type LightingStage = {
  time: number;
  demo: boolean;
  paused: boolean;
  bpm?: number;
  lights: Map<string, Fixture>;
  setDemo: (enabled: boolean) => unknown;
  setPaused: (paused: boolean) => unknown;
  setStageMode: (mode: string) => unknown;
  setBPM?: (bpm: number) => unknown;
  setHaze?: (patch: Record<string, unknown>) => unknown;
  triggerBeat?: (strength?: number, options?: Record<string, unknown>) => unknown;
};

export type DustLightingStatus = {
  ready: boolean;
  playing: boolean;
  time: number;
  duration: number;
  bar: number;
  cue: string;
  energy: number;
  focus: string;
};

type BarInfo = {
  index: number;
  raw: number;
  energy: number;
  density: number;
  events: number;
  roles: Record<string, number>;
  drums: Record<'kick' | 'snare' | 'crash' | 'tom' | 'hat' | 'other', number>;
  focus: string;
};

type Analysis = {
  bpm: number;
  beat: number;
  bar: number;
  bars: BarInfo[];
  events: MidiEvent[];
  duration: number;
};

type Cue = {
  index: number;
  bar: number;
  time: number;
  endBar: number;
  style: string;
  energy: number;
  density: number;
  focus: string;
  crashes: number;
  transitionBeats: number;
};

const LOOK = {
  red: '#b8323c',
  deepRed: '#631821',
  white: '#f4f0e7',
  steel: '#788391',
  blue: '#465a78',
  warm: '#e3c9a4',
};

const ROLE_WEIGHT: Record<string, number> = {
  drums: 1.22,
  bass: 1.18,
  electric: 0.92,
  guitar: 0.72,
  lower: 0.58,
  upper: 0.62,
};

const REAR_FAN = [-30, -18, -7, 7, 18, 30];
const FLOOR_FAN = [30, 18, 7, -7, -18, -30];
const TAU = Math.PI * 2;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function bpmOf(song: DustSong): number {
  const match = String(song.bpm ?? '').match(/[\d.]+/);
  const value = match ? Number(match[0]) : 110;
  return Number.isFinite(value) && value > 20 ? value : 110;
}

function percentile(values: number[], q: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  return Math.max(0.0001, sorted[Math.round((sorted.length - 1) * q)] ?? 1);
}

function drumKind(note = 0): 'kick' | 'snare' | 'crash' | 'tom' | 'hat' | 'other' {
  if ([35, 36].includes(note)) return 'kick';
  if ([37, 38, 39, 40].includes(note)) return 'snare';
  if ([49, 52, 55, 57].includes(note)) return 'crash';
  if ([41, 43, 45, 47, 48, 50].includes(note)) return 'tom';
  if ([42, 44, 46].includes(note)) return 'hat';
  return 'other';
}

function analyze(song: DustSong): Analysis {
  const bpm = bpmOf(song);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const count = Math.max(1, Math.ceil((Number(song.duration) || 1) / bar));
  const bars: BarInfo[] = Array.from({ length: count }, (_, index) => ({
    index,
    raw: 0,
    energy: 0,
    density: 0,
    events: 0,
    roles: {},
    drums: { kick: 0, snare: 0, crash: 0, tom: 0, hat: 0, other: 0 },
    focus: 'bass',
  }));
  const events = [...(song.events ?? [])].sort((a, b) => (Number(a.s) || 0) - (Number(b.s) || 0));

  for (const event of events) {
    const time = Math.max(0, Number(event.s) || 0);
    const barIndex = clamp(Math.floor(time / bar), 0, count - 1);
    const info = bars[barIndex];
    if (!info) continue;
    const velocity = clamp((Number(event.v) || 90) / 127, 0.06, 1);
    const duration = Math.max(0.035, (Number(event.e) || time + 0.08) - time);
    const role = event.i || 'other';
    const weight = velocity * (ROLE_WEIGHT[role] ?? 0.52) * (role === 'drums' ? 1 : clamp(0.72 + duration * 0.16, 0.72, 1.16));
    info.raw += weight;
    info.events += 1;
    info.roles[role] = (info.roles[role] ?? 0) + weight;
    if (role === 'drums') info.drums[drumKind(Number(event.n) || 0)] += 1;
  }

  const energyScale = percentile(bars.map((item) => item.raw), 0.9);
  const densityScale = percentile(bars.map((item) => item.events), 0.9);
  for (let index = 0; index < bars.length; index += 1) {
    const previous = (bars[Math.max(0, index - 1)]?.raw ?? 0) / energyScale;
    const current = (bars[index]?.raw ?? 0) / energyScale;
    const next = (bars[Math.min(bars.length - 1, index + 1)]?.raw ?? 0) / energyScale;
    const info = bars[index];
    if (!info) continue;
    info.energy = clamp(previous * 0.16 + current * 0.68 + next * 0.16, 0, 1);
    info.density = clamp(info.events / densityScale, 0, 1);
    info.focus = Object.entries(info.roles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'bass';
  }

  return { bpm, beat, bar, bars, events, duration: Number(song.duration) || count * bar };
}

function phraseStats(analysis: Analysis, start: number, end: number) {
  const slice = analysis.bars.slice(start, Math.min(analysis.bars.length, end));
  if (!slice.length) return { energy: 0, density: 0, focus: 'bass', crashes: 0, roles: {} as Record<string, number> };
  const roles: Record<string, number> = {};
  let energy = 0;
  let density = 0;
  let crashes = 0;
  for (const info of slice) {
    energy += info.energy;
    density += info.density;
    crashes += info.drums.crash;
    for (const [role, value] of Object.entries(info.roles)) roles[role] = (roles[role] ?? 0) + value;
  }
  return {
    energy: energy / slice.length,
    density: density / slice.length,
    focus: Object.entries(roles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'bass',
    crashes,
    roles,
  };
}

function styleFor(stats: ReturnType<typeof phraseStats>, index: number, total: number, trend: number): string {
  if (index === 0) return 'opening-lock';
  if (index >= total - 2 && stats.energy < 0.48) return 'outro-shadow';
  if (stats.energy < 0.2) return 'void';
  if (stats.focus === 'bass' && stats.energy < 0.58) return 'bass-lock';
  if (stats.energy < 0.43) return index % 2 ? 'groove-left' : 'groove-right';
  if (stats.energy < 0.64) return trend > 0.08 ? 'build-fan' : index % 2 ? 'cross-groove' : 'stagger-groove';
  if (stats.energy < 0.82) return stats.crashes ? 'knife-hit' : 'knife-drive';
  return 'climax-grid';
}

function buildPlan(analysis: Analysis): Cue[] {
  const starts = new Set<number>([0]);
  for (let index = 4; index < analysis.bars.length; index += 4) starts.add(index);
  for (let index = 1; index < analysis.bars.length; index += 1) {
    const current = analysis.bars[index];
    const previous = analysis.bars[index - 1];
    if (!current || !previous) continue;
    const delta = Math.abs(current.energy - previous.energy);
    const focusChanged = current.focus !== previous.focus;
    if (delta > 0.24 || (delta > 0.16 && focusChanged) || current.drums.crash >= 2) starts.add(index);
  }

  const sorted = [...starts].sort((a, b) => a - b);
  return sorted.map((start, index) => {
    const end = sorted[index + 1] ?? Math.min(analysis.bars.length, start + 4);
    const stats = phraseStats(analysis, start, end);
    const before = start ? phraseStats(analysis, Math.max(0, start - 2), start).energy : stats.energy;
    const after = phraseStats(analysis, end, Math.min(analysis.bars.length, end + 2)).energy;
    const trend = after - before;
    const style = styleFor(stats, index, sorted.length, trend);
    return {
      index,
      bar: start,
      time: start * analysis.bar,
      endBar: end,
      style,
      energy: stats.energy,
      density: stats.density,
      focus: stats.focus,
      crashes: stats.crashes,
      transitionBeats: style === 'void' || style === 'outro-shadow' ? 1.8 : style === 'climax-grid' ? 0.65 : 1.1,
    };
  });
}

function cueAtBar(cues: Cue[], bar: number): number {
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((cues[middle]?.bar ?? 0) <= bar) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

function lowerBound(events: MidiEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((Number(events[middle]?.s) || 0) < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function fixtureSets(stage: LightingStage) {
  const all = [...stage.lights.values()];
  return {
    all,
    rear: all.filter((fixture) => fixture.type === 'beam' && fixture.groups.has('rear')),
    side: all.filter((fixture) => fixture.type === 'beam' && fixture.groups.has('side')),
    floor: all.filter((fixture) => fixture.type === 'beam' && fixture.groups.has('floor')),
    front: all.filter((fixture) => fixture.type === 'par' && fixture.groups.has('front') && !fixture.groups.has('front-floor')),
    frontFloor: all.filter((fixture) => fixture.type === 'par' && fixture.groups.has('front-floor')),
  };
}

function focusPoint(role: string): [number, number, number] {
  if (role === 'bass') return [-4.8, 1.8, 2.1];
  if (role === 'drums') return [0, 2.2, -3.4];
  if (role === 'electric') return [4.8, 1.8, 2.2];
  if (role === 'guitar') return [-2.4, 1.8, 2.8];
  if (role === 'lower' || role === 'upper') return [2.5, 2.0, -0.8];
  return [0, 2.0, 1.2];
}

function scanContinuous(stage: LightingStage, fixture: Fixture, pan: number, tilt: number, speed: number, seed: number): ScanPatch {
  const old = fixture.state?.scan;
  const absolute = old ? stage.time * TAU * old.speed + old.phase : seed;
  return { pan, tilt, speed, phase: absolute - stage.time * TAU * speed };
}

function mergeTarget(targets: Map<Fixture, FixturePatch>, fixture: Fixture, patch: FixturePatch): void {
  const current = targets.get(fixture) ?? {};
  Object.assign(current, patch);
  targets.set(fixture, current);
}

function dimPatch(color: string, intensity = 0.012): FixturePatch {
  return { enabled: true, beam: true, color, intensity, angle: 3.2, distance: 48, strobe: 0, beatSensitivity: 0.06, scan: null };
}

function buildCueTargets(stage: LightingStage, analysis: Analysis, cue: Cue): Map<Fixture, FixturePatch> {
  const targets = new Map<Fixture, FixturePatch>();
  const sets = fixtureSets(stage);
  const energy = cue.energy;
  const focus = focusPoint(cue.focus);
  const bass = focusPoint('bass');
  const drums = focusPoint('drums');
  const rearSpeed = analysis.bpm / 60 / 8;
  const faster = analysis.bpm / 60 / 4;
  const slow = analysis.bpm / 60 / 16;

  sets.rear.forEach((fixture, index) => mergeTarget(targets, fixture, { ...dimPatch(index % 2 ? LOOK.deepRed : LOOK.steel), pan: REAR_FAN[index] ?? 0, tilt: -26 }));
  sets.floor.forEach((fixture, index) => mergeTarget(targets, fixture, { ...dimPatch(index % 2 ? LOOK.blue : LOOK.deepRed), pan: FLOOR_FAN[index] ?? 0, tilt: 42 }));
  sets.side.forEach((fixture, index) => mergeTarget(targets, fixture, { ...dimPatch(index % 2 ? LOOK.white : LOOK.red, 0.01), target: focus, angle: 4.2 }));
  sets.front.forEach((fixture) => mergeTarget(targets, fixture, { enabled: true, beam: true, color: LOOK.warm, intensity: lerp(0.12, 0.42, energy), angle: 24, distance: 42, strobe: 0, beatSensitivity: 0.035, scan: null }));
  sets.frontFloor.forEach((fixture, index) => mergeTarget(targets, fixture, { enabled: true, beam: true, color: index % 2 ? LOOK.deepRed : LOOK.red, intensity: lerp(0.035, 0.18, energy), angle: 22, distance: 34, strobe: 0, beatSensitivity: 0.08, scan: null }));

  const rear = (count: number, intensity: number, colorA = LOOK.red, colorB = LOOK.white, scanPan = 10, scanTilt = 3, speed = rearSpeed) => {
    sets.rear.forEach((fixture, index) => {
      const active = index < count || index >= sets.rear.length - count;
      mergeTarget(targets, fixture, {
        enabled: true,
        beam: true,
        color: index % 2 ? colorB : colorA,
        intensity: active ? intensity : 0.012,
        angle: lerp(2.8, 1.9, energy),
        distance: 58,
        pan: REAR_FAN[index] ?? 0,
        tilt: lerp(-29, -21, energy),
        strobe: 0,
        beatSensitivity: lerp(0.14, 0.42, energy),
        scan: active ? scanContinuous(stage, fixture, scanPan, scanTilt, speed, index * 0.81) : null,
      });
    });
  };

  const floor = (count: number, intensity: number, colorA = LOOK.deepRed, colorB = LOOK.red, scanPan = 8, scanTilt = 5, speed = rearSpeed) => {
    sets.floor.forEach((fixture, index) => {
      const active = Math.abs(index - (sets.floor.length - 1) / 2) <= count;
      mergeTarget(targets, fixture, {
        enabled: true,
        beam: true,
        color: index % 2 ? colorB : colorA,
        intensity: active ? intensity : 0.01,
        angle: lerp(3.2, 2.0, energy),
        distance: 54,
        pan: FLOOR_FAN[index] ?? 0,
        tilt: lerp(48, 35, energy),
        strobe: 0,
        beatSensitivity: lerp(0.18, 0.52, energy),
        scan: active ? scanContinuous(stage, fixture, scanPan, scanTilt, speed, index * 0.93) : null,
      });
    });
  };

  switch (cue.style) {
    case 'opening-lock':
    case 'bass-lock':
      rear(2, lerp(0.24, 0.46, energy), LOOK.deepRed, LOOK.red, 5, 2, slow);
      floor(1, lerp(0.13, 0.28, energy), LOOK.deepRed, LOOK.steel, 4, 4, slow);
      sets.side.forEach((fixture, index) => mergeTarget(targets, fixture, { color: index % 2 ? LOOK.white : LOOK.red, intensity: index < 2 ? 0.34 : 0.12, angle: index < 2 ? 3.1 : 4.6, distance: 52, target: bass, scan: null, beatSensitivity: 0.1 }));
      break;
    case 'void':
    case 'outro-shadow':
      rear(1, 0.13, LOOK.deepRed, LOOK.steel, 3, 1, slow);
      floor(0, 0.05, LOOK.deepRed, LOOK.deepRed, 2, 2, slow);
      sets.front.forEach((fixture) => mergeTarget(targets, fixture, { color: LOOK.warm, intensity: 0.11, beatSensitivity: 0.02 }));
      sets.side.forEach((fixture, index) => mergeTarget(targets, fixture, { color: index ? '#6f7780' : LOOK.red, intensity: index === 0 ? 0.18 : 0.025, target: cue.focus === 'drums' ? drums : bass, angle: 3.2, scan: null }));
      break;
    case 'groove-left':
    case 'groove-right': {
      const mirror = cue.style === 'groove-left' ? -1 : 1;
      rear(2, lerp(0.34, 0.56, energy), LOOK.red, LOOK.steel, 12, 3, rearSpeed);
      floor(1, lerp(0.20, 0.38, energy), LOOK.deepRed, LOOK.red, 8, 7, rearSpeed);
      sets.rear.forEach((fixture, index) => mergeTarget(targets, fixture, { pan: (REAR_FAN[index] ?? 0) * mirror }));
      sets.side.forEach((fixture, index) => mergeTarget(targets, fixture, { color: index % 2 ? LOOK.white : LOOK.red, intensity: index % 2 ? 0.22 : 0.34, target: focus, angle: 3.4, beatSensitivity: 0.14 }));
      break;
    }
    case 'stagger-groove':
      rear(3, lerp(0.42, 0.68, energy), LOOK.red, LOOK.white, 17, 4, rearSpeed);
      floor(2, lerp(0.24, 0.46, energy), LOOK.deepRed, LOOK.steel, 11, 8, rearSpeed);
      sets.rear.forEach((fixture, index) => mergeTarget(targets, fixture, { scan: scanContinuous(stage, fixture, 14, 4, rearSpeed, index * 0.95 + (index % 2 ? 1.3 : 0)) }));
      break;
    case 'cross-groove':
      rear(3, lerp(0.44, 0.70, energy), LOOK.red, LOOK.steel, 20, 5, rearSpeed);
      floor(2, lerp(0.28, 0.48, energy), LOOK.deepRed, LOOK.red, 15, 9, rearSpeed);
      sets.side.forEach((fixture, index) => {
        const source = index % 2 ? drums : bass;
        const target: [number, number, number] = [source[0] + (index < 2 ? -1.2 : 1.2), source[1], source[2]];
        mergeTarget(targets, fixture, { color: index % 2 ? LOOK.white : LOOK.red, intensity: 0.46, angle: 2.8, target, beatSensitivity: 0.12 });
      });
      break;
    case 'build-fan':
      rear(3, lerp(0.52, 0.76, energy), LOOK.red, LOOK.white, 25, 7, rearSpeed);
      floor(2, lerp(0.30, 0.54, energy), LOOK.blue, LOOK.red, 18, 10, rearSpeed);
      sets.side.forEach((fixture, index) => mergeTarget(targets, fixture, { color: index % 2 ? LOOK.white : LOOK.red, intensity: 0.40, angle: 3, target: focus }));
      break;
    case 'knife-hit':
    case 'knife-drive':
      rear(3, lerp(0.64, 0.86, energy), LOOK.red, LOOK.white, 32, 7, faster);
      floor(3, lerp(0.42, 0.68, energy), LOOK.deepRed, LOOK.red, 24, 12, faster);
      sets.rear.forEach((fixture) => mergeTarget(targets, fixture, { angle: 1.7, distance: 68, beatSensitivity: 0.34 }));
      sets.floor.forEach((fixture) => mergeTarget(targets, fixture, { angle: 1.9, distance: 62, beatSensitivity: 0.44 }));
      sets.side.forEach((fixture, index) => mergeTarget(targets, fixture, { color: index % 2 ? LOOK.white : LOOK.red, intensity: 0.54, angle: 2.4, target: index % 2 ? drums : bass, beatSensitivity: 0.1 }));
      break;
    case 'climax-grid':
      rear(3, 0.92, LOOK.red, LOOK.white, 38, 10, faster);
      floor(3, 0.74, LOOK.deepRed, LOOK.white, 30, 14, faster);
      sets.side.forEach((fixture, index) => mergeTarget(targets, fixture, { color: index % 2 ? LOOK.white : LOOK.red, intensity: 0.72, angle: 2.3, target: index % 2 ? focus : drums, beatSensitivity: 0.18 }));
      sets.front.forEach((fixture) => mergeTarget(targets, fixture, { color: LOOK.white, intensity: 0.56, beatSensitivity: 0.08 }));
      sets.frontFloor.forEach((fixture, index) => mergeTarget(targets, fixture, { color: index % 3 === 0 ? LOOK.white : LOOK.red, intensity: 0.34, beatSensitivity: 0.22 }));
      break;
  }

  return targets;
}

async function loadDustSong(): Promise<DustSong> {
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持 gzip 解压');
  const response = await fetch('/nocturne-lighting/dust.json.gz');
  if (!response.ok || !response.body) throw new Error(`Dust MIDI 数据加载失败：${response.status}`);
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const raw = await new Response(stream).text();
  const parsed = JSON.parse(raw) as Partial<DustSong>;
  if (!Array.isArray(parsed.events) || !Number.isFinite(Number(parsed.duration))) throw new Error('Dust MIDI 数据格式无效');
  return parsed as DustSong;
}

export class DustLightingDirector {
  private readonly stage: LightingStage;
  private readonly analysis: Analysis;
  private readonly cues: Cue[];
  private readonly onStatus?: (status: DustLightingStatus) => void;
  private playing = false;
  private time = 0;
  private startWall = 0;
  private cueIndex = -1;
  private eventPtr = 0;
  private frameHandle = 0;
  private lastStatusAt = 0;

  private constructor(stage: LightingStage, song: DustSong, onStatus?: (status: DustLightingStatus) => void) {
    this.stage = stage;
    this.analysis = analyze(song);
    this.cues = buildPlan(this.analysis);
    this.onStatus = onStatus;
  }

  static async create(stage: LightingStage, onStatus?: (status: DustLightingStatus) => void): Promise<DustLightingDirector> {
    const song = await loadDustSong();
    const director = new DustLightingDirector(stage, song, onStatus);
    director.prepareStage();
    director.applyCueAtTime(0, true);
    director.emitStatus(true);
    director.frameHandle = requestAnimationFrame(director.tick);
    return director;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    if (this.time >= this.analysis.duration - 0.01) this.restart(false);
    this.prepareStage();
    this.startWall = performance.now() - this.time * 1000;
    this.playing = true;
    this.emitStatus(true);
  }

  pause(): void {
    if (!this.playing) return;
    this.time = this.currentTime();
    this.playing = false;
    this.emitStatus(true);
  }

  restart(autoPlay = true): void {
    this.time = 0;
    this.cueIndex = -1;
    this.eventPtr = 0;
    this.applyCueAtTime(0, true);
    if (autoPlay) {
      this.startWall = performance.now();
      this.playing = true;
    } else {
      this.playing = false;
    }
    this.emitStatus(true);
  }

  stop(restore = true): void {
    this.playing = false;
    this.time = 0;
    this.cueIndex = -1;
    this.eventPtr = 0;
    if (restore) this.stage.setStageMode('nocturne');
    this.emitStatus(true);
  }

  destroy(): void {
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private prepareStage(): void {
    this.stage.setDemo(false);
    this.stage.setPaused(false);
    this.stage.setStageMode('manual');
    this.stage.setBPM?.(this.analysis.bpm);
    this.stage.setHaze?.({ density: 0.13, speed: 0.08, animated: true, color: LOOK.warm });
  }

  private currentTime(): number {
    return this.playing ? clamp((performance.now() - this.startWall) / 1000, 0, this.analysis.duration) : this.time;
  }

  private applyCueAtTime(time: number, force = false): void {
    const bar = clamp(Math.floor(time / this.analysis.bar), 0, this.analysis.bars.length - 1);
    const nextIndex = cueAtBar(this.cues, bar);
    if (!force && nextIndex === this.cueIndex) return;
    this.cueIndex = nextIndex;
    const cue = this.cues[this.cueIndex];
    if (!cue) return;
    const duration = force ? 0.08 : clamp(this.analysis.beat * cue.transitionBeats, 0.28, 1.25);
    const targets = buildCueTargets(this.stage, this.analysis, cue);
    for (const [fixture, patch] of targets) fixture.set(patch, duration);
  }

  private processEvents(from: number, to: number): void {
    if (to < from) {
      this.eventPtr = lowerBound(this.analysis.events, Math.max(0, to - 0.03));
      return;
    }
    if (to - from > 0.8) this.eventPtr = lowerBound(this.analysis.events, Math.max(0, to - 0.03));
    while (this.eventPtr < this.analysis.events.length && (Number(this.analysis.events[this.eventPtr]?.s) || 0) <= to + 0.035) {
      const event = this.analysis.events[this.eventPtr++];
      if (!event || (Number(event.s) || 0) < from - 0.05 || event.i !== 'drums') continue;
      const velocity = clamp((Number(event.v) || 90) / 127, 0, 1);
      const kind = drumKind(Number(event.n) || 0);
      if (kind === 'crash') this.stage.triggerBeat?.(0.82 + velocity * 0.18, { duration: 0.34, source: 'dust-midi-crash' });
      else if (kind === 'snare' && velocity > 0.52) this.stage.triggerBeat?.(0.38 + velocity * 0.38, { duration: 0.2, source: 'dust-midi-snare' });
      else if (kind === 'kick') this.stage.triggerBeat?.(0.28 + velocity * 0.34, { duration: 0.16, source: 'dust-midi-kick' });
    }
  }

  private emitStatus(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastStatusAt < 80) return;
    this.lastStatusAt = now;
    const bar = clamp(Math.floor(this.time / this.analysis.bar), 0, this.analysis.bars.length - 1);
    const cue = this.cues[this.cueIndex] ?? this.cues[cueAtBar(this.cues, bar)];
    this.onStatus?.({
      ready: true,
      playing: this.playing,
      time: this.time,
      duration: this.analysis.duration,
      bar,
      cue: cue?.style ?? '—',
      energy: cue?.energy ?? 0,
      focus: cue?.focus ?? '—',
    });
  }

  private readonly tick = (): void => {
    this.frameHandle = requestAnimationFrame(this.tick);
    if (!this.playing) return;
    const previous = this.time;
    this.time = this.currentTime();
    this.applyCueAtTime(this.time);
    this.processEvents(previous, this.time);
    if (this.time >= this.analysis.duration) {
      this.playing = false;
      this.time = this.analysis.duration;
    }
    this.emitStatus();
  };
}
