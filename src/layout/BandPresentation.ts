import * as THREE from 'three';
import type { InstrumentFootprint } from './AutoLayout';
import { getInstrumentDefinition, type LayoutInstrumentType } from './LayoutDocument';

/** Normalize assets to real metres. Display scale belongs to each layout instance. */
export const BAND_SCALE = 1;

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
  const assetFrame = new THREE.Group();
  assetFrame.name = 'asset:meter-normalization';
  assetFrame.add(modelRoot);
  holder.add(assetFrame);
  holder.updateMatrixWorld(true);

  const rawBounds = new THREE.Box3().setFromObject(holder);
  const rawHeight = rawBounds.max.y - rawBounds.min.y;
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) throw new Error(`无法测量乐器高度：${type}`);

  const scale = targetHeight / rawHeight;
  const center = rawBounds.getCenter(new THREE.Vector3());
  assetFrame.scale.setScalar(scale);
  assetFrame.position.set(-center.x * scale, -rawBounds.min.y * scale, -center.z * scale);
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
