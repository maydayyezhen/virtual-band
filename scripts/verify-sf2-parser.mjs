import { readFile } from 'node:fs/promises';
import {
  buildSf2VolumeEnvelopePlan,
  decayGainFactor,
  releaseDurationSeconds,
} from '../src/audio/sf2/Sf2Envelope.ts';
import { parseSf2 } from '../src/audio/sf2/Sf2Parser.ts';

const file = await readFile(new URL('../public/soundfonts/FluidR3_GM.sf2', import.meta.url));
const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const font = parseSf2(data);
const presets = font.listPresets();

if (presets.length < 128) throw new Error(`Expected at least 128 presets, got ${presets.length}`);

const violin = requirePreset(0, 40, 'GM violin');
const piano = requirePreset(0, 0, 'GM acoustic grand piano');
const warmPad = requirePreset(0, 89, 'GM warm pad');
const nylon = requirePreset(0, 24, 'GM nylon guitar');
const steel = requirePreset(0, 25, 'GM steel guitar');
const electricPrograms = [26, 27, 28, 29, 30, 31].map(
  (program) => requirePreset(0, program, `GM electric guitar ${program}`),
);
const percussion = requirePreset(128, 0, 'GM percussion');

const violinRegions = requireRegions(0, 40, 69, 100, 'Violin A4');
const violinLooped = violinRegions.filter(hasSustainLoop);
if (violinLooped.length === 0) throw new Error('Violin A4 has no valid sustain-loop region');

const pianoRegions = requireRegions(0, 0, 60, 100, 'Piano C4');
const padRegions = requireRegions(0, 89, 60, 100, 'Warm Pad C4');
const padLooped = padRegions.filter(hasSustainLoop);
if (padLooped.length === 0) throw new Error('Warm Pad C4 has no valid sustain-loop region');

const nylonRegions = requireRegions(0, 24, 64, 100, 'Nylon guitar E4');
const steelRegions = requireRegions(0, 25, 64, 100, 'Steel guitar E4');
const electricRegions = [26, 27, 28, 29, 30, 31].map(
  (program) => requireRegions(0, program, 64, 100, `Electric guitar program ${program} E4`),
);
const kickRegions = requireRegions(128, 0, 36, 100, 'Kick drum');
const closedHatRegions = requireRegions(128, 0, 42, 100, 'Closed hi-hat');
const openHatRegions = requireRegions(128, 0, 46, 100, 'Open hi-hat');
const hatExclusiveClasses = [...new Set(
  [...closedHatRegions, ...openHatRegions]
    .map((region) => region.exclusiveClass)
    .filter((value) => value > 0),
)];

for (const region of [
  ...nylonRegions,
  ...steelRegions,
  ...electricRegions.flat(),
]) {
  if (!Number.isFinite(region.keynumToVolEnvHold)) {
    throw new Error(`Invalid keynumToVolEnvHold on ${region.sample.name}`);
  }
  if (!Number.isFinite(region.keynumToVolEnvDecay)) {
    throw new Error(`Invalid keynumToVolEnvDecay on ${region.sample.name}`);
  }
}

verifyEnvelopeMath();

console.log(`Presets: ${presets.length}`);
console.log(`Violin preset: ${violin.name}`);
console.log(`Piano preset: ${piano.name}`);
console.log(`Warm Pad preset: ${warmPad.name}`);
console.log(`Nylon guitar preset: ${nylon.name}`);
console.log(`Steel guitar preset: ${steel.name}`);
console.log(`Electric guitar presets: ${electricPrograms.map((preset) => preset.name).join(' | ')}`);
console.log(`Percussion preset: ${percussion.name}`);
console.log(`Violin A4 regions: ${violinRegions.length}`);
console.log(`Piano C4 regions: ${pianoRegions.length}`);
console.log(`Warm Pad C4 regions: ${padRegions.length} (${padLooped.length} looped)`);
console.log(`Nylon/Steel E4 regions: ${nylonRegions.length}/${steelRegions.length}`);
console.log(`Electric E4 region counts: ${electricRegions.map((regions) => regions.length).join('/')}`);
console.log(`Kick regions: ${kickRegions.length}`);
console.log(`Hi-hat regions closed/open: ${closedHatRegions.length}/${openHatRegions.length}`);
console.log(`Hi-hat exclusive classes: ${hatExclusiveClasses.length ? hatExclusiveClasses.join(',') : 'none'}`);

for (const region of violinRegions) {
  console.log({
    sample: region.sample.name,
    loopMode: region.sampleModes,
    loopStart: region.loopStart,
    loopEnd: region.loopEnd,
    sampleRate: region.sample.sampleRate,
    attackTc: region.attackVolEnv,
    releaseTc: region.releaseVolEnv,
  });
}

console.log('Guitar envelope snapshot at E4:');
for (const [label, regions] of [
  ['nylon', nylonRegions],
  ['steel', steelRegions],
  ...electricRegions.map((regions, index) => [`program-${26 + index}`, regions]),
]) {
  console.log(label, regions.map((region) => ({
    sample: region.sample.name,
    loopMode: region.sampleModes,
    decayTc: region.decayVolEnv,
    sustainCb: region.sustainVolEnv,
    releaseTc: region.releaseVolEnv,
    keyToHold: region.keynumToVolEnvHold,
    keyToDecay: region.keynumToVolEnvDecay,
  })));
}

console.log('SF2 full-ensemble parser/envelope verification passed.');

function requirePreset(bank, program, label) {
  const preset = presets.find((candidate) => candidate.bank === bank && candidate.program === program);
  if (!preset) throw new Error(`${label} preset (bank ${bank}, program ${program}) was not found`);
  return preset;
}

function requireRegions(bank, program, note, velocity, label) {
  const regions = font.resolveRegions(bank, program, note, velocity);
  if (regions.length === 0) throw new Error(`${label} resolved to zero SF2 regions`);
  return regions;
}

function hasSustainLoop(region) {
  return (region.sampleModes === 1 || region.sampleModes === 3)
    && region.loopEnd > region.loopStart + 1;
}

function verifyEnvelopeMath() {
  const synthetic = {
    attackVolEnv: -12000,
    holdVolEnv: -7973,
    decayVolEnv: 0,
    sustainVolEnv: 120,
    releaseVolEnv: 0,
    keynumToVolEnvHold: 50,
    keynumToVolEnvDecay: 50,
  };

  const middleC = buildSf2VolumeEnvelopePlan(synthetic, 60);
  const lowC = buildSf2VolumeEnvelopePlan(synthetic, 36);

  assertApprox(middleC.holdSeconds, 0.01, 0.0002, 'middle-C hold');
  assertApprox(middleC.decaySeconds, 0.125, 0.0002, '12 dB decay duration');
  assertApprox(lowC.holdSeconds, 0.02, 0.0004, 'key-tracked low-C hold');
  assertApprox(lowC.decaySeconds, 0.25, 0.0004, 'key-tracked low-C decay');

  const halfDecayGain = decayGainFactor(120, 0.5);
  assertApprox(halfDecayGain, 10 ** (-6 / 20), 0.000001, 'constant-dB decay curve');

  const minus48DbGain = 10 ** (-48 / 20);
  assertApprox(
    releaseDurationSeconds(1, minus48DbGain, 1),
    0.5,
    0.000001,
    'release duration from -48 dB',
  );
}

function assertApprox(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}
