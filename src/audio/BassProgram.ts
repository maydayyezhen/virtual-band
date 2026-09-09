export const BASS_PROGRAM_IDS = [33, 34, 36] as const;

export type BassProgramId = (typeof BASS_PROGRAM_IDS)[number];

export interface BassProgramPreset {
  readonly id: BassProgramId;
  readonly name: string;
}

export const DEFAULT_BASS_PROGRAM: BassProgramId = 33;

const BASS_PROGRAMS: Readonly<Record<BassProgramId, BassProgramPreset>> = {
  33: { id: 33, name: 'Fingered Bass' },
  34: { id: 34, name: 'Picked Bass' },
  36: { id: 36, name: 'Slap Bass' },
};

export function isBassProgramId(value: number): value is BassProgramId {
  return BASS_PROGRAM_IDS.includes(value as BassProgramId);
}

export function getBassProgram(value: number): BassProgramPreset | null {
  return isBassProgramId(value) ? BASS_PROGRAMS[value] : null;
}
