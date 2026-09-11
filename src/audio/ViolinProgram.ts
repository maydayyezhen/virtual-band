import type { ViolinArticulation } from '../instruments/violin/legacyViolinAsset';

/**
 * Violin-family instrument types the single violin model can stand in for.
 *
 * A type is **tuning plus tone**, nothing more. Applying one re-tunes the four strings and
 * selects the matching GM program; the fingering is computed as an interval above the open
 * string, so it follows the tuning on its own.
 *
 * Playing style is a separate axis (`ViolinArticulation`), because it is orthogonal in reality:
 * a cellist plucks as readily as a violinist does. Do not fold pizzicato in here as another type.
 *
 * Ids are zero-based GM program numbers, so 40 is GM program 41 (Violin).
 */
/**
 * Ordered by pitch, low instrument first, so Q and E walk the family in one direction instead of
 * jumping between the two ends.
 *
 * Acoustic Bass (GM 33) is deliberately absent even though it is the same instrument as
 * Contrabass: its samples are plucked, so bowing it produced a plucked sound from a bowed
 * instrument. It belongs to the bass instead, which is plucked anyway.
 */
export const VIOLIN_PROGRAM_IDS = [43, 42, 41, 40] as const;

export type ViolinProgramId = (typeof VIOLIN_PROGRAM_IDS)[number];

export interface ViolinProgramPreset {
  readonly id: ViolinProgramId;
  readonly name: string;
  /** Open strings, lowest first. */
  readonly tuning: readonly [number, number, number, number];
}

export const DEFAULT_VIOLIN_PROGRAM: ViolinProgramId = 40;
export const DEFAULT_VIOLIN_ARTICULATION: ViolinArticulation = 'arco';

const VIOLIN_PROGRAMS: Readonly<Record<ViolinProgramId, ViolinProgramPreset>> = {
  40: { id: 40, name: 'Violin', tuning: [55, 62, 69, 76] },
  41: { id: 41, name: 'Viola', tuning: [48, 55, 62, 69] },
  42: { id: 42, name: 'Cello', tuning: [36, 43, 50, 57] },
  43: { id: 43, name: 'Contrabass', tuning: [28, 33, 38, 43] },
};

export function isViolinProgramId(value: number): value is ViolinProgramId {
  return VIOLIN_PROGRAM_IDS.includes(value as ViolinProgramId);
}

export function getViolinProgram(value: number): ViolinProgramPreset | null {
  return isViolinProgramId(value) ? VIOLIN_PROGRAMS[value] : null;
}
