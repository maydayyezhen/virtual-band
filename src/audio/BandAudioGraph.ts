import { AudioEngine } from './AudioEngine';
import { LiveAudioEngine } from './LiveAudioEngine';

/** Audio resources belong to the host; each instrument owns only its live channel leases. */
export interface BandAudioGraph {
  readonly audio: AudioEngine;
  readonly live: LiveAudioEngine;
  prepare(): Promise<void>;
  dispose(): void;
}

export function createBandAudioGraph(): BandAudioGraph {
  const audio = new AudioEngine();
  const output = audio.createBus(1);
  const live = new LiveAudioEngine(audio.getContext(), output.input);
  return {
    audio, live,
    prepare: () => live.prepare(),
    dispose(): void { live.dispose(); output.disconnect(); audio.dispose(); },
  };
}
