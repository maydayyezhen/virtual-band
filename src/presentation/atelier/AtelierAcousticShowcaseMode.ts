import * as THREE from 'three';
import { OrbitController } from '../../camera/OrbitController';
import type { CameraRegistry, InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { CameraSystem } from '../../camera/CameraSystem';
import {
  type AtelierAcousticViewName,
} from '../../camera/presets/AtelierAcousticViews';
import type { InstrumentHit, InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { AcousticGuitarInstrument } from '../../instruments/acoustic/AcousticGuitarInstrument';
import type { PresentationMode } from '../PresentationManager';
import { ATELIER_ACOUSTIC_KEYMAP } from './AtelierAcousticKeymap';
import { guitarKeyboardVelocity, guitarPointerVelocity } from './AtelierGuitarVelocity';

interface PointerState {
  id: number;
  x: number;
  y: number;
  velocity: number;
  mode: 'play' | 'pan' | 'orbit';
  hit: InstrumentHit | null;
}

interface GestureState {
  d: number;
  x: number;
  y: number;
}

interface HeldComputerString {
  note: number;
  stringNumber: number;
}

const CHORDS: ReadonlyArray<ReadonlyArray<number | null>> = [
  [0, 2, 2, 0, 0, 0],
  [null, 3, 2, 0, 1, 0],
  [3, 2, 0, 0, 0, 3],
  [null, null, 0, 2, 3, 2],
];

export class AtelierAcousticShowcaseMode implements PresentationMode {
  get id(): string { return `${this.acoustic.id}:showcase`; }

  private readonly element: HTMLCanvasElement;
  private readonly cameraRegistry: CameraRegistry;
  private readonly acoustic: AcousticGuitarInstrument;
  private readonly interactions: InstrumentInteractionSystem;
  private readonly orbit: OrbitController;
  private readonly pointers = new Map<number, PointerState>();
  private readonly computerKeys = new Map<string, HeldComputerString>();

  private active = false;
  private preset: AtelierAcousticViewName = 'whole';
  private previousGesture: GestureState | null = null;

  constructor(options: {
    element: HTMLCanvasElement;
    camera: CameraSystem;
    cameraRegistry: CameraRegistry;
    acoustic: AcousticGuitarInstrument;
    interactions: InstrumentInteractionSystem;
  }) {
    this.element = options.element;
    this.cameraRegistry = options.cameraRegistry;
    this.acoustic = options.acoustic;
    this.interactions = options.interactions;
    this.orbit = new OrbitController({ camera: options.camera, element: options.element,
      subject: options.acoustic.root, pitchRange: [-0.92, 1.08], floorY: -3.65 });
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
    this.releaseInputState();
    this.acoustic.reset();
    this.detachInput();
    this.element.classList.remove('dragging', 'playable');
  }

  update(dt: number): void {
    if (!this.active) return;
    this.orbit.update(dt);
  }

  selectView(id: AtelierAcousticViewName, instant = false): boolean {
    const preset = this.getPreset(id);
    if (!preset) return false;
    this.preset = id;
    this.orbit.setView(preset, instant);
    return true;
  }

  resetView(): void {
    this.selectView('whole');
  }

  dispose(): void {
    this.deactivate();
  }

  private getPreset(id: AtelierAcousticViewName): InstrumentOrbitCameraView | null {
    const view = this.cameraRegistry.get(`${this.acoustic.id}:${id}`);
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
      ? this.interactions.hitTest(event.clientX, event.clientY, this.acoustic.id)
      : null;
    const pointer: PointerState = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      velocity: guitarPointerVelocity(event, 105),
      mode: hit ? 'play' : (event.shiftKey || event.button !== 0 ? 'pan' : 'orbit'),
      hit: null,
    };
    const pendingFingeringClick = this.interactions.beginFingeringClick(event, hit, pointer.velocity);
    this.pointers.set(event.pointerId, pointer);
    this.element.setPointerCapture(event.pointerId);
    this.previousGesture = null;
    if (!hit) this.element.classList.add('dragging');
    else if (!pendingFingeringClick) this.playHit(pointer, hit);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.active) return;
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === 'mouse') {
        const hit = this.interactions.hitTest(event.clientX, event.clientY, this.acoustic.id);
        this.element.classList.toggle('playable', Boolean(hit));
      }
      return;
    }

    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (pointer.mode === 'play') {
      if (this.interactions.hasPendingFingeringClick(event.pointerId)) return;
      const hit = this.interactions.hitTest(event.clientX, event.clientY, this.acoustic.id);
      if (!this.interactions.allowsDragTransition(pointer.hit, hit)) return;
      this.playHit(pointer, hit);
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
    const fingeringClickFinished = this.interactions.finishFingeringClick(event);
    if (pointer && !fingeringClickFinished) this.releaseHit(pointer);
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
    if (!this.active || event.ctrlKey || event.metaKey) return;
    const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (/INPUT|TEXTAREA|SELECT/.test(targetTag)) return;

    const action = ATELIER_ACOUSTIC_KEYMAP[event.code];
    const velocityAction = action?.kind === 'string' || action?.kind === 'strum';
    if (event.altKey && !velocityAction) return;
    let handled = Boolean(action);

    if (action?.kind === 'string') {
      if (!event.repeat && !this.computerKeys.has(event.code)) {
        const result = this.acoustic.pluckCurrentString(
          action.stringNumber,
          guitarKeyboardVelocity(event, 104),
        );
        if (result) {
          this.computerKeys.set(event.code, {
            note: result.note,
            stringNumber: result.string,
          });
        }
      }
    } else if (action?.kind === 'chord') {
      if (!event.repeat) this.acoustic.setFingering(CHORDS[action.chordIndex] ?? CHORDS[0]);
    } else if (action?.kind === 'strum') {
      if (!event.repeat) {
        this.acoustic.strumCurrentFingering(
          guitarKeyboardVelocity(event, 100),
          action.direction,
        );
      }
    } else if (action?.kind === 'clear-fingering') {
      if (!event.repeat) this.acoustic.clearFingering();
    } else if (action?.kind === 'program-toggle') {
      if (!event.repeat) {
        const nextProgram = this.acoustic.program === 24 ? 25 : 24;
        if (this.acoustic.setProgram(nextProgram)) {
          console.info(
            `[Virtual Band V2] acoustic program ${nextProgram} · ${nextProgram === 24 ? 'Nylon' : 'Steel'}`,
          );
        }
      }
    } else if (action?.kind === 'view') {
      this.selectView(action.view);
    } else if (action?.kind === 'panic') {
      this.acoustic.reset();
      this.computerKeys.clear();
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
    if (!held) return;
    this.acoustic.noteOff(held.note);
    this.computerKeys.delete(event.code);
    event.preventDefault();
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
    this.interactions.dispatch(hit, 'start', pointer.velocity);
  }

  private releaseHit(pointer: PointerState): void {
    if (!pointer.hit) return;
    this.interactions.dispatch(pointer.hit, 'end', pointer.velocity);
    pointer.hit = null;
  }

  private releaseInputState(): void {
    this.interactions.cancelFingeringClicks();
    for (const pointer of this.pointers.values()) this.releaseHit(pointer);
    for (const held of this.computerKeys.values()) this.acoustic.noteOff(held.note);
    this.computerKeys.clear();
    this.pointers.clear();
    this.previousGesture = null;
    this.element.classList.remove('dragging');
  }

  private changeZoom(factor: number): void { this.orbit.zoomBy(factor); }

  private pan(dx: number, dy: number): void { this.orbit.panBy(dx, dy); }

}
