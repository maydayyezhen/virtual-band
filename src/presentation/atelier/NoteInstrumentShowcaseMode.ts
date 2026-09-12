import { OrbitController } from '../../camera/OrbitController';
import type { InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { InstrumentPresentationContext } from '../../instruments/InstrumentDefinitions';
import type { Instrument } from '../../instruments/Instrument';
import type { PresentationMode } from '../PresentationManager';
import { ATELIER_KEYBOARD_KEYMAP } from './AtelierKeyboardKeymap';
import './note-instrument-panel.css';

export interface NoteInstrument extends Instrument {
  noteOn(note: number, velocity: number, source?: string): void;
  noteOff(note: number, source?: string): void;
  setSustain?(pressed: boolean, source?: string): void;
}
export interface NoteShowcaseOptions {
  views: readonly InstrumentOrbitCameraView[];
  title: string;
  label: string;
  hint: string;
}
interface Pointer { x: number; y: number; mode: 'play' | 'orbit' | 'pan'; part: string | null }

/** Shared note gestures and camera controls; each instrument owns its geometry, audio and voicing. */
export class NoteInstrumentShowcaseMode implements PresentationMode {
  get id(): string { return `${this.instrument.id}:showcase`; }
  private active = false;
  private listeners: AbortController | null = null;
  private readonly orbit: OrbitController;
  protected readonly panel = document.createElement('section');
  private readonly pointers = new Map<number, Pointer>();
  private readonly computer = new Map<string, number>();
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(private readonly instrument: NoteInstrument, private readonly context: InstrumentPresentationContext, options: NoteShowcaseOptions) {
    this.orbit = new OrbitController({ camera: context.camera, element: context.element, subject: instrument.root, floorY: .02 });
    this.panel.className = 'note-instrument-panel'; this.panel.hidden = true; this.panel.setAttribute('aria-label', options.label);
    const title = document.createElement('strong'); title.textContent = options.title; this.panel.append(title);
    const controls = document.createElement('div');
    for (const view of options.views) {
      const name = view.id.split(':')[1], button = document.createElement('button');
      button.type = 'button'; button.textContent = view.label;
      button.addEventListener('click', () => { this.selectView(name); button.blur(); });
      this.buttons.set(name, button); controls.append(button);
    }
    const hint = document.createElement('p'); hint.textContent = options.hint;
    this.panel.append(controls, hint); document.body.append(this.panel);
  }
  activate(): void {
    if (this.active) return;
    this.active = true; this.panel.hidden = false; this.selectView('whole', true);
    this.listeners = new AbortController(); const signal = this.listeners.signal, element = this.context.element;
    element.addEventListener('contextmenu', e => e.preventDefault(), { signal });
    element.addEventListener('pointerdown', this.down, { signal });
    element.addEventListener('pointermove', this.move, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) element.addEventListener(type, this.end, { signal });
    element.addEventListener('wheel', e => { e.preventDefault(); this.orbit.zoomBy(Math.exp(Math.max(-150, Math.min(150, e.deltaY)) * .0018)); }, { signal, passive: false });
    document.addEventListener('keydown', this.keyDown, { signal });
    window.addEventListener('keyup', this.keyUp, { signal });
    window.addEventListener('blur', this.release, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); }, { signal });
  }
  deactivate(): void { this.release(); this.listeners?.abort(); this.listeners = null; this.active = false; this.panel.hidden = true; this.context.element.classList.remove('playable'); }
  update(dt: number): void { if (this.active) this.orbit.update(dt); }
  dispose(): void { this.deactivate(); this.panel.remove(); }
  selectView(name: string, instant = false): void {
    const view = this.context.cameraRegistry.get(`${this.instrument.id}:${name}`);
    if (view?.kind !== 'instrument-orbit') return;
    this.orbit.setView(view, instant);
    for (const [key, button] of this.buttons) button.setAttribute('aria-pressed', String(name === key));
  }
  private hit(x: number, y: number): string | null { return this.context.interactions.hitTest(x, y, this.instrument.id)?.partId ?? null; }
  private play(pointer: Pointer, part: string | null, id: number): void {
    if (pointer.part === part) return;
    const previous = pointer.part; pointer.part = part;
    if (previous?.startsWith('key:')) this.instrument.noteOff(Number(previous.slice(4)), `pointer:${id}`);
    if (previous === 'pedal:sustain') this.instrument.setSustain?.(false, `pointer:${id}`);
    if (part?.startsWith('key:')) this.instrument.noteOn(Number(part.slice(4)), 104, `pointer:${id}`);
    if (part === 'pedal:sustain') this.instrument.setSustain?.(true, `pointer:${id}`);
  }
  private readonly down = (e: PointerEvent): void => {
    const part = e.button === 0 && !e.shiftKey ? this.hit(e.clientX, e.clientY) : null;
    const pointer: Pointer = { x: e.clientX, y: e.clientY, mode: part ? 'play' : e.button !== 0 || e.shiftKey ? 'pan' : 'orbit', part: null };
    this.pointers.set(e.pointerId, pointer); this.context.element.setPointerCapture(e.pointerId); this.play(pointer, part, e.pointerId);
  };
  private readonly move = (e: PointerEvent): void => {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) { this.context.element.classList.toggle('playable', Boolean(this.hit(e.clientX, e.clientY))); return; }
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    const other = [...this.pointers.values()].find(p => p !== pointer && p.mode !== 'play');
    if (pointer.mode === 'play') this.play(pointer, this.hit(e.clientX, e.clientY), e.pointerId);
    else if (other) {
      const before = Math.hypot(pointer.x - other.x, pointer.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0 && after > 0) this.orbit.zoomBy(before / after);
      this.orbit.panBy(dx / 2, dy / 2);
    } else if (pointer.mode === 'pan') this.orbit.panBy(dx, dy);
    else this.orbit.orbitBy(dx, dy);
    pointer.x = e.clientX; pointer.y = e.clientY;
  };
  private readonly end = (e: PointerEvent): void => {
    const pointer = this.pointers.get(e.pointerId);
    if (pointer) this.play(pointer, null, e.pointerId);
    this.pointers.delete(e.pointerId);
  };
  private readonly keyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey || (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)))) return;
    const action = ATELIER_KEYBOARD_KEYMAP[e.code];
    if (action?.kind === 'note') {
      e.preventDefault(); if (e.repeat || this.computer.has(e.code)) return;
      this.computer.set(e.code, action.note); this.instrument.noteOn(action.note, 104, `computer:${e.code}`);
    } else if (e.code === 'Space') { e.preventDefault(); this.instrument.setSustain?.(true, 'computer'); }
    else if (e.code === 'KeyR') this.selectView('whole');
  };
  private readonly keyUp = (e: KeyboardEvent): void => {
    const note = this.computer.get(e.code);
    if (note !== undefined) { this.instrument.noteOff(note, `computer:${e.code}`); this.computer.delete(e.code); }
    if (e.code === 'Space') this.instrument.setSustain?.(false, 'computer');
  };
  private readonly release = (): void => {
    for (const [id, pointer] of this.pointers) this.play(pointer, null, id);
    this.pointers.clear();
    for (const [code, note] of this.computer) this.instrument.noteOff(note, `computer:${code}`);
    this.computer.clear(); this.instrument.setSustain?.(false, 'computer');
  };
}
