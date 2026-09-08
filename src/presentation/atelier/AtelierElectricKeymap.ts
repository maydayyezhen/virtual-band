import type { AtelierElectricViewName } from '../../camera/presets/AtelierElectricViews';

export type AtelierElectricKeyAction =
  | { kind: 'string'; stringNumber: number }
  | { kind: 'chord'; chordIndex: number }
  | { kind: 'strum' }
  | { kind: 'program-step'; delta: -1 | 1 }
  | { kind: 'view'; view: AtelierElectricViewName }
  | { kind: 'panic' };

export const ATELIER_ELECTRIC_KEYMAP: Readonly<Record<string, AtelierElectricKeyAction>> = Object.freeze({
  KeyA: { kind: 'string', stringNumber: 6 },
  KeyS: { kind: 'string', stringNumber: 5 },
  KeyD: { kind: 'string', stringNumber: 4 },
  KeyF: { kind: 'string', stringNumber: 3 },
  KeyG: { kind: 'string', stringNumber: 2 },
  KeyH: { kind: 'string', stringNumber: 1 },

  Digit1: { kind: 'chord', chordIndex: 0 },
  Digit2: { kind: 'chord', chordIndex: 1 },
  Digit3: { kind: 'chord', chordIndex: 2 },
  Digit4: { kind: 'chord', chordIndex: 3 },
  Space: { kind: 'strum' },

  KeyQ: { kind: 'program-step', delta: -1 },
  KeyE: { kind: 'program-step', delta: 1 },

  Digit5: { kind: 'view', view: 'whole' },
  Digit6: { kind: 'view', view: 'body' },
  Digit7: { kind: 'view', view: 'neck' },
  Digit8: { kind: 'view', view: 'head' },
  Digit9: { kind: 'view', view: 'back' },
  KeyR: { kind: 'view', view: 'whole' },

  Escape: { kind: 'panic' },
});
