import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Midi } = require('@tonejs/midi');
const midi = new Midi();
[26, 27, 28, 24, 25, 24].forEach((program, channel) => {
  const track = midi.addTrack(); track.channel = channel; track.instrument.number = program;
  track.addNote({ midi: 55 + channel, time: 0, duration: 8, velocity: .8 });
});
const bytes = [...midi.toArray()];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5173/studio/band/?electric=flying-v');
  await page.waitForFunction(() => window.bandView?.session, null, { timeout: 120000 });
  const load = () => page.evaluate(async data => {
    await window.bandView.loadMidiFile(new File([new Uint8Array(data)], 'multiple-guitars.mid'));
  }, bytes);
  await load();
  const snapshot = await page.evaluate(() => {
    const v = window.bandView;
    window.assetMappingRefs = v.instruments.list();
    return { notes: v.player.scheduledNotes, assets: v.performanceBand.built.map(b => ({
      type: b.type, asset: b.assetId, id: b.instrument.id, variant: b.instrument.variant,
    })) };
  });
  assert.equal(snapshot.notes, 6);
  const electric = snapshot.assets.filter(a => a.type === 'electric');
  const acoustic = snapshot.assets.filter(a => a.type === 'acoustic');
  assert.equal(electric.length, 3); assert.equal(new Set(electric.map(a => a.asset)).size, 3);
  assert.equal(electric[0].variant, 'flying-v', 'existing chosen appearance survives');
  assert.deepEqual(acoustic.map(a => a.variant), ['natural', 'cutaway-sunburst', 'natural']);
  assert.equal(new Set(snapshot.assets.map(a => a.id)).size, 6);
  await load();
  assert.ok(await page.evaluate(() => window.bandView.instruments.list().every(i => window.assetMappingRefs.includes(i))), 'reload reuses matching instances');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(snapshot));
} finally { await browser.close(); }
