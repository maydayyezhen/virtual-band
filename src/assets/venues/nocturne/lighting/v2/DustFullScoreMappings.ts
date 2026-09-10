import type { LightingCue, RigFixtureSnapshot, ShowSection } from './contracts';
import type {
  LightingMusicAnalysis,
  LightingNote,
  LightingPhrase,
  PitchBand,
} from './MusicChoreographyAnalysis';

export type RigGroups = {
  rear: RigFixtureSnapshot[];
  floor: RigFixtureSnapshot[];
  side: RigFixtureSnapshot[];
  front: RigFixtureSnapshot[];
  frontFloor: RigFixtureSnapshot[];
  allBeams: RigFixtureSnapshot[];
};

export type HomeMaps = {
  pan: Map<string, number>;
  tilt: Map<string, number>;
  angle: Map<string, number>;
};

type RoleMap = {
  fixtures: RigFixtureSnapshot[];
  level: number;
  attack: number;
  decay: number;
  bandMode: 'inner-middle-outer' | 'left-center-right' | 'alternating';
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function addPhraseMotion(
  cues: LightingCue[],
  analysis: LightingMusicAnalysis,
  sections: ShowSection[],
  groups: RigGroups,
  homes: HomeMaps,
): void {
  const notesById = new Map(analysis.notes.map((note) => [note.id, note]));
  for (const phrase of analysis.phrases) {
    if (phrase.noteCount < 2 && phrase.sustainRatio < 0.5) continue;
    if (phrase.importance01 < 0.24) continue;
    const section = sectionAt(sections, phrase.startSeconds);
    const start = Math.max(section.startSeconds, phrase.startSeconds);
    const end = Math.min(section.endSeconds - 0.01, phrase.endSeconds + analysis.beatSeconds * 0.12);
    if (end - start < analysis.beatSeconds * 0.35) continue;

    const selected = phraseFixtures(phrase, groups);
    if (!selected.length) continue;
    const phraseNotes = phrase.noteIds
      .map((id) => notesById.get(id))
      .filter((note): note is LightingNote => Boolean(note));
    const averagePitch = phraseNotes.length
      ? phraseNotes.reduce((sum, note) => sum + note.pitch01, 0) / phraseNotes.length
      : 0.5;
    const motifSign = hashString(phrase.motifKey) % 2 ? 1 : -1;
    const movement = phraseMovement(phrase, averagePitch, motifSign);

    selected.forEach((fixture, fixtureIndex) => {
      const key = homeKey(section.id, fixture.id);
      const pan = homes.pan.get(key) ?? fixture.home.pan;
      const tilt = homes.tilt.get(key) ?? fixture.home.tilt;
      const angle = homes.angle.get(key) ?? fixture.home.beamAngleDeg;
      const stagger = Math.min(analysis.beatSeconds * 0.12, fixtureIndex * analysis.beatSeconds * 0.035);
      const localStart = Math.min(end - 0.03, start + stagger);
      const t1 = lerp(localStart, end, 0.30);
      const t2 = lerp(localStart, end, 0.68);
      const sign = fixtureIndex % 2 ? -1 : 1;
      cues.push({
        id: `phrase-${phrase.id}-${fixture.id}`,
        sectionId: section.id,
        startSeconds: localStart,
        endSeconds: end,
        layer: 'motion',
        priority: 2000 + Math.round(phrase.startSeconds * 10),
        select: { ids: [fixture.id], order: 'given' },
        channels: {
          pan: { blend: 'replace', effect: { op: 'curve', keyframes: phrasePanFrames(phrase, localStart, t1, t2, end, pan, movement.pan * sign) } },
          tilt: { blend: 'replace', effect: { op: 'curve', keyframes: phraseTiltFrames(phrase, localStart, t1, t2, end, tilt, movement.tilt) } },
          beamAngleDeg: {
            blend: 'replace',
            effect: {
              op: 'curve',
              keyframes: [
                { time: localStart, value: angle },
                { time: t1, value: clamp(angle + movement.angle, 1, 60) },
                { time: end - 0.004, value: angle },
              ],
            },
          },
        },
      });
    });
  }
}

export function addPitchedNoteMappings(
  cues: LightingCue[],
  analysis: LightingMusicAnalysis,
  sections: ShowSection[],
  groups: RigGroups,
): void {
  const roles = [...analysis.notesByRole.keys()].filter((role) => role !== 'drums');
  for (const section of sections) {
    for (const role of roles) {
      const roleNotes = analysis.notesByRole.get(role) ?? [];
      const map = roleMap(role, groups, analysis.beatSeconds);
      if (!map.fixtures.length) continue;
      for (const band of ['low', 'mid', 'high'] as PitchBand[]) {
        const noteNumbers = [...new Set(roleNotes.filter((note) => note.pitchBand === band).map((note) => note.note))].sort((a, b) => a - b);
        if (!noteNumbers.length) continue;
        const selected = selectBandFixtures(map.fixtures, band, map.bandMode);
        if (!selected.length) continue;
        cues.push({
          id: `notes-${safeId(role)}-${band}`,
          sectionId: section.id,
          startSeconds: section.startSeconds,
          endSeconds: section.endSeconds,
          layer: 'accent',
          priority: 200 + bandPriority(band),
          select: { ids: selected.map((fixture) => fixture.id), order: 'given' },
          channels: {
            intensity: {
              blend: 'add',
              effect: {
                op: 'eventEnvelope',
                roleIds: [role],
                noteNumbers,
                attackSeconds: map.attack,
                decaySeconds: map.decay * (band === 'high' ? 1.15 : band === 'low' ? 0.90 : 1),
                gain: map.level * (band === 'high' ? 1.12 : band === 'low' ? 0.92 : 1),
                reducer: 'sumClamped',
              },
            },
          },
        });
      }
    }
  }
}

export function addHarmonicMoments(
  cues: LightingCue[],
  analysis: LightingMusicAnalysis,
  sections: ShowSection[],
  groups: RigGroups,
): void {
  let counter = 0;
  for (const moment of analysis.harmonicMoments) {
    if (moment.averageVelocity01 < 0.38) continue;
    const section = sectionAt(sections, moment.startSeconds);
    const start = moment.startSeconds;
    const duration = clamp((moment.endSeconds - start) * 0.45 + analysis.beatSeconds * 0.16, 0.09, analysis.beatSeconds * 0.72);
    const end = Math.min(section.endSeconds - 0.01, start + duration);
    if (end <= start + 0.025) continue;
    const width = clamp(moment.pitchSpan / 24, 0, 1);
    const density = clamp(moment.noteCount / 7, 0, 1);
    const selected = width > 0.55 ? [...groups.front, ...groups.frontFloor] : groups.front;
    if (!selected.length) continue;
    const peak = start + (end - start) * 0.22;
    cues.push({
      id: `harmony-${counter++}`,
      sectionId: section.id,
      startSeconds: start,
      endSeconds: end,
      layer: 'accent',
      priority: 600,
      select: { ids: selected.map((fixture) => fixture.id), order: 'given' },
      channels: {
        intensity: {
          blend: 'add',
          effect: {
            op: 'curve',
            keyframes: [
              { time: start, value: 0 },
              { time: peak, value: clamp(0.025 + density * 0.06 + moment.averageVelocity01 * 0.035, 0, 0.13) },
              { time: end - 0.003, value: 0 },
            ],
          },
        },
      },
    });
  }
}

export function addDrumMappings(
  cues: LightingCue[],
  analysis: LightingMusicAnalysis,
  sections: ShowSection[],
  groups: RigGroups,
): void {
  const drums = analysis.notesByRole.get('drums') ?? [];
  const notesFor = (kind: LightingNote['drumKind']): number[] => [
    ...new Set(drums.filter((note) => note.drumKind === kind).map((note) => note.note)),
  ];
  for (const section of sections) {
    addDrumEnvelope(cues, section, groups.floor, 'kick', notesFor('kick'), 0.075, 0.006, Math.max(0.08, analysis.beatSeconds * 0.18));
    addDrumEnvelope(cues, section, takeSpread(groups.rear, 4, 1, 'outer'), 'snare', notesFor('snare'), 0.095, 0.006, Math.max(0.10, analysis.beatSeconds * 0.23));
    addDrumEnvelope(cues, section, groups.frontFloor, 'hat', notesFor('hat'), 0.028, 0.004, Math.max(0.045, analysis.beatSeconds * 0.09));
    addDrumEnvelope(cues, section, groups.allBeams, 'crash', notesFor('crash'), 0.26, 0.006, Math.max(0.24, analysis.beatSeconds * 0.68));

    const tomNotes = notesFor('tom').sort((a, b) => a - b);
    tomNotes.forEach((noteNumber, index) => {
      const fixture = groups.floor.length
        ? groups.floor[Math.round((index / Math.max(1, tomNotes.length - 1)) * (groups.floor.length - 1))]
        : undefined;
      if (!fixture) return;
      addDrumEnvelope(cues, section, [fixture], `tom-${noteNumber}`, [noteNumber], 0.10, 0.005, Math.max(0.10, analysis.beatSeconds * 0.24));
    });
  }
}

function phraseMovement(phrase: LightingPhrase, averagePitch: number, motifSign: number): { pan: number; tilt: number; angle: number } {
  const range = clamp(phrase.pitchRange / 18, 0, 1);
  const density = clamp(phrase.densityPerBeat / 3.5, 0, 1);
  const sustain = phrase.sustainRatio;
  const basePan = 3.5 + phrase.importance01 * 7 + range * 5 + density * 2;
  const pitchBias = lerp(-1, 1, averagePitch);
  const contourSign = phrase.contour === 'rise' ? 1 : phrase.contour === 'fall' ? -1 : motifSign;
  return {
    pan: basePan * contourSign * motifSign,
    tilt: (1.5 + range * 4 + sustain * 3) * (phrase.contour === 'fall' || phrase.contour === 'dip' ? 1 : -1),
    angle: clamp((sustain * 1.3 + range * 0.8) * (pitchBias > 0 ? -1 : 1), -1.8, 1.8),
  };
}

function phrasePanFrames(
  phrase: LightingPhrase,
  start: number,
  t1: number,
  t2: number,
  end: number,
  base: number,
  amount: number,
): Array<{ time: number; value: number }> {
  switch (phrase.contour) {
    case 'rise': return [{ time: start, value: base }, { time: t2, value: base + amount }, { time: end - 0.004, value: base }];
    case 'fall': return [{ time: start, value: base }, { time: t2, value: base - amount }, { time: end - 0.004, value: base }];
    case 'arch': return [{ time: start, value: base }, { time: t1, value: base + amount }, { time: t2, value: base + amount * 0.75 }, { time: end - 0.004, value: base }];
    case 'dip': return [{ time: start, value: base }, { time: t1, value: base - amount }, { time: t2, value: base - amount * 0.55 }, { time: end - 0.004, value: base }];
    case 'mixed': return [{ time: start, value: base }, { time: t1, value: base + amount }, { time: t2, value: base - amount * 0.55 }, { time: end - 0.004, value: base }];
    case 'static': return [{ time: start, value: base }, { time: t1, value: base + amount * 0.30 }, { time: end - 0.004, value: base }];
  }
}

function phraseTiltFrames(
  phrase: LightingPhrase,
  start: number,
  t1: number,
  t2: number,
  end: number,
  base: number,
  amount: number,
): Array<{ time: number; value: number }> {
  if (phrase.contour === 'arch' || phrase.contour === 'dip') {
    return [{ time: start, value: base }, { time: t1, value: base + amount }, { time: t2, value: base + amount * 0.45 }, { time: end - 0.004, value: base }];
  }
  return [{ time: start, value: base }, { time: t2, value: base + amount }, { time: end - 0.004, value: base }];
}

function phraseFixtures(phrase: LightingPhrase, groups: RigGroups): RigFixtureSnapshot[] {
  const density = clamp(phrase.densityPerBeat / 3, 0, 1);
  const count = density > 0.72 ? 4 : density > 0.38 ? 3 : 2;
  const seed = hashString(`${phrase.role}:${phrase.motifKey}`);
  switch (phrase.role) {
    case 'bass': return takeSpread(groups.rear, count, seed, 'inner');
    case 'electric': return takeSpread(groups.side, count, seed, 'outer');
    case 'guitar': return takeSpread(groups.side, Math.min(2, count), seed, 'inner');
    case 'upper': return takeSpread(groups.rear, Math.min(2, count), seed, 'outer');
    case 'lower': return takeSpread(groups.floor, count, seed, 'inner');
    default: return takeSpread(groups.floor, Math.min(2, count), seed, 'outer');
  }
}

function roleMap(role: string, groups: RigGroups, beat: number): RoleMap {
  switch (role) {
    case 'bass': return { fixtures: [...groups.floor, ...groups.rear], level: 0.13, attack: 0.006, decay: Math.max(0.11, beat * 0.30), bandMode: 'inner-middle-outer' };
    case 'electric': return { fixtures: [...groups.side, ...groups.rear], level: 0.15, attack: 0.008, decay: Math.max(0.14, beat * 0.42), bandMode: 'left-center-right' };
    case 'guitar': return { fixtures: [...groups.side, ...groups.frontFloor], level: 0.10, attack: 0.010, decay: Math.max(0.13, beat * 0.36), bandMode: 'alternating' };
    case 'upper': return { fixtures: [...groups.rear, ...groups.front], level: 0.09, attack: 0.012, decay: Math.max(0.16, beat * 0.48), bandMode: 'inner-middle-outer' };
    case 'lower': return { fixtures: [...groups.floor, ...groups.frontFloor], level: 0.085, attack: 0.012, decay: Math.max(0.17, beat * 0.50), bandMode: 'inner-middle-outer' };
    default: return { fixtures: groups.frontFloor, level: 0.055, attack: 0.012, decay: Math.max(0.13, beat * 0.40), bandMode: 'alternating' };
  }
}

function selectBandFixtures(fixtures: RigFixtureSnapshot[], band: PitchBand, mode: RoleMap['bandMode']): RigFixtureSnapshot[] {
  if (!fixtures.length) return [];
  const sorted = fixtures.slice().sort((a, b) => a.id.localeCompare(b.id));
  const count = Math.min(3, sorted.length);
  if (mode === 'alternating') {
    const parity = band === 'mid' ? 1 : 0;
    const selected = sorted.filter((_, index) => index % 2 === parity);
    return selected.slice(0, Math.max(1, count));
  }
  if (mode === 'left-center-right') {
    if (band === 'low') return sorted.slice(0, count);
    if (band === 'high') return sorted.slice(-count);
    return takeSpread(sorted, count, 3, 'inner');
  }
  if (band === 'low') return takeSpread(sorted, count, 7, 'inner');
  if (band === 'high') return takeSpread(sorted, count, 11, 'outer');
  return takeSpread(sorted, count, 5, 'balanced');
}

export function takeSpread(
  fixtures: RigFixtureSnapshot[],
  count: number,
  seed: number,
  preference: 'inner' | 'outer' | 'balanced',
): RigFixtureSnapshot[] {
  if (fixtures.length <= count) return fixtures.slice();
  const center = (fixtures.length - 1) / 2;
  const scored = fixtures.map((fixture, index) => {
    const distance = Math.abs(index - center) / Math.max(1, center);
    const preferenceScore = preference === 'inner'
      ? distance
      : preference === 'outer'
        ? 1 - distance
        : Math.abs(distance - 0.55);
    const jitter = ((hashString(`${seed}:${fixture.id}`) % 997) / 997) * 0.08;
    return { fixture, score: preferenceScore + jitter };
  });
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((item) => item.fixture)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function addDrumEnvelope(
  cues: LightingCue[],
  section: ShowSection,
  fixtures: RigFixtureSnapshot[],
  id: string,
  noteNumbers: number[],
  gain: number,
  attack: number,
  decay: number,
): void {
  if (!fixtures.length || !noteNumbers.length) return;
  cues.push({
    id: `drum-${id}`,
    sectionId: section.id,
    startSeconds: section.startSeconds,
    endSeconds: section.endSeconds,
    layer: 'accent',
    priority: 900,
    select: { ids: fixtures.map((fixture) => fixture.id), order: 'given' },
    channels: {
      intensity: {
        blend: 'add',
        effect: { op: 'eventEnvelope', roleIds: ['drums'], noteNumbers, attackSeconds: attack, decaySeconds: decay, gain, reducer: 'max' },
      },
    },
  });
}

function sectionAt(sections: ShowSection[], time: number): ShowSection {
  return sections.find((section) => time >= section.startSeconds && time < section.endSeconds) ?? sections[sections.length - 1]!;
}

function homeKey(sectionId: string, fixtureId: string): string {
  return `${sectionId}:${fixtureId}`;
}

function bandPriority(band: PitchBand): number {
  return band === 'low' ? 0 : band === 'mid' ? 1 : 2;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'other';
}
