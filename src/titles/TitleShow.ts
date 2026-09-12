export interface TitleCue {
  id: string;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  title: string;
  artist: string;
  credit: string;
  placement: 'lower' | 'center';
}

export interface TitleShow {
  cues: readonly TitleCue[];
  /** Fade the complete composition to black at the end of the work. */
  blackout?: { start: number; end: number };
}

const smooth = (x: number) => { const p = Math.max(0, Math.min(1, x)); return p * p * (3 - 2 * p); };

/** Pure song-time evaluation: no timers, and no dependency on the camera or DOM. */
export function evaluateTitles(show: TitleShow | null, time: number) {
  const cue = Number.isFinite(time) ? show?.cues.find(c => time >= c.start && time < c.end) : undefined;
  const enter = cue ? smooth((time - cue.start) / Math.max(.001, cue.fadeIn)) : 0;
  const opacity = cue ? Math.min(enter, smooth((cue.end - time) / Math.max(.001, cue.fadeOut))) : 0;
  const blackout = show?.blackout;
  return { cue, opacity, lift: cue ? (1 - enter) * .012 : 0,
    blackout: blackout && Number.isFinite(time) ? smooth((time - blackout.start) / Math.max(.001, blackout.end - blackout.start)) : 0 };
}
