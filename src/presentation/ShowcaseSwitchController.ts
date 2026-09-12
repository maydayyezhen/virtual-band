import type { InstrumentRegistry } from '../instruments/Instrument';
import type { PresentationManager } from './PresentationManager';

export interface ShowcaseEntry {
  instrumentId: string;
  presentationId: string;
}

export class ShowcaseSwitchController {
  private readonly instruments: InstrumentRegistry;
  private readonly presentation: PresentationManager;
  private readonly entries: ShowcaseEntry[];
  private readonly onChanged?: (instrumentId: string) => void;
  private activeIndex = 0;
  private disposed = false;

  constructor(options: {
    instruments: InstrumentRegistry;
    presentation: PresentationManager;
    entries: ShowcaseEntry[];
    initialInstrumentId?: string;
    onChanged?: (instrumentId: string) => void;
  }) {
    this.instruments = options.instruments;
    this.presentation = options.presentation;
    this.entries = [...options.entries];
    this.onChanged = options.onChanged;
    if (!this.entries.length) throw new Error('Showcase switcher requires at least one entry');

    const initialIndex = options.initialInstrumentId
      ? this.entries.findIndex((entry) => entry.instrumentId === options.initialInstrumentId)
      : 0;
    this.activeIndex = initialIndex >= 0 ? initialIndex : 0;
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  activateInitial(): void {
    this.activateIndex(this.activeIndex);
  }

  select(instrumentId: string): boolean {
    const index = this.entries.findIndex((entry) => entry.instrumentId === instrumentId);
    if (index < 0) return false;
    this.activateIndex(index);
    return true;
  }

  next(direction = 1): void {
    const length = this.entries.length;
    const index = (this.activeIndex + direction % length + length) % length;
    this.activateIndex(index);
  }

  get activeInstrumentId(): string {
    return this.entries[this.activeIndex].instrumentId;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('keydown', this.onKeyDown, true);
  }

  private activateIndex(index: number): void {
    if (index < 0 || index >= this.entries.length) return;
    this.activeIndex = index;
    const active = this.entries[index];

    for (const entry of this.entries) {
      const instrument = this.instruments.get(entry.instrumentId);
      if (instrument) instrument.root.visible = entry.instrumentId === active.instrumentId;
    }
    this.presentation.activate(active.presentationId);
    this.onChanged?.(active.instrumentId);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
    const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(targetTag)) return;
    event.preventDefault();
    event.stopPropagation();
    this.next(event.shiftKey ? -1 : 1);
  };
}
