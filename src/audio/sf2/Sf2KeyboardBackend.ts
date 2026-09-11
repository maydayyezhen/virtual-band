import type { KeyboardTier } from '../../instruments/keyboard/legacyKeyboardAsset';
import type { KeyboardToneBackend } from '../KeyboardToneBackend';
import type { AudioEngine } from '../AudioEngine';
import type { Sf2BankLibrary } from './Sf2BankLibrary';
import { Sf2Synth } from './Sf2Synth';

const DEFAULT_URL = '/soundfonts/FluidR3_GM.sf2';
const PROGRAMS: Record<KeyboardTier, number> = {
  lower: 0,
  upper: 89,
};
const GM_BANK = 0;

export class Sf2KeyboardBackend implements KeyboardToneBackend {
  readonly lower: Sf2Synth;
  readonly upper: Sf2Synth;

  private readonly url: string;
  private preparePromise: Promise<boolean> | null = null;
  private failed = false;
  private readonly programs: Record<KeyboardTier, number> = { ...PROGRAMS };

  constructor(audio: AudioEngine, banks: Sf2BankLibrary, url = DEFAULT_URL) {
    this.lower = new Sf2Synth(audio, banks);
    this.upper = new Sf2Synth(audio, banks);
    this.url = url;
  }

  /** GM program a tier is currently set to. */
  program(tier: KeyboardTier): number {
    return this.programs[tier];
  }

  /**
   * Select a GM program for one tier.
   *
   * The two tiers are independent synths with identical capability, so anything from 0 to 127
   * can go on either — there is no "pianos downstairs" rule. A program change only decides what
   * *new* notes sound like; anything already sounding keeps its own tone to the end.
   */
  setProgram(tier: KeyboardTier, program: number): boolean {
    if (!Number.isInteger(program) || program < 0 || program > 127) return false;
    this.programs[tier] = program;
    if (!this.ready) return true; // applied as soon as the bank finishes loading
    return this.synth(tier).programChange(program, GM_BANK);
  }

  get ready(): boolean {
    return this.lower.isLoaded && this.upper.isLoaded && !this.failed;
  }

  prepare(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.failed) return Promise.resolve(false);
    if (this.preparePromise) return this.preparePromise;

    this.preparePromise = Promise.all([
      this.lower.load(this.url),
      this.upper.load(this.url),
    ])
      .then(() => {
        // Apply whatever the tiers are set to now, which may have changed while loading.
        const lowerSelected = this.lower.programChange(this.programs.lower, GM_BANK);
        const upperSelected = this.upper.programChange(this.programs.upper, GM_BANK);
        if (!lowerSelected || !upperSelected) throw new Error('Unable to select keyboard GM programs');
        console.info(
          `[SF2] keyboard backend ready: lower=${this.programs.lower}, upper=${this.programs.upper}`,
        );
        return true;
      })
      .catch((error) => {
        this.failed = true;
        console.warn('[SF2] keyboard backend unavailable; using MP3 fallback', error);
        return false;
      })
      .finally(() => {
        this.preparePromise = null;
      });

    return this.preparePromise;
  }

  noteOn(tier: KeyboardTier, voiceId: string, note: number, velocity: number): boolean {
    if (!this.ready) return false;
    return this.synth(tier).noteOnVoice(voiceKey(tier, voiceId), note, velocity) > 0;
  }

  noteOff(tier: KeyboardTier, voiceId: string): void {
    if (!this.ready) return;
    this.synth(tier).noteOffVoice(voiceKey(tier, voiceId));
  }

  setSustain(tier: KeyboardTier, pressed: boolean): void {
    if (!this.ready) return;
    this.synth(tier).setSustain(pressed);
  }

  setPitchBend(tier: KeyboardTier, value: number): boolean {
    if (!this.ready) return false;
    return this.synth(tier).setPitchBend(value, 2);
  }

  setGain(tier: KeyboardTier, value: number, rampSeconds = 0.025): void {
    this.synth(tier).setOutputGain(value, rampSeconds);
  }

  reset(): void {
    this.lower.allNotesOff(0.03);
    this.upper.allNotesOff(0.03);
  }

  dispose(): void {
    this.lower.dispose();
    this.upper.dispose();
  }

  private synth(tier: KeyboardTier): Sf2Synth {
    return tier === 'lower' ? this.lower : this.upper;
  }
}

function voiceKey(tier: KeyboardTier, voiceId: string): string {
  return `keyboard:${tier}:${voiceId}`;
}
