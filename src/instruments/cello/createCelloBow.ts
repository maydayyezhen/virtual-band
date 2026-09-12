import * as THREE from 'three';

/** Standalone 4/4 cello bow. Local +X runs from screw to tip; hair lies at Y=0. */
export function createCelloBow() {
  const root = new THREE.Group(); root.name = 'cello:bow';
  const geometries = new Set<THREE.BufferGeometry>();
  const grain = new Uint8Array(256 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const d = Math.sin(y * 2.7 + Math.sin(x * .026) * .8) * 6 + Math.sin(y * .47 + x * .009) * 3;
    grain.set([115 + d, 48 + d * .55, 25 + d * .3, 255], i);
  }
  const texture = new THREE.DataTexture(grain, 256, 64); texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  const mat = {
    wood: new THREE.MeshPhysicalMaterial({ map: texture, roughness: .36, clearcoat: .45, clearcoatRoughness: .3 }),
    ebony: new THREE.MeshPhysicalMaterial({ color: 0x171614, roughness: .33, clearcoat: .18 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x211b17, roughness: .83 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xc5c9ca, metalness: .91, roughness: .25 }),
    pearl: new THREE.MeshPhysicalMaterial({ color: 0xc2cebe, roughness: .26, metalness: .2, iridescence: .6 }),
    hair: new THREE.MeshStandardMaterial({ color: 0xddd2ac, roughness: .88, side: THREE.DoubleSide }),
    fiber: new THREE.MeshStandardMaterial({ color: 0xeee4c5, roughness: .87 }),
    tip: new THREE.MeshStandardMaterial({ color: 0xdad2b8, roughness: .48 }),
  };
  function group(name: string) { const g = new THREE.Group(); g.name = name; root.add(g); return g; }
  function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent = root, name = '') {
    geometries.add(g); const o = new THREE.Mesh(g, m); o.name = name;
    o.castShadow = o.receiveShadow = true; parent.add(o); return o;
  }
  function slab(shape: THREE.Shape, depth: number, material: THREE.Material, parent: THREE.Group, name: string, bevel = .0003) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, curveSegments: 24, bevelEnabled: true, bevelSegments: 3, bevelSize: bevel, bevelThickness: bevel });
    g.translate(0, 0, -depth / 2);
    const p = g.getAttribute('position'), uv = g.getAttribute('uv');
    g.computeBoundingBox(); const box = g.boundingBox!;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - box.min.x) / (box.max.x - box.min.x), (p.getY(i) - box.min.y) / (box.max.y - box.min.y));
    return mesh(g, material, parent, name);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, parent: THREE.Group) {
    const o = mesh(new THREE.BoxGeometry(w, h, d), material, parent); o.position.set(x, y, z); return o;
  }
  function cylinder(x0: number, x1: number, y: number, radius: number, material: THREE.Material, parent: THREE.Group, sides = 20) {
    const o = mesh(new THREE.CylinderGeometry(radius, radius, x1 - x0, sides), material, parent);
    o.rotation.z = -Math.PI / 2; o.position.set((x0 + x1) / 2, y, 0); return o;
  }
  const stick = group('cello:bow-stick');
  const stickY = (x: number) => .026 - .018 * Math.sin(Math.PI * Math.max(0, x) / .707);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 160; row++) {
    const t = row / 160, x = t * .705, radius = .0045 - .0022 * t;
    for (let j = 0; j <= 16; j++) {
      const angle = j / 16 * Math.PI * 2;
      positions.push(x, stickY(x) + Math.cos(angle) * radius, Math.sin(angle) * radius); uvs.push(t, j / 16);
      if (row < 160 && j < 16) { const k = row * 17 + j; indices.push(k, k + 1, k + 17, k + 1, k + 18, k + 17); }
    }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); sg.setIndex(indices); sg.computeVertexNormals();
  mesh(sg, mat.wood, stick, 'Tapered cambered pernambuco stick');
  const frog = group('cello:bow-frog');
  const fs = new THREE.Shape(); fs.moveTo(.026, .023); fs.lineTo(.026, .004);
  fs.quadraticCurveTo(.031, .001, .041, .001); fs.lineTo(.083, .001); fs.lineTo(.087, .009);
  fs.bezierCurveTo(.073, .009, .073, .018, .083, .021); fs.lineTo(.080, .023); fs.closePath();
  slab(fs, .014, mat.ebony, frog, 'Carved ebony frog with thumb throat', .00065);
  box(.051, .0011, 0, .042, .0008, .010, mat.pearl, frog).name = 'Mother-of-pearl slide';
  box(.051, .0008, -.0057, .044, .0012, .0006, mat.silver, frog);
  box(.051, .0008, .0057, .044, .0012, .0006, mat.silver, frog);
  // Open D-shaped ferrule retains the flat ribbon, rather than capping it with a solid box.
  const ferrule = new THREE.Shape(); ferrule.moveTo(-.0075, -.002); ferrule.lineTo(.0075, -.002);
  ferrule.lineTo(.0075, .002); ferrule.quadraticCurveTo(0, .009, -.0075, .002); ferrule.closePath();
  const hole = new THREE.Path(); hole.moveTo(-.0067, -.0012); hole.lineTo(-.0067, .0015);
  hole.quadraticCurveTo(0, .0076, .0067, .0015); hole.lineTo(.0067, -.0012); hole.closePath(); ferrule.holes.push(hole);
  const ferruleMesh = slab(ferrule, .006, mat.silver, frog, 'Open silver ferrule', .00012);
  ferruleMesh.rotation.y = Math.PI / 2; ferruleMesh.position.set(.083, .0018, 0);
  for (const sign of [-1, 1]) {
    const ring = mesh(new THREE.TorusGeometry(.0036, .00045, 8, 40), mat.silver, frog);
    ring.position.set(.048, .013, sign * .00785);
    const eye = mesh(new THREE.CircleGeometry(.0031, 40), mat.pearl, frog, 'Pearl eye');
    eye.position.copy(ring.position); eye.position.z = sign * .00795; if (sign < 0) eye.rotation.y = Math.PI;
  }
  cylinder(-.017, .001, .026, .0051, mat.ebony, frog, 8).name = 'Octagonal tension button';
  cylinder(-.0175, -.0145, .026, .00525, mat.silver, frog, 8);
  cylinder(-.004, -.001, .026, .00525, mat.silver, frog, 8);
  cylinder(.085, .121, stickY(.103), .0050, mat.leather, frog).name = 'Leather thumb grip';
  const wrapPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 960; i++) {
    const t = i / 960, x = .124 + t * .048, a = t * Math.PI * 2 * 72;
    wrapPoints.push(new THREE.Vector3(x, stickY(x) + Math.cos(a) * .0045, Math.sin(a) * .0045));
  }
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wrapPoints), 1100, .00026, 5, false), mat.silver, frog, 'Continuous silver wire winding');
  const tip = group('cello:bow-tip');
  const ts = new THREE.Shape(); ts.moveTo(.688, .023);
  ts.bezierCurveTo(.695, .025, .702, .030, .706, .027);
  ts.bezierCurveTo(.714, .022, .714, .009, .719, .002);
  ts.lineTo(.698, .001); ts.bezierCurveTo(.697, .011, .699, .017, .688, .020); ts.closePath();
  slab(ts, .0108, mat.wood, tip, 'Sculpted bow head', .0005);
  box(.708, .0005, 0, .022, .001, .0118, mat.tip, tip).name = 'Protective tip plate';
  const hair = group('cello:bow-hair');
  const ribbon = mesh(new THREE.PlaneGeometry(.621, .011, 1, 1), mat.hair, hair, 'Flat horsehair ribbon');
  ribbon.rotation.x = -Math.PI / 2; ribbon.position.set((.082 + .703) / 2, .0001, 0); ribbon.castShadow = false;
  // A restrained number of separate strands gives near views texture without a rope silhouette.
  for (let j = 0; j < 28; j++) {
    const fiber = cylinder(.082, .703, .00025, .00006, mat.fiber, hair, 4);
    fiber.position.z = (j / 27 - .5) * .0108; fiber.castShadow = false;
  }
  root.userData.modelDimensions = { length: .737, hairLength: .621, units: 'metres' };
  let disposed = false;
  return { root, dispose() {
    if (disposed) return; disposed = true; root.removeFromParent();
    geometries.forEach(g => g.dispose()); Object.values(mat).forEach(m => m.dispose()); texture.dispose(); root.clear();
  } };
}
