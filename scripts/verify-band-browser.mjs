import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Midi } = require('@tonejs/midi');
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.TEST_URL || 'http://127.0.0.1:5173'}/studio/band/`);
  await page.waitForFunction(() => window.bandView?.band?.children.length > 0, null, { timeout: 90000 });
  const visuals = await page.evaluate(() => {
    const list = window.bandView.instruments.list();
    for (const instrument of list) {
      const sampler = instrument.sampler ?? instrument.audio;
      const original = sampler.noteOn;
      sampler.noteOn = () => { throw new Error(`Visual emitted audio: ${instrument.role}`); };
      try {
        const note = { cello: 48, saxophone: 65, piano: 60, drums: 36, keyboard: 60, violin: 69, bass: 40, acoustic: 64, electric: 64 }[instrument.role];
        if (!Number.isInteger(note)) throw new Error(`Missing visual test note: ${instrument.role}`);
        instrument.visualNoteOn(note, 100);
        instrument.update(.016);
        instrument.visualNoteOff(note);
      } finally { sampler.noteOn = original; instrument.reset(); }
    }
    return list.map(i => i.role);
  });
  assert.deepEqual(visuals.sort(), ['acoustic', 'bass', 'cello', 'drums', 'electric', 'keyboard', 'piano', 'saxophone', 'violin']);
  const midi = new Midi();
  for (const [program, note] of [[0, 60], [33, 40], [40, 69], [42, 48]]) {
    const track = midi.addTrack();
    track.channel = midi.tracks.length - 1;
    track.instrument.number = program;
    track.addNote({ midi: note, time: 0, duration: 8, velocity: .7 });
  }
  const bytes = [...midi.toArray()];
  await page.evaluate(async bytes => {
    await window.bandView.loadMidiFile(new File([new Uint8Array(bytes)], 'four-single-note-tracks.mid'));
  }, bytes);
  await page.waitForFunction(() => window.bandView.player?.scheduledNotes === 4, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.bandView.instruments.get('cello.main')?.role), 'cello');
  await page.getByTitle('播放', { exact: true }).click();
  await page.waitForFunction(() => window.bandView.player?.time > .3);
  assert.equal(await page.evaluate(() => window.bandView.player.isPlaying), true);
  const notes = await page.evaluate(() => window.bandView.player.scheduledNotes);
  assert.equal(notes, 4, 'single-note tracks must reach the stage');
  await page.getByTitle('暂停', { exact: true }).click();
  assert.equal(await page.evaluate(() => window.bandView.player.isPlaying), false);
  // Loading again exercises disposal of real model resources, not only sampler cleanup.
  await page.evaluate(async bytes => {
    await window.bandView.loadMidiFile(new File([new Uint8Array(bytes)], 'reload.mid'));
  }, bytes);
  assert.equal(await page.evaluate(() => window.bandView.player.scheduledNotes), 4);
  assert.deepEqual(errors, []);
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH });
  console.log('Chrome band: nine silent visual APIs, one-note tracks including GM42 cello, playback, pause and reload passed.');
  await page.goto(`${process.env.TEST_URL || 'http://127.0.0.1:5173'}/studio/layout/`);
  await page.getByRole('button', { name: '自动排位', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === '自动排位' && !b.disabled), null, { timeout: 90000 });
  await page.getByRole('button', { name: '俯视布局', exact: true }).click();
  const canvas = page.locator('canvas').first();
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width * .4, rect.y + rect.height * .5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .55, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  await page.getByRole('button', { name: '自动排位', exact: true }).click();
  assert.deepEqual(errors, [], 'layout browser errors');
  console.log('Chrome layout: load, view switch, explicit pan gestures and arrange passed.');
} finally { await browser.close(); }
