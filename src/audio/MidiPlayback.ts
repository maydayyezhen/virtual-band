import { Sequencer } from 'spessasynth_lib';
import { SpessaSynthEngine } from './SpessaSynthEngine';

/** Original MIDI bytes go straight to SpessaSynth; no stage or instrument policy here. */
export class MidiPlayback {
  private readonly engine: SpessaSynthEngine;
  private get synth() { return this.engine.synth; }
  private sequencer: Sequencer | null = null;
  private preparing: Promise<void> | null = null;
  private disposed = false;
  private loading = false;
  private playRequest = 0;
  private readonly ended = new Set<() => void>();
  private cancelLoad: (() => void) | null = null;

  constructor(private readonly context: AudioContext, output: AudioNode = context.destination) {
    this.engine = new SpessaSynthEngine(context, output);
  }

  get time(): number { return Math.max(0, Math.min(this.total, this.sequencer?.currentTime ?? 0)); }
  get total(): number { return this.sequencer?.duration ?? 0; }
  get isPlaying(): boolean {
    return !this.loading && !!this.sequencer && !this.sequencer.paused && !this.sequencer.isFinished;
  }
  onEnded(listener: () => void): () => void {
    this.ended.add(listener);
    return () => this.ended.delete(listener);
  }

  async load(binary: ArrayBuffer, fileName: string): Promise<void> {
    if (this.disposed) throw new Error('播放器已关闭');
    if (this.loading) throw new Error('正在载入另一首 MIDI');
    this.pause();
    this.loading = true;
    try {
      await this.prepare();
      const seq = this.sequencer!;
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error): void => {
          clearTimeout(timer);
          seq.eventHandler.removeEvent('songChange', 'load');
          seq.eventHandler.removeEvent('midiError', 'load');
          this.cancelLoad = null;
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(() => finish(new Error('MIDI 载入超时，请重试')), 30000);
        this.cancelLoad = () => finish(new Error('播放器已关闭'));
        seq.eventHandler.addEvent('songChange', 'load', () => finish());
        seq.eventHandler.addEvent('midiError', 'load', (error) => finish(error));
        try { seq.loadNewSongList([{ binary: binary.slice(0), fileName }]); }
        catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      });
      seq.loopCount = 0;
    } finally { this.loading = false; }
  }

  async play(): Promise<void> {
    if (this.disposed || this.loading || !this.sequencer?.midiData || this.isPlaying) return;
    const request = ++this.playRequest;
    await this.context.resume();
    if (this.disposed || this.loading || request !== this.playRequest) return;
    if (this.sequencer.isFinished) this.sequencer.currentTime = 0;
    this.sequencer.play();
  }
  pause(): void { this.playRequest++; this.sequencer?.pause(); }
  stop(): void { this.pause(); if (this.sequencer) this.sequencer.currentTime = 0; }
  seek(seconds: number): void {
    if (this.sequencer && Number.isFinite(seconds))
      this.sequencer.currentTime = Math.max(0, Math.min(this.total, seconds));
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLoad?.();
    this.pause();
    this.ended.clear();
    this.engine.dispose();
    this.sequencer = null;
  }
  private async prepare(): Promise<void> {
    if (this.preparing) return this.preparing;
    this.preparing = this.initialize().catch((error) => {
      this.sequencer = null;
      this.preparing = null;
      throw error;
    });
    return this.preparing;
  }
  private async initialize(): Promise<void> {
    const synth = await this.engine.prepare();
    if (this.disposed) throw new Error('播放器已关闭');
    const seq = new Sequencer(synth, { skipToFirstNoteOn: false });
    seq.loopCount = 0;
    seq.eventHandler.addEvent('songEnded', 'playback', () => {
      for (const listener of this.ended) listener();
    });
    this.sequencer = seq;
  }
}
