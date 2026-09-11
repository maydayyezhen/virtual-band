import type { AtelierViolinViewName } from '../../camera/presets/AtelierViolinViews';
import type { ViolinArticulation } from '../../instruments/violin/legacyViolinAsset';

export type AtelierViolinKeyAction =
  | { kind: 'string'; stringNumber: number }
  | { kind: 'articulation'; articulation: ViolinArticulation }
  | { kind: 'program-step'; delta: -1 | 1 }
  | { kind: 'clear-fingering' }
  | { kind: 'view'; view: AtelierViolinViewName }
  | { kind: 'demo' }
  | { kind: 'panic' };

export const ATELIER_VIOLIN_KEYMAP: Readonly<Record<string, AtelierViolinKeyAction>> = Object.freeze({
  KeyA: { kind: 'string', stringNumber: 4 },
  KeyS: { kind: 'string', stringNumber: 3 },
  KeyD: { kind: 'string', stringNumber: 2 },
  KeyF: { kind: 'string', stringNumber: 1 },

  // Two orthogonal axes: Q/E pick which member of the family this model is (tuning and tone
  // together), 1/2 pick how it is played — 1 bows, 2 plucks. Switching family never changes
  // the playing style.
  KeyQ: { kind: 'program-step', delta: -1 },
  KeyE: { kind: 'program-step', delta: 1 },
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
