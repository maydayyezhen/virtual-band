export const ACOUSTIC_GUITAR_PROGRAM_IDS = [24, 25] as const;

export type AcousticGuitarProgramId = (typeof ACOUSTIC_GUITAR_PROGRAM_IDS)[number];

export interface AcousticGuitarProgramPreset {
  id: AcousticGuitarProgramId;
  name: 'Nylon' | 'Steel';
  sampleSet: 'acoustic_guitar_nylon' | 'acoustic_guitar_steel';
}

export const ACOUSTIC_GUITAR_PROGRAMS: Readonly<Record<AcousticGuitarProgramId, AcousticGuitarProgramPreset>> = {
  24: {
    id: 24,
    name: 'Nylon',
    sampleSet: 'acoustic_guitar_nylon',
  },
  25: {
    id: 25,
    name: 'Steel',
    sampleSet: 'acoustic_guitar_steel',
  },
};

export const DEFAULT_ACOUSTIC_GUITAR_PROGRAM: AcousticGuitarProgramId = 25;

export function isAcousticGuitarProgramId(value: number): value is AcousticGuitarProgramId {
  return value === 24 || value === 25;
}

export function getAcousticGuitarProgram(value: number): AcousticGuitarProgramPreset | null {
  return isAcousticGuitarProgramId(value) ? ACOUSTIC_GUITAR_PROGRAMS[value] : null;
}
