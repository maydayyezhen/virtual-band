import * as THREE from 'three';
import { normalizeInstrument } from './BandPresentation';
import type { InstrumentFootprint, InstrumentFootprints } from './AutoLayout';
import type { LayoutDocument, LayoutInstrumentType } from './LayoutDocument';

export interface PreparedMember {
  readonly id: string;
  readonly type: LayoutInstrumentType;
  readonly holder: THREE.Group;
  readonly footprint: InstrumentFootprint;
}
export interface PresentedBand {
  readonly group: THREE.Group;
  readonly holders: ReadonlyMap<string, THREE.Group>;
}
const prepared = new WeakMap<THREE.Object3D, PreparedMember>();

/** Normalize once. The outer holder is the placement transform; its child owns asset scale/offset. */
export function prepareMember(id: string, type: LayoutInstrumentType, root: THREE.Object3D): PreparedMember {
  const existing = prepared.get(root);
  if (existing) {
    if (existing.id !== id || existing.type !== type) throw new Error('已归一化的乐器不能更换身份');
    return existing;
  }
  const normalized = normalizeInstrument(type, root, { stripUserData: false });
  normalized.holder.name = `band:${id}`;
  const member = { id, type, holder: normalized.holder, footprint: normalized.footprint };
  prepared.set(root, member);
  return member;
}
export function footprintsOf(members: readonly PreparedMember[]): InstrumentFootprints {
  return Object.fromEntries(members.map(member => [member.id, member.footprint]));
}

/** Apply exactly the document, by ID. No packing, scaling accumulation or coordinate clipping. */
export function presentBand(input: { members: readonly PreparedMember[]; home: LayoutDocument; surfaceY: number }): PresentedBand {
  const slots = new Map(input.home.instances.map(instance => [instance.id, instance]));
  if (slots.size !== input.home.instances.length || new Set(input.members.map(m => m.id)).size !== input.members.length) throw new Error('重复的布局实例 ID');
  if (slots.size !== input.members.length) throw new Error('布局与乐器实例数量不一致');
  for (const member of input.members) {
    if (slots.get(member.id)?.type !== member.type) throw new Error(`布局中缺少 ${member.id} 或类型不一致`);
  }
  const group = new THREE.Group();
  group.name = 'band'; group.position.y = input.surfaceY;
  const holders = new Map<string, THREE.Group>();
  for (const member of input.members) {
    const transform = slots.get(member.id)!.transform;
    member.holder.position.set(...transform.position);
    member.holder.rotation.set(...transform.rotation);
    member.holder.scale.setScalar(transform.scale);
    group.add(member.holder); holders.set(member.id, member.holder);
  }
  group.updateMatrixWorld(true);
  return { group, holders };
}
