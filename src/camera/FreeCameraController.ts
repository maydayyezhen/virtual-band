import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { CameraSystem, CameraPoseInput } from './CameraSystem';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const LOOK_LIMIT = Math.PI * 0.48;
const LOOK_SPEED = 0.0035;
type DragPointer = { x: number; y: number; button: number };
const editable = (target: EventTarget | null): boolean => target instanceof HTMLElement &&
  (target.isContentEditable || !!target.closest('input, textarea, select, button'));

/** Free venue camera: horizontal travel, independent elevation and lens zoom. No musical input. */
export class FreeCameraController {
  private readonly controls: PointerLockControls;
  private readonly abort = new AbortController();
  private readonly keys = new Set<string>();
  private readonly bounds: THREE.Box3;
  private readonly pointers = new Map<number, DragPointer>();
  private readonly homeHeight: number;
  private home: CameraPoseInput;
  private saved: CameraPoseInput | null = null;
  private enabled = false;
  onUnlock?: () => void;

  constructor(private readonly camera: CameraSystem, private readonly element: HTMLCanvasElement, bounds: THREE.Box3, floorY: number) {
    this.bounds = bounds.clone();
    this.bounds.min.y = Math.max(this.bounds.min.y, floorY + 0.5);
    this.homeHeight = floorY + 1.65;
    this.home = { position: new THREE.Vector3(0, this.homeHeight, 9.5), target: new THREE.Vector3(0, this.homeHeight, 0), fov: 62 };
    this.controls = new PointerLockControls(camera.output, element);
    this.controls.enabled = false;
    this.controls.minPolarAngle = Math.PI / 2 - LOOK_LIMIT;
    this.controls.maxPolarAngle = Math.PI / 2 + LOOK_LIMIT;
    this.controls.pointerSpeed = LOOK_SPEED / 0.002;
    const options = { signal: this.abort.signal };
    document.addEventListener('keydown', event => {
      if (!this.enabled || editable(event.target) || event.ctrlKey || event.metaKey || event.altKey || !MOVE_KEYS.has(event.code)) return;
      event.preventDefault();
      this.setMoveKey(event.code, true);
    }, options);
    document.addEventListener('keyup', event => { this.keys.delete(event.code); }, options);
    window.addEventListener('blur', () => this.clearInput(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); }, options);
    document.addEventListener('pointerlockchange', () => {
      if (!this.controls.isLocked) { this.clearInput(); if (this.enabled) this.onUnlock?.(); }
    }, options);
    element.addEventListener('pointerdown', event => {
      if (!this.enabled || this.controls.isLocked || ![0, 2].includes(event.button)) return;
      this.takeControl();
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
      element.setPointerCapture(event.pointerId);
      element.focus({ preventScroll: true });
    }, options);
    element.addEventListener('pointermove', event => {
      const pointer = this.pointers.get(event.pointerId);
      if (!this.enabled || !pointer || this.controls.isLocked) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)![1];
        this.zoom((Math.hypot(pointer.x - other.x, pointer.y - other.y) -
          Math.hypot(event.clientX - other.x, event.clientY - other.y)) * 0.09);
      } else if (pointer.button === 2 || event.shiftKey) {
        camera.output.updateMatrix();
        camera.output.position.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.output.matrix, 0), -dx * 0.024);
        camera.output.position.y += dy * 0.024;
      } else {
        // Grab-and-drag follows the reference; locked mouse-look retains FPS direction.
        const euler = new THREE.Euler().setFromQuaternion(camera.output.quaternion, 'YXZ');
        euler.y += dx * LOOK_SPEED;
        euler.x = THREE.MathUtils.clamp(euler.x + dy * LOOK_SPEED, -LOOK_LIMIT, LOOK_LIMIT);
        camera.output.quaternion.setFromEuler(euler);
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      this.commitPose();
    }, options);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) element.addEventListener(event, event => {
      this.pointers.delete(event.pointerId);
    }, options);
    element.addEventListener('wheel', event => {
      if (!this.enabled) return;
      event.preventDefault();
      this.takeControl();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      this.zoom(pixels * 0.035);
      this.commitPose();
    }, { ...options, passive: false });
  }

  setScene(bandBox: THREE.Box3): void {
    const center = bandBox.getCenter(new THREE.Vector3());
    this.home = { position: new THREE.Vector3(center.x, this.homeHeight, Math.min(this.bounds.max.z - 0.4, bandBox.max.z + 2.8)),
      target: new THREE.Vector3(center.x, Math.max(this.homeHeight, center.y), center.z), fov: 62 };
    this.saved = null;
  }
  enter(instant = false): void {
    this.clearInput();
    this.enabled = true;
    this.controls.enabled = false;
    this.camera.setPose(this.saved ?? this.home, instant);
  }
  exit(): void {
    if (this.enabled) this.saved = this.snapshot();
    this.enabled = false;
    this.controls.enabled = false;
    if (this.controls.isLocked) this.controls.unlock();
    this.clearInput();
  }
  lockPointer(): void { if (this.enabled) { this.takeControl(); this.controls.lock(); } }
  setMoveKey(key: string, down: boolean): void {
    if (down && this.enabled && MOVE_KEYS.has(key)) { this.takeControl(); this.keys.add(key); }
    else this.keys.delete(key);
  }
  resetPosition(): void { this.saved = null; if (this.enabled) this.enter(); }
  private takeControl(): void { this.camera.cancelTransition(); this.controls.enabled = true; }
  private clearInput(): void {
    for (const id of this.pointers.keys()) if (this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id);
    this.pointers.clear();
    this.keys.clear();
  }
  update(dt: number): void {
    if (!this.enabled || this.camera.isTransitioning) return;
    this.controls.enabled = true;
    const delta = Math.min(0.05, Math.max(0, dt));
    const pressed = (...keys: string[]) => keys.some(key => this.keys.has(key)) ? 1 : 0;
    const input = new THREE.Vector3(pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft'),
      pressed('KeyE') - pressed('KeyQ'),
      pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown'));
    if (input.lengthSq() > 1) input.normalize();
    input.multiplyScalar((pressed('ShiftLeft', 'ShiftRight') ? 15 : 6) * delta);
    const camera = this.camera.output;
    camera.updateMatrix();
    this.controls.moveRight(input.x);
    this.controls.moveForward(input.z);
    camera.position.y += input.y;
    this.commitPose();
  }
  private zoom(amount: number): void {
    this.camera.output.fov = THREE.MathUtils.clamp(this.camera.output.fov + amount, 28, 100);
  }
  private commitPose(): void {
    this.bounds.clampPoint(this.camera.output.position, this.camera.output.position);
    this.camera.setPose(this.snapshot(), true);
  }
  private snapshot(): CameraPoseInput {
    const position = this.camera.output.position.clone();
    return { position, target: this.controls.getDirection(new THREE.Vector3()).multiplyScalar(20).add(position), fov: this.camera.output.fov };
  }
  dispose(): void { this.exit(); this.abort.abort(); this.controls.dispose(); }
}
