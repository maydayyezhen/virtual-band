export interface ViolinSustainBackend {
  readonly ready: boolean;
  prepare(): Promise<boolean>;
  noteOn(stringNumber: number, note: number, velocity: number): boolean;
  noteOff(stringNumber: number): void;
  setPitchBend(value: number): boolean;
  reset(): void;
  dispose(): void;
}
