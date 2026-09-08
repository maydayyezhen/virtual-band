const LIGHT_VELOCITY = 56;
const HEAVY_VELOCITY = 124;

/**
 * Manual keyboard guitar input keeps the existing per-action normal velocity,
 * while exposing two explicit performance modifiers without touching MIDI data.
 *
 * Alt  -> light pick
 * Shift -> heavy pick
 */
export function guitarKeyboardVelocity(
  event: Pick<KeyboardEvent, 'altKey' | 'shiftKey'>,
  normalVelocity: number,
): number {
  if (event.altKey) return LIGHT_VELOCITY;
  if (event.shiftKey) return HEAVY_VELOCITY;
  return clampMidiVelocity(normalVelocity);
}

/**
 * Shift+pointer is already reserved for camera pan in the Atelier guitar views,
 * so pointer performance uses Alt for light and Ctrl for heavy.
 */
export function guitarPointerVelocity(
  event: Pick<PointerEvent, 'altKey' | 'ctrlKey'>,
  normalVelocity = 105,
): number {
  if (event.altKey) return LIGHT_VELOCITY;
  if (event.ctrlKey) return HEAVY_VELOCITY;
  return clampMidiVelocity(normalVelocity);
}

function clampMidiVelocity(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(127, Math.round(value)));
}
