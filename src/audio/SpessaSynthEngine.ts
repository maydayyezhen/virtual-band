import { WorkletSynthesizer } from 'spessasynth_lib';
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';

/** Shared implementation for file playback and live playing; each owns its MIDI state. */
export class SpessaSynthEngine {
  synth: WorkletSynthesizer | null = null;
  private preparing: Promise<WorkletSynthesizer> | null = null;
  private disposed = false;
  private readonly abort = new AbortController();

  constructor(readonly context: AudioContext, private readonly output: AudioNode = context.destination) {}

  prepare(): Promise<WorkletSynthesizer> {
    if (this.disposed) return Promise.reject(new Error('音源已关闭'));
    return this.preparing ??= this.initialize().catch((error) => {
      this.synth?.destroy();
      this.synth = null;
      this.preparing = null;
      throw error;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.synth?.destroy();
    this.synth = null;
  }

  private async initialize(): Promise<WorkletSynthesizer> {
    await this.context.audioWorklet.addModule(processorUrl);
    this.assertAlive();
    const synth = new WorkletSynthesizer(this.context);
    this.synth = synth;
    synth.connect(this.output);
    synth.setLogLevel(false, true, false);
    const response = await fetch('/soundfonts/FluidR3_GM.sf2', { signal: this.abort.signal });
    if (!response.ok) throw new Error(`音源载入失败：HTTP ${response.status}`);
    const font = await response.arrayBuffer();
    this.assertAlive();
    await synth.isReady;
    await synth.soundBankManager.addSoundBank(font, 'gm');
    this.assertAlive();
    return synth;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('音源已关闭');
  }
}
