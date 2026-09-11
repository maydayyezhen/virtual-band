import { parseMidi } from './parseMidi';
import { describeTrackTone, routeTrack } from './routeTracks';
import { planBand, type BandPlan } from './planBand';
import type { ParsedMidi, RoutedTrack } from './types';

export * from './types';
export { parseMidi } from './parseMidi';
export { routeProgram, routeTrack, describeTrackTone } from './routeTracks';
export { planBand } from './planBand';
export type { BandPlan, InstrumentPlan, TrackAssignment } from './planBand';

export interface MidiAnalysis {
  readonly midi: ParsedMidi;
  readonly routed: readonly RoutedTrack[];
  readonly plan: BandPlan;
  /** Human-readable report, the same text the dev script prints. */
  readonly report: string;
}

const TYPE_LABELS: Record<string, string> = {
  drums: '鼓',
  bass: '贝斯',
  keyboard: '键盘',
  acoustic: '木吉他',
  electric: '电吉他',
  violin: '提琴',
};

/**
 * Parse, route and plan, in one call.
 *
 * Everything here is pure data: no 3D, no audio, no DOM. That is deliberate — whether a file is
 * split sensibly is a question about the file, and it should be answerable without standing up a
 * stage first.
 */
export function analyzeMidi(data: ArrayBuffer | Uint8Array): MidiAnalysis {
  const midi = parseMidi(data);

  // A part of two or three notes across a whole song is a placeholder, a stray marker or debris
  // from whatever exported the file. Letting those claim an instrument costs a player on stage for
  // nothing, so they are reported and left out of the plan.
  const ignored = midi.tracks.filter((track) => track.notes.length < MIN_NOTES_PER_TRACK);
  const routed = midi.tracks
    .filter((track) => track.notes.length >= MIN_NOTES_PER_TRACK)
    .map(routeTrack)
    .sort((a, b) => a.firstNote - b.firstNote || a.index - b.index);

  const planned = planBand(routed);
  const plan = ignored.length
    ? {
        ...planned,
        diagnostics: [
          ...planned.diagnostics,
          ...ignored.map(
            (track) => `轨 ${track.index}（${track.name}）只有 ${track.notes.length} 个音，判为占位/杂物，不参与编制`,
          ),
        ],
      }
    : planned;

  return { midi, routed, plan, report: renderReport(midi, routed, plan) };
}

/** A part this short is a placeholder or debris, not a performance. */
const MIN_NOTES_PER_TRACK = 3;

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function renderReport(midi: ParsedMidi, routed: readonly RoutedTrack[], plan: BandPlan): string {
  const lines: string[] = [];
  lines.push(`${midi.name}   ${clock(midi.duration)}   ${midi.tracks.length} 条有声轨   ${plan.totalInstruments} 件乐器`);
  lines.push('');

  for (const instrument of plan.instruments) {
    lines.push(`${TYPE_LABELS[instrument.type] ?? instrument.type}  ${instrument.count} 件 —— ${instrument.reason}`);
    for (const assignment of instrument.assignments) {
      const { track, instance, tier } = assignment;
      const where = tier ? `第 ${instance + 1} 台 / ${tier === 'lower' ? '下层' : '上层'}` : `第 ${instance + 1} 件`;
      lines.push(
        `    ${where.padEnd(14)} ← 轨 ${String(track.index).padStart(2)}  ${track.name.slice(0, 18).padEnd(18)} ` +
          `${describeTrackTone(track).slice(0, 24).padEnd(24)} ${String(track.notes.length).padStart(5)} 音  ` +
          `${clock(track.firstNote)}–${clock(track.lastNote)}`,
      );
    }
    lines.push('');
  }

  if (plan.diagnostics.length) {
    lines.push('诊断');
    for (const line of plan.diagnostics) lines.push(`  · ${line}`);
    lines.push('');
  }

  lines.push('归属明细');
  for (const track of routed) {
    lines.push(
      `  轨 ${String(track.index).padStart(2)}  ${track.name.slice(0, 20).padEnd(20)} ` +
        `通道 ${String(track.channel + 1).padStart(2)}  → ${(TYPE_LABELS[track.type] ?? track.type).padEnd(4)} ${track.reason}`,
    );
  }

  return lines.join('\n');
}
