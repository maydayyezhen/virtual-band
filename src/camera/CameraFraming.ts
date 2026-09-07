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
