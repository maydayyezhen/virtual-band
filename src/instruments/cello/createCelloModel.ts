import * as THREE from 'three';
import { createCelloString, type CelloStringVisual } from './CelloStringMotion';

export interface CelloModel {
  root: THREE.Group;
  strings: readonly CelloStringVisual[];
  dispose(): void;
}

const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;

/** Deterministic colour grain; geometry, rather than painted marks, carries the carving. */
function wood(kind: 'spruce' | 'maple' | 'ebony' | 'bridge' | 'carved-maple'): THREE.DataTexture {
  const size = 512;
  const pixels = new Uint8Array(size * size * 4);
  const base = { spruce: [194, 119, 53], maple: [177, 99, 46], ebony: [32, 29, 27], bridge: [221, 191, 141], 'carved-maple': [181, 104, 52] }[kind];
  let seed = 197706;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 24) / 255 - .5;
    const wave = x * 1.51 + Math.sin(y * .013) * .45 + Math.sin(x * .017) * 2;
    const grain = Math.pow(.5 + .5 * Math.sin(wave), 13);
    const flamePhase = y * .20 + Math.sin(y * .023) * 2.8 + Math.sin(y * .061) * .65
      + Math.sin(x * .012 + y * .005) * 1.7 + Math.sin(x * .037 + y * .017) * .45;
    const flame = Math.sin(flamePhase) * (.45 + .30 * Math.sin(x * .011 + y * .009) ** 2)
      + Math.sin(flamePhase * 1.93 + x * .004) * .12;
    const d = kind === 'carved-maple' ? flame * 2.5 - grain * 1.2 + noise * 1.6 + Math.sin(x * .013 + y * .018) * 1.3
      : kind === 'maple' ? flame * 10 - grain * 3 + noise * 3
      : kind === 'spruce' ? -grain * 13 + Math.sin(x * .033) * 2 + noise * 3
      : kind === 'bridge' ? Math.sin(x * .44) * 6 + Math.sin(y * .79 + x * .04) * 2 + noise * 4
      : -grain * 4 + noise * 2;
    const i = (y * size + x) * 4;
    pixels[i] = clamp(base[0] + d, 0, 255);
    pixels[i + 1] = clamp(base[1] + d * .73, 0, 255);
    pixels[i + 2] = clamp(base[2] + d * .45, 0, 255);
    pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Full-size cello, authored in metres. Front is +Z, extended endpin touches y = 0. */
export function createCelloModel(): CelloModel {
  const root = new THREE.Group();
  root.name = 'Atelier / Cello study';
  const textures = [wood('spruce'), wood('maple'), wood('ebony'), wood('bridge'), wood('carved-maple')];
  const physical = (parameters: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(parameters);
  const mat = {
    top: physical({ map: textures[0], vertexColors: true, roughness: .34, clearcoat: .68, clearcoatRoughness: .23, bumpMap: textures[0], bumpScale: .000045 }),
    back: physical({ map: textures[1], vertexColors: true, roughness: .33, clearcoat: .7, clearcoatRoughness: .23, bumpMap: textures[1], bumpScale: .000035 }),
    rib: physical({ map: textures[1], color: 0xe8c19d, roughness: .37, clearcoat: .6, clearcoatRoughness: .26, side: THREE.DoubleSide }),
    maple: physical({ map: textures[1], color: 0xf1d0a6, roughness: .39, clearcoat: .42, clearcoatRoughness: .24 }),
    carvedMaple: physical({ map: textures[4], color: 0xf1d0a6, roughness: .40, clearcoat: .40, clearcoatRoughness: .27 }),
    edge: physical({ color: 0x995325, roughness: .4, clearcoat: .55 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x604729, roughness: .88, side: THREE.DoubleSide }),
    ebony: physical({ map: textures[2], color: 0xcec9c3, roughness: .32, clearcoat: .24, clearcoatRoughness: .3 }),
    black: new THREE.MeshStandardMaterial({ color: 0x171310, roughness: .65 }),
    purfling: new THREE.MeshStandardMaterial({ color: 0x32251b, roughness: .56 }),
    inlay: new THREE.MeshStandardMaterial({ color: 0xcba576, roughness: .55 }),
    bridge: physical({ map: textures[3], roughness: .64, clearcoat: .04 }),
    metal: physical({ color: 0xb8bdbe, metalness: .88, roughness: .26 }),
    darkMetal: physical({ color: 0x57524c, metalness: .84, roughness: .32 }),
    string: physical({ color: 0xb9b6a3, metalness: .84, roughness: .3 }),
    pearl: physical({ color: 0xc8cbc1, metalness: .17, roughness: .32 }),
    red: new THREE.MeshStandardMaterial({ color: 0x79352a, roughness: .8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1d211e, roughness: .9 }),
  };
  const geometries = new Set<THREE.BufferGeometry>();
  function group(name: string, parent = root) { const g = new THREE.Group(); g.name = name; parent.add(g); return g; }
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Group = root, name = '') {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, parent = root, endRadius = radius, sides = 16) {
    const d = b.clone().sub(a);
    const mesh = add(new THREE.CylinderGeometry(endRadius, radius, d.length(), sides), material, parent);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return mesh;
  }
  function ellipsoid(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, parent = root) {
    const mesh = add(new THREE.SphereGeometry(1, 32, 20), material, parent);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); return mesh;
  }
  function tube(points: THREE.Vector3[], radius: number, material: THREE.Material, parent = root, closed = false, segments = 100, sides = 8) {
    return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'centripetal'), segments, radius, sides, closed), material, parent);
  }
  function slab(shape: THREE.Shape, depth: number, z: number, material: THREE.Material, parent = root, bevel = .0004) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, curveSegments: 28, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 });
    const mesh = add(geometry, material, parent); mesh.position.z = z; return mesh;
  }
  function rectangle(width: number, height: number, radius: number) {
    const shape = new THREE.Shape(); const x = -width / 2, y = -height / 2;
    shape.moveTo(x + radius, y); shape.lineTo(x + width - radius, y); shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius); shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius); shape.quadraticCurveTo(x, y, x + radius, y); shape.closePath(); return shape;
  }
  function smooth(geometry: THREE.BufferGeometry) {
    geometry.computeVertexNormals();
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
    const sums = new Map<string, THREE.Vector3>(), keys: string[] = [];
    for (let i = 0; i < p.count; i++) {
      const key = `${Math.round(p.getX(i) * 1e7)},${Math.round(p.getY(i) * 1e7)},${Math.round(p.getZ(i) * 1e7)}`;
      keys.push(key); const sum = sums.get(key) ?? new THREE.Vector3(); sum.add(V(n.getX(i), n.getY(i), n.getZ(i))); sums.set(key, sum);
    }
    for (const n of sums.values()) n.normalize();
    for (let i = 0; i < p.count; i++) { const v = sums.get(keys[i])!; n.setXYZ(i, v.x, v.y, v.z); }
  }
  function subdivide(geometry: THREE.BufferGeometry, maxEdge: number) {
    const input = geometry.getAttribute('position'); let triangles: THREE.Vector2[] = [];
    for (let i = 0; i < input.count; i++) triangles.push(new THREE.Vector2(input.getX(i), input.getY(i)));
    const key = (p: THREE.Vector2) => `${Math.round(p.x * 1e8)},${Math.round(p.y * 1e8)}`;
    const edgeKey = (p: THREE.Vector2, q: THREE.Vector2) => { const a = key(p), b = key(q); return a < b ? `${a}|${b}` : `${b}|${a}`; };
    // Earcut's bridges between holes can already contain collinear T-junctions.
    // Insert all original vertices on each edge before the shared-edge refinement.
    const originalPoints = [...new Map(triangles.map(p => [key(p), p])).values()];
    const conforming: THREE.Vector2[] = [];
    for (let i = 0; i < triangles.length; i += 3) {
      const polygon: THREE.Vector2[] = [];
      for (let j = 0; j < 3; j++) {
        const a = triangles[i + j], b = triangles[i + (j + 1) % 3], dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
        polygon.push(a); const between: { point: THREE.Vector2; t: number }[] = [];
        for (const p of originalPoints) {
          const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
          if (t <= 1e-6 || t >= 1 - 1e-6) continue;
          if (Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) < Math.sqrt(lengthSq) * 1e-8) between.push({ point: p, t });
        }
        between.sort((a, b) => a.t - b.t); polygon.push(...between.map(p => p.point));
      }
      if (polygon.length === 3) conforming.push(...polygon);
      else { const center = polygon.reduce((sum, p) => sum.add(p), new THREE.Vector2()).multiplyScalar(1 / polygon.length); for (let j = 0; j < polygon.length; j++) conforming.push(polygon[j], polygon[(j + 1) % polygon.length], center); }
    }
    triangles = conforming;
    for (let pass = 0; pass < 16; pass++) {
      const midpoints = new Map<string, THREE.Vector2>();
      for (let i = 0; i < triangles.length; i += 3) for (let j = 0; j < 3; j++) {
        const a = triangles[i + j], b = triangles[i + (j + 1) % 3];
        if (a.distanceToSquared(b) > maxEdge * maxEdge) midpoints.set(edgeKey(a, b), a.clone().add(b).multiplyScalar(.5));
      }
      if (!midpoints.size) break;
      const refined: THREE.Vector2[] = [];
      for (let i = 0; i < triangles.length; i += 3) {
        const p = triangles.slice(i, i + 3), m = p.map((a, j) => midpoints.get(edgeKey(a, p[(j + 1) % 3])));
        const count = m.filter(Boolean).length;
        if (count === 0) refined.push(...p);
        else if (count === 3) refined.push(p[0], m[0]!, m[2]!, m[0]!, p[1], m[1]!, m[2]!, m[1]!, p[2], m[0]!, m[1]!, m[2]!);
        else if (count === 1) {
          const j = m.findIndex(Boolean), a = p[j], b = p[(j + 1) % 3], c = p[(j + 2) % 3], ab = m[j]!;
          refined.push(a, ab, c, ab, b, c);
        } else {
          const j = m.findIndex(x => !x), a = p[(j + 1) % 3], b = p[(j + 2) % 3], c = p[j], ab = m[(j + 1) % 3]!, bc = m[(j + 2) % 3]!;
          refined.push(b, bc, ab, a, ab, c, ab, bc, c);
        }
      }
      triangles = refined;
    }
    return triangles;
  }

  const body = group('cello:body');
  const centerY = .6175;
  // Broad lower bout, fuller upper shoulder, deep C-bouts and four projecting corners.
  // Dimensions follow a 755 mm full-size cello; this is not the violin donor outline.
  const outline = new THREE.Shape(); outline.moveTo(0, .3775);
  const sections = [
    [.052, .382, .130, .359, .157, .319],
    [.185, .280, .178, .230, .165, .202],
    [.153, .176, .133, .158, .141, .139],
    [.147, .128, .158, .125, .163, .119],
    [.146, .116, .130, .106, .124, .077],
    [.113, .026, .114, -.027, .128, -.063],
    [.127, -.081, .154, -.090, .171, -.096],
    [.154, -.100, .152, -.111, .166, -.132],
    [.202, -.174, .229, -.211, .218, -.264],
    [.209, -.324, .156, -.372, .083, -.377],
    [.055, -.381, .029, -.3775, 0, -.3775],
  ];
  const anchors = [[0, .3775], ...sections.map(s => s.slice(4))];
  for (const s of sections) outline.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
  for (let i = sections.length - 1; i >= 0; i--) {
    const s = sections[i], a = anchors[i]; outline.bezierCurveTo(-s[2], s[3], -s[0], s[1], -a[0], a[1]);
  }
  outline.closePath();
  // Match ShapeGeometry's boundary sampling so the arched caps and their cut edges meet.
  const rim = outline.getPoints(28).slice(0, -1);
  function fHole(side: number) {
    const hole = new THREE.Path();
    const path = new THREE.Path();
    path.moveTo(.003, .077);
    path.bezierCurveTo(.020, .086, .018, .106, .004, .107);
    path.bezierCurveTo(-.012, .107, -.017, .086, -.005, .077);
    path.bezierCurveTo(-.009, .060, -.015, .035, -.009, .016);
    path.lineTo(-.018, .016); path.lineTo(-.015, .010); path.lineTo(-.006, .010);
    path.bezierCurveTo(.003, -.005, .016, -.023, .009, -.045);
    path.bezierCurveTo(.007, -.054, .003, -.060, -.001, -.064);
    path.bezierCurveTo(-.016, -.060, -.022, -.081, -.010, -.089);
    path.bezierCurveTo(.005, -.099, .022, -.086, .016, -.072);
    path.bezierCurveTo(.013, -.067, .010, -.065, .007, -.064);
    path.bezierCurveTo(.024, -.040, .024, -.020, .013, .004);
    path.lineTo(.022, .004); path.lineTo(.018, .010); path.lineTo(.009, .010);
    path.bezierCurveTo(-.002, .034, -.003, .058, .003, .077); path.closePath();
    // Inner notches line up exactly with the bridge at y = .580 m.
    const points = path.getPoints(18).map(p => new THREE.Vector2(side * (.081 + p.x * .70 + .084 * Math.abs(p.y)), (p.y - .010) * .70 - .0375));
    points.forEach((p, i) => i ? hole.lineTo(p.x, p.y) : hole.moveTo(p.x, p.y)); hole.closePath(); return { hole, points };
  }
  const fholes = [-1, 1].map(fHole), face = outline.clone(); face.holes = fholes.map(f => f.hole);
  const cache = new Map<string, number>();
  function arch(x: number, y: number) {
    const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
    const saved = cache.get(key); if (saved !== undefined) return saved;
    let distance = 1;
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i], b = rim[(i + 1) % rim.length], dx = b.x - a.x, dy = b.y - a.y;
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      distance = Math.min(distance, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
    }
    const rise = .030 * Math.pow(Math.max(0, Math.sin((y + .378) / .756 * Math.PI)), .65)
      * Math.exp(-x * x / .085) * Math.sin(Math.min(1, distance / .069) * Math.PI / 2);
    cache.set(key, rise); return rise;
  }
  const top = (x: number, y: number) => .059 + arch(x, y);
  const back = (x: number, y: number) => -.059 - arch(x, y) * .88;
  function plate(shape: THREE.Shape, reverse = false) {
    const flat = new THREE.ShapeGeometry(shape, 28); const nonindexed = flat.index ? flat.toNonIndexed() : flat;
    // Split every shared edge consistently before lifting onto the arch. Independent triangle
    // recursion creates T-junctions, whose lifted midpoint would otherwise open visible cracks.
    const triangles = subdivide(nonindexed, .0135);
    if (reverse) for (let i = 0; i < triangles.length; i += 3) [triangles[i + 1], triangles[i + 2]] = [triangles[i + 2], triangles[i + 1]];
    if (nonindexed !== flat) nonindexed.dispose(); flat.dispose();
    const positions: number[] = [], normals: number[] = [], uv: number[] = [], colors: number[] = [];
    const fn = reverse ? back : top, e = .0001;
    for (const p of triangles) {
      positions.push(p.x, p.y + centerY, fn(p.x, p.y));
      const n = V(-(fn(p.x + e, p.y) - fn(p.x - e, p.y)) / (2 * e), -(fn(p.x, p.y + e) - fn(p.x, p.y - e)) / (2 * e), 1).normalize().multiplyScalar(reverse ? -1 : 1);
      normals.push(n.x, n.y, n.z); uv.push((p.x + .224) / .448, (p.y + .378) / .756);
      const warm = clamp(arch(p.x, p.y) / .024, 0, 1); colors.push(.70 + .30 * warm, .57 + .43 * warm, .46 + .54 * warm);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return add(geometry, reverse ? mat.back : mat.top, body, reverse ? 'Carved flamed-maple back' : 'Carved spruce belly / open f-holes');
  }
  plate(face); plate(outline, true);
  function wall(points: THREE.Vector2[], z1: (x: number, y: number) => number, z2: (x: number, y: number) => number, material: THREE.Material, shrink = 1) {
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let i = 0; i <= points.length; i++) {
      const p = points[i % points.length], x = p.x * shrink, y = p.y * shrink;
      positions.push(x, y + centerY, z1(x, y), x, y + centerY, z2(x, y)); uv.push(i / points.length * 3, 0, i / points.length * 3, 1);
      if (i < points.length) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return add(geometry, material, body);
  }
  wall(rim, () => -.056, () => .056, mat.rib, .982).name = 'Bent maple ribs';
  wall(rim, (x, y) => top(x, y) - .0045, top, mat.edge).name = 'Spruce edge thickness';
  wall(rim, back, (x, y) => back(x, y) + .0045, mat.edge).name = 'Maple edge thickness';
  for (const f of fholes) wall(f.points, (x, y) => top(x, y) - .005, top, mat.interior).name = 'f-hole exposed cut edge';
  const inside = add(new THREE.ShapeGeometry(outline, 28), mat.interior, body, 'Unvarnished inner back'); inside.position.set(0, centerY, -.054);
  // Narrow black / maple / black purfling, inset on both arched plates.
  for (const reverse of [false, true]) {
    const fn = reverse ? back : top, sign = reverse ? -1 : 1;
    for (const [outer, inner, material] of [[.966, .9625, mat.purfling], [.9625, .9595, mat.inlay], [.9595, .956, mat.purfling]] as const) {
      const positions: number[] = [], uv: number[] = [], indices: number[] = [];
      for (let i = 0; i <= rim.length; i++) {
        const p = rim[i % rim.length];
        for (const factor of [outer, inner]) { const x = p.x * factor, y = p.y * factor; positions.push(x, y + centerY, fn(x, y) + sign * .00038); uv.push(i / rim.length, factor === outer ? 0 : 1); }
        if (i < rim.length) { const k = i * 2; if (reverse) indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
      const band = add(geometry, material, body, 'Flush inlaid purfling'); band.castShadow = false;
    }
    tube(rim.map(p => V(p.x, p.y + centerY, fn(p.x, p.y) - sign * .0017)), .0016, mat.edge, body, true, 350, 8).name = 'Rounded plate edge';
  }
  // Rear centre joint and button are structural features, not decorative branding.
  tube(Array.from({ length: 60 }, (_, i) => { const y = -.372 + i / 59 * .744; return V(0, y + centerY, back(0, y) - .0001); }), .00012, mat.edge, body, false, 64, 5);
  ellipsoid(0, .989, -.059, .019, .012, .003, mat.maple, body).name = 'Back button';

  const neck = group('cello:neck');
  const nutY = 1.280, boardEnd = .726;
  const boardHalf = (y: number) => .0143 + clamp((nutY - y) / (nutY - boardEnd), 0, 1) * .018;
  const boardZ = (x: number, y: number) => .111 + (nutY - y) / (nutY - boardEnd) * .039 - x * x / .13;
  const boardShape = new THREE.Shape(); boardShape.moveTo(-boardHalf(boardEnd), boardEnd); boardShape.lineTo(boardHalf(boardEnd), boardEnd); boardShape.lineTo(boardHalf(nutY), nutY); boardShape.lineTo(-boardHalf(nutY), nutY); boardShape.closePath();
  const board = slab(boardShape, .009, 0, mat.ebony, neck, .0006); board.name = 'Radiused fretless ebony fingerboard';
  // Subdivide the straight slab surface before mapping its transverse radius.
  // Independent top grid avoids the two-triangle flat top of an ordinary extruded board.
  const original = board.geometry; const attrs: Record<string, number[]> = { position: [], normal: [], uv: [] };
  const bp = original.getAttribute('position');
  for (let i = 0; i < bp.count; i += 3) {
    if ([0, 1, 2].every(k => bp.getZ(i + k) >= .00899)) continue;
    for (const key of Object.keys(attrs)) { const a = original.getAttribute(key); for (let k = 0; k < 3; k++) for (let j = 0; j < a.itemSize; j++) attrs[key].push(a.array[(i + k) * a.itemSize + j]); }
  }
  const solid = new THREE.BufferGeometry(); for (const key of Object.keys(attrs)) solid.setAttribute(key, new THREE.Float32BufferAttribute(attrs[key], key === 'uv' ? 2 : 3));
  const sp = solid.getAttribute('position'); for (let i = 0; i < sp.count; i++) sp.setZ(i, boardZ(sp.getX(i), sp.getY(i)) - .009 + sp.getZ(i)); smooth(solid); geometries.add(solid); board.geometry = solid;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 80; row++) {
    const y = boardEnd + row / 80 * (nutY - boardEnd), half = boardHalf(y);
    for (let col = 0; col <= 32; col++) {
      const x = (col / 32 * 2 - 1) * half; positions.push(x, y, boardZ(x, y)); uvs.push(col / 32, row / 80);
      if (row < 80 && col < 32) { const k = row * 33 + col; indices.push(k, k + 1, k + 33, k + 1, k + 34, k + 33); }
    }
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); fg.setIndex(indices); fg.computeVertexNormals(); add(fg, mat.ebony, neck);
  const np: number[] = [], nu: number[] = [], ni: number[] = [];
  for (let row = 0; row <= 48; row++) {
    const t = row / 48, y = .976 + (nutY - .976) * t, half = boardHalf(y) - .0012;
    const depth = .019 + (1 - t) ** 3 * .021;
    for (let j = 0; j <= 28; j++) {
      const a = j / 28 * Math.PI; np.push(Math.cos(a) * half, y, boardZ(0, y) - .01 - Math.sin(a) * depth); nu.push(j / 28, row / 48);
      if (row < 48 && j < 28) { const k = row * 29 + j; ni.push(k, k + 1, k + 29, k + 1, k + 30, k + 29); }
    }
  }
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(np, 3)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(nu, 2)); ng.setIndex(ni); ng.computeVertexNormals(); add(ng, mat.maple, neck, 'Carved maple neck');
  // Continuous tapered heel: broad at the neck, narrowing towards the back button.
  const hp: number[] = [], hu: number[] = [], hi: number[] = [];
  for (let row = 0; row <= 32; row++) {
    const t = row / 32, z = -.059 + t * .161;
    const hw = .016 + Math.sin(t * Math.PI * .5) * .007;
    const yTop = .993 + t * .023, yBottom = .977 - Math.sin(t * Math.PI * .8) * .026;
    for (let j = 0; j <= 40; j++) {
      const a = j / 40 * TAU;
      hp.push(Math.cos(a) * hw, (yTop + yBottom) * .5 + Math.sin(a) * (yTop - yBottom) * .5, z);
      hu.push(j / 40, t);
      if (row < 32 && j < 40) { const k = row * 41 + j; hi.push(k, k + 1, k + 41, k + 1, k + 42, k + 41); }
    }
  }
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(hu, 2)); hg.setIndex(hi); hg.computeVertexNormals(); add(hg, mat.maple, neck, 'Tapered carved heel');
  const nut = slab(rectangle(.0295, .0048, .0006), .0045, .107, mat.ebony, neck); nut.position.y = nutY;
  nut.name = 'Ebony upper nut';

  const head = group('cello:scroll');
  // Open pegbox has bent cheeks and a hollow floor; four shafts really cross the cavity.
  const cheekShape = new THREE.Shape(); cheekShape.moveTo(-.015, 1.282); cheekShape.bezierCurveTo(-.019, 1.330, -.021, 1.377, -.019, 1.414);
  cheekShape.quadraticCurveTo(0, 1.431, .019, 1.414); cheekShape.bezierCurveTo(.021, 1.377, .019, 1.330, .015, 1.282); cheekShape.closePath();
  const cavity = new THREE.Path(); cavity.moveTo(-.010, 1.295); cavity.lineTo(.010, 1.295); cavity.lineTo(.014, 1.402); cavity.quadraticCurveTo(0, 1.412, -.014, 1.402); cavity.closePath(); cheekShape.holes.push(cavity);
  const headZ = (y: number) => .091 - (y - 1.282) * .29;
  const pegbox = slab(cheekShape, .030, 0, mat.carvedMaple, head, .00065);
  const pp = pegbox.geometry.getAttribute('position'); for (let i = 0; i < pp.count; i++) pp.setZ(i, pp.getZ(i) + headZ(pp.getY(i)) - .015); smooth(pegbox.geometry); pegbox.name = 'Carved open pegbox cheeks';
  const floor = new THREE.Shape(); floor.moveTo(-.014, 1.284); floor.lineTo(.014, 1.284); floor.lineTo(.018, 1.413); floor.quadraticCurveTo(0, 1.425, -.018, 1.413); floor.closePath();
  const floorMesh = slab(floor, .004, 0, mat.carvedMaple, head); const fp = floorMesh.geometry.getAttribute('position'); for (let i = 0; i < fp.count; i++) fp.setZ(i, fp.getZ(i) + headZ(fp.getY(i)) - .019); smooth(floorMesh.geometry);
  const posts: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1, y = 1.306 + i * .028, z = headZ(y) + .001;
    rod(V(-.023, y, z), V(.023, y, z), .0030, mat.ebony, head, .0028, 24);
    rod(V(side * .018, y, z), V(side * .045, y, z), .0041, mat.ebony, head, .0033, 24);
    ellipsoid(side * .052, y, z, .010, .013, .0041, mat.ebony, head).name = 'Carved ebony tuning peg';
    rod(V(side * .031, y, z), V(side * .033, y, z), .0044, mat.darkMetal, head, .0044, 24);
    ellipsoid(side * .053, y, z + .004, .0021, .0021, .00055, mat.pearl, head);
    const x = (i - 1.5) * .0032; posts.push(V(x, y, z + .0033));
    const coil: THREE.Vector3[] = []; for (let j = 0; j <= 72; j++) { const t = j / 72, a = t * TAU * 5; coil.push(V(x - .003 + t * .006, y + Math.cos(a) * .0032, z + Math.sin(a) * .0032)); }
    tube(coil, .00027, mat.string, head, false, 110, 5).name = 'String winding on peg';
  }
  // The volute is a single carved mass flowing into its throat, not a cylinder with a spiral pasted on.
  // Side-profile coordinates are (depth Z, height Y); the caps are displaced into spiral channels.
  const scrollY = 1.438, scrollZ = .054;
  const scrollShape = new THREE.Shape(); scrollShape.moveTo(.0695, 1.395);
  scrollShape.bezierCurveTo(.074, 1.410, .086, 1.418, .083, 1.441);
  scrollShape.bezierCurveTo(.081, 1.460, .065, 1.467, .048, 1.465);
  scrollShape.bezierCurveTo(.025, 1.463, .018, 1.445, .026, 1.426);
  scrollShape.bezierCurveTo(.030, 1.414, .041, 1.410, .045, 1.400);
  scrollShape.quadraticCurveTo(.045, 1.394, .041, 1.392); scrollShape.closePath();
  const scrollRim = scrollShape.getPoints(40).slice(0, -1);
  const sideWidth = (y: number) => .0198 + .0022 * Math.exp(-(((y - 1.439) / .022) ** 2));
  const sideRelief = (z: number, y: number) => {
    const dz = z - scrollZ, dy = y - scrollY, radius = Math.hypot(dz, dy), angle = Math.atan2(dy, dz);
    const mask = THREE.MathUtils.smoothstep(radius, .002, .006) * (1 - THREE.MathUtils.smoothstep(radius, .022, .027));
    const phase = radius / .026 * TAU * 1.85 - angle;
    const groove = Math.exp(-(Math.sin(phase / 2) ** 2) / .013);
    return mask * (-.0031 * groove + .0010 * Math.cos(phase)) + .0014 * Math.exp(-radius * radius / .000018);
  };
  const swp: number[] = [], swu: number[] = [], swi: number[] = [];
  for (let i = 0; i <= scrollRim.length; i++) {
    const p = scrollRim[i % scrollRim.length], w = sideWidth(p.y);
    swp.push(-w, p.y, p.x, w, p.y, p.x); swu.push(-w / .080 + .5, (p.y - 1.38) / .12, w / .080 + .5, (p.y - 1.38) / .12);
    if (i < scrollRim.length) { const k = i * 2; swi.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const swg = new THREE.BufferGeometry(); swg.setAttribute('position', new THREE.Float32BufferAttribute(swp, 3)); swg.setAttribute('uv', new THREE.Float32BufferAttribute(swu, 2)); swg.setIndex(swi); swg.computeVertexNormals(); add(swg, mat.carvedMaple, head, 'Continuous scroll throat and outer carving');
  const capIndexed = new THREE.ShapeGeometry(scrollShape, 40), capFlat = capIndexed.toNonIndexed();
  const capTriangles = subdivide(capFlat, .0010); capFlat.dispose(); capIndexed.dispose();
  for (const side of [-1, 1]) {
    const p: number[] = [], uv: number[] = [];
    for (let i = 0; i < capTriangles.length; i += 3) {
      for (const j of side < 0 ? [0, 1, 2] : [0, 2, 1]) {
        const q = capTriangles[i + j]; p.push(side * (sideWidth(q.y) + sideRelief(q.x, q.y)), q.y, q.x); uv.push((q.x - .02) / .075, (q.y - 1.39) / .08);
      }
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); smooth(sg); add(sg, mat.carvedMaple, head, 'Integral carved volute channels');
  }
  // Paired flutes continue down the rear spine of the scroll into the pegbox.
  for (const side of [-1, 1]) tube([V(side * .007, 1.458, .050), V(side * .008, 1.438, .026), V(side * .008, 1.408, .035), V(side * .007, 1.370, .047), V(side * .005, 1.312, .063)], .0014, mat.edge, head, false, 90, 8);

  const bridge = group('cello:bridge'); bridge.position.set(0, .580, top(0, .580 - centerY));
  // Bridge coordinates x / height above belly. Rotation places it perpendicular to the strings.
  const bs = new THREE.Shape(); bs.moveTo(-.045, 0); bs.lineTo(-.026, 0); bs.lineTo(-.023, .010); bs.quadraticCurveTo(0, .026, .023, .010); bs.lineTo(.026, 0); bs.lineTo(.045, 0);
  bs.lineTo(.044, .007); bs.lineTo(.031, .012); bs.lineTo(.035, .024); bs.bezierCurveTo(.025, .028, .025, .042, .035, .046); bs.lineTo(.0305, .069);
  bs.quadraticCurveTo(0, .088, -.0305, .069); bs.lineTo(-.035, .046); bs.bezierCurveTo(-.025, .042, -.025, .028, -.035, .024); bs.lineTo(-.031, .012); bs.lineTo(-.044, .007); bs.closePath();
  const heart = new THREE.Path(); heart.moveTo(0, .058); heart.bezierCurveTo(-.016, .064, -.017, .045, 0, .037); heart.bezierCurveTo(.017, .045, .016, .064, 0, .058); heart.closePath(); bs.holes.push(heart);
  for (const side of [-1, 1]) { const kidney = new THREE.Path(); kidney.absellipse(side * .022, .034, .0045, .008, 0, TAU, false, side * .25); bs.holes.push(kidney); }
  const bg = new THREE.ExtrudeGeometry(bs, { depth: .009, curveSegments: 32, bevelEnabled: true, bevelSize: .00045, bevelThickness: .00045, bevelSegments: 3 });
  // Top tapers to 2 mm. Feet conform to the arched belly rather than floating.
  const bpos = bg.getAttribute('position');
  const bridgeUV = bg.getAttribute('uv');
  for (let i = 0; i < bpos.count; i++) {
    const x = bpos.getX(i), h = bpos.getY(i), along = bpos.getZ(i) - .0045;
    bridgeUV.setXY(i, (x + .045) / .09, h / .084);
    bpos.setXYZ(i, x, -along * (1 - clamp(h / .084, 0, 1) * .74), h + (top(x, .580 - centerY) - top(0, .580 - centerY)) * Math.max(0, 1 - h / .016));
  }
  smooth(bg); add(bg, mat.bridge, bridge, 'Pierced maple bridge / heart and kidneys');

  const tail = group('cello:tailpiece');
  const ts = new THREE.Shape(); ts.moveTo(-.031, .463); ts.quadraticCurveTo(0, .472, .031, .463); ts.bezierCurveTo(.032, .420, .022, .337, .018, .310); ts.quadraticCurveTo(0, .292, -.018, .310); ts.bezierCurveTo(-.022, .337, -.032, .420, -.031, .463); ts.closePath();
  const tailZ = (x: number, y: number) => .069 + (y - .300) * .25 - x * x * 2;
  const tailMesh = slab(ts, .009, 0, mat.ebony, tail, .0014);
  const tp = tailMesh.geometry.getAttribute('position'); for (let i = 0; i < tp.count; i++) tp.setZ(i, tp.getZ(i) + tailZ(tp.getX(i), tp.getY(i))); smooth(tailMesh.geometry); tailMesh.name = 'Arched ebony tailpiece';
  const tailAnchors: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * .015, y = .450, z = tailZ(x, y) + .010;
    const slot = slab(rectangle(.004, .015, .0018), .0006, z, mat.black, tail, 0); slot.position.set(x, y, z);
    rod(V(x, y - .006, z), V(x, y - .006, z + .008), .0014, mat.darkMetal, tail, .0014, 14);
    rod(V(x - .0032, y - .006, z + .009), V(x + .0032, y - .006, z + .009), .0018, mat.metal, tail, .0018, 18);
    rod(V(x, y + .001, z), V(x, y + .016, z + .0045), .0011, mat.metal, tail);
    tailAnchors.push(V(x, y + .016, z + .005));
  }
  const saddle = slab(rectangle(.032, .010, .001), .009, .057, mat.ebony, tail); saddle.position.y = .247;
  for (const side of [-1, 1]) tube([V(side * .008, .313, .081), V(side * .016, .264, .066), V(side * .010, .240, .034), V(side * .004, .228, .006)], .0014, mat.black, tail, false, 50, 8).name = 'Tailgut over lower saddle';
  const endpin = group('cello:endpin');
  rod(V(0, .222, 0), V(0, .251, 0), .0085, mat.ebony, endpin, .0065, 32);
  rod(V(0, .010, 0), V(0, .230, 0), .0040, mat.darkMetal, endpin, .004, 32).name = 'Extended steel endpin';
  rod(V(0, .205, 0), V(0, .225, 0), .0082, mat.darkMetal, endpin, .0082, 32);
  rod(V(.006, .215, 0), V(.016, .215, 0), .002, mat.metal, endpin);
  ellipsoid(.018, .215, 0, .0045, .0055, .0027, mat.ebony, endpin);
  rod(V(0, .0015, 0), V(0, .015, 0), .0015, mat.metal, endpin, .004, 24);
  ellipsoid(0, .002, 0, .005, .002, .005, mat.rubber, endpin);

  const strings = group('cello:strings');
  const speakingStrings: CelloStringVisual[] = [];
  const bridgeXs = [-.027, -.009, .009, .027], nutXs = [-.0112, -.00373, .00373, .0112];
  const radii = [.00064, .00050, .00038, .00029];
  for (let i = 0; i < 4; i++) {
    const x = bridgeXs[i], radius = radii[i];
    // Quadratic Bezier crown has midpoint .0785m and endpoints .069m.
    const crown = .0785 - .0095 * (x / .0305) ** 2;
    const contact = V(x, .580, bridge.position.z + crown + radius + .00025);
    const nutContact = V(nutXs[i], nutY + .001, .1123 - nutXs[i] ** 2 / .13 + radius);
    rod(tailAnchors[i], contact, radius, mat.string, strings, radius, 10).name = 'Afterlength';
    const speaking = createCelloString(contact, nutContact, radius, mat.string);
    speaking.mesh.name = `${['C2', 'G2', 'D3', 'A3'][i]} speaking string`;
    strings.add(speaking.mesh); geometries.add(speaking.mesh.geometry); speakingStrings.push(speaking);
    rod(nutContact, posts[i], radius, mat.string, strings, radius, 10);
    rod(tailAnchors[i], tailAnchors[i].clone().lerp(contact, .16), radius * 1.35, mat.red, strings, radius * 1.35, 10);
    // Close-up winding on the thick C and G afterlengths remains economical.
    if (i < 2) {
      const a = tailAnchors[i].clone().lerp(contact, .20), b = tailAnchors[i].clone().lerp(contact, .42), direction = b.clone().sub(a).normalize();
      const u = V(1, 0, 0), v = new THREE.Vector3().crossVectors(direction, u).normalize();
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 360; j++) { const t = j / 360, angle = t * TAU * 44; points.push(a.clone().lerp(b, t).addScaledVector(u, Math.cos(angle) * radius).addScaledVector(v, Math.sin(angle) * radius)); }
      tube(points, .00012, mat.string, strings, false, 380, 5);
    }
  }
  cache.clear();
  root.userData.modelDimensions = { bodyLength: .755, lowerBout: .439, upperBout: .346, nominalStringLength: .700, totalHeight: 1.463, units: 'metres' };
  root.updateMatrixWorld(true);
  let disposed = false;
  return { root, strings: speakingStrings, dispose() {
    if (disposed) return; disposed = true; root.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(mat)) material.dispose();
    for (const string of speakingStrings) string.mesh.material.dispose();
    for (const texture of textures) texture.dispose();
    root.clear();
  } };
}
