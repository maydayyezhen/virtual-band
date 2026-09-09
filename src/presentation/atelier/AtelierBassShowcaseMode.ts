import * as THREE from 'three';
import { getBassProgram } from '../../audio/BassProgram';
import { distanceForOrbitView } from '../../camera/CameraFraming';
import type { CameraRegistry, InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { CameraSystem } from '../../camera/CameraSystem';
import { ATELIER_BASS_VIEW_IDS, type AtelierBassViewName } from '../../camera/presets/AtelierBassViews';
import type { BassInstrument } from '../../instruments/bass/BassInstrument';
import type { InstrumentHit, InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { PresentationMode } from '../PresentationManager';
import { ATELIER_BASS_KEYMAP } from './AtelierBassKeymap';
import { guitarKeyboardVelocity, guitarPointerVelocity } from './AtelierGuitarVelocity';

interface CameraState { target: THREE.Vector3; yaw: number; pitch: number; distance: number }
interface PointerState { id: number; x: number; y: number; velocity: number; mode: 'play' | 'pan' | 'orbit'; hit: InstrumentHit | null }
interface HeldString { note: number; stringNumber: number }

export class AtelierBassShowcaseMode implements PresentationMode {
  readonly id = 'atelier-bass';
  private readonly element: HTMLCanvasElement;
  private readonly camera: CameraSystem;
  private readonly cameraRegistry: CameraRegistry;
  private readonly bass: BassInstrument;
  private readonly interactions: InstrumentInteractionSystem;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly pointers = new Map<number, PointerState>();
  private readonly computerKeys = new Map<string, HeldString>();
  private readonly current: CameraState = { target: new THREE.Vector3(), yaw: 0, pitch: 0, distance: 24 };
  private readonly want: CameraState = { target: new THREE.Vector3(), yaw: 0, pitch: 0, distance: 24 };
  private active = false;
  private preset: AtelierBassViewName = 'whole';
  private zoom = 1;
  private width = 1;
  private height = 1;
  private momentumX = 0;
  private momentumY = 0;

  constructor(options: { element: HTMLCanvasElement; camera: CameraSystem; cameraRegistry: CameraRegistry; bass: BassInstrument; interactions: InstrumentInteractionSystem }) {
    this.element = options.element;
    this.camera = options.camera;
    this.cameraRegistry = options.cameraRegistry;
    this.bass = options.bass;
    this.interactions = options.interactions;
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.attachInput();
    this.syncViewport(true);
    this.selectView('whole', true);
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.releaseInputState();
    this.bass.reset();
    this.detachInput();
    this.element.classList.remove('dragging', 'playable');
    this.camera.resetLens();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.syncViewport(false);
    if (this.pointers.size === 0 && !this.reducedMotion.matches) {
      const damping = Math.exp(-dt * 11);
      this.momentumX *= damping;
      this.momentumY *= damping;
      this.want.yaw += this.momentumX * dt * 23;
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + this.momentumY * dt * 23, -0.92, 1.08);
    }
    const ease = this.reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 13);
    this.current.yaw += (this.want.yaw - this.current.yaw) * ease;
    this.current.pitch += (this.want.pitch - this.current.pitch) * ease;
    this.current.distance += (this.want.distance - this.current.distance) * ease;
    this.current.target.lerp(this.want.target, ease);
    this.applyCamera();
  }

  selectView(id: AtelierBassViewName, instant = false): boolean {
    const preset = this.getPreset(id);
    if (!preset) return false;
    this.preset = id;
    this.zoom = 1;
    this.momentumX = 0;
    this.momentumY = 0;
    this.camera.setLens({ fov: preset.fov, near: preset.near, far: preset.far });
    this.want.target.set(...preset.target);
    this.want.yaw = this.current.yaw + Math.atan2(Math.sin(preset.yaw - this.current.yaw), Math.cos(preset.yaw - this.current.yaw));
    this.want.pitch = preset.pitch;
    this.want.distance = this.distanceFor(preset);
    if (instant || this.reducedMotion.matches) {
      this.current.target.copy(this.want.target);
      this.current.yaw = this.want.yaw;
      this.current.pitch = this.want.pitch;
      this.current.distance = this.want.distance;
      this.applyCamera();
    }
    return true;
  }

  resetView(): void { this.selectView('whole'); }
  dispose(): void { this.deactivate(); }

  private getPreset(id: AtelierBassViewName): InstrumentOrbitCameraView | null {
    const view = this.cameraRegistry.get(ATELIER_BASS_VIEW_IDS[id]);
    return view?.kind === 'instrument-orbit' ? view : null;
  }

  private attachInput(): void {
    this.element.addEventListener('contextmenu', this.onContextMenu);
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerEnd);
    this.element.addEventListener('pointercancel', this.onPointerEnd);
    this.element.addEventListener('lostpointercapture', this.onPointerEnd);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private detachInput(): void {
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerEnd);
    this.element.removeEventListener('pointercancel', this.onPointerEnd);
    this.element.removeEventListener('lostpointercapture', this.onPointerEnd);
    this.element.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.active) return;
    const hit = event.button === 0 && !event.shiftKey ? this.interactions.hitTest(event.clientX, event.clientY, this.bass.id) : null;
    const pointer: PointerState = { id: event.pointerId, x: event.clientX, y: event.clientY, velocity: guitarPointerVelocity(event, 108), mode: hit ? 'play' : (event.shiftKey || event.button !== 0 ? 'pan' : 'orbit'), hit: null };
    const pending = this.interactions.beginFingeringClick(event, hit, pointer.velocity);
    this.pointers.set(event.pointerId, pointer);
    this.element.setPointerCapture(event.pointerId);
    if (hit && !pending) this.playHit(pointer, hit);
    else if (!hit) this.element.classList.add('dragging');
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointer.mode === 'play') {
      if (this.interactions.hasPendingFingeringClick(event.pointerId)) return;
      const hit = this.interactions.hitTest(event.clientX, event.clientY, this.bass.id);
      if (!this.interactions.allowsDragTransition(pointer.hit, hit)) return;
      this.playHit(pointer, hit);
      return;
    }
    if (pointer.mode === 'pan') this.pan(dx, dy);
    else {
      this.momentumX = -dx * 0.0055;
      this.momentumY = dy * 0.0047;
      this.want.yaw += this.momentumX;
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + this.momentumY, -0.92, 1.08);
    }
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    const fingeringFinished = this.interactions.finishFingeringClick(event);
    if (pointer && !fingeringFinished) this.releaseHit(pointer);
    this.pointers.delete(event.pointerId);
    if (!this.pointers.size) this.element.classList.remove('dragging');
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(THREE.MathUtils.clamp(event.deltaY, -150, 150) * 0.0018), 0.28, 1.7);
    const preset = this.getPreset(this.preset);
    if (preset) this.want.distance = this.distanceFor(preset) * this.zoom;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.active || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (/INPUT|TEXTAREA|SELECT/.test(target)) return;
    const action = ATELIER_BASS_KEYMAP[event.code];
    let handled = Boolean(action);
    if (action?.kind === 'string' && !event.repeat && !this.computerKeys.has(event.code)) {
      const result = this.bass.pluckCurrentString(action.stringNumber, guitarKeyboardVelocity(event, 106));
      if (result) this.computerKeys.set(event.code, { note: result.note, stringNumber: result.string });
    } else if (action?.kind === 'clear-fingering' && !event.repeat) this.bass.clearFingering();
    else if (action?.kind === 'program-step' && !event.repeat) {
      const program = this.bass.stepProgram(action.delta);
      console.info(`[Virtual Band V2] bass program ${program} · ${getBassProgram(program)?.name ?? 'Bass'}`);
    } else if (action?.kind === 'view') this.selectView(action.view);
    else if (action?.kind === 'panic') { this.bass.reset(); this.computerKeys.clear(); }
    else if (event.code === 'ArrowLeft') { this.want.yaw -= 0.10; handled = true; }
    else if (event.code === 'ArrowRight') { this.want.yaw += 0.10; handled = true; }
    else if (event.code === 'ArrowUp') { this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + 0.08, -0.92, 1.08); handled = true; }
    else if (event.code === 'ArrowDown') { this.want.pitch = THREE.MathUtils.clamp(this.want.pitch - 0.08, -0.92, 1.08); handled = true; }
    else if (!action) handled = false;
    if (handled) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const held = this.computerKeys.get(event.code);
    if (!held) return;
    this.bass.noteOff(held.note);
    this.computerKeys.delete(event.code);
    event.preventDefault();
  };

  private readonly onBlur = (): void => this.releaseInputState();
  private readonly onVisibilityChange = (): void => { if (document.hidden) this.releaseInputState(); };

  private playHit(pointer: PointerState, hit: InstrumentHit | null): void {
    if (pointer.hit?.instrumentId === hit?.instrumentId && pointer.hit?.partId === hit?.partId) return;
    this.releaseHit(pointer);
    pointer.hit = hit;
    if (hit) this.interactions.dispatch(hit, 'start', pointer.velocity);
  }

  private releaseHit(pointer: PointerState): void {
    if (!pointer.hit) return;
    this.interactions.dispatch(pointer.hit, 'end', pointer.velocity);
    pointer.hit = null;
  }

  private releaseInputState(): void {
    this.interactions.cancelFingeringClicks();
    for (const pointer of this.pointers.values()) this.releaseHit(pointer);
    for (const held of this.computerKeys.values()) this.bass.noteOff(held.note);
    this.computerKeys.clear();
    this.pointers.clear();
    this.element.classList.remove('dragging');
  }

  private pan(dx: number, dy: number): void {
    if (this.height <= 0) return;
    const preset = this.getPreset(this.preset);
    if (!preset) return;
    this.bass.root.updateWorldMatrix(true, true);
    const worldTarget = this.bass.root.localToWorld(this.current.target.clone());
    const scale = this.camera.output.position.distanceTo(worldTarget) * 2 * Math.tan(THREE.MathUtils.degToRad(preset.fov / 2)) / this.height;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.output.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.output.quaternion);
    const moved = worldTarget.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    this.want.target.copy(this.bass.root.worldToLocal(moved));
  }

  private syncViewport(force: boolean): void {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    if (!width || !height || (!force && width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    const preset = this.getPreset(this.preset);
    if (!preset) return;
    const distance = this.distanceFor(preset) * this.zoom;
    this.want.distance = distance;
    this.current.distance = distance;
  }

  private distanceFor(preset: InstrumentOrbitCameraView): number {
    return distanceForOrbitView(preset, this.width, this.height);
  }

  private applyCamera(): void {
    const preset = this.getPreset(this.preset);
    if (!preset) return;
    this.bass.root.updateWorldMatrix(true, true);
    const cp = Math.cos(this.current.pitch);
    const localPosition = new THREE.Vector3(
      this.current.target.x + Math.sin(this.current.yaw) * cp * this.current.distance,
      Math.max(-3.65, this.current.target.y + Math.sin(this.current.pitch) * this.current.distance),
      this.current.target.z + Math.cos(this.current.yaw) * cp * this.current.distance,
    );
    this.camera.setPose({ position: this.bass.root.localToWorld(localPosition), target: this.bass.root.localToWorld(this.current.target.clone()), fov: preset.fov }, true);
  }
}
