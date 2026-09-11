import * as THREE from 'three';
import type { InstrumentFootprint } from './AutoLayout';
import { getInstrumentDefinition, type LayoutInstrumentType } from './LayoutDocument';

/**
 * Presentation scale for the six instruments.
 *
 * `LayoutDocument.targetHeight` stays the real-world reference in metres, but a life-size
 * band reads as miniature clutter on the 30 m NOCTURNE stage, so the band is presented
 * larger than life. 1 = real metres. Tune this single number to change how large the band
 * sits on the stage.
 */
export const BAND_SCALE = 1.5;

export interface NormalizedInstrument {
  /** Donor model wrapped so its base sits on y = 0 and its footprint is centred on x/z. */
  readonly holder: THREE.Group;
  readonly footprint: InstrumentFootprint;
  /** Presented height in metres, i.e. targetHeight * BAND_SCALE. */
  readonly height: number;
  /** Scale applied to the donor model. */
  readonly scale: number;
}

export interface NormalizeOptions {
  /**
   * Clear `userData` on every node. The layout editor wants this so donor interaction tags
   * cannot leak into a placement document; the band view must keep them, because
   * `InstrumentInteractionSystem` hit-tests `userData.hit` / `userData.instrumentId`.
   */
  stripUserData?: boolean;
}

/**
 * Single source of truth for instrument size. Both the layout editor and the read-only
 * band view call this so a layout can never mean two different things.
 */
export function normalizeInstrument(
  type: LayoutInstrumentType,
  modelRoot: THREE.Object3D,
  options: NormalizeOptions = {},
): NormalizedInstrument {
  const definition = getInstrumentDefinition(type);
  const targetHeight = definition.targetHeight * BAND_SCALE;
  const stripUserData = options.stripUserData ?? true;

  const holder = new THREE.Group();
  holder.name = `band:${type}`;
  holder.add(modelRoot);
  holder.updateMatrixWorld(true);

  const rawBounds = new THREE.Box3().setFromObject(holder);
  const rawHeight = rawBounds.max.y - rawBounds.min.y;
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) throw new Error(`无法测量乐器高度：${type}`);

  const scale = targetHeight / rawHeight;
  holder.scale.setScalar(scale);
  holder.position.y = -rawBounds.min.y * scale;
  holder.updateMatrixWorld(true);

  const size = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());

  holder.traverse((object) => {
    if (stripUserData) object.userData = {};
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return {
    holder,
    footprint: { width: size.x, depth: size.z },
    height: targetHeight,
    scale,
  };
}
