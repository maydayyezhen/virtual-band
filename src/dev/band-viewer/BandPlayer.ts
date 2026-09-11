import type { BandAudioGraph } from '../../audio/BandAudioGraph';
import type { KeyboardInstrument } from '../../instruments/keyboard/KeyboardInstrument';
import type { BandInstrumentType, RoutedTrack } from '../../midi';
import type { BandPlan } from '../../midi/planBand';
import type { BuiltBand } from './buildMidiBand';

/**
 * Play a planned band.
 *
 * The audio clock is the master, not the frame clock: `requestAnimationFrame` stutters under load,
 * and a band that drifts against its own sound is worse than one that drops a frame. Each frame
 * asks the audio context the time and fires whatever has come due.
 *
 * Note-ons and note-offs each keep a cursor, so a frame costs the events it fires rather than a scan
 * of the whole song.
 */

export interface BandPlayerOptions {
  readonly graph: BandAudioGraph;
  readonly band: BuiltBand;
  readonly routed: readonly RoutedTrack[];
  readonly plan: BandPlan;
  /**
   * The song's own length, in seconds.
   *
   * Note events can end before the file does — a closing chord held for a minute is cut short by
   * the hold ceiling, and the transport should still show the piece the listener is hearing.
   */
  readonly songDuration?: number;
  /** Called when playback reaches the end and stops on its own. */
  readonly onEnded?: () => void;
}

interface ScheduledEvent {
  readonly time: number;
  readonly kind: 'on' | 'off';
  readonly type: BandInstrumentType;
  readonly instance: number;
  readonly tier: 'lower' | 'upper' | null;
  readonly program: number;
  readonly note: number;
  readonly velocity: number;
}

/**
 * Longest a note is held, by instrument.
 *
 * A note whose end never arrives would hold a string or a key down for the rest of the song. These
 * only ever shorten a note, never extend it, and match the ceilings the showcase already uses.
 */
const HOLD_CEILING: Readonly<Record<BandInstrumentType, number>> = Object.freeze({
  drums: 0.5,
  bass: 3,
  keyboard: 5.5,
  electric: 4.2,
  acoustic: 4.2,
  violin: 5.5,
});

/** How far ahead of the clock notes fire, in seconds. Visuals run slightly early. */
const LOOKAHEAD_SECONDS = 0.012;

function voiceKey(event: { type: string; instance: number; tier: string | null; note: number }): string {
  return `${event.type}.${event.instance}:${event.tier ?? '-'}:${event.note}`;
}

export class BandPlayer {
  private readonly options: BandPlayerOptions;
  private ons: ScheduledEvent[] = [];
  private offs: ScheduledEvent[] = [];
  private onCursor = 0;
  private offCursor = 0;
  private running = false;
  private startClock = 0;
  private pausedAt = 0;
  private lastTime = 0;
  private duration = 0;
  /** Program currently set on each instrument, so a change is sent only when it changes. */
  private readonly programs = new Map<string, number>();

  constructor(options: BandPlayerOptions) {
    this.options = options;
    this.build();
  }

  get isPlaying(): boolean {
    return this.running;
  }

  get time(): number {
    return this.running ? Math.max(0, this.clock() - this.startClock) : this.pausedAt;
  }

  get total(): number {
    return this.duration;
  }

  /** Notes scheduled, for diagnostics. Zero means the plan produced nothing to play. */
  get scheduledNotes(): number {
    return this.ons.length;
  }

  async play(): Promise<void> {
    if (this.running || this.duration <= 0) return;
    await this.options.graph.audio.resume();
    if (this.pausedAt >= this.duration) this.pausedAt = 0;
    this.startClock = this.clock() - this.pausedAt;
    this.running = true;
    this.seekCursors(this.pausedAt);
    this.lastTime = this.pausedAt;
  }

  pause(): void {
    if (!this.running) return;
    this.pausedAt = this.time;
    this.running = false;
    this.silence();
  }

  stop(): void {
    this.running = false;
    this.pausedAt = 0;
    this.lastTime = 0;
    this.silence();
    this.seekCursors(0);
  }

  seek(seconds: number): void {
    const target = Math.max(0, Math.min(this.duration, seconds));
    this.silence();
    this.pausedAt = target;
    if (this.running) this.startClock = this.clock() - target;
    this.seekCursors(target);
    this.lastTime = target;
    // Put back whatever should be sounding here rather than waiting for the next note-on, so
    // seeking into the middle of a held chord does not arrive silent.
    if (this.running) this.repress(target);
  }

  /** Advance to the audio clock. Called once per frame. */
  update(): void {
    if (!this.running) return;
    const now = this.time;
    const until = now + LOOKAHEAD_SECONDS;

    // Everything due up to now is fired, however long the frame took.
    //
    // There used to be a "the clock jumped, treat it as a seek" guard here, and it was wrong: a
    // slow frame advances the audio clock just as far as a seek does, so on a slow machine every
    // frame looked like a seek and rebuilt the whole band — which reset the instruments before any
    // of them could animate. Seeks arrive through `seek()`; the only other way the clock moves
    // without us is a suspended tab, and that has its own event.
    while (this.onCursor < this.ons.length && this.ons[this.onCursor].time <= until) {
      this.fire(this.ons[this.onCursor], 'on');
      this.onCursor += 1;
    }
    while (this.offCursor < this.offs.length && this.offs[this.offCursor].time <= until) {
      this.fire(this.offs[this.offCursor], 'off');
      this.offCursor += 1;
    }
    this.lastTime = now;

    if (now >= this.duration) {
      this.running = false;
      this.pausedAt = 0;
      this.lastTime = 0;
      this.silence();
      this.seekCursors(0);
      this.options.onEnded?.();
    }
  }

  /**
   * The tab was hidden and has come back.
   *
   * Its clock kept running while nothing was drawn, so the band would otherwise try to play every
   * note it missed in one burst. Rebuild the state at the current position instead.
   */
  resumeFromSuspension(): void {
    if (!this.running) return;
    this.seek(this.time);
  }

  dispose(): void {
    this.silence();
  }

  private clock(): number {
    return this.options.graph.audio.getContext().currentTime;
  }

  private build(): void {
    const ons: ScheduledEvent[] = [];
    const offs: ScheduledEvent[] = [];
    const { plan, routed } = this.options;
    const trackById = new Map(routed.map((track) => [track.index, track]));

    for (const entry of plan.instruments) {
      const ceiling = HOLD_CEILING[entry.type];
      for (const assignment of entry.assignments) {
        const track = trackById.get(assignment.track.index);
        if (!track) continue;
        const base = {
          type: entry.type,
          instance: assignment.instance,
          tier: assignment.tier,
          program: track.program,
          note: 0,
          velocity: 0,
        };
        for (const note of track.notes) {
          ons.push({ ...base, note: note.note, velocity: note.velocity, time: note.start, kind: 'on' });
          offs.push({
            ...base,
            note: note.note,
            velocity: note.velocity,
            time: Math.min(note.end, note.start + ceiling),
            kind: 'off',
          });
        }
      }
    }

    ons.sort((a, b) => a.time - b.time);
    offs.sort((a, b) => a.time - b.time);
    this.ons = ons;
    this.offs = offs;
    this.duration = Math.max(
      ons.at(-1)?.time ?? 0,
      offs.at(-1)?.time ?? 0,
      this.options.songDuration ?? 0,
    );
  }

  private seekCursors(seconds: number): void {
    const first = (events: ScheduledEvent[]): number => {
      const index = events.findIndex((event) => event.time > seconds);
      return index < 0 ? events.length : index;
    };
    this.onCursor = first(this.ons);
    this.offCursor = first(this.offs);
  }

  /** Which notes should be sounding at `seconds`, replayed in one time-ordered pass. */
  private repress(seconds: number): void {
    const active = new Map<string, ScheduledEvent>();
    // Note-ons and note-offs have to be interleaved by time. Sweeping all the ons first and then
    // all the offs looks equivalent and is not: a note released at 100s deletes the entry made by
    // the same note pressed again at 199s, which leaves almost everything silent after a seek.
    const timeline = [...this.ons, ...this.offs].sort(
      (a, b) => a.time - b.time || (a.kind === 'off' ? -1 : 1),
    );
    for (const event of timeline) {
      if (event.time > seconds) break;
      const key = voiceKey(event);
      if (event.kind === 'on') active.set(key, event);
      else active.delete(key);
    }
    for (const event of active.values()) this.fire(event, 'on');
  }

  private silence(): void {
    for (const record of this.options.band.built) record.instrument.reset();
    this.programs.clear();
  }

  private fire(event: ScheduledEvent, kind: 'on' | 'off'): void {
    const record = this.options.band.byKey.get(`${event.type}.${event.instance}`);
    if (!record) return;
    const instrument = record.instrument;
    const keyboard = event.type === 'keyboard' ? (instrument as KeyboardInstrument) : null;

    if (kind === 'off') {
      if (keyboard && event.tier) keyboard.noteOffTier(event.note, event.tier);
      else instrument.noteOff(event.note);
      return;
    }

    this.applyProgram(event, instrument);
    if (keyboard && event.tier) keyboard.noteOnTier(event.note, event.velocity, event.tier, 'midi');
    else instrument.noteOn(event.note, event.velocity);
  }

  /**
   * Adopt the track's tone before its first note.
   *
   * One player covers tracks that take turns, so the tone has to change between them — this is the
   * keyboard player reaching for the next registration. Drums are skipped: their program selects a
   * kit, not a tone, and channel 10 carries no meaningful program anyway.
   */
  private applyProgram(
    event: ScheduledEvent,
    instrument: { setProgram?: (first: number | string, second?: number) => boolean },
  ): void {
    if (event.type === 'drums') return;
    if (!instrument.setProgram) return;
    const key = `${event.type}.${event.instance}${event.tier ? `:${event.tier}` : ''}`;
    const current = this.programs.get(key);
    if (current === event.program) return;

    if (event.type === 'keyboard' && event.tier) instrument.setProgram(event.tier, event.program);
    else instrument.setProgram(event.program);
    this.programs.set(key, event.program);
  }
}
