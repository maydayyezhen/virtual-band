import * as THREE from 'three';
import type { LegacyElectricModel } from './legacyElectricAsset';

export type ElectricModelVariant = 'classic' | 'single-cut' | 'flying-v';

/** Exterior only: all string coordinates, controls and controller references stay intact. */
export function applyElectricVariant(model: LegacyElectricModel, variant: ElectricModelVariant): void {
  if (variant === 'classic' || model.root.userData.electricModelVariant === variant) return;
  const previous = model.root.getObjectByName('electric:exterior');
  if (!previous) throw new Error('Electric donor is missing its replaceable exterior');
  const oldBody = previous.children.find(object => object instanceof THREE.Mesh) as THREE.Mesh;
  const oldPaint = oldBody.material;
  const flyingV = variant === 'flying-v';
  const removed = resources(previous);
  const exterior = new THREE.Group();
  exterior.name = 'electric:exterior';
  exterior.userData.electricAppearance = true;

  const lacquer = new THREE.MeshPhysicalMaterial({
    map: flyingV ? null : cherryTexture(), color: flyingV ? 0xee781b : 0xffffff,
    metalness: flyingV ? 0.48 : 0.08, roughness: 0.26,
    clearcoat: 1, clearcoatRoughness: 0.18,
  });
  const dark = new THREE.MeshStandardMaterial({ color: flyingV ? 0x151b22 : 0x332119, roughness: 0.45 });
  const cream = flyingV ? dark : new THREE.MeshPhysicalMaterial({ color: 0xe8d4a9, roughness: 0.34, clearcoat: 0.4 });
  const nickel = new THREE.MeshPhysicalMaterial({ color: 0xc6c0aa, metalness: 0.94, roughness: 0.27 });

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
    const result = new THREE.Mesh(geometry, material);
    result.name = name;
    result.castShadow = result.receiveShadow = true;
    exterior.add(result);
    return result;
  }
  function slab(shape: THREE.Shape, depth: number, z: number, material: THREE.Material, name: string, bevel = 0): THREE.Mesh {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, steps: 1, curveSegments: 40,
      bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 8,
    });
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      uv.setXY(i, (position.getX(i) - bounds.min.x) / (bounds.max.x - bounds.min.x),
        (position.getY(i) - bounds.min.y) / (bounds.max.y - bounds.min.y));
    }
    const result = mesh(geometry, material, name);
    result.position.z = z;
    return result;
  }

  // Broad bass shoulder and a single rounded treble cutaway, within the donor's stand footprint.
  const body = new THREE.Shape();
  if (flyingV) {
    body.moveTo(-0.34, 0.48);
    body.lineTo(0.34, 0.48);
    body.quadraticCurveTo(0.41, 0.46, 0.47, 0.35);
    body.lineTo(0.97, -0.43);
    body.lineTo(2.04, -3.15);
    body.quadraticCurveTo(2.14, -3.40, 1.89, -3.29);
    body.lineTo(0.14, -2.71);
    body.quadraticCurveTo(0, -2.66, -0.14, -2.71);
    body.lineTo(-1.89, -3.29);
    body.quadraticCurveTo(-2.14, -3.40, -2.04, -3.15);
    body.lineTo(-0.97, -0.43);
    body.lineTo(-0.47, 0.35);
    body.quadraticCurveTo(-0.41, 0.46, -0.34, 0.48);
  } else {
  body.moveTo(-0.10, -3.22);
  body.bezierCurveTo(0.76, -3.29, 1.45, -2.99, 1.59, -2.21);
  body.bezierCurveTo(1.72, -1.50, 1.28, -1.02, 1.06, -0.54);
  body.bezierCurveTo(0.90, -0.17, 1.17, 0.16, 1.01, 0.47);
  body.bezierCurveTo(0.91, 0.67, 0.73, 0.76, 0.65, 0.58);
  body.bezierCurveTo(0.54, 0.36, 0.61, 0.07, 0.48, 0.03);
  body.bezierCurveTo(0.36, 0.00, 0.33, 0.18, 0.32, 0.40);
  body.lineTo(-0.32, 0.40);
  body.bezierCurveTo(-0.36, 0.87, -0.45, 1.46, -0.76, 1.43);
  body.bezierCurveTo(-1.24, 1.42, -1.47, 1.04, -1.43, 0.58);
  body.bezierCurveTo(-1.41, 0.06, -1.04, -0.19, -1.09, -0.61);
  body.bezierCurveTo(-1.13, -0.98, -1.66, -1.34, -1.60, -2.02);
  body.bezierCurveTo(-1.57, -2.79, -0.96, -3.24, -0.10, -3.22);
  }
  body.closePath();
  slab(body, 0.36, -0.18, lacquer, flyingV ? 'Amber metallic Flying V body' : 'Cherry single-cut body', 0.065);
  const outline = body.getSpacedPoints(240).slice(0, -1);
  const binding = flyingV ? [
    [0.245, 0.012, dark, 'Dark Flying V edge'],
  ] as const : [
    [0.235, 0.025, cream, 'Cream body binding'],
    [0.258, 0.006, dark, 'Fine binding seam'],
    [-0.224, 0.011, cream, 'Rear binding'],
  ] as const;
  for (const [z, radius, material, name] of binding) {
    const curve = new THREE.CatmullRomCurve3(outline.map(p => new THREE.Vector3(p.x, p.y, z)), true, 'centripetal');
    mesh(new THREE.TubeGeometry(curve, 280, radius, 8, true), material, name);
  }

  // Small layered pickguard exposes the lacquer instead of covering the whole upper bout.
  const guard = new THREE.Shape();
  if (flyingV) {
    guard.moveTo(-0.33, 0.25);
    guard.lineTo(0.33, 0.25);
    guard.lineTo(0.69, -0.44);
    guard.lineTo(1.54, -2.96);
    // Open bridge cutout keeps the tremolo plate seated on the lacquer.
    guard.lineTo(0.52, -2.53);
    guard.lineTo(0.52, -1.99);
    guard.lineTo(-0.52, -1.99);
    guard.lineTo(-0.52, -2.53);
    guard.lineTo(-1.54, -2.96);
    guard.lineTo(-0.69, -0.44);
    guard.closePath();
  } else {
  guard.moveTo(-0.51, -0.30);
  guard.lineTo(-0.51, -1.67);
  guard.quadraticCurveTo(-0.71, -1.89, -1.09, -1.45);
  guard.quadraticCurveTo(-1.23, -1.17, -0.98, -0.82);
  guard.lineTo(-0.72, -0.30);
  guard.closePath();
  }
  slab(guard, 0.012, 0.261, flyingV ? nickel : dark, 'Pickguard laminated edge', 0.004);
  slab(guard, 0.009, 0.274, flyingV ? dark : cream, flyingV ? 'Graphite V pickguard' : 'Small cream pickguard', 0.003);
  const guardScrews = flyingV
    ? [[-0.48, -0.34], [0.48, -0.34], [-0.80, -1.38], [0.80, -1.38], [-1.31, -2.64], [1.31, -2.64]]
    : [[-0.63, -0.42], [-0.94, -1.40]];
  for (const [x, y] of guardScrews) {
    const screw = mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.009, 16), nickel, 'Pickguard screw');
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, y, 0.287);
    mesh(new THREE.BoxGeometry(0.027, 0.004, 0.002), dark, 'Screw slot').position.set(x, y, 0.293);
  }
  // Cream mounting rings surround the original detailed nickel and zebra humbuckers.
  for (const y of [-0.78, -1.58]) {
    const ring = roundedRect(1.015, 0.48, 0.055);
    ring.holes.push(roundedRect(0.927, 0.397, 0.036));
    const mounting = slab(ring, 0.025, 0.265, flyingV ? dark : cream, 'Humbucker mounting ring', 0.002);
    mounting.position.y = y;
  }

  previous.removeFromParent();
  model.root.add(exterior);
  // The matching headstock shared the donor's body finish before batching.
  model.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.material === oldPaint) object.material = lacquer;
  });
  model.root.userData.electricModelVariant = variant;
  model.root.name = flyingV ? 'Atelier / Amber Flying V electric' : 'Atelier / Cherry single-cut electric';
  const upperStrap = model.root.getObjectByName('electric:upper-strap');
  const lowerStrap = model.root.getObjectByName('electric:lower-strap');
  const stand = model.root.getObjectByName('electric:stand');
  upperStrap?.position.set(flyingV ? -0.10 : 0, flyingV ? -1.90 : 0, 0);
  lowerStrap?.position.set(flyingV ? -1.80 : 0, 0, 0);
  // The wide padded cradle catches the wings, outside the V's central opening.
  if (stand) stand.scale.x = flyingV ? 2.65 : 1;
  model.root.updateMatrixWorld(true);
  const retained = resources(model.root);
  for (const geometry of removed.geometries) if (!retained.geometries.has(geometry)) geometry.dispose();
  for (const material of removed.materials) if (!retained.materials.has(material)) material.dispose();
  for (const texture of removed.textures) if (!retained.textures.has(texture)) texture.dispose();
}

function roundedRect(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2, y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function cherryTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const across = x / canvas.width;
    const flame = Math.sin(y * 0.17 + Math.sin(across * 13) * 1.3);
    const grain = Math.sin(x * 0.84 + Math.sin(y * 0.012) * 2);
    const edge = Math.pow(Math.abs(across - 0.5) * 2, 3);
    const shade = flame * 4 + grain * 1.3 - edge * 17;
    const i = (y * canvas.width + x) * 4;
    pixels.data.set([112 + shade, 29 + shade * 0.35, 39 + shade * 0.4, 255], i);
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function resources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}
