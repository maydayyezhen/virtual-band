import * as THREE from 'three';
import type { InstrumentOrbitCameraView } from './CameraRegistry';

export function distanceForOrbitView(
  view: InstrumentOrbitCameraView,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const framing = view.viewportFraming;

  let framedHeight = view.height;
  let framedWidth = view.width;

  if (framing) {
    const compactBreakpoint = framing.compactHeightBreakpoint ?? 500;
    const reserved = height < compactBreakpoint
      ? (framing.compactReservedHeight ?? 0)
      : (framing.reservedHeight ?? 0);
    const usableHeight = Math.max(
      height - reserved,
      height * (framing.minUsableHeightRatio ?? 1),
    );

    const mobileBreakpoint = framing.mobileWidthBreakpoint ?? 600;
    const margin = width < mobileBreakpoint
      ? (framing.mobileHorizontalMargin ?? 0)
      : (framing.horizontalMargin ?? 0);
    const usableWidth = Math.max(width - margin, framing.minUsableWidth ?? 1);

    framedHeight = view.height * height / usableHeight;
    framedWidth = view.width * height / usableWidth;
  } else {
    framedWidth = view.width / Math.max(0.01, width / height);
  }

  return Math.max(framedHeight, framedWidth)
    / (2 * Math.tan(THREE.MathUtils.degToRad(view.fov / 2)));
}

export interface FramingOptions {
  fovDeg: number;
  aspect: number;
  yaw: number;
  pitch: number;
  /** Breathing room around the subject. 1 = the box corners land exactly on the frame edge. */
  padding?: number;
  /** Never place the camera closer than this. Defaults to the box's circumscribed radius. */
  minDistance?: number;
  maxDistance?: number;
}

export interface Framing {
  readonly target: THREE.Vector3;
  readonly distance: number;
}

/**
 * Distance and target that fit a bounding box into the frame.
 *
 * A circumscribed sphere is the wrong proxy for a band layout: the set is wide and flat, so
 * sphere-fitting backs the camera off until a full sphere fits and wastes most of the frame
 * (measured 43% width / 20% height fill on the shipped layout). This fits the box itself —
 * every corner has to clear both frustum half-angles at the chosen distance.
 */
export function frameBounds(bounds: THREE.Box3, options: FramingOptions): Framing | null {
  if (bounds.isEmpty()) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(options.fovDeg) / 2);
  const tanHorizontal = tanVertical * Math.max(options.aspect, 0.1);
  const padding = options.padding ?? 1.12;

  // Camera basis for the given orbit angles; mirrors the orbit-to-position mapping.
  const cosPitch = Math.cos(options.pitch);
  const back = new THREE.Vector3(
    Math.sin(options.yaw) * cosPitch,
    Math.sin(options.pitch),
    Math.cos(options.yaw) * cosPitch,
  );
  const right = new THREE.Vector3(back.z, 0, -back.x);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(back, right);

  const corner = new THREE.Vector3();
  let required = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).sub(center);
        const towardsCamera = corner.dot(back);
        const need = Math.max(
          Math.abs(corner.dot(right)) / tanHorizontal,
          Math.abs(corner.dot(up)) / tanVertical,
        ) + towardsCamera;
        if (need > required) required = need;
      }
    }
  }
  if (!Number.isFinite(required) || required <= 0) return null;

  const minDistance = options.minDistance ?? size.length() / 2;
  const maxDistance = options.maxDistance ?? 42;
  return {
    target: center,
    distance: THREE.MathUtils.clamp(required * padding, minDistance, maxDistance),
  };
}

/** Orbit camera position for a target/distance pair. */
export function orbitPosition(
  target: THREE.Vector3,
  distance: number,
  yaw: number,
  pitch: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const cosPitch = Math.cos(pitch);
  return out.set(
    target.x + Math.sin(yaw) * cosPitch * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * cosPitch * distance,
  );
}
