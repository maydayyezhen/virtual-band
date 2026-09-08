import type { AtelierAcousticViewName } from '../../camera/presets/AtelierAcousticViews';

export type AtelierAcousticKeyAction =
  | { kind: 'string'; stringNumber: number }
  | { kind: 'chord'; chordIndex: number }
  | { kind: 'strum'; direction: 'down' | 'up' }
  | { kind: 'clear-fingering' }
  | { kind: 'program-toggle' }
  | { kind: 'view'; view: AtelierAcousticViewName }
  | { kind: 'panic' };

export const ATELIER_ACOUSTIC_KEYMAP: Readonly<Record<string, AtelierAcousticKeyAction>> = Object.freeze({
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
  Digit0: { kind: 'clear-fingering' },
  Space: { kind: 'strum', direction: 'down' },
  KeyE: { kind: 'strum', direction: 'up' },
  KeyQ: { kind: 'program-toggle' },

  Digit5: { kind: 'view', view: 'whole' },
  Digit6: { kind: 'view', view: 'body' },
  Digit7: { kind: 'view', view: 'neck' },
  Digit8: { kind: 'view', view: 'head' },
  Digit9: { kind: 'view', view: 'back' },
  KeyR: { kind: 'view', view: 'whole' },

  Escape: { kind: 'panic' },
});
