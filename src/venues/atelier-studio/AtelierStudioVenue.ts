import * as THREE from 'three';
import type { Venue } from '../Venue';
import { createAtelierStudioEnvironmentTexture } from './AtelierStudioEnvironment';

export class AtelierStudioVenue implements Venue {
  readonly id = 'atelier-studio';
  readonly label = 'Atelier Studio';
  readonly root = new THREE.Group();

  readonly sceneProfile = {
    clearColor: 0x11191f,
    clearAlpha: 0,
    fog: {
      color: 0x11191f,
      near: 18,
      far: 46,
    },
    environment: {
      createSource: createAtelierStudioEnvironmentTexture,
      pmrem: true,
    },
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.02,
    shadows: {
      enabled: true,
      type: THREE.PCFSoftShadowMap,
      autoUpdate: false,
    },
    pixelRatio: {
      desktopMax: 2,
      mobileMax: 1.65,
      mobileBreakpoint: 600,
    },
  };

  readonly layout = {
    'drums.main': {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: 1,
    },
    // The donor keyboard rig is authored at a much larger real-world unit scale.
    // Keep its geometry untouched and normalize only at the Venue boundary so it
    // shares the same fixed Atelier lighting/floor/contact-shadow environment.
    'keyboard.main': {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: 0.44,
    },
  };

  readonly cameraViews = [
    {
      kind: 'world' as const,
      id: 'atelier-studio:whole',
      label: 'Whole',
      venueId: this.id,
      position: [3.48, 5.07, 9.15] as [number, number, number],
      target: [-0.10, 1.70, -0.36] as [number, number, number],
      fov: 34,
    },
  ];

  constructor() {
    this.root.name = 'venue:atelier-studio';

    const hemisphere = new THREE.HemisphereLight(0xd8e8ee, 0x36424b, 1.2);

    const key = new THREE.DirectionalLight(0xffebd6, 3.3);
    key.position.set(-4, 9, 7);
    key.castShadow = true;
    key.target.position.set(0, 1.3, 0);
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -5,
      right: 5,
      top: 6,
      bottom: -5,
      near: 0.5,
      far: 22,
    });
    key.shadow.bias = -0.00018;
    key.shadow.normalBias = 0.009;
    key.shadow.radius = 3;

    const fill = new THREE.DirectionalLight(0xacd0e8, 1.55);
    fill.position.set(5, 5, 3);

    const rim = new THREE.DirectionalLight(0xffdcc0, 3.4);
    rim.position.set(1, 7, -5);

    const rear = new THREE.DirectionalLight(0xc1e3eb, 1.1);
    rear.position.set(-5, 5, -4);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({
        color: 0x17232c,
        roughness: 0.87,
        metalness: 0.08,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.012;
    floor.receiveShadow = true;

    const contactTexture = createContactShadowTexture();
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 6),
      new THREE.MeshBasicMaterial({
        map: contactTexture,
        transparent: true,
        opacity: 0.50,
        depthWrite: false,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(0, -0.005, -0.4);

    this.root.add(hemisphere, key, key.target, fill, rim, rear, floor, contact);
  }

  update(_dt: number): void {}

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    });
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, '#00000080');
  gradient.addColorStop(0.4, '#00000040');
  gradient.addColorStop(1, '#00000000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
