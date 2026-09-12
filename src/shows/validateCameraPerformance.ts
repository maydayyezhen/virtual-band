import type { BandPlan } from '../midi/planBand';
import type { CameraShow } from './CameraShow';

/** Authoring check against the routed MIDI, including held notes and every assigned layer. */
export function validateCameraPerformance(show: CameraShow, plan: BandPlan, maxRestSeconds = 1): string[] {
  const issues: string[] = [];
  for (const [index, cue] of show.cues.entries()) {
    const subject = cue.from.subject;
    if (!subject) continue;
    const end = show.cues[index + 1]?.time ?? show.duration;
    const assignments = plan.instruments.find(p => p.type === subject.type)?.assignments
      .filter(a => a.instance === subject.instance) ?? [];
    const notes = assignments.flatMap(a => a.track.notes)
      .filter(n => n.start < end && n.end > cue.time)
      .sort((a, b) => a.start - b.start);
    const label = `${cue.name} (${cue.time.toFixed(3)}s, ${subject.type}.${subject.instance})`;
    if (!notes.some(n => n.start <= cue.time && n.end > cue.time)) {
      issues.push(`${label}: 切入时没有正在演奏的 MIDI 音符`);
    }
    // Merge overlapping voices; include silence before the first and after the last note.
    let coveredUntil = cue.time;
    let longestRest = 0;
    for (const note of notes) {
      longestRest = Math.max(longestRest, note.start - coveredUntil);
      coveredUntil = Math.max(coveredUntil, note.end);
    }
    longestRest = Math.max(longestRest, end - coveredUntil);
    if (longestRest > maxRestSeconds) {
      issues.push(`${label}: 镜头内停奏 ${longestRest.toFixed(3)}s，超过 ${maxRestSeconds}s`);
    }
  }
  return issues;
}
