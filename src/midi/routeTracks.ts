import { generalMidiToneName } from '../audio/GeneralMidiTones.ts';
import type { BandInstrumentType, MidiTrack, RoutedTrack } from './types';

/**
 * The routing table from docs/MIDI_BAND_SPEC.md section 2.
 *
 * All ranges are inclusive, zero-based GM program numbers (0–127).
 * This selects visual instruments only; original MIDI audio bypasses this table.
 * Unsupported visual instruments use the keyboard model as a fallback.
 *
 * Special cases within the strings family:
 * - 44 Tremolo Strings — no dedicated tremolo performance yet.
 * - 45 Pizzicato Strings — the violin's existing plucked articulation.
 * - 46 Orchestral Harp — no harp model yet.
 * - 47 Timpani — pitched percussion, not the channel-10 drum kit.
 */
const ROUTES: readonly { readonly from: number; readonly to: number; readonly type: BandInstrumentType; readonly reason: string }[] =
  Object.freeze([
    { from: 0, to: 1, type: 'piano', reason: '原声三角钢琴 / 明亮钢琴' },
    { from: 2, to: 2, type: 'keyboard', reason: '电声三角钢琴——键盘表现' },
    { from: 3, to: 3, type: 'piano', reason: '酒吧钢琴——原声钢琴表现' },
    { from: 4, to: 23, type: 'keyboard', reason: '电钢琴 / 色彩打击 / 风琴' },
    { from: 24, to: 25, type: 'acoustic', reason: '尼龙弦 / 钢弦木吉他' },
    { from: 26, to: 31, type: 'electric', reason: '电吉他家族' },
    { from: 32, to: 37, type: 'bass', reason: '真实贝斯音色' },
    { from: 38, to: 39, type: 'keyboard', reason: '合成贝斯——键盘表现' },
    { from: 40, to: 41, type: 'violin', reason: '小提琴 / 中提琴' },
    { from: 42, to: 42, type: 'cello', reason: '大提琴' },
    { from: 43, to: 43, type: 'violin', reason: '低音提琴——由提琴调整定弦表现' },
    { from: 44, to: 44, type: 'keyboard', reason: '震音弦乐——暂无专用震音表现' },
    { from: 45, to: 45, type: 'violin', reason: '拨弦弦乐——用提琴的拨弦演奏方式' },
    { from: 46, to: 46, type: 'keyboard', reason: '竖琴——暂无竖琴模型' },
    { from: 47, to: 47, type: 'keyboard', reason: '定音鼓——暂无定音鼓模型' },
    { from: 48, to: 64, type: 'keyboard', reason: '没有对应实体乐手，键盘兜底' },
    { from: 65, to: 65, type: 'saxophone', reason: '中音萨克斯' },
    { from: 66, to: 127, type: 'keyboard', reason: '没有对应实体乐手，键盘兜底' },
  ]);

/** Which instrument a track's tone belongs to. Drums win over the program, as GM intends. */
export function routeProgram(program: number, isDrums: boolean): { type: BandInstrumentType; reason: string } {
  if (isDrums) return { type: 'drums', reason: '通道 10，不看音色' };
  if (!Number.isInteger(program)) return { type: 'keyboard', reason: '无效 GM 编号，键盘兜底' };
  const route = ROUTES.find((entry) => program >= entry.from && program <= entry.to);
  return route ? { type: route.type, reason: route.reason } : { type: 'keyboard', reason: '超出 GM 范围，键盘兜底' };
}

/**
 * The representative program supplied by the parser. No per-note program-frequency analysis
 * happens here; original program-change events remain the native audio player's responsibility.
 */
export function dominantProgram(track: MidiTrack): number {
  return track.program;
}

export function routeTrack(track: MidiTrack): RoutedTrack {
  const program = dominantProgram(track);
  const { type, reason } = routeProgram(program, track.isDrums);
  return { ...track, type, reason };
}

/** A zero-based label for the report, e.g. `18 Rock Organ`. */
export function describeTrackTone(track: MidiTrack): string {
  if (track.isDrums) return 'GM 打击乐组';
  return `${track.program} ${generalMidiToneName(track.program)}`;
}
