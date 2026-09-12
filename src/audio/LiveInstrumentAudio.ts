import type { LiveAudioEngine } from './LiveAudioEngine';
import type { KeyboardAudio, KeyboardTier, StringGesture, ViolinAudio, DrumAudio } from './InstrumentAudio';
import { HI_HAT_NOTES } from './InstrumentAudio';
import { VIOLIN_PROGRAM_IDS, DEFAULT_VIOLIN_PROGRAM } from './ViolinProgram';

export class LiveKeyboardAudio implements KeyboardAudio {
  private readonly tiers;
  constructor(host: LiveAudioEngine) { this.tiers = { lower: host.allocate(0), upper: host.allocate(89) }; }
  program(tier: KeyboardTier): number { return this.tiers[tier].program; }
  setProgram(tier: KeyboardTier, program: number): boolean { return this.tiers[tier].setProgram(program); }
  noteOn(tier: KeyboardTier, note: number, velocity: number, source = 'runtime'): void {
    this.tiers[tier].noteOn(`${source}:${note}`, note, velocity);
  }
  noteOff(tier: KeyboardTier, note: number, source = 'runtime'): void { this.tiers[tier].noteOff(`${source}:${note}`); }
  setSustain(tier: KeyboardTier, pressed: boolean): void { this.tiers[tier].cc(64, pressed ? 127 : 0); }
  setPitchBend(tier: KeyboardTier, value: number): boolean { return this.tiers[tier].setPitchBend(value); }
  reset(): void { Object.values(this.tiers).forEach((channel) => channel.reset()); }
  dispose(): void { Object.values(this.tiers).forEach((channel) => channel.dispose()); }
}

/** One channel per string gives same-pitch strings independent release and mute. */
export class LiveStringAudio<P extends number> {
  private readonly strings;
  private readonly gestures = new Map<number, StringGesture>();
  program: P;
  constructor(host: LiveAudioEngine, private readonly programs: readonly P[], program: P, count: number) {
    this.program = program;
    this.strings = Array.from({ length: count }, () => host.allocate(program));
  }
  setProgram(value: number): boolean {
    if (!this.programs.includes(value as P)) return false;
    this.program = value as P;
    this.strings.forEach((channel) => channel.setProgram(value));
    return true;
  }
  stepProgram(delta: number): P {
    const index = this.programs.indexOf(this.program);
    const next = ((index + Math.trunc(delta)) % this.programs.length + this.programs.length) % this.programs.length;
    this.setProgram(this.programs[next]);
    return this.program;
  }
  noteOn(string: number, note: number, velocity: number, gesture: StringGesture = 'gated'): void {
    const channel = this.strings[string - 1];
    if (!channel) return;
    this.gestures.set(string, gesture);
    // A physical pluck rings independently of pointer-up; SF2 controls its decay.
    channel.noteOn('string', note, velocity, gesture === 'gated' ? undefined : 6);
  }
  noteOff(string: number): void { if (this.gestures.get(string) === 'gated') this.strings[string - 1]?.noteOff('string'); }
  noteOffPitch(note: number): void {
    this.strings.forEach((channel, index) => {
      if (this.gestures.get(index + 1) === 'gated') channel.releasePitch(note);
    });
  }
  muteString(string: number): void { this.strings[string - 1]?.silence(); this.gestures.delete(string); }
  setSustain(pressed: boolean): void { this.strings.forEach((channel) => channel.cc(64, pressed ? 127 : 0)); }
  setPitchBend(value: number): boolean { return this.strings.map((channel) => channel.setPitchBend(value)).every(Boolean); }
  setVolume(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    this.strings.forEach((channel) => channel.cc(7, value * 127));
    return true;
  }
  setTone(value: number): void { this.strings.forEach((channel) => channel.cc(74, value * 127)); }
  // GM has no physical pickup selector; map the existing control to channel brightness.
  setPickup(value: number): void { this.setTone(0.35 + Math.max(0, Math.min(2, value)) * 0.3); }
  reset(): void { this.gestures.clear(); this.strings.forEach((channel) => channel.reset()); }
  dispose(): void { this.gestures.clear(); this.strings.forEach((channel) => channel.dispose()); }
}

export class LiveViolinAudio implements ViolinAudio {
  private readonly arco;
  private readonly pizzicato;
  program: number = DEFAULT_VIOLIN_PROGRAM;
  constructor(host: LiveAudioEngine) {
    this.arco = Array.from({ length: 4 }, () => host.allocate(this.program));
    this.pizzicato = Array.from({ length: 4 }, () => host.allocate(45));
  }
  setProgram(value: number): boolean {
    if (!(VIOLIN_PROGRAM_IDS as readonly number[]).includes(value)) return false;
    this.program = value;
    this.arco.forEach((channel) => channel.setProgram(value));
    return true;
  }
  noteOn(string: number, note: number, velocity: number, articulation: 'arco' | 'pizzicato'): void {
    this.arco[string - 1]?.noteOff('string');
    this.pizzicato[string - 1]?.noteOff('string');
    const channel = (articulation === 'arco' ? this.arco : this.pizzicato)[string - 1];
    channel?.noteOn('string', note, velocity, articulation === 'pizzicato' ? 3 : undefined);
  }
  noteOff(string: number): number {
    this.arco[string - 1]?.noteOff('string');
    // Visual bow release estimate, not a replacement for the SF2 audio envelope.
    return 0.12;
  }
  noteOffPitch(note: number): number {
    this.arco.forEach((channel) => channel.releasePitch(note));
    return 0.12;
  }
  setPitchBend(value: number): boolean { return [...this.arco, ...this.pizzicato].map((channel) => channel.setPitchBend(value)).every(Boolean); }
  reset(): void { [...this.arco, ...this.pizzicato].forEach((channel) => channel.reset()); }
  dispose(): void { [...this.arco, ...this.pizzicato].forEach((channel) => channel.dispose()); }
}

export class LiveDrumAudio implements DrumAudio {
  private readonly channel;
  constructor(host: LiveAudioEngine) { this.channel = host.allocate(0, true); }
  get program(): number { return this.channel.program; }
  setProgram(value: number): boolean { return this.channel.setProgram(value); }
  noteOn(note: number, velocity = 100): void {
    this.channel.noteOn(`drum:${note}`, note, velocity, note === HI_HAT_NOTES.open ? 4 : 0.25);
  }
  setHiHatOpenness(value: number): void { if (value < 0.2) this.chokeHiHat(); }
  hitHiHat(openness: number, velocity: number): void {
    this.setHiHatOpenness(openness);
    this.noteOn(openness > 0.16 ? HI_HAT_NOTES.open : HI_HAT_NOTES.closed, velocity);
  }
  chokeHiHat(): void { this.channel.noteOff(`drum:${HI_HAT_NOTES.open}`); }
  resetHiHat(): void { this.channel.reset(); }
  dispose(): void { this.channel.dispose(); }
}
