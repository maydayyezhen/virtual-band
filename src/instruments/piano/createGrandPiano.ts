import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface PianoKey { pivot: THREE.Group; note: number }

/** Native metres. +Z is the player's side; the long bass rim is on the left. */
export function createGrandPiano() {
  const root = new THREE.Group();
  root.name = 'atelier:grand-piano';
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x11151a, roughness: .23, metalness: .12, clearcoat: 1, clearcoatRoughness: .15 });
  const ebony = new THREE.MeshPhysicalMaterial({ color: 0x121217, roughness: .3, clearcoat: .65 });
  const ivory = new THREE.MeshPhysicalMaterial({ color: 0xf0ebdc, roughness: .32, clearcoat: .3 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb99a58, metalness: .82, roughness: .28 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x997039, metalness: .62, roughness: .42 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xa67e49, roughness: .62 });
  const grain = new THREE.MeshStandardMaterial({ color: 0x795a34, roughness: .8 });
  const felt = new THREE.MeshStandardMaterial({ color: 0x702c32, roughness: .95 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x202128, roughness: .64 });
  const stringMat = new THREE.MeshStandardMaterial({ color: 0xc0b5a0, metalness: .86, roughness: .33 });

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = root) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = lacquer, parent: THREE.Object3D = root, radius = .007) {
    const object = mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 3, h / 3, d / 3)), mat, parent);
    object.position.set(x, y, z); return object;
  }
  function rod(a: number[], b: number[], radius: number, mat: THREE.Material, parent: THREE.Object3D = root) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const object = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 10), mat, parent);
    object.position.copy(start).add(end).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return object;
  }
  // Shapes use (x, -z), so extrusion becomes vertical after rotation.
  const outline = new THREE.Shape();
  outline.moveTo(-.75, -.42); outline.lineTo(.75, -.42); outline.lineTo(.75, -.05);
  outline.bezierCurveTo(.75, .38, .32, .5, .29, 1.03);
  outline.bezierCurveTo(.28, 1.64, -.03, 1.85, -.4, 1.85);
  outline.bezierCurveTo(-.65, 1.85, -.75, 1.65, -.75, 1.43); outline.closePath();
  function plate(shape: THREE.Shape, thickness: number, y: number, mat: THREE.Material, parent: THREE.Object3D = root) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .006, bevelThickness: .004, curveSegments: 40 });
    geometry.rotateX(-Math.PI / 2);
    const object = mesh(geometry, mat, parent); object.position.y = y; return object;
  }
  const rim = outline.clone();
  const inner = new THREE.Path();
  inner.moveTo(-.689, -.35); inner.lineTo(.686, -.35); inner.lineTo(.686, -.05);
  inner.bezierCurveTo(.686, .34, .257, .48, .23, 1.03);
  inner.bezierCurveTo(.22, 1.58, -.04, 1.79, -.4, 1.79);
  inner.bezierCurveTo(-.60, 1.79, -.689, 1.6, -.689, 1.43); inner.closePath();
  rim.holes.push(inner);
  plate(outline, .032, .73, lacquer); // underside, below the rim bevel
  plate(new THREE.Shape(inner.getPoints(80)), .016, .81, wood); // inset soundboard, no coplanar outer walls
  plate(rim, .22, .77, lacquer);
  const rimPoints = outline.getPoints(120).map(p => new THREE.Vector3(p.x, .997, -p.y));
  const rimPath = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 1; i < rimPoints.length; i++) rimPath.add(new THREE.LineCurve3(rimPoints[i - 1], rimPoints[i]));
  mesh(new THREE.TubeGeometry(rimPath, 360, .002, 6, true), brass);
  // Spruce seams are clipped against the same contour used to build the rim.
  const contour = outline.getPoints(160);
  function inside(x: number, z: number) {
    let value = false;
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      const a = contour[i], b = contour[j], y = -z;
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) value = !value;
    }
    return value;
  }
  for (let x = -.66; x < .68; x += .047) {
    let end = -.02;
    while (inside(x, end - .015) && end > -1.77) end -= .015;
    if (end < -.08) box(.0012, .001, -end, x, .831, end / 2, grain, root, .0002);
  }
  // Cast plate, diagonal braces and visible strings convey an open grand at stage distance.
  box(1.32, .045, .13, 0, .875, .09, iron);
  rod([-.62, .875, .1], [-.53, .875, -1.62], .028, iron);
  rod([.55, .875, .1], [-.2, .875, -1.55], .025, iron);
  rod([-.15, .875, .1], [-.34, .875, -1.7], .025, iron);
  for (let n = 0; n < 76; n++) {
    const x = -.60 + n * .016;
    let end = -.07;
    while (inside(x, end - .02) && end > -1.70) end -= .02;
    end += .09;
    if (end >= -.04) continue;
    const mat = n < 20 ? brass : stringMat;
    rod([x, .91, .13], [x, .89, end], n < 20 ? .0015 : .0008, mat);
    rod([x + .004, .91, .13], [x + .004, .89, end], .0007, mat);
    rod([x, .885, .17], [x, .925, .17], .004, stringMat);
  }
  box(1.32, .018, .023, 0, .924, .21, felt);
  // Keyboard bed and cheeks. 52 white keys / 36 raised black keys, A0 through C8.
  box(1.5, .08, .34, 0, .705, .54);
  box(.085, .19, .40, -.717, .795, .535);
  box(.085, .19, .40, .717, .795, .535);
  box(1.35, .105, .064, 0, .874, .337);
  box(1.345, .008, .017, 0, .806, .39, felt);
  const keys = new Map<number, PianoKey>();
  const whiteWidth = 1.334 / 52;
  let whites = 0;
  for (let note = 21; note <= 108; note++) {
    const black = [1, 3, 6, 8, 10].includes(note % 12);
    const x = -.667 + (black ? whites : whites + .5) * whiteWidth;
    const pivot = new THREE.Group(); pivot.position.set(x, black ? .824 : .776, .385); root.add(pivot);
    const key = box(black ? .0145 : whiteWidth - .0011, black ? .032 : .035, black ? .16 : .26,
      0, 0, black ? .082 : .13, black ? ebony : ivory, pivot, .002);
    key.name = `piano:key:${note}`; key.userData.hit = `key:${note}`;
    keys.set(note, { pivot, note }); if (!black) whites++;
  }
  // Open lid is a separate rigid object, hinged along the straight bass rim.
  const lid = new THREE.Group(); lid.position.set(-.756, 1.012, 0); lid.rotation.z = .57; root.add(lid);
  const lidMesh = plate(outline, .035, 0, lacquer, lid); lidMesh.position.x = .756;
  const underside = plate(outline, .003, -.007, wood, lid); underside.scale.set(.968, 1, .976); underside.position.x = .756;
  for (const z of [-1.3, -.6, .15]) rod([-.757, 1.012, z - .055], [-.757, 1.012, z + .055], .012, brass);
  lid.updateMatrix();
  const propEnd = new THREE.Vector3(1.20, 0, -.28).applyMatrix4(lid.matrix);
  rod([.50, .99, -.28], propEnd.toArray(), .017, lacquer);
  rod([.50, .977, -.28], [.50, 1.01, -.28], .027, brass);
  // Music desk: framed openwork, rather than a solid slab hiding the soundboard.
  const desk = new THREE.Group(); desk.position.set(0, .94, .25); desk.rotation.x = -.19; root.add(desk);
  box(.70, .027, .10, 0, 0, 0, lacquer, desk);
  for (const x of [-.33, .33]) box(.025, .23, .026, x, .12, 0, lacquer, desk);
  box(.68, .025, .026, 0, .24, 0, lacquer, desk);
  for (let x = -.24; x <= .25; x += .08) box(.009, .2, .012, x, .12, 0, brass, desk);
  // Small maker's mark is a material detail, not a world-space UI label.
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c5ad70'; ctx.font = '36px Georgia'; ctx.textAlign = 'center'; ctx.fillText('A T E L I E R', 256, 58);
  const logo = new THREE.CanvasTexture(canvas); logo.colorSpace = THREE.SRGBColorSpace;
  const logoMesh = mesh(new THREE.PlaneGeometry(.27, .051), new THREE.MeshBasicMaterial({ map: logo, transparent: true, depthWrite: false }));
  logoMesh.position.set(0, .88, .427);
  // Three tapered legs and brass double-wheel casters.
  for (const [x, z] of [[-.63, .34], [.63, .34], [-.40, -1.51]]) {
    const leg = mesh(new THREE.CylinderGeometry(.055, .036, .61, 4), lacquer);
    leg.position.set(x, .405, z); leg.rotation.y = Math.PI / 4;
    box(.092, .035, .092, x, .13, z, brass);
    box(.105, .095, .042, x, .08, z, brass);
    for (const dx of [-.04, .04]) {
      const wheel = mesh(new THREE.CylinderGeometry(.045, .045, .025, 20), brass);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x + dx, .045, z);
    }
  }
  for (const x of [-.11, .11]) rod([x, .7, .34], [x, .18, .44], .018, lacquer);
  box(.31, .07, .16, 0, .16, .44);
  const pedals: THREE.Group[] = [];
  for (const x of [-.086, 0, .086]) {
    const pivot = new THREE.Group(); pivot.position.set(x, .13, .43); root.add(pivot);
    box(.044, .022, .20, 0, 0, .085, brass, pivot, .009);
    pedals.push(pivot);
  }
  pedals[2].userData.hit = 'pedal:sustain';
  // Upholstered player's bench, visually separate but part of the performance footprint.
  box(.64, .065, .36, 0, .43, 1.12);
  box(.66, .075, .38, 0, .49, 1.12, leather, root, .025);
  for (const x of [-.26, .26]) for (const z of [.99, 1.25]) box(.035, .39, .035, x, .205, z);
  for (const x of [-.20, 0, .20]) for (const z of [1.04, 1.20]) {
    const button = mesh(new THREE.SphereGeometry(.009, 10, 6), ebony);
    button.scale.y = .25; button.position.set(x, .528, z);
  }
  root.updateMatrixWorld(true);
  return { root, keys, pedals };
}
