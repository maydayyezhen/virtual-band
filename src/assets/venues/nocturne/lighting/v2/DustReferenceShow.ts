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
  red: '#b8323c',
  deepRed: '#631821',
  white: '#f4f0e7',
  steel: '#788391',
  blue: '#465a78',
  warm: '#e3c9a4',
};

export async function decodeLegacyDustScore(bytes: Uint8Array): Promise<SongScore> {
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持 gzip 解压');
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = await new Response(stream).text();
  const parsed = JSON.parse(raw) as {
    title?: string;
    artist?: string;
    bpm?: number | string;
    duration?: number;
    events?: SongEvent[];
  };

  const duration = Number(parsed.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(parsed.events)) {
    throw new Error('Dust MIDI 数据格式无效');
  }

  const bpmMatch = String(parsed.bpm ?? '').match(/[\d.]+/);
  const bpm = bpmMatch ? Number(bpmMatch[0]) : 108;
  const events = parsed.events
    .map((event) => ({
      ...event,
      s: Math.max(0, Number(event.s) || 0),
      e: Number.isFinite(Number(event.e)) ? Number(event.e) : undefined,
      v: Number.isFinite(Number(event.v)) ? Number(event.v) : undefined,
      n: Number.isFinite(Number(event.n)) ? Number(event.n) : undefined,
      i: event.i ? String(event.i) : 'other',
    }))
    .filter((event) => event.s <= duration + 0.1)
    .sort((a, b) => a.s - b.s || (a.n ?? 0) - (b.n ?? 0));

  return {
    title: parsed.title || 'Another One Bites the Dust',
    artist: parsed.artist || 'Queen',
    bpm: Number.isFinite(bpm) && bpm > 20 ? bpm : 108,
    duration,
    events,
  };
}

export function createDustReferenceShowPlan(score: SongScore, rig: RigSnapshot): ShowPlan {
  const beat = 60 / score.bpm;
  const sections = buildSections(score.duration, beat);
  const cues: LightingCue[] = [];
  const current = new Map<string, FixtureState>(rig.fixtures.map((fixture) => [fixture.id, { ...fixture.home }]));

  const rear = fixtures(rig, 'beam', 'rear');
  const floor = fixtures(rig, 'beam', 'floor');
  const side = fixtures(rig, 'beam', 'side');
  const allBeams = rig.fixtures.filter((fixture) => fixture.type === 'beam');
  const front = rig.fixtures.filter((fixture) => fixture.type === 'par' && fixture.groups.includes('front') && !fixture.groups.includes('front-floor'));
  const frontFloor = fixtures(rig, 'par', 'front-floor');

  const looks: Array<{
    rear: [string, string, number];
    floor: [string, string, number];
    side: [string, string, number];
    front: [string, string, number];
    frontFloor: [string, string, number];
    transitionBeats: number;
  }> = [
    { rear: [LOOK.steel, LOOK.blue, 0.13], floor: [LOOK.deepRed, LOOK.blue, 0.045], side: [LOOK.white, LOOK.steel, 0.07], front: [LOOK.warm, LOOK.warm, 0.18], frontFloor: [LOOK.deepRed, LOOK.red, 0.04], transitionBeats: 3 },
    { rear: [LOOK.deepRed, LOOK.red, 0.34], floor: [LOOK.deepRed, LOOK.red, 0.18], side: [LOOK.white, LOOK.red, 0.16], front: [LOOK.warm, LOOK.warm, 0.22], frontFloor: [LOOK.red, LOOK.deepRed, 0.10], transitionBeats: 2 },
    { rear: [LOOK.red, LOOK.steel, 0.44], floor: [LOOK.red, LOOK.deepRed, 0.27], side: [LOOK.white, LOOK.red, 0.22], front: [LOOK.warm, LOOK.white, 0.24], frontFloor: [LOOK.red, LOOK.steel, 0.14], transitionBeats: 3 },
    { rear: [LOOK.blue, LOOK.steel, 0.13], floor: [LOOK.deepRed, LOOK.blue, 0.06], side: [LOOK.white, LOOK.blue, 0.09], front: [LOOK.warm, LOOK.warm, 0.13], frontFloor: [LOOK.deepRed, LOOK.deepRed, 0.035], transitionBeats: 2 },
    { rear: [LOOK.red, LOOK.white, 0.57], floor: [LOOK.deepRed, LOOK.red, 0.34], side: [LOOK.white, LOOK.red, 0.27], front: [LOOK.warm, LOOK.white, 0.28], frontFloor: [LOOK.red, LOOK.white, 0.19], transitionBeats: 6 },
    { rear: [LOOK.white, LOOK.red, 0.80], floor: [LOOK.red, LOOK.white, 0.60], side: [LOOK.white, LOOK.red, 0.50], front: [LOOK.white, LOOK.warm, 0.40], frontFloor: [LOOK.red, LOOK.white, 0.30], transitionBeats: 2 },
    { rear: [LOOK.blue, LOOK.steel, 0.09], floor: [LOOK.deepRed, LOOK.blue, 0.035], side: [LOOK.white, LOOK.blue, 0.055], front: [LOOK.warm, LOOK.warm, 0.11], frontFloor: [LOOK.deepRed, LOOK.deepRed, 0.025], transitionBeats: 5 },
  ];

  const rearMotion = [
    { width: 12, tilt: -25, mirror: 1, beats: 3 },
    { width: 32, tilt: -26, mirror: 1, beats: 3 },
    { width: 32, tilt: -22, mirror: -1, beats: 4 },
    { width: 7, tilt: -20, mirror: 1, beats: 2 },
    { width: 40, tilt: -27, mirror: 1, beats: 8 },
    { width: 38, tilt: -19, mirror: -1, beats: 4 },
    { width: 5, tilt: -24, mirror: 1, beats: 6 },
  ];
  const floorMotion = [
    { width: 14, tilt: 44, mirror: -1, beats: 3 },
    { width: 28, tilt: 41, mirror: -1, beats: 3 },
    { width: 30, tilt: 36, mirror: 1, beats: 4 },
    { width: 9, tilt: 47, mirror: -1, beats: 2 },
    { width: 35, tilt: 38, mirror: -1, beats: 8 },
    { width: 34, tilt: 33, mirror: 1, beats: 4 },
    { width: 5, tilt: 44, mirror: -1, beats: 6 },
  ];
  const sideMotion = [
    { width: 8, tilt: -20, mirror: 1, beats: 3 },
    { width: 18, tilt: -17, mirror: 1, beats: 3 },
    { width: 22, tilt: -14, mirror: -1, beats: 4 },
    { width: 5, tilt: -18, mirror: 1, beats: 2 },
    { width: 25, tilt: -13, mirror: 1, beats: 8 },
    { width: 28, tilt: -10, mirror: -1, beats: 4 },
    { width: 4, tilt: -20, mirror: 1, beats: 6 },
  ];

  sections.forEach((section, sectionIndex) => {
    const look = looks[sectionIndex] ?? looks[looks.length - 1]!;
    addLook(cues, current, rear, section, look.rear, look.transitionBeats * beat, 2.4);
    addLook(cues, current, floor, section, look.floor, look.transitionBeats * beat, 2.7);
    addLook(cues, current, side, section, look.side, look.transitionBeats * beat, 3.4);
    addLook(cues, current, front, section, look.front, look.transitionBeats * beat, 24);
    addLook(cues, current, frontFloor, section, look.frontFloor, look.transitionBeats * beat, 22);

    const rearMove = rearMotion[sectionIndex] ?? rearMotion[rearMotion.length - 1]!;
    const floorMove = floorMotion[sectionIndex] ?? floorMotion[floorMotion.length - 1]!;
    const sideMove = sideMotion[sectionIndex] ?? sideMotion[sideMotion.length - 1]!;
    addFanMove(cues, current, rear, section, rearMove.width, rearMove.tilt, rearMove.mirror, rearMove.beats * beat);
    addFanMove(cues, current, floor, section, floorMove.width, floorMove.tilt, floorMove.mirror, floorMove.beats * beat);
    addFanMove(cues, current, side, section, sideMove.width, sideMove.tilt, sideMove.mirror, sideMove.beats * beat);

    addAccents(cues, section, rear, floor, allBeams);

    if (section.id === 'build') {
      addIdleTexture(cues, section, rear, section.startSeconds + 8 * beat, -29, -25, 8 * beat, 0.09);
    }
    if (section.id === 'climax') {
      addIdleTexture(cues, section, floor, section.startSeconds + 6 * beat, 31, 35, 4 * beat, 0.13);
    }
  });

  // The final section deliberately fades to black before the cue range ends, so
  // the transition is visible and seek-safe instead of relying on implicit state.
  const outro = sections[sections.length - 1];
  if (outro) {
    const fadeStart = Math.max(outro.startSeconds, outro.endSeconds - 5 * beat);
    for (const fixture of rig.fixtures) {
      const state = current.get(fixture.id);
      if (!state) continue;
      cues.push({
        id: `outro-black-${fixture.id}`,
        sectionId: outro.id,
        startSeconds: fadeStart,
        endSeconds: outro.endSeconds,
        layer: 'section',
        priority: 20,
        select: { ids: [fixture.id], order: 'given' },
        channels: {
          intensity: {
            blend: 'replace',
            effect: {
              op: 'curve',
              keyframes: [
                { time: fadeStart, value: state.intensity },
                { time: Math.max(fadeStart + 0.01, outro.endSeconds - 0.02), value: 0 },
              ],
            },
          },
        },
      });
      state.intensity = 0;
    }
  }

  return {
    schemaVersion: '2.0-prototype',
    id: 'dust-runtime-v2-reference',
    revision: 1,
    title: `${score.artist} · ${score.title}`,
    brief: '确定性 ShowPlan 参考：稳定构图为主，明确换位，鼓点只做 accent，少量 oscillator 仅作背景纹理。',
    seed: 42,
    baseLook: { intensity: 0 },
    sections,
    cues,
  };
}

function buildSections(duration: number, beat: number): ShowSection[] {
  const names: Array<[string, string, string]> = [
    ['intro', '序幕 · 冷色留白', '低密度、窄构图，先让舞台稳定下来'],
    ['groove-a', 'Groove A · 赤色展开', '两侧 Beam 明确展开后保持，鼓点只增强亮度'],
    ['groove-b', 'Groove B · 镜像换位', '用一次完整镜像运动制造句子感，而不是持续扫描'],
    ['break', 'Break · 收束', '降低密度，把空间收回中央'],
    ['build', 'Build · 缓慢打开', '用较长运动建立期待，完成后仅保留极小幅背景漂移'],
    ['climax', 'Climax · 银红爆发', '高亮度、宽空间、短促鼓点强调，运动完成后 Hold'],
    ['outro', 'Outro · 回到夜色', '逐步收束并在结束前确定性淡黑'],
  ];
  const fractions = [0, 0.12, 0.30, 0.48, 0.62, 0.80, 0.92, 1];
  const bar = beat * 4;
  const marks: number[] = [0];
  for (let index = 1; index < fractions.length - 1; index += 1) {
    const raw = duration * fractions[index]!;
    const snapped = Math.round(raw / bar) * bar;
    const previous = marks[marks.length - 1] ?? 0;
    const remainingSections = fractions.length - 1 - index;
    const latest = Math.max(previous + beat, duration - remainingSections * beat);
    marks.push(Math.min(latest, Math.max(previous + beat, snapped)));
  }
  marks.push(duration);

  return names.map(([id, label, intent], index) => ({
    id,
    label,
    intent,
    startSeconds: marks[index] ?? 0,
    endSeconds: marks[index + 1] ?? duration,
  }));
}

function fixtures(rig: RigSnapshot, type: string, group: string): RigFixtureSnapshot[] {
  return rig.fixtures.filter((fixture) => fixture.type === type && fixture.groups.includes(group));
}

function addLook(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  selected: RigFixtureSnapshot[],
  section: ShowSection,
  look: [string, string, number],
  transitionSeconds: number,
  beamAngleDeg: number,
): void {
  const transitionEnd = Math.min(section.endSeconds - 0.01, section.startSeconds + Math.max(0.05, transitionSeconds));
  selected.forEach((fixture, index) => {
    const state = current.get(fixture.id);
    if (!state) return;
    const color = index % 2 ? look[1] : look[0];
    cues.push({
      id: `${section.id}-look-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'section',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: {
          blend: 'replace',
          effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.intensity }, { time: transitionEnd, value: look[2] }] },
        },
        color: {
          blend: 'replace',
          effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.color }, { time: transitionEnd, value: color }] },
        },
        beamAngleDeg: {
          blend: 'replace',
          effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.beamAngleDeg }, { time: transitionEnd, value: beamAngleDeg }] },
        },
      },
    });
    state.intensity = look[2];
    state.color = color;
    state.beamAngleDeg = beamAngleDeg;
  });
}

function addFanMove(
  cues: LightingCue[],
  current: Map<string, FixtureState>,
  selected: RigFixtureSnapshot[],
  section: ShowSection,
  width: number,
  targetTilt: number,
  mirror: number,
  transitionSeconds: number,
): void {
  const transitionEnd = Math.min(section.endSeconds - 0.01, section.startSeconds + Math.max(0.05, transitionSeconds));
  const count = selected.length;
  selected.forEach((fixture, index) => {
    const state = current.get(fixture.id);
    if (!state) return;
    const unit = count <= 1 ? 0 : -1 + (2 * index) / (count - 1);
    const targetPan = unit * width * mirror;
    cues.push({
      id: `${section.id}-move-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'motion',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: {
          blend: 'replace',
          effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.pan }, { time: transitionEnd, value: targetPan }] },
        },
        tilt: {
          blend: 'replace',
          effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.tilt }, { time: transitionEnd, value: targetTilt }] },
        },
      },
    });
    state.pan = targetPan;
    state.tilt = targetTilt;
  });
}

function addAccents(
  cues: LightingCue[],
  section: ShowSection,
  rear: RigFixtureSnapshot[],
  floor: RigFixtureSnapshot[],
  allBeams: RigFixtureSnapshot[],
): void {
  if (floor.length) cues.push({
    id: `${section.id}-kick-accent`,
    sectionId: section.id,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    layer: 'accent',
    priority: 0,
    select: { ids: floor.map((fixture) => fixture.id), order: 'given' },
    channels: {
      intensity: {
        blend: 'add',
        effect: { op: 'eventEnvelope', roleIds: ['drums'], noteNumbers: [35, 36], attackSeconds: 0.008, decaySeconds: 0.11, gain: 0.16, reducer: 'max' },
      },
    },
  });

  if (rear.length) cues.push({
    id: `${section.id}-snare-accent`,
    sectionId: section.id,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    layer: 'accent',
    priority: 1,
    select: { ids: rear.map((fixture) => fixture.id), order: 'given' },
    channels: {
      intensity: {
        blend: 'add',
        effect: { op: 'eventEnvelope', roleIds: ['drums'], noteNumbers: [37, 38, 39, 40], attackSeconds: 0.01, decaySeconds: 0.18, gain: 0.22, reducer: 'max' },
      },
    },
  });

  if (allBeams.length) cues.push({
    id: `${section.id}-crash-accent`,
    sectionId: section.id,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    layer: 'accent',
    priority: 2,
    select: { ids: allBeams.map((fixture) => fixture.id), order: 'given' },
    channels: {
      intensity: {
        blend: 'add',
        effect: { op: 'eventEnvelope', roleIds: ['drums'], noteNumbers: [49, 52, 55, 57], attackSeconds: 0.006, decaySeconds: 0.34, gain: 0.36, reducer: 'max' },
      },
    },
  });
}

function addIdleTexture(
  cues: LightingCue[],
  section: ShowSection,
  selected: RigFixtureSnapshot[],
  startSeconds: number,
  minTilt: number,
  maxTilt: number,
  periodSeconds: number,
  fixturePhaseStep: number,
): void {
  if (!selected.length || startSeconds >= section.endSeconds - 0.5) return;
  cues.push({
    id: `${section.id}-idle-texture`,
    sectionId: section.id,
    startSeconds,
    endSeconds: section.endSeconds,
    layer: 'motion',
    priority: 10,
    select: { ids: selected.map((fixture) => fixture.id), order: 'given' },
    fadeInSeconds: Math.min(0.6, (section.endSeconds - startSeconds) * 0.2),
    fadeOutSeconds: Math.min(0.6, (section.endSeconds - startSeconds) * 0.2),
    channels: {
      tilt: {
        blend: 'replace',
        effect: { op: 'oscillator', min: minTilt, max: maxTilt, periodSeconds, phase: 0, fixturePhaseStep },
      },
    },
  });
}
