export interface ProgramTonePerformanceProfile {
  /** Additive filter cutoff offset in cents. Positive = brighter. */
  readonly brightnessCents?: number;
  /**
   * Additional cutoff offset applied at low velocity. Usually negative; the
   * full amount is applied at velocity 0 and fades to zero at velocity 127.
   */
  readonly velocityToFilterCents?: number;
  /** Scale applied to SF2 modEnvToFilterFc. 1 keeps the SoundFont value. */
  readonly filterEnvelopeScale?: number;
}

export interface ProgramToneNoteOptions extends ProgramTonePerformanceProfile {
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
  setPerformanceProfile(profile: ProgramTonePerformanceProfile): void;
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
