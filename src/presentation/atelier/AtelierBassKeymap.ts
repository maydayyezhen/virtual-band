import type { AtelierBassViewName } from '../../camera/presets/AtelierBassViews';

export type AtelierBassKeyAction =
  | { kind: 'string'; stringNumber: number }
  | { kind: 'clear-fingering' }
  | { kind: 'program-step'; delta: -1 | 1 }
  | { kind: 'view'; view: AtelierBassViewName }
  | { kind: 'panic' };

export const ATELIER_BASS_KEYMAP: Readonly<Record<string, AtelierBassKeyAction>> = Object.freeze({
  KeyA: { kind: 'string', stringNumber: 4 },
  KeyS: { kind: 'string', stringNumber: 3 },
  KeyD: { kind: 'string', stringNumber: 2 },
  KeyF: { kind: 'string', stringNumber: 1 },
  Digit0: { kind: 'clear-fingering' },
  KeyQ: { kind: 'program-step', delta: -1 },
  KeyE: { kind: 'program-step', delta: 1 },
  Digit5: { kind: 'view', view: 'whole' },
  Digit6: { kind: 'view', view: 'body' },
  Digit7: { kind: 'view', view: 'bridge' },
  Digit8: { kind: 'view', view: 'head' },
  Digit9: { kind: 'view', view: 'back' },
  KeyR: { kind: 'view', view: 'whole' },
  Escape: { kind: 'panic' },
});
