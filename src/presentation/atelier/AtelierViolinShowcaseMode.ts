import * as THREE from 'three';
import { distanceForOrbitView } from '../../camera/CameraFraming';
import type { CameraRegistry, InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { CameraSystem } from '../../camera/CameraSystem';
import {
  ATELIER_VIOLIN_VIEW_IDS,
  type AtelierViolinViewName,
} from '../../camera/presets/AtelierViolinViews';
import type { InstrumentHit, InstrumentInteractionSystem } from '../../instruments/InstrumentInteractionSystem';
import type { ViolinInstrument } from '../../instruments/violin/ViolinInstrument';
import type { PresentationMode } from '../PresentationManager';
import { ATELIER_VIOLIN_KEYMAP } from './AtelierViolinKeymap';

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

interface HeldComputerString {
  note: number;
  stringNumber: number;
}

interface DemoEvent {
  time: number;
  note: number;
  velocity?: number;
  on: boolean;
}

const BEAT = 60 / 86;
const DEMO_LENGTH = BEAT * 16;
const DEMO_MELODY: ReadonlyArray<readonly [number, number]> = [
  [55, 1], [62, 0.5], [67, 0.5], [69, 1], [71, 1], [74, 1.5], [76, 0.5],
  [74, 1], [71, 1], [69, 1], [67, 1], [66, 0.5], [64, 0.5], [62, 1], [67, 3],
];

export class AtelierViolinShowcaseMode implements PresentationMode {
  readonly id = 'atelier-violin';

  private readonly element: HTMLCanvasElement;
  private readonly camera: CameraSystem;
  private readonly cameraRegistry: CameraRegistry;
  private readonly violin: ViolinInstrument;
  private readonly interactions: InstrumentInteractionSystem;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly pointers = new Map<number, PointerState>();
  private readonly computerKeys = new Map<string, HeldComputerString>();
  private readonly demoEvents = buildDemoEvents();
  private readonly current: CameraState = {
    target: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    distance: 20,
  };
  private readonly want: CameraState = {
    target: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    distance: 20,
  };

  private active = false;
  private preset: AtelierViolinViewName = 'whole';
  private zoom = 1;
  private width = 1;
  private height = 1;
  private momentumX = 0;
  private momentumY = 0;
  private previousGesture: GestureState | null = null;
  private bowFrameRemaining = 0;
  private bowFramed = false;
  private demoPlaying = false;
  private demoElapsed = 0;
  private demoCursor = 0;

  constructor(options: {
    element: HTMLCanvasElement;
    camera: CameraSystem;
    cameraRegistry: CameraRegistry;
    violin: ViolinInstrument;
    interactions: InstrumentInteractionSystem;
  }) {
    this.element = options.element;
    this.camera = options.camera;
    this.cameraRegistry = options.cameraRegistry;
    this.violin = options.violin;
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
    this.stopDemo();
    this.releaseInputState();
    this.violin.reset();
    this.detachInput();
    this.element.classList.remove('dragging', 'playable');
    this.camera.resetLens();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.syncViewport(false);
    this.updateDemo(dt);
    this.updateBowFraming(dt);

    if (
      this.pointers.size === 0
      && !this.reducedMotion.matches
      && Math.abs(this.momentumX) + Math.abs(this.momentumY) > 0.0001
    ) {
      const damping = Math.exp(-dt * 11);
      this.momentumX *= damping;
      this.momentumY *= damping;
      this.want.yaw += this.momentumX * dt * 23;
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + this.momentumY * dt * 23, -0.85, 1.05);
    }

    const ease = this.reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 13);
    this.current.yaw += (this.want.yaw - this.current.yaw) * ease;
    this.current.pitch += (this.want.pitch - this.current.pitch) * ease;
    this.current.distance += (this.want.distance - this.current.distance) * ease;
    this.current.target.lerp(this.want.target, ease);
    this.applyCamera();
  }

  selectView(id: AtelierViolinViewName, instant = false): boolean {
    const preset = this.getPreset(id);
    if (!preset) return false;

    this.preset = id;
    this.zoom = 1;
    this.momentumX = 0;
    this.momentumY = 0;
    this.camera.setLens({ fov: preset.fov, near: preset.near, far: preset.far });
    this.want.target.set(...preset.target);
    this.want.yaw = this.current.yaw + Math.atan2(
      Math.sin(preset.yaw - this.current.yaw),
      Math.cos(preset.yaw - this.current.yaw),
    );
    this.want.pitch = preset.pitch;
    this.want.distance = this.distanceFor(preset) * this.zoom;

    if (instant || this.reducedMotion.matches) {
      this.current.target.copy(this.want.target);
      this.current.yaw = this.want.yaw;
      this.current.pitch = this.want.pitch;
      this.current.distance = this.want.distance;
      this.applyCamera();
    }
    return true;
  }

  resetView(): void {
    this.selectView('whole');
  }

  dispose(): void {
    this.deactivate();
  }

  private getPreset(id: AtelierViolinViewName): InstrumentOrbitCameraView | null {
    const view = this.cameraRegistry.get(ATELIER_VIOLIN_VIEW_IDS[id]);
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
      ? this.interactions.hitTest(event.clientX, event.clientY, this.violin.id)
      : null;
    const pointer: PointerState = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: hit ? 'play' : (event.shiftKey || event.button !== 0 ? 'pan' : 'orbit'),
      hit: null,
    };
    const pendingFingeringClick = this.interactions.beginFingeringClick(event, hit, 99);
    this.pointers.set(event.pointerId, pointer);
    this.element.setPointerCapture(event.pointerId);
    this.momentumX = 0;
    this.momentumY = 0;
    this.previousGesture = null;
    if (!hit) this.element.classList.add('dragging');
    else if (!pendingFingeringClick) this.playHit(pointer, hit);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.active) return;
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === 'mouse') {
        const hit = this.interactions.hitTest(event.clientX, event.clientY, this.violin.id);
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
      const hit = this.interactions.hitTest(event.clientX, event.clientY, this.violin.id);
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
      this.momentumX = 0;
      this.momentumY = 0;
    } else if (pointer.mode === 'pan') {
      this.pan(dx, dy);
    } else {
      this.momentumX = -dx * 0.0055;
      this.momentumY = dy * 0.0047;
      this.want.yaw += this.momentumX;
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + this.momentumY, -0.85, 1.05);
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
    if (!this.active || event.ctrlKey || event.altKey || event.metaKey) return;
    const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (/INPUT|TEXTAREA|SELECT/.test(targetTag)) return;

    const action = ATELIER_VIOLIN_KEYMAP[event.code];
    let handled = Boolean(action);

    if (action?.kind === 'string') {
      if (!event.repeat && !this.computerKeys.has(event.code)) {
        const result = this.violin.playCurrentString(action.stringNumber, 100);
        if (result) {
          this.computerKeys.set(event.code, {
            note: result.note,
            stringNumber: result.string,
          });
        }
      }
    } else if (action?.kind === 'articulation') {
      this.violin.setArticulation(action.articulation);
      if (action.articulation === 'pizzicato') this.setBowFramed(false);
    } else if (action?.kind === 'clear-fingering') {
      if (!event.repeat) this.violin.clearFingering();
    } else if (action?.kind === 'view') {
      this.selectView(action.view);
    } else if (action?.kind === 'demo') {
      if (!event.repeat) this.toggleDemo();
    } else if (action?.kind === 'panic') {
      this.stopDemo();
      this.violin.reset();
      this.computerKeys.clear();
      this.setBowFramed(false);
    } else if (event.code === 'ArrowLeft') {
      this.want.yaw -= 0.10;
      handled = true;
    } else if (event.code === 'ArrowRight') {
      this.want.yaw += 0.10;
      handled = true;
    } else if (event.code === 'ArrowUp') {
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch + 0.08, -0.85, 1.05);
      handled = true;
    } else if (event.code === 'ArrowDown') {
      this.want.pitch = THREE.MathUtils.clamp(this.want.pitch - 0.08, -0.85, 1.05);
      handled = true;
    } else {
      handled = false;
    }

    if (handled) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const held = this.computerKeys.get(event.code);
    if (!held) return;
    this.violin.noteOff(held.note);
    this.computerKeys.delete(event.code);
    event.preventDefault();
  };

  private readonly onBlur = (): void => this.releaseInputState();

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopDemo();
      this.releaseInputState();
    }
  };

  private playHit(pointer: PointerState, hit: InstrumentHit | null): void {
    if (
      pointer.hit?.instrumentId === hit?.instrumentId
      && pointer.hit?.partId === hit?.partId
    ) return;

    this.releaseHit(pointer);
    pointer.hit = hit;
    if (!hit) return;
    this.interactions.dispatch(hit, 'start', 99);
  }

  private releaseHit(pointer: PointerState): void {
    if (!pointer.hit) return;
    this.interactions.dispatch(pointer.hit, 'end', 99);
    pointer.hit = null;
  }

  private releaseInputState(): void {
    this.interactions.cancelFingeringClicks();
    for (const pointer of this.pointers.values()) this.releaseHit(pointer);
    for (const held of this.computerKeys.values()) this.violin.noteOff(held.note);
    this.computerKeys.clear();
    this.pointers.clear();
    this.previousGesture = null;
    this.element.classList.remove('dragging');
  }

  private toggleDemo(): void {
    if (this.demoPlaying) this.stopDemo();
    else this.startDemo();
  }

  private startDemo(): void {
    this.stopDemo();
    this.demoPlaying = true;
    this.demoElapsed = 0;
    this.demoCursor = 0;
  }

  private stopDemo(): void {
    if (!this.demoPlaying && this.demoCursor === 0) return;
    this.demoPlaying = false;
    this.demoElapsed = 0;
    this.demoCursor = 0;
    this.violin.reset();
  }

  private updateDemo(dt: number): void {
    if (!this.demoPlaying) return;
    this.demoElapsed += Math.max(0, dt);

    while (this.demoElapsed >= DEMO_LENGTH) {
      this.violin.reset();
      this.demoElapsed -= DEMO_LENGTH;
      this.demoCursor = 0;
    }

    while (
      this.demoCursor < this.demoEvents.length
      && this.demoEvents[this.demoCursor].time <= this.demoElapsed
    ) {
      const event = this.demoEvents[this.demoCursor++];
      if (event.on) this.violin.noteOn(event.note, event.velocity ?? 96);
      else this.violin.noteOff(event.note);
    }
  }

  private updateBowFraming(dt: number): void {
    const activeArco = this.violin.articulation === 'arco' && this.violin.activeNotes.length > 0;
    if (activeArco) this.bowFrameRemaining = 1.85;
    else if (this.violin.articulation !== 'arco') this.bowFrameRemaining = 0;
    else this.bowFrameRemaining = Math.max(0, this.bowFrameRemaining - Math.max(0, dt));

    this.setBowFramed(activeArco || this.bowFrameRemaining > 0);
  }

  private setBowFramed(value: boolean): void {
    if (this.bowFramed === value) return;
    this.bowFramed = value;
    if (this.preset !== 'whole') return;
    const preset = this.getPreset('whole');
    if (preset) this.want.distance = this.distanceFor(preset) * this.zoom;
  }

  private changeZoom(factor: number): void {
    const preset = this.getPreset(this.preset);
    if (!preset) return;
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 0.26, 1.7);
    this.want.distance = this.distanceFor(preset) * this.zoom;
  }

  private pan(dx: number, dy: number): void {
    if (this.height <= 0) return;
    const preset = this.getPreset(this.preset);
    if (!preset) return;

    this.violin.root.updateWorldMatrix(true, true);
    const worldTarget = this.violin.root.localToWorld(this.current.target.clone());
    const worldDistance = this.camera.output.position.distanceTo(worldTarget);
    const scale = worldDistance * 2 * Math.tan(THREE.MathUtils.degToRad(preset.fov / 2)) / this.height;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.output.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.output.quaternion);
    const movedWorldTarget = worldTarget
      .addScaledVector(right, -dx * scale)
      .addScaledVector(up, dy * scale);
    this.want.target.copy(this.violin.root.worldToLocal(movedWorldTarget));
  }

  private syncViewport(force: boolean): void {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    if (!width || !height) return;
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const preset = this.getPreset(this.preset);
    if (!preset) return;
    const distance = this.distanceFor(preset) * this.zoom;
    this.want.distance = distance;
    this.current.distance = distance;
  }

  private distanceFor(preset: InstrumentOrbitCameraView): number {
    if (this.preset === 'whole' && this.bowFramed) {
      return distanceForOrbitView({ ...preset, width: 9.15 }, this.width, this.height);
    }
    return distanceForOrbitView(preset, this.width, this.height);
  }

  private applyCamera(): void {
    const preset = this.getPreset(this.preset);
    if (!preset) return;

    this.violin.root.updateWorldMatrix(true, true);
    const cp = Math.cos(this.current.pitch);
    const localPosition = new THREE.Vector3(
      this.current.target.x + Math.sin(this.current.yaw) * cp * this.current.distance,
      Math.max(-2.17, this.current.target.y + Math.sin(this.current.pitch) * this.current.distance),
      this.current.target.z + Math.cos(this.current.yaw) * cp * this.current.distance,
    );
    const position = this.violin.root.localToWorld(localPosition);
    const target = this.violin.root.localToWorld(this.current.target.clone());
    this.camera.setPose({ position, target, fov: preset.fov }, true);
  }
}

function buildDemoEvents(): DemoEvent[] {
  const events: DemoEvent[] = [];
  let cursorBeat = 0;
  for (const [note, length] of DEMO_MELODY) {
    events.push(
      {
        time: cursorBeat * BEAT,
        note,
        velocity: Math.round(note >= 74 ? 102 : 87 + (cursorBeat % 3) * 4),
        on: true,
      },
      {
        time: (cursorBeat + length) * BEAT - 0.025,
        note,
        on: false,
      },
    );
    cursorBeat += length;
  }
  events.push(
    { time: 13.6 * BEAT, note: 71, velocity: 78, on: true },
    { time: 15.65 * BEAT, note: 71, on: false },
  );
  return events.sort((a, b) => a.time - b.time);
}
