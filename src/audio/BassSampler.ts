import { mixGain } from './AudioMixProfile';
import {
  BASS_PROGRAM_IDS,
  DEFAULT_BASS_PROGRAM,
  getBassProgram,
  type BassProgramId,
} from './BassProgram';
import type { ProgramToneBackend, ProgramTonePerformanceProfile } from './ProgramToneBackend';

/**
 * Per-program tone shaping. Values for the three programs that shipped first are the
 * tuned ones; the three added later are first guesses sitting between their neighbours
 * and are still waiting for a pass through the mix tuner.
 */
const PERFORMANCE_PROFILE: Readonly<Record<BassProgramId, ProgramTonePerformanceProfile>> = {
  32: { brightnessCents: -180, velocityToFilterCents: -820, filterEnvelopeScale: 0.9 },
  33: { brightnessCents: -100, velocityToFilterCents: -780, filterEnvelopeScale: 0.95 },
  34: { brightnessCents: 100, velocityToFilterCents: -650, filterEnvelopeScale: 1 },
  35: { brightnessCents: -60, velocityToFilterCents: -720, filterEnvelopeScale: 0.98 },
  36: { brightnessCents: 170, velocityToFilterCents: -520, filterEnvelopeScale: 1.08 },
  37: { brightnessCents: 200, velocityToFilterCents: -500, filterEnvelopeScale: 1.1 },
};

type BassGesture = 'gated' | 'pluck';

interface VoiceState {
  readonly note: number;
  readonly gesture: BassGesture;
  released: boolean;
}

export class BassSampler {
  private readonly backend: ProgramToneBackend;
  private readonly voices = new Map<number, VoiceState>();
  private sustain = false;
  private volume = 1;
  private pitchBend = 0;
  private programId: BassProgramId = DEFAULT_BASS_PROGRAM;

  constructor(backend: ProgramToneBackend) {
    this.backend = backend;
    this.backend.setProgram(this.programId, 0);
    this.backend.setPerformanceProfile(PERFORMANCE_PROFILE[this.programId]);
    this.applyOutputGain(0);
  }

  get program(): BassProgramId {
    return this.programId;
  }

  setProgram(value: number): boolean {
    const preset = getBassProgram(value);
    if (!preset) return false;
    this.reset();
    this.programId = preset.id;
    this.backend.setProgram(preset.id, 0);
    this.backend.setPerformanceProfile(PERFORMANCE_PROFILE[preset.id]);
    this.applyOutputGain(0.025);
    return true;
  }

  noteOn(stringNumber: number, note: number, velocity: number, gesture: BassGesture = 'gated'): void {
    if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 4) return;
    if (!Number.isInteger(note) || note < 0 || note > 127) return;
    this.muteString(stringNumber, 0.018);
    const options = gesture === 'pluck'
      ? { autoReleaseSeconds: 4.8, autoReleaseFadeSeconds: 0.22, gainScale: 0.96 }
      : undefined;
    if (!this.backend.noteOn(voiceId(stringNumber), note, velocity, options)) return;
    this.voices.set(stringNumber, { note, gesture, released: false });
  }

  noteOff(stringNumber: number): void {
    const state = this.voices.get(stringNumber);
    if (!state || state.gesture !== 'gated') return;
    state.released = true;
    if (!this.sustain) this.muteString(stringNumber, 0.12);
  }

  muteString(stringNumber: number, fadeSeconds = 0.04): void {
    if (!Number.isInteger(stringNumber) || stringNumber < 1 || stringNumber > 4) return;
    this.backend.noteOff(voiceId(stringNumber), Math.max(0.005, fadeSeconds));
    this.voices.delete(stringNumber);
  }

  setSustain(pressed: boolean): void {
    if (this.sustain === pressed) return;
    this.sustain = pressed;
    this.backend.setSustain(pressed);
    if (pressed) return;
    for (const [stringNumber, state] of this.voices) {
      if (state.released) this.muteString(stringNumber, 0.12);
    }
  }

  setPitchBend(value: number): boolean {
    if (!Number.isFinite(value) || value < -1 || value > 1) return false;
    this.pitchBend = value;
    return this.backend.setPitchBend(value);
  }

  setVolume(value: number): boolean {
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
    this.volume = value;
    this.applyOutputGain();
    return true;
  }

  preload(): Promise<boolean> {
    return this.backend.prepare();
  }

  stepProgram(delta: -1 | 1): BassProgramId {
    const index = BASS_PROGRAM_IDS.indexOf(this.programId);
    const next = (index + delta + BASS_PROGRAM_IDS.length) % BASS_PROGRAM_IDS.length;
    this.setProgram(BASS_PROGRAM_IDS[next]);
    return this.programId;
  }

  reset(): void {
    this.voices.clear();
    this.sustain = false;
    this.pitchBend = 0;
    this.backend.reset();
  }

  dispose(): void {
    this.reset();
    this.backend.dispose();
  }

  private applyOutputGain(rampSeconds = 0.025): void {
    this.backend.setGain(this.volume * mixGain('bass', this.programId), rampSeconds);
  }
}

function voiceId(stringNumber: number): string {
  return `string:${stringNumber}`;
}
