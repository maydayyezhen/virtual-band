import * as THREE from 'three';

export interface FingeringMarkerStyle {
  readonly scale: readonly [number, number, number];
  readonly attackPulse: number;
  readonly previewScale: number;
  readonly previewOpacity: number;
}

export const FINGERING_MARKER_STYLES = {
  electricGuitar: {
    scale: [0.033, 0.044, 0.013],
    attackPulse: 0.018,
    previewScale: 0.86,
    previewOpacity: 0.52,
  },
  acousticGuitar: {
    scale: [0.034, 0.048, 0.014],
    attackPulse: 0.018,
    previewScale: 0.86,
    previewOpacity: 0.52,
  },
  violin: {
    scale: [0.027, 0.045, 0.010],
    attackPulse: 0.015,
    previewScale: 0.84,
    previewOpacity: 0.50,
  },
} as const satisfies Record<string, FingeringMarkerStyle>;

export interface FingeringMarkerVisualState {
  readonly visible: boolean;
  readonly preview?: boolean;
  readonly attack?: number;
}

export function createFingeringPreviewMarker(source: THREE.Mesh, name: string): THREE.Mesh {
  const marker = source.clone(false);
  marker.name = name;
  marker.geometry = source.geometry;
  marker.material = Array.isArray(source.material)
    ? source.material.map((material) => material.clone())
    : source.material.clone();
  marker.visible = false;
  marker.castShadow = false;
  marker.userData = { ...source.userData, dynamic: true, fingeringPreview: true };
  // Visual helpers must never become the nearest interactive surface.
  marker.raycast = () => {};
  return marker;
}

export function applyFingeringMarkerStyle(
  marker: THREE.Mesh,
  style: FingeringMarkerStyle,
  state: FingeringMarkerVisualState,
): void {
  const preview = Boolean(state.preview);
  marker.visible = state.visible;
  marker.castShadow = false;
  marker.renderOrder = preview ? 2 : 1;

  if (!state.visible) {
    marker.scale.setScalar(0);
    return;
  }

  const attack = THREE.MathUtils.clamp(state.attack ?? 0, 0, 1);
  const pulse = 1 + attack * style.attackPulse;
  const presence = preview ? style.previewScale : 1;
  marker.scale.set(
    style.scale[0] * presence * pulse,
    style.scale[1] * presence * pulse,
    style.scale[2] * presence * pulse,
  );

  const materials = Array.isArray(marker.material) ? marker.material : [marker.material];
  for (const material of materials) {
    const transparent = preview;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = preview ? style.previewOpacity : 1;
    material.depthWrite = !preview;
  }
}
