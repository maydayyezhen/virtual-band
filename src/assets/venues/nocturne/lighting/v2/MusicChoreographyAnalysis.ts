import type { SongEvent, SongScore } from './contracts';

export type PitchBand = 'low' | 'mid' | 'high';
export type NoteContour = 'up' | 'down' | 'repeat';
export type PhraseContour = 'rise' | 'fall' | 'arch' | 'dip' | 'static' | 'mixed';
export type DrumKind = 'kick' | 'snare' | 'hat' | 'tom' | 'crash' | 'other';

export type RoleRange = {
  role: string;
  minNote: number;
  maxNote: number;
  lowAnchor: number;
  highAnchor: number;
  median: number;
};

export type LightingNote = {
  id: string;
  sourceIndex: number;
  role: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  velocity01: number;
  note: number;
  pitch01: number;
  pitchBand: PitchBand;
  contour: NoteContour;
  intervalFromPrevious: number;
  onsetGapSeconds: number;
  importance01: number;
  drumKind?: DrumKind;
};

export type LightingPhrase = {
  id: string;
  role: string;
  startSeconds: number;
  endSeconds: number;
  noteIds: string[];
  noteCount: number;
  averageVelocity01: number;
  averageDurationSeconds: number;
  pitchMin: number;
  pitchMax: number;
  pitchRange: number;
  contour: PhraseContour;
  contourDelta: number;
  densityPerBeat: number;
  sustainRatio: number;
  importance01: number;
  motifKey: string;
};

export type HarmonicMoment = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  noteIds: string[];
  roles: string[];
  averageVelocity01: number;
  pitchSpan: number;
  noteCount: number;
};

export type TextureWindow = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  densityPerSecond: number;
  energy01: number;
  roleEnergy: Record<string, number>;
};

export type LightingMusicAnalysis = {
  beatSeconds: number;
  barSeconds: number;
  notes: LightingNote[];
  notesByRole: Map<string, LightingNote[]>;
  phrases: LightingPhrase[];
  phrasesByRole: Map<string, LightingPhrase[]>;
  harmonicMoments: HarmonicMoment[];
  textureWindows: TextureWindow[];
  roleRanges: Map<string, RoleRange>;
  mappedSourceEvents: number;
  sourceEvents: number;
};

type IndexedEvent = {
  event: SongEvent;
  sourceIndex: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const mean = (values: number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function analyzeScoreForLighting(score: SongScore): LightingMusicAnalysis {
  const beatSeconds = 60 / score.bpm;
  const barSeconds = beatSeconds * 4;
  const indexed = score.events
    .map((event, sourceIndex) => ({ event, sourceIndex }))
    .filter(({ event }) => Number.isFinite(Number(event.s)))
    .sort((a, b) => Number(a.event.s) - Number(b.event.s) || a.sourceIndex - b.sourceIndex);

  const ranges = buildRoleRanges(indexed);
  const byRoleIndexed = new Map<string, IndexedEvent[]>();
  for (const item of indexed) {
    const role = String(item.event.i || 'other');
    const list = byRoleIndexed.get(role) ?? [];
    list.push(item);
    byRoleIndexed.set(role, list);
  }

  const notes: LightingNote[] = [];
  const notesByRole = new Map<string, LightingNote[]>();
  for (const [role, list] of byRoleIndexed) {
    const range = ranges.get(role) ?? fallbackRange(role);
    let previous: LightingNote | null = null;
    for (const item of list) {
      const start = clamp(Number(item.event.s) || 0, 0, score.duration);
      const rawEnd = Number(item.event.e);
      const end = clamp(Number.isFinite(rawEnd) ? rawEnd : start + beatSeconds * 0.18, start + 0.015, score.duration);
      const noteNumber = clamp(Math.round(Number(item.event.n) || 60), 0, 127);
      const velocity01 = clamp((Number(item.event.v) || 90) / 127, 0, 1);
      const pitch01 = normalizePitch(noteNumber, range);
      const interval = previous ? noteNumber - previous.note : 0;
      const gap = previous ? Math.max(0, start - previous.startSeconds) : Infinity;
      const duration = Math.max(0.015, end - start);
      const durationWeight = clamp(duration / (beatSeconds * 1.5), 0, 1);
      const intervalWeight = clamp(Math.abs(interval) / 12, 0, 1);
      const importance01 = clamp(velocity01 * 0.58 + durationWeight * 0.22 + intervalWeight * 0.20, 0, 1);
      const note: LightingNote = {
        id: `n${item.sourceIndex}`,
        sourceIndex: item.sourceIndex,
        role,
        startSeconds: start,
        endSeconds: end,
        durationSeconds: duration,
        velocity01,
        note: noteNumber,
        pitch01,
        pitchBand: pitch01 < 0.34 ? 'low' : pitch01 > 0.67 ? 'high' : 'mid',
        contour: interval > 0 ? 'up' : interval < 0 ? 'down' : 'repeat',
        intervalFromPrevious: interval,
        onsetGapSeconds: gap,
        importance01,
        ...(role === 'drums' ? { drumKind: drumKind(noteNumber) } : {}),
      };
      notes.push(note);
      const roleNotes = notesByRole.get(role) ?? [];
      roleNotes.push(note);
      notesByRole.set(role, roleNotes);
      previous = note;
    }
  }
  notes.sort((a, b) => a.startSeconds - b.startSeconds || a.sourceIndex - b.sourceIndex);

  const phrases = buildPhrases(notesByRole, beatSeconds, barSeconds);
  const phrasesByRole = new Map<string, LightingPhrase[]>();
  for (const phrase of phrases) {
    const list = phrasesByRole.get(phrase.role) ?? [];
    list.push(phrase);
    phrasesByRole.set(phrase.role, list);
  }

  return {
    beatSeconds,
    barSeconds,
    notes,
    notesByRole,
    phrases,
    phrasesByRole,
    harmonicMoments: buildHarmonicMoments(notes, beatSeconds),
    textureWindows: buildTextureWindows(notes, score.duration, barSeconds),
    roleRanges: ranges,
    mappedSourceEvents: notes.length,
    sourceEvents: score.events.length,
  };
}

function buildRoleRanges(events: IndexedEvent[]): Map<string, RoleRange> {
  const pitches = new Map<string, number[]>();
  for (const { event } of events) {
    const role = String(event.i || 'other');
    if (role === 'drums') continue;
    const note = Number(event.n);
    if (!Number.isFinite(note)) continue;
    const list = pitches.get(role) ?? [];
    list.push(clamp(Math.round(note), 0, 127));
    pitches.set(role, list);
  }

  const result = new Map<string, RoleRange>();
  for (const [role, values] of pitches) {
    const sorted = values.slice().sort((a, b) => a - b);
    const minNote = sorted[0] ?? 0;
    const maxNote = sorted[sorted.length - 1] ?? 127;
    result.set(role, {
      role,
      minNote,
      maxNote,
      lowAnchor: percentile(sorted, 0.10),
      highAnchor: percentile(sorted, 0.90),
      median: percentile(sorted, 0.50),
    });
  }
  return result;
}

function fallbackRange(role: string): RoleRange {
  return { role, minNote: 0, maxNote: 127, lowAnchor: 36, highAnchor: 84, median: 60 };
}

function normalizePitch(note: number, range: RoleRange): number {
  const span = Math.max(1, range.highAnchor - range.lowAnchor);
  return clamp((note - range.lowAnchor) / span, 0, 1);
}

function buildPhrases(
  notesByRole: Map<string, LightingNote[]>,
  beatSeconds: number,
  barSeconds: number,
): LightingPhrase[] {
  const phrases: LightingPhrase[] = [];
  for (const [role, notes] of notesByRole) {
    if (role === 'drums' || !notes.length) continue;
    let buffer: LightingNote[] = [];
    let phraseStart = notes[0]!.startSeconds;
    let phraseCounter = 0;

    const flush = (): void => {
      if (!buffer.length) return;
      phrases.push(summarizePhrase(role, buffer, beatSeconds, phraseCounter++));
      buffer = [];
    };

    for (const note of notes) {
      const previous = buffer[buffer.length - 1];
      const silence = previous ? note.startSeconds - previous.endSeconds : 0;
      const onsetGap = previous ? note.startSeconds - previous.startSeconds : 0;
      const span = note.startSeconds - phraseStart;
      const boundary = Boolean(previous) && (
        silence > beatSeconds * 0.72
        || onsetGap > beatSeconds * 1.35
        || span > barSeconds * 4
      );
      if (boundary) {
        flush();
        phraseStart = note.startSeconds;
      }
      if (!buffer.length) phraseStart = note.startSeconds;
      buffer.push(note);
    }
    flush();
  }
  return phrases.sort((a, b) => a.startSeconds - b.startSeconds || a.role.localeCompare(b.role));
}

function summarizePhrase(role: string, notes: LightingNote[], beatSeconds: number, index: number): LightingPhrase {
  const first = notes[0]!;
  const last = notes[notes.length - 1]!;
  const pitchValues = notes.map((note) => note.note);
  const pitchMin = Math.min(...pitchValues);
  const pitchMax = Math.max(...pitchValues);
  const contourDelta = last.note - first.note;
  const spanBeats = Math.max(0.25, (last.endSeconds - first.startSeconds) / beatSeconds);
  const averageDuration = mean(notes.map((note) => note.durationSeconds));
  const sustainRatio = notes.filter((note) => note.durationSeconds >= beatSeconds * 0.72).length / notes.length;
  const averageVelocity = mean(notes.map((note) => note.velocity01));
  const intervalNovelty = mean(notes.map((note) => clamp(Math.abs(note.intervalFromPrevious) / 12, 0, 1)));
  const importance01 = clamp(averageVelocity * 0.56 + sustainRatio * 0.16 + intervalNovelty * 0.18 + clamp(notes.length / 12, 0, 1) * 0.10, 0, 1);
  return {
    id: `${safeId(role)}-phrase-${index}`,
    role,
    startSeconds: first.startSeconds,
    endSeconds: last.endSeconds,
    noteIds: notes.map((note) => note.id),
    noteCount: notes.length,
    averageVelocity01: averageVelocity,
    averageDurationSeconds: averageDuration,
    pitchMin,
    pitchMax,
    pitchRange: pitchMax - pitchMin,
    contour: phraseContour(notes),
    contourDelta,
    densityPerBeat: notes.length / spanBeats,
    sustainRatio,
    importance01,
    motifKey: motifKey(notes, beatSeconds),
  };
}

function phraseContour(notes: LightingNote[]): PhraseContour {
  if (notes.length < 2) return 'static';
  const values = notes.map((note) => note.note);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  if (range <= 2) return 'static';
  if (Math.abs(last - first) <= 2 && max - Math.max(first, last) >= 4) return 'arch';
  if (Math.abs(last - first) <= 2 && Math.min(first, last) - min >= 4) return 'dip';
  let up = 0;
  let down = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index]! - values[index - 1]!;
    if (delta > 0) up += delta;
    else down += -delta;
  }
  if (last - first >= 3 && up >= down * 0.9) return 'rise';
  if (first - last >= 3 && down >= up * 0.9) return 'fall';
  return 'mixed';
}

function motifKey(notes: LightingNote[], beatSeconds: number): string {
  const slice = notes.slice(0, 6);
  if (!slice.length) return 'empty';
  const intervals: string[] = [];
  const rhythm: string[] = [];
  for (let index = 1; index < slice.length; index += 1) {
    const interval = clamp(slice[index]!.note - slice[index - 1]!.note, -12, 12);
    intervals.push(String(interval));
    const ioi = Math.max(0, slice[index]!.startSeconds - slice[index - 1]!.startSeconds);
    rhythm.push(String(Math.round((ioi / beatSeconds) * 4) / 4));
  }
  return `${intervals.join(',')}|${rhythm.join(',')}`;
}

function buildHarmonicMoments(notes: LightingNote[], beatSeconds: number): HarmonicMoment[] {
  const pitched = notes.filter((note) => note.role !== 'drums');
  const tolerance = Math.max(0.025, beatSeconds * 0.08);
  const moments: HarmonicMoment[] = [];
  let index = 0;
  let counter = 0;
  while (index < pitched.length) {
    const anchor = pitched[index]!;
    const cluster: LightingNote[] = [anchor];
    let cursor = index + 1;
    while (cursor < pitched.length && pitched[cursor]!.startSeconds - anchor.startSeconds <= tolerance) {
      cluster.push(pitched[cursor]!);
      cursor += 1;
    }
    const roles = [...new Set(cluster.map((note) => note.role))];
    if (cluster.length >= 3 || roles.length >= 2) {
      const pitches = cluster.map((note) => note.note);
      moments.push({
        id: `harmony-${counter++}`,
        startSeconds: anchor.startSeconds,
        endSeconds: Math.max(...cluster.map((note) => note.endSeconds)),
        noteIds: cluster.map((note) => note.id),
        roles,
        averageVelocity01: mean(cluster.map((note) => note.velocity01)),
        pitchSpan: Math.max(...pitches) - Math.min(...pitches),
        noteCount: cluster.length,
      });
    }
    index += 1;
  }
  return moments;
}

function buildTextureWindows(notes: LightingNote[], duration: number, barSeconds: number): TextureWindow[] {
  const count = Math.max(1, Math.ceil(duration / barSeconds));
  const raw = Array.from({ length: count }, (_, index) => ({
    index,
    startSeconds: index * barSeconds,
    endSeconds: Math.min(duration, (index + 1) * barSeconds),
    roleEnergy: {} as Record<string, number>,
    eventCount: 0,
    weighted: 0,
  }));
  for (const note of notes) {
    const index = clamp(Math.floor(note.startSeconds / barSeconds), 0, count - 1);
    const window = raw[index];
    if (!window) continue;
    const roleWeight = note.role === 'drums' ? 1.05 : note.role === 'bass' ? 1.1 : 1;
    const value = note.velocity01 * roleWeight * (0.72 + 0.28 * note.importance01);
    window.eventCount += 1;
    window.weighted += value;
    window.roleEnergy[note.role] = (window.roleEnergy[note.role] ?? 0) + value;
  }
  const scale = Math.max(0.001, percentile(raw.map((window) => window.weighted), 0.90));
  return raw.map((window) => {
    const seconds = Math.max(0.001, window.endSeconds - window.startSeconds);
    return {
      index: window.index,
      startSeconds: window.startSeconds,
      endSeconds: window.endSeconds,
      densityPerSecond: window.eventCount / seconds,
      energy01: clamp(window.weighted / scale, 0, 1),
      roleEnergy: window.roleEnergy,
    };
  });
}

function drumKind(note: number): DrumKind {
  if ([35, 36].includes(note)) return 'kick';
  if ([37, 38, 39, 40].includes(note)) return 'snare';
  if ([42, 44, 46].includes(note)) return 'hat';
  if ([41, 43, 45, 47, 48, 50].includes(note)) return 'tom';
  if ([49, 52, 55, 57].includes(note)) return 'crash';
  return 'other';
}

function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.round((sorted.length - 1) * clamp(q, 0, 1));
  return sorted[index] ?? 0;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'other';
}
