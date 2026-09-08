export interface ViolinReleaseInfo {
  readonly durationSeconds: number;
}

export interface ViolinSustainBackend {
  readonly ready: boolean;
  prepare(): Promise<boolean>;
  noteOn(stringNumber: number, note: number, velocity: number): boolean;
  noteOff(stringNumber: number): ViolinReleaseInfo;
  setPitchBend(value: number): boolean;
  setGain(value: number, rampSeconds?: number): void;
  reset(): void;
  dispose(): void;
}
