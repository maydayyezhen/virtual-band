import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/band/`);
  await page.waitForFunction(() => window.bandView?.session, null, { timeout: 90000 });
  const initial = await page.evaluate(async () => {
    const v = window.bandView, s = v.instruments.get('saxophone.main'), T = await import('/node_modules/three/build/three.module.js');
    v.stage.focusInstrument(s.id, true);
    const bounds = new T.Box3().setFromObject(s.root), size = bounds.getSize(new T.Vector3()).toArray();
    return { keys: s.model.keys.length, size, grounded: bounds.min.y };
  });
  assert.equal(initial.keys, 6); assert.ok(Math.abs(initial.size[1] - .95) < .01); assert.ok(Math.abs(initial.grounded - 1.2) < .01);
  for (const view of ['whole', 'keys', 'bell']) {
    await page.evaluate(view => window.bandView.presentation.active.selectView(view, true), view);
    await page.waitForTimeout(300);
    if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/saxophone-${view}.png` }); }
  }
  await page.evaluate(() => window.bandView.presentation.active.selectView('keys', true));
  const point = await page.evaluate(async () => {
    const v = window.bandView, s = v.instruments.get('saxophone.main'), T = await import('/node_modules/three/build/three.module.js');
    s.root.updateWorldMatrix(true, true);
    const p = s.model.keys[1].pivot.localToWorld(new T.Vector3(-.034, 0, .02)).project(v.camera.output), rect = v.host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
  });
  assert.equal(await page.evaluate(({ x, y }) => window.bandView.interactions.hitTest(x, y, 'saxophone.main')?.partId, point), 'key:68');
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('saxophone.main').activeNote), 68);
  await page.keyboard.down('a');
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('saxophone.main').activeNote), 60);
  await page.keyboard.up('a');
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('saxophone.main').activeNote), 68);
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('saxophone.main').activeNote), null);
  await page.keyboard.down('d'); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('d');
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('saxophone.main').activeNote), null);
  const audio = await page.evaluate(async () => {
    const v = window.bandView, s = v.instruments.get('saxophone.main'); await v.live.context.resume(); await v.live.prepare();
    const analyser = v.live.context.createAnalyser(); analyser.fftSize = 2048; v.live.engine.synth.connect(analyser);
    s.noteOn(65, 112); await new Promise(r => setTimeout(r, 180));
    const data = new Float32Array(2048); analyser.getFloatTimeDomainData(data);
    s.noteOff(65); return Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length);
  });
  assert.ok(audio > .00001, 'real SF2 audio output');
  const isolation = await page.evaluate(async () => {
    const { SaxophoneInstrument } = await import('/src/instruments/saxophone/SaxophoneInstrument.ts');
    const events = [], port = { noteOn: (...a) => events.push(['on', ...a]), noteOff: (...a) => events.push(['off', ...a]), setProgram: () => true, reset() {}, dispose() {} };
    const a = await SaxophoneInstrument.create(port), b = await SaxophoneInstrument.create(port);
    a.visualNoteOn(62, 100); a.update(.2); b.update(.2);
    const silent = events.length === 0, independent = a.activeNote === 62 && b.activeNote === null;
    a.noteOn(65, 100, 'a'); a.noteOn(65, 100, 'b'); a.noteOff(65, 'a');
    const samePitch = a.activeNote === 65 && events.filter(e => e[0] === 'on').length === 1;
    a.noteOff(65, 'b'); const scoreRetained = a.activeNote === 62; a.visualNoteOff(62);
    a.visualNoteOn(48, 100); const lowMidiKept = a.activeNote === 48;
    a.reset(); const reset = a.activeNote === null; a.dispose(); b.dispose();
    return { silent, independent, samePitch, scoreRetained, lowMidiKept, reset };
  });
  assert.ok(Object.values(isolation).every(Boolean), JSON.stringify(isolation));
  await page.getByRole('button', { name: '载入波西米亚示例', exact: true }).click();
  await page.waitForFunction(() => window.bandView.player && !document.querySelector('.band-lighting button').disabled, null, { timeout: 120000 });
  const queen = await page.evaluate(async () => {
    const v = window.bandView; v.player.pause();
    const { validateLayout } = await import('/src/layout/AutoLayout.ts'), { footprintsOf } = await import('/src/layout/presentBand.ts');
    const bytes = new Uint8Array(await (await fetch('/examples/bohemian-rhapsody/queen.mid')).arrayBuffer()), analysis = v.analyzeMidi(bytes);
    const sax = analysis.plan.instruments.find(i => i.type === 'saxophone');
    return { roster: v.session.layout.instances.map(i => i.type), saxNotes: sax.assignments.flatMap(a => a.track.notes).length,
      issues: validateLayout(v.session.layout, footprintsOf(v.session.members), v.venue.layout), notes: v.player.scheduledNotes };
  });
  assert.equal(queen.saxNotes, 138); assert.deepEqual(queen.issues, []); assert.equal(queen.notes, 5922);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/saxophone-queen.png` });
  // Two real instances loaded in reverse-ID order: focus and computer input stay with the chosen copy.
  const layout = { schemaVersion: 3, venueId: 'nocturne', units: 'meters', name: 'two-saxes', instances: [
    { id: 'sax.right', type: 'saxophone', transform: { position: [1.5, 0, 0], rotation: [0, 0, 0], scale: 1 } },
    { id: 'sax.left', type: 'saxophone', transform: { position: [-1.5, 0, 0], rotation: [0, .4, 0], scale: 1 } },
  ] };
  await page.evaluate(async layout => window.bandView.loadLayoutFile(new File([JSON.stringify(layout)], 'two-saxes.json')), layout);
  await page.evaluate(() => window.bandView.stage.focusInstrument('sax.left', true));
  await page.keyboard.down('a');
  assert.deepEqual(await page.evaluate(() => ['sax.left', 'sax.right'].map(id => window.bandView.instruments.get(id).activeNote)), [60, null]);
  await page.keyboard.up('a'); await page.evaluate(() => window.bandView.stage.focusInstrument('sax.right', true)); await page.keyboard.down('d');
  assert.deepEqual(await page.evaluate(() => ['sax.left', 'sax.right'].map(id => window.bandView.instruments.get(id).activeNote)), [null, 64]);
  await page.keyboard.up('d');
  assert.deepEqual(errors, []);
  console.log('Chrome saxophone: real dimensions, picking, mono priority, held-note fallback, blur, audible SF2, silent visuals, 138 Queen notes, formation and duplicate instance focus passed.', { initial, audio, queen });
} finally { await browser.close(); }
