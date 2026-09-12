import * as THREE from 'three';
import { OrbitController } from '../../camera/OrbitController';
import type { CameraRegistry, InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { CameraSystem } from '../../camera/CameraSystem';
import {
  type AtelierKeyboardViewName,
} from '../../camera/presets/AtelierKeyboardViews';
import type { InstrumentHit, InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { KeyboardInstrument } from '../../instruments/keyboard/KeyboardInstrument';
import type { KeyboardTier } from '../../instruments/keyboard/legacyKeyboardAsset';
import type { PresentationMode } from '../PresentationManager';
import { ATELIER_KEYBOARD_KEYMAP } from './AtelierKeyboardKeymap';
import { AtelierKeyboardPanel, installKeyboardPanelStyles } from './AtelierKeyboardPanel';

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

interface HeldComputerNote {
  note: number;
  tier: KeyboardTier;
}

export class AtelierKeyboardShowcaseMode implements PresentationMode {
  get id(): string { return `${this.keyboard.id}:showcase`; }

  private readonly element: HTMLCanvasElement;
  private readonly panel: AtelierKeyboardPanel;
  private readonly cameraRegistry: CameraRegistry;
  private readonly keyboard: KeyboardInstrument;
  private readonly interactions: InstrumentInteractionSystem;
  private readonly orbit: OrbitController;
  private readonly pointers = new Map<number, PointerState>();
  private readonly computerKeys = new Map<string, HeldComputerNote>();

  private active = false;
  private inputTier: KeyboardTier = 'lower';
  private preset: AtelierKeyboardViewName = 'whole';
  private previousGesture: GestureState | null = null;
  private sustainTier: KeyboardTier | null = null;

  constructor(options: {
    element: HTMLCanvasElement;
    camera: CameraSystem;
    cameraRegistry: CameraRegistry;
    keyboard: KeyboardInstrument;
    interactions: InstrumentInteractionSystem;
  }) {
    this.element = options.element;
    this.cameraRegistry = options.cameraRegistry;
    this.keyboard = options.keyboard;
    this.interactions = options.interactions;
    this.orbit = new OrbitController({ camera: options.camera, element: options.element,
      subject: options.keyboard.root, pitchRange: [0.04, 1.43], floorY: 0.13 });
    installKeyboardPanelStyles();
    this.panel = new AtelierKeyboardPanel(options.keyboard, document.body);
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.attachInput();
    this.selectView('whole', true);
    this.panel.setVisible(true);
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.releaseInputState();
    this.detachInput();
    this.element.classList.remove('dragging', 'playable');
    this.panel.setVisible(false);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.orbit.update(dt);
  }

  selectView(id: AtelierKeyboardViewName, instant = false): boolean {
    const preset = this.getPreset(id);
    if (!preset) return false;
    this.preset = id;
    this.orbit.setView(preset, instant);
    return true;
  }

  resetView(): void {
    this.selectView('whole');
  }

  setInputTier(tier: KeyboardTier): void {
    this.inputTier = tier;
  }

  dispose(): void {
    this.deactivate();
    this.panel.dispose();
  }

  private getPreset(id: AtelierKeyboardViewName): InstrumentOrbitCameraView | null {
    const view = this.cameraRegistry.get(`${this.keyboard.id}:${id}`);
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
    const hit = event.button === 0 && !event.shiftKey
      ? this.interactions.hitTest(event.clientX, event.clientY, this.keyboard.id)
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
        const hit = this.interactions.hitTest(event.clientX, event.clientY, this.keyboard.id);
        this.element.classList.toggle('playable', Boolean(hit));
      }
      return;
    }

    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (pointer.mode === 'play') {
      this.playHit(pointer, this.interactions.hitTest(event.clientX, event.clientY, this.keyboard.id));
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

    const action = ATELIER_KEYBOARD_KEYMAP[event.code];
    let handled = Boolean(action);
    if (action?.kind === 'note') {
      if (!event.repeat && !this.computerKeys.has(event.code)) {
        const held = { note: action.note, tier: this.inputTier };
        this.computerKeys.set(event.code, held);
        this.keyboard.noteOnTier(held.note, 104, held.tier, `computer:${event.code}`);
      }
    } else if (action?.kind === 'tier') {
      this.inputTier = action.tier;
    } else if (action?.kind === 'view') {
      this.selectView(action.view);
    } else if (action?.kind === 'sustain') {
      if (!event.repeat && this.sustainTier === null) {
        this.sustainTier = this.inputTier;
        this.keyboard.setSustain(true, this.sustainTier, 'computer:Space');
      }
    } else if (action?.kind === 'panic') {
      this.keyboard.reset();
      this.computerKeys.clear();
      this.sustainTier = null;
    } else if (event.code === 'ArrowLeft') {
      this.orbit.rotateBy(-0.10, 0);
      handled = true;
    } else if (event.code === 'ArrowRight') {
      this.orbit.rotateBy(0.10, 0);
      handled = true;
    } else if (event.code === 'ArrowUp') {
      this.orbit.rotateBy(0, 0.08);
      handled = true;
    } else if (event.code === 'ArrowDown') {
      this.orbit.rotateBy(0, -0.08);
      handled = true;
    } else {
      handled = false;
    }

    if (handled) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const held = this.computerKeys.get(event.code);
    if (held) {
      this.keyboard.noteOffTier(held.note, held.tier, `computer:${event.code}`);
      this.computerKeys.delete(event.code);
      event.preventDefault();
      return;
    }
    if (event.code === 'Space' && this.sustainTier !== null) {
      const tier = this.sustainTier;
      this.sustainTier = null;
      this.keyboard.setSustain(false, tier, 'computer:Space');
      event.preventDefault();
    }
  };

  private readonly onBlur = (): void => this.releaseInputState();

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.releaseInputState();
  };

  private playHit(pointer: PointerState, hit: InstrumentHit | null): void {
    if (
      pointer.hit?.instrumentId === hit?.instrumentId
      && pointer.hit?.partId === hit?.partId
    ) return;

    this.releaseHit(pointer);
    pointer.hit = hit;
    if (!hit) return;
    const keyMatch = /^key:(lower|upper):/.exec(hit.partId);
    if (keyMatch) this.inputTier = keyMatch[1] as KeyboardTier;
    this.interactions.dispatch(hit, 'start', 106);
  }

  private releaseHit(pointer: PointerState): void {
    if (!pointer.hit) return;
    this.interactions.dispatch(pointer.hit, 'end', 106);
    pointer.hit = null;
  }

  private releaseInputState(): void {
    for (const pointer of this.pointers.values()) this.releaseHit(pointer);
    for (const [code, held] of this.computerKeys) {
      this.keyboard.noteOffTier(held.note, held.tier, `computer:${code}`);
    }
    this.computerKeys.clear();
    this.pointers.clear();
    this.previousGesture = null;
    if (this.sustainTier !== null) {
      const tier = this.sustainTier;
      this.sustainTier = null;
      this.keyboard.setSustain(false, tier, 'computer:Space');
    }
    this.element.classList.remove('dragging');
  }

  private changeZoom(factor: number): void { this.orbit.zoomBy(factor); }

  private pan(dx: number, dy: number): void { this.orbit.panBy(dx, dy); }

}
