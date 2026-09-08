export interface AudioVoice {
  setGain(value: number, rampSeconds?: number): void;
  setPlaybackRate(value: number, rampSeconds?: number): void;
  stop(fadeSeconds?: number, delaySeconds?: number): void;
  onEnded(listener: () => void): () => void;
}

export interface AudioBus {
  readonly input: GainNode;
  setGain(value: number, rampSeconds?: number): void;
  disconnect(): void;
}

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

  createBus(gain = 1): AudioBus {
    const context = this.getContext();
    const master = this.master;
    if (!master) throw new Error('Audio master is unavailable');

    const input = context.createGain();
    input.gain.value = clamp01(gain);
    input.connect(master);
    let connected = true;

    return {
      input,
      setGain: (value, rampSeconds = 0) => {
        if (!connected) return;
        const now = context.currentTime;
        const next = clamp01(value);
        const ramp = Math.max(0, rampSeconds);
        input.gain.cancelScheduledValues(now);
        input.gain.setValueAtTime(input.gain.value, now);
        if (ramp > 0) input.gain.linearRampToValueAtTime(next, now + ramp);
        else input.gain.setValueAtTime(next, now);
      },
      disconnect: () => {
        if (!connected) return;
        connected = false;
        input.disconnect();
      },
    };
  }

  async resume(): Promise<void> {
    const context = this.getContext();
    if (context.state === 'suspended') await context.resume();
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.getContext().decodeAudioData(data.slice(0));
  }

  playBuffer(buffer: AudioBuffer, gain = 1, when?: number, destination?: AudioNode): AudioVoice | null {
    const context = this.getContext();
    const master = this.master;
    if (!master) return null;

    void this.resume();

    const source = context.createBufferSource();
    const voiceGain = context.createGain();
    const endedListeners = new Set<() => void>();
    const startAt = when ?? context.currentTime;
    let cleaned = false;

    source.buffer = buffer;
    voiceGain.gain.value = clamp01(gain);
    source.connect(voiceGain).connect(destination ?? master);

    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      this.activeSources.delete(source);
      source.disconnect();
      voiceGain.disconnect();
      for (const listener of endedListeners) listener();
      endedListeners.clear();
    };

    const voice: AudioVoice = {
      setGain: (value, rampSeconds = 0) => {
        if (cleaned) return;
        const now = context.currentTime;
        const next = clamp01(value);
        const ramp = Math.max(0, rampSeconds);
        voiceGain.gain.cancelScheduledValues(now);
        voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
        if (ramp > 0) voiceGain.gain.linearRampToValueAtTime(next, now + ramp);
        else voiceGain.gain.setValueAtTime(next, now);
      },
      setPlaybackRate: (value, rampSeconds = 0) => {
        if (cleaned) return;
        const now = context.currentTime;
        const next = clampPlaybackRate(value);
        const ramp = Math.max(0, rampSeconds);
        source.playbackRate.cancelScheduledValues(now);
        source.playbackRate.setValueAtTime(source.playbackRate.value, now);
        if (ramp > 0) source.playbackRate.linearRampToValueAtTime(next, now + ramp);
        else source.playbackRate.setValueAtTime(next, now);
      },
      stop: (fadeSeconds = 0, delaySeconds = 0) => {
        if (cleaned) return;
        const now = context.currentTime;
        const delay = Math.max(0, delaySeconds);
        const fade = Math.max(0, fadeSeconds);
        const fadeStart = Math.max(now, startAt) + delay;
        const stopAt = fadeStart + fade;

        voiceGain.gain.cancelScheduledValues(now);
        voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
        if (fadeStart > now) voiceGain.gain.setValueAtTime(voiceGain.gain.value, fadeStart);
        if (fade > 0) voiceGain.gain.linearRampToValueAtTime(0, stopAt);
        else voiceGain.gain.setValueAtTime(0, fadeStart);

        try {
          // AudioBufferSourceNode.stop() may be rescheduled before the source ends.
          // That lets a later hi-hat pedal close override a previously scheduled tail.
          source.stop(stopAt + 0.005);
        } catch {}
      },
      onEnded: (listener) => {
        if (cleaned) {
          listener();
          return () => {};
        }
        endedListeners.add(listener);
        return () => endedListeners.delete(listener);
      },
    };

    this.activeSources.add(source);
    source.addEventListener('ended', cleanup, { once: true });
    source.start(startAt);
    return voice;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampPlaybackRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.125, Math.min(8, value));
}
