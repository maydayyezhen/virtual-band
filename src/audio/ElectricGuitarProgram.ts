export const ELECTRIC_GUITAR_PROGRAM_IDS = [26, 27, 28, 29, 30, 31] as const;

export type ElectricGuitarProgramId = (typeof ELECTRIC_GUITAR_PROGRAM_IDS)[number];
export type ElectricPickupPosition = 0 | 1 | 2;

export interface ElectricGuitarProgramPreset {
  id: ElectricGuitarProgramId;
  name: 'Jazz' | 'Clean' | 'Muted' | 'Overdrive' | 'Distortion' | 'Harmonics';
  sampleSet:
    | 'electric_guitar_jazz'
    | 'electric_guitar_clean'
    | 'electric_guitar_muted'
    | 'overdriven_guitar'
    | 'distortion_guitar'
    | 'guitar_harmonics';
  pickup: ElectricPickupPosition;
  tone: number;
  volume: number;
  accent: number;
}

export const DEFAULT_ELECTRIC_GUITAR_PROGRAM: ElectricGuitarProgramId = 27;

export const ELECTRIC_GUITAR_PROGRAMS: Record<ElectricGuitarProgramId, ElectricGuitarProgramPreset> = {
  26: {
    id: 26,
    name: 'Jazz',
    sampleSet: 'electric_guitar_jazz',
    pickup: 0,
    tone: 0.56,
    volume: 0.76,
    accent: 0.82,
  },
  27: {
    id: 27,
    name: 'Clean',
    sampleSet: 'electric_guitar_clean',
    pickup: 1,
    tone: 0.82,
    volume: 0.82,
    accent: 0.92,
  },
  28: {
    id: 28,
    name: 'Muted',
    sampleSet: 'electric_guitar_muted',
    pickup: 2,
    tone: 0.50,
    volume: 0.80,
    accent: 0.66,
  },
  29: {
    id: 29,
    name: 'Overdrive',
    sampleSet: 'overdriven_guitar',
    pickup: 2,
    tone: 0.84,
    volume: 0.91,
    accent: 1.04,
  },
  30: {
    id: 30,
    name: 'Distortion',
    sampleSet: 'distortion_guitar',
    pickup: 2,
    tone: 1.00,
    volume: 0.96,
    accent: 1.12,
  },
  31: {
    id: 31,
    name: 'Harmonics',
    sampleSet: 'guitar_harmonics',
    pickup: 2,
    tone: 1.00,
    volume: 0.86,
    accent: 0.78,
  },
};

export function isElectricGuitarProgramId(value: number): value is ElectricGuitarProgramId {
  return ELECTRIC_GUITAR_PROGRAM_IDS.includes(value as ElectricGuitarProgramId);
}

export function getElectricGuitarProgram(value: number): ElectricGuitarProgramPreset | null {
  return isElectricGuitarProgramId(value) ? ELECTRIC_GUITAR_PROGRAMS[value] : null;
}
