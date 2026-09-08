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

  constructor(audio: AudioEngine, banks: Sf2BankLibrary, url = DEFAULT_URL) {
    this.lower = new Sf2Synth(audio, banks);
    this.upper = new Sf2Synth(audio, banks);
    this.url = url;
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
        const lowerSelected = this.lower.programChange(PROGRAMS.lower, GM_BANK);
        const upperSelected = this.upper.programChange(PROGRAMS.upper, GM_BANK);
        if (!lowerSelected || !upperSelected) throw new Error('Unable to select keyboard GM programs');
        console.info('[SF2] keyboard backend ready: lower=piano, upper=warm pad');
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
