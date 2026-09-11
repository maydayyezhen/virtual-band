import type { AudioEngine } from '../AudioEngine';
import type { ViolinReleaseInfo, ViolinSustainBackend } from '../ViolinSustainBackend';
import type { Sf2BankLibrary } from './Sf2BankLibrary';
import { Sf2Synth } from './Sf2Synth';

const VIOLIN_PROGRAM = 40;
const VIOLIN_BANK = 0;
const DEFAULT_URL = '/soundfonts/FluidR3_GM.sf2';

interface ActiveStringVoice {
  readonly note: number;
  readonly velocity: number;
}

export class Sf2ViolinBackend implements ViolinSustainBackend {
  readonly synth: Sf2Synth;

  private readonly url: string;
  private readonly activeStrings = new Map<number, ActiveStringVoice>();
  private preparePromise: Promise<boolean> | null = null;
  private failed = false;
  private programId: number = VIOLIN_PROGRAM;

  constructor(audio: AudioEngine, banks: Sf2BankLibrary, url = DEFAULT_URL) {
    this.synth = new Sf2Synth(audio, banks);
    this.url = url;
  }

  get program(): number {
    return this.programId;
  }

  /**
   * Select a different GM program on the loaded bank. The instrument type is the caller's idea;
   * this only knows about program numbers, so a violin model can sound like a cello.
   */
  setProgram(program: number, bank: number = VIOLIN_BANK): boolean {
    if (!Number.isInteger(program) || program < 0 || program > 127) return false;
    this.programId = program;
    if (!this.ready) return true; // applied once the bank finishes loading
    return this.synth.programChange(program, bank);
  }

  get ready(): boolean {
    return this.synth.isLoaded && !this.failed;
  }

  prepare(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.failed) return Promise.resolve(false);
    if (this.preparePromise) return this.preparePromise;

    this.preparePromise = this.synth.load(this.url)
      .then(() => {
        const selected = this.synth.programChange(this.programId, VIOLIN_BANK);
        if (!selected) throw new Error(`Unable to select GM program ${this.programId}`);
        console.info('[SF2] violin backend ready');
        return true;
      })
      .catch((error) => {
        this.failed = true;
        console.warn('[SF2] violin backend unavailable; using MP3 fallback', error);
        return false;
      })
      .finally(() => {
        this.preparePromise = null;
      });

    return this.preparePromise;
  }

  noteOn(stringNumber: number, note: number, velocity: number): boolean {
    if (!this.ready) return false;
    const voices = this.synth.noteOnVoice(voiceKey(stringNumber), note, velocity);
    if (voices <= 0) return false;
    this.activeStrings.set(stringNumber, { note, velocity });
    return true;
  }

  noteOff(stringNumber: number): ViolinReleaseInfo {
    const active = this.activeStrings.get(stringNumber) ?? null;
    this.activeStrings.delete(stringNumber);

    if (!this.ready) return { durationSeconds: 0 };

    let durationSeconds = 0;
    if (active) {
      const regions = this.synth.inspect(active.note, active.velocity, this.programId, VIOLIN_BANK);
      for (const region of regions) durationSeconds = Math.max(durationSeconds, region.releaseSeconds);
      durationSeconds = clamp(durationSeconds, 0.005, 30);
    }

    this.synth.noteOffVoice(voiceKey(stringNumber));
    return { durationSeconds };
  }

  setPitchBend(value: number): boolean {
    if (!this.ready) return false;
    return this.synth.setPitchBend(value, 2);
  }

  setGain(value: number, rampSeconds = 0.025): void {
    this.synth.setOutputGain(value, rampSeconds);
  }

  reset(): void {
    this.activeStrings.clear();
    if (!this.ready) return;
    this.synth.allNotesOff(0.03);
  }

  dispose(): void {
    this.activeStrings.clear();
    this.synth.dispose();
  }
}

function voiceKey(stringNumber: number): string {
  return `violin:string:${stringNumber}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
