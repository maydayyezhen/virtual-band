import * as THREE from 'three';
import type { CameraSystem } from '../../camera/CameraSystem';
import type { DrumsInstrument } from '../../instruments/drums/DrumsInstrument';
import type { InstrumentHit, InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { PresentationMode } from '../PresentationManager';
import { AtelierDrumDemo } from './AtelierDrumDemo';

export type AtelierViewId = 'whole' | 'drummer' | 'cymbals' | 'pedals';

interface CameraPreset {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  height: number;
  width: number;
}

interface CameraState {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}

interface PointerState {
  id: number;
  x: number;
  y: number;
  mode: 'play' | 'pan' | 'orbit';
  hit: InstrumentHit | null;
}

interface GestureState {
  d: number;
  x: number;
  y: number;
}

export interface AtelierShowcaseSnapshot {
  view: AtelierViewId;
  demoPlaying: boolean;
}

type Listener = () => void;

const FOV = 34;
const PRESETS: Record<AtelierViewId, CameraPreset> = {
  whole: {
    target: new THREE.Vector3(-0.10, 1.70, -0.36),
    yaw: 0.36,
    pitch: 0.32,
    height: 5.30,
    width: 8.5,
  },
  drummer: {
    target: new THREE.Vector3(0, 1.46, -0.49),
    yaw: Math.PI - 0.13,
    pitch: 0.76,
    height: 4.80,
    width: 7.8,
  },
  cymbals: {
    target: new THREE.Vector3(-0.15, 2.71, -0.2),
    yaw: 0.12,
    pitch: 0.70,
    height: 3.8,
    width: 7.8,
  },
  pedals: {
    target: new THREE.Vector3(0.96, 0.70, -1.16),
    yaw: Math.PI - 0.40,
    pitch: 0.31,
    height: 2.50,
    width: 4.0,
  },
};

const COMPUTER_MAP: Record<string, number> = {
  KeyA: 36,
  KeyS: 38,
  KeyD: 42,
  KeyF: 46,
  KeyJ: 50,
  KeyK: 47,
  KeyL: 43,
  KeyQ: 49,
  KeyW: 57,
  KeyE: 51,
  KeyT: 55,
  Space: 44,
};

export class AtelierDrumShowcaseMode implements PresentationMode {
  readonly id = 'atelier-drums';
  readonly demo: AtelierDrumDemo;
  readonly getSnapshot = (): AtelierShowcaseSnapshot => this.snapshot;

  private readonly element: HTMLCanvasElement;
  private readonly camera: CameraSystem;
  private readonly drums: DrumsInstrument;
  private readonly interactions: InstrumentInteractionSystem;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly pointers = new Map<number, PointerState>();
  private readonly computerKeys = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private readonly current: CameraState = {
    target: PRESETS.whole.target.clone(),
    yaw: PRESETS.whole.yaw,
    pitch: PRESETS.whole.pitch,
    distance: 15,
  };
  private readonly want: CameraState = {
    target: PRESETS.whole.target.clone(),
    yaw: PRESETS.whole.yaw,
    pitch: PRESETS.whole.pitch,
    distance: 15,
  };

  private active = false;
  private keyboardBlocked = false;
  private preset: AtelierViewId = 'whole';
  private zoom = 1;
  private width = 1;
  private height = 1;
  private momentumX = 0;
  private momentumY = 0;
  private previousGesture: GestureState | null = null;
  private snapshot: AtelierShowcaseSnapshot = { view: 'whole', demoPlaying: false };
  private readonly unsubscribeDemo: () => void;
  private readonly unsubscribePanic: () => void;

  constructor(options: {
    element: HTMLCanvasElement;
    camera: CameraSystem;
    drums: DrumsInstrument;
    interactions: InstrumentInteractionSystem;
  }) {
    this.element = options.element;
    this.camera = options.camera;
    this.drums = options.drums;
    this.interactions = options.interactions;
    this.demo = new AtelierDrumDemo(this.drums);
    this.unsubscribeDemo = this.demo.subscribe(() => this.refreshSnapshot());
    this.unsubscribePanic = this.drums.subscribePanic(() => this.resetInputState());
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.camera.setLens({ fov: FOV, near: 0.035, far: 90 });
    this.attachInput();
    this.syncViewport(true);
    this.selectView('whole', true);
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.demo.stop();
    this.resetInputState();
    this.detachInput();
    this.element.classList.remove('dragging', 'playable');
    this.camera.resetLens();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.syncViewport(false);
    this.demo.update(dt);

    if (
      this.pointers.size === 0
      && !this.reducedMotion.matches
      && Math.abs(this.momentumX) + Math.abs(this.momentumY) > 0.0001
    ) {
      const damping = Math.exp(-dt * 11);
      this.momentumX *= damping;
      this.momentumY *= damping;
      this.want.yaw += this.momentumX * dt * 23;
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + this.momentumY * dt * 23, 0.04, 1.43);
    }

    const ease = this.reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 13);
    this.current.yaw += (this.want.yaw - this.current.yaw) * ease;
    this.current.pitch += (this.want.pitch - this.current.pitch) * ease;
    this.current.distance += (this.want.distance - this.current.distance) * ease;
    this.current.target.lerp(this.want.target, ease);

    this.applyCamera();
  }

  selectView(id: AtelierViewId, instant = false): boolean {
    const preset = PRESETS[id];
    if (!preset) return false;

    this.preset = id;
    this.zoom = 1;
    this.momentumX = 0;
    this.momentumY = 0;
    this.want.target.copy(preset.target);
    this.want.yaw = this.current.yaw + Math.atan2(
      Math.sin(preset.yaw - this.current.yaw),
      Math.cos(preset.yaw - this.current.yaw),
    );
    this.want.pitch = preset.pitch;
    this.want.distance = this.distanceFor(preset);

    if (instant || this.reducedMotion.matches) {
      this.current.target.copy(this.want.target);
      this.current.yaw = this.want.yaw;
      this.current.pitch = this.want.pitch;
      this.current.distance = this.want.distance;
      this.applyCamera();
    }

    this.refreshSnapshot();
    return true;
  }

  zoomIn(): void {
    this.changeZoom(0.82);
  }

  zoomOut(): void {
    this.changeZoom(1 / 0.82);
  }

  resetView(): void {
    this.selectView('whole');
  }

  toggleDemo(): void {
    this.demo.toggle();
  }

  triggerNote(note: number, velocity = 108): void {
    this.drums.noteOn(note, velocity);
    this.drums.noteOff(note);
  }

  setKeyboardBlocked(blocked: boolean): void {
    this.keyboardBlocked = blocked;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.deactivate();
    this.unsubscribeDemo();
    this.unsubscribePanic();
    this.demo.dispose();
    this.listeners.clear();
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
    window.addEventListener('pagehide', this.onPageHide);
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
    window.removeEventListener('pagehide', this.onPageHide);
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.active) return;
    const hit = event.button === 0 && !event.shiftKey
      ? this.interactions.hitTest(event.clientX, event.clientY, this.drums.id)
      : null;
    const pointer: PointerState = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: hit ? 'play' : (event.shiftKey || event.button !== 0 ? 'pan' : 'orbit'),
      hit: null,
    };

    this.pointers.set(event.pointerId, pointer);
    this.element.setPointerCapture(event.pointerId);
    this.momentumX = 0;
    this.momentumY = 0;
    this.previousGesture = null;

    if (hit) this.playHit(pointer, hit);
    else this.element.classList.add('dragging');
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.active) return;
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === 'mouse') {
        const hit = this.interactions.hitTest(event.clientX, event.clientY, this.drums.id);
        this.element.classList.toggle('playable', Boolean(hit));
      }
      return;
    }

    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (pointer.mode === 'play') {
      this.playHit(pointer, this.interactions.hitTest(event.clientX, event.clientY, this.drums.id));
      return;
    }

    const navigating = [...this.pointers.values()].filter((item) => item.mode !== 'play');
    if (navigating.length >= 2) {
      const a = navigating[0];
      const b = navigating[1];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      if (this.previousGesture && distance > 0) {
        this.changeZoom(this.previousGesture.d / distance);
        this.pan(x - this.previousGesture.x, y - this.previousGesture.y);
      }
      this.previousGesture = { d: distance, x, y };
      this.momentumX = 0;
      this.momentumY = 0;
    } else if (pointer.mode === 'pan') {
      this.pan(dx, dy);
    } else {
      this.momentumX = -dx * 0.0055;
      this.momentumY = dy * 0.0047;
      this.want.yaw += this.momentumX;
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + this.momentumY, 0.04, 1.43);
    }
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer) this.releaseHit(pointer);
    this.pointers.delete(event.pointerId);
    this.previousGesture = null;
    if (![...this.pointers.values()].some((item) => item.mode !== 'play')) {
      this.element.classList.remove('dragging');
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    const delta = THREE.MathUtils.clamp(event.deltaY, -150, 150);
    this.changeZoom(Math.exp(delta * 0.0018));
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.active || this.keyboardBlocked || event.ctrlKey || event.altKey || event.metaKey) return;
    const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (/INPUT|TEXTAREA|SELECT/.test(targetTag)) return;

    let handled = true;
    const note = COMPUTER_MAP[event.code];
    if (note !== undefined) {
      if (event.code === 'Space' && targetTag === 'BUTTON') return;
      if (!this.computerKeys.has(event.code) && !event.repeat) {
        this.computerKeys.set(event.code, note);
        this.drums.noteOn(note, 104);
      }
    } else if (event.code === 'Escape') {
      this.drums.reset();
    } else if (event.code === 'ArrowLeft') {
      this.want.yaw -= 0.10;
    } else if (event.code === 'ArrowRight') {
      this.want.yaw += 0.10;
    } else if (event.code === 'ArrowUp') {
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + 0.08, 0.04, 1.43);
    } else if (event.code === 'ArrowDown') {
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch - 0.08, 0.04, 1.43);
    } else if (event.code === 'KeyR') {
      this.selectView('whole');
    } else {
      handled = false;
    }

    if (handled) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const note = this.computerKeys.get(event.code);
    if (note === undefined) return;
    this.drums.noteOff(note);
    this.computerKeys.delete(event.code);
    if (event.code === 'Space') this.drums.setHiHat(0.8);
  };

  private readonly onBlur = (): void => {
    this.releaseInputState();
  };

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) return;
    this.demo.stop();
    this.releaseInputState();
  };

  private readonly onPageHide = (): void => {
    this.demo.stop();
    this.releaseInputState();
  };

  private playHit(pointer: PointerState, hit: InstrumentHit | null): void {
    if (
      pointer.hit?.instrumentId === hit?.instrumentId
      && pointer.hit?.partId === hit?.partId
    ) return;

    this.releaseHit(pointer);
    pointer.hit = hit;
    if (hit) this.interactions.dispatch(hit, 'start', 106);
  }

  private releaseHit(pointer: PointerState): void {
    if (!pointer.hit) return;
    this.interactions.dispatch(pointer.hit, 'end', 106);
    pointer.hit = null;
  }

  private releaseInputState(): void {
    for (const pointer of this.pointers.values()) this.releaseHit(pointer);
    for (const note of this.computerKeys.values()) this.drums.noteOff(note);
    this.computerKeys.clear();
    this.pointers.clear();
    this.previousGesture = null;
    this.element.classList.remove('dragging');
  }

  private resetInputState(): void {
    this.pointers.clear();
    this.computerKeys.clear();
    this.previousGesture = null;
    this.momentumX = 0;
    this.momentumY = 0;
    this.element.classList.remove('dragging');
  }

  private changeZoom(factor: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 0.28, 1.75);
    this.want.distance = this.distanceFor(PRESETS[this.preset]) * this.zoom;
  }

  private pan(dx: number, dy: number): void {
    if (this.height <= 0) return;
    const scale = this.current.distance * 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / this.height;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.output.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.output.quaternion);
    this.want.target.addScaledVector(right, -dx * scale);
    this.want.target.addScaledVector(up, dy * scale);
  }

  private syncViewport(force: boolean): void {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    if (!width || !height) return;
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const distance = this.distanceFor(PRESETS[this.preset]) * this.zoom;
    this.want.distance = distance;
    this.current.distance = distance;
  }

  private distanceFor(preset: CameraPreset): number {
    const reserved = this.height < 500 ? 104 : 206;
    const usableHeight = Math.max(this.height - reserved, this.height * 0.62);
    const usableWidth = this.width < 600 ? this.width - 24 : this.width - 90;
    return Math.max(
      preset.height * this.height / usableHeight,
      preset.width * this.height / Math.max(usableWidth, 200),
    ) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  }

  private applyCamera(): void {
    const cp = Math.cos(this.current.pitch);
    const position = new THREE.Vector3(
      this.current.target.x + Math.sin(this.current.yaw) * cp * this.current.distance,
      Math.max(0.13, this.current.target.y + Math.sin(this.current.pitch) * this.current.distance),
      this.current.target.z + Math.cos(this.current.yaw) * cp * this.current.distance,
    );
    this.camera.setPose({ position, target: this.current.target, fov: FOV }, true);
  }

  private refreshSnapshot(): void {
    const next: AtelierShowcaseSnapshot = {
      view: this.preset,
      demoPlaying: this.demo.playing,
    };
    if (next.view === this.snapshot.view && next.demoPlaying === this.snapshot.demoPlaying) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
