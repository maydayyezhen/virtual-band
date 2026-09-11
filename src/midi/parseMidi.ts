import * as midiModule from '@tonejs/midi';
import type { Midi as MidiFile } from '@tonejs/midi';
import type { MidiNote, MidiTrack, ParsedMidi } from './types';

type MidiConstructor = new (data: ArrayBuffer) => MidiFile;

/**
 * Find the `Midi` constructor whichever way the module was loaded.
 *
 * The package ships CommonJS while declaring named exports, so the two environments disagree:
 * Node exposes it on `default`, and Vite's pre-bundling exposes it directly. Reaching for both
 * keeps the same file usable from a script and from the page.
 */
function resolveMidiConstructor(): MidiConstructor {
  const namespace = midiModule as unknown as {
    Midi?: MidiConstructor;
    default?: { Midi?: MidiConstructor };
  };
  const found = namespace.Midi ?? namespace.default?.Midi;
  if (!found) throw new Error('@tonejs/midi 没有导出 Midi');
  return found;
}

/**
 * Read a Standard MIDI File into the flat shape the band planner works with.
 *
 * Seconds, not ticks: the parser resolves the tempo map, so everything downstream can treat time
 * as ordinary seconds. Notes with no duration are dropped — a zero-length note cannot be played.
 */
export function parseMidi(data: ArrayBuffer | Uint8Array): ParsedMidi {
  const Midi = resolveMidiConstructor();
  const midi = new Midi(data as ArrayBuffer);

  const tracks: MidiTrack[] = [];
  for (let index = 0; index < midi.tracks.length; index += 1) {
    const track = midi.tracks[index];
    const notes: MidiNote[] = [];
    for (const note of track.notes) {
      const start = note.time;
      const end = note.time + note.duration;
      if (!(end > start)) continue;
      notes.push({
        note: note.midi,
        velocity: Math.max(1, Math.min(127, Math.round(note.velocity * 127))),
        start,
        end,
      });
    }
    if (!notes.length) continue;
    notes.sort((a, b) => a.start - b.start || a.note - b.note);

    tracks.push({
      index,
      name: track.name || `Track ${index}`,
      channel: track.channel,
      program: track.instrument.number,
      isDrums: track.channel === 9,
      notes,
      firstNote: notes[0].start,
      lastNote: notes.reduce((max, note) => Math.max(max, note.end), 0),
    });
  }

  return {
    name: midi.header.name || '未命名',
    duration: midi.duration,
    tracks,
    tempoCount: midi.header.tempos.length,
  };
}
