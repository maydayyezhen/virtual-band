import type { BandPlan, TrackAssignment } from './planBand';

export interface VisualNote {
  readonly id: number;
  readonly assignment: TrackAssignment;
  readonly note: number;
  readonly velocity: number;
  readonly start: number;
  readonly end: number;
}
interface VisualEvent { time: number; on: boolean; note: VisualNote }

/** Animation only. The audio sequencer owns time and never consumes these events. */
export class VisualPerformance {
  private readonly events: VisualEvent[] = [];
  private readonly active = new Map<number, VisualNote>();
  private cursor = 0;
  private lastTime = -Infinity;
  readonly noteCount: number;

  constructor(plan: BandPlan, private readonly show: (note: VisualNote) => void,
    private readonly hide: (note: VisualNote) => void, private readonly reset?: () => void) {
    let id = 0;
    for (const instrument of plan.instruments) {
      for (const assignment of instrument.assignments) {
        for (const source of assignment.track.notes) {
          const note = { ...source, id: id++, assignment };
          this.events.push({ time: note.start, on: true, note }, { time: note.end, on: false, note });
        }
      }
    }
    this.events.sort((a, b) => a.time - b.time || Number(a.on) - Number(b.on) || a.note.id - b.note.id);
    this.noteCount = id;
  }
  update(time: number): void {
    // Restore the pose after a stalled renderer instead of replaying obsolete gestures.
    if (!Number.isFinite(this.lastTime) || time < this.lastTime) { this.seek(time); return; }
    if (time - this.lastTime > 0.25) { this.catchUp(time); return; }
    while (this.cursor < this.events.length && this.events[this.cursor].time <= time) {
      const event = this.events[this.cursor++];
      if (event.on) { this.active.set(event.note.id, event.note); this.show(event.note); }
      else {
        this.active.delete(event.note.id);
        if (!this.hasSameKey(event.note)) this.hide(event.note);
      }
    }
    this.lastTime = time;
  }
  seek(time: number): void {
    this.clear();
    while (this.cursor < this.events.length && this.events[this.cursor].time <= time) {
      const event = this.events[this.cursor++];
      if (event.on) this.active.set(event.note.id, event.note);
      else this.active.delete(event.note.id);
    }
    for (const note of this.active.values()) this.show(note);
    this.lastTime = time;
  }
  clear(): void {
    for (const note of this.active.values()) this.hide(note);
    this.reset?.();
    this.active.clear();
    this.cursor = 0;
    this.lastTime = -Infinity;
  }
  private catchUp(time: number): void {
    const previous = new Map(this.active);
    while (this.cursor < this.events.length && this.events[this.cursor].time <= time) {
      const event = this.events[this.cursor++];
      if (event.on) this.active.set(event.note.id, event.note);
      else this.active.delete(event.note.id);
    }
    // Keep already-held poses intact even on a consistently slow renderer.
    for (const [id, note] of previous) {
      if (!this.active.has(id) && !this.hasSameKey(note)) this.hide(note);
    }
    for (const [id, note] of this.active) if (!previous.has(id)) this.show(note);
    this.lastTime = time;
  }
  private hasSameKey(note: VisualNote): boolean {
    return [...this.active.values()].some((other) => other.note === note.note
      && other.assignment.track.type === note.assignment.track.type
      && other.assignment.instance === note.assignment.instance
      && other.assignment.tier === note.assignment.tier);
  }
}
