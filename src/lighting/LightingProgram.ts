import type { FixtureDescriptor, FixtureFrame, GoboDescriptor, LightingFrame, PixelDescriptor } from './Lighting';
import type { SectionContext, SectionShow, ShowSection } from './SectionShow';

type PixelFrame = LightingFrame['pixels'][number];
type GoboFrame = LightingFrame['gobos'][number];
/** Functions, not a fixed catalogue of effect names. Values are recomputed from absolute song time. */
export interface LightingEffect<S extends ShowSection = ShowSection> {
  fixture?(base: Readonly<FixtureFrame>, fixture: FixtureDescriptor, context: SectionContext<S>): Partial<Omit<FixtureFrame, 'id'>>;
  pixel?(base: Readonly<PixelFrame>, pixel: PixelDescriptor, context: SectionContext<S>): Partial<Omit<PixelFrame, 'id'>>;
  gobo?(base: Readonly<GoboFrame>, gobo: GoboDescriptor, context: SectionContext<S>): Partial<Omit<GoboFrame, 'id'>>;
  environment?(base: Readonly<LightingFrame['environment']>, context: SectionContext<S>): Partial<LightingFrame['environment']>;
  master?(base: number, context: SectionContext<S>): number;
}

/** Compose original effects over any existing show. Later effects receive this frame's earlier output. */
export function withLightingEffects<S extends ShowSection>(show: SectionShow<S>, effects: readonly LightingEffect<S>[]): SectionShow<S> {
  if (!effects.length) return show;
  return { ...show, evaluate(context) {
    const rig = context.rig;
    let frame = show.evaluate(context);
    for (const effect of effects) {
      frame = { ...frame,
        fixtures: effect.fixture ? frame.fixtures.map(base => {
          const descriptor = rig.fixtures.find(f => f.id === base.id);
          if (!descriptor) throw new Error(`未知灯具：${base.id}`);
          return { ...base, ...effect.fixture!(base, descriptor, context), id: base.id };
        }) : frame.fixtures,
        pixels: effect.pixel ? frame.pixels.map(base => {
          const descriptor = rig.pixels.find(p => p.id === base.id);
          if (!descriptor) throw new Error(`未知灯带单元：${base.id}`);
          return { ...base, ...effect.pixel!(base, descriptor, context), id: base.id };
        }) : frame.pixels,
        gobos: effect.gobo ? frame.gobos.map(base => {
          const descriptor = rig.gobos.find(g => g.id === base.id);
          if (!descriptor) throw new Error(`未知图案灯：${base.id}`);
          return { ...base, ...effect.gobo!(base, descriptor, context), id: base.id };
        }) : frame.gobos,
        environment: effect.environment ? { ...frame.environment, ...effect.environment(frame.environment, context) } : frame.environment,
        master: effect.master ? effect.master(frame.master, context) : frame.master,
      };
    }
    return frame;
  } };
}

/** Start an original show on a complete neutral rig, without borrowing any ConcertLook. */
export function createLightingProgram<S extends ShowSection>(options: {
  id: string; title: string; sections: readonly S[]; transitionSeconds?: number;
  effects: readonly LightingEffect<S>[];
}): SectionShow<S> {
  const { effects, ...metadata } = options;
  return withLightingEffects({ ...metadata, transitionSeconds: options.transitionSeconds ?? 0,
    evaluate({ music, current, rig }): LightingFrame {
      return { time: music.t, section: current.name, master: 1,
        fixtures: rig.fixtures.map(f => ({ id: f.id, target: [0, 0, 0], color: [1, 1, 1], intensity: 0,
          angle: 3, distance: 65, beam: f.type === 'beam' })),
        pixels: rig.pixels.map(p => ({ id: p.id, color: [0, 0, 0] })),
        gobos: rig.gobos.map(g => ({ id: g.id, color: [1, 1, 1], opacity: 0, rotation: 0 })),
        environment: { key: 0, ambient: .1, background: [0, 0, 0], hazeDensity: .15, hazeTime: music.t * .12 },
      };
    },
  }, effects);
}
