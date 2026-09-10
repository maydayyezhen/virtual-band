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

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function createDustAdaptiveStressShowPlan(score: SongScore, rig: RigSnapshot): ShowPlan {
  const beat = 60 / score.bpm;
  const bar = beat * 4;
  const sections = buildSections(score.duration, bar);
  const cues: LightingCue[] = [];
  const current = new Map<string, FixtureState>(rig.fixtures.map((fixture) => [fixture.id, { ...fixture.home, intensity: 0 }]));

  const rear = fixtures(rig, 'beam', 'rear');
  const floor = fixtures(rig, 'beam', 'floor');
  const side = fixtures(rig, 'beam', 'side');
  const front = rig.fixtures
    .filter((fixture) => fixture.type === 'par' && fixture.groups.includes('front') && !fixture.groups.includes('front-floor'))
    .sort((a, b) => a.id.localeCompare(b.id));
  const frontFloor = fixtures(rig, 'par', 'front-floor');
  const allBeams = rig.fixtures.filter((fixture) => fixture.type === 'beam').sort((a, b) => a.id.localeCompare(b.id));

  const basePan = new Map<string, number>();
  const baseTilt = new Map<string, number>();

  sections.forEach((section, index) => {
    const energy = sectionEnergy(score.events, section);
    const look = sectionLook(index, energy);
    const transitionEnd = Math.min(section.endSeconds - 0.01, section.startSeconds + beat * look.transitionBeats);

    addBeamLook(cues, current, rear, section, look.rearIntensity, look.rearColorA, look.rearColorB, look.rearWidth, look.rearTilt, look.rearAngle, transitionEnd, basePan, baseTilt, 'rear');
    addBeamLook(cues, current, floor, section, look.floorIntensity, look.floorColorA, look.floorColorB, look.floorWidth, look.floorTilt, look.floorAngle, transitionEnd, basePan, baseTilt, 'floor');
    addBeamLook(cues, current, side, section, look.sideIntensity, look.sideColorA, look.sideColorB, look.sideWidth, look.sideTilt, look.sideAngle, transitionEnd, basePan, baseTilt, 'side');
    addParLook(cues, current, front, section, look.frontIntensity, look.frontColor, 24, transitionEnd, 'front');
    addParLook(cues, current, frontFloor, section, look.frontFloorIntensity, look.frontFloorColor, 22, transitionEnd, 'front-floor');

    const gestureStart = Math.min(section.endSeconds, transitionEnd + beat * 0.25);
    addFourBarGestures(cues, score, section, gestureStart, beat, bar, rear, floor, side, basePan, baseTilt, energy);
  });

  addBassMotionBites(cues, score, sections, rear, side, basePan, baseTilt, beat);
  addSelectiveDrumAccents(cues, sections, rear, floor, side, frontFloor, allBeams, beat);
  addOutroBlack(cues, current, sections, rig, score.duration, beat);

  return {
    schemaVersion: '2.0-prototype',
    id: 'dust-kinetic-groove-v3',
    revision: 3,
    title: `${score.artist} · ${score.title}`,
    brief: 'Kinetic Groove：补上“静态 pose”和“持续摇摆”之间缺失的中尺度动作。以 1–4 小节的有限 gesture 为主体，Bass riff 驱动小幅运动，鼓点只做选择性标点。',
    seed: 117,
    baseLook: { intensity: 0 },
    sections,
    cues,
  };
}

type SectionLook = {
  rearIntensity: number;
  rearColorA: string;
  rearColorB: string;
  rearWidth: number;
  rearTilt: number;
  rearAngle: number;
  floorIntensity: number;
  floorColorA: string;
  floorColorB: string;
  floorWidth: number;
  floorTilt: number;
  floorAngle: number;
  sideIntensity: number;
  sideColorA: string;
  sideColorB: string;
  sideWidth: number;
  sideTilt: number;
  sideAngle: number;
  frontIntensity: number;
  frontColor: string;
  frontFloorIntensity: number;
  frontFloorColor: string;
  transitionBeats: number;
};

function sectionLook(index: number, energy: number): SectionLook {
  const e = clamp(energy, 0, 1);
  const looks: SectionLook[] = [
    { rearIntensity: 0.30, rearColorA: LOOK.deepRed, rearColorB: LOOK.red, rearWidth: 18, rearTilt: -26, rearAngle: 2.5, floorIntensity: 0.12, floorColorA: LOOK.deepRed, floorColorB: LOOK.steel, floorWidth: 13, floorTilt: 44, floorAngle: 2.9, sideIntensity: 0.18, sideColorA: LOOK.red, sideColorB: LOOK.white, sideWidth: 10, sideTilt: -18, sideAngle: 3.2, frontIntensity: 0.17, frontColor: LOOK.warm, frontFloorIntensity: 0.06, frontFloorColor: LOOK.deepRed, transitionBeats: 1.2 },
    { rearIntensity: 0.42, rearColorA: LOOK.red, rearColorB: LOOK.steel, rearWidth: 26, rearTilt: -25, rearAngle: 2.25, floorIntensity: 0.20, floorColorA: LOOK.deepRed, floorColorB: LOOK.red, floorWidth: 20, floorTilt: 41, floorAngle: 2.6, sideIntensity: 0.26, sideColorA: LOOK.red, sideColorB: LOOK.white, sideWidth: 16, sideTilt: -16, sideAngle: 3.0, frontIntensity: 0.20, frontColor: LOOK.warm, frontFloorIntensity: 0.09, frontFloorColor: LOOK.red, transitionBeats: 0.9 },
    { rearIntensity: 0.50, rearColorA: LOOK.red, rearColorB: LOOK.white, rearWidth: 32, rearTilt: -23, rearAngle: 2.05, floorIntensity: 0.27, floorColorA: LOOK.deepRed, floorColorB: LOOK.red, floorWidth: 26, floorTilt: 38, floorAngle: 2.35, sideIntensity: 0.32, sideColorA: LOOK.white, sideColorB: LOOK.red, sideWidth: 22, sideTilt: -14, sideAngle: 2.8, frontIntensity: 0.24, frontColor: LOOK.warm, frontFloorIntensity: 0.13, frontFloorColor: LOOK.red, transitionBeats: 1.1 },
    { rearIntensity: 0.26, rearColorA: LOOK.deepRed, rearColorB: LOOK.steel, rearWidth: 14, rearTilt: -24, rearAngle: 2.8, floorIntensity: 0.10, floorColorA: LOOK.deepRed, floorColorB: LOOK.blue, floorWidth: 12, floorTilt: 46, floorAngle: 3.0, sideIntensity: 0.14, sideColorA: LOOK.red, sideColorB: LOOK.steel, sideWidth: 9, sideTilt: -18, sideAngle: 3.4, frontIntensity: 0.13, frontColor: LOOK.warm, frontFloorIntensity: 0.045, frontFloorColor: LOOK.deepRed, transitionBeats: 1.4 },
    { rearIntensity: 0.58, rearColorA: LOOK.red, rearColorB: LOOK.white, rearWidth: 38, rearTilt: -22, rearAngle: 1.95, floorIntensity: 0.34, floorColorA: LOOK.red, floorColorB: LOOK.deepRed, floorWidth: 31, floorTilt: 36, floorAngle: 2.15, sideIntensity: 0.38, sideColorA: LOOK.white, sideColorB: LOOK.red, sideWidth: 27, sideTilt: -12, sideAngle: 2.6, frontIntensity: 0.28, frontColor: LOOK.warm, frontFloorIntensity: 0.16, frontFloorColor: LOOK.red, transitionBeats: 1.3 },
    { rearIntensity: 0.74, rearColorA: LOOK.red, rearColorB: LOOK.white, rearWidth: 46, rearTilt: -19, rearAngle: 1.7, floorIntensity: 0.50, floorColorA: LOOK.red, floorColorB: LOOK.white, floorWidth: 39, floorTilt: 33, floorAngle: 1.9, sideIntensity: 0.50, sideColorA: LOOK.white, sideColorB: LOOK.red, sideWidth: 32, sideTilt: -10, sideAngle: 2.35, frontIntensity: 0.36, frontColor: LOOK.white, frontFloorIntensity: 0.25, frontFloorColor: LOOK.red, transitionBeats: 0.75 },
    { rearIntensity: 0.24, rearColorA: LOOK.deepRed, rearColorB: LOOK.steel, rearWidth: 16, rearTilt: -25, rearAngle: 2.7, floorIntensity: 0.09, floorColorA: LOOK.deepRed, floorColorB: LOOK.blue, floorWidth: 11, floorTilt: 45, floorAngle: 3.0, sideIntensity: 0.12, sideColorA: LOOK.steel, sideColorB: LOOK.red, sideWidth: 8, sideTilt: -18, sideAngle: 3.5, frontIntensity: 0.11, frontColor: LOOK.warm, frontFloorIntensity: 0.035, frontFloorColor: LOOK.deepRed, transitionBeats: 1.7 },
  ];
  const base = looks[index] ?? looks[looks.length - 1]!;
  const scale = lerp(0.88, 1.08, e);
  return {
    ...base,
    rearIntensity: clamp(base.rearIntensity * scale, 0, 1),
    floorIntensity: clamp(base.floorIntensity * scale, 0, 1),
    sideIntensity: clamp(base.sideIntensity * scale, 0, 1),
  };
}

function addBeamLook(
  cues: LightingCue[], current: Map<string, FixtureState>, selected: RigFixtureSnapshot[], section: ShowSection,
  intensity: number, colorA: string, colorB: string, width: number, tilt: number, angle: number, transitionEnd: number,
  basePan: Map<string, number>, baseTilt: Map<string, number>, group: string,
): void {
  selected.forEach((fixture, index) => {
    const state = current.get(fixture.id);
    if (!state) return;
    const targetPan = fan(index, selected.length, width) * (group === 'floor' ? -1 : 1);
    const targetColor = index % 2 ? colorB : colorA;
    cues.push({
      id: `${section.id}-${group}-base-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'section',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.intensity }, { time: transitionEnd, value: intensity }] } },
        color: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.color }, { time: transitionEnd, value: targetColor }] } },
        beamAngleDeg: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.beamAngleDeg }, { time: transitionEnd, value: angle }] } },
      },
    });
    cues.push({
      id: `${section.id}-${group}-home-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'motion',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.pan }, { time: transitionEnd, value: targetPan }] } },
        tilt: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.tilt }, { time: transitionEnd, value: tilt }] } },
      },
    });
    state.intensity = intensity;
    state.color = targetColor;
    state.beamAngleDeg = angle;
    state.pan = targetPan;
    state.tilt = tilt;
    basePan.set(`${section.id}:${fixture.id}`, targetPan);
    baseTilt.set(`${section.id}:${fixture.id}`, tilt);
  });
}

function addParLook(
  cues: LightingCue[], current: Map<string, FixtureState>, selected: RigFixtureSnapshot[], section: ShowSection,
  intensity: number, color: string, angle: number, transitionEnd: number, group: string,
): void {
  selected.forEach((fixture) => {
    const state = current.get(fixture.id);
    if (!state) return;
    cues.push({
      id: `${section.id}-${group}-base-${fixture.id}`,
      sectionId: section.id,
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
      layer: 'section',
      priority: 0,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.intensity }, { time: transitionEnd, value: intensity }] } },
        color: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.color }, { time: transitionEnd, value: color }] } },
        beamAngleDeg: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: section.startSeconds, value: state.beamAngleDeg }, { time: transitionEnd, value: angle }] } },
      },
    });
    state.intensity = intensity;
    state.color = color;
    state.beamAngleDeg = angle;
  });
}

function addFourBarGestures(
  cues: LightingCue[], score: SongScore, section: ShowSection, firstStart: number, beat: number, bar: number,
  rear: RigFixtureSnapshot[], floor: RigFixtureSnapshot[], side: RigFixtureSnapshot[],
  basePan: Map<string, number>, baseTilt: Map<string, number>, energy: number,
): void {
  let block = 0;
  for (let start = firstStart; start + beat * 1.2 < section.endSeconds; start += bar * 2) {
    const localEnd = Math.min(section.endSeconds - 0.01, start + beat * (block % 3 === 2 ? 3.0 : 2.0));
    if (localEnd <= start + 0.05) break;
    const dominant = dominantRole(score.events, start, Math.min(section.endSeconds, start + bar * 2));
    const strength = clamp(0.55 + energy * 0.45, 0.55, 1);

    if (block % 4 === 0) {
      addSweepGesture(cues, section, rear, start, localEnd, basePan, baseTilt, 10 * strength, -2.5 * strength, block, 'rear-sweep');
    } else if (block % 4 === 1) {
      addFanBreath(cues, section, floor, start, localEnd, basePan, baseTilt, 8 * strength, 4.5 * strength, block, 'floor-open');
    } else if (block % 4 === 2) {
      const direction = dominant === 'electric' ? 1 : dominant === 'bass' ? -1 : block % 2 ? 1 : -1;
      addSweepGesture(cues, section, side, start, localEnd, basePan, baseTilt, 7 * strength * direction, 2.0 * strength, block, 'side-follow');
    } else {
      addCrossGesture(cues, section, rear, floor, start, localEnd, basePan, baseTilt, 9 * strength, block);
    }
    block += 1;
  }
}

function addSweepGesture(
  cues: LightingCue[], section: ShowSection, selected: RigFixtureSnapshot[], start: number, end: number,
  basePan: Map<string, number>, baseTilt: Map<string, number>, panAmount: number, tiltAmount: number, seed: number, label: string,
): void {
  selected.forEach((fixture, index) => {
    const pan = basePan.get(`${section.id}:${fixture.id}`) ?? fixture.home.pan;
    const tilt = baseTilt.get(`${section.id}:${fixture.id}`) ?? fixture.home.tilt;
    const sign = (index + seed) % 2 ? -1 : 1;
    const t1 = lerp(start, end, 0.28);
    const t2 = lerp(start, end, 0.68);
    cues.push({
      id: `${label}-${seed}-${fixture.id}`,
      sectionId: section.id,
      startSeconds: start,
      endSeconds: end,
      layer: 'motion',
      priority: 100 + seed,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: start, value: pan }, { time: t1, value: pan + panAmount * sign }, { time: t2, value: pan - panAmount * 0.35 * sign }, { time: end - 0.005, value: pan }] } },
        tilt: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: start, value: tilt }, { time: t1, value: tilt + tiltAmount }, { time: end - 0.005, value: tilt }] } },
      },
    });
  });
}

function addFanBreath(
  cues: LightingCue[], section: ShowSection, selected: RigFixtureSnapshot[], start: number, end: number,
  basePan: Map<string, number>, baseTilt: Map<string, number>, panAmount: number, tiltAmount: number, seed: number, label: string,
): void {
  selected.forEach((fixture, index) => {
    const pan = basePan.get(`${section.id}:${fixture.id}`) ?? fixture.home.pan;
    const tilt = baseTilt.get(`${section.id}:${fixture.id}`) ?? fixture.home.tilt;
    const outward = index < selected.length / 2 ? -1 : 1;
    const mid = lerp(start, end, 0.56);
    cues.push({
      id: `${label}-${seed}-${fixture.id}`,
      sectionId: section.id,
      startSeconds: start,
      endSeconds: end,
      layer: 'motion',
      priority: 120 + seed,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        pan: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: start, value: pan }, { time: mid, value: pan + panAmount * outward }, { time: end - 0.005, value: pan }] } },
        tilt: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: start, value: tilt }, { time: mid, value: tilt - tiltAmount }, { time: end - 0.005, value: tilt }] } },
      },
    });
  });
}

function addCrossGesture(
  cues: LightingCue[], section: ShowSection, rear: RigFixtureSnapshot[], floor: RigFixtureSnapshot[], start: number, end: number,
  basePan: Map<string, number>, baseTilt: Map<string, number>, amount: number, seed: number,
): void {
  addSweepGesture(cues, section, rear, start, end, basePan, baseTilt, amount, 1.8, seed + 300, 'rear-cross');
  addSweepGesture(cues, section, floor, start + (end - start) * 0.12, end, basePan, baseTilt, -amount * 0.75, -2.8, seed + 400, 'floor-cross');
}

function addBassMotionBites(
  cues: LightingCue[], score: SongScore, sections: ShowSection[], rear: RigFixtureSnapshot[], side: RigFixtureSnapshot[],
  basePan: Map<string, number>, baseTilt: Map<string, number>, beat: number,
): void {
  const bass = score.events.filter((event) => event.i === 'bass').sort((a, b) => a.s - b.s);
  let last = -Infinity;
  let sequence = 0;
  for (const event of bass) {
    const velocity = clamp((Number(event.v) || 90) / 127, 0, 1);
    if (velocity < 0.42 || event.s - last < beat * 0.58) continue;
    const section = sectionAt(sections, event.s);
    const end = Math.min(section.endSeconds - 0.01, event.s + beat * 0.48);
    if (end <= event.s + 0.06) continue;
    const selected = sequence % 3 === 2 ? side : rear;
    const pair = selectPair(selected, sequence);
    const amount = lerp(2.6, 6.2, velocity);
    pair.forEach((fixture, index) => {
      const pan = basePan.get(`${section.id}:${fixture.id}`) ?? fixture.home.pan;
      const tilt = baseTilt.get(`${section.id}:${fixture.id}`) ?? fixture.home.tilt;
      const sign = (sequence + index) % 2 ? -1 : 1;
      const peak = event.s + (end - event.s) * 0.34;
      cues.push({
        id: `bass-motion-${sequence}-${fixture.id}`,
        sectionId: section.id,
        startSeconds: event.s,
        endSeconds: end,
        layer: 'motion',
        priority: 20_000 + sequence,
        select: { ids: [fixture.id], order: 'given' },
        channels: {
          pan: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: event.s, value: pan }, { time: peak, value: pan + amount * sign }, { time: end - 0.004, value: pan }] } },
          tilt: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: event.s, value: tilt }, { time: peak, value: tilt - 1.2 * velocity }, { time: end - 0.004, value: tilt }] } },
        },
      });
    });
    last = event.s;
    sequence += 1;
  }
}

function addSelectiveDrumAccents(
  cues: LightingCue[], sections: ShowSection[], rear: RigFixtureSnapshot[], floor: RigFixtureSnapshot[], side: RigFixtureSnapshot[],
  frontFloor: RigFixtureSnapshot[], allBeams: RigFixtureSnapshot[], beat: number,
): void {
  for (const section of sections) {
    addEnvelope(cues, section, [...rear, ...side], `snare-mark-${section.id}`, [37, 38, 39, 40], 0.008, Math.max(0.09, beat * 0.20), 0.085);
    addEnvelope(cues, section, [...floor, ...frontFloor], `kick-mark-${section.id}`, [35, 36], 0.006, Math.max(0.07, beat * 0.16), 0.055);
    addEnvelope(cues, section, allBeams, `crash-open-${section.id}`, [49, 52, 55, 57], 0.006, Math.max(0.22, beat * 0.58), 0.28);
  }
}

function addEnvelope(
  cues: LightingCue[], section: ShowSection, selected: RigFixtureSnapshot[], id: string, noteNumbers: number[],
  attackSeconds: number, decaySeconds: number, gain: number,
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
        effect: { op: 'eventEnvelope', roleIds: ['drums'], noteNumbers, attackSeconds, decaySeconds, gain, reducer: 'max' },
      },
    },
  });
}

function addOutroBlack(
  cues: LightingCue[], current: Map<string, FixtureState>, sections: ShowSection[], rig: RigSnapshot, duration: number, beat: number,
): void {
  const section = sections[sections.length - 1];
  if (!section) return;
  const fadeStart = Math.max(section.startSeconds, duration - beat * 4);
  for (const fixture of rig.fixtures) {
    const state = current.get(fixture.id);
    if (!state) continue;
    cues.push({
      id: `kinetic-outro-black-${fixture.id}`,
      sectionId: section.id,
      startSeconds: fadeStart,
      endSeconds: duration,
      layer: 'section',
      priority: 100_000,
      select: { ids: [fixture.id], order: 'given' },
      channels: {
        intensity: { blend: 'replace', effect: { op: 'curve', keyframes: [{ time: fadeStart, value: state.intensity }, { time: Math.max(fadeStart + 0.01, duration - 0.02), value: 0 }] } },
      },
    });
  }
}

function buildSections(duration: number, bar: number): ShowSection[] {
  const labels: Array<[string, string, string]> = [
    ['intro', 'Intro · Pressure', '建立低频重心，不急着把所有灯都动起来'],
    ['groove-a', 'Groove A · Kinetic Riff', 'Bass riff 驱动小幅动作，2 小节出现一次完整 gesture'],
    ['groove-b', 'Groove B · Cross Talk', '后排、地排、侧灯开始有问答式运动'],
    ['break', 'Break · Space', '让空间真正掉下来，给下一次动作留余量'],
    ['build', 'Build · Expansion', '用有限 sweep/fan 扩大舞台，不使用持续 oscillator'],
    ['climax', 'Climax · Movement Grid', '更密的 gesture 叠加少量 crash 白光，不靠鼓点闪屏撑场'],
    ['outro', 'Outro · Release', '运动逐渐减少，最后明确淡黑'],
  ];
  const fractions = [0, 0.12, 0.30, 0.48, 0.62, 0.80, 0.92, 1];
  const marks = [0];
  for (let index = 1; index < fractions.length - 1; index += 1) {
    const raw = duration * fractions[index]!;
    const snapped = Math.round(raw / bar) * bar;
    const previous = marks[marks.length - 1] ?? 0;
    marks.push(clamp(snapped, previous + bar, duration - (fractions.length - 1 - index) * bar));
  }
  marks.push(duration);
  return labels.map(([id, label, intent], index) => ({ id, label, intent, startSeconds: marks[index] ?? 0, endSeconds: marks[index + 1] ?? duration }));
}

function sectionEnergy(events: SongEvent[], section: ShowSection): number {
  let weighted = 0;
  let count = 0;
  for (const event of events) {
    if (event.s < section.startSeconds || event.s >= section.endSeconds) continue;
    const velocity = clamp((Number(event.v) || 90) / 127, 0, 1);
    const roleWeight = event.i === 'drums' ? 1.15 : event.i === 'bass' ? 1.1 : event.i === 'electric' ? 0.92 : 0.72;
    weighted += velocity * roleWeight;
    count += 1;
  }
  const seconds = Math.max(1, section.endSeconds - section.startSeconds);
  return clamp((weighted / seconds) / 6.5 + Math.min(0.25, count / seconds / 60), 0.15, 1);
}

function dominantRole(events: SongEvent[], start: number, end: number): string {
  const totals = new Map<string, number>();
  for (const event of events) {
    if (event.s < start || event.s >= end) continue;
    const role = event.i || 'other';
    const velocity = clamp((Number(event.v) || 90) / 127, 0, 1);
    totals.set(role, (totals.get(role) ?? 0) + velocity);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'bass';
}

function sectionAt(sections: ShowSection[], time: number): ShowSection {
  return sections.find((section) => time >= section.startSeconds && time < section.endSeconds) ?? sections[sections.length - 1]!;
}

function selectPair(fixtures: RigFixtureSnapshot[], sequence: number): RigFixtureSnapshot[] {
  if (fixtures.length <= 2) return fixtures;
  const left = sequence % Math.ceil(fixtures.length / 2);
  const right = fixtures.length - 1 - left;
  const selected = [fixtures[left], fixtures[right]].filter((fixture): fixture is RigFixtureSnapshot => Boolean(fixture));
  return [...new Map(selected.map((fixture) => [fixture.id, fixture])).values()];
}

function fixtures(rig: RigSnapshot, type: string, group: string): RigFixtureSnapshot[] {
  return rig.fixtures.filter((fixture) => fixture.type === type && fixture.groups.includes(group)).slice().sort((a, b) => a.id.localeCompare(b.id));
}

function fan(index: number, count: number, width: number): number {
  if (count <= 1) return 0;
  return lerp(-Math.abs(width), Math.abs(width), index / (count - 1));
}
