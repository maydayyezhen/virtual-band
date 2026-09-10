import type {
  FixtureState,
  LightingCue,
  RigFixtureSnapshot,
  RigSnapshot,
  ShowPlan,
  ShowSection,
  SongScore,
} from './contracts';
import {
  analyzeScoreForLighting,
  type LightingMusicAnalysis,
  type TextureWindow,
} from './MusicChoreographyAnalysis';
import {
  addDrumMappings,
  addHarmonicMoments,
  addPhraseMotion,
  addPitchedNoteMappings,
  type HomeMaps,
  type RigGroups,
} from './DustFullScoreMappings';

const LOOK = {
  blackRed: '#3d1118',
  red: '#9f2632',
  hotRed: '#c43b45',
  white: '#f5f1e8',
  steel: '#77818d',
  blueSteel: '#4f6076',
  warm: '#d9c2a3',
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

type BeamLook = { level: number; colorA: string; colorB: string; width: number; tilt: number; angle: number };
type SceneLook = {
  rear: BeamLook;
  floor: BeamLook;
  side: BeamLook;
  front: { level: number; color: string; angle: number };
  frontFloor: { level: number; color: string; angle: number };
  transitionBeats: number;
};

const SECTION_DEFS: Array<[string, string, string]> = [
  ['intro', 'Intro · Riff Foundation', '先建立低频空间，随后让其他声部逐渐进入灯光语言。'],
  ['verse-a', 'Verse A · Interlock', 'Bass、鼓、吉他各占不同空间层，音符互相咬合而不是只追鼓点。'],
  ['hook-a', 'Hook A · Expansion', '重复 riff 保持身份，但和声密度与旋律声部把空间逐步撑开。'],
  ['verse-b', 'Verse B · Counterweight', '保留前一段映射关系，同时把旋律方向和重心做镜像变奏。'],
  ['hook-b', 'Hook B · Full Register', '高低音区同时参与，pitch band 映射到不同空间层。'],
  ['breakdown', 'Breakdown · Exposed Layers', '减少底色，让 sustain、fill、旋律轮廓本身成为运动来源。'],
  ['rebuild', 'Rebuild · Density Stack', '按实际 MIDI 密度和声部能量逐层恢复空间。'],
  ['final', 'Final · Full Score', '全声部映射同时工作，phrase motion 与 note accents 叠加。'],
  ['outro', 'Outro · Release', '仍保留音符映射，但逐步降低宏观底色并明确淡黑。'],
];

const TARGET_FRACTIONS = [0, 0.10, 0.23, 0.35, 0.48, 0.60, 0.71, 0.82, 0.94, 1];

export function createDustFullScoreShowPlan(score: SongScore, rig: RigSnapshot): ShowPlan {
  const analysis = analyzeScoreForLighting(score);
  const sections = buildSections(score, analysis);
  const groups = groupRig(rig);
  const cues: LightingCue[] = [];
  const current = new Map<string, FixtureState>(
    rig.fixtures.map((fixture) => [fixture.id, { ...fixture.home, intensity: 0 }]),
  );
  const homes: HomeMaps = { pan: new Map(), tilt: new Map(), angle: new Map() };

  sections.forEach((section, index) => {
    const energy = sectionEnergy(analysis.textureWindows, section);
    const look = sceneLook(index, energy);
    const transitionEnd = Math.min(section.endSeconds - 0.01, section.startSeconds + analysis.beatSeconds * look.transitionBeats);

    addBaseBeamGroup(cues, current, homes, groups.rear, section, look.rear, transitionEnd, 'rear');
    addBaseBeamGroup(cues, current, homes, groups.floor, section, look.floor, transitionEnd, 'floor');
    addBaseBeamGroup(cues, current, homes, groups.side, section, look.side, transitionEnd, 'side');
    addBaseParGroup(cues, current, groups.front, section, look.front, transitionEnd, 'front');
    addBaseParGroup(cues, current, groups.frontFloor, section, look.frontFloor, transitionEnd, 'front-floor');

    // These curves are computed from every note in the bar-scale texture windows.
    addTextureDynamics(cues, analysis, section, groups.rear, look.rear.level, ['bass', 'upper', 'electric'], 'rear');
    addTextureDynamics(cues, analysis, section, groups.floor, look.floor.level, ['bass', 'lower', 'drums'], 'floor');
    addTextureDynamics(cues, analysis, section, groups.side, look.side.level, ['electric', 'guitar', 'upper'], 'side');
    addTextureDynamics(cues, analysis, section, groups.front, look.front.level, ['upper', 'guitar', 'lower'], 'front');
    addTextureDynamics(cues, analysis, section, groups.frontFloor, look.frontFloor.level, ['lower', 'guitar', 'drums'], 'front-floor');
  });

  addPhraseMotion(cues, analysis, sections, groups, homes);
  addPitchedNoteMappings(cues, analysis, sections, groups);
  addHarmonicMoments(cues, analysis, sections, groups);
  addDrumMappings(cues, analysis, sections, groups);
  addFinalBlackout(cues, current, sections, rig, score.duration, analysis.beatSeconds);

  const roleSummary = [...analysis.notesByRole.entries()].map(([role, notes]) => `${role}:${notes.length}`).join(' ');
  return {
    schemaVersion: '2.0-prototype',
    id: 'dust-full-score-mapping-v5',
    revision: 5,
    title: `${score.artist} · ${score.title}`,
    brief: `Full-score mapping：${analysis.mappedSourceEvents}/${analysis.sourceEvents} MIDI events；${analysis.phrases.length} phrases；${analysis.harmonicMoments.length} harmonic moments；${roleSummary}`,
    seed: 1980,
    baseLook: { intensity: 0 },
    sections,
    cues,
  };
}

function buildSections(score: SongScore, analysis: LightingMusicAnalysis): ShowSection[] {
  const bar = analysis.barSeconds;
  const marks: number[] = [0];
  for (let index = 1; index < TARGET_FRACTIONS.length - 1; index += 1) {
    const target = score.duration * TARGET_FRACTIONS[index]!;
    const snapped = nearestTextureBoundary(analysis.textureWindows, target, bar * 2.2);
    const previous = marks[marks.length - 1] ?? 0;
    const remaining = TARGET_FRACTIONS.length - 1 - index;
    const latest = score.duration - remaining * bar;
    marks.push(clamp(snapped, previous + bar, latest));
  }
  marks.push(score.duration);
  return SECTION_DEFS.map(([id, label, intent], index) => ({
    id,
    label,
    intent,
    startSeconds: marks[index] ?? 0,
    endSeconds: marks[index + 1] ?? score.duration,
  }));
}

function nearestTextureBoundary(windows: TextureWindow[], target: number, radius: number): number {
  let best = target;
  let bestScore = Infinity;
  for (let index = 1; index < windows.length; index += 1) {
    const left = windows[index - 1];
    const right = windows[index];
    if (!left || !right) continue;
    const boundary = right.startSeconds;
    const distance = Math.abs(boundary - target);
    if (distance > radius) continue;
    const energyDelta = Math.abs(right.energy01 - left.energy01);
    const roleDelta = roleDistributionDelta(left.roleEnergy, right.roleEnergy);
    const score = distance / Math.max(0.01, radius) - energyDelta * 0.75 - roleDelta * 0.45;
    if (score < bestScore) {
      bestScore = score;
      best = boundary;
    }
  }
  return best;
}

function roleDistributionDelta(a: Record<string, number>, b: Record<string, number>): number {
  const roles = new Set([...Object.keys(a), ...Object.keys(b)]);
  const totalA = Math.max(0.001, [...roles].reduce((sum, role) => sum + (a[role] ?? 0), 0));
  const totalB = Math.max(0.001, [...roles].reduce((sum, role) => sum + (b[role] ?? 0), 0));
  let delta = 0;
  for (const role of roles) delta += Math.abs((a[role] ?? 0) / totalA - (b[role] ?? 0) / totalB);
  return clamp(delta * 0.5, 0, 1);
}

function sceneLook(index: number, energy: number): SceneLook {
  const looks: SceneLook[] = [
    scene(0.22, 0.08, 0.12, 16, 10, 9, LOOK.blackRed, LOOK.red, LOOK.steel, 1.8),
    scene(0.34, 0.16, 0.22, 24, 18, 15, LOOK.red, LOOK.blackRed, LOOK.steel, 1.1),
    scene(0.46, 0.25, 0.31, 33, 26, 22, LOOK.red, LOOK.hotRed, LOOK.white, 0.9),
    scene(0.37, 0.19, 0.27, 28, 20, 19, LOOK.hotRed, LOOK.blackRed, LOOK.steel, 1.1),
    scene(0.54, 0.33, 0.39, 39, 32, 28, LOOK.hotRed, LOOK.red, LOOK.white, 0.8),
    scene(0.28, 0.13, 0.24, 21, 15, 24, LOOK.blueSteel, LOOK.blackRed, LOOK.white, 1.4),
    scene(0.47, 0.30, 0.36, 35, 29, 27, LOOK.red, LOOK.hotRed, LOOK.steel, 1.2),
    scene(0.68, 0.48, 0.55, 48, 42, 36, LOOK.hotRed, LOOK.red, LOOK.white, 0.75),
    scene(0.26, 0.11, 0.17, 18, 13, 11, LOOK.blackRed, LOOK.red, LOOK.steel, 1.8),
  ];
  const base = looks[index] ?? looks[looks.length - 1]!;
  const scale = lerp(0.80, 1.12, energy);
  return {
    ...base,
    rear: { ...base.rear, level: clamp(base.rear.level * scale, 0, 1) },
    floor: { ...base.floor, level: clamp(base.floor.level * scale, 0, 1) },
    side: { ...base.side, level: clamp(base.side.level * scale, 0, 1) },
    front: { ...base.front, level: clamp(base.front.level * lerp(0.88, 1.08, energy), 0, 1) },
    frontFloor: { ...base.frontFloor, level: clamp(base.frontFloor.level * scale, 0, 1) },
  };
}

function scene(
  rearLevel: number,
  floorLevel: number,
  sideLevel: number,
  rearWidth: number,
  floorWidth: number,
  sideWidth: number,
  colorA: string,
  colorB: string,
  accentColor: string,
  transitionBeats: number,
): SceneLook {
  return {
    rear: { level: rearLevel, colorA, colorB: accentColor, width: rearWidth, tilt: -25 + rearLevel * 8, angle: lerp(2.9, 1.7, rearLevel) },
    floor: { level: floorLevel, colorA: colorB, colorB: accentColor, width: floorWidth, tilt: 45 - floorLevel * 18, angle: lerp(3.2, 1.9, floorLevel) },
    side: { level: sideLevel, colorA: accentColor, colorB: colorA, width: sideWidth, tilt: -18 + sideLevel * 12, angle: lerp(3.5, 2.2, sideLevel) },
    front: { level: 0.11 + rearLevel * 0.34, color: rearLevel > 0.55 ? LOOK.white : LOOK.warm, angle: 24 },
    frontFloor: { level: 0.03 + floorLevel * 0.34, color: colorA, angle: 22 },
    transitionBeats,
  };
}

function addBaseBeamGroup(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  homes: HomeMaps,
  fixtures: RigFixtureSnapshot[],
  section: ShowSection,
  look: BeamLook,
  transitionEnd: number,
  group: string,
): void {
  fixtures.forEach((fixture, index) => {
    const state = current.get(fixture.id);
    if (!state) return;
    const pan = fan(index, fixtures.length, look.width) * (group === 'floor' ? -1 : 1);
    const color = index % 2 ? look.colorB : look.colorA;
    cues.push({
      id: `${group}-base-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'section',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.intensity }, { time: transitionEnd, value: look.level }] } },
        color: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.color }, { time: transitionEnd, value: color }] } },
        beamAngleDeg: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.beamAngleDeg }, { time: transitionEnd, value: look.angle }] } },
      },
    });
    cues.push({
      id: `${group}-home-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'motion',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.pan }, { time: transitionEnd, value: pan }] } },
        tilt: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.tilt }, { time: transitionEnd, value: look.tilt }] } },
      },
    });
    state.intensity = look.level;
    state.color = color;
    state.beamAngleDeg = look.angle;
    state.pan = pan;
    state.tilt = look.tilt;
    homes.pan.set(homeKey(section.id, fixture.id), pan);
    homes.tilt.set(homeKey(section.id, fixture.id), look.tilt);
    homes.angle.set(homeKey(section.id, fixture.id), look.angle);
  });
}

function addBaseParGroup(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  fixtures: RigFixtureSnapshot[],
  section: ShowSection,
  look: { level: number; color: string; angle: number },
  transitionEnd: number,
  group: string,
): void {
  fixtures.forEach((fixture) => {
    const state = current.get(fixture.id);
    if (!state) return;
    cues.push({
      id: `${group}-base-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'section',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.intensity }, { time: transitionEnd, value: look.level }] } },
        color: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.color }, { time: transitionEnd, value: look.color }] } },
        beamAngleDeg: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.beamAngleDeg }, { time: transitionEnd, value: look.angle }] } },
      },
    });
    state.intensity = look.level;
    state.color = look.color;
    state.beamAngleDeg = look.angle;
  });
}

function addTextureDynamics(
  cues: LightingCue[],
  analysis: LightingMusicAnalysis,
  section: ShowSection,
  fixtures: RigFixtureSnapshot[],
  baseLevel: number,
  roles: string[],
  label: string,
): void {
  if (!fixtures.length) return;
  const windows = analysis.textureWindows.filter((window) => window.endSeconds > section.startSeconds && window.startSeconds < section.endSeconds);
  if (!windows.length) return;
  const roleScale = Math.max(0.001, ...windows.map((window) => roles.reduce((sum, role) => sum + (window.roleEnergy[role] ?? 0), 0)));
  const keyframes: Array<{ time: number; value: number }> = [{ time: section.startSeconds, value: baseLevel }];
  for (const window of windows) {
    const roleEnergy = roles.reduce((sum, role) => sum + (window.roleEnergy[role] ?? 0), 0) / roleScale;
    const combined = clamp(window.energy01 * 0.55 + roleEnergy * 0.45, 0, 1);
    const time = clamp((window.startSeconds + window.endSeconds) * 0.5, section.startSeconds, section.endSeconds - 0.01);
    keyframes.push({ time, value: clamp(baseLevel * lerp(0.72, 1.26, combined), 0, 1) });
  }
  keyframes.push({ time: section.endSeconds - 0.01, value: baseLevel });
  cues.push({
    id: `${label}-texture-dynamics`,
    sectionId: section.id,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    layer: 'section',
    priority: 20,
    select: { ids: fixtures.map((fixture) => fixture.id), order: 'given' },
    channels: { intensity: { blend: 'replace', effect: { op: 'curve', keyframes } } },
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
  const fadeStart = Math.max(section.startSeconds, duration - beat * 6);
  for (const fixture of rig.fixtures) {
    const state = current.get(fixture.id);
    if (!state) continue;
    cues.push({
      id: `outro-black-${fixture.id}`,
      sectionId: section.id,
      startSeconds: fadeStart,
      endSeconds: duration,
      layer: 'section',
      priority: 100_000,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: {
          blend: 'replace',
          effect: { op: 'curve', keyframes: [{ time: fadeStart, value: state.intensity }, { time: Math.max(fadeStart + 0.01, duration - 0.02), value: 0 }] },
        },
      },
    });
  }
}

function groupRig(rig: RigSnapshot): RigGroups {
  const fixtures = rig.fixtures.slice().sort((a, b) => a.id.localeCompare(b.id));
  const beamGroup = (name: string): RigFixtureSnapshot[] => fixtures.filter((fixture) => fixture.type === 'beam' && fixture.groups.includes(name));
  return {
    rear: beamGroup('rear'),
    floor: beamGroup('floor'),
    side: beamGroup('side'),
    front: fixtures.filter((fixture) => fixture.type === 'par' && fixture.groups.includes('front') && !fixture.groups.includes('front-floor')),
    frontFloor: fixtures.filter((fixture) => fixture.type === 'par' && fixture.groups.includes('front-floor')),
    allBeams: fixtures.filter((fixture) => fixture.type === 'beam'),
  };
}

function sectionEnergy(windows: TextureWindow[], section: ShowSection): number {
  const active = windows.filter((window) => window.endSeconds > section.startSeconds && window.startSeconds < section.endSeconds);
  if (!active.length) return 0.35;
  return clamp(active.reduce((sum, window) => sum + window.energy01, 0) / active.length, 0, 1);
}

function fan(index: number, count: number, width: number): number {
  if (count <= 1) return 0;
  return lerp(-Math.abs(width), Math.abs(width), index / (count - 1));
}

function homeKey(sectionId: string, fixtureId: string): string {
  return `${sectionId}:${fixtureId}`;
}
