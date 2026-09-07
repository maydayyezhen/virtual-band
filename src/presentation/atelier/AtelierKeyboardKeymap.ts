import type { AtelierKeyboardViewName } from '../../camera/presets/AtelierKeyboardViews';
import type { KeyboardTier } from '../../instruments/keyboard/legacyKeyboardAsset';

export type AtelierKeyboardKeyAction =
  | { kind: 'note'; note: number }
  | { kind: 'tier'; tier: KeyboardTier }
  | { kind: 'view'; view: AtelierKeyboardViewName }
  | { kind: 'sustain' }
  | { kind: 'panic' };

export const ATELIER_KEYBOARD_KEYMAP: Readonly<Record<string, AtelierKeyboardKeyAction>> = Object.freeze({
  Digit1: { kind: 'tier', tier: 'lower' },
  Digit2: { kind: 'tier', tier: 'upper' },

  Digit3: { kind: 'view', view: 'whole' },
  Digit4: { kind: 'view', view: 'lower' },
  Digit5: { kind: 'view', view: 'upper' },
  Digit6: { kind: 'view', view: 'pedals' },
  Digit7: { kind: 'view', view: 'back' },
  KeyR: { kind: 'view', view: 'whole' },

  KeyA: { kind: 'note', note: 60 },
  KeyW: { kind: 'note', note: 61 },
  KeyS: { kind: 'note', note: 62 },
  KeyE: { kind: 'note', note: 63 },
  KeyD: { kind: 'note', note: 64 },
  KeyF: { kind: 'note', note: 65 },
  KeyT: { kind: 'note', note: 66 },
  KeyG: { kind: 'note', note: 67 },
  KeyY: { kind: 'note', note: 68 },
  KeyH: { kind: 'note', note: 69 },
  KeyU: { kind: 'note', note: 70 },
  KeyJ: { kind: 'note', note: 71 },
  KeyK: { kind: 'note', note: 72 },

  Space: { kind: 'sustain' },
  Escape: { kind: 'panic' },
});
