import { FLUID_R3_MIX_PROFILE, dbToGain, mixGain, mixTrimDb } from '../src/audio/AudioMixProfile.ts';

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
];

for (const [target, program] of rows) {
  const db = mixTrimDb(target, program);
  const gain = mixGain(target, program);
  if (!Number.isFinite(db) || !Number.isFinite(gain) || gain <= 0 || gain > 1) {
    throw new Error(`Unsafe mix trim for ${target}${program === undefined ? '' : `/${program}`}: ${db} dB -> ${gain}`);
  }
  const expected = dbToGain(db);
  if (Math.abs(gain - expected) > 1e-12) {
    throw new Error(`dB conversion mismatch for ${target}/${program ?? '-'}: ${gain} vs ${expected}`);
  }
}

console.log(`Audio mix profile: ${FLUID_R3_MIX_PROFILE.source}`);
for (const [target, program] of rows) {
  const db = mixTrimDb(target, program);
  const gain = mixGain(target, program);
  console.log(`${target}${program === undefined ? '' : `/${program}`}: ${db.toFixed(2)} dB (${gain.toFixed(4)}x)`);
}
console.log('Audio mix calibration verification passed.');
