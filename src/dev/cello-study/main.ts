import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RendererHost } from '../../engine/RendererHost';
import { createAtelierStudioEnvironmentTexture } from '../../venues/atelier-studio/AtelierStudioEnvironment';
import { buildLegacyViolinAsset } from '../../instruments/violin/legacyViolinAsset';
import { createCelloAssembly } from '../../instruments/cello/createCelloAssembly';
import './study.css';

type Subject = 'cello' | 'violin' | 'compare';
type View = 'three-quarter' | 'front' | 'back' | 'side' | 'scroll' | 'bridge' | 'body' | 'bow' | 'bow-frog' | 'bow-tip';
const detailViews = ['scroll', 'bridge', 'body', 'bow', 'bow-frog', 'bow-tip'];
const mount = document.querySelector<HTMLElement>('#study-stage')!;
const status = document.querySelector<HTMLElement>('#study-status')!;
const host = new RendererHost(mount);
host.applySceneProfile({ clearColor: 0x303136, toneMappingExposure: 1,
  environment: { createSource: createAtelierStudioEnvironmentTexture },
  shadows: { enabled: true, autoUpdate: false }, pixelRatio: { desktopMax: 2 } });
host.scene.environmentIntensity = .6;
const camera = new THREE.PerspectiveCamera(34, 1, .005, 50);
const controls = new OrbitControls(camera, host.renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .12;
controls.minDistance = .07; controls.maxDistance = 8; controls.maxPolarAngle = Math.PI * .57;
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x303136, roughness: .9 });
const groundGeometry = new THREE.PlaneGeometry(30, 30);
const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.rotation.x = -Math.PI / 2; ground.position.y = -.004; ground.receiveShadow = true; host.scene.add(ground);
host.scene.add(new THREE.HemisphereLight(0xe9eef4, 0x746654, .65));
for (const [position, color, intensity] of [ [[-2.2, 3.5, 3.2], 0xfff4e3, 3], [[2.8, 2, 1], 0xd8e7ff, 1.7], [[.5, 3, -2.5], 0xffeed5, 2.4] ] as const) {
  const light = new THREE.DirectionalLight(color, intensity); light.position.set(position[0], position[1], position[2]);
  if (color === 0xfff4e3) {
    light.castShadow = true; light.shadow.mapSize.set(4096, 4096); light.shadow.bias = -.0001; light.shadow.normalBias = .003;
    Object.assign(light.shadow.camera, { left: -1.6, right: 1.6, top: 1.8, bottom: -1.6, near: .1, far: 12 }); light.shadow.camera.updateProjectionMatrix();
  }
  host.scene.add(light);
}
const clay = new THREE.MeshStandardMaterial({ color: 0xc2beb6, roughness: .72 });
const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
const subjects = new THREE.Group(); host.scene.add(subjects);
let assembly: ReturnType<typeof createCelloAssembly> | null = null;
let cello: ReturnType<typeof createCelloAssembly>['model'] | null = null;
let bow: ReturnType<typeof createCelloAssembly>['bow'] | null = null;
let celloDisplay = new THREE.Group();
let violin: THREE.Group | null = null;
let subject: Subject = 'cello', currentView: View = 'three-quarter', disposed = false, raf = 0;

function frameView(view: View): void {
  if (!cello || !violin) return;
  currentView = view;
  cello.root.visible = !(subject === 'cello' && view.startsWith('bow'));
  host.invalidateShadows();
  let object: THREE.Object3D = subject === 'compare' ? subjects : subject === 'violin' ? violin : celloDisplay;
  if (subject === 'cello' && detailViews.includes(view)) object = celloDisplay.getObjectByName(`cello:${view}`) ?? cello.root;
  const bounds = new THREE.Box3().setFromObject(object), target = bounds.getCenter(new THREE.Vector3());
  const direction = view.startsWith('bow') ? new THREE.Vector3(.3, .08, 1) : view === 'back' ? new THREE.Vector3(.12, .08, -1) : view === 'side' ? new THREE.Vector3(1, .05, .06) : view === 'front' ? new THREE.Vector3(0, .02, 1) : view === 'bridge' ? new THREE.Vector3(.4, 1.1, 1) : new THREE.Vector3(.52, .15, 1);
  direction.normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const narrow = mount.clientWidth <= 700, tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let distance = .08;
  // Fit all eight corners in the unobscured viewport, including perspective depth.
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const relative = new THREE.Vector3(x, y, z).sub(target), depth = relative.dot(direction);
    distance = Math.max(distance,
      Math.abs(relative.dot(right)) / (tanHalf * camera.aspect * (narrow ? .88 : .75)) + depth,
      Math.abs(relative.dot(up)) / (tanHalf * (narrow ? .64 : .86)) + depth);
  }
  // Reserve the desktop controls' visual area while keeping genuine perspective.
  controls.target.copy(target); camera.position.copy(target).addScaledVector(direction.normalize(), distance);
  camera.lookAt(target); controls.update();
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
}
function selectSubject(value: Subject): void {
  if (!cello || !violin) return;
  subject = value;
  celloDisplay.visible = value !== 'violin'; violin.visible = value !== 'cello';
  celloDisplay.position.x = value === 'compare' ? -.46 : 0; violin.position.x = value === 'compare' ? .55 : 0;
  subjects.updateMatrixWorld(true);
  document.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.subject === value)));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => { b.disabled = value !== 'cello' && detailViews.includes(b.dataset.view!); });
  document.querySelector('#study-label')!.textContent = value === 'compare' ? 'CELLO / VIOLIN' : value.toUpperCase();
  status.textContent = value === 'compare' ? '两件乐器保持真实尺寸 · 同一灯光与曝光' : value === 'cello' ? '4/4 大提琴 · 原生米制尺寸' : '现有小提琴 · 舞台基准尺寸';
  host.invalidateShadows(); frameView('three-quarter');
}
function setMaterial(value: 'finish' | 'clay'): void {
  subjects.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!originalMaterials.has(object)) originalMaterials.set(object, object.material);
    object.material = value === 'clay' ? clay : originalMaterials.get(object)!;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-material]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.material === value)));
  host.invalidateShadows();
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-subject]')) button.addEventListener('click', () => selectSubject(button.dataset.subject as Subject));
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.addEventListener('click', () => frameView(button.dataset.view as View));
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-material]')) button.addEventListener('click', () => setMaterial(button.dataset.material as 'finish' | 'clay'));
function resize(): void {
  const viewport = host.resizeIfNeeded(); camera.aspect = viewport.aspect; camera.updateProjectionMatrix();
  const narrow = viewport.width <= 700;
  camera.setViewOffset(viewport.width, viewport.height, narrow ? 0 : -145, narrow ? -viewport.height * .11 : 0, viewport.width, viewport.height);
  if (cello && violin) frameView(currentView);
}
window.addEventListener('resize', resize); resize();
function loop(): void { if (disposed) return; raf = requestAnimationFrame(loop); controls.update(); host.render(camera); }
loop();
void (async () => {
  assembly = createCelloAssembly(); cello = assembly.model; bow = assembly.bow; celloDisplay = assembly.root;
  const legacy = await buildLegacyViolinAsset(); violin = new THREE.Group(); violin.name = 'study:violin'; violin.add(legacy.model.root);
  const bounds = new THREE.Box3().setFromObject(violin), center = bounds.getCenter(new THREE.Vector3()), factor = .72 / (bounds.max.y - bounds.min.y);
  legacy.model.root.scale.setScalar(factor); legacy.model.root.position.set(-center.x * factor, -bounds.min.y * factor, -center.z * factor);
  subjects.add(celloDisplay, violin); selectSubject('cello');
  Object.defineProperty(window, 'celloStudy', { configurable: true, value: { host, camera, controls, cello, bow, violin, subjects, selectSubject, frameView, setMaterial, get subject() { return subject; }, get view() { return currentView; } } });
})().catch(error => { status.textContent = `模型载入失败：${String(error)}`; console.error(error); });
window.addEventListener('pagehide', () => {
  setMaterial('finish'); originalMaterials.clear();
  disposed = true; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); controls.dispose(); assembly?.dispose();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  violin?.traverse(o => { if (!(o instanceof THREE.Mesh)) return; geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  groundGeometry.dispose(); groundMaterial.dispose(); clay.dispose(); host.dispose();
}, { once: true });
