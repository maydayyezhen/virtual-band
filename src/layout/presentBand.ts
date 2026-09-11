import * as THREE from 'three';
import { autoArrangeLayout, type InstrumentFootprint, type InstrumentFootprints } from './AutoLayout';
import { normalizeInstrument } from './BandPresentation';
import { createDefaultLayout, type LayoutDocument, type LayoutInstrumentType } from './LayoutDocument';

/**
 * Putting a band on a stage.
 *
 * This is the one place that turns "these instruments" into "here is the group to add to a scene".
 * A page asks for it and adds the result; it does not measure instruments, pack rows or convert
 * coordinates itself. The layout editor, the band view and a band assembled from a score all come
 * through here, so a layout cannot mean two different meanings depending on who built it.
 *
 * Two steps, because they are genuinely two things. `prepareMember` measures an instrument and
 * wraps it so its base sits on the deck and its footprint is centred — once, since wrapping twice
 * would nest one holder inside another. `presentBand` then arranges the prepared members, which is
 * pure placement and needs no model at all.
 *
 * Arranging is **additive**: every type stands where the home layout puts it, and extra instances
 * of a type stand beside their first one. Re-packing the whole band whenever the count changes
 * would move instruments nobody asked to move — adding a third guitar must not shift the drums.
 */

export interface PreparedMember {
  /** Instance name, e.g. `violin.2`. */
  readonly id: string;
  readonly type: LayoutInstrumentType;
  /** The model's wrapper, measured and scaled. */
  readonly holder: THREE.Group;
  /** Extent in venue metres. Two of a type measure the same. */
  readonly footprint: InstrumentFootprint;
}

export interface PresentedBand {
  /** Add this to the scene. Already lifted so instrument bases rest on the deck. */
  readonly group: THREE.Group;
  /** Member id → its holder, for anything that needs to find one again. */
  readonly holders: ReadonlyMap<string, THREE.Group>;
  /** Measured extent per type, reusable as a home layout's input. */
  readonly footprints: InstrumentFootprints;
}

/** Space between an instrument and the sibling added next to it. */
const SIBLING_GAP = 0.3;
/** How far each extra column steps away from the audience. */
const SIBLING_DEPTH = 0.9;

/**
 * Measure one instrument and wrap it so it is ready to stand on the deck.
 *
 * `stripUserData` defaults to false: a band that reacts to the pointer needs `userData.hit` and
 * `userData.instrumentId`, which the wrapping would otherwise clear.
 */
export function prepareMember(
  id: string,
  type: LayoutInstrumentType,
  root: THREE.Object3D,
  options: { stripUserData?: boolean } = {},
): PreparedMember {
  const normalized = normalizeInstrument(type, root, {
    stripUserData: options.stripUserData ?? false,
  });
  normalized.holder.name = `band:${id}`;
  return { id, type, holder: normalized.holder, footprint: normalized.footprint };
}

export function footprintsOf(members: readonly PreparedMember[]): InstrumentFootprints {
  const footprints = {} as InstrumentFootprints;
  for (const member of members) footprints[member.type] ??= member.footprint;
  return footprints;
}

/**
 * The standard arrangement of one of each instrument, which every band is grown from.
 *
 * It needs a footprint for all six types, so it is built from a complete six-instrument band
 * before that band is replaced by anything.
 */
export function createHomeLayout(footprints: InstrumentFootprints): LayoutDocument {
  return autoArrangeLayout(createDefaultLayout(), footprints);
}

/**
 * Which column a sibling stands in: 0 for the first, then right, left, two right, two left.
 *
 * Alternating rather than counting upwards keeps a pair or a trio centred on the spot its type
 * already occupies, instead of walking off the end of the stage.
 */
function siblingColumn(index: number): number {
  if (index === 0) return 0;
  return index % 2 === 1 ? Math.ceil(index / 2) : -index / 2;
}

export function presentBand(input: {
  readonly members: readonly PreparedMember[];
  /** Where each type stands, from `createHomeLayout` or a saved layout document. */
  readonly home: LayoutDocument;
  /** Deck height the band stands on. */
  readonly surfaceY?: number;
  /** The band is never placed behind this. Omit to allow anywhere. */
  readonly clearanceZ?: number;
}): PresentedBand {
  const { members, home, surfaceY = 0, clearanceZ = Number.NEGATIVE_INFINITY } = input;

  const group = new THREE.Group();
  group.name = 'band';
  group.position.y = surfaceY;

  const holders = new Map<string, THREE.Group>();
  const footprints = {} as InstrumentFootprints;
  const homeByType = new Map(home.instances.map((instance) => [instance.type, instance.transform]));
  const placedPerType = new Map<LayoutInstrumentType, number>();

  for (const member of members) {
    holders.set(member.id, member.holder);
    footprints[member.type] ??= member.footprint;

    const index = placedPerType.get(member.type) ?? 0;
    placedPerType.set(member.type, index + 1);

    const base = homeByType.get(member.type);
    const column = siblingColumn(index);
    // The holder already carries the lift that puts the model's base on y = 0; the layout's own y
    // is added to it rather than replacing it, or every instrument sinks by the lift.
    const lift = member.holder.position.y;
    member.holder.position.set(
      (base?.position[0] ?? 0) + column * (member.footprint.width + SIBLING_GAP),
      lift + (base?.position[1] ?? 0),
      Math.max((base?.position[2] ?? 0) - Math.abs(column) * SIBLING_DEPTH, clearanceZ),
    );
    member.holder.rotation.y = base?.rotation[1] ?? 0;
    if (base) member.holder.scale.multiplyScalar(base.scale);
    group.add(member.holder);
  }

  return { group, holders, footprints };
}
