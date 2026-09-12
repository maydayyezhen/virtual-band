/**
 * The 128 General MIDI melodic tones, in order, with their 16 families.
 *
 * Ids are zero-based GM program numbers, matching every other tone table in the project. The
 * family ranges describe the GM sound set. Visual routing has explicit exceptions in routeTracks.
 *
 * The percussion bank (bank 128) is not here — that is a note map, not a program list.
 */

export interface GeneralMidiFamily {
  readonly id: string;
  readonly name: string;
  /** Inclusive zero-based program range. */
  readonly from: number;
  readonly to: number;
}

export const GENERAL_MIDI_FAMILIES: readonly GeneralMidiFamily[] = Object.freeze([
  { id: 'piano', name: '钢琴', from: 0, to: 7 },
  { id: 'chromatic', name: '色彩打击', from: 8, to: 15 },
  { id: 'organ', name: '风琴', from: 16, to: 23 },
  { id: 'guitar', name: '吉他', from: 24, to: 31 },
  { id: 'bass', name: '贝斯', from: 32, to: 39 },
  { id: 'strings', name: '弦乐', from: 40, to: 47 },
  { id: 'ensemble', name: '合奏 / 人声', from: 48, to: 55 },
  { id: 'brass', name: '铜管', from: 56, to: 63 },
  { id: 'reed', name: '簧管', from: 64, to: 71 },
  { id: 'pipe', name: '管乐', from: 72, to: 79 },
  { id: 'synth-lead', name: '合成主音', from: 80, to: 87 },
  { id: 'synth-pad', name: '合成铺底', from: 88, to: 95 },
  { id: 'synth-fx', name: '合成效果', from: 96, to: 103 },
  { id: 'ethnic', name: '民族', from: 104, to: 111 },
  { id: 'percussive', name: '打击', from: 112, to: 119 },
  { id: 'sound-fx', name: '音效', from: 120, to: 127 },
]);

/** Zero-based program index to name. Index is the program number, so entry 0 is GM program 1. */
export const GENERAL_MIDI_TONES: readonly string[] = Object.freeze([
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
  'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
  'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)',
  'Electric Guitar (clean)', 'Electric Guitar (muted)', 'Overdriven Guitar',
  'Distortion Guitar', 'Guitar Harmonics',
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass',
  'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  'String Ensemble 1', 'String Ensemble 2', 'SynthStrings 1', 'SynthStrings 2',
  'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
  'French Horn', 'Brass Section', 'SynthBrass 1', 'SynthBrass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
  'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
  'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
  'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
  'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
  'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
  'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
  'Sitar', 'Banjo', 'Shamisen', 'Koto',
  'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
  'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
  'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot',
]);

export function generalMidiToneName(program: number): string {
  return GENERAL_MIDI_TONES[program] ?? `Program ${program}`;
}

export function generalMidiFamilyOf(program: number): GeneralMidiFamily | null {
  return GENERAL_MIDI_FAMILIES.find((family) => program >= family.from && program <= family.to) ?? null;
}
