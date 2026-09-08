import type { AtelierViolinViewName } from '../../camera/presets/AtelierViolinViews';
import type { ViolinArticulation } from '../../instruments/violin/legacyViolinAsset';

export type AtelierViolinKeyAction =
  | { kind: 'string'; stringNumber: number }
  | { kind: 'articulation'; articulation: ViolinArticulation }
  | { kind: 'clear-fingering' }
  | { kind: 'view'; view: AtelierViolinViewName }
  | { kind: 'demo' }
  | { kind: 'panic' };

export const ATELIER_VIOLIN_KEYMAP: Readonly<Record<string, AtelierViolinKeyAction>> = Object.freeze({
  KeyA: { kind: 'string', stringNumber: 4 },
  KeyS: { kind: 'string', stringNumber: 3 },
  KeyD: { kind: 'string', stringNumber: 2 },
  KeyF: { kind: 'string', stringNumber: 1 },

  Digit1: { kind: 'articulation', articulation: 'arco' },
  Digit2: { kind: 'articulation', articulation: 'pizzicato' },
  Digit0: { kind: 'clear-fingering' },

  Digit3: { kind: 'view', view: 'whole' },
  Digit4: { kind: 'view', view: 'body' },
  Digit5: { kind: 'view', view: 'neck' },
  Digit6: { kind: 'view', view: 'head' },
  Digit7: { kind: 'view', view: 'back' },
  KeyR: { kind: 'view', view: 'whole' },

  Space: { kind: 'demo' },
  Escape: { kind: 'panic' },
});
