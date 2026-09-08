class VirtualBandCalibrationMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.activeSessionId = 0;
    this.sumSquares = 0;
    this.peak = 0;
    this.frames = 0;
    this.channels = 0;
    this.targetFrames = Math.max(128, Math.round(sampleRate * 0.1));

    this.port.onmessage = (event) => {
      const message = event.data || {};
      const sessionId = Number(message.sessionId || 0);
      if (message.type === 'start' && sessionId > 0) {
        this.activeSessionId = sessionId;
        this.resetBlock();
      } else if (message.type === 'stop' && sessionId === this.activeSessionId) {
        this.emitBlock();
        this.port.postMessage({ type: 'stopped', sessionId });
        this.activeSessionId = 0;
        this.resetBlock();
      }
    };
  }

  process(inputs) {
    if (this.activeSessionId === 0) return true;
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;

    const frames = channels[0]?.length || 0;
    if (frames <= 0) return true;

    this.channels = Math.max(this.channels, channels.length);
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
      const channel = channels[channelIndex];
      for (let frame = 0; frame < channel.length; frame += 1) {
        const value = channel[frame] || 0;
        this.sumSquares += value * value;
        const absolute = Math.abs(value);
        if (absolute > this.peak) this.peak = absolute;
      }
    }

    this.frames += frames;
    if (this.frames >= this.targetFrames) this.emitBlock();
    return true;
  }

  emitBlock() {
    if (this.activeSessionId === 0 || this.frames <= 0 || this.channels <= 0) return;
    this.port.postMessage({
      type: 'block',
      sessionId: this.activeSessionId,
      sumSquares: this.sumSquares,
      peak: this.peak,
      frames: this.frames,
      channels: this.channels,
    });
    this.resetBlock();
  }

  resetBlock() {
    this.sumSquares = 0;
    this.peak = 0;
    this.frames = 0;
    this.channels = 0;
  }
}

registerProcessor('virtual-band-calibration-meter', VirtualBandCalibrationMeterProcessor);
