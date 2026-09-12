import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
export { CameraShowPlayer } from './src/camera/CameraShowPlayer.ts';
export { sampleShot } from './src/camera/ShotMotion.ts';
export { instrumentShot } from './src/camera/shots/ConcertShots.ts';
export { prepareBohemianCamera } from './src/shows/BohemianCamera.ts';
export { prepareFreeformStudy } from './src/shows/examples/FreeformStudy.ts';
export { bohemianRhapsody } from './src/lighting/shows/BohemianRhapsody.ts';
export { LightingSession } from './src/lighting/LightingSession.ts';
export { createLightingProgram, withLightingEffects, MusicAnalysis, prepareSectionShow } from './src/lighting/index.ts';
` }, bundle: true, write: false, platform: 'node', format: 'cjs' });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const { CameraShowPlayer, sampleShot, instrumentShot, prepareBohemianCamera, prepareFreeformStudy,
  bohemianRhapsody, LightingSession, createLightingProgram, withLightingEffects, MusicAnalysis, prepareSectionShow } = module.exports;
const baseline = JSON.parse(fs.readFileSync('scripts/fixtures/bohemian-show-baseline.json'));
const music = new MusicAnalysis(fs.readFileSync('public/examples/bohemian-rhapsody/queen.mid'));
const lighting = prepareSectionShow(bohemianRhapsody, music, baseline.rig);
assert.deepEqual(prepareBohemianCamera(music), baseline.camera, '27 authored shots remain unchanged');
assert.equal(crypto.createHash('sha256').update(JSON.stringify(baseline.times.map(t => lighting.evaluate(t)))).digest('hex'), baseline.lightingHash,
  '241 authored lighting frames remain unchanged');

const shot = instrumentShot('bridge', 1); shot.target[0] = 999;
assert.notEqual(instrumentShot('bridge', 1).target[0], 999, 'templates cannot be mutated by a song');
const original = { time: 0, name: 'dolly', from: { position: [1, 2, 3], target: [0, 0, 0], fov: 40 }, to: { position: [3, 4, 5] } };
assert.deepEqual(sampleShot(original, 5, 10).position, [2, 3, 4]);
const custom = { ...original, motion: ({ time, from }) => ({ ...from, position: [Math.sin(time), 4, 8] }) };
const frame = sampleShot(custom, 2, 10); sampleShot(custom, 8, 10);
assert.deepEqual(sampleShot(custom, 2, 10), frame);
assert.deepEqual(sampleShot(custom, 2, 10, true), sampleShot(custom, 8, 10, true), 'reduced motion freezes time-based callbacks');
assert.throws(() => sampleShot({ ...custom, motion: () => ({ ...custom.from, position: [NaN, 0, 0] }) }, 1, 10));
assert.throws(() => sampleShot({ ...custom, motion: () => ({ ...custom.from, subject: { type: 'piano', instance: 0 } }) }, 1, 10));

globalThis.window = { matchMedia: () => ({ matches: false }) };
let pose;
const camera = new CameraShowPlayer({ setLens() {}, setPose(p) { pose = [p.position.toArray(), p.target.toArray(), p.fov]; } });
const study = prepareFreeformStudy(music, baseline.rig);
camera.setShow(study.camera);
const snapshots = baseline.times.map(t => { camera.update(t); assert.equal(camera.error, null); return pose; });
for (let i = baseline.times.length - 1; i >= 0; i--) { camera.update(baseline.times[i]); assert.deepEqual(pose, snapshots[i]); }
camera.update(13); const transition = pose; camera.update(100); camera.update(13); assert.deepEqual(pose, transition);
const broken = { ...study.camera, cues: [{ ...original, motion: () => { throw Error('bad trajectory'); } }] };
camera.setShow(broken); camera.update(0); assert.match(camera.error, /bad trajectory/); assert.deepEqual(pose, transition);
assert.throws(() => camera.setShow({ ...study.camera, cues: [...study.camera.cues].reverse() }));

// Original lighting callbacks affect each hardware family, with exact IDs and reverse-seek equivalence.
const customFrames = baseline.times.map(t => study.lighting.evaluate(t));
assert.notDeepEqual(customFrames[50], lighting.evaluate(baseline.times[50]));
for (let i = baseline.times.length - 1; i >= 0; i--) assert.deepEqual(study.lighting.evaluate(baseline.times[i]), customFrames[i]);
const layers = withLightingEffects(bohemianRhapsody, [{ fixture: () => ({ intensity: .25 }) }, { fixture: base => ({ intensity: base.intensity * 2 }) }]);
const layered = prepareSectionShow(layers, music, baseline.rig).evaluate(50);
assert.ok(layered.fixtures.every(f => f.intensity === .5));
assert.deepEqual(layered.fixtures.map(f => f.id), baseline.rig.fixtures.map(f => f.id));
assert.deepEqual(layered.pixels, lighting.evaluate(50).pixels);
const originalShow = createLightingProgram({ id: 'original', title: 'original', sections: [{ beat: 0, name: 'original' }], effects: [{
  fixture: (_base, fixture, ctx) => ({ target: [fixture.position[0], 4, ctx.music.t], intensity: .4 }),
  pixel: () => ({ color: [1, 0, 0] }), gobo: () => ({ rotation: 2, opacity: .3 }),
  environment: () => ({ hazeDensity: .2 }), master: () => .7,
}] });
const created = prepareSectionShow(originalShow, music, baseline.rig).evaluate(12);
assert.equal(created.fixtures[0].target[2], 12); assert.deepEqual(created.pixels[0].color, [1, 0, 0]);
assert.equal(created.gobos[0].rotation, 2); assert.equal(created.environment.hazeDensity, .2); assert.equal(created.master, .7);
let applied;
const session = new LightingSession({ rig: baseline.rig, acquire: () => ({ apply: f => applied = f, release() {} }) });
session.setShow({ ...study.lighting, evaluate(t) { if (t === 10) throw Error('bad light'); return study.lighting.evaluate(t); } });
session.update(4); const last = applied; session.update(10); assert.equal(applied, last); assert.match(session.error, /bad light/);
session.update(4); assert.equal(session.error, null); assert.deepEqual(applied, last);
session.dispose();
console.log('Authoring: camera positions, custom paths/transitions, seek/reduced-motion, lighting layers/all hardware, error isolation and Queen baseline passed.');
