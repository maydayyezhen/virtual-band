import type { MusicAnalysis } from '../lighting/MusicAnalysis';
import type { TitleShow } from '../titles/TitleShow';

export function prepareBohemianTitles(music: MusicAnalysis): TitleShow {
  const text = { title: 'BOHEMIAN RHAPSODY', artist: 'QUEEN', credit: 'yezhen 制作' };
  return {
    cues: [
      { ...text, id: 'opening', start: 2, end: 13.5, fadeIn: 2.4, fadeOut: 2, placement: 'lower' },
      { ...text, id: 'closing', start: music.secondsAtBeat(466) + 1.5, end: music.duration - .8, fadeIn: 2.5, fadeOut: 2.6, placement: 'center' },
    ],
    blackout: { start: music.duration - 4, end: music.duration - .8 },
  };
}
