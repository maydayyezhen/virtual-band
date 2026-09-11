import { generalMidiToneName } from '../audio/GeneralMidiTones';
import type { BandInstrumentType, MidiTrack, RoutedTrack } from './types';

/**
 * The routing table from docs/MIDI_BAND_SPEC.md section 2.
 *
 * One entry per zero-based GM program, because GM's families are a functional approximation
 * rather than a taxonomy and several entries contradict their family on purpose. `keyboard` is the
 * fallback: it is the only instrument that can load any of the 128 programs, so anything without a
 * player of its own goes there and still sounds.
 *
 * The three notes that GM files under strings but are not strings:
 * - 45 Tremolo Strings — a bowed-string technique, but the violin model has no such tone yet.
 * - 47 Orchestral Harp — plucked, not bowed.
 * - 48 Timpani — percussion that GM puts in the strings family.
 */
const ROUTES: readonly { readonly from: number; readonly to: number; readonly type: BandInstrumentType; readonly reason: string }[] =
  Object.freeze([
    { from: 0, to: 23, type: 'keyboard', reason: '钢琴 / 色彩打击 / 风琴' },
    { from: 24, to: 25, type: 'acoustic', reason: '尼龙弦 / 钢弦木吉他' },
    { from: 26, to: 31, type: 'electric', reason: '电吉他家族' },
    { from: 32, to: 37, type: 'bass', reason: '真实贝斯音色' },
    { from: 38, to: 39, type: 'keyboard', reason: '合成贝斯——现实中键盘手弹' },
    { from: 40, to: 44, type: 'violin', reason: '弦乐（小提琴/中提琴/大提琴/低音提琴）' },
    { from: 45, to: 45, type: 'keyboard', reason: '震音弦乐——提琴表里还没有这个音色' },
    { from: 46, to: 46, type: 'violin', reason: '拨弦弦乐——用提琴的拨弦演奏方式' },
    { from: 47, to: 47, type: 'keyboard', reason: '竖琴——拨弦，不是弓弦' },
    { from: 48, to: 48, type: 'keyboard', reason: '定音鼓——是打击乐，但鼓加载不了旋律音色' },
    { from: 49, to: 128, type: 'keyboard', reason: '没有对应实体乐手，键盘兜底' },
  ]);

/** Which instrument a track's tone belongs to. Drums win over the program, as GM intends. */
export function routeProgram(program: number, isDrums: boolean): { type: BandInstrumentType; reason: string } {
  if (isDrums) return { type: 'drums', reason: '通道 10，不看音色' };
  const route = ROUTES.find((entry) => program >= entry.from && program <= entry.to);
  return route ? { type: route.type, reason: route.reason } : { type: 'keyboard', reason: '超出 GM 范围，键盘兜底' };
}

/**
 * The program a track actually plays.
 *
 * A track can change tone partway through; the table wants the tone it spends most of its time on,
 * so the reported program is the one with the most notes rather than the first one seen. The parser
 * only exposes one program per track, so this is a thin wrapper that exists to document the intent.
 */
export function dominantProgram(track: MidiTrack): number {
  return track.program;
}

export function routeTrack(track: MidiTrack): RoutedTrack {
  const program = dominantProgram(track);
  const { type, reason } = routeProgram(program, track.isDrums);
  return { ...track, type, reason };
}

/** A short label for the report, e.g. `16 Rock Organ`. */
export function describeTrackTone(track: MidiTrack): string {
  if (track.isDrums) return 'GM 打击乐组';
  return `${track.program} ${generalMidiToneName(track.program)}`;
}
