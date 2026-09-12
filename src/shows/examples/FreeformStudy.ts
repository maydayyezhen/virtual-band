import type { CameraShow, PositionedShot } from '../CameraShow';
import { createLightingProgram, prepareSectionShow, rgb, mixColor, smooth } from '../../lighting/index.ts';
import type { MusicAnalysis, LightingRig } from '../../lighting';

/** An original NOCTURNE study: no ConcertLook enum, no camera preset registration. */
export function prepareFreeformStudy(music: MusicAnalysis, rig: LightingRig) {
  const cyan = rgb('#65dce8'), gold = rgb('#efb771');
  const lighting = prepareSectionShow(createLightingProgram({
    id: 'freeform-wave', title: '自由创作 · 流动光廊', sections: [{ beat: 0, name: '光廊与升降镜头' }],
    effects: [{
      fixture: (_base, fixture, { music: f }) => {
        // Real fixture positions provide phase; independent of fixture count and catalogue names.
        const phase = f.quarter * Math.PI / 8 + fixture.position[0] * .16;
        const x = fixture.position[0] * .5 + Math.sin(phase) * 4;
        return { target: [x, 2 + (1 + Math.cos(phase)) * 3, 3 + Math.sin(phase * .5) * 3],
          color: mixColor(cyan, gold, (1 + Math.sin(phase * .4)) / 2),
          intensity: (.13 + .25 * f.strings + .24 * f.kick) * smooth((f.duration - f.t) / 6),
          angle: fixture.type === 'par' ? 22 : 2.5, beam: fixture.type !== 'par' };
      },
      pixel: (_base, pixel, { music: f }) => ({ color: mixColor(cyan, gold,
        (1 + Math.sin(pixel.index / Math.max(1, pixel.count) * Math.PI * 2 - f.quarter * .3)) / 2)
        .map(c => c * .24 * smooth((f.duration - f.t) / 6)) as [number, number, number] }),
      gobo: (_base, gobo, { music: f }) => ({ rotation: Math.sin(f.t * .08 + gobo.index) * .8,
        color: gold, opacity: .12 * smooth((f.duration - f.t) / 6) }),
      environment: (_base, { music: f }) => ({ key: 120 * smooth((f.duration - f.t) / 6), ambient: .12, hazeDensity: .18 }),
    }],
  }), music, rig);
  const first: PositionedShot = { position: [-7, 5, 29], target: [0, 4, 0], fov: 42 };
  const second: PositionedShot = { position: [8, 9, 24], target: [0, 4, 0], fov: 42 };
  const camera: CameraShow = { id: 'freeform-camera', duration: music.duration, cues: [
    { time: 0, name: '原创 · 低位升起的弧线', from: first,
      motion: ({ progress }) => ({ ...first, position: [-7 + 10 * progress, 5 + 5 * Math.sin(progress * Math.PI / 2), 29 - 5 * progress] }) },
    { time: 12, name: '原创 · 光廊前的缓慢游移', from: second,
      motion: ({ elapsed }) => ({ ...second, position: [8 * Math.cos(elapsed * .045), 9 + Math.sin(elapsed * .09), 24 + Math.sin(elapsed * .045) * 3] }),
      transition: { kind: 'custom', seconds: 2, sample: ({ from, to, progress }) => {
        const k = smooth(progress);
        return { position: from.position.map((v, i) => v + (to.position[i] - v) * k + (i === 1 ? Math.sin(Math.PI * k) * 1.5 : 0)) as PositionedShot['position'],
          target: from.target.map((v, i) => v + (to.target[i] - v) * k) as PositionedShot['target'], fov: from.fov + (to.fov - from.fov) * k };
      } },
    },
  ] };
  return { lighting, camera };
}
