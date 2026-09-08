export type StringFingeringValue = number | null;

/**
 * Persistent left-hand state for a fretted or stopped-string instrument.
 * `0` means open string; `null` means intentionally muted/not played.
 */
export class StringFingeringState {
  private readonly values = new Map<number, StringFingeringValue>();

  constructor(
    private readonly stringOrder: readonly number[],
    private readonly maxPosition: number,
  ) {
    this.clear();
  }

  get(stringNumber: number): StringFingeringValue {
    return this.values.get(stringNumber) ?? 0;
  }

  set(stringNumber: number, value: StringFingeringValue): boolean {
    if (!this.stringOrder.includes(stringNumber) || !this.isValidValue(value)) return false;
    this.values.set(stringNumber, value);
    return true;
  }

  toggle(stringNumber: number, position: number): boolean {
    if (!Number.isInteger(position) || position < 1 || position > this.maxPosition) return false;
    const current = this.get(stringNumber);
    return this.set(stringNumber, current === position ? 0 : position);
  }

  setAll(values: readonly StringFingeringValue[]): boolean {
    if (values.length !== this.stringOrder.length || values.some((value) => !this.isValidValue(value))) {
      return false;
    }
    for (let index = 0; index < this.stringOrder.length; index += 1) {
      this.values.set(this.stringOrder[index], values[index]);
    }
    return true;
  }

  clear(): void {
    for (const stringNumber of this.stringOrder) this.values.set(stringNumber, 0);
  }

  snapshot(): StringFingeringValue[] {
    return this.stringOrder.map((stringNumber) => this.get(stringNumber));
  }

  private isValidValue(value: StringFingeringValue): boolean {
    return value === null
      || (Number.isInteger(value) && value >= 0 && value <= this.maxPosition);
  }
}
