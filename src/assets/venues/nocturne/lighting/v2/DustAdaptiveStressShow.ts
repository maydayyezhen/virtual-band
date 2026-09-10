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

type BeamGroupLook = {
  level: number;
  idle: number;
  colorA: string;
  colorB: string;
  width: number;
  tilt: number;
  angle: number;
  active: 'inner' | 'outer' | 'alternating' | 'all';
};

type ParGroupLook = {
  level: number;
  color: string;
  angle: number;
};

type SceneLook = {
  rear: BeamGroupLook;
  floor: BeamGroupLook;
  side: BeamGroupLook;
  front: ParGroupLook;
  frontFloor: ParGroupLook;
  transitionBeats: number;
};

type RigGroups = {
  rear: RigFixtureSnapshot[];
  floor: RigFixtureSnapshot[];
  side: RigFixtureSnapshot[];
  front: RigFixtureSnapshot[];
  frontFloor: RigFixtureSnapshot[];
  allBeams: RigFixtureSnapshot[];
};

const SECTION_DEFS: Array<[string, string, string]> = [
  ['intro', 'Intro · The Riff Appears', '少量灯建立低频空间；不急着运动，让三音 Bass riff 成为舞台的重力。'],
  ['verse-a', 'Verse A · Stalk', '窄而偏侧的构图；动作像步伐，不像摇摆。'],
  ['hook-a', 'Hook A · Bites', '把“bite”做成空间咬合：扇面收拢、错位、再打开，而不是逐拍闪。'],
  ['verse-b', 'Verse B · Mirror', '保留第一段语法，但镜像位置和重心，制造重复中的变奏。'],
  ['hook-b', 'Hook B · Wider Teeth', '第二次 hook 扩大空间和白光比例，但仍保留暗部。'],
  ['breakdown', 'Breakdown · Swirl', '只有这里允许明显连续感：对应录音里的旋转/处理感，而不是全曲都在扫。'],
  ['rebuild', 'Rebuild · Layer By Layer', '从 Bass/鼓的底盘重新叠加灯组，一层层把舞台搭回来。'],
  ['final', 'Final · Arena Release', '前面克制换来的释放：宽 fan、交叉运动、少量白色重音。'],
  ['outro', 'Outro · Release', '动作逐渐停止，空间收回，最后明确淡黑。'],
];

const TARGET_FRACTIONS = [0, 0.11, 0.24, 0.34, 0.48, 0.59, 0.72, 0.82, 0.94, 1];

export function createDustAdaptiveStressShowPlan(score: SongScore, rig: RigSnapshot): ShowPlan {
  const beat = 60 / score.bpm;
  const bar = beat * 4;
  const sections = buildSongSpecificSections(score, bar);
  const groups = groupRig(rig);
  const cues: LightingCue[] = [];
  const current = new Map<string, FixtureState>(
    rig.fixtures.map((fixture) => [fixture.id, { ...fixture.home, intensity: 0 }]),
  );
  const homes = new Map<string, { pan: number; tilt: number }>();

  sections.forEach((section, sectionIndex) => {
    const look = sceneLook(sectionIndex);
    const transitionEnd = Math.min(
      section.endSeconds - 0.01,
      section.startSeconds + beat * look.transitionBeats,
    );

    addBaseBeamGroup(cues, current, homes, groups.rear, section, look.rear, transitionEnd, 'rear');
    addBaseBeamGroup(cues, current, homes, groups.floor, section, look.floor, transitionEnd, 'floor');
    addBaseBeamGroup(cues, current, homes, groups.side, section, look.side, transitionEnd, 'side');
    addBaseParGroup(cues, current, groups.front, section, look.front, transitionEnd, 'front');
    addBaseParGroup(cues, current, groups.frontFloor, section, look.frontFloor, transitionEnd, 'front-floor');

    switch (section.id) {
      case 'intro':
        addIntroRiffReveal(cues, score, section, groups, homes, beat, bar);
        break;
      case 'verse-a':
        addVerseStalk(cues, score, section, groups, homes, beat, bar, 1);
        break;
      case 'hook-a':
        addHookBite(cues, section, groups, homes, beat, bar, 1);
        break;
      case 'verse-b':
        addVerseStalk(cues, score, section, groups, homes, beat, bar, -1);
        break;
      case 'hook-b':
        addHookBite(cues, section, groups, homes, beat, bar, -1);
        break;
      case 'breakdown':
        addBreakdownSwirl(cues, score, section, groups, homes, beat, bar);
        break;
      case 'rebuild':
        addRebuild(cues, section, groups, homes, beat, bar);
        break;
      case 'final':
        addFinalRelease(cues, section, groups, homes, beat, bar);
        break;
      case 'outro':
        addOutroContraction(cues, section, groups, homes, beat, bar);
        break;
    }
  });

  addCrashPunctuation(cues, sections, groups.allBeams, beat);
  addFinalBlackout(cues, current, sections, rig, score.duration, beat);

  return {
    schemaVersion: '2.0-prototype',
    id: 'dust-directed-concert-v4',
    revision: 4,
    title: `${score.artist} · ${score.title}`,
    brief: '人工导演版：scene → phrase gesture → selective accent。以静止/运动对比、层次递进和 song-specific motif 为核心，不逐拍追灯。',
    seed: 1980,
    baseLook: { intensity: 0 },
    sections,
    cues,
  };
}

function groupRig(rig: RigSnapshot): RigGroups {
  const fixtures = rig.fixtures.slice().sort((a, b) => a.id.localeCompare(b.id));
  return {
    rear: fixtures.filter((fixture) => fixture.type === 'beam' && fixture.groups.includes('rear')),
    floor: fixtures.filter((fixture) => fixture.type === 'beam' && fixture.groups.includes('floor')),
    side: fixtures.filter((fixture) => fixture.type === 'beam' && fixture.groups.includes('side')),
    front: fixtures.filter(
      (fixture) =>
        fixture.type === 'par' &&
        fixture.groups.includes('front') &&
        !fixture.groups.includes('front-floor'),
    ),
    frontFloor: fixtures.filter(
      (fixture) => fixture.type === 'par' && fixture.groups.includes('front-floor'),
    ),
    allBeams: fixtures.filter((fixture) => fixture.type === 'beam'),
  };
}

function sceneLook(index: number): SceneLook {
  const looks: SceneLook[] = [
    {
      rear: beam(0.24, 0.008, LOOK.blackRed, LOOK.red, 12, -27, 2.7, 'inner'),
      floor: beam(0.06, 0.004, LOOK.blackRed, LOOK.blueSteel, 10, 46, 3.2, 'inner'),
      side: beam(0.08, 0.003, LOOK.steel, LOOK.red, 7, -19, 3.5, 'outer'),
      front: par(0.12, LOOK.warm, 26),
      frontFloor: par(0.025, LOOK.blackRed, 24),
      transitionBeats: 1.8,
    },
    {
      rear: beam(0.38, 0.012, LOOK.red, LOOK.blackRed, 24, -25, 2.35, 'inner'),
      floor: beam(0.12, 0.006, LOOK.blackRed, LOOK.red, 18, 42, 2.8, 'alternating'),
      side: beam(0.24, 0.008, LOOK.white, LOOK.red, 15, -16, 3.0, 'outer'),
      front: par(0.17, LOOK.warm, 25),
      frontFloor: par(0.055, LOOK.red, 23),
      transitionBeats: 1.0,
    },
    {
      rear: beam(0.56, 0.02, LOOK.red, LOOK.white, 38, -22, 2.0, 'all'),
      floor: beam(0.26, 0.01, LOOK.blackRed, LOOK.hotRed, 30, 37, 2.3, 'alternating'),
      side: beam(0.34, 0.012, LOOK.white, LOOK.red, 24, -13, 2.7, 'all'),
      front: par(0.22, LOOK.warm, 24),
      frontFloor: par(0.12, LOOK.red, 22),
      transitionBeats: 0.65,
    },
    {
      rear: beam(0.36, 0.01, LOOK.blackRed, LOOK.steel, 26, -24, 2.4, 'inner'),
      floor: beam(0.14, 0.006, LOOK.blueSteel, LOOK.red, 20, 41, 2.8, 'alternating'),
      side: beam(0.25, 0.008, LOOK.red, LOOK.white, 17, -15, 3.0, 'outer'),
      front: par(0.17, LOOK.warm, 25),
      frontFloor: par(0.06, LOOK.red, 23),
      transitionBeats: 1.0,
    },
    {
      rear: beam(0.62, 0.018, LOOK.red, LOOK.white, 43, -20, 1.9, 'all'),
      floor: beam(0.32, 0.012, LOOK.hotRed, LOOK.white, 34, 35, 2.15, 'all'),
      side: beam(0.38, 0.012, LOOK.white, LOOK.red, 28, -12, 2.55, 'all'),
      front: par(0.25, LOOK.white, 23),
      frontFloor: par(0.15, LOOK.hotRed, 21),
      transitionBeats: 0.6,
    },
    {
      rear: beam(0.28, 0.008, LOOK.blueSteel, LOOK.red, 18, -24, 2.6, 'inner'),
      floor: beam(0.08, 0.004, LOOK.blackRed, LOOK.blueSteel, 14, 45, 3.0, 'inner'),
      side: beam(0.34, 0.008, LOOK.steel, LOOK.white, 19, -12, 2.5, 'all'),
      front: par(0.13, LOOK.warm, 26),
      frontFloor: par(0.04, LOOK.blackRed, 24),
      transitionBeats: 1.6,
    },
    {
      rear: beam(0.40, 0.01, LOOK.red, LOOK.steel, 28, -24, 2.25, 'inner'),
      floor: beam(0.18, 0.007, LOOK.blackRed, LOOK.red, 22, 40, 2.6, 'alternating'),
      side: beam(0.22, 0.007, LOOK.white, LOOK.red, 17, -15, 2.9, 'outer'),
      front: par(0.17, LOOK.warm, 25),
      frontFloor: par(0.07, LOOK.red, 23),
      transitionBeats: 1.2,
    },
    {
      rear: beam(0.78, 0.024, LOOK.hotRed, LOOK.white, 52, -18, 1.7, 'all'),
      floor: beam(0.52, 0.016, LOOK.red, LOOK.white, 44, 31, 1.9, 'all'),
      side: beam(0.55, 0.016, LOOK.white, LOOK.hotRed, 36, -9, 2.25, 'all'),
      front: par(0.34, LOOK.white, 22),
      frontFloor: par(0.24, LOOK.hotRed, 20),
      transitionBeats: 0.55,
    },
    {
      rear: beam(0.24, 0.008, LOOK.blackRed, LOOK.steel, 16, -25, 2.7, 'inner'),
      floor: beam(0.07, 0.004, LOOK.blackRed, LOOK.blueSteel, 11, 46, 3.1, 'inner'),
      side: beam(0.12, 0.004, LOOK.steel, LOOK.red, 9, -18, 3.3, 'outer'),
      front: par(0.11, LOOK.warm, 26),
      frontFloor: par(0.03, LOOK.blackRed, 24),
      transitionBeats: 1.4,
    },
  ];
  return looks[index] ?? looks[looks.length - 1]!;
}

function beam(
  level: number,
  idle: number,
  colorA: string,
  colorB: string,
  width: number,
  tilt: number,
  angle: number,
  active: BeamGroupLook['active'],
): BeamGroupLook {
  return { level, idle, colorA, colorB, width, tilt, angle, active };
}

function par(level: number, color: string, angle: number): ParGroupLook {
  return { level, color, angle };
}

function addBaseBeamGroup(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  homes: Map<string, { pan: number; tilt: number }>,
  selected: RigFixtureSnapshot[],
  section: ShowSection,
  look: BeamGroupLook,
  transitionEnd: number,
  groupName: string,
): void {
  selected.forEach((fixture, index) => {
    const state = current.get(fixture.id);
    if (!state) return;
    const active = fixtureActive(index, selected.length, look.active);
    const targetIntensity = active ? look.level : look.idle;
    const targetPan = fan(index, selected.length, look.width) * (groupName === 'floor' ? -1 : 1);
    const targetColor = index % 2 ? look.colorB : look.colorA;

    cues.push({
      id: `${section.id}-${groupName}-base-look-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'section',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: section.startSeconds, value: state.intensity },
              { time: transitionEnd, value: targetIntensity },
            ],
          },
        },
        color: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: section.startSeconds, value: state.color },
              { time: transitionEnd, value: targetColor },
            ],
          },
        },
        beamAngleDeg: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: section.startSeconds, value: state.beamAngleDeg },
              { time: transitionEnd, value: look.angle },
            ],
          },
        },
      },
    });

    cues.push({
      id: `${section.id}-${groupName}-base-position-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'motion',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: section.startSeconds, value: state.pan },
              { time: transitionEnd, value: targetPan },
            ],
          },
        },
        tilt: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: section.startSeconds, value: state.tilt },
              { time: transitionEnd, value: look.tilt },
            ],
          },
        },
      },
    });

    state.intensity = targetIntensity;
    state.color = targetColor;
    state.beamAngleDeg = look.angle;
    state.pan = targetPan;
    state.tilt = look.tilt;
    homes.set(`${section.id}:${fixture.id}`, { pan: targetPan, tilt: look.tilt });
  });
}

function addBaseParGroup(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  selected: RigFixtureSnapshot[],
  section: ShowSection,
  look: ParGroupLook,
  transitionEnd: number,
  groupName: string,
): void {
  selected.forEach((fixture) => {
    const state = current.get(fixture.id);
    if (!state) return;

    cues.push({
      id: `${section.id}-${groupName}-base-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'section',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: section.startSeconds, value: state.intensity },
              { time: transitionEnd, value: look.level },
            ],
          },
        },
        color: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: section.startSeconds, value: state.color },
              { time: transitionEnd, value: look.color },
            ],
          },
        },
        beamAngleDeg: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: section.startSeconds, value: state.beamAngleDeg },
              { time: transitionEnd, value: look.angle },
            ],
          },
        },
      },
    });

    state.intensity = look.level;
    state.color = look.color;
    state.beamAngleDeg = look.angle;
  });
}

function addIntroRiffReveal(
  cues: LightingCue[],
  score: SongScore,
  section: ShowSection,
  groups: RigGroups,
  homes: Map<string, { pan: number; tilt: number }>,
  beat: number,
  bar: number,
): void {
  const bassStarts = score.events
    .filter((event) => event.i === 'bass' && event.s >= section.startSeconds && event.s < section.endSeconds)
    .slice(0, 4)
    .map((event) => event.s);

  const revealTimes = bassStarts.length >= 3
    ? bassStarts
    : [section.startSeconds + beat, section.startSeconds + beat * 2.5, section.startSeconds + bar * 1.5];

  const pairs = [
    selectInnerPair(groups.rear),
    selectInnerPair(groups.floor),
    selectOuterPair(groups.side),
  ];

  pairs.forEach((fixtures, index) => {
    const start = clamp(
      revealTimes[Math.min(index, revealTimes.length - 1)] ?? section.startSeconds + beat * (index + 1),
      section.startSeconds,
      section.endSeconds - 0.05,
    );
    const end = Math.min(section.endSeconds - 0.01, start + beat * 1.4);
    addIntensityArc(cues, section, fixtures, start, end, 0.10 + index * 0.025, `intro-layer-${index}`);
  });

  const motionStart = Math.min(section.endSeconds - beat * 1.2, section.startSeconds + bar * 2);
  if (motionStart > section.startSeconds) {
    addPushHoldRelease(
      cues,
      section,
      selectInnerPair(groups.rear),
      homes,
      motionStart,
      Math.min(section.endSeconds - 0.01, motionStart + bar * 1.5),
      5,
      -1.5,
      'intro-riff-lean',
      1,
    );
  }
}

function addVerseStalk(
  cues: LightingCue[],
  score: SongScore,
  section: ShowSection,
  groups: RigGroups,
  homes: Map<string, { pan: number; tilt: number }>,
  beat: number,
  bar: number,
  mirror: number,
): void {
  let phrase = 0;
  for (let start = section.startSeconds + beat * 1.5; start + bar * 1.2 < section.endSeconds; start += bar * 4) {
    const end = Math.min(section.endSeconds - 0.01, start + bar * 2.2);
    const density = roleDensity(score.events, start, Math.min(end, start + bar * 2), 'bass');
    const amount = lerp(5.5, 9.5, clamp(density / 5, 0, 1));

    const sidePair = selectPair(groups.side, phrase);
    const rearPair = selectPair(groups.rear, phrase + 1);

    addPushHoldRelease(
      cues,
      section,
      sidePair,
      homes,
      start,
      end,
      amount * mirror,
      -2.3,
      `verse-side-step-${phrase}`,
      phrase,
    );

    const rearStart = start + beat * 1.4;
    addPushHoldRelease(
      cues,
      section,
      rearPair,
      homes,
      rearStart,
      Math.min(end, rearStart + bar * 1.45),
      -amount * 0.58 * mirror,
      1.4,
      `verse-rear-answer-${phrase}`,
      phrase + 10,
    );

    addIntensityArc(
      cues,
      section,
      [...sidePair, ...rearPair],
      start + beat * 0.35,
      Math.min(end, start + bar * 1.3),
      0.055,
      `verse-breath-${phrase}`,
    );
    phrase += 1;
  }
}

function addHookBite(
  cues: LightingCue[],
  section: ShowSection,
  groups: RigGroups,
  homes: Map<string, { pan: number; tilt: number }>,
  beat: number,
  bar: number,
  mirror: number,
): void {
  let phrase = 0;
  for (let start = section.startSeconds + beat * 0.35; start + bar * 1.5 < section.endSeconds; start += bar * 4) {
    const closeEnd = Math.min(section.endSeconds - 0.01, start + bar * 1.65);

    addFanClampRelease(
      cues,
      section,
      groups.rear,
      homes,
      start,
      closeEnd,
      0.42,
      12 * mirror,
      `hook-rear-bite-${phrase}`,
      phrase,
    );

    const floorStart = start + beat * 0.8;
    addFanClampRelease(
      cues,
      section,
      groups.floor,
      homes,
      floorStart,
      Math.min(section.endSeconds - 0.01, floorStart + bar * 1.45),
      0.55,
      -9 * mirror,
      `hook-floor-bite-${phrase}`,
      phrase + 20,
    );

    addDominoLift(
      cues,
      section,
      groups.rear,
      start + beat * 0.15,
      Math.min(section.endSeconds - 0.01, start + beat * 2.2),
      0.13,
      `hook-domino-${phrase}`,
      mirror < 0,
    );

    const sideStart = start + bar * 1.9;
    if (sideStart + beat * 1.2 < section.endSeconds) {
      addPushHoldRelease(
        cues,
        section,
        groups.side,
        homes,
        sideStart,
        Math.min(section.endSeconds - 0.01, sideStart + bar * 1.2),
        7 * mirror,
        -2,
        `hook-side-release-${phrase}`,
        phrase + 40,
      );
    }
    phrase += 1;
  }
}

function addBreakdownSwirl(
  cues: LightingCue[],
  score: SongScore,
  section: ShowSection,
  groups: RigGroups,
  homes: Map<string, { pan: number; tilt: number }>,
  beat: number,
  bar: number,
): void {
  const electricDensity = roleDensity(score.events, section.startSeconds, section.endSeconds, 'electric')
    + roleDensity(score.events, section.startSeconds, section.endSeconds, 'guitar');
  const scale = clamp(0.8 + electricDensity / 60, 0.8, 1.25);

  let phrase = 0;
  for (let start = section.startSeconds + beat; start + bar * 2.8 < section.endSeconds; start += bar * 4) {
    const end = Math.min(section.endSeconds - 0.01, start + bar * 3.25);
    addOrbitPhrase(
      cues,
      section,
      groups.side,
      homes,
      start,
      end,
      15 * scale * (phrase % 2 ? -1 : 1),
      4.5 * scale,
      `breakdown-side-orbit-${phrase}`,
      phrase,
    );

    const rearPair = selectInnerPair(groups.rear);
    addOrbitPhrase(
      cues,
      section,
      rearPair,
      homes,
      start + beat * 1.2,
      Math.min(end, start + bar * 2.8),
      -7 * scale * (phrase % 2 ? -1 : 1),
      2.2 * scale,
      `breakdown-rear-shadow-${phrase}`,
      phrase + 20,
    );

    addIntensityArc(
      cues,
      section,
      groups.side,
      start + bar * 0.7,
      Math.min(end, start + bar * 2.6),
      0.07,
      `breakdown-side-glow-${phrase}`,
    );
    phrase += 1;
  }
}

function addRebuild(
  cues: LightingCue[],
  section: ShowSection,
  groups: RigGroups,
  homes: Map<string, { pan: number; tilt: number }>,
  beat: number,
  bar: number,
): void {
  const duration = section.endSeconds - section.startSeconds;
  const starts = [
    section.startSeconds + duration * 0.10,
    section.startSeconds + duration * 0.28,
    section.startSeconds + duration * 0.46,
    section.startSeconds + duration * 0.64,
  ];
  const layers: Array<[RigFixtureSnapshot[], number, string]> = [
    [selectInnerPair(groups.rear), 0.08, 'rear'],
    [selectInnerPair(groups.floor), 0.07, 'floor'],
    [selectOuterPair(groups.side), 0.08, 'side'],
    [groups.rear, 0.10, 'rear-full'],
  ];

  layers.forEach(([fixtures, gain, label], index) => {
    const start = starts[index] ?? section.startSeconds;
    const end = Math.min(section.endSeconds - 0.01, start + bar * 2);
    addIntensityArc(cues, section, fixtures, start, end, gain, `rebuild-${label}-${index}`);
  });

  const moveStart = Math.min(section.endSeconds - bar * 1.6, section.startSeconds + duration * 0.52);
  if (moveStart > section.startSeconds) {
    addFanClampRelease(
      cues,
      section,
      groups.rear,
      homes,
      moveStart,
      Math.min(section.endSeconds - 0.01, moveStart + bar * 2.5),
      1.35,
      10,
      'rebuild-open',
      1,
    );
  }
}

function addFinalRelease(
  cues: LightingCue[],
  section: ShowSection,
  groups: RigGroups,
  homes: Map<string, { pan: number; tilt: number }>,
  beat: number,
  bar: number,
): void {
  let phrase = 0;
  for (let start = section.startSeconds + beat * 0.25; start + bar * 1.6 < section.endSeconds; start += bar * 4) {
    const end = Math.min(section.endSeconds - 0.01, start + bar * 2.4);
    const direction = phrase % 2 ? -1 : 1;

    addCrossPhrase(
      cues,
      section,
      groups.rear,
      groups.floor,
      homes,
      start,
      end,
      13 * direction,
      `final-cross-${phrase}`,
      phrase,
    );

    const sideStart = start + bar * 1.4;
    addPushHoldRelease(
      cues,
      section,
      groups.side,
      homes,
      sideStart,
      Math.min(section.endSeconds - 0.01, sideStart + bar * 1.4),
      10 * direction,
      -3.2,
      `final-side-slice-${phrase}`,
      phrase + 30,
    );

    addIntensityArc(
      cues,
      section,
      groups.allBeams,
      start + beat * 0.2,
      Math.min(end, start + beat * 2.8),
      0.09,
      `final-arena-lift-${phrase}`,
    );
    phrase += 1;
  }
}

function addOutroContraction(
  cues: LightingCue[],
  section: ShowSection,
  groups: RigGroups,
  homes: Map<string, { pan: number; tilt: number }>,
  beat: number,
  bar: number,
): void {
  const start = Math.min(section.endSeconds - bar * 1.1, section.startSeconds + beat);
  if (start <= section.startSeconds) return;
  const end = Math.min(section.endSeconds - beat * 0.6, start + bar * 1.7);

  addFanClampRelease(
    cues,
    section,
    groups.rear,
    homes,
    start,
    end,
    0.28,
    -4,
    'outro-contract-rear',
    0,
    false,
  );
  addFanClampRelease(
    cues,
    section,
    groups.floor,
    homes,
    start + beat * 0.6,
    Math.min(section.endSeconds - 0.02, end + beat * 0.5),
    0.35,
    3,
    'outro-contract-floor',
    1,
    false,
  );
}

function addPushHoldRelease(
  cues: LightingCue[],
  section: ShowSection,
  selected: RigFixtureSnapshot[],
  homes: Map<string, { pan: number; tilt: number }>,
  start: number,
  end: number,
  panAmount: number,
  tiltAmount: number,
  label: string,
  seed: number,
): void {
  if (end <= start + 0.05) return;
  const t1 = lerp(start, end, 0.23);
  const t2 = lerp(start, end, 0.58);
  const t3 = lerp(start, end, 0.78);

  selected.forEach((fixture, index) => {
    const home = homes.get(`${section.id}:${fixture.id}`) ?? { pan: fixture.home.pan, tilt: fixture.home.tilt };
    const sign = (index + seed) % 2 ? -1 : 1;
    cues.push({
      id: `${section.id}-${label}-${seed}-${fixture.id}`,
      sectionId: section.id,
      startSeconds: start,
      endSeconds: end,
      layer: 'motion',
      priority: 100 + seed,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: start, value: home.pan },
              { time: t1, value: home.pan + panAmount * sign },
              { time: t2, value: home.pan + panAmount * sign },
              { time: t3, value: home.pan + panAmount * 0.25 * sign },
              { time: end - 0.004, value: home.pan },
            ],
          },
        },
        tilt: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: start, value: home.tilt },
              { time: t1, value: home.tilt + tiltAmount },
              { time: t2, value: home.tilt + tiltAmount },
              { time: end - 0.004, value: home.tilt },
            ],
          },
        },
      },
    });
  });
}

function addFanClampRelease(
  cues: LightingCue[],
  section: ShowSection,
  selected: RigFixtureSnapshot[],
  homes: Map<string, { pan: number; tilt: number }>,
  start: number,
  end: number,
  clampScale: number,
  overshoot: number,
  label: string,
  seed: number,
  returnHome = true,
): void {
  if (end <= start + 0.05) return;
  const t1 = lerp(start, end, 0.24);
  const t2 = lerp(start, end, 0.48);
  const t3 = lerp(start, end, 0.72);

  selected.forEach((fixture, index) => {
    const home = homes.get(`${section.id}:${fixture.id}`) ?? { pan: fixture.home.pan, tilt: fixture.home.tilt };
    const sign = index < selected.length / 2 ? -1 : 1;
    const clamped = home.pan * clampScale;
    const opened = home.pan + overshoot * sign;

    cues.push({
      id: `${section.id}-${label}-${seed}-${fixture.id}`,
      sectionId: section.id,
      startSeconds: start,
      endSeconds: end,
      layer: 'motion',
      priority: 260 + seed,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: start, value: home.pan },
              { time: t1, value: clamped },
              { time: t2, value: clamped },
              { time: t3, value: opened },
              { time: end - 0.004, value: returnHome ? home.pan : clamped },
            ],
          },
        },
        tilt: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: start, value: home.tilt },
              { time: t1, value: home.tilt + 2.5 },
              { time: t2, value: home.tilt + 2.5 },
              { time: t3, value: home.tilt - 1.2 },
              { time: end - 0.004, value: home.tilt },
            ],
          },
        },
      },
    });
  });
}

function addOrbitPhrase(
  cues: LightingCue[],
  section: ShowSection,
  selected: RigFixtureSnapshot[],
  homes: Map<string, { pan: number; tilt: number }>,
  start: number,
  end: number,
  panAmount: number,
  tiltAmount: number,
  label: string,
  seed: number,
): void {
  if (end <= start + 0.05) return;
  const t1 = lerp(start, end, 0.20);
  const t2 = lerp(start, end, 0.45);
  const t3 = lerp(start, end, 0.70);
  const t4 = lerp(start, end, 0.86);

  selected.forEach((fixture, index) => {
    const home = homes.get(`${section.id}:${fixture.id}`) ?? { pan: fixture.home.pan, tilt: fixture.home.tilt };
    const sign = (index + seed) % 2 ? -1 : 1;
    cues.push({
      id: `${section.id}-${label}-${seed}-${fixture.id}`,
      sectionId: section.id,
      startSeconds: start,
      endSeconds: end,
      layer: 'motion',
      priority: 500 + seed,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: start, value: home.pan },
              { time: t1, value: home.pan + panAmount * sign },
              { time: t2, value: home.pan + panAmount * 0.35 * sign },
              { time: t3, value: home.pan - panAmount * 0.72 * sign },
              { time: t4, value: home.pan - panAmount * 0.18 * sign },
              { time: end - 0.004, value: home.pan },
            ],
          },
        },
        tilt: {
          blend: 'replace',
          effect: {
            op: 'curve',
            keyframes: [
              { time: start, value: home.tilt },
              { time: t1, value: home.tilt - tiltAmount },
              { time: t2, value: home.tilt + tiltAmount * 0.35 },
              { time: t3, value: home.tilt + tiltAmount },
              { time: t4, value: home.tilt - tiltAmount * 0.2 },
              { time: end - 0.004, value: home.tilt },
            ],
          },
        },
      },
    });
  });
}

function addCrossPhrase(
  cues: LightingCue[],
  section: ShowSection,
  rear: RigFixtureSnapshot[],
  floor: RigFixtureSnapshot[],
  homes: Map<string, { pan: number; tilt: number }>,
  start: number,
  end: number,
  amount: number,
  label: string,
  seed: number,
): void {
  addPushHoldRelease(cues, section, rear, homes, start, end, amount, -3.1, `${label}-rear`, seed);
  const floorStart = start + (end - start) * 0.16;
  addPushHoldRelease(
    cues,
    section,
    floor,
    homes,
    floorStart,
    end,
    -amount * 0.82,
    4.2,
    `${label}-floor`,
    seed + 1,
  );
}

function addDominoLift(
  cues: LightingCue[],
  section: ShowSection,
  selected: RigFixtureSnapshot[],
  start: number,
  end: number,
  gain: number,
  label: string,
  reverse: boolean,
): void {
  if (!selected.length || end <= start + 0.05) return;
  const ordered = reverse ? selected.slice().reverse() : selected.slice();
  const span = end - start;

  ordered.forEach((fixture, index) => {
    const offset = span * 0.34 * (index / Math.max(1, ordered.length - 1));
    const localStart = start + offset;
    const peak = Math.min(end - 0.025, localStart + span * 0.20);
    const hold = Math.min(end - 0.012, peak + span * 0.18);

    cues.push({
      id: `${section.id}-${label}-${index}-${fixture.id}`,
      sectionId: section.id,
      startSeconds: localStart,
      endSeconds: end,
      layer: 'accent',
      priority: 220,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: {
          blend: 'add',
          effect: {
            op: 'curve',
            keyframes: [
              { time: localStart, value: 0 },
              { time: peak, value: gain },
              { time: hold, value: gain * 0.72 },
              { time: end - 0.004, value: 0 },
            ],
          },
        },
      },
    });
  });
}

function addIntensityArc(
  cues: LightingCue[],
  section: ShowSection,
  selected: RigFixtureSnapshot[],
  start: number,
  end: number,
  gain: number,
  label: string,
): void {
  const ids = [...new Set(selected.map((fixture) => fixture.id))];
  if (!ids.length || end <= start + 0.05) return;
  const t1 = lerp(start, end, 0.28);
  const t2 = lerp(start, end, 0.68);

  cues.push({
    id: `${section.id}-${label}`,
    sectionId: section.id,
    startSeconds: start,
    endSeconds: end,
    layer: 'accent',
    priority: 90,
    select: { ids, order: 'given' },
    channels: {
      intensity: {
        blend: 'add',
        effect: {
          op: 'curve',
          keyframes: [
            { time: start, value: 0 },
            { time: t1, value: gain },
            { time: t2, value: gain * 0.72 },
            { time: end - 0.004, value: 0 },
          ],
        },
      },
    },
  });
}

function addCrashPunctuation(
  cues: LightingCue[],
  sections: ShowSection[],
  allBeams: RigFixtureSnapshot[],
  beat: number,
): void {
  const ids = allBeams.map((fixture) => fixture.id);
  if (!ids.length) return;

  for (const section of sections) {
    cues.push({
      id: `${section.id}-crash-punctuation`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'accent',
      priority: 800,
      select: { ids, order: 'given' },
      channels: {
        intensity: {
          blend: 'add',
          effect: {
            op: 'eventEnvelope',
            roleIds: ['drums'],
            noteNumbers: [49, 52, 55, 57],
            attackSeconds: 0.006,
            decaySeconds: Math.max(0.18, beat * 0.48),
            gain: section.id === 'final' ? 0.24 : 0.15,
            reducer: 'max',
          },
        },
      },
    });
  }
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
  const fadeStart = Math.max(section.startSeconds, duration - beat * 4.5);

  for (const fixture of rig.fixtures) {
    const state = current.get(fixture.id);
    if (!state) continue;
    cues.push({
      id: `${section.id}-blackout-${fixture.id}`,
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

function buildSongSpecificSections(score: SongScore, bar: number): ShowSection[] {
  const marks: number[] = [0];
  for (let index = 1; index < TARGET_FRACTIONS.length - 1; index += 1) {
    const target = score.duration * TARGET_FRACTIONS[index]!;
    const previous = marks[marks.length - 1] ?? 0;
    const min = previous + bar * 2;
    const remaining = TARGET_FRACTIONS.length - 1 - index;
    const max = score.duration - remaining * bar * 2;
    marks.push(findBoundaryNear(score.events, target, bar, min, max));
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

function findBoundaryNear(
  events: SongEvent[],
  target: number,
  bar: number,
  min: number,
  max: number,
): number {
  let best = clamp(Math.round(target / bar) * bar, min, max);
  let bestScore = -Infinity;

  for (let delta = -2; delta <= 2; delta += 1) {
    const candidate = clamp(Math.round(target / bar) * bar + delta * bar, min, max);
    const score = boundaryContrast(events, candidate, bar) - Math.abs(candidate - target) / Math.max(0.001, bar) * 0.08;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function boundaryContrast(events: SongEvent[], time: number, bar: number): number {
  const before = roleVector(events, time - bar, time);
  const after = roleVector(events, time, time + bar);
  const roles = new Set([...before.keys(), ...after.keys()]);
  let contrast = 0;
  let beforeTotal = 0;
  let afterTotal = 0;

  for (const value of before.values()) beforeTotal += value;
  for (const value of after.values()) afterTotal += value;

  for (const role of roles) {
    const a = (before.get(role) ?? 0) / Math.max(0.001, beforeTotal);
    const b = (after.get(role) ?? 0) / Math.max(0.001, afterTotal);
    contrast += Math.abs(a - b);
  }
  contrast += Math.abs(beforeTotal - afterTotal) / Math.max(1, beforeTotal + afterTotal);
  return contrast;
}

function roleVector(events: SongEvent[], start: number, end: number): Map<string, number> {
  const result = new Map<string, number>();
  for (const event of events) {
    if (event.s < start || event.s >= end) continue;
    const role = event.i || 'other';
    const velocity = clamp((Number(event.v) || 90) / 127, 0, 1);
    const weight = role === 'bass' ? 1.15 : role === 'drums' ? 1.05 : role === 'electric' ? 0.95 : 0.8;
    result.set(role, (result.get(role) ?? 0) + velocity * weight);
  }
  return result;
}

function roleDensity(events: SongEvent[], start: number, end: number, role: string): number {
  let count = 0;
  for (const event of events) {
    if (event.s >= start && event.s < end && event.i === role) count += 1;
  }
  return count / Math.max(0.25, end - start);
}

function fixtureActive(index: number, count: number, mode: BeamGroupLook['active']): boolean {
  if (mode === 'all') return true;
  if (mode === 'alternating') return index % 2 === 0;
  if (mode === 'inner') return Math.abs(index - (count - 1) / 2) <= Math.max(0.6, count * 0.24);
  return index === 0 || index === count - 1;
}

function selectInnerPair(fixtures: RigFixtureSnapshot[]): RigFixtureSnapshot[] {
  if (fixtures.length <= 2) return fixtures;
  const center = (fixtures.length - 1) / 2;
  return fixtures
    .slice()
    .sort((a, b) => {
      const ai = fixtures.indexOf(a);
      const bi = fixtures.indexOf(b);
      return Math.abs(ai - center) - Math.abs(bi - center);
    })
    .slice(0, 2);
}

function selectOuterPair(fixtures: RigFixtureSnapshot[]): RigFixtureSnapshot[] {
  if (fixtures.length <= 2) return fixtures;
  return [fixtures[0], fixtures[fixtures.length - 1]].filter(
    (fixture): fixture is RigFixtureSnapshot => Boolean(fixture),
  );
}

function selectPair(fixtures: RigFixtureSnapshot[], sequence: number): RigFixtureSnapshot[] {
  if (fixtures.length <= 2) return fixtures;
  const half = Math.ceil(fixtures.length / 2);
  const left = sequence % half;
  const right = fixtures.length - 1 - left;
  const pair = [fixtures[left], fixtures[right]].filter(
    (fixture): fixture is RigFixtureSnapshot => Boolean(fixture),
  );
  return [...new Map(pair.map((fixture) => [fixture.id, fixture])).values()];
}

function fan(index: number, count: number, width: number): number {
  if (count <= 1) return 0;
  return lerp(-Math.abs(width), Math.abs(width), index / (count - 1));
}
