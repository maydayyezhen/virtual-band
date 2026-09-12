import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Midi } = require('@tonejs/midi');
const midi = new Midi();
const track = midi.addTrack();
track.instrument.number = 48;
track.addNote({ midi: 60, time: 0, duration: 12, velocity: .8 });
track.addCC({ number: 7, value: .75, time: 0 });
track.addCC({ number: 64, value: 1, time: 0 });
track.addCC({ number: 64, value: 0, time: 10 });
// midi-file's writer takes a signed 14-bit bend. Avoid @tonejs/midi's normalized writer value.
track.addPitchBend({ value: 4096, time: 1 });
const bytes = Buffer.from(midi.toArray());
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.TEST_URL || 'http://127.0.0.1:5173'}/tools/audio/player/`);
  await page.locator('#midi-file').setInputFiles({ name: 'playback-contract.mid', mimeType: 'audio/midi', buffer: bytes });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('已就绪'), null, { timeout: 60000 });
  await page.evaluate(() => {
    const { playback, context } = window.midiPreview;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    playback.synth.connect(analyser);
    window.audioProbe = () => {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      return { rms: Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length),
        time: playback.time, audioTime: context.currentTime, playing: playback.isPlaying, voices: playback.synth.voiceCount };
    };
  });
  await page.locator('#play').click();
  await page.waitForTimeout(1400);
  const start = await page.evaluate(() => window.audioProbe());
  console.log('start', start);
  assert.ok(start.playing && start.rms > .00001, 'time-zero note must produce audio');
  await page.locator('#pause').click();
  await page.waitForTimeout(300);
  const paused = await page.evaluate(() => window.audioProbe());
  await page.waitForTimeout(300);
  assert.ok(Math.abs((await page.evaluate(() => window.audioProbe())).time - paused.time) < .03, 'pause holds time');
  await page.locator('#play').click();
  await page.waitForTimeout(400);
  const resumed = await page.evaluate(() => window.audioProbe());
  console.log('resumed', resumed);
  assert.ok(resumed.rms > .00001, 'resume restores held note');
  await page.evaluate(() => window.midiPreview.playback.seek(7));
  await page.waitForTimeout(400);
  const sought = await page.evaluate(() => window.audioProbe());
  console.log('seek', sought);
  const controls = await page.evaluate(async () => {
    const channel = (await window.midiPreview.playback.synth.getSnapshot()).midiChannels[0];
    return { program: channel.patch.program, volume: channel.midiControllers[7] >> 7,
      sustain: channel.midiControllers[64] >> 7, bend: channel.midiParameters.pitchWheel };
  });
  assert.deepEqual(controls, { program: 48, volume: 95, sustain: 127, bend: 12288 }, 'seek restores MIDI controllers');
  assert.ok(sought.time >= 7, 'seek moves transport to the requested time');
  await page.evaluate(() => {
    const start = performance.now();
    while (performance.now() - start < 700) { /* Simulate a blocked 3D/main thread. */ }
  });
  await page.waitForTimeout(120);
  const afterStall = await page.evaluate(() => window.audioProbe());
  console.log('after stall', afterStall, { songDelta: afterStall.time - sought.time, audioDelta: afterStall.audioTime - sought.audioTime });
  assert.ok(afterStall.time > sought.time + .25, 'audio advances while the renderer is blocked');
  // Native sync messages queued during the stall may temporarily move the UI clock backwards.
  // Keep the same tolerance, but require recovery on the next native sync instead of at 120 ms.
  await page.waitForFunction(base => {
    const current = window.audioProbe();
    return Math.abs((current.time - base.time) - (current.audioTime - base.audioTime)) < .2;
  }, sought, { timeout: 2500 });
  console.log('resynchronized', await page.evaluate(() => window.audioProbe()));
  await page.locator('#stop').click();
  await page.waitForTimeout(300);
  const stopped = await page.evaluate(() => window.audioProbe());
  assert.ok(!stopped.playing && stopped.time < .05, 'stop resets transport');
  // Load another file on the same engine and exercise completion and replay.
  const short = new Midi();
  short.addTrack().addNote({ midi: 64, time: 0, duration: .35, velocity: .8 });
  await page.locator('#midi-file').setInputFiles({ name: 'short.mid', mimeType: 'audio/midi', buffer: Buffer.from(short.toArray()) });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('short.mid · 已就绪'));
  await page.locator('#play').click();
  await page.waitForFunction(() => window.midiPreview.playback.sequencer.isFinished);
  await page.locator('#play').click();
  await page.waitForFunction(() => window.midiPreview.playback.isPlaying);
  await page.waitForFunction(() => window.midiPreview.playback.sequencer.isFinished);
  assert.deepEqual(errors, [], 'browser errors');
  console.log('Browser audio playback checks passed.');
} finally { await browser.close(); }
