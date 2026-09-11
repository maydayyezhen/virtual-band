import type { BandInstrumentType, MidiTrack, RoutedTrack } from './types';
import { BAND_INSTRUMENT_TYPES } from './types';

/**
 * Turn routed tracks into a band: how many of each instrument, and which track goes to which one.
 *
 * From docs/MIDI_BAND_SPEC.md section 3. Two rules do all the work:
 *
 * - `drums` and `bass` are always one. A drum kit is one person with many pieces, an electric bass
 *   is one person with one instrument, and neither ever doubles in reality.
 * - Everything else is sized by how many of its tracks are *sounding at the same moment*. Tracks
 *   that take turns are one player switching patches; tracks that overlap are two players.
 *
 * A patch change is free, so overlap — not track count — is what costs an instrument.
 */

/** Overlap shorter than this is a coincidence at a phrase boundary, not two people playing. */
const MIN_OVERLAP_SECONDS = 1;
/**
 * A gap this short means the part is still being played.
 *
 * Counting "is this track sounding" per note makes a staccato part flicker in and out — a piano
 * playing continuous eighth notes with rests between them looks idle at every rest and the peak
 * gets undercounted. What matters is whether the player is on this part during the passage, so
 * short rests are bridged rather than treated as silence.
 */
const PART_GAP_SECONDS = 1;
/** A player can cover two simultaneous parts; more than that and they are not really playing them. */
const TRACKS_PER_PLAYER = 2;
/** Past this many of one instrument the stage stops reading as a band. */
const MAX_PER_TYPE = 3;
/** A part this short is a placeholder or debris, not a performance. */
export const MIN_NOTES_PER_TRACK = 3;
/** Notes above this, or below its counterpart, have no key on the upper tier. */
export const UPPER_TIER_MIN_NOTE = 36;
export const UPPER_TIER_MAX_NOTE = 96;

export interface TrackAssignment {
  readonly track: RoutedTrack;
  /** Zero-based index among instruments of this type. */
  readonly instance: number;
  /** Keyboard only: which manual. Null for the other instruments. */
  readonly tier: 'lower' | 'upper' | null;
}

export interface InstrumentPlan {
  readonly type: BandInstrumentType;
  readonly count: number;
  readonly reason: string;
  /** Most tracks sounding at once, ignoring overlaps shorter than a second. */
  readonly peakTogether: number;
  readonly assignments: readonly TrackAssignment[];
}

export interface BandPlan {
  readonly instruments: readonly InstrumentPlan[];
  readonly totalInstruments: number;
  readonly diagnostics: readonly string[];
}

/** Intervals where a track is being played, with short rests bridged. */
function soundingIntervals(track: MidiTrack, gapSeconds = PART_GAP_SECONDS): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  for (const note of track.notes) {
    const last = merged[merged.length - 1];
    if (last && note.start <= last[1] + gapSeconds) {
      if (note.end > last[1]) last[1] = note.end;
    } else {
      merged.push([note.start, note.end]);
    }
  }
  return merged;
}

/**
 * How many tracks are sounding at the same moment, counting only stretches that last a while.
 *
 * The longest stretch wins rather than the highest instantaneous count: three tracks touching for
 * a tenth of a second at a bar line is not three people playing.
 */
function peakSoundingTogether(tracks: readonly MidiTrack[]): { peak: number; at: number } {
  const moments: Array<[number, number, number]> = []; // time, delta, trackIndex
  for (let i = 0; i < tracks.length; i += 1) {
    for (const [from, to] of soundingIntervals(tracks[i])) {
      moments.push([from, 1, i]);
      moments.push([to, -1, i]);
    }
  }
  if (!moments.length) return { peak: 0, at: 0 };
  moments.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const live = new Set<number>();
  let best = 0;
  let bestAt = 0;
  let previousTime = moments[0][0];
  let previousCount = 0;

  for (let i = 0; i < moments.length; ) {
    const time = moments[i][0];
    const heldFor = time - previousTime;
    if (heldFor >= MIN_OVERLAP_SECONDS && previousCount > best) {
      best = previousCount;
      bestAt = previousTime;
    }
    while (i < moments.length && moments[i][0] === time) {
      const [, delta, trackIndex] = moments[i];
      if (delta > 0) live.add(trackIndex);
      else live.delete(trackIndex);
      i += 1;
    }
    previousTime = time;
    previousCount = live.size;
  }

  return { peak: best, at: bestAt };
}

function overlaps(a: readonly [number, number][], b: readonly [number, number][]): boolean {
  for (const [aFrom, aTo] of a) {
    for (const [bFrom, bTo] of b) {
      if (aFrom < bTo && bFrom < aTo) return true;
    }
  }
  return false;
}

/** Total seconds two sets of intervals are both sounding. */
function overlapSeconds(
  existing: readonly (readonly [number, number][])[],
  candidate: readonly [number, number][],
): number {
  let total = 0;
  for (const list of existing) {
    for (const [aFrom, aTo] of list) {
      for (const [bFrom, bTo] of candidate) {
        total += Math.max(0, Math.min(aTo, bTo) - Math.max(aFrom, bFrom));
      }
    }
  }
  return total;
}

/** Does the candidate collide with anything already sitting in the slot? */
function collidesWithSlot(
  existing: readonly (readonly [number, number][])[],
  candidate: readonly [number, number][],
): boolean {
  return existing.some((list) => overlaps(list, candidate));
}

interface Slot {
  readonly instance: number;
  readonly tier: 'lower' | 'upper' | null;
  readonly tracks: RoutedTrack[];
  readonly intervals: Array<[number, number][]>;
}

/** Every note of the track fits between the upper tier's outer keys. */
function fitsUpperTier(track: MidiTrack): boolean {
  return track.notes.every((note) => note.note >= UPPER_TIER_MIN_NOTE && note.note <= UPPER_TIER_MAX_NOTE);
}

function planType(
  type: BandInstrumentType,
  tracks: readonly RoutedTrack[],
  diagnostics: string[],
): InstrumentPlan {
  if (type === 'drums' || type === 'bass') {
    const assignments = tracks.map((track) => ({ track, instance: 0, tier: null as null }));
    return {
      type,
      count: 1,
      reason: type === 'drums' ? '一个鼓手一套鼓，多条鼓轨并到一套上' : '一个贝斯手一把琴',
      peakTogether: tracks.length,
      assignments,
    };
  }

  const { peak, at } = peakSoundingTogether(tracks);
  const count = Math.max(1, Math.min(MAX_PER_TYPE, Math.ceil(peak / TRACKS_PER_PLAYER)));
  const isKeyboard = type === 'keyboard';

  // First fit: walk tracks in start order and drop each into the earliest slot it can occupy.
  // A slot is one player — for the keyboard that is one manual, so a keyboard offers two.
  const slots: Slot[] = [];
  const crowded: Array<{ track: RoutedTrack; instance: number; tier: 'lower' | 'upper' | null }> = [];
  const openInstance = (): void => {
    const instance = slots.length ? Math.max(...slots.map((slot) => slot.instance)) + 1 : 0;
    if (isKeyboard) {
      slots.push({ instance, tier: 'lower', tracks: [], intervals: [] });
      slots.push({ instance, tier: 'upper', tracks: [], intervals: [] });
    } else {
      slots.push({ instance, tier: null, tracks: [], intervals: [] });
    }
  };
  openInstance();

  // Most constrained first. A part that cannot sit on the upper tier has to claim a lower slot
  // before parts that could go anywhere take it; otherwise an unconstrained part parks downstairs
  // and forces an extra keyboard onto the stage for no reason.
  const ordered = [...tracks].sort((a, b) => {
    if (isKeyboard) {
      const constraint = Number(fitsUpperTier(a)) - Number(fitsUpperTier(b));
      if (constraint !== 0) return constraint;
    }
    return a.firstNote - b.firstNote;
  });
  const assignments: TrackAssignment[] = [];
  for (const track of ordered) {
    const intervals = soundingIntervals(track);
    const fits = (candidate: Slot): boolean =>
      !(isKeyboard && candidate.tier === 'upper' && !fitsUpperTier(track));

    let target = slots.find((candidate) => fits(candidate) && !collidesWithSlot(candidate.intervals, intervals));

    if (!target) {
      const nextInstance = slots.length ? Math.max(...slots.map((slot) => slot.instance)) + 1 : 0;
      if (nextInstance < MAX_PER_TYPE) {
        openInstance();
        target = isKeyboard ? slots[slots.length - 2] : slots[slots.length - 1];
      } else {
        // The cap is reached. Rather than stand another one on stage, the part shares a slot with
        // whichever player is already least busy during it — the instrument plays what it can
        // reach and drops the rest, which is what a real player does with an impossible part.
        const usable = slots.filter(fits);
        target = usable.reduce((best, candidate) =>
          overlapSeconds(candidate.intervals, intervals) < overlapSeconds(best.intervals, intervals)
            ? candidate
            : best,
        );
        crowded.push({ track, instance: target.instance, tier: target.tier });
      }
    }

    target.tracks.push(track);
    target.intervals.push(intervals);
    assignments.push({ track, instance: target.instance, tier: target.tier });
  }

  for (const entry of crowded) {
    diagnostics.push(
      `${type}已达上限 ${MAX_PER_TYPE} 件：轨 ${entry.track.index}（${entry.track.name}）与别人共用第 ${entry.instance + 1} 件，` +
        `乐器弹不出来的音会被它自己丢掉`,
    );
  }

  const used = Math.max(...assignments.map((entry) => entry.instance)) + 1;
  if (used > count) {
    diagnostics.push(
      `${type}: 排布用了 ${used} 件，但按"同时最多 ${peak} 条"算只需要 ${count} 件 —— 音域限制把轨挤到了更多件上`,
    );
  }

  const reason = isKeyboard
    ? `一台琴两层，同时最多 ${peak} 条轨（${at.toFixed(0)}s 起）`
    : `同时最多 ${peak} 条轨在响（${at.toFixed(0)}s 起），一件最多承担 ${TRACKS_PER_PLAYER} 条`;

  return { type, count: Math.max(count, used), reason, peakTogether: peak, assignments };
}

export function planBand(routed: readonly RoutedTrack[]): BandPlan {
  const diagnostics: string[] = [];
  const instruments: InstrumentPlan[] = [];

  for (const type of BAND_INSTRUMENT_TYPES) {
    const tracks = routed.filter((track) => track.type === type);
    if (!tracks.length) continue;
    instruments.push(planType(type, tracks, diagnostics));
  }

  const single = routed.filter((track) => track.notes.length <= 2);
  for (const track of single) {
    diagnostics.push(
      `轨 ${track.index}（${track.name}）只有 ${track.notes.length} 个音，可能是占位或杂物，仍按 ${track.type} 处理`,
    );
  }

  return {
    instruments,
    totalInstruments: instruments.reduce((sum, plan) => sum + plan.count, 0),
    diagnostics,
  };
}
