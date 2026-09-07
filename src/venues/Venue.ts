import type * as THREE from 'three';
import type { WorldCameraView } from '../camera/CameraRegistry';

export interface InstrumentTransform {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

export interface Venue {
  id: string;
  label: string;
  root: THREE.Object3D;
  cameraViews: WorldCameraView[];
  layout: Record<string, InstrumentTransform>;
  update(dt: number): void;
  dispose(): void;
}
