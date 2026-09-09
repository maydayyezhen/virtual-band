import rawAudioMixConfig from '../../config/audio-mix.json' with { type: 'json' };

export type AudioMixTarget =
  | 'drums'
  | 'keyboard.lower'
  | 'keyboard.upper'
  | 'violin.arco'
  | 'violin.pizzicato'
  | 'acoustic'
  | 'electric';

export interface AudioMixConfigFile {
  readonly schemaVersion: 1;
  readonly source: string;
  readonly instrumentTrimDb: Readonly<Record<AudioMixTarget, number>>;
  readonly programTrimDb: Readonly<{
    acoustic: Readonly<Record<string, number>>;
    electric: Readonly<Record<string, number>>;
  }>;
}

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

const MIX_TARGETS: readonly AudioMixTarget[] = Object.freeze([
  'drums',
  'keyboard.lower',
  'keyboard.upper',
  'violin.arco',
  'violin.pizzicato',
  'acoustic',
  'electric',
]);

const ACOUSTIC_PROGRAMS = Object.freeze([24, 25] as const);
const ELECTRIC_PROGRAMS = Object.freeze([26, 27, 28, 29, 30, 31] as const);

/**
 * Git-tracked source of truth for production mix calibration.
 *
 * The developer mix tuner edits config/audio-mix.json directly. Runtime code
 * consumes the same file, so a saved/committed tuning session is exactly what
 * MIDI playback and showcase audio will use after reload/build.
 */
export const AUDIO_MIX_CONFIG: AudioMixConfigFile = freezeConfig(
  rawAudioMixConfig as unknown as AudioMixConfigFile,
);

export const FLUID_R3_MIX_PROFILE: AudioMixProfile = Object.freeze({
  source: AUDIO_MIX_CONFIG.source,
  instrumentTrimDb: AUDIO_MIX_CONFIG.instrumentTrimDb,
  programTrimDb: Object.freeze({
    acoustic: toProgramTable(AUDIO_MIX_CONFIG.programTrimDb.acoustic, ACOUSTIC_PROGRAMS),
    electric: toProgramTable(AUDIO_MIX_CONFIG.programTrimDb.electric, ELECTRIC_PROGRAMS),
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

function freezeConfig(input: AudioMixConfigFile): AudioMixConfigFile {
  if (input.schemaVersion !== 1) {
    throw new Error(`Unsupported audio mix config schema: ${String(input.schemaVersion)}`);
  }
  if (typeof input.source !== 'string' || input.source.trim().length === 0) {
    throw new Error('Audio mix config source must be a non-empty string');
  }

  const instrumentTrimDb = {} as Record<AudioMixTarget, number>;
  for (const target of MIX_TARGETS) {
    instrumentTrimDb[target] = finiteDb(input.instrumentTrimDb[target], `instrumentTrimDb.${target}`);
  }

  const acoustic = freezeProgramConfig(input.programTrimDb.acoustic, ACOUSTIC_PROGRAMS, 'acoustic');
  const electric = freezeProgramConfig(input.programTrimDb.electric, ELECTRIC_PROGRAMS, 'electric');

  return Object.freeze({
    schemaVersion: 1,
    source: input.source,
    instrumentTrimDb: Object.freeze(instrumentTrimDb),
    programTrimDb: Object.freeze({ acoustic, electric }),
  });
}

function freezeProgramConfig(
  input: Readonly<Record<string, number>>,
  programs: readonly number[],
  label: string,
): Readonly<Record<string, number>> {
  const output: Record<string, number> = {};
  for (const program of programs) {
    const key = String(program);
    output[key] = finiteDb(input[key], `programTrimDb.${label}.${key}`);
  }
  return Object.freeze(output);
}

function toProgramTable(
  input: Readonly<Record<string, number>>,
  programs: readonly number[],
): Readonly<Record<number, number>> {
  const output: Record<number, number> = {};
  for (const program of programs) output[program] = input[String(program)] ?? 0;
  return Object.freeze(output);
}

function finiteDb(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Audio mix config ${label} must be finite`);
  return value;
}
