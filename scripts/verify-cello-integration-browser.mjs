import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), { Midi } = require('@tonejs/midi');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/band/`);
  await page.waitForFunction(() => window.bandView?.session && window.bandView.instruments.get('cello.main'), null, { timeout: 120000 });
  async function shot(name) { await page.waitForTimeout(300); if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` }); } }
  const initial = await page.evaluate(async () => {
    const v = window.bandView, c = v.instruments.get('cello.main'), T = await import('/node_modules/three/build/three.module.js');
    const b = new T.Box3().setFromObject(c.root); v.stage.focusInstrument(c.id, true);
    return { size: b.getSize(new T.Vector3()).toArray(), floor: b.min.y, program: c.audio.program };
  });
  assert.ok(Math.abs(initial.size[1] - 1.465) < .01); assert.ok(Math.abs(initial.floor - 1.2) < .01); assert.equal(initial.program, 42);
  await shot('cello-integrated-whole');
  await page.evaluate(() => window.bandView.presentation.active.selectView('strings', true));
  const point = await page.evaluate(async () => {
    const v = window.bandView, c = v.instruments.get('cello.main'), T = await import('/node_modules/three/build/three.module.js');
    const p = c.root.localToWorld(new T.Vector3(-.01, .95, .177)).project(v.camera.output), r = v.host.renderer.domElement.getBoundingClientRect();
    const x = r.left + (p.x + 1) * r.width / 2, y = r.top + (1 - p.y) * r.height / 2;
    return { x, y, hit: v.interactions.hitTest(x, y, c.id)?.partId };
  });
  assert.match(point.hit, /^key:\d+$/); const picked = Number(point.hit.slice(4));
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('cello.main').activeNote), picked);
  await page.keyboard.down('a'); assert.equal(await page.evaluate(() => window.bandView.instruments.get('cello.main').activeNote), 60);
  await page.keyboard.up('a'); assert.equal(await page.evaluate(() => window.bandView.instruments.get('cello.main').activeNote), picked);
  await page.mouse.up(); assert.equal(await page.evaluate(() => window.bandView.instruments.get('cello.main').activeNote), null);
  await page.keyboard.down('d'); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('d');
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('cello.main').activeNote), null);
  const sound = await page.evaluate(async () => {
    const v = window.bandView, c = v.instruments.get('cello.main'); await v.live.context.resume(); await v.live.prepare();
    const analyser = v.live.context.createAnalyser(); analyser.fftSize = 2048; v.live.engine.synth.connect(analyser);
    c.noteOn(48, 115); await new Promise(r => setTimeout(r, 220));
    const values = new Float32Array(2048); analyser.getFloatTimeDomainData(values);
    const a = c.bow.root.position.toArray(); await new Promise(r => setTimeout(r, 250)); const b = c.bow.root.position.toArray();
    c.noteOff(48); return { rms: Math.sqrt(values.reduce((sum, n) => sum + n * n, 0) / values.length), a, b };
  });
  assert.ok(sound.rms > .00001); assert.notDeepEqual(sound.a, sound.b, 'bow moves while sounding');
  const isolation = await page.evaluate(async () => {
    const { CelloInstrument } = await import('/src/instruments/cello/CelloInstrument.ts');
    const events = [], port = { noteOn: (...a) => events.push(['on', ...a]), noteOff: (...a) => events.push(['off', ...a]), setProgram: () => true, reset() {}, dispose() {} };
    const a = await CelloInstrument.create(port), b = await CelloInstrument.create(port);
    a.visualNoteOn(43, 100); for (let i = 0; i < 30; i++) { a.update(.016); b.update(.016); }
    const silent = events.length === 0, independent = a.activeNote === 43 && b.activeNote === null && a.bow.root.quaternion.angleTo(b.bow.root.quaternion) > .1;
    a.noteOn(48, 100, 'a'); a.noteOn(48, 100, 'b'); a.noteOff(48, 'a');
    const samePitch = a.activeNote === 48; a.noteOff(48, 'b'); const retainedScore = a.activeNote === 43;
    a.visualNoteOff(43); for (let i = 0; i < 60; i++) a.update(.016);
    const parked = a.activeNote === null && a.bow.root.position.distanceTo(b.bow.root.position) < .0001;
    a.visualNoteOn(24, 100); const lowMidiKept = a.activeNote === 24;
    a.reset(); a.dispose(); a.dispose(); b.dispose(); return { silent, independent, samePitch, retainedScore, parked, lowMidiKept };
  });
  assert.ok(Object.values(isolation).every(Boolean), JSON.stringify(isolation));
  const midi = new Midi(), track = midi.addTrack(); track.channel = 0; track.instrument.number = 42;
  track.addNote({ midi: 48, time: 0, duration: 6, velocity: .8 }); track.addNote({ midi: 55, time: 1, duration: 4, velocity: .7 });
  await page.evaluate(async bytes => window.bandView.loadMidiFile(new File([new Uint8Array(bytes)], 'cello-gm42.mid')), [...midi.toArray()]);
  assert.deepEqual(await page.evaluate(() => window.bandView.session.layout.instances.map(i => i.type)), ['cello']);
  await page.getByTitle('播放', { exact: true }).click();
  await page.waitForFunction(() => window.bandView.player.time > .3 && window.bandView.instruments.get('cello.main').activeNote === 48);
  await page.evaluate(() => window.bandView.stage.focusInstrument('cello.main', true));
  await shot('cello-midi-bowing');
  await page.getByTitle('暂停', { exact: true }).click();
  await page.evaluate(() => window.bandView.player.seek(7));
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('cello.main').activeNote), null);
  const layout = { schemaVersion: 3, venueId: 'nocturne', units: 'meters', name: 'two-cellos', instances: [
    { id: 'cello.right', type: 'cello', transform: { position: [1.5, 0, 0], rotation: [0, -.2, 0], scale: 1 } },
    { id: 'cello.left', type: 'cello', transform: { position: [-1.5, 0, 0], rotation: [0, .2, 0], scale: 1 } },
  ] };
  await page.evaluate(async layout => window.bandView.loadLayoutFile(new File([JSON.stringify(layout)], 'two-cellos.json')), layout);
  for (const id of ['cello.left', 'cello.right']) {
    await page.evaluate(() => window.bandView.stage.showBand(true));
    const target = await page.evaluate(async id => {
      const v = window.bandView, c = v.instruments.get(id), T = await import('/node_modules/three/build/three.module.js');
      c.root.updateWorldMatrix(true, true); v.camera.output.updateMatrixWorld(true);
      const r = v.host.renderer.domElement.getBoundingClientRect();
      for (const y of [.8, .5, .95]) { const p = c.root.localToWorld(new T.Vector3(.08, y, .085)).project(v.camera.output);
        const x = r.left + (p.x + 1) * r.width / 2, sy = r.top + (1 - p.y) * r.height / 2;
        if (v.instrumentAt(x, sy) === id) return { x, y: sy }; }
      return null;
    }, id);
    assert.ok(target, `pickable ${id}`); await page.mouse.dblclick(target.x, target.y);
    await page.waitForFunction(id => window.bandView.stage.focusedInstrumentId === id && window.bandView.presentation.active?.id === `${id}:showcase`, id);
    await page.keyboard.down('a'); assert.deepEqual(await page.evaluate(() => window.bandView.instruments.list().filter(i => i.activeNote !== null).map(i => i.id)), [id]);
    await page.keyboard.up('a');
  }
  assert.equal(await page.evaluate(() => window.bandView.live.channels.size), 2, 'old ports released, two independent cello leases');
  assert.deepEqual(errors, []); console.log('Cello integrated: grounded, pointer/keyboard/blur, SF2 audio, moving/parked bow, silent score, GM42 MIDI and duplicate double-click isolation passed.', { initial, sound, isolation });
} finally { await browser.close(); }
