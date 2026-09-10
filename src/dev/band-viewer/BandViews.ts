import * as THREE from 'three';
import type { BandOrbitCameraView, CameraRegistry } from '../../camera/CameraRegistry';

/**
 * Stage views — the fixed angles the whole band is looked at from.
 *
 * They are stored as **angles around whatever the band currently occupies**, not as finished
 * camera positions: the layout decides the band's box at runtime, so baking positions here
 * would silently rot the moment the arrangement changes. `materialize` turns them into
 * `band-orbit` views once that box is known.
 */

export interface BandViewPreset {
  /** Local id; the registered view id is `band:<key>`. */
  readonly key: string;
  readonly label: string;
  /** Radians. 0 looks from the audience side (+Z); Math.PI looks from behind the band. */
  readonly yaw: number;
  /** Radians above the horizon. */
  readonly pitch: number;
  /** Multiplier on the band's own bounding box, when a view wants a wider or tighter frame. */
  readonly framingScale?: number;
  readonly fov: number;
}

export const BAND_VIEW_SCOPE = 'band';
const VIEW_ID_PREFIX = 'band:';

/**
 * Number keys in the band view pick from this list, in order.
 *
 * A flat 180° rear view is **not possible in NOCTURNE**: the band sits ~7 m in front of the LED
 * wall, while a level rear framing needs ~9 m of reach, which puts the camera behind the wall
 * (measured: a pure `yaw: Math.PI, pitch: 0.30` view renders solid black). Rear views therefore
 * carry a steep pitch so the horizontal reach stays inside the venue.
 */
export const BAND_VIEWS: readonly BandViewPreset[] = [
  { key: 'audience', label: '观众席', yaw: 0, pitch: 0.34, fov: 38 },
  { key: 'rear', label: '乐队后方', yaw: Math.PI, pitch: 0.85, fov: 38 },
  { key: 'overhead', label: '俯视全队', yaw: 0, pitch: 0.95, fov: 38 },
  { key: 'wing', label: '侧翼', yaw: Math.PI / 2, pitch: 0.26, fov: 38 },
];

export function bandViewId(key: string): string {
  return `${VIEW_ID_PREFIX}${key}`;
}

/**
 * Registers one `band-orbit` view per preset, framed on `bandBox`. Returns their ids in preset
 * order so a caller can bind number keys without repeating the list.
 */
export function registerBandViews(registry: CameraRegistry, bandBox: THREE.Box3): string[] {
  const center = bandBox.getCenter(new THREE.Vector3());
  const size = bandBox.getSize(new THREE.Vector3());

  const views: BandOrbitCameraView[] = BAND_VIEWS.map((preset) => {
    const scale = preset.framingScale ?? 1;
    return {
      kind: 'band-orbit',
      id: bandViewId(preset.key),
      label: preset.label,
      scope: BAND_VIEW_SCOPE,
      target: center.toArray() as [number, number, number],
      yaw: preset.yaw,
      pitch: preset.pitch,
      framing: {
        width: size.x * scale,
        height: size.y * scale,
        depth: size.z * scale,
      },
      fov: preset.fov,
    };
  });

  registry.setScopedViews(BAND_VIEW_SCOPE, views);
  return views.map((view) => view.id);
}
