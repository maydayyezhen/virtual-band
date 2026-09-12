import type { InstrumentOrbitCameraView } from '../../camera/CameraRegistry';
import type { InstrumentPresentationContext } from '../../instruments/InstrumentDefinitions';
import type { SaxophoneInstrument } from '../../instruments/saxophone/SaxophoneInstrument';
import { NoteInstrumentShowcaseMode } from './NoteInstrumentShowcaseMode';

export const SAXOPHONE_VIEWS: readonly InstrumentOrbitCameraView[] = [
  { kind: 'instrument-orbit', id: 'saxophone.main:whole', instrumentId: 'saxophone.main', label: '整支', target: [0, .49, .03], yaw: .55, pitch: .16, height: 1.2, width: .85, fov: 34, near: .01, far: 160 },
  { kind: 'instrument-orbit', id: 'saxophone.main:keys', instrumentId: 'saxophone.main', label: '按键', target: [0, .59, .025], yaw: .35, pitch: .10, height: .62, width: .45, fov: 34, near: .01, far: 160 },
  { kind: 'instrument-orbit', id: 'saxophone.main:bell', instrumentId: 'saxophone.main', label: '喇叭口', target: [0, .38, .18], yaw: .55, pitch: .55, height: .55, width: .5, fov: 34, near: .01, far: 160 },
];
export class SaxophoneShowcaseMode extends NoteInstrumentShowcaseMode {
  constructor(saxophone: SaxophoneInstrument, context: InstrumentPresentationContext) {
    super(saxophone, context, { views: SAXOPHONE_VIEWS, title: 'ATELIER · ALTO SAX', label: '萨克斯演奏',
      hint: '点按珠母键试音 · A–K 半音阶 · 后按音优先 · 拖动空白旋转 · 滚轮缩放' });
  }
}
