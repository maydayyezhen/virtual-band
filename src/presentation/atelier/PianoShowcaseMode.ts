import type { InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { InstrumentPresentationContext } from '../../instruments/InstrumentDefinitions';
import type { GrandPianoInstrument } from '../../instruments/piano/GrandPianoInstrument';
import { NoteInstrumentShowcaseMode } from './NoteInstrumentShowcaseMode';
export const PIANO_VIEWS: readonly InstrumentOrbitCameraView[] = [
  { kind: 'instrument-orbit', id: 'piano.main:whole', instrumentId: 'piano.main', label: '整琴', target: [0, .85, -.25], yaw: .70, pitch: .32, height: 2.8, width: 4.2, fov: 34, near: .02, far: 160 },
  { kind: 'instrument-orbit', id: 'piano.main:keys', instrumentId: 'piano.main', label: '键盘', target: [0, .79, .48], yaw: 0, pitch: .72, height: .70, width: 1.70, fov: 34, near: .02, far: 160 },
  { kind: 'instrument-orbit', id: 'piano.main:strings', instrumentId: 'piano.main', label: '开盖', target: [0, .95, -.55], yaw: 1.2, pitch: .8, height: 1.8, width: 2.7, fov: 34, near: .02, far: 160 },
];
export class PianoShowcaseMode extends NoteInstrumentShowcaseMode {
  constructor(piano: GrandPianoInstrument, context: InstrumentPresentationContext) {
    super(piano, context, { views: PIANO_VIEWS, title: 'ATELIER · GRAND PIANO', label: '钢琴演奏',
      hint: '点击 / 滑动琴键 · A–K 弹奏 · 空格延音 · 拖动空白旋转 · 滚轮缩放' });
  }
}