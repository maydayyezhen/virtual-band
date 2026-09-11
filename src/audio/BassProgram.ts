/**
 * Every GM bass program this instrument can play.
 *
 * Ids are zero-based GM program numbers: 32 is GM program 33 (Acoustic Bass) and 37 is
 * GM program 38 (Slap Bass 2). The two synth basses (38, 39) are deliberately absent —
 * a synth bass is a keyboard part in reality, so it routes there instead.
 */
export const BASS_PROGRAM_IDS = [32, 33, 34, 35, 36, 37] as const;

export type BassProgramId = (typeof BASS_PROGRAM_IDS)[number];

export interface BassProgramPreset {
  readonly id: BassProgramId;
  readonly name: string;
}

export const DEFAULT_BASS_PROGRAM: BassProgramId = 33;

const BASS_PROGRAMS: Readonly<Record<BassProgramId, BassProgramPreset>> = {
  32: { id: 32, name: 'Acoustic Bass' },
  33: { id: 33, name: 'Fingered Bass' },
  34: { id: 34, name: 'Picked Bass' },
  35: { id: 35, name: 'Fretless Bass' },
  36: { id: 36, name: 'Slap Bass 1' },
  37: { id: 37, name: 'Slap Bass 2' },
};

export function isBassProgramId(value: number): value is BassProgramId {
  return BASS_PROGRAM_IDS.includes(value as BassProgramId);
}

export function getBassProgram(value: number): BassProgramPreset | null {
  return isBassProgramId(value) ? BASS_PROGRAMS[value] : null;
}
