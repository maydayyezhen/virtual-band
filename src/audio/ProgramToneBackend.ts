export interface ProgramToneNoteOptions {
  readonly gainScale?: number;
  readonly destination?: AudioNode;
}

export interface ProgramToneBackend {
  readonly ready: boolean;
  readonly program: number;
  readonly bank: number;
  prepare(): Promise<boolean>;
  setProgram(program: number, bank?: number): boolean;
  noteOn(
    voiceId: string,
    note: number,
    velocity: number,
    options?: ProgramToneNoteOptions,
  ): boolean;
  noteOff(voiceId: string): void;
  setSustain(pressed: boolean): void;
  setPitchBend(value: number): boolean;
  setGain(value: number, rampSeconds?: number): void;
  reset(): void;
  dispose(): void;
}
