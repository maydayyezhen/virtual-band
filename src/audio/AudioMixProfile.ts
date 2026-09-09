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
 * First-pass listening calibration for FluidR3_GM.sf2 and the matching MP3
 * fallback sets. These trims are mix policy, not SoundFont semantics.
 *
 * Instrument trims establish ensemble/family gain staging. Program trims may
 * move either direction to compensate systematic preset loudness jumps inside
 * one instrument family. User volume, MIDI expression and performance dynamics
 * stay outside this table.
 *
 * A positive program offset is not itself a clipping error. Safety is judged at
 * the effective output (including the shared instrument trim and measured peak
 * headroom), while the production profile remains deliberately conservative.
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
      24: 0.5,
      25: 0.0,
    }),
    electric: Object.freeze({
      26: 1.5,
      27: 0.0,
      28: 3.0,
      29: -2.0,
      30: -3.0,
      31: 1.0,
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
