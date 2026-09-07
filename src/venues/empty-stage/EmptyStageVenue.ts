import * as THREE from 'three';
import type { Venue } from '../Venue';

export class EmptyStageVenue implements Venue {
  readonly id = 'empty-stage';
  readonly label = 'Empty Stage';
  readonly root = new THREE.Group();
  readonly layout = {};
  readonly cameraViews = [
    {
      kind: 'world' as const,
      id: 'empty-stage:front',
      label: 'Front',
      venueId: this.id,
      position: [0, 7.5, 18] as [number, number, number],
      target: [0, 2.4, 0] as [number, number, number],
      fov: 42,
    },
    {
      kind: 'world' as const,
      id: 'empty-stage:left',
      label: 'Left',
      venueId: this.id,
      position: [-14, 7, 12] as [number, number, number],
      target: [0, 2.2, 0] as [number, number, number],
      fov: 44,
    },
    {
      kind: 'world' as const,
      id: 'empty-stage:top',
      label: 'Top',
      venueId: this.id,
      position: [0, 18, 10] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      fov: 48,
    },
  ];

  constructor() {
    this.root.name = 'venue:empty-stage';

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.96, metalness: 0.04 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    const grid = new THREE.GridHelper(40, 40, 0x33434c, 0x1b2730);
    grid.position.y = 0.005;
    this.root.add(grid);

    const hemisphere = new THREE.HemisphereLight(0xddeaf0, 0x1a2028, 1.25);
    const key = new THREE.DirectionalLight(0xf2e8d8, 2.4);
    key.position.set(-8, 14, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.root.add(hemisphere, key);
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
