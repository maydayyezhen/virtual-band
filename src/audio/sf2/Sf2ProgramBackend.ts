import type { AudioEngine } from '../AudioEngine';
import type { ProgramToneBackend, ProgramToneNoteOptions } from '../ProgramToneBackend';
import type { Sf2BankLibrary } from './Sf2BankLibrary';
import { Sf2Synth } from './Sf2Synth';

const DEFAULT_URL = '/soundfonts/FluidR3_GM.sf2';

export interface Sf2ProgramBackendOptions {
  readonly program: number;
  readonly bank?: number;
  readonly url?: string;
  readonly label?: string;
  readonly pitchBendSemitones?: number;
  readonly gain?: number;
}

export class Sf2ProgramBackend implements ProgramToneBackend {
  readonly synth: Sf2Synth;

  private readonly url: string;
  private readonly label: string;
  private readonly pitchBendSemitones: number;
  private readonly autoReleaseTimers = new Map<string, number>();
  private preparePromise: Promise<boolean> | null = null;
  private failed = false;
  private programId: number;
  private bankId: number;

  constructor(
    audio: AudioEngine,
    banks: Sf2BankLibrary,
    options: Sf2ProgramBackendOptions,
  ) {
    this.synth = new Sf2Synth(audio, banks);
    this.url = options.url ?? DEFAULT_URL;
    this.label = options.label ?? 'program';
    this.pitchBendSemitones = options.pitchBendSemitones ?? 2;
    this.programId = options.program;
    this.bankId = options.bank ?? 0;
    this.synth.setOutputGain(options.gain ?? 1, 0);
  }

  get ready(): boolean {
    return this.synth.isLoaded && !this.failed;
  }

  get program(): number {
    return this.programId;
  }

  get bank(): number {
    return this.bankId;
  }

  prepare(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.failed) return Promise.resolve(false);
    if (this.preparePromise) return this.preparePromise;

    this.preparePromise = this.synth.load(this.url)
      .then(() => {
        if (!this.synth.programChange(this.programId, this.bankId)) {
          throw new Error(`Unable to select bank ${this.bankId} program ${this.programId}`);
        }
        console.info(`[SF2] ${this.label} backend ready: bank=${this.bankId} program=${this.programId}`);
        return true;
      })
      .catch((error) => {
        this.failed = true;
        console.warn(`[SF2] ${this.label} backend unavailable; using MP3 fallback`, error);
        return false;
      })
      .finally(() => {
        this.preparePromise = null;
      });

    return this.preparePromise;
  }

  setProgram(program: number, bank = this.bankId): boolean {
    if (!Number.isInteger(program) || program < 0 || program > 127) return false;
    if (!Number.isInteger(bank) || bank < 0 || bank > 16383) return false;
    this.programId = program;
    this.bankId = bank;
    return this.ready ? this.synth.programChange(program, bank) : true;
  }

  noteOn(
    voiceId: string,
    note: number,
    velocity: number,
    options?: ProgramToneNoteOptions,
  ): boolean {
    if (!this.ready) return false;
    const key = voiceKey(this.label, voiceId);
    this.clearAutoRelease(key);

    const started = this.synth.noteOnVoice(key, note, velocity, options) > 0;
    if (!started) return false;

    const autoReleaseSeconds = options?.autoReleaseSeconds;
    if (autoReleaseSeconds !== undefined && Number.isFinite(autoReleaseSeconds) && autoReleaseSeconds > 0) {
      const timer = window.setTimeout(() => {
        this.autoReleaseTimers.delete(key);
        const fade = options?.autoReleaseFadeSeconds;
        this.synth.noteOffVoice(
          key,
          fade !== undefined && Number.isFinite(fade) && fade >= 0 ? Math.max(0.005, fade) : undefined,
        );
      }, Math.max(0.01, autoReleaseSeconds) * 1000);
      this.autoReleaseTimers.set(key, timer);
    }

    return true;
  }

  noteOff(voiceId: string, forcedReleaseSeconds?: number): void {
    if (!this.ready) return;
    const key = voiceKey(this.label, voiceId);
    this.clearAutoRelease(key);
    this.synth.noteOffVoice(key, forcedReleaseSeconds);
  }

  setSustain(pressed: boolean): void {
    if (!this.ready) return;
    this.synth.setSustain(pressed);
  }

  setPitchBend(value: number): boolean {
    if (!this.ready) return false;
    return this.synth.setPitchBend(value, this.pitchBendSemitones);
  }

  setGain(value: number, rampSeconds = 0.025): void {
    this.synth.setOutputGain(value, rampSeconds);
  }

  reset(): void {
    this.clearAutoReleaseTimers();
    if (!this.ready) return;
    this.synth.allNotesOff(0.03);
    this.synth.setSustain(false);
    this.synth.setPitchBend(0, this.pitchBendSemitones);
  }

  dispose(): void {
    this.clearAutoReleaseTimers();
    this.synth.dispose();
  }

  private clearAutoRelease(key: string): void {
    const timer = this.autoReleaseTimers.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.autoReleaseTimers.delete(key);
  }

  private clearAutoReleaseTimers(): void {
    for (const timer of this.autoReleaseTimers.values()) window.clearTimeout(timer);
    this.autoReleaseTimers.clear();
  }
}

function voiceKey(label: string, voiceId: string): string {
  return `${label}:${voiceId}`;
}
