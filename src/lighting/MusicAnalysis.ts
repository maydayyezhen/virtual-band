import { resolveMidiConstructor } from '../midi/parseMidi.ts';
import { clamp } from './math.ts';

export const ROLES = ['kick', 'snare', 'hat', 'crash', 'tom', 'bass', 'piano', 'guitar', 'lead', 'choir', 'strings'] as const;
export type MusicRole = typeof ROLES[number];
export interface MusicNote { time: number; end: number; note: number; channel: number; velocity: number; program: number }
export type MusicFrame = Record<MusicRole | `${MusicRole}Note` | `${MusicRole}Channel`, number> & {
  t: number; duration: number; quarter: number; bpm: number; energy: number; tail: number; finished: boolean;
};
const DECAY: Record<MusicRole, number> = { kick: .22, snare: .17, hat: .065, crash: .8, tom: .19, bass: .26, piano: .34, guitar: .26, lead: .34, choir: .52, strings: .72 };

export function defaultRole(n: MusicNote): MusicRole {
  if (n.channel === 9) return [35, 36].includes(n.note) ? 'kick' : [38, 39, 40].includes(n.note) ? 'snare'
    : [42, 44, 46].includes(n.note) ? 'hat' : [49, 51, 52, 55, 57, 59].includes(n.note) ? 'crash' : 'tom';
  if (n.program >= 32 && n.program <= 39) return 'bass';
  if (n.program >= 24 && n.program <= 31) return 'guitar';
  if (n.program < 24) return 'piano';
  if (n.program >= 52 && n.program <= 55) return 'choir';
  if (n.program >= 48 && n.program <= 51) return 'strings';
  return 'lead';
}

function upper<T>(list: readonly T[], time: number, value: (item: T) => number): number {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (value(list[mid]) <= time) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Reads original notes and the tempo map, independently of visual instrument allocation. */
export class MusicAnalysis {
  readonly duration: number;
  readonly ppq: number;
  readonly groups = Object.fromEntries(ROLES.map(role => [role, [] as MusicNote[]])) as Record<MusicRole, MusicNote[]>;
  readonly tempos: readonly { time: number; quarter: number; bpm: number }[];
  private readonly header;
  constructor(binary: Uint8Array | ArrayBuffer, roleOf: (note: MusicNote) => MusicRole = defaultRole) {
    const Midi = resolveMidiConstructor();
    const midi = new Midi(binary as ArrayBuffer);
    this.header = midi.header;
    this.ppq = midi.header.ppq;
    this.duration = Math.max(midi.duration, ...midi.tracks.map(track => midi.header.ticksToSeconds(track.endOfTrackTicks ?? 0)));
    this.tempos = [{ time: 0, quarter: 0, bpm: 120 }, ...midi.header.tempos.map(tempo => ({
      time: midi.header.ticksToSeconds(tempo.ticks), quarter: tempo.ticks / this.ppq, bpm: tempo.bpm,
    }))].sort((a, b) => a.time - b.time);
    for (const track of midi.tracks) for (const note of track.notes) {
      const item: MusicNote = { time: note.time, end: note.time + note.duration, note: note.midi,
        channel: track.channel, program: track.instrument.number, velocity: note.velocity };
      this.groups[roleOf(item)].push(item);
    }
    for (const role of ROLES) this.groups[role].sort((a, b) => a.time - b.time);
  }
  secondsAtBeat(quarter: number): number { return this.header.ticksToSeconds(quarter * this.ppq); }
  at(seconds: number): MusicFrame {
    if (!Number.isFinite(seconds)) throw new Error('Invalid music time');
    const t = clamp(seconds, 0, this.duration);
    const tempo = this.tempos[Math.max(0, upper(this.tempos, t, item => item.time) - 1)];
    // Header.secondsToTicks rounds to integer ticks; continuous beat phase avoids stepped movement.
    const frame = { t, duration: this.duration, quarter: tempo.quarter + (t - tempo.time) * tempo.bpm / 60, bpm: tempo.bpm } as MusicFrame;
    for (const role of ROLES) {
      const notes = this.groups[role], index = upper(notes, t, n => n.time);
      const drum = ROLES.indexOf(role) < 5;
      let sum = 0;
      for (let i = index - 1; i >= 0 && notes[i].time > t - (drum ? 2 : 4); i--) {
        const note = notes[i];
        sum += note.velocity * (Math.exp(-(t - note.time) / DECAY[role]) + (!drum && note.end > t ? .16 : 0));
      }
      frame[role] = Math.min(1, sum / (drum ? 1.12 : 1.75));
      frame[`${role}Note`] = notes[index - 1]?.note ?? 60;
      frame[`${role}Channel`] = notes[index - 1]?.channel ?? 0;
    }
    frame.energy = clamp(.25 * frame.piano + .24 * frame.guitar + .2 * frame.lead + .18 * frame.bass + .28 * frame.kick + .23 * frame.snare + .15 * frame.choir);
    frame.tail = 1; // Song-specific ending fades belong in the arrangement.
    frame.finished = t >= this.duration;
    return frame;
  }
}
