import * as THREE from 'three';
import { getBassProgram } from '../../audio/BassProgram';
import { OrbitController } from '../../camera/OrbitController';
import type { CameraRegistry, InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { CameraSystem } from '../../camera/CameraSystem';
import { type AtelierBassViewName } from '../../camera/presets/AtelierBassViews';
import type { BassInstrument } from '../../instruments/bass/BassInstrument';
import type { InstrumentHit, InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { PresentationMode } from '../PresentationManager';
import { ATELIER_BASS_KEYMAP } from './AtelierBassKeymap';
import { guitarKeyboardVelocity, guitarPointerVelocity } from './AtelierGuitarVelocity';

interface PointerState { id: number; x: number; y: number; velocity: number; mode: 'play' | 'pan' | 'orbit'; hit: InstrumentHit | null }
interface HeldString { note: number; stringNumber: number }

export class AtelierBassShowcaseMode implements PresentationMode {
  get id(): string { return `${this.bass.id}:showcase`; }
  private readonly element: HTMLCanvasElement;
  private readonly cameraRegistry: CameraRegistry;
  private readonly bass: BassInstrument;
  private readonly interactions: InstrumentInteractionSystem;
  private readonly orbit: OrbitController;
  private readonly pointers = new Map<number, PointerState>();
  private readonly computerKeys = new Map<string, HeldString>();
  private active = false;
  private preset: AtelierBassViewName = 'whole';

  constructor(options: { element: HTMLCanvasElement; camera: CameraSystem; cameraRegistry: CameraRegistry; bass: BassInstrument; interactions: InstrumentInteractionSystem }) {
    this.element = options.element;
    this.cameraRegistry = options.cameraRegistry;
    this.bass = options.bass;
    this.interactions = options.interactions;
    this.orbit = new OrbitController({ camera: options.camera, element: options.element,
      subject: options.bass.root, pitchRange: [-0.92, 1.08], floorY: -3.65 });
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
    this.bass.reset();
    this.detachInput();
    this.element.classList.remove('dragging', 'playable');
  }

  update(dt: number): void {
    if (!this.active) return;
    this.orbit.update(dt);
  }

  selectView(id: AtelierBassViewName, instant = false): boolean {
    const preset = this.getPreset(id);
    if (!preset) return false;
    this.preset = id;
    this.orbit.setView(preset, instant);
    return true;
  }

  resetView(): void { this.selectView('whole'); }
  dispose(): void { this.deactivate(); }

  private getPreset(id: AtelierBassViewName): InstrumentOrbitCameraView | null {
    const view = this.cameraRegistry.get(`${this.bass.id}:${id}`);
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
      this.orbit.orbitBy(dx, dy);
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
    this.orbit.zoomBy(Math.exp(THREE.MathUtils.clamp(event.deltaY, -150, 150) * 0.0018));
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
    else if (event.code === 'ArrowLeft') { this.orbit.rotateBy(-0.10, 0); handled = true; }
    else if (event.code === 'ArrowRight') { this.orbit.rotateBy(0.10, 0); handled = true; }
    else if (event.code === 'ArrowUp') { this.orbit.rotateBy(0, 0.08); handled = true; }
    else if (event.code === 'ArrowDown') { this.orbit.rotateBy(0, -0.08); handled = true; }
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

  private pan(dx: number, dy: number): void { this.orbit.panBy(dx, dy); }

}
