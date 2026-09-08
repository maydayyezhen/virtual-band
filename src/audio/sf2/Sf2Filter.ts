import type { ProgramToneNoteOptions } from '../ProgramToneBackend';
import { keyTrackedTimecents, timecentsToSeconds } from './Sf2Envelope';
import type { Sf2Region } from './Sf2Parser';

export interface Sf2FilterEnvelopePlan {
  readonly delaySeconds: number;
  readonly attackSeconds: number;
  readonly holdSeconds: number;
  readonly decaySeconds: number;
  readonly sustainLevel: number;
  readonly releaseSeconds: number;
}

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
  const midi = clamp(note, 0, 127);
  const vel = clamp(velocity, 0, 127);
  const velocityAmount = 1 - vel / 127;
  const brightness = clamp(options?.brightnessCents ?? 0, -9600, 9600);
  const velocityToFilter = clamp(options?.velocityToFilterCents ?? 0, -9600, 9600);
  const envelopeScale = clamp(options?.filterEnvelopeScale ?? 1, 0, 4);

  const holdTc = keyTrackedTimecents(region.holdModEnv, region.keynumToModEnvHold, midi);
  const decayTc = keyTrackedTimecents(region.decayModEnv, region.keynumToModEnvDecay, midi);

  return {
    baseCutoffHz: clamp(
      absoluteCentsToHz(clamp(region.initialFilterFc, 1500, 13500)),
      20,
      Math.max(20, sampleRate * 0.49),
    ),
    // SF2 initialFilterQ is in centibels above DC gain. For Web Audio lowpass,
    // BiquadFilterNode.Q is interpreted in dB, so cB / 10 maps directly.
    resonanceDb: clamp(region.initialFilterQ / 10, 0, 96),
    staticDetuneCents: clamp(brightness + velocityToFilter * velocityAmount, -9600, 9600),
    envelopeDepthCents: clamp(region.modEnvToFilterFc * envelopeScale, -12000, 12000),
    envelope: {
      delaySeconds: timecentsToSeconds(region.delayModEnv),
      attackSeconds: timecentsToSeconds(region.attackModEnv),
      holdSeconds: timecentsToSeconds(holdTc),
      decaySeconds: timecentsToSeconds(decayTc),
      sustainLevel: 1 - clamp(region.sustainModEnv, 0, 1000) / 1000,
      releaseSeconds: timecentsToSeconds(region.releaseModEnv),
    },
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

  const detune = filter.detune;
  const base = plan.staticDetuneCents;
  const peak = base + plan.envelopeDepthCents;
  const sustain = base + plan.envelopeDepthCents * plan.envelope.sustainLevel;
  const attackStart = startTime + plan.envelope.delaySeconds;
  const attackEnd = attackStart + plan.envelope.attackSeconds;
  const holdEnd = attackEnd + plan.envelope.holdSeconds;
  const decayEnd = holdEnd + plan.envelope.decaySeconds;

  detune.cancelScheduledValues(startTime);
  detune.setValueAtTime(base, startTime);
  if (plan.envelope.delaySeconds > 0.001) detune.setValueAtTime(base, attackStart);

  if (plan.envelope.attackSeconds > 0.001) {
    detune.linearRampToValueAtTime(peak, attackEnd);
  } else {
    detune.setValueAtTime(peak, attackStart);
  }

  detune.setValueAtTime(peak, holdEnd);
  if (plan.envelope.decaySeconds > 0.001) {
    detune.linearRampToValueAtTime(sustain, decayEnd);
  } else {
    detune.setValueAtTime(sustain, holdEnd);
  }
}

export function releaseSf2Filter(
  filter: BiquadFilterNode,
  plan: Sf2FilterPlan,
  startTime: number,
  now: number,
  forcedReleaseSeconds?: number,
): number {
  const currentLevel = filterEnvelopeLevelAt(plan.envelope, Math.max(0, now - startTime));
  const currentDetune = plan.staticDetuneCents + plan.envelopeDepthCents * currentLevel;
  const release = clamp(
    forcedReleaseSeconds ?? plan.envelope.releaseSeconds,
    0.005,
    30,
  );

  filter.detune.cancelScheduledValues(now);
  filter.detune.setValueAtTime(currentDetune, now);
  if (release > 0.001) {
    filter.detune.linearRampToValueAtTime(plan.staticDetuneCents, now + release);
  } else {
    filter.detune.setValueAtTime(plan.staticDetuneCents, now);
  }
  return release;
}

export function filterEnvelopeLevelAt(
  envelope: Sf2FilterEnvelopePlan,
  elapsedSeconds: number,
): number {
  const elapsed = Math.max(0, elapsedSeconds);
  if (elapsed < envelope.delaySeconds) return 0;

  const afterDelay = elapsed - envelope.delaySeconds;
  if (envelope.attackSeconds > 0.001 && afterDelay < envelope.attackSeconds) {
    return clamp(afterDelay / envelope.attackSeconds, 0, 1);
  }

  const holdEnd = envelope.attackSeconds + envelope.holdSeconds;
  if (afterDelay < holdEnd) return 1;

  const decayEnd = holdEnd + envelope.decaySeconds;
  if (envelope.decaySeconds > 0.001 && afterDelay < decayEnd) {
    const t = clamp((afterDelay - holdEnd) / envelope.decaySeconds, 0, 1);
    return 1 + (envelope.sustainLevel - 1) * t;
  }

  return envelope.sustainLevel;
}

export function absoluteCentsToHz(cents: number): number {
  return 8.176 * 2 ** (cents / 1200);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
