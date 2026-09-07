import * as THREE from 'three';
import type { Venue } from '../Venue';

export class EmptyStageVenue implements Venue {
  readonly id = 'empty-stage';
  readonly label = 'Empty Stage';
  readonly root = new THREE.Group();
  readonly layout = {
    'drums.main': {
      position: [2.75, 0, -6.35] as [number, number, number],
      rotation: [0, -0.1, 0] as [number, number, number],
      scale: 2.08,
    },
  };
  readonly cameraViews = [
    {
      kind: 'world' as const,
      id: 'empty-stage:front',
      label: 'Front',
      venueId: this.id,
      position: [0, 7.5, 18] as [number, number, number],
      target: [0, 2.4, -2] as [number, number, number],
      fov: 42,
    },
  ];

  constructor() {
    this.root.name = 'venue:empty-stage';

    // Minimal host scene copied from the original application. No replacement grid or
    // new V2 visual language is introduced here; migrated donor assets stay authoritative.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.MeshStandardMaterial({ color: 0x17232c, roughness: 0.85, metalness: 0.11 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.012;
    floor.receiveShadow = true;

    const hemisphere = new THREE.HemisphereLight(0xd8e8ee, 0x363b43, 0.95);
    const key = new THREE.DirectionalLight(0xffebd4, 3.1);
    key.position.set(-7, 16, 10);
    key.castShadow = true;
    key.target.position.set(0, 5, 0);
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 12, bottom: -9, near: 1, far: 40 });
    key.shadow.bias = -0.00018;
    key.shadow.normalBias = 0.013;
    key.shadow.radius = 3;

    const fill = new THREE.DirectionalLight(0xabcfe7, 1.25);
    fill.position.set(9, 11, 4);
    const rim = new THREE.DirectionalLight(0xffe2c8, 2.9);
    rim.position.set(4, 14, -7);
    const rear = new THREE.DirectionalLight(0xbedbe9, 1.6);
    rear.position.set(-6, 9, -11);

    this.root.add(floor, hemisphere, key, key.target, fill, rim, rear);
  }

  update(_dt: number): void {}

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }
}
