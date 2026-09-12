import type { InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { InstrumentPresentationContext } from '../../instruments/InstrumentDefinitions';
import type { CelloInstrument } from '../../instruments/cello/CelloInstrument';
import { NoteInstrumentShowcaseMode } from './NoteInstrumentShowcaseMode';

export const CELLO_VIEWS: readonly InstrumentOrbitCameraView[] = [
  { kind: 'instrument-orbit', id: 'cello.main:whole', instrumentId: 'cello.main', label: '整琴', target: [0, .74, .03], yaw: .45, pitch: .12, height: 1.72, width: 1.25, fov: 34, near: .005, far: 160 },
  { kind: 'instrument-orbit', id: 'cello.main:strings', instrumentId: 'cello.main', label: '指板', target: [0, .99, .14], yaw: .15, pitch: .08, height: .68, width: .42, fov: 34, near: .005, far: 160 },
  { kind: 'instrument-orbit', id: 'cello.main:bridge', instrumentId: 'cello.main', label: '琴桥与运弓', target: [0, .64, .13], yaw: .38, pitch: .65, height: .48, width: .94, fov: 34, near: .005, far: 160 },
  { kind: 'instrument-orbit', id: 'cello.main:scroll', instrumentId: 'cello.main', label: '琴头', target: [0, 1.37, .03], yaw: .6, pitch: .10, height: .25, width: .25, fov: 34, near: .005, far: 160 },
];
export class CelloShowcaseMode extends NoteInstrumentShowcaseMode {
  private readonly articulationButtons = new Map<'arco' | 'pizzicato', HTMLButtonElement>();
  constructor(private readonly cello: CelloInstrument, context: InstrumentPresentationContext) {
    super(cello, context, { views: CELLO_VIEWS, title: 'ATELIER · CELLO', label: '大提琴演奏',
      hint: '1 运弓 / 2 拨弦 · 点按指板试音 · A–K 半音阶 · 拖动空白旋转 · 滚轮缩放' });
    const modes = document.createElement('div'); modes.setAttribute('aria-label', '演奏方式');
    for (const [mode, label] of [['arco', '运弓 1'], ['pizzicato', '拨弦 2']] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => { this.selectArticulation(mode); button.blur(); });
      modes.append(button); this.articulationButtons.set(mode, button);
    }
    this.panel.insertBefore(modes, this.panel.lastElementChild); this.selectArticulation(cello.articulation);
  }
  private selectArticulation(mode: 'arco' | 'pizzicato'): void {
    this.cello.setArticulation(mode);
    for (const [value, button] of this.articulationButtons) button.setAttribute('aria-pressed', String(value === this.cello.articulation));
  }
  private readonly articulationKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)))) return;
    if (event.code === 'Digit1' || event.code === 'Digit2') { event.preventDefault(); this.selectArticulation(event.code === 'Digit1' ? 'arco' : 'pizzicato'); }
  };
  override activate(): void { super.activate(); document.addEventListener('keydown', this.articulationKey); }
  override deactivate(): void { document.removeEventListener('keydown', this.articulationKey); super.deactivate(); }
}
