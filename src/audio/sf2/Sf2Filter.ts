import type { ProgramToneNoteOptions } from '../ProgramToneBackend';
import {
  absoluteCentsToHz,
  buildSf2ModEnvelopePlan,
  releaseSf2ModEnvelope,
  scheduleSf2ModEnvelope,
  type Sf2ModEnvelopePlan,
} from './Sf2Modulation.ts';
import type { Sf2Region } from './Sf2Parser.ts';

export type Sf2FilterEnvelopePlan = Sf2ModEnvelopePlan;

export interface Sf2FilterPlan {
  readonly baseCutoffHz: number;
  readonly resonanceDb: number;
  readonly staticDetuneCents: number;
  readonly envelopeDepthCents: number;
  readonly envelope: Sf2FilterEnvelopePlan;
}

export function buildSf2FilterPlan(
  region: Pick<
    Sf2Region,
    | 'initialFilterFc'
    | 'initialFilterQ'
    | 'modEnvToFilterFc'
    | 'delayModEnv'
    | 'attackModEnv'
    | 'holdModEnv'
    | 'decayModEnv'
    | 'sustainModEnv'
    | 'releaseModEnv'
    | 'keynumToModEnvHold'
    | 'keynumToModEnvDecay'
  >,
  note: number,
  velocity: number,
  sampleRate: number,
  options?: ProgramToneNoteOptions,
): Sf2FilterPlan {
  const vel = clamp(velocity, 0, 127);
  const velocityAmount = 1 - vel / 127;
  const brightness = clamp(options?.brightnessCents ?? 0, -9600, 9600);
  const velocityToFilter = clamp(options?.velocityToFilterCents ?? 0, -9600, 9600);
  const envelopeScale = clamp(options?.filterEnvelopeScale ?? 1, 0, 4);

  return {
    baseCutoffHz: clamp(
      absoluteCentsToHz(clamp(region.initialFilterFc, 1500, 13500)),
      20,
      Math.max(20, sampleRate * 0.49),
    ),
    resonanceDb: clamp(region.initialFilterQ / 10, 0, 96),
    staticDetuneCents: clamp(brightness + velocityToFilter * velocityAmount, -9600, 9600),
    envelopeDepthCents: clamp(region.modEnvToFilterFc * envelopeScale, -12000, 12000),
    envelope: buildSf2ModEnvelopePlan(region, note),
  };
}

export function scheduleSf2Filter(
  filter: BiquadFilterNode,
  plan: Sf2FilterPlan,
  startTime: number,
): void {
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(plan.baseCutoffHz, startTime);
  filter.Q.setValueAtTime(plan.resonanceDb, startTime);
  scheduleSf2ModEnvelope(
    filter.detune,
    plan.envelope,
    plan.envelopeDepthCents,
    startTime,
    plan.staticDetuneCents,
  );
}

export function releaseSf2Filter(
  filter: BiquadFilterNode,
  plan: Sf2FilterPlan,
  startTime: number,
  now: number,
  forcedReleaseSeconds?: number,
): number {
  return releaseSf2ModEnvelope(
    filter.detune,
    plan.envelope,
    plan.envelopeDepthCents,
    startTime,
    now,
    forcedReleaseSeconds,
    plan.staticDetuneCents,
  );
}

export { absoluteCentsToHz } from './Sf2Modulation.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
