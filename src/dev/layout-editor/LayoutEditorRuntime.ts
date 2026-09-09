import * as THREE from 'three';
import { RendererHost } from '../../engine/RendererHost';
import { buildLegacyAcousticAsset } from '../../instruments/acoustic/legacyAcousticAsset';
import { buildLegacyBassAsset } from '../../instruments/bass/legacyBassAsset';
import { buildLegacyDrumAsset } from '../../instruments/drums/legacyDrumAsset';
import { buildLegacyElectricAsset } from '../../instruments/electric/legacyElectricAsset';
import { buildLegacyKeyboardAsset } from '../../instruments/keyboard/legacyKeyboardAsset';
import { buildLegacyViolinAsset } from '../../instruments/violin/legacyViolinAsset';
import { AtelierStudioVenue } from '../../venues/atelier-studio/AtelierStudioVenue';
import {
  cloneLayout,
  createDefaultLayout,
  getInstrumentDefinition,
  LAYOUT_INSTRUMENTS,
  type LayoutDocument,
  type LayoutInstrumentInstance,
  type LayoutInstrumentType,
} from './LayoutDocument';
import { autoArrangeLayout, type InstrumentFootprints } from './AutoLayout';

export interface LayoutEditorSnapshot {
  ready: boolean;
  loadingLabel: string;
  error: string | null;
  document: LayoutDocument;
  selectedId: string;
  snapToGrid: boolean;
  selectedLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

type Listener = (snapshot: LayoutEditorSnapshot) => void;
type CameraPreset = 'stage' | 'top';

interface PointerGesture {
  id: number;
  mode: 'move' | 'rotate' | 'orbit';
  x: number;
  y: number;
  changed: boolean;
  offsetX: number;
  offsetZ: number;
}

const GRID_STEP = 0.25;
const ROTATION_STEP = THREE.MathUtils.degToRad(15);
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

export class LayoutEditorRuntime {
  private readonly renderer: RendererHost;
  private readonly venue = new AtelierStudioVenue();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.05, 160);
  private readonly instrumentLayer = new THREE.Group();
  private readonly prototypes = new Map<LayoutInstrumentType, THREE.Group>();
  private readonly footprints = {} as InstrumentFootprints;
  private readonly roots = new Map<string, THREE.Group>();
  private readonly rootIds = new Map<THREE.Object3D, string>();
  private readonly listeners = new Set<Listener>();
  private readonly lockedIds = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly groundPoint = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3(0, 2.1, -0.35);
  private readonly grid = new THREE.GridHelper(24, 48, 0x6fc5c2, 0x36545a);

  private document = createDefaultLayout();
  private selectedId = 'drums-1';
  private snapToGrid = true;
  private ready = false;
  private loadingLabel = '准备模型…';
  private error: string | null = null;
  private history: LayoutDocument[] = [cloneLayout(this.document)];
  private historyCursor = 0;
  private gesture: PointerGesture | null = null;
  private selectionBox: THREE.BoxHelper | null = null;
  private yaw = 0;
  private pitch = 0.34;
  private distance = 22;
  private raf = 0;
  private disposed = false;

  constructor(mount: HTMLElement) {
    this.renderer = new RendererHost(mount);
    this.instrumentLayer.name = 'layout-editor:instruments';
    this.grid.position.y = 0.003;
    const gridMaterials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.42;
      material.depthWrite = false;
    }
    this.renderer.scene.add(this.venue.root, this.grid, this.instrumentLayer);
    this.renderer.applySceneProfile(this.venue.sceneProfile);
    this.attachInput();
    this.setCameraPreset('stage');
    this.frame();
  }

  async start(): Promise<void> {
    try {
      this.loadingLabel = '载入六件乐器…';
      this.emit();
      const [drums, keyboard, violin, electric, acoustic, bass] = await Promise.all([
        buildLegacyDrumAsset(),
        buildLegacyKeyboardAsset(),
        buildLegacyViolinAsset(),
        buildLegacyElectricAsset(),
        buildLegacyAcousticAsset(),
        buildLegacyBassAsset(),
      ]);
      if (this.disposed) return;

      this.registerPrototype('drums', drums.model.root);
      this.registerPrototype('keyboard', keyboard.root);
      this.registerPrototype('violin', violin.model.root);
      this.registerPrototype('electric', electric.model.root);
      this.registerPrototype('acoustic', acoustic.model.root);
      this.registerPrototype('bass', bass.model.root);
      this.document = autoArrangeLayout(this.document, this.footprints);
      this.history = [cloneLayout(this.document)];
      this.historyCursor = 0;
      this.applyDocument();
      this.select(this.selectedId);
      this.ready = true;
      this.loadingLabel = '';
      this.setCameraPreset('stage');
      this.renderer.invalidateShadows();
      this.emit();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.loadingLabel = '';
      this.emit();
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  get snapshot(): LayoutEditorSnapshot {
    return {
      ready: this.ready,
      loadingLabel: this.loadingLabel,
      error: this.error,
      document: cloneLayout(this.document),
      selectedId: this.selectedId,
      snapToGrid: this.snapToGrid,
      selectedLocked: this.lockedIds.has(this.selectedId),
      canUndo: this.historyCursor > 0,
      canRedo: this.historyCursor < this.history.length - 1,
    };
  }

  select(id: string): void {
    if (!this.document.instances.some((instance) => instance.id === id)) return;
    this.selectedId = id;
    this.selectionBox?.removeFromParent();
    this.selectionBox?.geometry.dispose();
    this.selectionBox?.material.dispose();
    const root = this.roots.get(id);
    this.selectionBox = root ? new THREE.BoxHelper(root, 0x7ce8df) : null;
    if (this.selectionBox) {
      this.selectionBox.name = `layout-editor:selection:${id}`;
      this.renderer.scene.add(this.selectionBox);
    }
    this.emit();
  }

  setName(name: string): void {
    const next = name.slice(0, 80);
    if (next === this.document.name) return;
    this.document.name = next;
    this.commitHistory();
  }

  setSnapToGrid(enabled: boolean): void {
    this.snapToGrid = enabled;
    this.emit();
  }

  setSelectedLocked(locked: boolean): void {
    if (locked) this.lockedIds.add(this.selectedId);
    else this.lockedIds.delete(this.selectedId);
    this.emit();
  }

  setSelectedPosition(axis: 'x' | 'z', value: number): void {
    if (!Number.isFinite(value) || this.lockedIds.has(this.selectedId)) return;
    const index = axis === 'x' ? 0 : 2;
    this.getSelectedInstance().transform.position[index] = clampWorld(value);
    this.applySelectedTransform();
    this.commitHistory();
  }

  setSelectedRotationDegrees(value: number): void {
    if (!Number.isFinite(value) || this.lockedIds.has(this.selectedId)) return;
    this.getSelectedInstance().transform.rotation[1] = normalizeRadians(THREE.MathUtils.degToRad(value));
    this.applySelectedTransform();
    this.commitHistory();
  }

  setSelectedScale(value: number): void {
    if (!Number.isFinite(value) || this.lockedIds.has(this.selectedId)) return;
    const transform = this.getSelectedInstance().transform;
    const nextScale = THREE.MathUtils.clamp(value, MIN_SCALE, MAX_SCALE);
    if (Math.abs(nextScale - transform.scale) < 1e-6) return;

    const root = this.roots.get(this.selectedId);
    const currentBaseY = root ? new THREE.Box3().setFromObject(root).min.y : Number.NaN;
    transform.scale = nextScale;
    this.applyTransform(this.selectedId);

    if (root && Number.isFinite(currentBaseY)) {
      const nextBaseY = new THREE.Box3().setFromObject(root).min.y;
      if (Number.isFinite(nextBaseY)) transform.position[1] += currentBaseY - nextBaseY;
    }

    this.applySelectedTransform();
    this.commitHistory();
  }

  rotateSelected(direction: -1 | 1): void {
    if (this.lockedIds.has(this.selectedId)) return;
    const transform = this.getSelectedInstance().transform;
    transform.rotation[1] = normalizeRadians(transform.rotation[1] + ROTATION_STEP * direction);
    this.applySelectedTransform();
    this.commitHistory();
  }

  undo(): void {
    if (this.historyCursor <= 0) return;
    this.historyCursor -= 1;
    this.document = cloneLayout(this.history[this.historyCursor]);
    this.ensureSelectedId();
    this.applyDocument();
    this.select(this.selectedId);
    this.emit();
  }

  redo(): void {
    if (this.historyCursor >= this.history.length - 1) return;
    this.historyCursor += 1;
    this.document = cloneLayout(this.history[this.historyCursor]);
    this.ensureSelectedId();
    this.applyDocument();
    this.select(this.selectedId);
    this.emit();
  }

  reset(): void {
    this.document = createDefaultLayout();
    this.document = autoArrangeLayout(this.document, this.footprints);
    this.selectedId = this.document.instances[0].id;
    this.lockedIds.clear();
    this.applyDocument();
    this.select(this.selectedId);
    this.commitHistory();
  }

  load(document: LayoutDocument): void {
    this.document = cloneLayout(document);
    if (!this.document.instances.some((instance) => instance.id === this.selectedId)) {
      this.selectedId = this.document.instances[0].id;
    }
    this.lockedIds.clear();
    this.applyDocument();
    this.select(this.selectedId);
    this.commitHistory();
  }

  duplicateSelected(): void {
    if (this.document.instances.length >= 64) return;
    const source = this.getSelectedInstance();
    const id = this.nextInstanceId(source.type);
    this.document.instances.push({
      id,
      type: source.type,
      transform: {
        position: [source.transform.position[0] + 0.5, source.transform.position[1], source.transform.position[2] + 0.5],
        rotation: [...source.transform.rotation],
        scale: source.transform.scale,
      },
    });
    this.applyDocument();
    this.select(id);
    this.commitHistory();
  }

  removeSelected(): void {
    if (this.document.instances.length <= 1) return;
    const index = this.document.instances.findIndex((instance) => instance.id === this.selectedId);
    if (index < 0) return;
    this.document.instances.splice(index, 1);
    this.lockedIds.delete(this.selectedId);
    this.selectedId = this.document.instances[Math.min(index, this.document.instances.length - 1)].id;
    this.applyDocument();
    this.select(this.selectedId);
    this.commitHistory();
  }

  autoArrange(): void {
    this.document = autoArrangeLayout(this.document, this.footprints);
    this.applyDocument();
    this.setCameraPreset('stage');
    this.commitHistory();
  }

  setCameraPreset(preset: CameraPreset): void {
    if (preset === 'top') {
      this.yaw = 0;
      this.pitch = 0.82;
      this.camera.fov = 38;
    } else {
      this.yaw = 0;
      this.pitch = 0.34;
      this.camera.fov = 38;
    }
    if (!this.fitCameraToInstruments()) {
      this.cameraTarget.set(0, preset === 'top' ? 0 : 2.1, -0.35);
      this.distance = preset === 'top' ? 21 : 22;
    }
    this.applyCamera();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.detachInput();
    this.selectionBox?.geometry.dispose();
    this.selectionBox?.material.dispose();
    this.selectionBox?.removeFromParent();
    this.selectionBox = null;
    for (const root of this.roots.values()) root.removeFromParent();
    this.roots.clear();
    this.rootIds.clear();
    for (const prototype of this.prototypes.values()) disposeObject(prototype);
    this.prototypes.clear();
    const gridMaterials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
    this.grid.geometry.dispose();
    for (const material of gridMaterials) material.dispose();
    this.grid.removeFromParent();
    this.venue.dispose();
    this.venue.root.removeFromParent();
    this.listeners.clear();
    this.renderer.dispose();
  }

  private registerPrototype(type: LayoutInstrumentType, modelRoot: THREE.Group): void {
    const definition = getInstrumentDefinition(type);

    const normalizedModel = new THREE.Group();
    normalizedModel.name = `layout-editor:prototype:${type}`;
    normalizedModel.add(modelRoot);
    normalizedModel.updateMatrixWorld(true);
    const rawBounds = new THREE.Box3().setFromObject(normalizedModel);
    const rawHeight = rawBounds.max.y - rawBounds.min.y;
    if (!Number.isFinite(rawHeight) || rawHeight <= 0) throw new Error(`无法测量乐器高度：${type}`);
    const normalizationScale = definition.targetHeight / rawHeight;
    normalizedModel.scale.setScalar(normalizationScale);
    normalizedModel.position.y = -rawBounds.min.y * normalizationScale;

    normalizedModel.updateMatrixWorld(true);
    const normalizedBounds = new THREE.Box3().setFromObject(normalizedModel);
    const normalizedSize = normalizedBounds.getSize(new THREE.Vector3());
    this.footprints[type] = {
      width: normalizedSize.x,
      depth: normalizedSize.z,
    };
    normalizedModel.traverse((object) => {
      object.userData = {};
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    this.prototypes.set(type, normalizedModel);
  }

  private applyDocument(): void {
    this.syncInstanceRoots();
    for (const instance of this.document.instances) this.applyTransform(instance.id);
    this.selectionBox?.update();
    this.renderer.invalidateShadows();
  }

  private applySelectedTransform(): void {
    this.applyTransform(this.selectedId);
    this.selectionBox?.update();
    this.renderer.invalidateShadows();
    this.emit();
  }

  private applyTransform(id: string): void {
    const root = this.roots.get(id);
    if (!root) return;
    const transform = this.getInstance(id).transform;
    root.position.set(...transform.position);
    root.rotation.set(...transform.rotation);
    root.scale.setScalar(transform.scale);
    root.updateMatrixWorld(true);
  }

  private syncInstanceRoots(): void {
    const expectedTypes = new Map(this.document.instances.map((instance) => [instance.id, instance.type]));
    for (const [id, root] of this.roots) {
      if (expectedTypes.get(id) === root.userData.layoutInstrumentType) continue;
      root.removeFromParent();
      this.roots.delete(id);
      this.rootIds.delete(root);
    }

    for (const instance of this.document.instances) {
      if (this.roots.has(instance.id)) continue;
      const prototype = this.prototypes.get(instance.type);
      if (!prototype) throw new Error(`缺少乐器模型：${instance.type}`);
      const root = new THREE.Group();
      root.name = `layout-editor:${instance.id}`;
      root.userData.layoutInstrumentId = instance.id;
      root.userData.layoutInstrumentType = instance.type;
      root.add(prototype.clone(true));
      this.roots.set(instance.id, root);
      this.rootIds.set(root, instance.id);
      this.instrumentLayer.add(root);
    }
  }

  private getInstance(id: string): LayoutInstrumentInstance {
    const instance = this.document.instances.find((candidate) => candidate.id === id);
    if (!instance) throw new Error(`找不到乐器实例：${id}`);
    return instance;
  }

  private getSelectedInstance(): LayoutInstrumentInstance {
    return this.getInstance(this.selectedId);
  }

  private ensureSelectedId(): void {
    if (!this.document.instances.some((instance) => instance.id === this.selectedId)) {
      this.selectedId = this.document.instances[0].id;
    }
  }

  private nextInstanceId(type: LayoutInstrumentType): string {
    const existing = new Set(this.document.instances.map((instance) => instance.id));
    let index = 1;
    while (existing.has(`${type}-${index}`)) index += 1;
    return `${type}-${index}`;
  }

  private commitHistory(): void {
    const next = cloneLayout(this.document);
    const current = this.history[this.historyCursor];
    if (current && JSON.stringify(current) === JSON.stringify(next)) {
      this.emit();
      return;
    }
    this.history = this.history.slice(0, this.historyCursor + 1);
    this.history.push(next);
    if (this.history.length > 80) this.history.shift();
    this.historyCursor = this.history.length - 1;
    this.emit();
  }

  private attachInput(): void {
    const element = this.renderer.renderer.domElement;
    element.addEventListener('contextmenu', this.onContextMenu);
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerEnd);
    element.addEventListener('pointercancel', this.onPointerEnd);
    element.addEventListener('lostpointercapture', this.onPointerEnd);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
  }

  private detachInput(): void {
    const element = this.renderer.renderer.domElement;
    element.removeEventListener('contextmenu', this.onContextMenu);
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointermove', this.onPointerMove);
    element.removeEventListener('pointerup', this.onPointerEnd);
    element.removeEventListener('pointercancel', this.onPointerEnd);
    element.removeEventListener('lostpointercapture', this.onPointerEnd);
    element.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.ready || event.button !== 0) return;
    const hitId = this.hitTestInstrument(event.clientX, event.clientY);
    const canEdit = hitId && !this.lockedIds.has(hitId);
    const canRotate = canEdit && event.shiftKey;
    const canMove = canEdit && !event.shiftKey;
    if (hitId) this.select(hitId);

    let offsetX = 0;
    let offsetZ = 0;
    if (canMove && this.intersectGround(event.clientX, event.clientY)) {
      const transform = this.getInstance(hitId).transform;
      offsetX = transform.position[0] - this.groundPoint.x;
      offsetZ = transform.position[2] - this.groundPoint.z;
    }

    this.gesture = {
      id: event.pointerId,
      mode: canRotate ? 'rotate' : canMove ? 'move' : 'orbit',
      x: event.clientX,
      y: event.clientY,
      changed: false,
      offsetX,
      offsetZ,
    };
    this.renderer.renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture.x = event.clientX;
    gesture.y = event.clientY;

    if (gesture.mode === 'move') {
      if (!this.intersectGround(event.clientX, event.clientY)) return;
      const transform = this.getSelectedInstance().transform;
      const x = clampWorld(this.groundPoint.x + gesture.offsetX);
      const z = clampWorld(this.groundPoint.z + gesture.offsetZ);
      transform.position[0] = this.snapToGrid ? snap(x) : x;
      transform.position[2] = this.snapToGrid ? snap(z) : z;
      gesture.changed ||= Math.abs(dx) + Math.abs(dy) > 0;
      this.applySelectedTransform();
      return;
    }

    if (gesture.mode === 'rotate') {
      const transform = this.getSelectedInstance().transform;
      transform.rotation[1] = normalizeRadians(transform.rotation[1] + dx * 0.012);
      gesture.changed ||= Math.abs(dx) > 0;
      this.applySelectedTransform();
      return;
    }

    this.yaw -= dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, 0.08, 1.42);
    this.applyCamera();
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (!this.gesture || this.gesture.id !== event.pointerId) return;
    const changed = this.gesture.changed;
    this.gesture = null;
    if (changed) this.commitHistory();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.distance = THREE.MathUtils.clamp(
      this.distance * Math.exp(THREE.MathUtils.clamp(event.deltaY, -160, 160) * 0.0018),
      6,
      34,
    );
    this.applyCamera();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      if (event.shiftKey) this.redo();
      else this.undo();
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') {
      this.redo();
      event.preventDefault();
      return;
    }
    if (event.code === 'BracketLeft') {
      this.rotateSelected(-1);
      event.preventDefault();
    } else if (event.code === 'BracketRight') {
      this.rotateSelected(1);
      event.preventDefault();
    }
  };

  private hitTestInstrument(clientX: number, clientY: number): string | null {
    this.updatePointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const intersections = this.raycaster.intersectObjects([...this.roots.values()], true);
    for (const intersection of intersections) {
      let node: THREE.Object3D | null = intersection.object;
      while (node) {
        const id = this.rootIds.get(node);
        if (id) return id;
        node = node.parent;
      }
    }
    return null;
  }

  private intersectGround(clientX: number, clientY: number): boolean {
    this.updatePointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return Boolean(this.raycaster.ray.intersectPlane(this.groundPlane, this.groundPoint));
  }

  private updatePointer(clientX: number, clientY: number): void {
    const rect = this.renderer.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
  }

  private applyCamera(): void {
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.cameraTarget.x + Math.sin(this.yaw) * cp * this.distance,
      this.cameraTarget.y + Math.sin(this.pitch) * this.distance,
      this.cameraTarget.z + Math.cos(this.yaw) * cp * this.distance,
    );
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  private fitCameraToInstruments(): boolean {
    if (this.roots.size === 0) return false;
    const bounds = new THREE.Box3().setFromObject(this.instrumentLayer);
    if (bounds.isEmpty()) return false;

    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(this.camera.aspect, 0.1));
    const limitingFov = Math.min(verticalFov, horizontalFov);
    this.cameraTarget.copy(sphere.center);
    this.distance = THREE.MathUtils.clamp((sphere.radius / Math.sin(limitingFov / 2)) * 1.12, 8, 42);
    return true;
  }

  private readonly frame = (): void => {
    if (this.disposed) return;
    const viewport = this.renderer.resizeIfNeeded();
    if (Math.abs(this.camera.aspect - viewport.aspect) > 1e-4) {
      this.camera.aspect = viewport.aspect;
      this.camera.updateProjectionMatrix();
    }
    this.selectionBox?.update();
    this.renderer.render(this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

function snap(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP;
}

function clampWorld(value: number): number {
  return THREE.MathUtils.clamp(value, -12, 12);
}

function normalizeRadians(value: number): number {
  return THREE.MathUtils.euclideanModulo(value + Math.PI, Math.PI * 2) - Math.PI;
}

function disposeObject(root: THREE.Object3D): void {
  root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
