import type { AtelierDrumViewName } from '../../camera/presets/AtelierDrumViews';

export type AtelierDrumKeyAction =
  | { kind: 'note'; note: number }
  | { kind: 'hihat-strike' }
  | { kind: 'hihat-pedal'; releaseOpenness: number }
  | { kind: 'view'; view: AtelierDrumViewName }
  | { kind: 'panic' };

/**
 * Keyboard-only control surface for the Atelier drum presentation.
 *
 * The mapping is intentionally data-only so a future settings/UI layer can
 * inspect or replace it without moving keyboard semantics into the 3D runtime.
 */
export const ATELIER_DRUM_KEYMAP: Readonly<Record<string, AtelierDrumKeyAction>> = Object.freeze({
  // Saved camera views.
  Digit1: { kind: 'view', view: 'whole' },
  Digit2: { kind: 'view', view: 'drummer' },
  Digit3: { kind: 'view', view: 'cymbals' },
  Digit4: { kind: 'view', view: 'pedals' },
  KeyR: { kind: 'view', view: 'whole' },

  // Cymbals.
  KeyQ: { kind: 'note', note: 49 }, // Crash Left
  KeyW: { kind: 'note', note: 57 }, // Crash Right
  KeyE: { kind: 'note', note: 51 }, // Ride
  KeyT: { kind: 'note', note: 55 }, // Splash

  // Core kit.
  KeyA: { kind: 'note', note: 36 }, // Kick
  KeyS: { kind: 'note', note: 38 }, // Snare
  KeyD: { kind: 'hihat-strike' },   // Strike at the current pedal openness
  KeyJ: { kind: 'note', note: 50 }, // High Tom
  KeyK: { kind: 'note', note: 47 }, // Mid Tom
  KeyL: { kind: 'note', note: 43 }, // Floor Tom

  // Hold = close/chick, release = reopen to the donor's normal loose-open position.
  Space: { kind: 'hihat-pedal', releaseOpenness: 0.8 },

  Escape: { kind: 'panic' },
});
