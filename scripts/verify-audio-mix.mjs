import {
  FLUID_R3_MIX_PROFILE,
  dbToGain,
  mixGain,
  mixTrimComponents,
  mixTrimDb,
} from '../src/audio/AudioMixProfile.ts';

const rows = [
  ['drums'],
  ['keyboard.lower'],
  ['keyboard.upper'],
  ['violin.arco'],
  ['violin.pizzicato'],
  ['acoustic', 24],
  ['acoustic', 25],
  ['electric', 26],
  ['electric', 27],
  ['electric', 28],
  ['electric', 29],
  ['electric', 30],
  ['electric', 31],
  ['bass', 33],
  ['bass', 34],
  ['bass', 36],
];

for (const [target, program] of rows) {
  const components = mixTrimComponents(target, program);
  const db = mixTrimDb(target, program);
  const gain = mixGain(target, program);
  if (!Number.isFinite(db) || !Number.isFinite(gain) || gain <= 0) {
    throw new Error(`Invalid production mix trim for ${target}${program === undefined ? '' : `/${program}`}: ${db} dB -> ${gain}`);
  }
  if (Math.abs(components.instrumentTrimDb + components.programTrimDb - components.effectiveTrimDb) > 1e-12) {
    throw new Error(`Mix component mismatch for ${target}/${program ?? '-'}`);
  }
  if (Math.abs(components.effectiveTrimDb - db) > 1e-12) {
    throw new Error(`Effective trim mismatch for ${target}/${program ?? '-'}`);
  }
  const expected = dbToGain(db);
  if (Math.abs(gain - expected) > 1e-12) {
    throw new Error(`dB conversion mismatch for ${target}/${program ?? '-'}: ${gain} vs ${expected}`);
  }
}

console.log(`Audio mix profile: ${FLUID_R3_MIX_PROFILE.source}`);
for (const [target, program] of rows) {
  const components = mixTrimComponents(target, program);
  const gain = mixGain(target, program);
  console.log(
    `${target}${program === undefined ? '' : `/${program}`}: `
    + `family ${components.instrumentTrimDb.toFixed(2)} dB, `
    + `program ${components.programTrimDb.toFixed(2)} dB, `
    + `effective ${components.effectiveTrimDb.toFixed(2)} dB (${gain.toFixed(4)}x)`,
  );
}
console.log('Audio mix calibration verification passed. Peak safety is validated by measured calibration, not by gain sign.');
