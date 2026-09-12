import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Midi } = require('@tonejs/midi');
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1050, height: 760 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.TEST_URL || 'http://127.0.0.1:5173'}/studio/band/`);
  await page.waitForFunction(() => window.bandView?.instruments.size === 9, null, { timeout: 90000 });
  const sound = await page.evaluate(async () => {
    const { live, instruments } = window.bandView;
    await live.context.resume();
    await live.prepare();
    const synth = live.engine.synth;
    const analyser = live.context.createAnalyser();
    analyser.fftSize = 2048;
    synth.connect(analyser);
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const data = new Float32Array(2048);
    const rms = () => { analyser.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length); };
    window.liveProbe = rms;
    const result = {};
    for (const instrument of instruments.list()) {
      const port = instrument.sampler ?? instrument.audio;
      if (instrument.role === 'cello') instrument.noteOn(48, 115);
      else if (['piano', 'saxophone'].includes(instrument.role)) instrument.noteOn(60, 115);
      else if (instrument.role === 'keyboard') port.noteOn('lower', 60, 115, 'test');
      else if (instrument.role === 'drums') port.noteOn(38, 115);
      else if (instrument.role === 'violin') port.noteOn(1, 69, 115, 'arco');
      else port.noteOn(1, instrument.role === 'bass' ? 40 : 64, 115, 'gated');
      await wait(160);
      result[instrument.role] = { rms: rms(), voices: synth.voiceCount };
      instrument.reset();
      await wait(200);
    }
    for (const instrument of instruments.list().filter(i => ['violin', 'bass', 'electric', 'acoustic'].includes(i.role))) {
      const note = instrument.role === 'violin' ? 69 : instrument.role === 'bass' ? 40 : 64;
      instrument.noteOn(note, 100);
      instrument.visualNoteOff(note); // Simulate a score update replacing the held model pose.
      instrument.noteOff(note);
      const channels = instrument.sampler.strings ?? instrument.sampler.arco;
      if (channels.some(channel => channel.voices.size)) throw new Error(`${instrument.role}: visual state prevented audio release`);
      instrument.reset();
    }
    // Grow again after asynchronous channelAdded events. Library UI channel count is not capacity.
    const extras = Array.from({ length: 20 }, () => live.allocate(80));
    const last = extras.at(-1);
    last.noteOn('growth', 72, 100);
    const expanded = await synth.getSnapshot();
    if (expanded.midiChannels.length <= last.id || expanded.midiChannels[last.id].patch.program !== 80) {
      throw new Error('Newly allocated channel does not exist in the actual audio processor');
    }
    extras.forEach(channel => channel.dispose());
    return { result, allocated: live.channels.size, synthChannels: expanded.midiChannels.length };
  });
  console.log('live audio', sound);
  assert.deepEqual(Object.keys(sound.result).sort(), ['acoustic', 'bass', 'cello', 'drums', 'electric', 'keyboard', 'piano', 'saxophone', 'violin']);
  assert.equal(sound.allocated, 30);
  assert.ok(sound.synthChannels >= 30, 'live channels extend beyond the initial MIDI port');
  for (const [role, value] of Object.entries(sound.result)) assert.ok(value.rms > .00001 && value.voices > 0, `${role} must sound`);

  // Three simultaneous electronic parts require two physical keyboards, including the second copy.
  const midi = new Midi();
  for (const [program, note] of [[5, 60], [4, 64], [89, 67]]) {
    const track = midi.addTrack();
    track.channel = midi.tracks.length - 1;
    track.instrument.number = program;
    track.addNote({ midi: note, time: 0, duration: 12, velocity: .75 });
  }
  const bytes = [...midi.toArray()];
  await page.evaluate(async bytes => {
    await window.bandView.loadMidiFile(new File([new Uint8Array(bytes)], 'two-keyboards.mid'));
  }, bytes);
  await page.waitForFunction(() => window.bandView.instruments.list().filter(i => i.role === 'keyboard').length === 2);
  assert.equal(await page.evaluate(() => window.bandView.live.channels.size), 4, 'old live instruments release all channel leases');
  await page.waitForFunction(() => !window.bandView.camera.isTransitioning);

  const targets = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const view = window.bandView;
    const rect = view.host.renderer.domElement.getBoundingClientRect();
    const instances = view.instruments.list();
    // Reproduce a stale cloned identity tag deliberately. Actual root ownership must win.
    instances[1].root.traverse(mesh => { mesh.userData.instrumentId = instances[0].id; });
    return instances.map(instrument => {
      const points = [];
      instrument.root.updateWorldMatrix(true, true);
      instrument.root.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.geometry.computeBoundingBox();
        const p = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
        mesh.localToWorld(p).project(view.camera.output);
        const x = rect.left + (p.x + 1) * rect.width / 2;
        const y = rect.top + (1 - p.y) * rect.height / 2;
        if (x > 0 && x < rect.right && y > 0 && y < rect.bottom && view.instrumentAt(x, y) === instrument.id) points.push({ x, y });
      });
      return { id: instrument.id, point: points[0], focusable: view.stage.canFocus(instrument.id),
        preset: view.cameraRegistry.get(`${instrument.id}:whole`).instrumentId };
    });
  });
  assert.equal(new Set(targets.map(t => t.preset)).size, 2);
  assert.ok(targets.every(t => t.point && t.focusable));
  for (const target of targets) {
    await page.evaluate(() => window.bandView.stage.showBand(true));
    await page.waitForTimeout(100);
    await page.mouse.dblclick(target.point.x, target.point.y);
    await page.waitForFunction(id => window.bandView.stage.focusedInstrumentId === id &&
      window.bandView.presentation.active?.id === `${id}:showcase`, target.id);
    // A real computer-key press must belong to this copy, not the first keyboard.
    await page.keyboard.down('a');
    const ownership = await page.evaluate(() => window.bandView.instruments.list().map(i => ({
      id: i.id, held: i.sampler.tiers.lower.voices.size,
    })));
    assert.deepEqual(ownership.filter(i => i.held > 0).map(i => i.id), [target.id]);
    await page.keyboard.up('a');
  }
  console.log('Chrome: both keyboard copies pick, focus, and receive physical key input independently.');

  const isolation = await page.evaluate(async () => {
    const view = window.bandView;
    const [a, b] = view.instruments.list();
    view.stage.showBand(true);
    a.sampler.setProgram('lower', 48);
    b.sampler.setProgram('lower', 80);
    a.sampler.noteOn('lower', 60, 100, 'a');
    b.sampler.noteOn('lower', 60, 100, 'b');
    b.sampler.noteOn('lower', 60, 100, 'second-source');
    b.sampler.noteOff('lower', 60, 'b');
    a.sampler.setPitchBend('lower', .5);
    a.sampler.setSustain('lower', true);
    const channelA = a.sampler.tiers.lower.id;
    const channelB = b.sampler.tiers.lower.id;
    await view.player.play();
    view.player.pause();
    view.player.seek(4);
    a.reset();
    await new Promise(resolve => setTimeout(resolve, 150));
    const snapshot = await view.live.engine.synth.getSnapshot();
    const held = b.sampler.tiers.lower.voices.size;
    const result = { channelA, channelB, held, rms: window.liveProbe(),
      programs: [snapshot.midiChannels[channelA].patch.program, snapshot.midiChannels[channelB].patch.program],
      bendB: snapshot.midiChannels[channelB].midiParameters.pitchWheel,
      sustainB: snapshot.midiChannels[channelB].midiControllers[64] >> 7 };
    b.reset();
    // CC121 alone does not clear MIDI volume: reused channels must be initialized explicitly.
    a.sampler.tiers.lower.cc(7, 0);
    const oldChannels = view.live.channels.size;
    view.instruments.unregister(a.id);
    a.root.removeFromParent();
    a.dispose();
    const { createInstrumentInstance } = await import('/src/instruments/InstrumentDefinitions.ts');
    const c = await createInstrumentInstance({ id: 'keyboard.replacement', type: 'keyboard' }, view.live);
    const replacement = (await view.live.engine.synth.getSnapshot()).midiChannels[c.sampler.tiers.lower.id];
    result.reusedVolume = replacement.midiControllers[7] >> 7;
    result.sameChannelCount = oldChannels === view.live.channels.size;
    c.dispose();
    return result;
  });
  assert.notEqual(isolation.channelA, isolation.channelB);
  assert.equal(isolation.held, 1, 'seek/pause/reset of another instrument must preserve live hold');
  assert.ok(isolation.rms > .00001);
  assert.deepEqual(isolation.programs, [48, 80]);
  assert.equal(isolation.bendB, 8192);
  assert.equal(isolation.sustainB, 0);
  assert.equal(isolation.reusedVolume, 100);
  assert.ok(isolation.sameChannelCount);
  assert.deepEqual(errors, []);
  console.log('Chrome: live/MIDI isolation, same-pitch instances, channel recycling and all nine sounds passed.');
  await page.goto(`${process.env.TEST_URL || 'http://127.0.0.1:5173'}/assets/instruments/`);
  await page.waitForFunction(() => window.virtualBandV2?.instruments.size === 9, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const app = window.virtualBandV2;
    await app.audio.resume();
    await app.prepareShowcaseAudio();
    app.presentation.activate(app.requireKeyboardShowcase().id);
  });
  await page.keyboard.down('a');
  assert.equal(await page.evaluate(() => window.virtualBandV2.requireKeyboard().sampler.tiers.lower.voices.size), 1);
  await page.keyboard.up('a');
  assert.deepEqual(errors, []);
  console.log('Chrome: instrument library uses the same live engine and keyboard input path.');
} finally { await browser.close(); }
