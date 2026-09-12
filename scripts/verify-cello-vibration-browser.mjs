import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/band/`);
  await page.waitForFunction(() => window.bandView?.session && window.bandView.instruments.get('cello.main'), null, { timeout: 120000 });
  const report = await page.evaluate(() => {
    const c = window.bandView.instruments.get('cello.main'); c.reset();
    const strings = c.model.strings, geometries = strings.map(s => s.mesh.geometry), rest = strings.map(s => [...s.mesh.geometry.attributes.position.array]);
    const events = [], audioOn = c.audio.noteOn; c.audio.noteOn = (...args) => events.push(args);
    const deviation = (s, from = 0, to = s.rows) => {
      const p = s.mesh.geometry.attributes.position; let max = 0;
      for (let row = from; row <= to; row++) {
        const i = row * (s.sides + 1), t = (p.getY(i) - s.bridge.y) / (s.nut.y - s.bridge.y);
        max = Math.max(max, Math.abs(p.getX(i) - s.radius - (s.bridge.x + (s.nut.x - s.bridge.x) * t)));
      }
      return max;
    };
    const step = (frames = 30) => { let result; for (let i = 0; i < frames; i++) result = c.update(1 / 60); return result; };
    const same = (a, b) => a.every((v, i) => v === b[i]);
    let silent, peak, endpoints, quietNeighbors, sustained, tail, settled, restored, stopped, stronger, independent, reused;
    try {
      c.visualNoteOn(43, 120); step(); const first = [...strings[1].mesh.geometry.attributes.position.array]; step(5);
      peak = deviation(strings[1]); sustained = !same(first, strings[1].mesh.geometry.attributes.position.array);
      endpoints = deviation(strings[1], 0, 0) < 1e-7 && deviation(strings[1], strings[1].rows, strings[1].rows) < 1e-7;
      quietNeighbors = [0, 2, 3].every(i => same(rest[i], strings[i].mesh.geometry.attributes.position.array));
      c.visualNoteOff(43); step(3); tail = deviation(strings[1]) > .00005;
      settled = !step(100).animating; restored = strings.every((s, i) => same(rest[i], s.mesh.geometry.attributes.position.array));
      c.visualNoteOn(55, 120); step(); // D string stopped five semitones above D3.
      const s = strings[2], split = Math.round(s.rows * 2 ** (-5 / 12));
      stopped = deviation(s, 0, split - 1) > .0001 && deviation(s, split, s.rows) < 1e-7;
      const measure = velocity => { c.reset(); c.visualNoteOn(43, velocity); step(40); let value = 0; for (let i = 0; i < 30; i++) { step(1); value = Math.max(value, deviation(strings[1])); } return value; };
      stronger = measure(120) > measure(30) * 2.5;
      c.reset(); c.visualNoteOn(43, 100); c.noteOn(43, 100, 'a'); c.noteOn(43, 100, 'b'); c.noteOff(43, 'a'); c.visualNoteOff(43); step();
      independent = deviation(strings[1]) > .0001; c.noteOff(43, 'b'); step(120); independent &&= deviation(strings[1]) < 1e-7;
      silent = events.length === 2; // Only the two explicit live attacks, never the visual events.
      reused = strings.every((s, i) => s.mesh.geometry === geometries[i]);
      c.visualNoteOn(36, 110); step(); c.reset(); restored &&= strings.every((s, i) => same(rest[i], s.mesh.geometry.attributes.position.array));
    } finally { c.audio.noteOn = audioOn; c.reset(); }
    return { silent, peak, endpoints, quietNeighbors, sustained, tail, settled, restored, stopped, stronger, independent, reused };
  });
  assert.ok(report.peak > .0001); for (const [key, value] of Object.entries(report)) if (key !== 'peak') assert.equal(value, true, key);
  await page.evaluate(() => {
    const v = window.bandView; v.stage.focusInstrument('cello.main', true); v.presentation.active.selectView('strings', true);
    v.instruments.get('cello.main').visualNoteOn(43, 120);
  });
  await page.waitForTimeout(400);
  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    for (let i = 0; i < 3; i++) { await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/cello-vibration-${i}.png` }); await page.waitForTimeout(90); }
  }
  await page.evaluate(() => window.bandView.instruments.get('cello.main').reset());
  assert.deepEqual(errors, []); console.log('Cello vibration: live/score, independent strings, fixed endpoints/stopped segment, velocity, release tail, reset and geometry reuse passed.', report);
} finally { await browser.close(); }
