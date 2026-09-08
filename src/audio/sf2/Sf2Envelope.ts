import type { Sf2Region } from './Sf2Parser.ts';

export const SF2_SILENCE_CENTIBELS = 960;
export const SF2_SILENCE_GAIN = 10 ** (-SF2_SILENCE_CENTIBELS / 200);

export interface Sf2VolumeEnvelopePlan {
  readonly delaySeconds: number;
  readonly attackSeconds: number;
  readonly holdSeconds: number;
  readonly decaySeconds: number;
  readonly sustainAttenuationCentibels: number;
  readonly sustainGainFactor: number;
  readonly releaseSecondsFromFullScale: number;
}

export function buildSf2VolumeEnvelopePlan(
  region: Pick<
    Sf2Region,
    | 'delayVolEnv'
    | 'attackVolEnv'
    | 'holdVolEnv'
    | 'decayVolEnv'
    | 'sustainVolEnv'
    | 'releaseVolEnv'
    | 'keynumToVolEnvHold'
    | 'keynumToVolEnvDecay'
  >,
  note: number,
): Sf2VolumeEnvelopePlan {
  const midi = clamp(note, 0, 127);
  const sustainAttenuationCentibels = clamp(
    region.sustainVolEnv,
    0,
    SF2_SILENCE_CENTIBELS,
  );
  const holdTimecents = keyTrackedTimecents(
    region.holdVolEnv,
    region.keynumToVolEnvHold,
    midi,
  );
  const decayTimecents = keyTrackedTimecents(
    region.decayVolEnv,
    region.keynumToVolEnvDecay,
    midi,
  );
  const decaySecondsForFullAttenuation = timecentsToSeconds(decayTimecents);

  return {
    delaySeconds: timecentsToSeconds(region.delayVolEnv),
    attackSeconds: timecentsToSeconds(region.attackVolEnv),
    holdSeconds: timecentsToSeconds(holdTimecents),
    decaySeconds:
      decaySecondsForFullAttenuation
      * (sustainAttenuationCentibels / SF2_SILENCE_CENTIBELS),
    sustainAttenuationCentibels,
    sustainGainFactor: centibelsToGain(sustainAttenuationCentibels),
    releaseSecondsFromFullScale: timecentsToSeconds(region.releaseVolEnv),
  };
}

export function keyTrackedTimecents(
  baseTimecents: number,
  keynumScale: number,
  note: number,
): number {
  if (!Number.isFinite(baseTimecents)) return -32768;
  if (!Number.isFinite(keynumScale)) return baseTimecents;
  return baseTimecents + keynumScale * (60 - clamp(note, 0, 127));
}

export function timecentsToSeconds(timecents: number): number {
  if (!Number.isFinite(timecents) || timecents <= -32768) return 0;
  return clamp(2 ** (timecents / 1200), 0, 100);
}

export function centibelsToGain(centibels: number): number {
  if (!Number.isFinite(centibels)) return 1;
  return 10 ** (-Math.max(0, centibels) / 200);
}

export function decayGainFactor(
  sustainAttenuationCentibels: number,
  progress: number,
): number {
  const attenuation = clamp(
    sustainAttenuationCentibels,
    0,
    SF2_SILENCE_CENTIBELS,
  ) * clamp(progress, 0, 1);
  return centibelsToGain(attenuation);
}

export function releaseDurationSeconds(
  releaseSecondsFromFullScale: number,
  currentGain: number,
  peakGain: number,
): number {
  if (
    !Number.isFinite(releaseSecondsFromFullScale)
    || releaseSecondsFromFullScale <= 0
    || !Number.isFinite(currentGain)
    || !Number.isFinite(peakGain)
    || peakGain <= 0
  ) return 0;

  const relativeGain = clamp(currentGain / peakGain, SF2_SILENCE_GAIN, 1);
  const attenuationCentibels = clamp(
    -200 * Math.log10(relativeGain),
    0,
    SF2_SILENCE_CENTIBELS,
  );
  const remainingEnvelope = 1 - attenuationCentibels / SF2_SILENCE_CENTIBELS;
  return Math.max(0, releaseSecondsFromFullScale * remainingEnvelope);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
