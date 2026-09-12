/** Metres in stage-local X/Z coordinates; +Z faces the audience. No renderer dependency. */
export interface StageRect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface StageLayout {
  readonly venueId: string;
  readonly surfaceY: number;
  readonly area: StageRect;
  readonly exclusions: readonly StageRect[];
  readonly gap: number;
}
