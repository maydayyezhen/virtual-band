import type { LightingFrame, LightingRig, PreparedLightingShow } from './Lighting.ts';
import type { MusicAnalysis, MusicFrame } from './MusicAnalysis.ts';
import { smooth } from './math.ts';

export interface ShowSection { beat: number; name: string }
export interface SectionContext<S extends ShowSection> {
  music: MusicFrame;
  current: S;
  previous: S;
  transition: number;
  rig: LightingRig;
}
export interface SectionShow<S extends ShowSection> {
  id: string;
  title: string;
  sections: readonly S[];
  transitionSeconds: number;
  evaluate(context: SectionContext<S>): LightingFrame;
}
/** Song modules only supply section data and a pure evaluator. No DOM, audio or frame loop. */
export function prepareSectionShow<S extends ShowSection>(show: SectionShow<S>, score: MusicAnalysis, rig: LightingRig): PreparedLightingShow {
  if (!show.sections.length || show.sections[0].beat !== 0 || !Number.isFinite(show.transitionSeconds) || show.transitionSeconds < 0)
    throw new Error('Show must start at beat zero with a finite transition');
  const sections = show.sections.map((section, index) => {
    if (!Number.isFinite(section.beat) || (index > 0 && section.beat <= show.sections[index - 1].beat)) throw new Error('Show sections must increase by beat');
    const time = score.secondsAtBeat(section.beat);
    if (time > score.duration) throw new Error(`Show section starts after the music ends: ${section.name}`);
    return { ...section, time };
  });
  return { id: show.id, title: show.title, sections,
    evaluate(seconds) {
      const music = score.at(seconds);
      let index = 0;
      while (index + 1 < sections.length && sections[index + 1].time <= music.t) index++;
      return show.evaluate({ music, current: sections[index], previous: sections[Math.max(0, index - 1)], rig,
        transition: index && show.transitionSeconds > 0 ? smooth((music.t - sections[index].time) / show.transitionSeconds) : 1 });
    },
  };
}
