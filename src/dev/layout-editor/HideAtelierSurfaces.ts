import * as THREE from 'three';
import { RendererHost } from '../../engine/RendererHost';

let installed = false;

/**
 * Layout Lab only: keep Atelier's neutral lights/environment, but hide its
 * studio floor/contact-shadow meshes now that NOCTURNE supplies the venue geometry.
 */
export function installHideAtelierSurfaces(): void {
  if (installed) return;
  installed = true;

  const originalApplySceneProfile = RendererHost.prototype.applySceneProfile;

  RendererHost.prototype.applySceneProfile = function applySceneProfileWithoutAtelierSurfaces(profile) {
    originalApplySceneProfile.call(this, profile);

    const atelier = this.scene.getObjectByName('venue:atelier-studio');
    if (!atelier) return;

    atelier.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.visible = false;
    });
  };
}
