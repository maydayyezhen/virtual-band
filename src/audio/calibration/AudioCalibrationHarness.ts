import {
  DEFAULT_AUDIO_MASTER_GAIN,
} from '../AudioEngine';
import { dbToGain } from '../AudioMixProfile';
import { CalibrationAudioRuntime, type CalibrationAudioSource } from './CalibrationAudioRuntime';
import { CalibrationMeter } from './CalibrationMeter';
import {
  calibrationTarget,
  currentCalibrationTrimDb,
  type CalibrationTarget,
} from './CalibrationTargets';
import {
  runAuditionSequence,
  runCalibrationSequence,
  wait,
  type CalibrationSequenceProgress,
} from './CalibrationSequences';
import type { CalibrationMetrics } from './LoudnessMath';

export interface AudioCalibrationResult {
  readonly targetId: string;
  readonly label: string;
  readonly source: CalibrationAudioSource;
  readonly currentTrimDb: number;
  readonly metrics: CalibrationMetrics;
}

export interface CalibrationRecommendation {
  readonly referenceLufs: number;
  readonly adjustmentDb: number;
  readonly suggestedTrimDb: number;
}

export interface CalibrationRunProgress {
  readonly phase: 'prepare' | 'measure' | 'tail';
  readonly target: CalibrationTarget;
  readonly detail: string;
  readonly step?: number;
  readonly total?: number;
}

export type CalibrationProgressListener = (progress: CalibrationRunProgress) => void;

const MAX_SINGLE_PASS_ADJUSTMENT_DB = 6;

export class AudioCalibrationHarness {
  readonly runtime = new CalibrationAudioRuntime();
  private readonly meter = new CalibrationMeter(this.runtime.audio);
  private disposed = false;

  async runTarget(
    targetId: string,
    options: {
      signal?: AbortSignal;
      onProgress?: CalibrationProgressListener;
    } = {},
  ): Promise<AudioCalibrationResult> {
    this.assertAlive();
    const target = calibrationTarget(targetId);
    const { signal, onProgress } = options;

    onProgress?.({
      phase: 'prepare',
      target,
      detail: 'Preparing real sampler / SF2 path…',
    });

    await this.runtime.audio.resume();
    const source = await this.runtime.prepare(target);
    throwIfAborted(signal);

    this.runtime.resetAll();
    this.runtime.audio.setMasterGain(DEFAULT_AUDIO_MASTER_GAIN, 0);
    await wait(140, signal);

    onProgress?.({
      phase: 'measure',
      target,
      detail: 'Starting pre-master loudness capture…',
    });

    await this.meter.start();
    let meterRunning = true;
    try {
      await runCalibrationSequence(
        this.runtime,
        target,
        signal,
        (sequence) => onProgress?.(sequenceProgress(target, sequence)),
      );

      onProgress?.({
        phase: 'tail',
        target,
        detail: 'Capturing release tail…',
      });
      await wait(target.tailSeconds * 1000, signal);

      const metrics = await this.meter.stop();
      meterRunning = false;

      return {
        targetId: target.id,
        label: target.label,
        source,
        currentTrimDb: currentCalibrationTrimDb(target),
        metrics,
      };
    } finally {
      if (meterRunning) {
        try { await this.meter.stop(); } catch {}
      }
      this.runtime.resetAll();
      this.runtime.audio.setMasterGain(DEFAULT_AUDIO_MASTER_GAIN, 0.02);
    }
  }

  async audition(
    targetId: string,
    mode: 'current' | 'suggested',
    result?: AudioCalibrationResult,
    referenceLufs = -22,
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertAlive();
    const target = calibrationTarget(targetId);
    await this.runtime.audio.resume();
    await this.runtime.prepare(target);
    throwIfAborted(signal);

    this.runtime.resetAll();
    const recommendation = result?.targetId === targetId
      ? recommendCalibration(result, referenceLufs)
      : null;
    const adjustmentDb = mode === 'suggested' ? recommendation?.adjustmentDb ?? 0 : 0;
    this.runtime.audio.setMasterGain(
      DEFAULT_AUDIO_MASTER_GAIN * dbToGain(adjustmentDb),
      0.02,
    );

    try {
      await runAuditionSequence(this.runtime, target, signal);
    } finally {
      await wait(80).catch(() => {});
      this.runtime.resetAll();
      this.runtime.audio.setMasterGain(DEFAULT_AUDIO_MASTER_GAIN, 0.03);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.meter.dispose();
    this.runtime.dispose();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Audio calibration harness is disposed');
  }
}

export function recommendCalibration(
  result: Pick<AudioCalibrationResult, 'currentTrimDb' | 'metrics'>,
  referenceLufs: number,
): CalibrationRecommendation {
  const reference = normalizeReference(referenceLufs);
  const measuredLufs = result.metrics.integratedLufs;
  if (!Number.isFinite(measuredLufs)) {
    return {
      referenceLufs: reference,
      adjustmentDb: 0,
      suggestedTrimDb: result.currentTrimDb,
    };
  }

  const desired = clamp(
    reference - measuredLufs,
    -MAX_SINGLE_PASS_ADJUSTMENT_DB,
    MAX_SINGLE_PASS_ADJUSTMENT_DB,
  );
  // Keep the same headroom invariant as AudioMixProfile: calibration itself
  // never boosts above unity. If a target needs more than 0 dB, lower the
  // ensemble reference or attenuate louder peers instead.
  const suggestedTrimDb = Math.min(0, result.currentTrimDb + desired);
  return {
    referenceLufs: reference,
    adjustmentDb: suggestedTrimDb - result.currentTrimDb,
    suggestedTrimDb,
  };
}

function sequenceProgress(
  target: CalibrationTarget,
  progress: CalibrationSequenceProgress,
): CalibrationRunProgress {
  return {
    phase: 'measure',
    target,
    detail: progress.label,
    step: progress.step,
    total: progress.total,
  };
}

function normalizeReference(value: number): number {
  if (!Number.isFinite(value)) return -22;
  return clamp(value, -36, -12);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Calibration run aborted', 'AbortError');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
