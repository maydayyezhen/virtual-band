import * as THREE from 'three';

export interface FingeringMarkerStyle {
  readonly scale: readonly [number, number, number];
  readonly attackPulse: number;
}

export const FINGERING_MARKER_STYLES = {
  electricGuitar: {
    scale: [0.033, 0.044, 0.013],
    attackPulse: 0.018,
  },
  acousticGuitar: {
    scale: [0.034, 0.048, 0.014],
    attackPulse: 0.018,
  },
  violin: {
    scale: [0.027, 0.045, 0.010],
    attackPulse: 0.015,
  },
} as const satisfies Record<string, FingeringMarkerStyle>;

export interface FingeringMarkerState {
  marker: THREE.Mesh;
  amount: number;
  energy: number;
}

export function applyFingeringMarkerStyle(
  strings: Iterable<FingeringMarkerState>,
  style: FingeringMarkerStyle,
): void {
  for (const string of strings) {
    const presence = THREE.MathUtils.clamp(string.amount, 0, 1);
    const attack = THREE.MathUtils.clamp(string.energy, 0, 1);
    const pulse = 1 + attack * style.attackPulse;
    string.marker.scale.set(
      style.scale[0] * presence * pulse,
      style.scale[1] * presence * pulse,
      style.scale[2] * presence * pulse,
    );
    string.marker.castShadow = false;
    string.marker.renderOrder = 1;
  }
}
