import type { MusicAnalysis } from '../../lighting/MusicAnalysis';
import { BOHEMIAN_SECTIONS } from '../../lighting/shows/BohemianRhapsody.ts';
import type { ScreenContent } from '../ScreenContent';
import { createMidiTheatre } from './MidiTheatre.js';

/** Song arrangement is a regular content factory, independent of the venue and lighting session. */
export function bohemianTheatreContent(music: MusicAnalysis): ScreenContent {
  return {
    label: '波西米亚 · 七幕剧场',
    create(screen, signal) {
      signal.throwIfAborted();
      if (!['main', 'left', 'right'].includes(screen.id)) throw new Error(`剧场未编排此屏幕：${screen.id}`);
      const theatre = createMidiTheatre(music);
      const surface = document.createElement('canvas');
      surface.width = screen.pixelWidth; surface.height = screen.pixelHeight;
      const ctx = surface.getContext('2d');
      if (!ctx) throw new Error('无法创建剧场画布');
      let previous = NaN, disposed = false;
      return {
        surface,
        update(frame) {
          if (disposed) return false;
          const f = music.at(frame.time);
          if (f.t === previous) return false;
          let chapter = BOHEMIAN_SECTIONS[0];
          for (const section of BOHEMIAN_SECTIONS) { if (section.beat > f.quarter) break; chapter = section; }
          theatre.draw(ctx, { screen, width: surface.width, height: surface.height }, { ...f, chapter });
          // Reference's per-wing balance and final blackout belong to this content, not the venue.
          const x = Math.max(0, Math.min(1, (music.duration - f.t) / 9));
          const tail = x * x * (3 - 2 * x);
          const gain = Math.min(1, (.60 + .28 * chapter.power) * tail * theatre.screenWeight(screen.id, f.t));
          ctx.save(); ctx.globalAlpha = 1 - gain; ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, surface.width, surface.height); ctx.restore();
          previous = f.t;
          return true;
        },
        dispose() { if (disposed) return; disposed = true; theatre.dispose(); surface.width = surface.height = 1; },
      };
    },
  };
}
