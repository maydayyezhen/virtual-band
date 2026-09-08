import { readFile } from 'node:fs/promises';
import { parseSf2 } from '../src/audio/sf2/Sf2Parser.ts';

const file = await readFile(new URL('../public/soundfonts/FluidR3_GM.sf2', import.meta.url));
const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const font = parseSf2(data);
const presets = font.listPresets();

if (presets.length < 128) throw new Error(`Expected at least 128 presets, got ${presets.length}`);

const violin = requirePreset(0, 40, 'GM violin');
const piano = requirePreset(0, 0, 'GM acoustic grand piano');
const warmPad = requirePreset(0, 89, 'GM warm pad');

const violinRegions = requireRegions(0, 40, 69, 100, 'Violin A4');
const violinLooped = violinRegions.filter(hasSustainLoop);
if (violinLooped.length === 0) throw new Error('Violin A4 has no valid sustain-loop region');

const pianoRegions = requireRegions(0, 0, 60, 100, 'Piano C4');
const padRegions = requireRegions(0, 89, 60, 100, 'Warm Pad C4');
const padLooped = padRegions.filter(hasSustainLoop);
if (padLooped.length === 0) throw new Error('Warm Pad C4 has no valid sustain-loop region');

console.log(`Presets: ${presets.length}`);
console.log(`Violin preset: ${violin.name}`);
console.log(`Piano preset: ${piano.name}`);
console.log(`Warm Pad preset: ${warmPad.name}`);
console.log(`Violin A4 regions: ${violinRegions.length}`);
console.log(`Piano C4 regions: ${pianoRegions.length}`);
console.log(`Warm Pad C4 regions: ${padRegions.length} (${padLooped.length} looped)`);
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
console.log('SF2 parser verification passed.');

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
