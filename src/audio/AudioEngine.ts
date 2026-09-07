export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly activeSources = new Set<AudioBufferSourceNode>();

  getContext(): AudioContext {
    if (this.context) return this.context;

    const Context = window.AudioContext;
    const context = new Context();
    const master = context.createGain();
    master.gain.value = 0.9;
    master.connect(context.destination);

    this.context = context;
    this.master = master;
    return context;
  }

  async resume(): Promise<void> {
    const context = this.getContext();
    if (context.state === 'suspended') await context.resume();
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.getContext().decodeAudioData(data.slice(0));
  }

  playBuffer(buffer: AudioBuffer, gain = 1, when?: number): void {
    const context = this.getContext();
    const master = this.master;
    if (!master) return;

    void this.resume();

    const source = context.createBufferSource();
    const voiceGain = context.createGain();
    source.buffer = buffer;
    voiceGain.gain.value = Math.max(0, Math.min(1, gain));
    source.connect(voiceGain).connect(master);

    this.activeSources.add(source);
    source.addEventListener('ended', () => {
      this.activeSources.delete(source);
      source.disconnect();
      voiceGain.disconnect();
    }, { once: true });

    source.start(when ?? context.currentTime);
  }

  stopAll(): void {
    for (const source of this.activeSources) {
      try { source.stop(); } catch {}
    }
    this.activeSources.clear();
  }

  dispose(): void {
    this.stopAll();
    this.master?.disconnect();
    this.master = null;

    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close();
  }
}
