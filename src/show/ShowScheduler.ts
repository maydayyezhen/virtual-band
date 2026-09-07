export type ShowChannel = 'camera' | 'lighting' | 'screen';

export interface ShowCue {
  id: string;
  at: number;
  channel: ShowChannel;
  action: string;
  target?: string;
  payload?: Record<string, unknown>;
}

export interface ShowPlan {
  id: string;
  songId: string;
  cues: ShowCue[];
}

type CueListener = (cue: ShowCue) => void;

export class ShowScheduler {
  private plan: ShowPlan | null = null;
  private cursor = 0;
  private lastTime = 0;
  private readonly listeners = new Set<CueListener>();

  setPlan(plan: ShowPlan | null): void {
    this.plan = plan ? { ...plan, cues: [...plan.cues].sort((a, b) => a.at - b.at) } : null;
    this.cursor = 0;
    this.lastTime = 0;
  }

  subscribe(listener: CueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(time: number): void {
    if (!this.plan) return;
    if (time < this.lastTime) this.seek(time);
    while (this.cursor < this.plan.cues.length && this.plan.cues[this.cursor].at <= time) {
      const cue = this.plan.cues[this.cursor++];
      for (const listener of this.listeners) listener(cue);
    }
    this.lastTime = time;
  }

  seek(time: number): void {
    this.lastTime = Math.max(0, time || 0);
    this.cursor = 0;
    if (!this.plan) return;
    while (this.cursor < this.plan.cues.length && this.plan.cues[this.cursor].at < this.lastTime) this.cursor++;
  }

  get cueCount(): number {
    return this.plan?.cues.length ?? 0;
  }
}
