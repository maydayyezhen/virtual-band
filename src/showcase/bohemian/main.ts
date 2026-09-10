import * as THREE from 'three';
import { AudioEngine } from '../../audio/AudioEngine';
import { DEFAULT_BASS_PROGRAM } from '../../audio/BassProgram';
import { BassSampler } from '../../audio/BassSampler';
import { DrumSampler } from '../../audio/DrumSampler';
import { DEFAULT_ELECTRIC_GUITAR_PROGRAM } from '../../audio/ElectricGuitarProgram';
import { ElectricGuitarSampler } from '../../audio/ElectricGuitarSampler';
import { KeyboardSampler } from '../../audio/KeyboardSampler';
import { SampleLibrary } from '../../audio/SampleLibrary';
import { Sf2BankLibrary } from '../../audio/sf2/Sf2BankLibrary';
import { Sf2KeyboardBackend } from '../../audio/sf2/Sf2KeyboardBackend';
import { Sf2ProgramBackend } from '../../audio/sf2/Sf2ProgramBackend';
import { BassInstrument } from '../../instruments/bass/BassInstrument';
import { DrumsInstrument } from '../../instruments/drums/DrumsInstrument';
import { ElectricGuitarInstrument } from '../../instruments/electric/ElectricGuitarInstrument';
import { KeyboardInstrument } from '../../instruments/keyboard/KeyboardInstrument';
import sourcePart01 from '../../assets/venues/nocturne/source/nocturne-stage-source-01.js?raw';
import sourcePart02 from '../../assets/venues/nocturne/source/nocturne-stage-source-02.js?raw';
import sourcePart03 from '../../assets/venues/nocturne/source/nocturne-stage-source-03.js?raw';
import sourcePart04 from '../../assets/venues/nocturne/source/nocturne-stage-source-04.js?raw';
import sourcePart05 from '../../assets/venues/nocturne/source/nocturne-stage-source-05.js?raw';
import sourcePart06 from '../../assets/venues/nocturne/source/nocturne-stage-source-06.js?raw';
import sourcePart07 from '../../assets/venues/nocturne/source/nocturne-stage-source-07.js?raw';
import { parseBohemianScore, type BohemianNote, type BohemianRole, type BohemianScore } from './MidiScore';

const SOURCE_LENGTH = 127_767;
const SOURCE_PARTS = [sourcePart01, sourcePart02, sourcePart03, sourcePart04, sourcePart05, sourcePart06, sourcePart07];
const LOOK_EPSILON = 0.012;
const START_EPSILON = 0.020;
const END_EPSILON = 0.012;

type StageFrame = { dt: number; time: number };
type StageInstrumentOptions = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  update?: (frame: StageFrame, root: THREE.Object3D) => void;
};
type ScreenFrame = { width: number; height: number; time: number; dt: number };
type ShowcaseStage = {
  THREE: typeof THREE;
  surfaceY: number;
  lights: Map<string, { id: string; type: string; groups: Set<string> }>;
  setDemo(enabled: boolean): unknown;
  setPaused(paused: boolean): unknown;
  setStageMode(mode: string | Record<string, unknown>): unknown;
  setHaze(options: Record<string, unknown>): unknown;
  setLightGroup(group: string | string[], patch: Record<string, unknown>, duration?: number): unknown;
  setScreenPattern(
    id: string,
    pattern: string | ((ctx: CanvasRenderingContext2D, frame: ScreenFrame) => void),
    options?: Record<string, unknown>,
  ): unknown;
  setCamera(options: Record<string, unknown>): unknown;
  triggerBeat(strength?: number, options?: Record<string, unknown>): unknown;
  feedMIDI?(bytes: number[] | Uint8Array): unknown;
  addInstrument(id: string, object: THREE.Object3D, options?: StageInstrumentOptions): THREE.Object3D;
};

type Band = {
  audio: AudioEngine;
  banks: Sf2BankLibrary;
  drums: DrumsInstrument;
  bass: BassInstrument;
  electric: ElectricGuitarInstrument;
  keyboard: KeyboardInstrument;
  prepareAudio(): Promise<void>;
  resetVisuals(): void;
  dispose(): void;
};

type Chapter = {
  quarter: number;
  name: string;
  short: string;
  color: string;
  second: string;
  rear: number;
  floor: number;
  side: number;
  par: number;
  rearPan: number;
  rearTilt: number;
  floorTilt: number;
  scan: number;
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
  guitarProgram?: number;
};

type TimedChapter = Chapter & { time: number };

const CHAPTERS: Chapter[] = [
  {
    quarter: 0,
    name: '序幕 · 合声微光',
    short: 'OVERTURE',
    color: '#82bddb',
    second: '#d9a976',
    rear: 0.24,
    floor: 0.05,
    side: 0.16,
    par: 0.12,
    rearPan: 0,
    rearTilt: -31,
    floorTilt: 31,
    scan: 0.020,
    camera: { position: [0, 7.5, 24], target: [0, 4.4, -1.0], fov: 58 },
  },
  {
    quarter: 20,
    name: '序幕 · 窗前琴声',
    short: 'PIANO',
    color: '#6faedb',
    second: '#ecc594',
    rear: 0.28,
    floor: 0.08,
    side: 0.23,
    par: 0.23,
    rearPan: -5,
    rearTilt: -27,
    floorTilt: 34,
    scan: 0.016,
    camera: { position: [-11.5, 5.8, 13.5], target: [-5.8, 3.5, 0.2], fov: 53 },
  },
  {
    quarter: 64,
    name: '叙事 · 琥珀独白',
    short: 'BALLAD',
    color: '#edb77d',
    second: '#546ba5',
    rear: 0.31,
    floor: 0.13,
    side: 0.28,
    par: 0.27,
    rearPan: 7,
    rearTilt: -25,
    floorTilt: 37,
    scan: 0.018,
    camera: { position: [10.8, 5.2, 15.2], target: [1.8, 3.2, 0.5], fov: 58 },
  },
  {
    quarter: 100,
    name: '叙事 · 乐队渐入',
    short: 'BAND RISE',
    color: '#dc9d70',
    second: '#759dd7',
    rear: 0.45,
    floor: 0.31,
    side: 0.36,
    par: 0.34,
    rearPan: 0,
    rearTilt: -23,
    floorTilt: 42,
    scan: 0.028,
    camera: { position: [0, 5.9, 17.5], target: [0, 3.4, 0.2], fov: 66 },
  },
  {
    quarter: 186,
    name: '独奏 · 银蓝交锋',
    short: 'GUITAR SOLO',
    color: '#8bdde8',
    second: '#a087e3',
    rear: 0.57,
    floor: 0.42,
    side: 0.72,
    par: 0.30,
    rearPan: 10,
    rearTilt: -19,
    floorTilt: 49,
    scan: 0.052,
    camera: { position: [10.2, 4.7, 11.4], target: [3.25, 3.2, 1.6], fov: 49 },
    guitarProgram: 27,
  },
  {
    quarter: 222,
    name: '歌剧 · 左右对答',
    short: 'OPERA',
    color: '#9da7ff',
    second: '#e4b57a',
    rear: 0.56,
    floor: 0.34,
    side: 0.52,
    par: 0.42,
    rearPan: -13,
    rearTilt: -22,
    floorTilt: 44,
    scan: 0.062,
    camera: { position: [-9.8, 6.8, 16.2], target: [0, 4.1, -0.5], fov: 63 },
  },
  {
    quarter: 252,
    name: '歌剧 · 面具法庭',
    short: 'GALILEO',
    color: '#b698e7',
    second: '#8ee2dd',
    rear: 0.69,
    floor: 0.47,
    side: 0.63,
    par: 0.48,
    rearPan: 14,
    rearTilt: -15,
    floorTilt: 52,
    scan: 0.078,
    camera: { position: [0, 9.1, 20.0], target: [0, 4.4, -0.4], fov: 61 },
  },
  {
    quarter: 296,
    name: '摇滚 · 赤金爆发',
    short: 'HARD ROCK',
    color: '#f47b4d',
    second: '#f4d6a1',
    rear: 0.95,
    floor: 0.82,
    side: 0.88,
    par: 0.63,
    rearPan: 0,
    rearTilt: -12,
    floorTilt: 58,
    scan: 0.118,
    camera: { position: [0, 4.7, 13.3], target: [0, 3.15, 0.6], fov: 72 },
    guitarProgram: 29,
  },
  {
    quarter: 378,
    name: '摇滚 · 银白风暴',
    short: 'ROCK STORM',
    color: '#d6e9ee',
    second: '#ef754f',
    rear: 1.05,
    floor: 0.93,
    side: 0.92,
    par: 0.72,
    rearPan: 0,
    rearTilt: -10,
    floorTilt: 61,
    scan: 0.145,
    camera: { position: [-12.0, 5.1, 10.0], target: [0.5, 3.0, 0.2], fov: 69 },
    guitarProgram: 30,
  },
  {
    quarter: 410,
    name: '尾声 · 重回夜色',
    short: 'CODA',
    color: '#75a7cf',
    second: '#d8b68d',
    rear: 0.39,
    floor: 0.14,
    side: 0.28,
    par: 0.25,
    rearPan: -4,
    rearTilt: -28,
    floorTilt: 34,
    scan: 0.022,
    camera: { position: [8.6, 5.8, 17.4], target: [-1.8, 3.6, -0.1], fov: 58 },
    guitarProgram: 27,
  },
  {
    quarter: 466,
    name: '终曲 · 最后一束光',
    short: 'FAREWELL',
    color: '#bbcede',
    second: '#ddba8d',
    rear: 0.23,
    floor: 0.04,
    side: 0.12,
    par: 0.15,
    rearPan: 0,
    rearTilt: -33,
    floorTilt: 28,
    scan: 0.012,
    camera: { position: [0, 7.8, 25.0], target: [0, 4.1, -1.2], fov: 56 },
  },
];

let bandRef: Band | null = null;
let performanceRef: BohemianPerformance | null = null;

async function decodeStageSource(): Promise<string> {
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持 DecompressionStream');
  const base64 = SOURCE_PARTS.map(extractChunk).join('');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  if (source.length !== SOURCE_LENGTH) throw new Error(`NOCTURNE source length mismatch: ${source.length}`);
  return source;
}

function extractChunk(moduleSource: string): string {
  const match = moduleSource.match(/\.push\('([A-Za-z0-9+/=]+)'\);?/);
  if (!match) throw new Error('NOCTURNE source chunk is malformed');
  return match[1];
}

function patchStageSource(source: string): string {
  const marker = '          bindUI(app);';
  if (!source.includes(marker)) throw new Error('NOCTURNE UI bootstrap marker is missing');
  return source.replace(marker, '          // Bohemian showcase owns the visible UI.');
}

async function createBand(stage: ShowcaseStage): Promise<Band> {
  const audio = new AudioEngine();
  const samples = new SampleLibrary(audio);
  const banks = new Sf2BankLibrary();
  audio.setMasterGain(0.84, 0);

  const drumTone = new Sf2ProgramBackend(audio, banks, {
    bank: 128,
    program: 0,
    label: 'bohemian-drums',
    gain: 0.92,
  });
  const bassTone = new Sf2ProgramBackend(audio, banks, {
    bank: 0,
    program: DEFAULT_BASS_PROGRAM,
    label: 'bohemian-bass',
    gain: 0.98,
  });
  const electricTone = new Sf2ProgramBackend(audio, banks, {
    bank: 0,
    program: DEFAULT_ELECTRIC_GUITAR_PROGRAM,
    label: 'bohemian-electric',
    gain: 0.88,
  });
  const keyboardTone = new Sf2KeyboardBackend(audio, banks);

  const drumSampler = new DrumSampler(audio, samples, drumTone);
  const bassSampler = new BassSampler(bassTone);
  const electricSampler = new ElectricGuitarSampler(audio, samples, electricTone);
  const keyboardSampler = new KeyboardSampler(audio, samples, keyboardTone);

  const [drums, bass, electric, keyboard] = await Promise.all([
    DrumsInstrument.create(drumSampler),
    BassInstrument.create(bassSampler),
    ElectricGuitarInstrument.create(electricSampler),
    KeyboardInstrument.create(keyboardSampler),
  ]);

  const floor = Number.isFinite(stage.surfaceY) ? stage.surfaceY : 1.2;
  const add = (
    id: string,
    instrument: { root: THREE.Object3D; update(dt: number): unknown },
    position: [number, number, number],
    rotation: [number, number, number],
    maxWidth: number,
    maxHeight: number,
  ): void => {
    const scale = fitScale(instrument.root, maxWidth, maxHeight);
    stage.addInstrument(id, instrument.root, {
      position,
      rotation,
      scale,
      update: (frame) => instrument.update(Math.max(0, frame?.dt ?? 0)),
    });
  };

  add('bohemian-keyboard', keyboard, [-6.0, floor, -0.15], [0, 0.18, 0], 6.4, 4.6);
  add('bohemian-drums', drums, [0.0, floor, -1.15], [0, 0, 0], 5.2, 3.4);
  add('bohemian-bass', bass, [-2.7, floor, 2.15], [0, 0.10, -0.03], 2.25, 4.15);
  add('bohemian-electric', electric, [3.45, floor, 2.05], [0, -0.15, 0.04], 2.45, 4.15);

  const resetVisuals = (): void => {
    drums.reset();
    bass.reset();
    electric.reset();
    keyboard.reset();
    drums.update(1);
    bass.update(1);
    electric.update(1);
    keyboard.update(1);
  };

  return {
    audio,
    banks,
    drums,
    bass,
    electric,
    keyboard,
    prepareAudio: async () => {
      await Promise.allSettled([
        drumSampler.preload(),
        bassSampler.preload(),
        electricSampler.preloadShowcase(),
        keyboardSampler.preloadCommon(),
      ]);
    },
    resetVisuals,
    dispose: () => {
      drums.dispose();
      bass.dispose();
      electric.dispose();
      keyboard.dispose();
      banks.dispose();
      audio.dispose();
    },
  };
}

function fitScale(root: THREE.Object3D, maxWidth: number, maxHeight: number): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const byWidth = size.x > 0.001 ? maxWidth / size.x : 1;
  const byHeight = size.y > 0.001 ? maxHeight / size.y : 1;
  return Math.max(0.1, Math.min(1.4, byWidth, byHeight));
}

class BohemianDirector {
  readonly chapters: TimedChapter[];
  private currentIndex = -1;
  private currentTime = 0;
  private lastGuitarMove = -Infinity;
  private lastBassMove = -Infinity;
  private readonly rolePulse: Record<BohemianRole, number> = {
    drums: 0,
    bass: 0,
    guitar: 0,
    piano: 0,
    choir: 0,
    strings: 0,
    lead: 0,
  };

  constructor(
    private readonly stage: ShowcaseStage,
    private readonly score: BohemianScore,
    private readonly band: Band,
  ) {
    this.chapters = CHAPTERS.map((chapter) => ({
      ...chapter,
      time: score.tickToSeconds(chapter.quarter * score.ppq),
    }));

    stage.setDemo(false);
    stage.setPaused(true);
    stage.setStageMode('manual');
    stage.setHaze({ density: 0.22, speed: 0.09, animated: true, color: '#8196ad' });
    this.installScreens();
    this.apply(0, true);
  }

  get chapter(): TimedChapter {
    return this.chapters[Math.max(0, this.currentIndex)] ?? this.chapters[0]!;
  }

  apply(time: number, force = false): void {
    this.currentTime = clamp(time, 0, this.score.duration);
    const next = floorChapter(this.chapters, this.currentTime);
    if (!force && next === this.currentIndex) return;
    this.currentIndex = next;
    const chapter = this.chapter;

    const move = force ? 0 : 0.75;
    this.stage.setLightGroup('rear', {
      enabled: true,
      beam: true,
      color: chapter.color,
      intensity: chapter.rear,
      pan: chapter.rearPan,
      tilt: chapter.rearTilt,
      angle: 3.2,
      scan: chapter.scan > 0 ? { pan: 18, tilt: 7, speed: chapter.scan, phase: 0 } : null,
      beatSensitivity: 0.24,
      strobe: 0,
    }, move);
    this.stage.setLightGroup('floor', {
      enabled: true,
      beam: true,
      color: chapter.second,
      intensity: chapter.floor,
      pan: -chapter.rearPan * 0.6,
      tilt: chapter.floorTilt,
      angle: chapter.quarter >= 296 && chapter.quarter < 410 ? 4.8 : 3.6,
      scan: chapter.scan > 0.035 ? { pan: 12, tilt: 5, speed: chapter.scan * 0.78, phase: Math.PI } : null,
      beatSensitivity: 0.32,
      strobe: 0,
    }, move);
    this.stage.setLightGroup('side', {
      enabled: true,
      beam: true,
      color: chapter.quarter >= 296 && chapter.quarter < 410 ? chapter.second : chapter.color,
      intensity: chapter.side,
      pan: 0,
      tilt: -18,
      angle: 4.4,
      scan: chapter.scan > 0.045 ? { pan: 25, tilt: 9, speed: chapter.scan * 0.92, phase: Math.PI / 2 } : null,
      beatSensitivity: 0.26,
      strobe: 0,
    }, move);
    this.stage.setLightGroup('par', {
      enabled: true,
      beam: true,
      color: chapter.second,
      intensity: chapter.par,
      angle: 25,
      beatSensitivity: 0.16,
      strobe: 0,
    }, move);

    this.stage.setCamera({ ...chapter.camera, duration: force ? 0 : 1.35 });
    if (chapter.guitarProgram !== undefined && this.band.electric.program !== chapter.guitarProgram) {
      this.band.electric.setProgram(chapter.guitarProgram);
    }
    updateChapterUI(chapter, this.currentIndex, this.chapters);
  }

  noteOn(note: BohemianNote): void {
    const strength = note.velocity / 127;
    this.rolePulse[note.role] = Math.max(this.rolePulse[note.role], strength);
    this.stage.feedMIDI?.([0x90 | (note.channel & 0x0f), note.note, note.velocity]);

    if (note.role === 'drums') {
      if ([49, 51, 52, 55, 57, 59].includes(note.note)) {
        this.stage.triggerBeat(0.72 + strength * 0.28, { duration: 0.34, groups: ['rear', 'floor', 'side'] });
      } else if ([38, 39, 40].includes(note.note)) {
        this.stage.triggerBeat(0.22 + strength * 0.28, { duration: 0.13, groups: ['side', 'rear'] });
      } else if ([35, 36].includes(note.note)) {
        this.stage.triggerBeat(0.15 + strength * 0.22, { duration: 0.12, groups: ['floor'] });
      }
      return;
    }

    if (note.role === 'guitar' && note.time - this.lastGuitarMove > 0.16) {
      this.lastGuitarMove = note.time;
      const pan = clamp((note.note - 64) * 1.65, -30, 30);
      const tilt = clamp(-18 - (note.note - 64) * 0.42, -38, -4);
      this.stage.setLightGroup('side', { pan, tilt }, 0.12);
      return;
    }

    if (note.role === 'bass' && note.time - this.lastBassMove > 0.23 && strength > 0.48) {
      this.lastBassMove = note.time;
      const pan = clamp((note.note - 40) * 1.10, -15, 15);
      this.stage.setLightGroup('floor', { pan }, 0.16);
    }
  }

  noteOff(note: BohemianNote): void {
    this.stage.feedMIDI?.([0x80 | (note.channel & 0x0f), note.note, 0]);
  }

  tickVisuals(dt: number): void {
    const decay = Math.exp(-Math.max(0, dt) * 5.5);
    for (const role of Object.keys(this.rolePulse) as BohemianRole[]) this.rolePulse[role] *= decay;
    updateMeters(this.rolePulse);
  }

  private installScreens(): void {
    this.stage.setScreenPattern('main', (ctx, frame) => this.drawMainScreen(ctx, frame), {
      playing: true,
      brightness: 0.86,
    });
    this.stage.setScreenPattern('left', (ctx, frame) => this.drawWingScreen(ctx, frame, -1), {
      playing: true,
      brightness: 0.78,
    });
    this.stage.setScreenPattern('right', (ctx, frame) => this.drawWingScreen(ctx, frame, 1), {
      playing: true,
      brightness: 0.78,
    });
  }

  private drawMainScreen(ctx: CanvasRenderingContext2D, frame: ScreenFrame): void {
    const { width: w, height: h } = frame;
    const chapter = this.chapter;
    const progress = clamp(this.currentTime / Math.max(0.01, this.score.duration), 0, 1);
    const rock = chapter.quarter >= 296 && chapter.quarter < 410;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#05080f');
    bg.addColorStop(0.48, rock ? '#1a0907' : '#08111e');
    bg.addColorStop(1, '#030507');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const pulse = Math.max(this.rolePulse.piano, this.rolePulse.guitar, this.rolePulse.choir, this.rolePulse.strings);
    const cx = w * (0.50 + Math.sin(this.currentTime * 0.21) * 0.035);
    const cy = h * 0.48;
    const rings = 8;
    for (let index = rings - 1; index >= 0; index -= 1) {
      const radius = Math.min(w, h) * (0.10 + index * 0.055 + pulse * 0.018);
      ctx.globalAlpha = 0.055 + index * 0.012;
      ctx.strokeStyle = index % 2 ? chapter.color : chapter.second;
      ctx.lineWidth = 1.4 + (rings - index) * 0.35;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 1.85, radius, Math.sin(this.currentTime * 0.10) * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }

    const bars = 28;
    ctx.globalAlpha = 0.62;
    for (let index = 0; index < bars; index += 1) {
      const x = (index + 0.5) / bars * w;
      const phase = this.currentTime * (rock ? 3.2 : 1.35) + index * 0.63;
      const activity = 0.24 + pulse * 0.64 + Math.sin(phase) * 0.10;
      const bh = h * clamp(activity, 0.08, 0.92) * (0.22 + 0.78 * Math.sin((index + 1) * 0.41) ** 2);
      ctx.fillStyle = index % 3 === 0 ? chapter.second : chapter.color;
      ctx.fillRect(x - Math.max(1, w / 430), h * 0.5 - bh * 0.5, Math.max(2, w / 215), bh);
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eef4f6';
    ctx.font = `600 ${Math.max(22, h * 0.095)}px sans-serif`;
    ctx.fillText(rock ? 'BOHEMIAN' : 'BOHEMIAN RHAPSODY', w * 0.5, h * 0.47);
    ctx.fillStyle = chapter.second;
    ctx.font = `500 ${Math.max(12, h * 0.035)}px monospace`;
    ctx.fillText(chapter.short + '  ·  QUEEN', w * 0.5, h * 0.56);

    ctx.fillStyle = '#ffffff18';
    ctx.fillRect(w * 0.12, h * 0.77, w * 0.76, Math.max(2, h * 0.006));
    ctx.fillStyle = chapter.color;
    ctx.fillRect(w * 0.12, h * 0.77, w * 0.76 * progress, Math.max(2, h * 0.006));
    ctx.restore();
  }

  private drawWingScreen(ctx: CanvasRenderingContext2D, frame: ScreenFrame, side: -1 | 1): void {
    const { width: w, height: h } = frame;
    const chapter = this.chapter;
    const role = side < 0 ? Math.max(this.rolePulse.piano, this.rolePulse.bass) : Math.max(this.rolePulse.guitar, this.rolePulse.drums);
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#04070c';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.15 + role * 0.28;
    ctx.fillStyle = side < 0 ? chapter.color : chapter.second;
    for (let index = 0; index < 16; index += 1) {
      const y = index / 16 * h;
      const offset = Math.sin(this.currentTime * 1.3 + index * 0.85 + side) * w * (0.08 + role * 0.16);
      ctx.fillRect(w * 0.5 + offset - w * 0.10, y, w * 0.20, h / 42);
    }
    ctx.globalAlpha = 0.9;
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#edf3f6';
    ctx.font = `600 ${Math.max(20, w * 0.17)}px monospace`;
    ctx.fillText(side < 0 ? 'QUEEN' : chapter.short, 0, 0);
    ctx.restore();
  }
}

class BohemianPerformance {
  private readonly notes: BohemianNote[];
  private readonly endings: BohemianNote[];
  private position = 0;
  private origin = 0;
  private startIndex = 0;
  private endIndex = 0;
  private raf = 0;
  private playing = false;
  private lastFrameTime = 0;
  private activeCount = new Map<string, number>();
  private lastUi = 0;

  constructor(
    readonly score: BohemianScore,
    private readonly stage: ShowcaseStage,
    private readonly band: Band,
    private readonly director: BohemianDirector,
  ) {
    this.notes = score.notes;
    this.endings = score.notes
      .filter((note) => note.role !== 'drums')
      .slice()
      .sort((a, b) => a.end - b.end || a.time - b.time || a.note - b.note);
    this.seekPointers(0);
    this.syncUI(true);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTime(): number {
    if (!this.playing) return this.position;
    return clamp(this.band.audio.getContext().currentTime - this.origin, 0, this.score.duration);
  }

  async play(): Promise<void> {
    await this.band.audio.resume();
    if (this.playing) return;
    if (this.position >= this.score.duration - 0.02) this.position = 0;
    this.resetBand();
    this.seekPointers(this.position);
    this.origin = this.band.audio.getContext().currentTime - this.position;
    this.playing = true;
    this.stage.setPaused(false);
    this.resumeHeldNotes(this.position);
    this.lastFrameTime = performance.now();
    this.director.apply(this.position, true);
    updatePlayButton(true);
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (!this.playing) return;
    this.position = this.currentTime;
    this.playing = false;
    this.resetBand();
    this.stage.setPaused(true);
    this.director.apply(this.position, true);
    updatePlayButton(false);
    this.syncUI(true);
  }

  seek(time: number): void {
    const target = clamp(Number.isFinite(time) ? time : 0, 0, this.score.duration);
    const wasPlaying = this.playing;
    this.position = target;
    this.resetBand();
    this.seekPointers(target);
    this.director.apply(target, true);

    if (wasPlaying) {
      this.origin = this.band.audio.getContext().currentTime - target;
      this.resumeHeldNotes(target);
      this.stage.setPaused(false);
      if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    } else {
      this.stage.setPaused(true);
    }
    this.syncUI(true);
  }

  async restart(): Promise<void> {
    const wasPlaying = this.playing;
    this.playing = false;
    this.position = 0;
    this.resetBand();
    this.seekPointers(0);
    this.director.apply(0, true);
    if (wasPlaying) await this.play();
    else {
      this.stage.setPaused(true);
      updatePlayButton(false);
      this.syncUI(true);
    }
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.playing = false;
    this.resetBand();
  }

  private readonly tick = (wall: number): void => {
    this.raf = 0;
    if (!this.playing) return;
    const time = this.currentTime;
    const dt = Math.min(0.1, Math.max(0, (wall - this.lastFrameTime) / 1000));
    this.lastFrameTime = wall;

    while (this.startIndex < this.notes.length && (this.notes[this.startIndex]?.time ?? Infinity) <= time + START_EPSILON) {
      const note = this.notes[this.startIndex++]!;
      if (note.time >= time - 0.075) this.noteOn(note);
    }
    while (this.endIndex < this.endings.length && (this.endings[this.endIndex]?.end ?? Infinity) <= time + END_EPSILON) {
      const note = this.endings[this.endIndex++]!;
      this.noteOff(note);
    }

    this.director.apply(time);
    this.director.tickVisuals(dt);
    if (wall - this.lastUi > 55) {
      this.lastUi = wall;
      this.syncUI();
    }

    if (time >= this.score.duration - LOOK_EPSILON) {
      this.position = this.score.duration;
      this.playing = false;
      this.resetBand();
      this.stage.setPaused(true);
      this.director.apply(this.position, true);
      updatePlayButton(false);
      this.syncUI(true);
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private noteOn(note: BohemianNote): void {
    this.director.noteOn(note);
    if (note.role === 'drums') {
      this.band.drums.noteOn(note.note, note.velocity);
      return;
    }
    if (note.role === 'piano') {
      this.band.keyboard.noteOnTier(fitMidi(note.note, 21, 108), note.velocity, 'lower', note.id);
      return;
    }
    if (note.role === 'choir' || note.role === 'strings' || note.role === 'lead') {
      this.band.keyboard.noteOnTier(fitMidi(note.note, 36, 96), Math.max(28, Math.round(note.velocity * 0.78)), 'upper', note.id);
      return;
    }

    const key = `${note.role}:${note.note}`;
    this.activeCount.set(key, (this.activeCount.get(key) ?? 0) + 1);
    if (note.role === 'bass') this.band.bass.noteOn(fitMidi(note.note, 28, 67), note.velocity);
    else if (note.role === 'guitar') this.band.electric.noteOn(fitMidi(note.note, 40, 88), note.velocity);
  }

  private noteOff(note: BohemianNote): void {
    this.director.noteOff(note);
    if (note.role === 'piano') {
      this.band.keyboard.noteOffTier(fitMidi(note.note, 21, 108), 'lower', note.id);
      return;
    }
    if (note.role === 'choir' || note.role === 'strings' || note.role === 'lead') {
      this.band.keyboard.noteOffTier(fitMidi(note.note, 36, 96), 'upper', note.id);
      return;
    }
    if (note.role === 'drums') return;

    const key = `${note.role}:${note.note}`;
    const next = Math.max(0, (this.activeCount.get(key) ?? 1) - 1);
    if (next > 0) {
      this.activeCount.set(key, next);
      return;
    }
    this.activeCount.delete(key);
    if (note.role === 'bass') this.band.bass.noteOff(fitMidi(note.note, 28, 67));
    else if (note.role === 'guitar') this.band.electric.noteOff(fitMidi(note.note, 40, 88));
  }

  private resumeHeldNotes(time: number): void {
    if (time <= 0) return;
    for (const note of this.notes) {
      if (note.time >= time) break;
      if (note.role !== 'drums' && note.end > time + END_EPSILON) this.noteOn(note);
    }
  }

  private resetBand(): void {
    this.activeCount.clear();
    this.band.resetVisuals();
  }

  private seekPointers(time: number): void {
    this.startIndex = lowerBound(this.notes, time, (note) => note.time);
    this.endIndex = lowerBound(this.endings, time, (note) => note.end);
  }

  private syncUI(force = false): void {
    const time = this.currentTime;
    const clock = document.getElementById('showClock');
    if (clock) clock.textContent = `${formatTime(time)} / ${formatTime(this.score.duration)}`;
    const seek = document.getElementById('showSeek') as HTMLInputElement | null;
    if (seek && (force || document.activeElement !== seek)) seek.value = String(time);
  }
}

function bindControls(show: BohemianPerformance, director: BohemianDirector): void {
  const play = document.getElementById('showPlay') as HTMLButtonElement | null;
  const restart = document.getElementById('showRestart') as HTMLButtonElement | null;
  const seek = document.getElementById('showSeek') as HTMLInputElement | null;
  const volume = document.getElementById('showVolume') as HTMLInputElement | null;

  play?.addEventListener('click', async () => {
    play.disabled = true;
    try {
      if (show.isPlaying) show.pause();
      else await show.play();
    } finally {
      play.disabled = false;
    }
  });

  restart?.addEventListener('click', async () => {
    restart.disabled = true;
    try {
      await show.restart();
    } finally {
      restart.disabled = false;
    }
  });

  seek?.addEventListener('input', () => show.seek(Number(seek.value)));
  volume?.addEventListener('input', () => bandRef?.audio.setMasterGain(Number(volume.value) / 100, 0.03));

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-chapter-index]')) {
    button.addEventListener('click', () => {
      const chapter = director.chapters[Number(button.dataset.chapterIndex)];
      if (chapter) show.seek(chapter.time);
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || isFormTarget(event.target)) return;
    event.preventDefault();
    play?.click();
  });
}

function renderChapterButtons(chapters: TimedChapter[]): void {
  const row = document.getElementById('chapterJumps');
  if (!row) return;
  row.replaceChildren();
  chapters.forEach((chapter, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.chapterIndex = String(index);
    button.textContent = chapter.short;
    button.title = `${formatTime(chapter.time)} · ${chapter.name}`;
    row.append(button);
  });
}

function updateChapterUI(chapter: TimedChapter, index: number, chapters: TimedChapter[]): void {
  const title = document.getElementById('showChapter');
  if (title) title.textContent = chapter.name;
  const look = document.getElementById('showLook');
  if (look) look.textContent = chapter.short;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-chapter-index]')) {
    button.classList.toggle('active', Number(button.dataset.chapterIndex) === index);
  }
  const next = chapters[index + 1];
  const meta = document.getElementById('chapterMeta');
  if (meta) meta.textContent = next ? `${formatTime(chapter.time)} → ${formatTime(next.time)}` : `${formatTime(chapter.time)} → END`;
}

function updatePlayButton(playing: boolean): void {
  const button = document.getElementById('showPlay') as HTMLButtonElement | null;
  if (!button) return;
  button.textContent = playing ? 'Ⅱ 暂停' : '▶ 播放';
  button.classList.toggle('active', playing);
}

function updateMeters(pulses: Record<BohemianRole, number>): void {
  const values: Record<string, number> = {
    drums: pulses.drums,
    bass: pulses.bass,
    guitar: pulses.guitar,
    piano: pulses.piano,
    voices: Math.max(pulses.choir, pulses.strings, pulses.lead),
  };
  for (const [id, value] of Object.entries(values)) {
    const node = document.getElementById(`meter-${id}`) as HTMLElement | null;
    if (node) node.style.transform = `scaleX(${clamp(value, 0.015, 1).toFixed(3)})`;
  }
}

function floorChapter(chapters: TimedChapter[], time: number): number {
  let low = 0;
  let high = chapters.length;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if ((chapters[middle]?.time ?? Infinity) <= time) low = middle;
    else high = middle;
  }
  return low;
}

function fitMidi(note: number, min: number, max: number): number {
  let value = Math.round(note);
  while (value < min) value += 12;
  while (value > max) value -= 12;
  return clamp(value, min, max);
}

function lowerBound<T>(items: T[], time: number, valueOf: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (valueOf(items[middle]!) < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function isFormTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLButtonElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function start(): Promise<void> {
  (window as Window & { THREE: typeof THREE }).THREE = THREE;
  const source = await decodeStageSource();
  Function(patchStageSource(source))();
  const stageReady = (window as Window & { stageReady?: Promise<unknown> }).stageReady;
  if (!stageReady) throw new Error('NOCTURNE stageReady was not created');
  const stage = await stageReady as ShowcaseStage;

  const note = document.getElementById('loadingNote');
  if (note) note.textContent = '正在把乐器搬上舞台…';

  const score = parseBohemianScore();
  const band = await createBand(stage);
  bandRef = band;
  const director = new BohemianDirector(stage, score, band);
  const show = new BohemianPerformance(score, stage, band, director);
  performanceRef = show;

  renderChapterButtons(director.chapters);
  bindControls(show, director);

  const seek = document.getElementById('showSeek') as HTMLInputElement | null;
  if (seek) {
    seek.max = String(score.duration);
    seek.value = '0';
  }
  const stats = document.getElementById('showStats');
  if (stats) {
    const counts = new Map<BohemianRole, number>();
    for (const event of score.notes) counts.set(event.role, (counts.get(event.role) ?? 0) + 1);
    stats.textContent = `${score.notes.length.toLocaleString()} notes · ${director.chapters.length} chapters · 4 live instruments`;
  }

  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.opacity = '0';
    window.setTimeout(() => loading.remove(), 650);
  }

  const audioStatus = document.getElementById('audioStatus');
  if (audioStatus) audioStatus.textContent = '正在准备 SF2 音色…';
  void band.prepareAudio().then(() => {
    if (audioStatus) audioStatus.textContent = 'SF2 READY · 点击播放';
  });
  document.getElementById('viewport')?.focus();
}

window.addEventListener('beforeunload', () => {
  performanceRef?.dispose();
  bandRef?.dispose();
});

start().catch((error) => {
  console.error('[Bohemian Rhapsody Showcase]', error);
  const note = document.getElementById('loadingNote');
  if (note) note.textContent = `演出启动失败：${error instanceof Error ? error.message : String(error)}`;
  const line = document.querySelector<HTMLElement>('.loading-line');
  if (line) line.style.display = 'none';
});
