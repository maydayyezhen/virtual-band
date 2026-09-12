import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const bundle = await build({ stdin: {
  contents: `export { planBand } from './src/midi/planBand.ts';
    export { parseMidi } from './src/midi/parseMidi.ts';
    export { routeTrack } from './src/midi/routeTracks.ts';
    export { VisualPerformance } from './src/midi/VisualPerformance.ts';`,
  resolveDir: process.cwd(),
}, bundle: true, write: false, format: 'cjs', platform: 'node' });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { planBand, parseMidi, routeTrack, VisualPerformance } = module.exports;
const routed = parseMidi(fs.readFileSync('public/examples/bohemian-rhapsody/queen.mid')).tracks.map(routeTrack);
const plan = planBand(routed);
const keyboard = plan.instruments.find(i => i.type === 'keyboard');
assert.equal(keyboard.count, 1);
assert.equal(keyboard.assignments.length, 7);
assert.equal(plan.totalInstruments, 7);
assert.equal(plan.instruments.flatMap(i => i.assignments).reduce((n, a) => n + a.track.notes.length, 0), 5922);
for (const a of keyboard.assignments) {
  assert.equal(a.instance, 0);
  assert.ok(routed.includes(a.track), 'original notes and programs are retained');
  if (a.tier === 'upper') assert.ok(a.track.notes.every(n => n.note >= 36 && n.note <= 96));
}
assert.deepEqual(planBand([...routed].reverse()), plan, 'stable assignment independent of input order');
assert.equal(planBand(routed.filter(t => t.type !== 'keyboard')).instruments.some(i => i.type === 'keyboard'), false);

// Three overlapping, lower-only parts must share one keyboard and hold a common key
// until the last part releases it, including across a seek.
const tracks = [1, 1.2, 1.4].map((end, index) => ({
  ...routed.find(t => t.type === 'keyboard'), index, program: 48 + index,
  firstNote: 0, lastNote: end, notes: [{ note: 24, velocity: 100, start: 0, end }],
}));
const shared = planBand(tracks);
assert.equal(shared.instruments[0].count, 1);
assert.ok(shared.instruments[0].assignments.every(a => a.tier === 'lower'));
const held = new Set();
const visual = new VisualPerformance(shared, n => held.add(n.note), n => held.delete(n.note));
visual.seek(.9);
visual.update(1.05); assert.ok(held.has(24));
visual.update(1.25); assert.ok(held.has(24));
visual.update(1.45); assert.equal(held.size, 0);
visual.seek(.5); assert.ok(held.has(24));
visual.clear(); assert.equal(held.size, 0);
console.log('Keyboard planning: Queen 7 parts / 1 keyboard / 5922 notes; tier ranges, stable order, shared-key release and seek passed.');
