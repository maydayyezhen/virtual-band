import type * as THREE from 'three';
import type { WorldCameraView } from '../camera/CameraRegistry';

export interface InstrumentTransform {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

export interface VenueFogProfile {
  color: THREE.ColorRepresentation;
  near: number;
  far: number;
}

export interface VenueEnvironmentProfile {
  createSource(): THREE.Texture;
  pmrem?: boolean;
}

export interface VenueSceneProfile {
  clearColor: THREE.ColorRepresentation;
  clearAlpha?: number;
  fog?: VenueFogProfile | null;
  environment?: VenueEnvironmentProfile | null;
  outputColorSpace?: THREE.WebGLRenderer['outputColorSpace'];
  toneMapping?: THREE.WebGLRenderer['toneMapping'];
  toneMappingExposure?: number;
  shadows?: {
    enabled: boolean;
    type?: THREE.WebGLRenderer['shadowMap']['type'];
    autoUpdate?: boolean;
  };
  pixelRatio?: {
    desktopMax: number;
    mobileMax?: number;
    mobileBreakpoint?: number;
  };
}

export interface Venue {
  id: string;
  label: string;
  root: THREE.Object3D;
  sceneProfile: VenueSceneProfile;
  cameraViews: WorldCameraView[];
  layout: Record<string, InstrumentTransform>;
  update(dt: number): void;
  dispose(): void;
}
