import type { AudioEngine } from '../audio/AudioEngine';
import type { ScreenAudio } from './ScreenContent';

/** A read-only branch of the existing mix, including MIDI and live instruments. */
export class ScreenAudioTap {
  private readonly analyser: AnalyserNode;
  private readonly disconnect: () => void;
  private readonly waveform = new Float32Array(1024);
  private readonly decibels = new Float32Array(512);
  private readonly spectrum = new Float32Array(512);
  private readonly data: ScreenAudio = { waveform: this.waveform, spectrum: this.spectrum };
  constructor(audio: AudioEngine) {
    this.analyser = audio.getContext().createAnalyser(); this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = .65;
    this.disconnect = audio.connectMixTap(this.analyser);
  }
  sample(): ScreenAudio {
    this.analyser.getFloatTimeDomainData(this.waveform);
    this.analyser.getFloatFrequencyData(this.decibels);
    for (let i = 0; i < this.spectrum.length; i++) this.spectrum[i] = Math.max(0, Math.min(1, (this.decibels[i] + 90) / 70));
    return this.data;
  }
  dispose(): void { this.disconnect(); this.analyser.disconnect(); }
}
