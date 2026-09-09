import {
  DEFAULT_AUDIO_MASTER_GAIN,
} from '../AudioEngine';
import { dbToGain } from '../AudioMixProfile';
import { CalibrationAudioRuntime, type CalibrationAudioSource } from './CalibrationAudioRuntime';
import { CalibrationMeter } from './CalibrationMeter';
import {
  calibrationTarget,
  currentCalibrationMix,
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
  readonly currentInstrumentTrimDb: number;
  readonly currentProgramTrimDb: number;
  readonly currentTrimDb: number;
  readonly metrics: CalibrationMetrics;
}

export interface CalibrationRunProgress {
  readonly phase: 'prepare' | 'measure' | 'tail';
  readonly target: CalibrationTarget;
  readonly detail: string;
  readonly step?: number;
  readonly total?: number;
}

export type CalibrationProgressListener = (progress: CalibrationRunProgress) => void;

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
      const mix = currentCalibrationMix(target);

      return {
        targetId: target.id,
        label: target.label,
        source,
        currentInstrumentTrimDb: mix.instrumentTrimDb,
        currentProgramTrimDb: mix.programTrimDb,
        currentTrimDb: mix.effectiveTrimDb,
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

  /**
   * Auditioning deliberately accepts a plain dB compensation rather than a
   * calibration policy object. The harness owns audio resources; the pure
   * CalibrationPlan module owns recommendation policy.
   */
  async audition(
    targetId: string,
    adjustmentDb = 0,
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertAlive();
    const target = calibrationTarget(targetId);
    await this.runtime.audio.resume();
    await this.runtime.prepare(target);
    throwIfAborted(signal);

    this.runtime.resetAll();
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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Calibration run aborted', 'AbortError');
}
