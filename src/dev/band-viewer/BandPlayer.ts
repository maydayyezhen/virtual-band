import type { MidiPlayback } from '../../audio/MidiPlayback';
import type { BandPlan } from '../../midi/planBand';
import { VisualPerformance, type VisualNote } from '../../midi/VisualPerformance';
import type { BuiltBand } from './buildMidiBand';

/** Connect the library transport to the stage. This class cannot generate audio. */
export class BandPlayer {
  private readonly visuals: VisualPerformance;
  private readonly unsubscribe: () => void;
  constructor(private readonly options: {
    playback: MidiPlayback;
    band: BuiltBand;
    plan: BandPlan;
    onEnded?: () => void;
  }) {
    const instrumentFor = (note: VisualNote) => options.band.byKey.get(
      `${note.assignment.track.type}.${note.assignment.instance}`,
    )?.instrument;
    this.visuals = new VisualPerformance(options.plan,
      (note) => instrumentFor(note)?.visualNoteOn(note.note, note.velocity,
        note.assignment.tier ?? undefined, note.assignment.track.program),
      (note) => instrumentFor(note)?.visualNoteOff(note.note, note.assignment.tier ?? undefined),
    );
    this.unsubscribe = options.playback.onEnded(() => {
      this.visuals.clear();
      options.onEnded?.();
    });
  }
  get isPlaying(): boolean { return this.options.playback.isPlaying; }
  get time(): number { return this.options.playback.time; }
  get total(): number { return this.options.playback.total; }
  get scheduledNotes(): number { return this.visuals.noteCount; }
  async play(): Promise<void> {
    await this.options.playback.play();
    if (this.isPlaying) this.visuals.seek(this.time);
  }
  pause(): void { this.options.playback.pause(); this.visuals.clear(); }
  stop(): void { this.options.playback.stop(); this.visuals.clear(); }
  seek(seconds: number): void { this.options.playback.seek(seconds); this.visuals.clear(); }
  update(): void { if (this.isPlaying) this.visuals.update(this.time); }
  /** Export drives visual events with a fixed clock; it never starts the audio transport. */
  updateVisuals(time: number): void { this.visuals.update(time); }
  resumeFromSuspension(): void { if (this.isPlaying) this.visuals.seek(this.time); }
  dispose(): void { this.unsubscribe(); this.visuals.clear(); }
}
