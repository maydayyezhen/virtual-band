import type { CameraViewportFraming, InstrumentOrbitCameraView } from '../CameraRegistry';

export const ATELIER_DRUM_VIEW_IDS = {
  whole: 'drums.main:whole',
  drummer: 'drums.main:drummer',
  cymbals: 'drums.main:cymbals',
  pedals: 'drums.main:pedals',
} as const;

export type AtelierDrumViewName = keyof typeof ATELIER_DRUM_VIEW_IDS;

const DONOR_VIEWPORT_FRAMING: CameraViewportFraming = {
  reservedHeight: 206,
  compactReservedHeight: 104,
  compactHeightBreakpoint: 500,
  minUsableHeightRatio: 0.62,
  horizontalMargin: 90,
  mobileHorizontalMargin: 24,
  mobileWidthBreakpoint: 600,
  minUsableWidth: 200,
};

export const ATELIER_DRUM_VIEWS: InstrumentOrbitCameraView[] = [
  {
    kind: 'instrument-orbit',
    id: ATELIER_DRUM_VIEW_IDS.whole,
    label: 'Drums · Whole',
    instrumentId: 'drums.main',
    target: [-0.10, 1.70, -0.36],
    yaw: 0.36,
    pitch: 0.32,
    height: 5.30,
    width: 8.5,
    fov: 34,
    near: 0.035,
    far: 90,
    viewportFraming: DONOR_VIEWPORT_FRAMING,
  },
  {
    kind: 'instrument-orbit',
    id: ATELIER_DRUM_VIEW_IDS.drummer,
    label: 'Drums · Drummer',
    instrumentId: 'drums.main',
    target: [0, 1.46, -0.49],
    yaw: Math.PI - 0.13,
    pitch: 0.76,
    height: 4.80,
    width: 7.8,
    fov: 34,
    near: 0.035,
    far: 90,
    viewportFraming: DONOR_VIEWPORT_FRAMING,
  },
  {
    kind: 'instrument-orbit',
    id: ATELIER_DRUM_VIEW_IDS.cymbals,
    label: 'Drums · Cymbals',
    instrumentId: 'drums.main',
    target: [-0.15, 2.71, -0.2],
    yaw: 0.12,
    pitch: 0.70,
    height: 3.8,
    width: 7.8,
    fov: 34,
    near: 0.035,
    far: 90,
    viewportFraming: DONOR_VIEWPORT_FRAMING,
  },
  {
    kind: 'instrument-orbit',
    id: ATELIER_DRUM_VIEW_IDS.pedals,
    label: 'Drums · Pedals',
    instrumentId: 'drums.main',
    target: [0.96, 0.70, -1.16],
    yaw: Math.PI - 0.40,
    pitch: 0.31,
    height: 2.50,
    width: 4.0,
    fov: 34,
    near: 0.035,
    far: 90,
    viewportFraming: DONOR_VIEWPORT_FRAMING,
  },
];
