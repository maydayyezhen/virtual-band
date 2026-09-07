import type { AudioEngine, AudioVoice } from './AudioEngine';
import type { KeyboardTier } from '../instruments/keyboard/legacyKeyboardAsset';

const SAMPLE_BASE: Record<KeyboardTier, string> = {
  lower: 'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/',
  upper: 'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/pad_2_warm-mp3/',
};

interface VoiceState {
  voice: AudioVoice | null;
  released: boolean;
}

export class KeyboardSampler {
  private readonly audio: AudioEngine;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Map<string, VoiceState>();
  private readonly sustain: Record<KeyboardTier, boolean> = { lower: false, upper: false };

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  noteOn(tier: KeyboardTier, note: number, velocity: number, source = 'runtime'): void {
    if (!Number.isInteger(note) || note < 0 || note > 127) return;
    const id = voiceId(tier, note, source);
    this.stopVoice(id, 0.015);

    const state: VoiceState = { voice: null, released: false };
    this.voices.set(id, state);
    const gain = Math.pow(clamp01(velocity / 127), 1.35) * (tier === 'lower' ? 0.82 : 0.68);

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
    if (!this.sustain[tier]) this.stopVoice(id, tier === 'lower' ? 0.08 : 0.12);
  }

  setSustain(tier: KeyboardTier, pressed: boolean): void {
    if (this.sustain[tier] === pressed) return;
    this.sustain[tier] = pressed;
    if (pressed) return;

    const prefix = `${tier}:`;
    for (const [id, state] of this.voices) {
      if (id.startsWith(prefix) && state.released) this.stopVoice(id, tier === 'lower' ? 0.10 : 0.16);
    }
  }

  async preloadCommon(): Promise<void> {
    const notes = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72];
    await Promise.allSettled([
      ...notes.map((note) => this.load('lower', note)),
      ...notes.map((note) => this.load('upper', note)),
    ]);
  }

  reset(): void {
    this.sustain.lower = false;
    this.sustain.upper = false;
    for (const id of [...this.voices.keys()]) this.stopVoice(id, 0.025);
  }

  private stopVoice(id: string, fadeSeconds: number): void {
    const state = this.voices.get(id);
    if (!state) return;
    this.voices.delete(id);
    state.voice?.stop(fadeSeconds);
  }

  private load(tier: KeyboardTier, note: number): Promise<AudioBuffer | null> {
    const key = `${tier}:${note}`;
    const existing = this.buffers.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await fetch(`${SAMPLE_BASE[tier]}${midiFlatName(note)}.mp3`);
        if (!response.ok) return null;
        return await this.audio.decode(await response.arrayBuffer());
      } catch {
        return null;
      }
    })();
    this.buffers.set(key, promise);
    return promise;
  }
}

function voiceId(tier: KeyboardTier, note: number, source: string): string {
  return `${tier}:${note}:${source}`;
}

function midiFlatName(note: number): string {
  const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
