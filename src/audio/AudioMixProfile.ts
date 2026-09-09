export type AudioMixTarget =
  | 'drums'
  | 'keyboard.lower'
  | 'keyboard.upper'
  | 'violin.arco'
  | 'violin.pizzicato'
  | 'acoustic'
  | 'electric';

export interface AudioMixProfile {
  readonly source: string;
  readonly instrumentTrimDb: Readonly<Record<AudioMixTarget, number>>;
  readonly programTrimDb: Readonly<{
    acoustic: Readonly<Record<number, number>>;
    electric: Readonly<Record<number, number>>;
  }>;
}

export interface AudioMixTrimComponents {
  readonly instrumentTrimDb: number;
  readonly programTrimDb: number;
  readonly effectiveTrimDb: number;
}

/**
 * Listening + harness calibration for FluidR3_GM.sf2 and the matching MP3
 * fallback sets. These trims are mix policy, not SoundFont semantics.
 *
 * Instrument trims establish ensemble/family gain staging. Program trims may
 * move either direction to compensate systematic preset loudness jumps inside
 * one instrument family. User volume, MIDI expression and performance dynamics
 * stay outside this table.
 *
 * The current guitar values intentionally use a conservative partial adoption
 * of the calibration report: strongly over-loud presets are attenuated, while
 * unusually quiet presets are only raised modestly instead of chasing exact
 * family LUFS parity. Final instrument balance belongs to real ensemble MIDI
 * listening rather than further standalone normalization.
 */
export const FLUID_R3_MIX_PROFILE: AudioMixProfile = Object.freeze({
  source: 'FluidR3_GM.sf2 / FluidR3 MP3 fallback',
  instrumentTrimDb: Object.freeze({
    drums: -2.0,
    'keyboard.lower': -2.0,
    'keyboard.upper': -4.0,
    'violin.arco': -2.0,
    'violin.pizzicato': -2.0,
    acoustic: -2.0,
    electric: -3.25,
  }),
  programTrimDb: Object.freeze({
    acoustic: Object.freeze({
      // Harness family result was approximately -2.87 / -0.63 dB effective.
      // Round to simple conservative values while keeping acoustic headroom.
      24: -1.0,
      25: 1.0,
    }),
    electric: Object.freeze({
      // Do not chase the very quiet Jazz / Muted programs with the large
      // positive gains suggested by exact LUFS matching. Instead keep boosts
      // modest and mainly pull the loud Overdrive / Distortion / Harmonics
      // programs toward the usable middle of the family.
      26: 3.0,
      27: 0.0,
      28: 3.0,
      29: -5.0,
      30: -10.0,
      31: -2.5,
    }),
  }),
});

export function dbToGain(db: number): number {
  if (!Number.isFinite(db)) return 1;
  return 10 ** (db / 20);
}

export function mixTrimComponents(
  target: AudioMixTarget,
  program?: number,
  profile: AudioMixProfile = FLUID_R3_MIX_PROFILE,
): AudioMixTrimComponents {
  const instrumentTrimDb = profile.instrumentTrimDb[target] ?? 0;
  let programTrimDb = 0;
  if (program !== undefined) {
    if (target === 'acoustic') programTrimDb = profile.programTrimDb.acoustic[program] ?? 0;
    else if (target === 'electric') programTrimDb = profile.programTrimDb.electric[program] ?? 0;
  }
  return {
    instrumentTrimDb,
    programTrimDb,
    effectiveTrimDb: instrumentTrimDb + programTrimDb,
  };
}

export function mixTrimDb(
  target: AudioMixTarget,
  program?: number,
  profile: AudioMixProfile = FLUID_R3_MIX_PROFILE,
): number {
  return mixTrimComponents(target, program, profile).effectiveTrimDb;
}

export function mixGain(
  target: AudioMixTarget,
  program?: number,
  profile: AudioMixProfile = FLUID_R3_MIX_PROFILE,
): number {
  return dbToGain(mixTrimDb(target, program, profile));
}
