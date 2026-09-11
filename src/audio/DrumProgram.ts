/**
 * Drum kits the single acoustic kit model can stand in for.
 *
 * A kit is a GM2 percussion preset on bank 128. Every preset shares one note map — note 36 is
 * the kick and note 38 the snare in all of them — so switching never misroutes a hit; only the
 * sound changes. Measured against the shipped SoundFont, each of these covers all 47 percussion
 * notes from 35 to 81, which is more than the model itself has pieces for.
 *
 * Two GM2 kits are deliberately absent:
 *
 * - Orchestra Kit (48) re-assigns part of the note map to orchestral percussion, so it is not
 *   guaranteed to line up one-to-one with an acoustic kit's layout.
 * - SFX Kit (56) is empty in this SoundFont: no note in 35-81 resolves to a sample.
 */
export const DRUM_KIT_IDS = [0, 8, 16, 24, 25, 32, 40] as const;

export type DrumKitId = (typeof DRUM_KIT_IDS)[number];

export interface DrumKitPreset {
  /** GM2 percussion program on bank 128. */
  readonly id: DrumKitId;
  readonly name: string;
}

export const DEFAULT_DRUM_KIT: DrumKitId = 0;
export const DRUM_KIT_BANK = 128;

const DRUM_KITS: Readonly<Record<DrumKitId, DrumKitPreset>> = {
  0: { id: 0, name: 'Standard Kit' },
  8: { id: 8, name: 'Room Kit' },
  16: { id: 16, name: 'Power Kit' },
  24: { id: 24, name: 'Electronic Kit' },
  25: { id: 25, name: 'TR-808 Kit' },
  32: { id: 32, name: 'Jazz Kit' },
  40: { id: 40, name: 'Brush Kit' },
};

export function isDrumKitId(value: number): value is DrumKitId {
  return DRUM_KIT_IDS.includes(value as DrumKitId);
}

export function getDrumKit(value: number): DrumKitPreset | null {
  return isDrumKitId(value) ? DRUM_KITS[value] : null;
}
