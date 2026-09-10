import { AcousticGuitarSampler } from './AcousticGuitarSampler';
import { DEFAULT_ACOUSTIC_GUITAR_PROGRAM } from './AcousticGuitarProgram';
import { AudioEngine } from './AudioEngine';
import { BassSampler } from './BassSampler';
import { DEFAULT_BASS_PROGRAM } from './BassProgram';
import { DrumSampler } from './DrumSampler';
import { ElectricGuitarSampler } from './ElectricGuitarSampler';
import { DEFAULT_ELECTRIC_GUITAR_PROGRAM } from './ElectricGuitarProgram';
import { KeyboardSampler } from './KeyboardSampler';
import { SampleLibrary } from './SampleLibrary';
import { Sf2BankLibrary } from './sf2/Sf2BankLibrary';
import { Sf2KeyboardBackend } from './sf2/Sf2KeyboardBackend';
import { Sf2ProgramBackend } from './sf2/Sf2ProgramBackend';
import { Sf2ViolinBackend } from './sf2/Sf2ViolinBackend';
import { ViolinSampler } from './ViolinSampler';

/**
 * The six-instrument audio graph, assembled in one place.
 *
 * Every host that plays the band needs the same thing: one `AudioEngine`, one sample library, one
 * shared SF2 bank, six tone backends and six samplers. That wiring was duplicated — program
 * numbers, gains and all — which meant a change to any of it had to be made in every copy.
 *
 * Bank handling is deliberately shared: `Sf2BankLibrary` caches by URL, so the ~142 MB SoundFont
 * is fetched and parsed once no matter how many backends ask for it.
 *
 * Note `BassSampler` is the one instrument with **no MP3 fallback** — it is built on a tone
 * backend alone, so an unprepared bass backend silently drops every note. `prepare()` is what
 * makes it audible, and it needs no user gesture (only starting the AudioContext does).
 */

export interface BandAudioGraph {
  readonly audio: AudioEngine;
  readonly samples: SampleLibrary;
  readonly banks: Sf2BankLibrary;

  readonly drumsSf2: Sf2ProgramBackend;
  readonly electricSf2: Sf2ProgramBackend;
  readonly acousticSf2: Sf2ProgramBackend;
  readonly bassSf2: Sf2ProgramBackend;
  readonly keyboardSf2: Sf2KeyboardBackend;
  readonly violinSf2: Sf2ViolinBackend;

  readonly drumSampler: DrumSampler;
  readonly keyboardSampler: KeyboardSampler;
  readonly violinSampler: ViolinSampler;
  readonly electricSampler: ElectricGuitarSampler;
  readonly acousticSampler: AcousticGuitarSampler;
  readonly bassSampler: BassSampler;

  /** Warms all six. Resolves when everything settled; failures are reported, never thrown. */
  prepare(): Promise<void>;
  dispose(): void;
}

export function createBandAudioGraph(): BandAudioGraph {
  const audio = new AudioEngine();
  const samples = new SampleLibrary(audio);
  const banks = new Sf2BankLibrary();

  const drumsSf2 = new Sf2ProgramBackend(audio, banks, { bank: 128, program: 0, label: 'drums' });
  const electricSf2 = new Sf2ProgramBackend(audio, banks, {
    bank: 0,
    program: DEFAULT_ELECTRIC_GUITAR_PROGRAM,
    label: 'electric',
  });
  const acousticSf2 = new Sf2ProgramBackend(audio, banks, {
    bank: 0,
    program: DEFAULT_ACOUSTIC_GUITAR_PROGRAM,
    label: 'acoustic',
    gain: 0.86,
  });
  const bassSf2 = new Sf2ProgramBackend(audio, banks, {
    bank: 0,
    program: DEFAULT_BASS_PROGRAM,
    label: 'bass',
  });
  const keyboardSf2 = new Sf2KeyboardBackend(audio, banks);
  const violinSf2 = new Sf2ViolinBackend(audio, banks);

  const drumSampler = new DrumSampler(audio, samples, drumsSf2);
  const keyboardSampler = new KeyboardSampler(audio, samples, keyboardSf2);
  const violinSampler = new ViolinSampler(audio, samples, violinSf2);
  const electricSampler = new ElectricGuitarSampler(audio, samples, electricSf2);
  const acousticSampler = new AcousticGuitarSampler(audio, samples, acousticSf2);
  const bassSampler = new BassSampler(bassSf2);

  return {
    audio,
    samples,
    banks,
    drumsSf2,
    electricSf2,
    acousticSf2,
    bassSf2,
    keyboardSf2,
    violinSf2,
    drumSampler,
    keyboardSampler,
    violinSampler,
    electricSampler,
    acousticSampler,
    bassSampler,
    async prepare(): Promise<void> {
      const results = await Promise.allSettled([
        drumSampler.preload(),
        keyboardSampler.preloadCommon(),
        violinSampler.preloadCommon(),
        electricSampler.preloadShowcase(),
        acousticSampler.preloadShowcase(),
        bassSampler.preload(),
      ]);
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length) console.warn(`[audio] ${failed.length} 个采样器未能预载`);
    },
    dispose(): void {
      samples.dispose();
      banks.dispose();
      audio.dispose();
    },
  };
}
