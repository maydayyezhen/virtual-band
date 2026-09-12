import type { BassProgramId } from './BassProgram';
import type { AcousticGuitarProgramId } from './AcousticGuitarProgram';
import type { ElectricGuitarProgramId } from './ElectricGuitarProgram';

export type KeyboardTier = 'lower' | 'upper';
export type StringGesture = 'gated' | 'pluck' | 'strum';
export const HI_HAT_NOTES = { closed: 42, pedal: 44, open: 46 } as const;

interface AudioLifetime { reset(): void; dispose(): void }
export interface KeyboardAudio extends AudioLifetime {
  program(tier: KeyboardTier): number | null;
  setProgram(tier: KeyboardTier, program: number): boolean;
  noteOn(tier: KeyboardTier, note: number, velocity: number, source?: string): void;
  noteOff(tier: KeyboardTier, note: number, source?: string): void;
  setSustain(tier: KeyboardTier, pressed: boolean): void;
  setPitchBend(tier: KeyboardTier, value: number): boolean;
}
export interface StringAudio<P extends number = number> extends AudioLifetime {
  readonly program: P;
  setProgram(value: number): boolean;
  noteOn(string: number, note: number, velocity: number, gesture?: StringGesture): void;
  noteOff(string: number): void;
  noteOffPitch(note: number): void;
  muteString(string: number, fadeSeconds?: number): void;
  setSustain(pressed: boolean): void;
  setPitchBend(value: number): boolean;
  setVolume(value: number): boolean | void;
}
export interface BassAudio extends StringAudio<BassProgramId> {
  stepProgram(delta: number): BassProgramId;
  setVolume(value: number): boolean;
}
export type AcousticGuitarAudio = StringAudio<AcousticGuitarProgramId>;
export interface ElectricGuitarAudio extends StringAudio<ElectricGuitarProgramId> {
  setTone(value: number): boolean | void;
  setPickup(value: number): boolean | void;
}
export interface ViolinAudio extends AudioLifetime {
  readonly program: number | null;
  setProgram(value: number): boolean;
  noteOn(string: number, note: number, velocity: number, articulation: 'arco' | 'pizzicato'): void;
  noteOff(string: number): number;
  noteOffPitch(note: number): number;
  setPitchBend(value: number): boolean;
}
export interface DrumAudio {
  readonly program: number | null;
  setProgram(value: number): boolean;
  noteOn(note: number, velocity?: number): void;
  setHiHatOpenness(value: number): void;
  hitHiHat(openness: number, velocity: number): void;
  chokeHiHat(): void;
  resetHiHat(): void;
  dispose(): void;
}
