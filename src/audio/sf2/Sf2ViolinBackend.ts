import type { AudioEngine } from '../AudioEngine';
import type { ViolinSustainBackend } from '../ViolinSustainBackend';
import { Sf2Synth } from './Sf2Synth';

const VIOLIN_PROGRAM = 40;
const VIOLIN_BANK = 0;
const DEFAULT_URL = '/soundfonts/FluidR3_GM.sf2';

export class Sf2ViolinBackend implements ViolinSustainBackend {
  readonly synth: Sf2Synth;

  private readonly url: string;
  private preparePromise: Promise<boolean> | null = null;
  private failed = false;

  constructor(audio: AudioEngine, url = DEFAULT_URL) {
    this.synth = new Sf2Synth(audio);
    this.url = url;
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
        const selected = this.synth.programChange(VIOLIN_PROGRAM, VIOLIN_BANK);
        if (!selected) throw new Error('Unable to select GM Violin program');
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
    return voices > 0;
  }

  noteOff(stringNumber: number): void {
    if (!this.ready) return;
    this.synth.noteOffVoice(voiceKey(stringNumber));
  }

  setPitchBend(value: number): boolean {
    if (!this.ready) return false;
    return this.synth.setPitchBend(value, 2);
  }

  reset(): void {
    if (!this.ready) return;
    this.synth.allNotesOff(0.03);
  }

  dispose(): void {
    this.synth.dispose();
  }
}

function voiceKey(stringNumber: number): string {
  return `violin:string:${stringNumber}`;
}
