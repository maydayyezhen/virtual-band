import {
  DEFAULT_ACOUSTIC_GUITAR_PROGRAM,
} from '../AcousticGuitarProgram';
import { AcousticGuitarSampler } from '../AcousticGuitarSampler';
import { DEFAULT_BASS_PROGRAM } from '../BassProgram';
import { BassSampler } from '../BassSampler';
import { AudioEngine } from '../AudioEngine';
import { DrumSampler } from '../DrumSampler';
import {
  DEFAULT_ELECTRIC_GUITAR_PROGRAM,
} from '../ElectricGuitarProgram';
import { ElectricGuitarSampler } from '../ElectricGuitarSampler';
import { KeyboardSampler } from '../KeyboardSampler';
import { SampleLibrary } from '../SampleLibrary';
import { ViolinSampler } from '../ViolinSampler';
import { Sf2BankLibrary } from '../sf2/Sf2BankLibrary';
import { Sf2KeyboardBackend } from '../sf2/Sf2KeyboardBackend';
import { Sf2ProgramBackend } from '../sf2/Sf2ProgramBackend';
import { Sf2ViolinBackend } from '../sf2/Sf2ViolinBackend';
import type { CalibrationTarget } from './CalibrationTargets';

export type CalibrationAudioSource = 'SF2' | 'MP3 fallback';

export class CalibrationAudioRuntime {
  readonly audio = new AudioEngine();
  readonly samples = new SampleLibrary(this.audio);
  readonly sf2Banks = new Sf2BankLibrary();

  readonly drumsSf2 = new Sf2ProgramBackend(this.audio, this.sf2Banks, {
    bank: 128,
    program: 0,
    label: 'calibration-drums',
  });
  readonly drumSampler = new DrumSampler(this.audio, this.samples, this.drumsSf2);

  readonly keyboardSf2 = new Sf2KeyboardBackend(this.audio, this.sf2Banks);
  readonly keyboardSampler = new KeyboardSampler(this.audio, this.samples, this.keyboardSf2);

  readonly violinSf2 = new Sf2ViolinBackend(this.audio, this.sf2Banks);
  readonly violinSampler = new ViolinSampler(this.audio, this.samples, this.violinSf2);

  readonly acousticSf2 = new Sf2ProgramBackend(this.audio, this.sf2Banks, {
    bank: 0,
    program: DEFAULT_ACOUSTIC_GUITAR_PROGRAM,
    label: 'calibration-acoustic',
  });
  readonly acousticSampler = new AcousticGuitarSampler(
    this.audio,
    this.samples,
    this.acousticSf2,
  );

  readonly electricSf2 = new Sf2ProgramBackend(this.audio, this.sf2Banks, {
    bank: 0,
    program: DEFAULT_ELECTRIC_GUITAR_PROGRAM,
    label: 'calibration-electric',
  });
  readonly electricSampler = new ElectricGuitarSampler(
    this.audio,
    this.samples,
    this.electricSf2,
  );

  readonly bassSf2 = new Sf2ProgramBackend(this.audio, this.sf2Banks, {
    bank: 0,
    program: DEFAULT_BASS_PROGRAM,
    label: 'calibration-bass',
  });
  readonly bassSampler = new BassSampler(this.bassSf2);

  private disposed = false;

  async prepare(target: CalibrationTarget): Promise<CalibrationAudioSource> {
    if (this.disposed) throw new Error('Calibration audio runtime is disposed');
    await this.audio.resume();

    if (target.kind === 'drums') {
      await this.drumSampler.preload();
      return this.drumsSf2.ready ? 'SF2' : 'MP3 fallback';
    }

    if (target.kind === 'keyboard') {
      await this.keyboardSampler.preloadCommon();
      return this.keyboardSf2.ready ? 'SF2' : 'MP3 fallback';
    }

    if (target.kind === 'violin') {
      await this.violinSampler.preloadCommon();
      return target.articulation === 'pizzicato'
        ? 'MP3 fallback'
        : (this.violinSf2.ready ? 'SF2' : 'MP3 fallback');
    }

    if (target.kind === 'acoustic') {
      const program = target.program ?? DEFAULT_ACOUSTIC_GUITAR_PROGRAM;
      this.acousticSampler.setProgram(program);
      await Promise.allSettled([
        this.acousticSf2.prepare(),
        this.acousticSampler.preloadProgram(program),
      ]);
      return this.acousticSf2.ready ? 'SF2' : 'MP3 fallback';
    }

    if (target.kind === 'bass') {
      this.bassSampler.setProgram(target.program ?? DEFAULT_BASS_PROGRAM);
      if (!await this.bassSampler.preload()) throw new Error('Bass SF2 program is unavailable');
      return 'SF2';
    }

    const program = target.program ?? DEFAULT_ELECTRIC_GUITAR_PROGRAM;
    this.electricSampler.setProgram(program);
    await Promise.allSettled([
      this.electricSf2.prepare(),
      this.electricSampler.preloadProgram(program),
    ]);
    return this.electricSf2.ready ? 'SF2' : 'MP3 fallback';
  }

  resetAll(): void {
    this.drumsSf2.reset();
    this.drumSampler.resetHiHat();
    this.keyboardSampler.reset();
    this.violinSampler.reset();
    this.acousticSampler.reset();
    this.electricSampler.reset();
    this.bassSampler.reset();
    this.audio.stopAll();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resetAll();
    this.drumSampler.dispose();
    this.keyboardSampler.dispose();
    this.violinSampler.dispose();
    this.acousticSampler.dispose();
    this.electricSampler.dispose();
    this.bassSampler.dispose();
    this.sf2Banks.dispose();
    this.samples.dispose();
    this.audio.dispose();
  }
}
