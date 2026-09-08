import type { AudioEngine, AudioVoice } from './AudioEngine';
import { mixGain } from './AudioMixProfile';
import type { KeyboardTier } from '../instruments/keyboard/legacyKeyboardAsset';
import type { KeyboardToneBackend } from './KeyboardToneBackend';
import { fluidR3SamplePath, type SampleLibrary } from './SampleLibrary';

const SAMPLE_SET: Record<KeyboardTier, string> = {
  lower: 'acoustic_grand_piano',
  upper: 'pad_2_warm',
};
const COMMON_NOTES = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72] as const;

type VoiceBackend = 'mp3' | 'tone';

interface VoiceState {
  voice: AudioVoice | null;
  released: boolean;
  backend: VoiceBackend;
  tier: KeyboardTier;
}

export class KeyboardSampler {
  private readonly audio: AudioEngine;
  private readonly samples: SampleLibrary;
  private readonly toneBackend: KeyboardToneBackend | null;
  private readonly voices = new Map<string, VoiceState>();
  private readonly sustain: Record<KeyboardTier, boolean> = { lower: false, upper: false };

  constructor(
    audio: AudioEngine,
    samples: SampleLibrary,
    toneBackend: KeyboardToneBackend | null = null,
  ) {
    this.audio = audio;
    this.samples = samples;
    this.toneBackend = toneBackend;
    this.toneBackend?.setGain('lower', keyboardGain('lower'), 0);
    this.toneBackend?.setGain('upper', keyboardGain('upper'), 0);
  }

  noteOn(tier: KeyboardTier, note: number, velocity: number, source = 'runtime'): void {
    if (!Number.isInteger(note) || note < 0 || note > 127) return;
    const id = voiceId(tier, note, source);
    this.stopVoice(id, 0.015);

    if (this.toneBackend?.noteOn(tier, id, note, velocity)) {
      this.voices.set(id, {
        voice: null,
        released: false,
        backend: 'tone',
        tier,
      });
      return;
    }

    const state: VoiceState = {
      voice: null,
      released: false,
      backend: 'mp3',
      tier,
    };
    this.voices.set(id, state);
    const gain = Math.pow(clamp01(velocity / 127), 1.35) * keyboardGain(tier);

    void this.load(tier, note).then((buffer) => {
      if (!buffer || this.voices.get(id) !== state) return;
      if (state.released && !this.sustain[tier]) {
        this.voices.delete(id);
        return;
      }
      state.voice = this.audio.playBuffer(buffer, gain);
      if (state.released && !this.sustain[tier]) this.stopVoice(id, 0.06);
    });
  }

  noteOff(tier: KeyboardTier, note: number, source = 'runtime'): void {
    const id = voiceId(tier, note, source);
    const state = this.voices.get(id);
    if (!state) return;
    state.released = true;

    if (state.backend === 'tone') {
      this.voices.delete(id);
      this.toneBackend?.noteOff(tier, id);
      return;
    }

    if (!this.sustain[tier]) this.stopVoice(id, tier === 'lower' ? 0.08 : 0.12);
  }

  setSustain(tier: KeyboardTier, pressed: boolean): void {
    if (this.sustain[tier] === pressed) return;
    this.sustain[tier] = pressed;
    this.toneBackend?.setSustain(tier, pressed);
    if (pressed) return;

    const prefix = `${tier}:`;
    for (const [id, state] of this.voices) {
      if (state.backend === 'mp3' && id.startsWith(prefix) && state.released) {
        this.stopVoice(id, tier === 'lower' ? 0.10 : 0.16);
      }
    }
  }

  setPitchBend(tier: KeyboardTier, value: number): boolean {
    return this.toneBackend?.setPitchBend(tier, value) ?? false;
  }

  async preloadCommon(): Promise<void> {
    await Promise.allSettled([
      this.samples.preload([
        ...COMMON_NOTES.map((note) => fluidR3SamplePath(SAMPLE_SET.lower, note)),
        ...COMMON_NOTES.map((note) => fluidR3SamplePath(SAMPLE_SET.upper, note)),
      ]),
      this.toneBackend?.prepare() ?? Promise.resolve(false),
    ]);
  }

  reset(): void {
    this.sustain.lower = false;
    this.sustain.upper = false;
    this.toneBackend?.reset();
    for (const id of [...this.voices.keys()]) this.stopVoice(id, 0.025);
  }

  dispose(): void {
    this.reset();
    this.toneBackend?.dispose();
  }

  private stopVoice(id: string, fadeSeconds: number): void {
    const state = this.voices.get(id);
    if (!state) return;
    this.voices.delete(id);

    if (state.backend === 'tone') {
      this.toneBackend?.noteOff(state.tier, id);
      return;
    }

    state.voice?.stop(fadeSeconds);
  }

  private load(tier: KeyboardTier, note: number): Promise<AudioBuffer | null> {
    return this.samples.load(fluidR3SamplePath(SAMPLE_SET[tier], note));
  }
}

function keyboardGain(tier: KeyboardTier): number {
  return mixGain(tier === 'lower' ? 'keyboard.lower' : 'keyboard.upper');
}

function voiceId(tier: KeyboardTier, note: number, source: string): string {
  return `${tier}:${note}:${source}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
