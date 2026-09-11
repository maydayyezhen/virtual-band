import type { AtelierDrumViewName } from '../../camera/presets/AtelierDrumViews';

export type AtelierDrumKeyAction =
  | { kind: 'note'; note: number }
  | { kind: 'hihat-strike' }
  | { kind: 'hihat-pedal'; releaseOpenness: number }
  | { kind: 'program-step'; delta: -1 | 1 }
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
  KeyP: { kind: 'note', note: 59 }, // Ride 2 — the kit has one ride, so it lands on that one

  // Core kit.
  KeyA: { kind: 'note', note: 36 }, // Kick
  KeyS: { kind: 'note', note: 38 }, // Snare
  KeyD: { kind: 'hihat-strike' },   // Strike at the current pedal openness
  KeyF: { kind: 'note', note: 37 }, // Side stick — the snare struck on the rim
  KeyJ: { kind: 'note', note: 50 }, // High Tom
  KeyK: { kind: 'note', note: 47 }, // Mid Tom
  KeyL: { kind: 'note', note: 43 }, // Floor Tom
  KeyY: { kind: 'note', note: 53 }, // Ride bell — the ride struck on its bell

  // GM's remaining percussion notes. The kit has three toms where GM expects six, so the keys
  // above each tom play the notes that fall between it and its neighbour, and the keys below the
  // kick and snare play their alternate articulations. The donor already routes all of these to
  // the right piece, so they sound like themselves rather than like their neighbour.
  KeyZ: { kind: 'note', note: 35 }, // Acoustic bass drum — alternate kick
  KeyX: { kind: 'note', note: 40 }, // Electric snare — alternate snare
  KeyU: { kind: 'note', note: 48 }, // Hi-mid tom, between the high and mid toms
  KeyI: { kind: 'note', note: 45 }, // Low tom, between the mid and floor toms
  KeyO: { kind: 'note', note: 41 }, // Low floor tom, below the floor tom

  // Hold = close/chick, release = reopen to the donor's normal loose-open position.
  Space: { kind: 'hihat-pedal', releaseOpenness: 0.8 },

  // Notes the kit has no piece for. They sound but nothing moves, so this key is here to make
  // one of them reachable by hand; every other such note arrives from a score.
  KeyG: { kind: 'note', note: 39 }, // Hand clap — sounds only, no drum moves

  // Swap the kit. Every GM2 percussion preset shares one note map, so no hit can misroute.
  BracketLeft: { kind: 'program-step', delta: -1 },
  BracketRight: { kind: 'program-step', delta: 1 },

  Escape: { kind: 'panic' },
});
