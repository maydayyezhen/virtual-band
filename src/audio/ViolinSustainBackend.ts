export interface ViolinReleaseInfo {
  readonly durationSeconds: number;
}

export interface ViolinSustainBackend {
  readonly ready: boolean;
  /** Current GM program, so a host can tell which member of the family is sounding. */
  readonly program: number;
  /** Select a different GM program, i.e. a different member of the violin family. */
  setProgram(program: number): boolean;
  prepare(): Promise<boolean>;
  noteOn(stringNumber: number, note: number, velocity: number): boolean;
  noteOff(stringNumber: number): ViolinReleaseInfo;
  setPitchBend(value: number): boolean;
  setGain(value: number, rampSeconds?: number): void;
  reset(): void;
  dispose(): void;
}
