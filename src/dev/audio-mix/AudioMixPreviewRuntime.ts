import { dbToGain } from '../../audio/AudioMixProfile';
import { DEFAULT_AUDIO_MASTER_GAIN } from '../../audio/AudioEngine';
import { CalibrationAudioRuntime } from '../../audio/calibration/CalibrationAudioRuntime';
import { runAuditionSequence } from '../../audio/calibration/CalibrationSequences';
import type { CalibrationTarget } from '../../audio/calibration/CalibrationTargets';

/**
 * Isolated audio runtime for the mix-tuning page.
 *
 * Production sampler calibration remains untouched. The tuner previews a draft
 * config by applying only the dB delta between saved and draft effective trim at
 * the isolated runtime master. That keeps live audition exact without teaching
 * every production sampler about editor state.
 */
export class AudioMixPreviewRuntime {
  private readonly runtime = new CalibrationAudioRuntime();
  private runAbort: AbortController | null = null;
  private disposed = false;

  setPreviewDeltaDb(deltaDb: number): void {
    if (this.disposed) return;
    const gain = DEFAULT_AUDIO_MASTER_GAIN * dbToGain(deltaDb);
    this.runtime.audio.setMasterGain(gain, 0.02);
  }

  async audition(target: CalibrationTarget, deltaDb: number): Promise<void> {
    if (this.disposed) throw new Error('Audio mix preview runtime is disposed');
    this.stop();
    const abort = new AbortController();
    this.runAbort = abort;
    this.runtime.resetAll();
    await this.runtime.prepare(target);
    if (abort.signal.aborted) return;
    this.setPreviewDeltaDb(deltaDb);

    try {
      await runAuditionSequence(this.runtime, target, abort.signal);
    } finally {
      if (this.runAbort === abort) this.runAbort = null;
    }
  }

  stop(): void {
    this.runAbort?.abort();
    this.runAbort = null;
    this.runtime.resetAll();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.runtime.dispose();
  }
}
