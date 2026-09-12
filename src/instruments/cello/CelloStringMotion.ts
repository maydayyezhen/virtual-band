import * as THREE from 'three';

export interface CelloStringVisual {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  bridge: THREE.Vector3;
  nut: THREE.Vector3;
  radius: number;
  rows: number;
  sides: number;
}
export interface CelloStringNote { note: number; velocity: number; articulation?: 'arco' | 'pizzicato' }
const OPEN_NOTES = [36, 43, 50, 57];

/** A reusable tube, rather than allocating a fresh geometry on each animation frame. */
export function createCelloString(bridge: THREE.Vector3, nut: THREE.Vector3, radius: number, material: THREE.MeshPhysicalMaterial): CelloStringVisual {
  const rows = 128, sides = 8, positions = new Float32Array((rows + 1) * (sides + 1) * 3), uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
    const t = row / rows, a = side / sides * Math.PI * 2, k = row * (sides + 1) + side;
    positions.set([THREE.MathUtils.lerp(bridge.x, nut.x, t) + Math.cos(a) * radius,
      THREE.MathUtils.lerp(bridge.y, nut.y, t), THREE.MathUtils.lerp(bridge.z, nut.z, t) + Math.sin(a) * radius], k * 3);
    uv.push(side / sides, t);
    if (row < rows && side < sides) indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.boundingBox!.expandByScalar(.006);
  geometry.boundingSphere = geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
  const mesh = new THREE.Mesh(geometry, material.clone()); mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, bridge: bridge.clone(), nut: nut.clone(), radius, rows, sides };
}

/** Visible vibration follows the existing violin's slowed oscillation and bowed release envelope. */
export class CelloStringMotion {
  private readonly states;
  constructor(strings: readonly CelloStringVisual[]) {
    this.states = strings.map((string, index) => ({ string, index, energy: 0, phase: index * .37, interval: 0, pizzicato: false, lastAttack: undefined as CelloStringNote | undefined,
      rest: new Float32Array(string.mesh.geometry.getAttribute('position').array),
      emissive: string.mesh.material.emissive.clone(), intensity: string.mesh.material.emissiveIntensity }));
  }
  update(dt: number, notes: readonly (CelloStringNote | undefined)[]): { moved: boolean; animating: boolean } {
    let moved = false, animating = false;
    for (const state of this.states) {
      const held = notes[state.index], interval = held ? held.note - OPEN_NOTES[state.index] : -1;
      const active = held && interval >= 0 && interval <= 24;
      const target = active ? THREE.MathUtils.clamp(held.velocity / 127, 0, 1) : 0, before = state.energy;
      if (active) state.pizzicato = held.articulation === 'pizzicato';
      if (active && state.pizzicato && state.lastAttack !== held) { state.energy = target; state.phase = 0; }
      if (state.pizzicato) state.energy *= Math.exp(-dt * 4.2);
      else state.energy += (target - state.energy) * (1 - Math.exp(-dt * (active ? 20 : 8.5)));
      state.lastAttack = held;
      if (state.energy < .0012) state.energy = 0;
      if (active) state.interval = interval;
      if (state.energy === 0) { if (before !== 0) { this.restore(state); moved = true; } continue; }
      state.phase += dt; moved = animating = true;
      const { mesh, bridge, nut, radius, rows, sides } = state.string;
      const positions = mesh.geometry.getAttribute('position');
      const stop = 2 ** (-state.interval / 12), split = Math.max(1, Math.round(rows * stop));
      for (let row = 0; row <= rows; row++) {
        // An actual ring sits on the stopped point, keeping that boundary pinned at every pitch.
        const t = row <= split ? row / split * stop : stop + (row - split) / (rows - split) * (1 - stop);
        const y = THREE.MathUtils.lerp(bridge.y, nut.y, t), u = Math.min(1, t / stop);
        const envelope = row === 0 || row >= split ? 0 : Math.sin(u * Math.PI);
        const bowDamping = state.pizzicato ? 1 : 1 - .88 * Math.exp(-(((y - .65) / .012) ** 2));
        const amplitude = state.energy * (.0036 - state.index * .00035) * envelope * bowDamping;
        const dx = amplitude * (Math.sin(state.phase * (31 + state.index * 2.3)) + .20 * Math.sin(state.phase * 67) * Math.sin(u * Math.PI * 2));
        const dz = amplitude * .09 * Math.sin(state.phase * 47);
        const x = THREE.MathUtils.lerp(bridge.x, nut.x, t) + dx, z = THREE.MathUtils.lerp(bridge.z, nut.z, t) + dz;
        for (let side = 0; side <= sides; side++) {
          const a = side / sides * Math.PI * 2;
          positions.setXYZ(row * (sides + 1) + side, x + Math.cos(a) * radius, y, z + Math.sin(a) * radius);
        }
      }
      positions.needsUpdate = true; mesh.geometry.computeVertexNormals();
      mesh.material.emissive.setHex(0xbfc9b5); mesh.material.emissiveIntensity = state.energy * .12;
    }
    return { moved, animating };
  }
  reset(): void {
    for (const state of this.states) { state.energy = 0; state.phase = state.index * .37; state.interval = 0; state.pizzicato = false; state.lastAttack = undefined; this.restore(state); }
  }
  private restore(state: (typeof this.states)[number]): void {
    const { mesh } = state.string;
    mesh.geometry.getAttribute('position').array.set(state.rest); mesh.geometry.getAttribute('position').needsUpdate = true;
    mesh.geometry.computeVertexNormals(); mesh.material.emissive.copy(state.emissive); mesh.material.emissiveIntensity = state.intensity;
  }
}
