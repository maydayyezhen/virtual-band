import { cloneLayout, getInstrumentDefinition, type LayoutDocument, type LayoutInstrumentInstance } from './LayoutDocument.ts';
import type { StageLayout } from '../venues/StageLayout.ts';
import { arrangeFormation, validateFormation, type FormationMember } from './Formation.ts';

export interface InstrumentFootprint { width: number; depth: number }
export type InstrumentFootprints = Partial<Record<string, InstrumentFootprint>>;
export interface LayoutResult { layout: LayoutDocument; unplaced: string[]; issues: string[] }
export interface ArrangeOptions { stage: StageLayout; lockedIds?: ReadonlySet<string> }

/** Rotated, conservative occupation rectangle: measured geometry plus room to perform. */
export function occupation(instance: LayoutInstrumentInstance, footprints: InstrumentFootprints): InstrumentFootprint {
  const measured = footprints[instance.id] ?? footprints[instance.type];
  if (!measured || ![measured.width, measured.depth].every(n => Number.isFinite(n) && n > 0)) throw new Error(`自动排布缺少 ${instance.id} 的有效尺寸`);
  const space = getInstrumentDefinition(instance.type).space;
  const width = Math.max(measured.width, space.width) * instance.transform.scale;
  const depth = Math.max(measured.depth, space.depth) * instance.transform.scale;
  const c = Math.abs(Math.cos(instance.transform.rotation[1])), s = Math.abs(Math.sin(instance.transform.rotation[1]));
  return { width: c * width + s * depth, depth: s * width + c * depth };
}

/** Adapt the application catalog/document into renderer-independent formation descriptions. */
function describe(source: LayoutDocument, footprints: InstrumentFootprints, lockedIds?: ReadonlySet<string>): FormationMember[] {
  return source.instances.map(instance => {
    if (!Number.isFinite(instance.transform.scale) || instance.transform.scale <= 0 || ![...instance.transform.position, ...instance.transform.rotation].every(Number.isFinite)) throw new Error(`${instance.id} 变换无效`);
    if (Math.abs(instance.transform.rotation[0]) > 1e-6 || Math.abs(instance.transform.rotation[2]) > 1e-6) throw new Error(`${instance.id} 仅支持水平旋转`);
    return { id: instance.id, ...occupation(instance, footprints), role: getInstrumentDefinition(instance.type).placement,
      position: { x: instance.transform.position[0], z: instance.transform.position[2] }, locked: !!instance.locked || !!lockedIds?.has(instance.id) };
  });
}

export function validateLayout(source: LayoutDocument, footprints: InstrumentFootprints, stage: StageLayout): string[] {
  if (source.venueId !== stage.venueId) return ['布局与当前场馆不匹配'];
  try { return validateFormation(describe(source, footprints), stage); }
  catch (error) { return [String(error)]; }
}

/** Pure planning: failed layouts never mutate the source document or the live scene. */
export function arrangeLayout(source: LayoutDocument, footprints: InstrumentFootprints, options: ArrangeOptions): LayoutResult {
  if (!options?.stage) throw new Error('自动编队必须显式提供场馆空间约束');
  const layout = cloneLayout(source);
  if (source.venueId !== options.stage.venueId) return { layout, unplaced: [], issues: ['布局与当前场馆不匹配'] };
  let members: FormationMember[];
  try { members = describe(source, footprints, options.lockedIds); }
  catch (error) { return { layout, unplaced: [], issues: [String(error)] }; }
  const result = arrangeFormation(members, options.stage);
  if (!result.issues.length) for (const instance of layout.instances) {
    const p = result.positions.get(instance.id)!;
    instance.transform.position = [p.x, instance.transform.position[1], p.z];
  }
  return { layout, unplaced: result.unplaced, issues: result.issues };
}
export function autoArrangeLayout(source: LayoutDocument, footprints: InstrumentFootprints, options: ArrangeOptions): LayoutDocument {
  const result = arrangeLayout(source, footprints, options);
  if (result.issues.length) throw new Error(result.issues.join('；'));
  return result.layout;
}
