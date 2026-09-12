import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/band/`);
  await page.waitForFunction(() => window.bandView?.session, null, { timeout: 90000 });
  const initial = await page.evaluate(async () => {
    const v = window.bandView, p = v.instruments.get('piano.main'), T = await import('/node_modules/three/build/three.module.js');
    const size = new T.Box3().setFromObject(p.root).getSize(new T.Vector3()).toArray();
    v.stage.focusInstrument(p.id, true);
    return { keys: p.model.keys.size, min: Math.min(...p.model.keys.keys()), max: Math.max(...p.model.keys.keys()), size };
  });
  assert.deepEqual([initial.keys, initial.min, initial.max], [88, 21, 108]);
  assert.ok(Math.abs(initial.size[1] - 1.85) < .01);
  console.log('Piano initial', initial);
  for (const view of ['whole', 'keys', 'strings']) {
    await page.evaluate(view => window.bandView.presentation.active.selectView(view, true), view);
    await page.waitForTimeout(400);
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/piano-${view}.png` });
    }
  }
  await page.evaluate(() => window.bandView.presentation.active.selectView('keys', true));
  // Real pointer hit, keyboard note ownership and release while a MIDI visual note is held.
  const keyPoint = await page.evaluate(async () => {
    const v = window.bandView, p = v.instruments.get('piano.main'), T = await import('/node_modules/three/build/three.module.js');
    p.root.updateWorldMatrix(true, true);
    const pos = p.model.keys.get(60).pivot.localToWorld(new T.Vector3(0, .02, .22)).project(v.camera.output);
    const rect = v.host.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (pos.x + 1) / 2 * rect.width, y: rect.top + (1 - pos.y) / 2 * rect.height };
  });
  assert.equal(await page.evaluate(({ x, y }) => window.bandView.interactions.hitTest(x, y, 'piano.main')?.partId, keyPoint), 'key:60');
  await page.mouse.move(keyPoint.x, keyPoint.y); await page.mouse.down(); await page.waitForTimeout(120);
  assert.ok(await page.evaluate(() => window.bandView.instruments.get('piano.main').model.keys.get(60).pivot.rotation.x > .02));
  await page.keyboard.down('a'); await page.mouse.up(); await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.bandView.instruments.get('piano.main').model.keys.get(60).pivot.rotation.x > .02));
  await page.keyboard.up('a'); await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('piano.main').model.keys.get(60).pivot.rotation.x), 0);
  await page.keyboard.down('Space'); await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => window.bandView.instruments.get('piano.main').model.pedals[2].rotation.x > .10));
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('Space'); await page.waitForTimeout(250);
  assert.ok(await page.evaluate(() => window.bandView.instruments.get('piano.main').model.pedals[2].rotation.x < .001));
  const isolation = await page.evaluate(async () => {
    const { GrandPianoInstrument } = await import('/src/instruments/piano/GrandPianoInstrument.ts');
    const events = [], audio = { noteOn: (...a) => events.push(a), noteOff() {}, cc() {}, setProgram: () => true, reset() {}, dispose() {} };
    const a = await GrandPianoInstrument.create(audio), b = await GrandPianoInstrument.create(audio);
    a.setInstanceId('piano.a'); b.setInstanceId('piano.b');
    a.visualNoteOn(60); a.update(.1); b.update(.1);
    const silent = events.length === 0, independent = a.model.keys.get(60).pivot.rotation.x > 0 && b.model.keys.get(60).pivot.rotation.x === 0;
    a.noteOn(60, 100, 'computer'); a.visualNoteOff(60); a.update(.1);
    const retained = a.model.keys.get(60).pivot.rotation.x > .03;
    a.noteOff(60, 'computer'); a.update(1); const released = a.model.keys.get(60).pivot.rotation.x === 0;
    a.dispose(); b.dispose(); return { silent, independent, retained, released };
  });
  assert.deepEqual(isolation, { silent: true, independent: true, retained: true, released: true });
  await page.getByRole('button', { name: '载入波西米亚示例', exact: true }).click();
  await page.waitForFunction(() => window.bandView.player && !document.querySelector('.band-lighting button').disabled, null, { timeout: 120000 });
  const queen = await page.evaluate(async () => {
    const v = window.bandView; v.player.pause(); v.player.seek(30);
    const { validateLayout } = await import('/src/layout/AutoLayout.ts'), { footprintsOf } = await import('/src/layout/presentBand.ts');
    return { roster: v.session.layout.instances.map(i => i.type), issues: validateLayout(v.session.layout, footprintsOf(v.session.members), v.venue.layout), notes: v.player.scheduledNotes };
  });
  assert.ok(queen.roster.includes('piano')); assert.deepEqual(queen.issues, []);
  assert.ok(queen.notes > 5900);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/piano-queen.png` });
  assert.deepEqual(errors, []);
  console.log('Chrome piano: 88 keys, actual raycast, pointer/computer ownership, sustain/blur, silent MIDI visuals, independent instances and Queen formation passed.', queen);
} finally { await browser.close(); }
