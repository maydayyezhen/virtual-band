/**
 * A MIDI file reduced to what the band needs: tracks of notes with seconds already resolved.
 *
 * Tempo maps, running status, note-on-at-zero-velocity and everything else about the binary format
 * is the parser's problem, not ours. By the time a track reaches this shape, time is in seconds
 * and every note has a start and an end.
 */

import { LAYOUT_INSTRUMENTS, type LayoutInstrumentType } from '../layout/LayoutDocument';

/**
 * The six instruments a track can be routed to.
 *
 * This is the layout vocabulary, not a copy of it. An instrument the router can choose is by
 * definition one the placement engine can stand on a stage, so the two lists are the same list.
 * Keeping a second one spelled out here is how a band ends up holding a type that has nowhere to
 * stand, and how a layout comes to mean one thing in the editor and another in the band.
 */
export type BandInstrumentType = LayoutInstrumentType;

export const BAND_INSTRUMENT_TYPES: readonly BandInstrumentType[] = Object.freeze(
  LAYOUT_INSTRUMENTS.map((instrument) => instrument.id),
);

export interface MidiNote {
  /** MIDI note number, 0–127. */
  readonly note: number;
  /** 1–127. */
  readonly velocity: number;
  /** Seconds from the start of the file. */
  readonly start: number;
  /** Seconds from the start of the file. */
  readonly end: number;
}

export interface MidiTrack {
  readonly index: number;
  readonly name: string;
  /** Zero-based MIDI channel, 0–15. Channel 9 is percussion. */
  readonly channel: number;
  /** Zero-based GM program the track mostly plays. */
  readonly program: number;
  readonly isDrums: boolean;
  readonly notes: readonly MidiNote[];
  /** Earliest note start, seconds. */
  readonly firstNote: number;
  /** Latest note end, seconds. */
  readonly lastNote: number;
}

export interface ParsedMidi {
  readonly name: string;
  readonly duration: number;
  readonly tracks: readonly MidiTrack[];
  /** Tempo changes per minute, for display only. */
  readonly tempoCount: number;
}

/** A track after routing, with the instrument it was given to. */
export interface RoutedTrack extends MidiTrack {
  readonly type: BandInstrumentType;
  /** Why it went where it did, for the report. */
  readonly reason: string;
}
