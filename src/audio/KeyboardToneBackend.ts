import type { KeyboardTier } from '../instruments/keyboard/legacyKeyboardAsset';

export interface KeyboardToneBackend {
  readonly ready: boolean;
  prepare(): Promise<boolean>;
  /** GM program a tier is currently set to. */
  program(tier: KeyboardTier): number;
  /** Select a GM program for one tier. The two tiers are independent and equally capable. */
  setProgram(tier: KeyboardTier, program: number): boolean;
  noteOn(tier: KeyboardTier, voiceId: string, note: number, velocity: number): boolean;
  noteOff(tier: KeyboardTier, voiceId: string): void;
  setSustain(tier: KeyboardTier, pressed: boolean): void;
  setPitchBend(tier: KeyboardTier, value: number): boolean;
  setGain(tier: KeyboardTier, value: number, rampSeconds?: number): void;
  reset(): void;
  dispose(): void;
}
