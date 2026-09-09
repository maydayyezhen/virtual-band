import type { InstrumentOrbitCameraView } from '../CameraRegistry';

export type AtelierBassViewName = 'whole' | 'body' | 'bridge' | 'head' | 'back';

export const ATELIER_BASS_VIEW_IDS: Record<AtelierBassViewName, string> = {
  whole: 'bass.main:whole',
  body: 'bass.main:body',
  bridge: 'bass.main:bridge',
  head: 'bass.main:head',
  back: 'bass.main:back',
};

export const ATELIER_BASS_VIEWS: InstrumentOrbitCameraView[] = [
  { kind: 'instrument-orbit', id: ATELIER_BASS_VIEW_IDS.whole, label: 'Whole', instrumentId: 'bass.main', target: [0, 2.30, 0], yaw: 0.33, pitch: 0.075, height: 13.2, width: 5.8, fov: 32, near: 0.05, far: 120 },
  { kind: 'instrument-orbit', id: ATELIER_BASS_VIEW_IDS.body, label: 'Body', instrumentId: 'bass.main', target: [0, -1.03, 0.02], yaw: 0.18, pitch: 0.11, height: 6.0, width: 4.6, fov: 32, near: 0.05, far: 120 },
  { kind: 'instrument-orbit', id: ATELIER_BASS_VIEW_IDS.bridge, label: 'Bridge', instrumentId: 'bass.main', target: [0.28, -2.35, 0.25], yaw: -0.18, pitch: 0.25, height: 2.15, width: 2.9, fov: 32, near: 0.05, far: 120 },
  { kind: 'instrument-orbit', id: ATELIER_BASS_VIEW_IDS.head, label: 'Head', instrumentId: 'bass.main', target: [-0.12, 7.03, 0.10], yaw: -0.32, pitch: 0.08, height: 3.6, width: 2.8, fov: 32, near: 0.05, far: 120 },
  { kind: 'instrument-orbit', id: ATELIER_BASS_VIEW_IDS.back, label: 'Back', instrumentId: 'bass.main', target: [0, 2.30, 0], yaw: Math.PI + 0.27, pitch: 0.08, height: 13.2, width: 5.8, fov: 32, near: 0.05, far: 120 },
];
