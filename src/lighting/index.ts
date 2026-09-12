export type * from './Lighting';
export type * from './SectionShow';
export { prepareSectionShow } from './SectionShow.ts';
export { createLightingProgram, withLightingEffects, type LightingEffect } from './LightingProgram.ts';
export { createConcertShow, type ConcertSection } from './ConcertShow.ts';
export { MusicAnalysis } from './MusicAnalysis.ts';
export { rgb, mixColor, scaleColor, smooth, clamp } from './math.ts';
