import { keyTrackedTimecents, timecentsToSeconds } from './Sf2Envelope.ts';
import type { Sf2Region } from './Sf2Parser.ts';

const DEFAULT_VELOCITY_ATTENUATION_CENTIBELS = 960;
const MAX_BROWSER_TREMOLO_DB = 18;

export interface Sf2ModEnvelopePlan {
  readonly delaySeconds: number;
  readonly attackSeconds: number;
  readonly holdSeconds: number;
  readonly decaySeconds: number;
  readonly sustainLevel: number;
  readonly releaseSeconds: number;
}

export interface Sf2LfoPlan {
  readonly modDelaySeconds: number;
  readonly modFrequencyHz: number;
  readonly modToPitchCents: number;
  readonly modToFilterCents: number;
  readonly modToVolumeCentibels: number;
  readonly vibDelaySeconds: number;
  readonly vibFrequencyHz: number;
  readonly vibToPitchCents: number;
}

export interface Sf2LfoRuntime {
  stop(atTime: number): void;
  disconnect(): void;
}

interface ScheduledOscillator {
  readonly node: OscillatorNode;
  readonly startTime: number;
}

export function buildSf2ModEnvelopePlan(
  region: Pick<
    Sf2Region,
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
): Sf2ModEnvelopePlan {
  const midi = clamp(note, 0, 127);
  const holdTc = keyTrackedTimecents(region.holdModEnv, region.keynumToModEnvHold, midi);
  const decayTc = keyTrackedTimecents(region.decayModEnv, region.keynumToModEnvDecay, midi);
  return {
    delaySeconds: timecentsToSeconds(region.delayModEnv),
    attackSeconds: timecentsToSeconds(region.attackModEnv),
    holdSeconds: timecentsToSeconds(holdTc),
    decaySeconds: timecentsToSeconds(decayTc),
    sustainLevel: 1 - clamp(region.sustainModEnv, 0, 1000) / 1000,
    releaseSeconds: timecentsToSeconds(region.releaseModEnv),
  };
}

export function scheduleSf2ModEnvelope(
  param: AudioParam,
  plan: Sf2ModEnvelopePlan,
  depth: number,
  startTime: number,
  base = 0,
): void {
  const peak = base + depth;
  const sustain = base + depth * plan.sustainLevel;
  const attackStart = startTime + plan.delaySeconds;
  const attackEnd = attackStart + plan.attackSeconds;
  const holdEnd = attackEnd + plan.holdSeconds;
  const decayEnd = holdEnd + plan.decaySeconds;

  param.cancelScheduledValues(startTime);
  param.setValueAtTime(base, startTime);
  if (plan.delaySeconds > 0.001) param.setValueAtTime(base, attackStart);

  if (plan.attackSeconds > 0.001) {
    param.linearRampToValueAtTime(peak, attackEnd);
  } else {
    param.setValueAtTime(peak, attackStart);
  }

  param.setValueAtTime(peak, holdEnd);
  if (plan.decaySeconds > 0.001) {
    param.linearRampToValueAtTime(sustain, decayEnd);
  } else {
    param.setValueAtTime(sustain, holdEnd);
  }
}

export function releaseSf2ModEnvelope(
  param: AudioParam,
  plan: Sf2ModEnvelopePlan,
  depth: number,
  startTime: number,
  now: number,
  forcedReleaseSeconds?: number,
  base = 0,
): number {
  const currentLevel = modEnvelopeLevelAt(plan, Math.max(0, now - startTime));
  const currentValue = base + depth * currentLevel;
  const release = clamp(forcedReleaseSeconds ?? plan.releaseSeconds, 0.005, 30);

  param.cancelScheduledValues(now);
  param.setValueAtTime(currentValue, now);
  if (release > 0.001) {
    param.linearRampToValueAtTime(base, now + release);
  } else {
    param.setValueAtTime(base, now);
  }
  return release;
}

export function modEnvelopeLevelAt(plan: Sf2ModEnvelopePlan, elapsedSeconds: number): number {
  const elapsed = Math.max(0, elapsedSeconds);
  if (elapsed < plan.delaySeconds) return 0;

  const afterDelay = elapsed - plan.delaySeconds;
  if (plan.attackSeconds > 0.001 && afterDelay < plan.attackSeconds) {
    return clamp(afterDelay / plan.attackSeconds, 0, 1);
  }

  const holdEnd = plan.attackSeconds + plan.holdSeconds;
  if (afterDelay < holdEnd) return 1;

  const decayEnd = holdEnd + plan.decaySeconds;
  if (plan.decaySeconds > 0.001 && afterDelay < decayEnd) {
    const t = clamp((afterDelay - holdEnd) / plan.decaySeconds, 0, 1);
    return 1 + (plan.sustainLevel - 1) * t;
  }

  return plan.sustainLevel;
}

export function buildSf2LfoPlan(
  region: Pick<
    Sf2Region,
    | 'modLfoToPitch'
    | 'vibLfoToPitch'
    | 'modLfoToFilterFc'
    | 'modLfoToVolume'
    | 'delayModLFO'
    | 'freqModLFO'
    | 'delayVibLFO'
    | 'freqVibLFO'
  >,
): Sf2LfoPlan {
  return {
    modDelaySeconds: timecentsToSeconds(region.delayModLFO),
    modFrequencyHz: clamp(absoluteCentsToHz(region.freqModLFO), 0.01, 100),
    modToPitchCents: clamp(region.modLfoToPitch, -12000, 12000),
    modToFilterCents: clamp(region.modLfoToFilterFc, -12000, 12000),
    modToVolumeCentibels: clamp(region.modLfoToVolume, -960, 960),
    vibDelaySeconds: timecentsToSeconds(region.delayVibLFO),
    vibFrequencyHz: clamp(absoluteCentsToHz(region.freqVibLFO), 0.01, 100),
    vibToPitchCents: clamp(region.vibLfoToPitch, -12000, 12000),
  };
}

export function startSf2Lfos(
  context: BaseAudioContext,
  source: AudioBufferSourceNode,
  filter: BiquadFilterNode,
  volumeModGain: GainNode,
  plan: Sf2LfoPlan,
  startTime: number,
): Sf2LfoRuntime {
  const oscillators: ScheduledOscillator[] = [];
  const supportNodes: AudioNode[] = [];
  volumeModGain.gain.setValueAtTime(1, startTime);

  if (
    Math.abs(plan.modToPitchCents) > 0.001
    || Math.abs(plan.modToFilterCents) > 0.001
    || Math.abs(plan.modToVolumeCentibels) > 0.001
  ) {
    const oscillator = context.createOscillator();
    const oscillatorStart = startTime + plan.modDelaySeconds;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(plan.modFrequencyHz, startTime);
    oscillators.push({ node: oscillator, startTime: oscillatorStart });

    if (Math.abs(plan.modToPitchCents) > 0.001) {
      const depth = context.createGain();
      depth.gain.setValueAtTime(plan.modToPitchCents, startTime);
      oscillator.connect(depth).connect(source.detune);
      supportNodes.push(depth);
    }

    if (Math.abs(plan.modToFilterCents) > 0.001) {
      const depth = context.createGain();
      depth.gain.setValueAtTime(plan.modToFilterCents, startTime);
      oscillator.connect(depth).connect(filter.detune);
      supportNodes.push(depth);
    }

    if (Math.abs(plan.modToVolumeCentibels) > 0.001) {
      const curve = context.createWaveShaper();
      curve.curve = buildTremoloGainOffsetCurve(plan.modToVolumeCentibels);
      curve.oversample = 'none';
      oscillator.connect(curve).connect(volumeModGain.gain);
      supportNodes.push(curve);
    }

    oscillator.start(oscillatorStart);
  }

  if (Math.abs(plan.vibToPitchCents) > 0.001) {
    const oscillator = context.createOscillator();
    const depth = context.createGain();
    const oscillatorStart = startTime + plan.vibDelaySeconds;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(plan.vibFrequencyHz, startTime);
    depth.gain.setValueAtTime(plan.vibToPitchCents, startTime);
    oscillator.connect(depth).connect(source.detune);
    oscillators.push({ node: oscillator, startTime: oscillatorStart });
    supportNodes.push(depth);
    oscillator.start(oscillatorStart);
  }

  return {
    stop(atTime: number): void {
      for (const oscillator of oscillators) {
        // A short voice may be released before a delayed LFO has started. Web
        // Audio rejects stop times before the scheduled start, so clamp it.
        const safeStopTime = Math.max(atTime, oscillator.startTime + 0.001);
        try { oscillator.node.stop(safeStopTime); } catch {}
      }
    },
    disconnect(): void {
      for (const oscillator of oscillators) oscillator.node.disconnect();
      for (const node of supportNodes) node.disconnect();
    },
  };
}

export function velocityAttenuationCentibels(velocity: number): number {
  const midi = clamp(Math.round(velocity), 0, 127);
  if (midi <= 0) return DEFAULT_VELOCITY_ATTENUATION_CENTIBELS;
  // SF2's implicit Note-On velocity -> initial attenuation modulator is a
  // negative-unipolar concave source with amount 960 cB. Under the standard
  // 96 dB concave convention this is the familiar near-square-law amplitude
  // response. For example, velocity 111 is ~2.34 dB below velocity 127.
  return clamp(
    -400 * Math.log10(midi / 127),
    0,
    DEFAULT_VELOCITY_ATTENUATION_CENTIBELS,
  );
}

export function absoluteCentsToHz(cents: number): number {
  return 8.176 * 2 ** (cents / 1200);
}

function buildTremoloGainOffsetCurve(depthCentibels: number): Float32Array<ArrayBuffer> {
  const samples = 257;
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  const requestedDb = depthCentibels / 10;
  const safeDb = clamp(requestedDb, -MAX_BROWSER_TREMOLO_DB, MAX_BROWSER_TREMOLO_DB);
  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    const gain = 10 ** ((x * safeDb) / 20);
    curve[index] = clamp(gain - 1, -0.999, 7);
  }
  return curve;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
