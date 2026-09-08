import type { KeyboardTier } from '../instruments/keyboard/legacyKeyboardAsset';

export interface KeyboardToneBackend {
  readonly ready: boolean;
  prepare(): Promise<boolean>;
  noteOn(tier: KeyboardTier, voiceId: string, note: number, velocity: number): boolean;
  noteOff(tier: KeyboardTier, voiceId: string): void;
  setSustain(tier: KeyboardTier, pressed: boolean): void;
  setPitchBend(tier: KeyboardTier, value: number): boolean;
  setGain(tier: KeyboardTier, value: number, rampSeconds?: number): void;
  reset(): void;
  dispose(): void;
}
