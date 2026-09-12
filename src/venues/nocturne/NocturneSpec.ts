import type { StageLayout } from '../StageLayout';

/** Open deck between the rear fixtures and the front apron, from the venue geometry. */
export const NOCTURNE_STAGE: StageLayout = {
  venueId: 'nocturne', surfaceY: 1.2,
  area: { minX: -12, maxX: 12, minZ: -5.4, maxZ: 6.6 },
  exclusions: [], gap: 0.4,
};
export const NOCTURNE_CAMERA_VOLUME = { min: [-28.4, 0.4, -8], max: [28.4, 20.5, 57] } as const;
/** A manually selected view can frame the full deck and truss independently of the band. */
export const NOCTURNE_OVERVIEW_VOLUME = { min: [-17, -1, -6], max: [17, 15, 6] } as const;
