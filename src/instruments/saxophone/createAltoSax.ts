import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Metres, bell facing +Z. The stand is part of the footprint, not a venue object. */
export function createAltoSax() {
  const root = new THREE.Group(); root.name = 'atelier:alto-saxophone';
  const horn = new THREE.Group(); root.add(horn); horn.position.y = .14;
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xb7893f, metalness: .82, roughness: .25, clearcoat: .55, clearcoatRoughness: .2 });
  const bright = new THREE.MeshStandardMaterial({ color: 0xc4a66e, metalness: .82, roughness: .32 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x957036, metalness: .72, roughness: .36 });
  const ebony = new THREE.MeshPhysicalMaterial({ color: 0x16181b, roughness: .28, clearcoat: .7 });
  const pearl = new THREE.MeshPhysicalMaterial({ color: 0xdcd6c8, metalness: .04, roughness: .42, clearcoat: .35 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x715033, roughness: .85 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: .78 });
  const reed = new THREE.MeshStandardMaterial({ color: 0xc2a575, roughness: .67 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x201c15, roughness: .9 });
  function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = horn) {
    const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  function rod(a: number[], b: number[], r = .002, mat: THREE.Material = bright, parent: THREE.Object3D = horn) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), d = end.clone().sub(start);
    const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), mat, parent);
    o.position.copy(start).add(end).multiplyScalar(.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
  }
  function box(size: number[], p: number[], mat: THREE.Material, parent: THREE.Object3D = horn) {
    const o = mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(...size) / 4), mat, parent); o.position.set(...p as [number, number, number]); return o;
  }
  function ring(r: number, tube: number, p: number[], parent: THREE.Object3D = horn, mat: THREE.Material = bright) {
    const o = mesh(new THREE.TorusGeometry(r, tube, 10, 64), mat, parent); o.position.set(...p as [number, number, number]); return o;
  }
  // Variable-radius sweep with a separate inside surface and a rolled lip: no solid bell cap.
  function pipe(points: number[][], radii: (t: number) => number, steps: number, wall = .0014) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const frames = path.computeFrenetFrames(steps, false), positions: number[] = [], indices: number[] = [], segments = 48;
    for (let surface = 0; surface < 2; surface++) {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, c = path.getPointAt(t), radius = radii(t) - surface * wall;
        for (let j = 0; j <= segments; j++) {
          const a = j / segments * Math.PI * 2;
          const p = c.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius);
          positions.push(p.x, p.y, p.z);
        }
      }
      const offset = surface * (steps + 1) * (segments + 1);
      for (let i = 0; i < steps; i++) for (let j = 0; j < segments; j++) {
        const a = offset + i * (segments + 1) + j, b = a + segments + 1;
        if (surface === 0) indices.push(a, a + 1, b, b, a + 1, b + 1);
        else indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const perSurface = steps * segments * 6; geometry.addGroup(0, perSurface, 0); geometry.addGroup(perSurface, perSurface, 1);
    const o = new THREE.Mesh(geometry, [brass, inner]); o.castShadow = true; o.receiveShadow = true; horn.add(o);
    const lip = ring(radii(1) - wall / 2, wall * .95, points[points.length - 1]);
    lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path.getTangent(1));
    return { path, object: o };
  }
  // The main taper, U bow and forward-tilted bell share one uninterrupted bore.
  const boreRadius = (t: number) => t < .66 ? .014 + .025 * t / .66 : .039 + .040 * Math.pow((t - .66) / .34, 2.6);
  const bore = pipe([[0, .68, 0], [0, .42, 0], [0, .15, 0], [0, .057, .04], [0, .046, .114], [0, .105, .169], [0, .22, .196], [0, .31, .257]], boreRadius, 160);
  // Crook and cork tenon, with a black tapered mouthpiece and a separate reed.
  pipe([[0, .68, 0], [0, .745, -.018], [0, .777, -.087], [0, .795, -.15]], t => .014 - .005 * t, 48);
  const neckCollar = ring(.016, .0025, [0, .675, 0]); neckCollar.rotation.x = Math.PI / 2;
  rod([.012, .681, .002], [.033, .681, .002], .003);
  box([.016, .004, .01], [.033, .681, .002], bright);
  const mouth = new THREE.Group(); mouth.position.set(0, .795, -.15); mouth.rotation.x = -.22; horn.add(mouth);
  const cork = mesh(new THREE.CylinderGeometry(.010, .010, .015, 32), reed, mouth); cork.rotation.x = Math.PI / 2; cork.position.z = .004;
  const mouthShape = [new THREE.Vector2(.0095, 0), new THREE.Vector2(.013, .022), new THREE.Vector2(.012, .055), new THREE.Vector2(.006, .091), new THREE.Vector2(.003, .099)];
  const mouthMesh = mesh(new THREE.LatheGeometry(mouthShape, 48), ebony, mouth); mouthMesh.rotation.x = -Math.PI / 2;
  box([.013, .0014, .077], [0, -.009, -.054], reed, mouth);
  for (const z of [-.021, -.037]) ring(.0135, .0015, [0, 0, z], mouth);
  rod([-.014, -.004, -.027], [.019, -.004, -.027], .0017, bright, mouth);
  // Octave rocker over the crook, rear thumb rest and strap ring.
  rod([.019, .652, -.004], [.019, .751, -.027], .0017);
  rod([.019, .751, -.027], [0, .765, -.071], .0017);
  box([.026, .01, .015], [0, .477, -.036], ebony);
  const strap = ring(.009, .002, [0, .51, -.029]); strap.rotation.y = Math.PI / 2;
  // Keywork is separate from the acoustic shell: rods, posts, key cups, pads and pearl touches.
  const keys: Array<{ pivot: THREE.Group; rest: number; index: number }> = [];
  for (const x of [-.034, .034]) {
    rod([x, .18, -.003], [x, .642, -.003], .0023);
    for (const y of [.195, .282, .377, .477, .571, .63]) {
      rod([x * .5, y, 0], [x, y, -.003], .0035);
      const screw = mesh(new THREE.SphereGeometry(.004, 12, 8), bright); screw.position.set(x, y, -.003);
    }
  }
  const keyY = [.592, .537, .482, .407, .347, .287];
  for (let i = 0; i < keyY.length; i++) {
    const y = keyY[i], r = .014 + i * .0015, z = .019 + (.68 - y) * .034;
    const hole = mesh(new THREE.CylinderGeometry(r * .86, r * .86, .007, 40), dark); hole.rotation.x = Math.PI / 2; hole.position.set(0, y, z);
    ring(r * .88, .0014, [0, y, z + .004]);
    const pivot = new THREE.Group(); pivot.position.set(.034, y, z); horn.add(pivot); pivot.rotation.y = .22;
    const cup = mesh(new THREE.CylinderGeometry(r, r, .004, 40), brass, pivot); cup.rotation.x = Math.PI / 2; cup.position.set(-.034, 0, .011);
    const pad = mesh(new THREE.CylinderGeometry(r * .86, r * .86, .002, 32), leather, pivot); pad.rotation.x = Math.PI / 2; pad.position.set(-.034, 0, .008);
    rod([0, 0, -.016], [-.034, 0, .01], .0025, bright, pivot);
    const touch = mesh(new THREE.SphereGeometry(.008, 24, 12), pearl, pivot); touch.scale.set(1, 1, .27); touch.position.set(-.034, 0, .017);
    pivot.userData.hit = `key:${[70, 68, 67, 65, 63, 62][i]}`;
    keys.push({ pivot, rest: .22, index: i });
  }
  // Side / palm keys and the left little-finger spatula cluster.
  for (let i = 0; i < 5; i++) {
    const x = i < 3 ? -.038 : .04, y = .61 - i * .043;
    rod([x, y - .04, -.004], [x * 1.35, y, .018], .0017);
    const touch = box([.012, .025, .004], [x * 1.35, y, .021], bright); touch.rotation.z = -.25;
  }
  for (let i = 0; i < 4; i++) {
    const x = -.055 - (i % 2) * .018, y = .397 - Math.floor(i / 2) * .024;
    rod([-.034, y - .05, -.006], [x, y, .014], .0018);
    box([.016, .021, .005], [x, y, .02], brass);
    rod([x - .006, y - .011, .022], [x + .006, y - .011, .022], .002, ebony);
  }
  // Bell tone cups, soldered guard feet and curved guards.
  for (const t of [.83, .92]) {
    const c = bore.path.getPointAt(t), x = boreRadius(t) + .003, r = t < .9 ? .023 : .027;
    const cup = mesh(new THREE.CylinderGeometry(r, r, .006, 48), brass); cup.rotation.z = Math.PI / 2; cup.position.set(x, c.y, c.z);
    const ends = [-1, 1].map(sign => {
      const u = t + sign * .033, p = bore.path.getPointAt(u), foot = [boreRadius(u) + .002, p.y, p.z], outer = [boreRadius(u) + .023, p.y, p.z];
      rod(foot, outer, .0025); return outer;
    });
    rod(ends[0], ends[1], .0025);
    rod([.034, .205, 0], [.066, .205, 0], .0018);
    rod([.066, .205, 0], [.066, c.y, c.z], .0018);
    rod([.066, c.y, c.z], [x + .004, c.y, c.z], .0018);
  }
  // Bell-to-body brace and a discreet engraved medallion on the forward flare.
  rod([0, .236, .04], [0, .231, .13], .004);
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 30 }, (_, i) => {
      const u = i / 29, t = .89 + .07 * u, center = bore.path.getPointAt(t), tangent = bore.path.getTangentAt(t);
      const front = new THREE.Vector3(0, -tangent.z, tangent.y).normalize(), angle = side * Math.sin(u * Math.PI * 2) * .20;
      return center.addScaledVector(front, Math.cos(angle) * (boreRadius(t) + .0004)).add(new THREE.Vector3(Math.sin(angle) * boreRadius(t), 0, 0));
    });
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 60, .00035, 6, false), bright);
  }
  // Matte folding stand, rubber-lined bow saddle and three planted feet.
  rod([0, .04, -.07], [0, .30, -.07], .009, ebony, root);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, x = Math.sin(a) * .19, z = -.07 + Math.cos(a) * .19;
    rod([0, .10, -.07], [x, .015, z], .006, ebony, root);
    box([.035, .018, .04], [x, .011, z], rubber, root);
  }
  for (const x of [-.05, .05]) {
    rod([0, .20, -.07], [x, .192, .075], .0045, ebony, root);
    box([.018, .028, .027], [x, .192, .075], rubber, root);
  }
  root.updateMatrixWorld(true);
  return { root, horn, keys };
}
