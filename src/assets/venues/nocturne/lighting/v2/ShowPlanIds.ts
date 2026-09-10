import type { ShowPlan } from './contracts';

/**
 * Generated choreography often uses local counters that restart in each section.
 * Namespace every cue id by section before compilation so local gesture names may
 * repeat across sections while true duplicates inside the same section still fail
 * compileShowPlan's duplicate-id validation.
 */
export function namespaceCueIdsBySection(plan: ShowPlan): ShowPlan {
  return {
    ...plan,
    cues: plan.cues.map((cue) => ({
      ...cue,
      id: cue.id.startsWith(`${cue.sectionId}:`) ? cue.id : `${cue.sectionId}:${cue.id}`,
    })),
  };
}
