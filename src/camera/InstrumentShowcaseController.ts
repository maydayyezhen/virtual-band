import type { InstrumentInteractionSystem } from '../instruments/InstrumentInteractionSystem';
import type { InstrumentOrbitMode } from './modes/InstrumentOrbitMode';

export class InstrumentShowcaseController {
  private readonly element: HTMLCanvasElement;
  private readonly interactions: InstrumentInteractionSystem;
  private readonly orbit: InstrumentOrbitMode;
  private readonly onExit: () => void;

  constructor(options: {
    element: HTMLCanvasElement;
    interactions: InstrumentInteractionSystem;
    orbit: InstrumentOrbitMode;
    onExit: () => void;
  }) {
    this.element = options.element;
    this.interactions = options.interactions;
    this.orbit = options.orbit;
    this.onExit = options.onExit;

    this.element.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    this.element.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const instrumentId = this.interactions.pickInstrumentAt(event.clientX, event.clientY);

    if (!instrumentId) {
      if (this.orbit.activeInstrumentId) this.exit();
      return;
    }

    if (this.orbit.activeInstrumentId === instrumentId) {
      this.exit();
      return;
    }

    this.orbit.enter(instrumentId);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.orbit.activeInstrumentId) return;
    this.exit();
  };

  private exit(): void {
    this.orbit.exit();
    this.onExit();
  }
}
