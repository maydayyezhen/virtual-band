import type { LightingRig, PreparedLightingShow } from '../lighting/Lighting.ts';
import { MusicAnalysis } from '../lighting/MusicAnalysis.ts';
import { prepareSectionShow } from '../lighting/SectionShow.ts';
import { bohemianRhapsody } from '../lighting/shows/BohemianRhapsody.ts';
import type { ScreenContent } from '../screens/ScreenContent.ts';
import { bohemianTheatreContent } from '../screens/shows/BohemianTheatre.ts';
import { prepareBohemianCamera } from './BohemianCamera.ts';
import type { CameraShow } from './CameraShow';
import { prepareBohemianTitles } from './BohemianTitles.ts';
import type { TitleShow } from '../titles/TitleShow';

export interface PreparedBandShow { lighting: PreparedLightingShow; screens: ScreenContent; camera: CameraShow; titles: TitleShow }

/** Match exact MIDI content, never its filename: a different arrangement has different beats. */
export const SHOW_EXAMPLES = [{
  id: bohemianRhapsody.id,
  title: bohemianRhapsody.title,
  midiUrl: '/examples/bohemian-rhapsody/queen.mid',
  sha256: '5e468ed7b8f4f31b87fca059e60617b8089960a1b7dad1d406c1982320bd961a',
  prepare: (music: MusicAnalysis, rig: LightingRig): PreparedBandShow => ({
    lighting: prepareSectionShow(bohemianRhapsody, music, rig), screens: bohemianTheatreContent(music),
    camera: prepareBohemianCamera(music), titles: prepareBohemianTitles(music),
  }),
}] as const;

export async function prepareMatchingShow(binary: ArrayBuffer, rig: LightingRig): Promise<PreparedBandShow | null> {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', binary))].map(n => n.toString(16).padStart(2, '0')).join('');
  const entry = SHOW_EXAMPLES.find(example => example.sha256 === hash);
  return entry ? entry.prepare(new MusicAnalysis(binary), rig) : null;
}
