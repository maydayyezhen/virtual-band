import type * as THREE from 'three';
import { autoArrangeLayout, validateLayout } from './AutoLayout';
import { cloneLayout, createDefaultLayout, getInstrumentDefinition, type LayoutDocument, type LayoutInstrumentType } from './LayoutDocument';
import { prepareMember, footprintsOf, presentBand, type PreparedMember, type PresentedBand } from './presentBand';
import type { StageLayout } from '../venues/StageLayout';

export interface BandMember { id: string; type: LayoutInstrumentType; root: THREE.Object3D }
/** A prepared, validated replacement. Preparation never moves existing holders out of the live scene. */
export class BandSession {
  readonly members: readonly PreparedMember[];
  readonly layout: LayoutDocument;
  private constructor(members: readonly PreparedMember[], layout: LayoutDocument, private readonly stage: StageLayout) {
    this.members = members; this.layout = layout;
  }
  static prepare(members: readonly BandMember[], stage: StageLayout, previous?: BandSession | null): BandSession {
    const prepared = members.map(member => prepareMember(member.id, member.type, member.root));
    const previousById = new Map(previous?.layout.instances.map(instance => [instance.id, instance]));
    const source = createDefaultLayout();
    source.instances = members.map(member => {
      const saved = previousById.get(member.id);
      if (saved?.type === member.type) return cloneLayout({ ...source, instances: [saved] }).instances[0];
      return { id: member.id, type: member.type,
        transform: { position: [0, 0, 0], rotation: [0, getInstrumentDefinition(member.type).defaultYaw, 0], scale: 1 } };
    });
    source.venueId = stage.venueId;
    // Object reuse preserves identity, rotation and size. Only explicitly locked positions are fixed.
    const layout = autoArrangeLayout(source, footprintsOf(prepared), { stage });
    return new BandSession(prepared, layout, stage);
  }
  static fromLayout(members: readonly BandMember[], layout: LayoutDocument, stage: StageLayout): BandSession {
    if (members.length !== layout.instances.length || layout.instances.some(i => !members.some(m => m.id === i.id && m.type === i.type))) throw new Error('布局与乐器实例不匹配');
    const prepared = members.map(member => prepareMember(member.id, member.type, member.root));
    // Validate exact saved poses without silently rearranging any object.
    const issues = validateLayout(layout, footprintsOf(prepared), stage);
    if (issues.length) throw new Error(issues.join('；'));
    return new BandSession(prepared, cloneLayout(layout), stage);
  }
  rearrange(): BandSession {
    return new BandSession(this.members, autoArrangeLayout(this.layout, footprintsOf(this.members), { stage: this.stage }), this.stage);
  }
  apply(): PresentedBand { return presentBand({ members: this.members, home: this.layout, surfaceY: this.stage.surfaceY }); }
}
