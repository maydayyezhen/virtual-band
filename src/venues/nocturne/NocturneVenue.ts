import * as THREE from 'three';
import type { RendererHost } from '../../engine/RendererHost';
import type { VenueSceneProfile } from '../Venue';
import { createNocturneAsset, type NocturneAsset } from './NocturneAsset.js';
import { NOCTURNE_STAGE, NOCTURNE_CAMERA_VOLUME, NOCTURNE_OVERVIEW_VOLUME } from './NocturneSpec';
import type { LightingPort } from '../../lighting/Lighting';
import type { ScreenPort } from '../../screens/ScreenContent';

const PROFILE: VenueSceneProfile = {
  clearColor: 0x080e19, clearAlpha: 1, outputColorSpace: THREE.SRGBColorSpace,
  toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08,
  shadows: { enabled: true, type: THREE.PCFSoftShadowMap, autoUpdate: true },
  pixelRatio: { desktopMax: 1.65, mobileMax: 1.1, mobileBreakpoint: 700 },
};

/** A venue owns only its visual assets. The host owns the camera, frame loop and instruments. */
export class NocturneVenue {
  readonly layout = NOCTURNE_STAGE;
  readonly cameraBounds = new THREE.Box3(new THREE.Vector3(...NOCTURNE_CAMERA_VOLUME.min), new THREE.Vector3(...NOCTURNE_CAMERA_VOLUME.max));
  readonly overviewBounds = new THREE.Box3(new THREE.Vector3(...NOCTURNE_OVERVIEW_VOLUME.min), new THREE.Vector3(...NOCTURNE_OVERVIEW_VOLUME.max));
  readonly root: THREE.Scene;
  readonly lighting: LightingPort;
  readonly screens: ScreenPort;
  private readonly asset: NocturneAsset;
  private disposed = false;
  constructor(private readonly host: RendererHost) {
    host.applySceneProfile(PROFILE);
    this.asset = createNocturneAsset(host.renderer);
    this.lighting = this.asset.lighting;
    this.screens = this.asset.screens;
    this.root = this.asset.scene;
    host.scene.add(this.root);
    host.scene.background = this.root.background;
    host.scene.fog = this.root.fog;
    host.scene.environment = this.root.environment;
    host.setSceneRenderPass({ render: camera => this.asset.render(host.scene, camera), dispose: () => this.dispose() });
  }
  update(dt: number): void { if (!this.disposed) this.asset.update(dt); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.host.scene.environment === this.root.environment) this.host.scene.environment = null;
    if (this.host.scene.fog === this.root.fog) this.host.scene.fog = null;
    if (this.host.scene.background === this.root.background) this.host.scene.background = null;
    this.asset.dispose();
  }
}
