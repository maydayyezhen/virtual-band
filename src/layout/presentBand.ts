import * as THREE from 'three';
import { autoArrangeLayout, type InstrumentFootprint, type InstrumentFootprints } from './AutoLayout';
import { normalizeInstrument } from './BandPresentation';
import {
  createDefaultLayout,
  LAYOUT_INSTRUMENTS,
  type LayoutDocument,
  type LayoutInstrumentInstance,
  type LayoutInstrumentType,
  type LayoutTransform,
} from './LayoutDocument';

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
 * Arranging is the layout engine's job and nothing else's. Every member is placed at the instance
 * the engine gave its type — the first keyboard where the document puts the first keyboard, the
 * third where it puts the third. A band from a score therefore stands exactly where the same
 * document stands in the layout editor, and the only thing a score changes is how many instances
 * the document has.
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

/** How many of each instrument a band has. A missing type is not on stage. */
export type BandComposition = Partial<Record<LayoutInstrumentType, number>>;

/**
 * A layout for a band of a given size, arranged by the layout engine.
 *
 * This is the one way a composition becomes positions, whether the composition is "one of
 * everything" or "what a score asked for". The document it returns is an ordinary layout
 * document — the layout editor can open it, and it means the same thing there.
 *
 * Footprints must cover all six types, including any the band leaves out: row packing asks how
 * wide an instrument is, not whether this band happens to have one, and answering that from the
 * band at hand would make the arrangement depend on what a score omitted.
 */
export function bandLayout(
  composition: BandComposition,
  footprints: InstrumentFootprints,
): LayoutDocument {
  const document = createDefaultLayout();
  document.instances = LAYOUT_INSTRUMENTS.flatMap((definition) => {
    const count = Math.max(0, Math.floor(composition[definition.id] ?? 0));
    return Array.from({ length: count }, (_, index): LayoutInstrumentInstance => ({
      id: `${definition.id}-${index + 1}`,
      type: definition.id,
      transform: { position: [0, 0, 0], rotation: [0, definition.defaultYaw, 0], scale: 1 },
    }));
  });
  return autoArrangeLayout(document, footprints);
}

/** One of every instrument, which is the band the page opens with. */
export function createHomeLayout(footprints: InstrumentFootprints): LayoutDocument {
  return bandLayout({ drums: 1, keyboard: 1, violin: 1, electric: 1, acoustic: 1, bass: 1 }, footprints);
}

export function presentBand(input: {
  readonly members: readonly PreparedMember[];
  /** Where every member stands, from `bandLayout` or a saved layout document. */
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
  // Instances of a type in document order, so the n-th member of a type reads the n-th slot. The
  // engine has already decided where each one stands; this only pairs them up.
  const slotsByType = new Map<LayoutInstrumentType, LayoutTransform[]>();
  for (const instance of home.instances) {
    const slots = slotsByType.get(instance.type);
    if (slots) slots.push(instance.transform);
    else slotsByType.set(instance.type, [instance.transform]);
  }
  const placedPerType = new Map<LayoutInstrumentType, number>();

  for (const member of members) {
    holders.set(member.id, member.holder);
    footprints[member.type] ??= member.footprint;

    const index = placedPerType.get(member.type) ?? 0;
    placedPerType.set(member.type, index + 1);

    const slots = slotsByType.get(member.type) ?? [];
    const base = slots[index];
    if (!base) {
      throw new Error(
        `布局里没有 ${member.type} 的第 ${index + 1} 个位置：` +
          `编制说有 ${index + 1} 件，文档只有 ${slots.length} 个槽位`,
      );
    }
    // The holder already carries the lift that puts the model's base on y = 0; the layout's own y
    // is added to it rather than replacing it, or every instrument sinks by the lift.
    const lift = member.holder.position.y;
    member.holder.position.set(
      base.position[0],
      lift + base.position[1],
      Math.max(base.position[2], clearanceZ),
    );
    member.holder.rotation.y = base.rotation[1];
    member.holder.scale.multiplyScalar(base.scale);
    group.add(member.holder);
  }

  return { group, holders, footprints };
}
