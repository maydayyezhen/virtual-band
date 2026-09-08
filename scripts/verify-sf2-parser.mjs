import { readFile } from 'node:fs/promises';
import { parseSf2 } from '../src/audio/sf2/Sf2Parser.ts';

const file = await readFile(new URL('../public/soundfonts/FluidR3_GM.sf2', import.meta.url));
const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const font = parseSf2(data);
const presets = font.listPresets();

if (presets.length < 128) throw new Error(`Expected at least 128 presets, got ${presets.length}`);
const violin = presets.find((preset) => preset.bank === 0 && preset.program === 40);
if (!violin) throw new Error('GM violin preset (bank 0, program 40) was not found');

const regions = font.resolveRegions(0, 40, 69, 100);
if (regions.length === 0) throw new Error('Violin A4 resolved to zero SF2 regions');
const looped = regions.filter((region) => (region.sampleModes === 1 || region.sampleModes === 3)
  && region.loopEnd > region.loopStart + 1);
if (looped.length === 0) throw new Error('Violin A4 has no valid sustain-loop region');

console.log(`Presets: ${presets.length}`);
console.log(`Violin preset: ${violin.name}`);
console.log(`Violin A4 regions: ${regions.length}`);
for (const region of regions) {
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
