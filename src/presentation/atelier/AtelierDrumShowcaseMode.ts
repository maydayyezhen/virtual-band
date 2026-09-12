import * as THREE from 'three';
import { getDrumKit } from '../../audio/DrumProgram';
import { OrbitController } from '../../camera/OrbitController';
import type { CameraRegistry, InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { CameraSystem } from '../../camera/CameraSystem';
import {
  type AtelierDrumViewName,
} from '../../camera/presets/AtelierDrumViews';
import type { DrumsInstrument } from '../../instruments/drums/DrumsInstrument';
import type { InstrumentHit, InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { PresentationMode } from '../PresentationManager';
import { AtelierDrumDemo } from './AtelierDrumDemo';
import { ATELIER_DRUM_KEYMAP, type AtelierDrumKeyAction } from './AtelierDrumKeymap';

export type AtelierViewId = AtelierDrumViewName;

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

export class AtelierDrumShowcaseMode implements PresentationMode {
  get id(): string { return `${this.drums.id}:showcase`; }
  readonly demo: AtelierDrumDemo;

  private readonly element: HTMLCanvasElement;
  private readonly cameraRegistry: CameraRegistry;
  private readonly drums: DrumsInstrument;
  private readonly interactions: InstrumentInteractionSystem;
  private readonly orbit: OrbitController;
  private readonly pointers = new Map<number, PointerState>();
  private readonly computerKeys = new Map<string, AtelierDrumKeyAction>();

  private active = false;
  private preset: AtelierViewId = 'whole';
  private previousGesture: GestureState | null = null;
  private readonly unsubscribePanic: () => void;

  constructor(options: {
    element: HTMLCanvasElement;
    camera: CameraSystem;
    cameraRegistry: CameraRegistry;
    drums: DrumsInstrument;
    interactions: InstrumentInteractionSystem;
  }) {
    this.element = options.element;
    this.cameraRegistry = options.cameraRegistry;
    this.drums = options.drums;
    this.interactions = options.interactions;
    this.orbit = new OrbitController({ camera: options.camera, element: options.element,
      subject: options.drums.root, pitchRange: [0.04, 1.43], floorY: 0.13 });
    this.demo = new AtelierDrumDemo(this.drums);
    this.unsubscribePanic = this.drums.subscribePanic(() => this.resetInputState());
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.attachInput();
    this.selectView('whole', true);
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.demo.stop();
    this.releaseInputState();
    this.detachInput();
    this.element.classList.remove('dragging', 'playable');
  }

  update(dt: number): void {
    if (!this.active) return;
    this.demo.update(dt);
    this.orbit.update(dt);
  }

  selectView(id: AtelierViewId, instant = false): boolean {
    const preset = this.getPreset(id);
    if (!preset) return false;
    this.preset = id;
    this.orbit.setView(preset, instant);
    return true;
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

  dispose(): void {
    this.deactivate();
    this.unsubscribePanic();
    this.demo.dispose();
  }

  private getPreset(id: AtelierViewId): InstrumentOrbitCameraView | null {
    const view = this.cameraRegistry.get(`${this.drums.id}:${id}`);
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
      } else if (pointer.mode === 'pan') {
      this.pan(dx, dy);
    } else {
      this.orbit.orbitBy(dx, dy);
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
    if (!this.active || event.ctrlKey || event.altKey || event.metaKey) return;
    const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (/INPUT|TEXTAREA|SELECT/.test(targetTag)) return;

    let handled = true;
    const binding = ATELIER_DRUM_KEYMAP[event.code];
    if (binding) {
      this.pressKeyboardBinding(event.code, binding, event.repeat);
    } else if (event.code === 'ArrowLeft') {
      this.orbit.rotateBy(-0.10, 0);
    } else if (event.code === 'ArrowRight') {
      this.orbit.rotateBy(0.10, 0);
    } else if (event.code === 'ArrowUp') {
      this.orbit.rotateBy(0, 0.08);
    } else if (event.code === 'ArrowDown') {
      this.orbit.rotateBy(0, -0.08);
    } else {
      handled = false;
    }

    if (handled) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const binding = this.computerKeys.get(event.code);
    if (!binding) return;
    this.releaseKeyboardBinding(binding);
    this.computerKeys.delete(event.code);
    event.preventDefault();
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

  private pressKeyboardBinding(code: string, binding: AtelierDrumKeyAction, repeat: boolean): void {
    if (binding.kind === 'view') {
      if (!repeat) this.selectView(binding.view);
      return;
    }

    if (binding.kind === 'panic') {
      if (!repeat) this.drums.reset();
      return;
    }

    // Kit swap is an edge-triggered action, so it never joins the held-key set below.
    if (binding.kind === 'program-step') {
      if (repeat) return;
      const kit = this.drums.stepProgram(binding.delta);
      console.info(`[Virtual Band V2] drum kit ${kit} · ${getDrumKit(kit)?.name ?? 'Kit'}`);
      return;
    }

    if (repeat || this.computerKeys.has(code)) return;
    this.computerKeys.set(code, binding);

    if (binding.kind === 'note') {
      this.drums.noteOn(binding.note, 104);
    } else if (binding.kind === 'hihat-strike') {
      this.drums.interact?.({ partId: 'hihat', velocity: 104, phase: 'start' });
    } else if (binding.kind === 'hihat-pedal') {
      this.drums.noteOn(44, 104);
    }
  }

  private releaseKeyboardBinding(binding: AtelierDrumKeyAction): void {
    if (binding.kind === 'note') {
      this.drums.noteOff(binding.note);
    } else if (binding.kind === 'hihat-strike') {
      this.drums.interact?.({ partId: 'hihat', velocity: 104, phase: 'end' });
    } else if (binding.kind === 'hihat-pedal') {
      this.drums.noteOff(44);
      this.drums.setHiHat(binding.releaseOpenness);
    }
  }

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
    for (const binding of this.computerKeys.values()) this.releaseKeyboardBinding(binding);
    this.computerKeys.clear();
    this.pointers.clear();
    this.previousGesture = null;
    this.element.classList.remove('dragging');
  }

  private resetInputState(): void {
    this.pointers.clear();
    this.computerKeys.clear();
    this.previousGesture = null;
    this.element.classList.remove('dragging');
  }

  private changeZoom(factor: number): void { this.orbit.zoomBy(factor); }

  private pan(dx: number, dy: number): void { this.orbit.panBy(dx, dy); }

}
