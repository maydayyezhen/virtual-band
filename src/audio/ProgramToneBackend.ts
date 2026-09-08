export interface ProgramToneNoteOptions {
  readonly gainScale?: number;
  readonly destination?: AudioNode;
  /**
   * Optional physical-performance ceiling. After this many seconds the backend
   * issues Note Off for this voice if the caller has not already done so.
   */
  readonly autoReleaseSeconds?: number;
  /**
   * Optional forced release duration used by autoReleaseSeconds. Leave undefined
   * to use the SoundFont's own release envelope.
   */
  readonly autoReleaseFadeSeconds?: number;
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
  noteOff(voiceId: string, forcedReleaseSeconds?: number): void;
  setSustain(pressed: boolean): void;
  setPitchBend(value: number): boolean;
  setGain(value: number, rampSeconds?: number): void;
  reset(): void;
  dispose(): void;
}
