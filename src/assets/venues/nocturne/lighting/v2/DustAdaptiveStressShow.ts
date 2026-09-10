import type {
  FixtureState,
  LightingCue,
  RigFixtureSnapshot,
  RigSnapshot,
  ShowPlan,
  ShowSection,
  SongScore,
} from './contracts';

type DrumKind = 'kick' | 'snare' | 'crash' | 'tom' | 'hat' | 'other';
type PhraseStyle =
  | 'opening-lock'
  | 'bass-lock'
  | 'void'
  | 'outro-shadow'
  | 'groove-left'
  | 'groove-right'
  | 'stagger-groove'
  | 'cross-groove'
  | 'build-fan'
  | 'knife-hit'
  | 'knife-drive'
  | 'climax-grid';

type BarInfo = {
  index: number;
  raw: number;
  energy: number;
  density: number;
  events: number;
  roles: Record<string, number>;
  drums: Record<DrumKind, number>;
  focus: string;
};

type Analysis = {
  beat: number;
  bar: number;
  bars: BarInfo[];
};

type Phrase = {
  index: number;
  bar: number;
  endBar: number;
  startSeconds: number;
  endSeconds: number;
  style: PhraseStyle;
  energy: number;
  density: number;
  focus: string;
  crashes: number;
  transitionBeats: number;
};

type GroupLook = {
  intensity: number;
  idleIntensity: number;
  colorA: string;
  colorB: string;
  beamAngleDeg: number;
  panWidth: number;
  tilt: number;
  mirror: number;
  activeCount: number;
  texturePan: number;
  textureTilt: number;
  textureBeats: number;
};

type StyleLook = {
  rear: GroupLook;
  floor: GroupLook;
  side: GroupLook;
  frontIntensity: number;
  frontFloorIntensity: number;
  frontColor: string;
};

const LOOK = {
  red: '#b8323c',
  deepRed: '#631821',
  white: '#f4f0e7',
  steel: '#788391',
  blue: '#465a78',
  warm: '#e3c9a4',
  shadow: '#4d535d',
};

const ROLE_WEIGHT: Record<string, number> = {
  drums: 1.22,
  bass: 1.18,
  electric: 0.92,
  guitar: 0.72,
  lower: 0.58,
  upper: 0.62,
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function createDustAdaptiveStressShowPlan(score: SongScore, rig: RigSnapshot): ShowPlan {
  const analysis = analyze(score);
  const sections = buildMacroSections(score.duration, analysis.beat);
  const phrases = buildPhrases(analysis, score.duration);
  const cues: LightingCue[] = [];
  const current = new Map<string, FixtureState>(rig.fixtures.map((fixture) => [fixture.id, { ...fixture.home, intensity: 0 }]));

  const rear = fixtures(rig, 'beam', 'rear');
  const floor = fixtures(rig, 'beam', 'floor');
  const side = fixtures(rig, 'beam', 'side');
  const front = rig.fixtures.filter((fixture) => fixture.type === 'par' && fixture.groups.includes('front') && !fixture.groups.includes('front-floor'));
  const frontFloor = fixtures(rig, 'par', 'front-floor');
  const allBeams = rig.fixtures.filter((fixture) => fixture.type === 'beam');

  for (const phrase of phrases) {
    const section = sectionAt(sections, phrase.startSeconds);
    const style = styleLook(phrase);
    const phraseDuration = Math.max(0.05, phrase.endSeconds - phrase.startSeconds);
    const transitionSeconds = clamp(
      analysis.beat * phrase.transitionBeats,
      0.18,
      Math.max(0.18, phraseDuration * 0.46),
    );
    const transitionEnd = Math.min(phrase.endSeconds - 0.01, phrase.startSeconds + transitionSeconds);

    applyBeamGroup(cues, current, rear, phrase, section, style.rear, transitionEnd, 'rear', 'edge');
    applyBeamGroup(cues, current, floor, phrase, section, style.floor, transitionEnd, 'floor', 'center');
    applyBeamGroup(cues, current, side, phrase, section, style.side, transitionEnd, 'side', 'all');

    applyParGroup(cues, current, front, phrase, section, style.frontIntensity, style.frontColor, 24, transitionEnd, 'front');
    applyParGroup(
      cues,
      current,
      frontFloor,
      phrase,
      section,
      style.frontFloorIntensity,
      phrase.style === 'climax-grid' ? LOOK.white : LOOK.red,
      22,
      transitionEnd,
      'front-floor',
    );
  }

  addDrumAccents(cues, sections, rear, floor, side, frontFloor, allBeams, analysis.beat);
  addFinalBlackout(cues, current, sections, rig, score.duration, analysis.beat);

  return {
    schemaVersion: '2.0-prototype',
    id: 'dust-adaptive-stress-v2',
    revision: 1,
    title: `${score.artist} · ${score.title}`,
    brief: `压力测试编排：复用旧 Director 的逐小节能量/密度/声部焦点分析和 style vocabulary，共生成 ${phrases.length} 个 phrase；执行仍完全由绝对音乐时间确定。`,
    seed: 86,
    baseLook: { intensity: 0 },
    sections,
    cues,
  };
}

function analyze(score: SongScore): Analysis {
  const beat = 60 / score.bpm;
  const bar = beat * 4;
  const count = Math.max(1, Math.ceil(score.duration / bar));
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

  for (const event of score.events) {
    const time = Math.max(0, Number(event.s) || 0);
    const barIndex = clamp(Math.floor(time / bar), 0, count - 1);
    const info = bars[barIndex];
    if (!info) continue;
    const velocity = clamp((Number(event.v) || 90) / 127, 0.06, 1);
    const duration = Math.max(0.035, (Number(event.e) || time + 0.08) - time);
    const role = event.i || 'other';
    const weight = velocity
      * (ROLE_WEIGHT[role] ?? 0.52)
      * (role === 'drums' ? 1 : clamp(0.72 + duration * 0.16, 0.72, 1.16));
    info.raw += weight;
    info.events += 1;
    info.roles[role] = (info.roles[role] ?? 0) + weight;
    if (role === 'drums') info.drums[drumKind(Number(event.n) || 0)] += 1;
  }

  const energyScale = percentile(bars.map((item) => item.raw), 0.9);
  const densityScale = percentile(bars.map((item) => item.events), 0.9);
  for (let index = 0; index < bars.length; index += 1) {
    const info = bars[index];
    if (!info) continue;
    const previous = (bars[Math.max(0, index - 1)]?.raw ?? 0) / energyScale;
    const current = info.raw / energyScale;
    const next = (bars[Math.min(bars.length - 1, index + 1)]?.raw ?? 0) / energyScale;
    info.energy = clamp(previous * 0.16 + current * 0.68 + next * 0.16, 0, 1);
    info.density = clamp(info.events / densityScale, 0, 1);
    info.focus = Object.entries(info.roles).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'bass';
  }

  return { beat, bar, bars };
}

function buildPhrases(analysis: Analysis, duration: number): Phrase[] {
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
    const end = sorted[index + 1] ?? analysis.bars.length;
    const stats = phraseStats(analysis, start, end);
    const before = start ? phraseStats(analysis, Math.max(0, start - 2), start).energy : stats.energy;
    const after = phraseStats(analysis, end, Math.min(analysis.bars.length, end + 2)).energy;
    const style = styleFor(stats, index, sorted.length, after - before);
    const startSeconds = Math.min(duration - 0.01, start * analysis.bar);
    const endSeconds = Math.max(startSeconds + 0.01, Math.min(duration, end * analysis.bar));
    return {
      index,
      bar: start,
      endBar: end,
      startSeconds,
      endSeconds,
      style,
      energy: stats.energy,
      density: stats.density,
      focus: stats.focus,
      crashes: stats.crashes,
      transitionBeats: style === 'void' || style === 'outro-shadow' ? 1.8 : style === 'climax-grid' ? 0.65 : 1.1,
    };
  });
}

function phraseStats(analysis: Analysis, start: number, end: number) {
  const slice = analysis.bars.slice(start, Math.min(analysis.bars.length, end));
  if (!slice.length) return { energy: 0, density: 0, focus: 'bass', crashes: 0 };
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
  };
}

function styleFor(
  stats: ReturnType<typeof phraseStats>,
  index: number,
  total: number,
  trend: number,
): PhraseStyle {
  if (index === 0) return 'opening-lock';
  if (index >= total - 2 && stats.energy < 0.48) return 'outro-shadow';
  if (stats.energy < 0.2) return 'void';
  if (stats.focus === 'bass' && stats.energy < 0.58) return 'bass-lock';
  if (stats.energy < 0.43) return index % 2 ? 'groove-left' : 'groove-right';
  if (stats.energy < 0.64) return trend > 0.08 ? 'build-fan' : index % 2 ? 'cross-groove' : 'stagger-groove';
  if (stats.energy < 0.82) return stats.crashes ? 'knife-hit' : 'knife-drive';
  return 'climax-grid';
}

function styleLook(phrase: Phrase): StyleLook {
  const e = phrase.energy;
  const commonRear = (patch: Partial<GroupLook>): GroupLook => ({
    intensity: lerp(0.32, 0.68, e),
    idleIntensity: 0.025,
    colorA: LOOK.red,
    colorB: LOOK.steel,
    beamAngleDeg: lerp(2.8, 1.9, e),
    panWidth: 24,
    tilt: lerp(-29, -21, e),
    mirror: 1,
    activeCount: 2,
    texturePan: 0,
    textureTilt: 0,
    textureBeats: 8,
    ...patch,
  });
  const commonFloor = (patch: Partial<GroupLook>): GroupLook => ({
    intensity: lerp(0.18, 0.48, e),
    idleIntensity: 0.018,
    colorA: LOOK.deepRed,
    colorB: LOOK.red,
    beamAngleDeg: lerp(3.2, 2.0, e),
    panWidth: 20,
    tilt: lerp(48, 35, e),
    mirror: -1,
    activeCount: 1,
    texturePan: 0,
    textureTilt: 0,
    textureBeats: 8,
    ...patch,
  });
  const commonSide = (patch: Partial<GroupLook>): GroupLook => ({
    intensity: lerp(0.18, 0.46, e),
    idleIntensity: 0.04,
    colorA: LOOK.red,
    colorB: LOOK.white,
    beamAngleDeg: 3.2,
    panWidth: 12,
    tilt: -16,
    mirror: 1,
    activeCount: 99,
    texturePan: 0,
    textureTilt: 0,
    textureBeats: 8,
    ...patch,
  });

  switch (phrase.style) {
    case 'opening-lock':
    case 'bass-lock':
      return {
        rear: commonRear({ intensity: lerp(0.24, 0.46, e), panWidth: 15, colorA: LOOK.deepRed, colorB: LOOK.red, texturePan: 2.5, textureTilt: 1.2, textureBeats: 16 }),
        floor: commonFloor({ intensity: lerp(0.13, 0.28, e), panWidth: 12, colorB: LOOK.steel, textureTilt: 1.4, textureBeats: 16 }),
        side: commonSide({ intensity: 0.28, panWidth: 7, beamAngleDeg: 3.4 }),
        frontIntensity: lerp(0.14, 0.24, e),
        frontFloorIntensity: lerp(0.04, 0.10, e),
        frontColor: LOOK.warm,
      };
    case 'void':
    case 'outro-shadow':
      return {
        rear: commonRear({ intensity: 0.13, idleIntensity: 0.012, activeCount: 1, panWidth: 8, colorA: LOOK.deepRed, colorB: LOOK.steel, beamAngleDeg: 3.1 }),
        floor: commonFloor({ intensity: 0.05, idleIntensity: 0.008, activeCount: 0, panWidth: 7, colorB: LOOK.deepRed, beamAngleDeg: 3.4 }),
        side: commonSide({ intensity: 0.12, idleIntensity: 0.018, colorA: LOOK.red, colorB: LOOK.shadow, panWidth: 5 }),
        frontIntensity: 0.11,
        frontFloorIntensity: 0.025,
        frontColor: LOOK.warm,
      };
    case 'groove-left':
    case 'groove-right': {
      const mirror = phrase.style === 'groove-left' ? -1 : 1;
      return {
        rear: commonRear({ intensity: lerp(0.34, 0.56, e), panWidth: 30, mirror, texturePan: 5, textureTilt: 1.8, textureBeats: 8 }),
        floor: commonFloor({ intensity: lerp(0.20, 0.38, e), panWidth: 22, mirror: -mirror, texturePan: 3.5, textureTilt: 2.2, textureBeats: 8 }),
        side: commonSide({ intensity: lerp(0.22, 0.36, e), panWidth: 16 * mirror, beamAngleDeg: 3.2 }),
        frontIntensity: lerp(0.18, 0.28, e),
        frontFloorIntensity: lerp(0.07, 0.14, e),
        frontColor: LOOK.warm,
      };
    }
    case 'stagger-groove':
      return {
        rear: commonRear({ intensity: lerp(0.42, 0.68, e), activeCount: 3, panWidth: 34, colorB: LOOK.white, texturePan: 7, textureTilt: 2.4, textureBeats: 8 }),
        floor: commonFloor({ intensity: lerp(0.24, 0.46, e), activeCount: 2, panWidth: 26, colorB: LOOK.steel, texturePan: 4.5, textureTilt: 3, textureBeats: 8 }),
        side: commonSide({ intensity: 0.40, panWidth: 18, beamAngleDeg: 2.9 }),
        frontIntensity: 0.27,
        frontFloorIntensity: 0.14,
        frontColor: LOOK.warm,
      };
    case 'cross-groove':
      return {
        rear: commonRear({ intensity: lerp(0.44, 0.70, e), activeCount: 3, panWidth: 38, texturePan: 8, textureTilt: 2.8, textureBeats: 8 }),
        floor: commonFloor({ intensity: lerp(0.28, 0.48, e), activeCount: 2, panWidth: 32, texturePan: 6, textureTilt: 3.2, textureBeats: 8 }),
        side: commonSide({ intensity: 0.46, panWidth: 26, beamAngleDeg: 2.8 }),
        frontIntensity: 0.29,
        frontFloorIntensity: 0.16,
        frontColor: LOOK.warm,
      };
    case 'build-fan':
      return {
        rear: commonRear({ intensity: lerp(0.52, 0.76, e), activeCount: 3, panWidth: 44, colorB: LOOK.white, texturePan: 10, textureTilt: 3.5, textureBeats: 12 }),
        floor: commonFloor({ intensity: lerp(0.30, 0.54, e), activeCount: 2, panWidth: 38, colorA: LOOK.blue, texturePan: 7, textureTilt: 4, textureBeats: 12 }),
        side: commonSide({ intensity: 0.40, panWidth: 30, beamAngleDeg: 3 }),
        frontIntensity: 0.30,
        frontFloorIntensity: 0.18,
        frontColor: LOOK.warm,
      };
    case 'knife-hit':
    case 'knife-drive':
      return {
        rear: commonRear({ intensity: lerp(0.64, 0.86, e), activeCount: 3, panWidth: 48, colorB: LOOK.white, beamAngleDeg: 1.7, texturePan: 11, textureTilt: 3.8, textureBeats: 4 }),
        floor: commonFloor({ intensity: lerp(0.42, 0.68, e), activeCount: 3, panWidth: 42, beamAngleDeg: 1.9, texturePan: 9, textureTilt: 4.8, textureBeats: 4 }),
        side: commonSide({ intensity: 0.54, panWidth: 34, beamAngleDeg: 2.4, texturePan: 4, textureBeats: 8 }),
        frontIntensity: 0.38,
        frontFloorIntensity: 0.24,
        frontColor: LOOK.white,
      };
    case 'climax-grid':
      return {
        rear: commonRear({ intensity: 0.92, activeCount: 99, panWidth: 52, colorB: LOOK.white, beamAngleDeg: 1.65, texturePan: 13, textureTilt: 4.6, textureBeats: 4 }),
        floor: commonFloor({ intensity: 0.74, activeCount: 99, panWidth: 48, colorB: LOOK.white, beamAngleDeg: 1.85, texturePan: 11, textureTilt: 5.5, textureBeats: 4 }),
        side: commonSide({ intensity: 0.72, panWidth: 38, beamAngleDeg: 2.3, texturePan: 5, textureTilt: 2, textureBeats: 8 }),
        frontIntensity: 0.56,
        frontFloorIntensity: 0.34,
        frontColor: LOOK.white,
      };
  }
}

function applyBeamGroup(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  selected: RigFixtureSnapshot[],
  phrase: Phrase,
  section: ShowSection,
  look: GroupLook,
  transitionEnd: number,
  groupName: string,
  activeMode: 'edge' | 'center' | 'all',
): void {
  selected.forEach((fixture, index) => {
    const state = current.get(fixture.id);
    if (!state) return;
    const active = isActive(index, selected.length, look.activeCount, activeMode);
    const targetIntensity = active ? look.intensity : look.idleIntensity;
    const targetColor = index % 2 ? look.colorB : look.colorA;
    const targetPan = groupName === 'side'
      ? focusPan(phrase.focus) + fan(index, selected.length, Math.abs(look.panWidth) * 0.42) * Math.sign(look.panWidth || 1)
      : fan(index, selected.length, look.panWidth) * look.mirror;
    const targetTilt = look.tilt;

    cues.push({
      id: `p${phrase.index}-${groupName}-look-${fixture.id}`,
      sectionId: section.id,
      startSeconds: phrase.startSeconds,
      endSeconds: phrase.endSeconds,
      layer: 'section',
      priority: phrase.index,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: phrase.startSeconds, value: state.intensity }, { time: transitionEnd, value: targetIntensity }] } },
        color: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: phrase.startSeconds, value: state.color }, { time: transitionEnd, value: targetColor }] } },
        beamAngleDeg: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: phrase.startSeconds, value: state.beamAngleDeg }, { time: transitionEnd, value: look.beamAngleDeg }] } },
      },
    });

    cues.push({
      id: `p${phrase.index}-${groupName}-move-${fixture.id}`,
      sectionId: section.id,
      startSeconds: phrase.startSeconds,
      endSeconds: phrase.endSeconds,
      layer: 'motion',
      priority: phrase.index,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: phrase.startSeconds, value: state.pan }, { time: transitionEnd, value: targetPan }] } },
        tilt: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: phrase.startSeconds, value: state.tilt }, { time: transitionEnd, value: targetTilt }] } },
      },
    });

    const textureStart = transitionEnd;
    const textureDuration = phrase.endSeconds - textureStart;
    if (active && textureDuration > 0.35 && (look.texturePan > 0.01 || look.textureTilt > 0.01)) {
      const fade = Math.min(textureDuration * 0.22, Math.max(0.12, textureDuration * 0.08));
      cues.push({
        id: `p${phrase.index}-${groupName}-texture-${fixture.id}`,
        sectionId: section.id,
        startSeconds: textureStart,
        endSeconds: phrase.endSeconds,
        layer: 'motion',
        priority: 10_000 + phrase.index,
        select: { ids: [fixture.id], order: 'given' },
        fadeInSeconds: fade,
        fadeOutSeconds: fade,
        channels: {
          ...(look.texturePan > 0.01 ? {
            pan: {
              blend: 'replace' as const,
              effect: {
                op: 'oscillator' as const,
                min: targetPan - look.texturePan,
                max: targetPan + look.texturePan,
                periodSeconds: Math.max(0.4, look.textureBeats * (60 / 110)),
                phase: phrase.index * 0.173 + index * 0.137,
              },
            },
          } : {}),
          ...(look.textureTilt > 0.01 ? {
            tilt: {
              blend: 'replace' as const,
              effect: {
                op: 'oscillator' as const,
                min: targetTilt - look.textureTilt,
                max: targetTilt + look.textureTilt,
                periodSeconds: Math.max(0.4, look.textureBeats * (60 / 110) * 1.17),
                phase: 0.25 + phrase.index * 0.119 + index * 0.091,
              },
            },
          } : {}),
        },
      });
    }

    state.intensity = targetIntensity;
    state.color = targetColor;
    state.beamAngleDeg = look.beamAngleDeg;
    state.pan = targetPan;
    state.tilt = targetTilt;
  });
}

function applyParGroup(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  selected: RigFixtureSnapshot[],
  phrase: Phrase,
  section: ShowSection,
  intensity: number,
  color: string,
  angle: number,
  transitionEnd: number,
  groupName: string,
): void {
  selected.forEach((fixture, index) => {
    const state = current.get(fixture.id);
    if (!state) return;
    const targetColor = groupName === 'front-floor' && index % 3 === 0 && phrase.style === 'climax-grid' ? LOOK.white : color;
    cues.push({
      id: `p${phrase.index}-${groupName}-look-${fixture.id}`,
      sectionId: section.id,
      startSeconds: phrase.startSeconds,
      endSeconds: phrase.endSeconds,
      layer: 'section',
      priority: phrase.index,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: phrase.startSeconds, value: state.intensity }, { time: transitionEnd, value: intensity }] } },
        color: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: phrase.startSeconds, value: state.color }, { time: transitionEnd, value: targetColor }] } },
        beamAngleDeg: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: phrase.startSeconds, value: state.beamAngleDeg }, { time: transitionEnd, value: angle }] } },
      },
    });
    state.intensity = intensity;
    state.color = targetColor;
    state.beamAngleDeg = angle;
  });
}

function addDrumAccents(
  cues: LightingCue[],
  sections: ShowSection[],
  rear: RigFixtureSnapshot[],
  floor: RigFixtureSnapshot[],
  side: RigFixtureSnapshot[],
  frontFloor: RigFixtureSnapshot[],
  allBeams: RigFixtureSnapshot[],
  beat: number,
): void {
  for (const section of sections) {
    addEnvelope(cues, section, [...floor, ...frontFloor], `kick-${section.id}`, [35, 36], 0.018, Math.max(0.11, beat * 0.28), 0.18);
    addEnvelope(cues, section, [...rear, ...side], `snare-${section.id}`, [37, 38, 39, 40], 0.012, Math.max(0.14, beat * 0.36), 0.24);
    addEnvelope(cues, section, allBeams, `crash-${section.id}`, [49, 52, 55, 57], 0.008, Math.max(0.26, beat * 0.78), 0.38);
  }
}

function addEnvelope(
  cues: LightingCue[],
  section: ShowSection,
  selected: RigFixtureSnapshot[],
  id: string,
  noteNumbers: number[],
  attackSeconds: number,
  decaySeconds: number,
  gain: number,
): void {
  const ids = [...new Set(selected.map((fixture) => fixture.id))];
  if (!ids.length) return;
  cues.push({
    id,
    sectionId: section.id,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    layer: 'accent',
    priority: 100,
    select: { ids, order: 'given' },
    channels: {
      intensity: {
        blend: 'add',
        effect: {
          op: 'eventEnvelope',
          roleIds: ['drums'],
          noteNumbers,
          attackSeconds,
          decaySeconds,
          gain,
          reducer: 'max',
        },
      },
    },
  });
}

function addFinalBlackout(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  sections: ShowSection[],
  rig: RigSnapshot,
  duration: number,
  beat: number,
): void {
  const section = sections[sections.length - 1];
  if (!section) return;
  const fadeStart = Math.max(section.startSeconds, duration - 4 * beat);
  for (const fixture of rig.fixtures) {
    const state = current.get(fixture.id);
    if (!state) continue;
    cues.push({
      id: `stress-outro-black-${fixture.id}`,
      sectionId: section.id,
      startSeconds: fadeStart,
      endSeconds: duration,
      layer: 'section',
      priority: 100_000,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: fadeStart, value: state.intensity },
              { time: Math.max(fadeStart + 0.01, duration - 0.02), value: 0 },
            ],
          },
        },
      },
    });
  }
}

function buildMacroSections(duration: number, beat: number): ShowSection[] {
  const labels: Array<[string, string, string]> = [
    ['intro', '序幕 · Bass Lock', '保留低密度空间，建立 Another One Bites the Dust 的低频重心'],
    ['groove-a', 'Groove A · 左右摆位', '按小节能量与焦点在 groove-left / groove-right / bass-lock 之间切换'],
    ['groove-b', 'Groove B · Cross / Stagger', '中段增加 cross 与 stagger 构图，但运动仍由时间函数可复算'],
    ['break', 'Break · 收束与空隙', '低能量 phrase 自动进入 void / bass-lock，减少无意义运动'],
    ['build', 'Build · Fan 展开', '能量趋势向上时扩大 fan，允许慢速绝对时间 oscillator 作纹理'],
    ['climax', 'Climax · Knife / Grid', '高能量 phrase 使用更窄 Beam、更宽覆盖和密集鼓点 accent'],
    ['outro', 'Outro · Shadow', '回落到 shadow look，并在最后四拍显式淡黑'],
  ];
  const fractions = [0, 0.12, 0.30, 0.48, 0.62, 0.80, 0.92, 1];
  const bar = beat * 4;
  const marks: number[] = [0];
  for (let index = 1; index < fractions.length - 1; index += 1) {
    const raw = duration * fractions[index]!;
    const snapped = Math.round(raw / bar) * bar;
    const previous = marks[marks.length - 1] ?? 0;
    marks.push(clamp(snapped, previous + beat, duration - (fractions.length - 1 - index) * beat));
  }
  marks.push(duration);
  return labels.map(([id, label, intent], index) => ({
    id,
    label,
    intent,
    startSeconds: marks[index] ?? 0,
    endSeconds: marks[index + 1] ?? duration,
  }));
}

function sectionAt(sections: ShowSection[], time: number): ShowSection {
  return sections.find((section) => time >= section.startSeconds && time < section.endSeconds)
    ?? sections[sections.length - 1]!;
}

function fixtures(rig: RigSnapshot, type: string, group: string): RigFixtureSnapshot[] {
  return rig.fixtures
    .filter((fixture) => fixture.type === type && fixture.groups.includes(group))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

function isActive(index: number, count: number, activeCount: number, mode: 'edge' | 'center' | 'all'): boolean {
  if (mode === 'all' || activeCount >= count) return true;
  if (activeCount <= 0) return false;
  if (mode === 'edge') return index < activeCount || index >= count - activeCount;
  return Math.abs(index - (count - 1) / 2) <= activeCount - 0.5;
}

function fan(index: number, count: number, width: number): number {
  if (count <= 1) return 0;
  return lerp(-Math.abs(width), Math.abs(width), index / (count - 1));
}

function focusPan(role: string): number {
  if (role === 'bass') return -24;
  if (role === 'drums') return 0;
  if (role === 'electric') return 24;
  if (role === 'guitar') return -12;
  if (role === 'lower' || role === 'upper') return 14;
  return 0;
}

function drumKind(note: number): DrumKind {
  if ([35, 36].includes(note)) return 'kick';
  if ([37, 38, 39, 40].includes(note)) return 'snare';
  if ([49, 52, 55, 57].includes(note)) return 'crash';
  if ([41, 43, 45, 47, 48, 50].includes(note)) return 'tom';
  if ([42, 44, 46].includes(note)) return 'hat';
  return 'other';
}

function percentile(values: number[], q: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  return Math.max(0.0001, sorted[Math.round((sorted.length - 1) * q)] ?? 1);
}
