import type { AudioEngine } from '../AudioEngine';
import { Sf2Synth } from './Sf2Synth';

export class Sf2Experiment {
  readonly synth: Sf2Synth;

  constructor(audio: AudioEngine) {
    this.synth = new Sf2Synth(audio);
  }

  async load(url = '/soundfonts/FluidR3_GM.sf2'): Promise<{
    bytes: number;
    presets: number;
    violinPreset: string | null;
  }> {
    const font = await this.synth.load(url);
    const presets = font.listPresets();
    const violin = presets.find((preset) => preset.bank === 0 && preset.program === 40) ?? null;
    return {
      bytes: this.synth.byteLength,
      presets: presets.length,
      violinPreset: violin?.name ?? null,
    };
  }

  inspectViolin(note = 69, velocity = 100) {
    return this.synth.inspect(note, velocity, 40, 0);
  }

  async testViolin(seconds = 10, note = 69, velocity = 100): Promise<void> {
    if (!this.synth.isLoaded) await this.load();
    this.synth.programChange(40, 0);
    const voices = this.synth.noteOn(note, velocity);
    if (voices === 0) throw new Error(`SF2 violin has no playable region for MIDI note ${note}`);
    await wait(Math.max(0.1, seconds));
    this.synth.noteOff(note);
  }

  dispose(): void {
    this.synth.dispose();
  }
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
}
