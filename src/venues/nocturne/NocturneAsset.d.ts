import type * as THREE from 'three';
import type { LightingPort } from '../../lighting/Lighting';
import type { ScreenPort } from '../../screens/ScreenContent';
/** Typed boundary around the preserved procedural geometry/material asset. */
export interface NocturneAsset {
  scene: THREE.Scene;
  lighting: LightingPort;
  screens: ScreenPort;
  update(dt: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): boolean;
  dispose(): void;
}
export function createNocturneAsset(renderer: THREE.WebGLRenderer): NocturneAsset;
