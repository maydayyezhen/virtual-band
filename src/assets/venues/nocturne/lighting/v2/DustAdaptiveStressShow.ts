import type {
  FixtureState,
  LightingCue,
  RigFixtureSnapshot,
  RigSnapshot,
  ShowPlan,
  ShowSection,
  SongEvent,
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

/**
 * Stress plan v2.1: keep the old Director's adaptive phrase vocabulary, but
 * stop treating continuous movement as the default visual language.
 *
 * The song's bass riff is the visual clock. Moving heads mostly HOLD. Large
 * repositions dip dark, move while hidden, then reveal the new composition.
 * Bass / kick / snare / crash events create short deterministic transients.
 */
export function createDustAdaptiveStressShowPlan(score: SongScore, rig: RigSnapshot): ShowPlan {
  const analysis = analyze(score);
  const sections = buildMacroSections(score.duration, analysis.beat);
  const phrases = buildPhrases(analysis, score.duration);
  const cues: LightingCue[] = [];
  const current = new Map<string, FixtureState>(
    rig.fixtures.map((fixture) => [fixture.id, { ...fixture.home, intensity: 0 }]),
  );

  const rear = fixtures(rig, 'beam', 'rear');
  const floor = fixtures(rig, 'beam', 'floor');
  const side = fixtures(rig, 'beam', 'side');
  const front = rig.fixtures
    .filter((fixture) => fixture.type === 'par' && fixture.groups.includes('front') && !fixture.groups.includes('front-floor'))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const frontFloor = fixtures(rig, 'par', 'front-floor');
  const allBeams = rig.fixtures.filter((fixture) => fixture.type === 'beam');

  for (const phrase of phrases) {
    const section = sectionAt(sections, phrase.startSeconds);
    const style = styleLook(phrase);
    const phraseDuration = Math.max(0.05, phrase.endSeconds - phrase.startSeconds);
    const transitionSeconds = clamp(
      analysis.beat * phrase.transitionBeats,
      0.12,
      Math.max(0.12, phraseDuration * 0.32),
    );
    const transitionEnd = Math.min(phrase.endSeconds - 0.01, phrase.startSeconds + transitionSeconds);

    applyBeamGroup(cues, current, rear, phrase, section, style.rear, transitionEnd, 'rear', 'edge');
    applyBeamGroup(cues, current, floor, phrase, section, style.floor, transitionEnd, 'floor', 'center');
    applyBeamGroup(cues, current, side, phrase, section, style.side, transitionEnd, 'side', 'edge');

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

  // Lots of cue traffic, but visually terse: the stress comes from layering and
  // event density rather than making every moving head wander continuously.
  addBassRiffAccents(cues, sections, score.events, rear, side, frontFloor, analysis.beat);
  addDrumAccents(cues, sections, score.events, rear, floor, side, front, frontFloor, allBeams, analysis.beat);
  addFinalBlackout(cues, current, sections, rig, score.duration, analysis.beat);

  return {
    schemaVersion: '2.0-prototype',
    id: 'dust-adaptive-stress-v2',
    revision: 2,
    title: `${score.artist} · ${score.title}`,
    brief: `Dry Groove 压力测试：${phrases.length} 个 adaptive phrase；moving heads 以 Hold / 暗场换位为主，Bass riff 与鼓组生成密集短促 accent，不使用持续 oscillator。`,
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
      transitionBeats: transitionBeatsFor(style),
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

function transitionBeatsFor(style: PhraseStyle): number {
  switch (style) {
    case 'void':
    case 'outro-shadow': return 0.85;
    case 'build-fan': return 1.6;
    case 'knife-hit':
    case 'knife-drive':
    case 'climax-grid': return 0.38;
    default: return 0.58;
  }
}

function styleLook(phrase: Phrase): StyleLook {
  const e = phrase.energy;
  const commonRear = (patch: Partial<GroupLook>): GroupLook => ({
    intensity: lerp(0.30, 0.62, e),
    idleIntensity: 0.014,
    colorA: LOOK.red,
    colorB: LOOK.deepRed,
    beamAngleDeg: lerp(2.7, 1.9, e),
    panWidth: 22,
    tilt: lerp(-29, -22, e),
    mirror: 1,
    activeCount: 2,
    ...patch,
  });
  const commonFloor = (patch: Partial<GroupLook>): GroupLook => ({
    intensity: lerp(0.15, 0.40, e),
    idleIntensity: 0.009,
    colorA: LOOK.deepRed,
    colorB: LOOK.red,
    beamAngleDeg: lerp(3.0, 2.0, e),
    panWidth: 18,
    tilt: lerp(47, 36, e),
    mirror: -1,
    activeCount: 1,
    ...patch,
  });
  const commonSide = (patch: Partial<GroupLook>): GroupLook => ({
    intensity: lerp(0.16, 0.38, e),
    idleIntensity: 0.012,
    colorA: LOOK.red,
    colorB: LOOK.deepRed,
    beamAngleDeg: 3.0,
    panWidth: 12,
    tilt: -16,
    mirror: 1,
    activeCount: 1,
    ...patch,
  });

  switch (phrase.style) {
    case 'opening-lock':
    case 'bass-lock':
      return {
        rear: commonRear({ intensity: lerp(0.23, 0.42, e), activeCount: 1, panWidth: 13, colorA: LOOK.deepRed, colorB: LOOK.red }),
        floor: commonFloor({ intensity: lerp(0.10, 0.24, e), activeCount: 1, panWidth: 9, colorB: LOOK.steel }),
        side: commonSide({ intensity: 0.20, activeCount: 1, panWidth: 8, beamAngleDeg: 3.3 }),
        frontIntensity: lerp(0.12, 0.20, e),
        frontFloorIntensity: lerp(0.025, 0.07, e),
        frontColor: LOOK.warm,
      };
    case 'void':
    case 'outro-shadow':
      return {
        rear: commonRear({ intensity: 0.10, idleIntensity: 0.006, activeCount: 1, panWidth: 7, colorA: LOOK.deepRed, colorB: LOOK.shadow, beamAngleDeg: 3.2 }),
        floor: commonFloor({ intensity: 0.035, idleIntensity: 0.004, activeCount: 0, panWidth: 5, colorB: LOOK.deepRed, beamAngleDeg: 3.5 }),
        side: commonSide({ intensity: 0.08, idleIntensity: 0.006, activeCount: 1, colorA: LOOK.red, colorB: LOOK.shadow, panWidth: 5 }),
        frontIntensity: 0.08,
        frontFloorIntensity: 0.015,
        frontColor: LOOK.warm,
      };
    case 'groove-left':
    case 'groove-right': {
      const mirror = phrase.style === 'groove-left' ? -1 : 1;
      return {
        rear: commonRear({ intensity: lerp(0.32, 0.52, e), activeCount: 2, panWidth: 27, mirror }),
        floor: commonFloor({ intensity: lerp(0.17, 0.33, e), activeCount: 1, panWidth: 19, mirror: -mirror }),
        side: commonSide({ intensity: lerp(0.20, 0.31, e), activeCount: 1, panWidth: 14 * mirror, beamAngleDeg: 3.1 }),
        frontIntensity: lerp(0.15, 0.23, e),
        frontFloorIntensity: lerp(0.045, 0.10, e),
        frontColor: LOOK.warm,
      };
    }
    case 'stagger-groove':
      return {
        rear: commonRear({ intensity: lerp(0.38, 0.60, e), activeCount: 2, panWidth: 31, colorB: LOOK.steel }),
        floor: commonFloor({ intensity: lerp(0.21, 0.39, e), activeCount: 2, panWidth: 23, colorB: LOOK.steel }),
        side: commonSide({ intensity: 0.34, activeCount: 1, panWidth: 18, beamAngleDeg: 2.9 }),
        frontIntensity: 0.23,
        frontFloorIntensity: 0.11,
        frontColor: LOOK.warm,
      };
    case 'cross-groove':
      return {
        rear: commonRear({ intensity: lerp(0.40, 0.64, e), activeCount: 2, panWidth: 35, mirror: -1 }),
        floor: commonFloor({ intensity: lerp(0.23, 0.42, e), activeCount: 2, panWidth: 29, mirror: 1 }),
        side: commonSide({ intensity: 0.39, activeCount: 2, panWidth: 23, beamAngleDeg: 2.8 }),
        frontIntensity: 0.25,
        frontFloorIntensity: 0.13,
        frontColor: LOOK.warm,
      };
    case 'build-fan':
      return {
        rear: commonRear({ intensity: lerp(0.47, 0.70, e), activeCount: 3, panWidth: 42, colorB: LOOK.white }),
        floor: commonFloor({ intensity: lerp(0.27, 0.49, e), activeCount: 2, panWidth: 35, colorA: LOOK.blue }),
        side: commonSide({ intensity: 0.39, activeCount: 2, panWidth: 28, beamAngleDeg: 2.8 }),
        frontIntensity: 0.27,
        frontFloorIntensity: 0.16,
        frontColor: LOOK.warm,
      };
    case 'knife-hit':
    case 'knife-drive':
      return {
        rear: commonRear({ intensity: lerp(0.58, 0.80, e), activeCount: 3, panWidth: 47, colorB: LOOK.white, beamAngleDeg: 1.7 }),
        floor: commonFloor({ intensity: lerp(0.38, 0.61, e), activeCount: 3, panWidth: 40, beamAngleDeg: 1.9 }),
        side: commonSide({ intensity: 0.49, activeCount: 2, panWidth: 31, beamAngleDeg: 2.35 }),
        frontIntensity: 0.34,
        frontFloorIntensity: 0.21,
        frontColor: LOOK.white,
      };
    case 'climax-grid':
      return {
        rear: commonRear({ intensity: 0.88, activeCount: 99, panWidth: 51, colorB: LOOK.white, beamAngleDeg: 1.6 }),
        floor: commonFloor({ intensity: 0.68, activeCount: 99, panWidth: 46, colorB: LOOK.white, beamAngleDeg: 1.8 }),
        side: commonSide({ intensity: 0.64, activeCount: 99, panWidth: 36, colorB: LOOK.white, beamAngleDeg: 2.2 }),
        frontIntensity: 0.50,
        frontFloorIntensity: 0.30,
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
    const transitionSpan = Math.max(0.01, transitionEnd - phrase.startSeconds);
    const travel = Math.abs(targetPan - state.pan) + Math.abs(targetTilt - state.tilt) * 1.7;
    const darkReposition = phrase.index > 0 && active && targetIntensity > 0.07 && travel > 8;
    const darkLevel = Math.min(0.012, targetIntensity * 0.06);
    const darkAt = phrase.startSeconds + transitionSpan * 0.20;
    const revealAt = phrase.startSeconds + transitionSpan * 0.78;

    const intensityKeyframes = darkReposition
      ? [
          { time: phrase.startSeconds, value: state.intensity },
          { time: darkAt, value: darkLevel },
          { time: revealAt, value: darkLevel },
          { time: transitionEnd, value: targetIntensity },
        ]
      : [
          { time: phrase.startSeconds, value: state.intensity },
          { time: transitionEnd, value: targetIntensity },
        ];
    const colorKeyframes = darkReposition
      ? [
          { time: phrase.startSeconds, value: state.color },
          { time: darkAt, value: state.color },
          { time: revealAt, value: targetColor },
          { time: transitionEnd, value: targetColor },
        ]
      : [
          { time: phrase.startSeconds, value: state.color },
          { time: transitionEnd, value: targetColor },
        ];
    const angleKeyframes = darkReposition
      ? [
          { time: phrase.startSeconds, value: state.beamAngleDeg },
          { time: darkAt, value: state.beamAngleDeg },
          { time: revealAt, value: look.beamAngleDeg },
          { time: transitionEnd, value: look.beamAngleDeg },
        ]
      : [
          { time: phrase.startSeconds, value: state.beamAngleDeg },
          { time: transitionEnd, value: look.beamAngleDeg },
        ];
    const panKeyframes = darkReposition
      ? [
          { time: phrase.startSeconds, value: state.pan },
          { time: darkAt, value: state.pan },
          { time: revealAt, value: targetPan },
          { time: transitionEnd, value: targetPan },
        ]
      : [
          { time: phrase.startSeconds, value: state.pan },
          { time: transitionEnd, value: targetPan },
        ];
    const tiltKeyframes = darkReposition
      ? [
          { time: phrase.startSeconds, value: state.tilt },
          { time: darkAt, value: state.tilt },
          { time: revealAt, value: targetTilt },
          { time: transitionEnd, value: targetTilt },
        ]
      : [
          { time: phrase.startSeconds, value: state.tilt },
          { time: transitionEnd, value: targetTilt },
        ];

    cues.push({
      id: `p${phrase.index}-${groupName}-look-${fixture.id}`,
      sectionId: section.id,
      startSeconds: phrase.startSeconds,
      endSeconds: phrase.endSeconds,
      layer: 'section',
      priority: phrase.index,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: { blend: 'replace', effect: { op: 'curve', keyframes: intensityKeyframes } },
        color: { blend: 'replace', effect: { op: 'curve', keyframes: colorKeyframes } },
        beamAngleDeg: { blend: 'replace', effect: { op: 'curve', keyframes: angleKeyframes } },
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
        pan: { blend: 'replace', effect: { op: 'curve', keyframes: panKeyframes } },
        tilt: { blend: 'replace', effect: { op: 'curve', keyframes: tiltKeyframes } },
      },
    });

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
    const targetColor = groupName === 'front-floor' && index % 3 === 0 && phrase.style === 'climax-grid'
      ? LOOK.white
      : color;
    cues.push({
      id: `p${phrase.index}-${groupName}-look-${fixture.id}`,
      sectionId: section.id,
      startSeconds: phrase.startSeconds,
      endSeconds: phrase.endSeconds,
      layer: 'section',
      priority: phrase.index,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: phrase.startSeconds, value: state.intensity },
              { time: transitionEnd, value: intensity },
            ],
          },
        },
        color: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: phrase.startSeconds, value: state.color },
              { time: transitionEnd, value: targetColor },
            ],
          },
        },
        beamAngleDeg: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: phrase.startSeconds, value: state.beamAngleDeg },
              { time: transitionEnd, value: angle },
            ],
          },
        },
      },
    });
    state.intensity = intensity;
    state.color = targetColor;
    state.beamAngleDeg = angle;
  });
}

function addBassRiffAccents(
  cues: LightingCue[],
  sections: ShowSection[],
  events: SongEvent[],
  rear: RigFixtureSnapshot[],
  side: RigFixtureSnapshot[],
  frontFloor: RigFixtureSnapshot[],
  beat: number,
): void {
  const bassEvents = events
    .filter((event) => event.i === 'bass')
    .slice()
    .sort((a, b) => a.s - b.s || (a.n ?? 0) - (b.n ?? 0));
  const [rearLeft, rearRight] = splitHalves(rear);
  const [sideLeft, sideRight] = splitHalves(side);
  let lastTime = -Infinity;
  let hitIndex = 0;

  for (const event of bassEvents) {
    if (event.s - lastTime < 0.055) continue;
    lastTime = event.s;
    const velocity = clamp((Number(event.v) || 92) / 127, 0, 1);
    if (velocity < 0.24) continue;
    const section = sectionAt(sections, event.s);
    const anchor = hitIndex % 4 === 0 || velocity > 0.88;
    const left = hitIndex % 2 === 0;
    const selected = anchor
      ? [...rearLeft, ...rearRight]
      : left
        ? [...rearLeft, ...sideLeft]
        : [...rearRight, ...sideRight];
    const gain = anchor ? lerp(0.13, 0.22, velocity) : lerp(0.075, 0.15, velocity);
    addTransient(cues, section, selected, `bass-bite-${hitIndex}`, event.s, Math.max(0.085, beat * 0.22), gain);

    if (anchor) {
      addTransient(
        cues,
        section,
        frontFloor,
        `bass-anchor-floor-${hitIndex}`,
        event.s,
        Math.max(0.075, beat * 0.18),
        lerp(0.045, 0.095, velocity),
      );
    }
    hitIndex += 1;
  }
}

function addDrumAccents(
  cues: LightingCue[],
  sections: ShowSection[],
  events: SongEvent[],
  rear: RigFixtureSnapshot[],
  floor: RigFixtureSnapshot[],
  side: RigFixtureSnapshot[],
  front: RigFixtureSnapshot[],
  frontFloor: RigFixtureSnapshot[],
  allBeams: RigFixtureSnapshot[],
  beat: number,
): void {
  let kickIndex = 0;
  let snareIndex = 0;
  let crashIndex = 0;
  let lastKick = -Infinity;
  let lastSnare = -Infinity;
  let lastCrash = -Infinity;

  for (const event of events) {
    if (event.i !== 'drums') continue;
    const kind = drumKind(Number(event.n) || 0);
    const velocity = clamp((Number(event.v) || 90) / 127, 0, 1);
    const section = sectionAt(sections, event.s);

    if (kind === 'kick' && event.s - lastKick >= 0.045) {
      lastKick = event.s;
      addTransient(
        cues,
        section,
        [...floor, ...frontFloor],
        `kick-punch-${kickIndex++}`,
        event.s,
        Math.max(0.075, beat * 0.19),
        lerp(0.07, 0.16, velocity),
      );
      continue;
    }

    if (kind === 'snare' && event.s - lastSnare >= 0.055 && velocity > 0.42) {
      lastSnare = event.s;
      addTransient(
        cues,
        section,
        [...rear, ...side],
        `snare-cut-${snareIndex++}`,
        event.s,
        Math.max(0.10, beat * 0.28),
        lerp(0.14, 0.28, velocity),
        LOOK.white,
      );
      continue;
    }

    if (kind === 'crash' && event.s - lastCrash >= 0.12) {
      lastCrash = event.s;
      addTransient(
        cues,
        section,
        [...allBeams, ...front, ...frontFloor],
        `crash-open-${crashIndex++}`,
        event.s,
        Math.max(0.24, beat * 0.66),
        lerp(0.28, 0.50, velocity),
        LOOK.white,
      );
    }
  }
}

function addTransient(
  cues: LightingCue[],
  section: ShowSection,
  selected: RigFixtureSnapshot[],
  id: string,
  time: number,
  duration: number,
  gain: number,
  color?: string,
): void {
  const ids = [...new Set(selected.map((fixture) => fixture.id))];
  if (!ids.length) return;
  const start = clamp(time, section.startSeconds, Math.max(section.startSeconds, section.endSeconds - 0.002));
  const end = Math.min(section.endSeconds, start + Math.max(0.025, duration));
  if (end - start < 0.012) return;
  const attack = Math.min(0.022, (end - start) * 0.18);
  const peak = Math.min(end - 0.004, start + Math.max(0.006, attack));
  const channels: LightingCue['channels'] = {
    intensity: {
      blend: 'add',
      effect: {
        op: 'curve',
        keyframes: [
          { time: start, value: 0 },
          { time: peak, value: gain },
          { time: Math.max(peak + 0.002, end - 0.002), value: 0 },
        ],
      },
    },
  };
  if (color) {
    channels.color = { blend: 'replace', effect: { op: 'constant', value: color } };
  }

  cues.push({
    id,
    sectionId: section.id,
    startSeconds: start,
    endSeconds: end,
    layer: 'accent',
    priority: color ? 320 : 240,
    select: { ids, order: 'given' },
    fadeInSeconds: color ? Math.min(0.012, (end - start) * 0.12) : undefined,
    fadeOutSeconds: color ? Math.min(0.055, (end - start) * 0.42) : undefined,
    channels,
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
    ['intro', '序幕 · Bass Lock', '灯头锁住；低位暗红构图让 Bass riff 成为视觉重心'],
    ['groove-a', 'Groove A · Bite / Hold', '左右构图只在 phrase 边界换位，riff 本身用短促亮度 bite 回答'],
    ['groove-b', 'Groove B · Cross / Stagger', '增加静态 cross / stagger 构图；移动结束后立即 Hold'],
    ['break', 'Break · 收束', '降低亮度和覆盖；保留鼓组短促标点，不用持续漂移填空'],
    ['build', 'Build · Dark Reposition', '较大的 fan 换位在压暗期间完成，到位后重新亮出'],
    ['climax', 'Climax · Knife / Grid', '窄 Beam、宽构图、白色 backbeat / crash；效果瞬发，灯头仍以 Hold 为主'],
    ['outro', 'Outro · Shadow', '收回低位暗色构图，最后四拍显式淡黑'],
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

function splitHalves(fixturesToSplit: RigFixtureSnapshot[]): [RigFixtureSnapshot[], RigFixtureSnapshot[]] {
  if (fixturesToSplit.length <= 1) return [fixturesToSplit.slice(), fixturesToSplit.slice()];
  const middle = Math.ceil(fixturesToSplit.length / 2);
  return [fixturesToSplit.slice(0, middle), fixturesToSplit.slice(middle)];
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
