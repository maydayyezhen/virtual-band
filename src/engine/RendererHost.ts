import * as THREE from 'three';
import type { VenueSceneProfile } from '../venues/Venue';

export class RendererHost {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;

  private readonly mount: HTMLElement;
  private width = 0;
  private height = 0;
  private pixelRatio = 0;
  private pixelRatioProfile: VenueSceneProfile['pixelRatio'] = { desktopMax: 2 };
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private environmentSource: THREE.Texture | null = null;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x11191f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.mount.appendChild(this.renderer.domElement);
  }

  applySceneProfile(profile: VenueSceneProfile): void {
    this.disposeEnvironment();

    this.renderer.setClearColor(profile.clearColor, profile.clearAlpha ?? 1);
    this.renderer.outputColorSpace = profile.outputColorSpace ?? THREE.SRGBColorSpace;
    this.renderer.toneMapping = profile.toneMapping ?? THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = profile.toneMappingExposure ?? 1;

    const shadows = profile.shadows;
    this.renderer.shadowMap.enabled = shadows?.enabled ?? true;
    this.renderer.shadowMap.type = shadows?.type ?? THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = shadows?.autoUpdate ?? true;
    this.renderer.shadowMap.needsUpdate = true;

    const fog = profile.fog;
    this.scene.fog = fog ? new THREE.Fog(fog.color, fog.near, fog.far) : null;

    if (profile.environment) {
      const source = profile.environment.createSource();
      if (profile.environment.pmrem ?? true) {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.environmentTarget = pmrem.fromEquirectangular(source);
        this.scene.environment = this.environmentTarget.texture;
        source.dispose();
        pmrem.dispose();
      } else {
        this.environmentSource = source;
        this.scene.environment = source;
      }
    } else {
      this.scene.environment = null;
    }

    this.pixelRatioProfile = profile.pixelRatio ?? { desktopMax: 2 };
    this.updatePixelRatio(true);
  }

  resizeIfNeeded(): number {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.updatePixelRatio(false);
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.renderer.setSize(width, height, false);
    }
    return width / height;
  }

  invalidateShadows(): void {
    if (this.renderer.shadowMap.enabled) this.renderer.shadowMap.needsUpdate = true;
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  dispose(): void {
    this.disposeEnvironment();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private updatePixelRatio(force: boolean): void {
    const profile = this.pixelRatioProfile ?? { desktopMax: 2 };
    const breakpoint = profile.mobileBreakpoint ?? 600;
    const cap = window.innerWidth < breakpoint
      ? (profile.mobileMax ?? profile.desktopMax)
      : profile.desktopMax;
    const next = Math.min(window.devicePixelRatio || 1, cap);
    if (!force && Math.abs(next - this.pixelRatio) < 1e-4) return;
    this.pixelRatio = next;
    this.renderer.setPixelRatio(next);
  }

  private disposeEnvironment(): void {
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentSource?.dispose();
    this.environmentTarget = null;
    this.environmentSource = null;
  }
}
