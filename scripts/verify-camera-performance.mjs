import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: { resolveDir: root, contents: `
    export { MusicAnalysis } from './src/lighting/MusicAnalysis.ts';
    export { analyzeMidi } from './src/midi/index.ts';
    export { prepareBohemianCamera } from './src/shows/BohemianCamera.ts';
    export { validateCameraPerformance } from './src/shows/validateCameraPerformance.ts';
  ` }, bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { MusicAnalysis, analyzeMidi, prepareBohemianCamera, validateCameraPerformance } = module.exports;
const bytes = fs.readFileSync(new URL('../public/examples/bohemian-rhapsody/queen.mid', import.meta.url));
const music = new MusicAnalysis(bytes), plan = analyzeMidi(bytes).plan;
const show = prepareBohemianCamera(music);
assert.deepEqual(validateCameraPerformance(show, plan), [], 'all closeups enter on active notes and avoid long rests');
for (const instrument of plan.instruments) {
  for (let instance = 0; instance < instrument.count; instance++) {
    assert.ok(show.cues.some(c => c.from.subject?.type === instrument.type && c.from.subject.instance === instance),
      `missing closeup: ${instrument.type}.${instance}`);
  }
}

// Regression: the old beat-160 keyboard shot contained notes, but started 7.7s too soon.
const broken = structuredClone(show);
const keyboard = broken.cues.find(c => c.name === '叙事 · 电子琴弦乐铺底');
keyboard.time = music.secondsAtBeat(160);
assert.ok(validateCameraPerformance(broken, plan).some(s => s.includes('切入时没有')));
assert.ok(validateCameraPerformance(broken, plan).some(s => s.includes('停奏 7.692s')));

// Held notes, layered voices, exact note-off, wrong instance, internal and trailing rests.
const from = { subject: { type: 'keyboard', instance: 0 } };
const fixture = { duration: 4, cues: [{ time: 1, name: 'fixture', from }] };
const tracks = notes => ({ instruments: [{ type: 'keyboard', assignments: [
  { instance: 0, track: { notes } }, { instance: 1, track: { notes: [{ start: 0, end: 99 }] } },
] }] });
assert.deepEqual(validateCameraPerformance(fixture, tracks([{ start: 0, end: 2 }, { start: 2.5, end: 4 }])), []);
assert.ok(validateCameraPerformance(fixture, tracks([{ start: 0, end: 1 }])).some(s => s.includes('切入时没有')));
assert.ok(validateCameraPerformance(fixture, tracks([{ start: 0, end: 2 }])).some(s => s.includes('停奏 2.000s')));
assert.ok(validateCameraPerformance(fixture, tracks([{ start: 0, end: 1.5 }, { start: 3, end: 4 }])).some(s => s.includes('停奏 1.500s')));
assert.deepEqual(validateCameraPerformance(fixture, tracks([{ start: 0, end: 2 }, { start: 1.5, end: 4 }])), []);
console.log(`Camera performance: ${show.cues.filter(c => c.from.subject).length} closeups / ${plan.totalInstruments} instances passed; active cuts, rests <= 1s, regression and interval checks passed.`);
