import type { ShowDefinition } from './ShowDefinition';
import { prepareSectionShow } from '../lighting/SectionShow.ts';
import { bohemianRhapsody } from '../lighting/shows/BohemianRhapsody.ts';
import { bohemianTheatreContent } from '../screens/shows/BohemianTheatre.ts';
import { prepareBohemianCamera } from './BohemianCamera.ts';
import { prepareBohemianTitles } from './BohemianTitles.ts';

export const bohemianShow: ShowDefinition = {
  id: bohemianRhapsody.id, title: bohemianRhapsody.title,
  artist: 'QUEEN', credit: 'yezhen 制作',
  midiUrl: '/examples/bohemian-rhapsody/queen.mid',
  sha256: '5e468ed7b8f4f31b87fca059e60617b8089960a1b7dad1d406c1982320bd961a',
  menu: {
    title: 'Bohemian Rhapsody', subtitle: '波西米亚狂想曲', duration: '05:29',
    cover: '/artwork/bohemian-cover.png', previewAt: 36, previewSeconds: 25,
    description: '从一声低语，到整座剧院的回响。让七幕光影，陪这首狂想曲走到最后。',
  },
  offline: { supported: true },
  prepare: (music, rig) => ({
    lighting: prepareSectionShow(bohemianRhapsody, music, rig), screens: bohemianTheatreContent(music),
    camera: prepareBohemianCamera(music), titles: prepareBohemianTitles(music),
  }),
};
