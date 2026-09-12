import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), { Midi } = require('@tonejs/midi');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/band/`);
  await page.waitForFunction(() => window.bandView?.session, null, { timeout: 90000 });
  // Optional fidelity comparison against the actual user-supplied illustration, without its app/scripts.
  if (process.env.REFERENCE_HTML) {
    const html = fs.readFileSync(process.env.REFERENCE_HTML, 'utf8');
    const start = html.indexOf('(function (global)', html.indexOf('Procedural Canvas 2D illustration'));
    const end = html.indexOf('})(globalThis);', start) + '})(globalThis);'.length;
    assert.ok(start >= 0 && end > start);
    await page.addScriptTag({ content: html.slice(start, end) });
  }
  const artwork = await page.evaluate(async () => {
    const { MusicAnalysis } = await import('/src/lighting/MusicAnalysis.ts');
    const { bohemianTheatreContent } = await import('/src/screens/shows/BohemianTheatre.ts');
    const { createMidiTheatre } = await import('/src/screens/shows/MidiTheatre.js');
    const { BOHEMIAN_SECTIONS } = await import('/src/lighting/shows/BohemianRhapsody.ts');
    const music = new MusicAnalysis(await (await fetch('/examples/bohemian-rhapsody/queen.mid')).arrayBuffer());
    const content = bohemianTheatreContent(music), bytes = canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const hash = canvas => { let h = 2166136261; for (const v of bytes(canvas)) h = Math.imul(h ^ v, 16777619); return h >>> 0; };
    const ownCanvases = [], create = document.createElement.bind(document);
    document.createElement = (tag, ...args) => { const e = create(tag, ...args); if (tag === 'canvas') ownCanvases.push(e); return e; };
    const players = window.bandView.venue.screens.screens.map(screen => content.create(screen, new AbortController().signal));
    const times = [0, 20, 186, 222, 296, 410, 466].map(beat => music.secondsAtBeat(beat) + 3);
    times.push(music.secondsAtBeat(222) + .7, music.secondsAtBeat(296) + .4);
    const frames = [];
    for (const p of players) {
      const hashes = [];
      for (const time of times) {
        const frame = { time, delta: 0, playing: false, width: p.surface.width, height: p.surface.height };
        p.update(frame); const first = hash(p.surface);
        if (p.update(frame) !== false) throw Error('Paused canvas redraws');
        p.update({ ...frame, time: 5 }); p.update(frame);
        if (hash(p.surface) !== first) throw Error('Backward seek changes frame');
        hashes.push(first);
      }
      p.update({ time: music.duration, delta: 0, playing: false });
      if (bytes(p.surface).some((v, i) => i % 4 !== 3 && v !== 0)) throw Error('Ending did not black out');
      frames.push(hashes); p.dispose(); p.dispose();
    }
    document.createElement = create;
    if (ownCanvases.some(c => c.width !== 1 || c.height !== 1)) throw Error('Drawing cache was not released');
    let comparisons = 0;
    if (window.MidiTheatre) {
      const reference = new window.MidiTheatre({
        score: { ppq: music.ppq, duration: music.duration, tickToSeconds: t => music.secondsAtBeat(t / music.ppq), secondsToTick: t => music.at(t).quarter * music.ppq },
        groups: Object.fromEntries(Object.entries(music.groups).map(([role, notes]) => [role, notes.map(n => ({ ...n, v: n.velocity * 127 }))])),
      });
      const extracted = createMidiTheatre(music);
      const a = create('canvas'), b = create('canvas'); a.width = b.width = 640; a.height = b.height = 240;
      for (const id of ['main', 'left', 'right']) for (const time of times) {
        const f = music.at(time); let chapter = BOHEMIAN_SECTIONS[0];
        for (const s of BOHEMIAN_SECTIONS) { if (s.beat > f.quarter) break; chapter = s; }
        const frame = { screen: { id }, width: a.width, height: a.height };
        reference.draw(a.getContext('2d'), frame, { ...f, chapter });
        extracted.draw(b.getContext('2d'), frame, { ...f, chapter });
        if (hash(a) !== hash(b)) throw Error(`Reference artwork differs: ${id} at ${time}`);
        comparisons++;
      }
      extracted.dispose(); delete window.MidiTheatre;
    }
    window.theatreHash = () => ['main', 'left', 'right'].map(id => hash(window.bandView.venue.root.getObjectByName('LED:' + id).material.uniforms.source.value.image));
    return { frames, comparisons, canvasesReleased: ownCanvases.length };
  });
  assert.ok(artwork.frames.every(hashes => new Set(hashes).size === 9));
  assert.notDeepEqual(artwork.frames[1], artwork.frames[2]);
  if (process.env.REFERENCE_HTML) assert.equal(artwork.comparisons, 27);
  console.log('Artwork', JSON.stringify({ comparisons: artwork.comparisons, canvasesReleased: artwork.canvasesReleased }));
  await page.getByRole('button', { name: '载入波西米亚示例', exact: true }).click();
  await page.waitForFunction(() => window.bandView.screens.status('right').label === '波西米亚 · 七幕剧场', null, { timeout: 120000 });
  await page.evaluate(() => window.bandView.player.pause());
  await page.getByLabel('固定机位', { exact: true }).selectOption('band:venue');
  await page.waitForTimeout(150);
  const invariant = await page.evaluate(() => ({ camera: window.bandView.camera.output.position.toArray(), layout: JSON.stringify(window.bandView.session.layout) }));
  const seek = async time => {
    await page.evaluate(t => window.bandView.player.seek(t), time);
    await page.waitForFunction(t => Math.abs(window.bandView.screens.status('main').time - t) < .02, time);
    await page.waitForTimeout(100);
  };
  for (const time of [30, 175, 235, 290]) {
    await seek(time);
    assert.deepEqual(await page.evaluate(() => ({ camera: window.bandView.camera.output.position.toArray(), layout: JSON.stringify(window.bandView.session.layout) })), invariant);
    const once = await page.evaluate(() => window.theatreHash());
    await seek(10); await seek(time);
    assert.deepEqual(await page.evaluate(() => window.theatreHash()), once, `Mainline seek pixels at ${time}`);
    if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/theatre-${time}.png` }); }
  }
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => window.bandView.player.time > 290.5);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.waitForTimeout(150); const frozen = await page.evaluate(() => window.theatreHash());
  await page.waitForTimeout(250); assert.deepEqual(await page.evaluate(() => window.theatreHash()), frozen);
  await page.getByLabel('歌曲灯光', { exact: true }).uncheck();
  assert.deepEqual(await page.evaluate(() => window.theatreHash()), frozen, 'Lighting toggle does not replace content');
  await page.getByText('LED 内容', { exact: true }).click();
  await page.getByLabel('目标屏幕', { exact: true }).selectOption('left');
  await page.getByLabel('导入 LED 图片或视频', { exact: true }).setInputFiles('scripts/fixtures/screens/poster.svg');
  await page.waitForFunction(() => window.bandView.screens.status('left').label === 'poster.svg');
  assert.equal(await page.evaluate(() => window.bandView.screens.status('main').label), '波西米亚 · 七幕剧场');
  await page.getByRole('button', { name: '恢复歌曲画面', exact: true }).click();
  await page.waitForFunction(() => window.bandView.screens.status('left').label === '波西米亚 · 七幕剧场');
  assert.ok(await page.evaluate(() => Math.abs(window.bandView.screens.status('left').time - window.bandView.player.time) < .02));
  await page.getByLabel('导入 LED 图片或视频', { exact: true }).setInputFiles('scripts/fixtures/screens/poster.svg');
  await page.waitForFunction(() => window.bandView.screens.status('left').label === 'poster.svg');
  const midi = new Midi(); midi.addTrack().addNote({ midi: 60, time: 0, duration: 2, velocity: .8 });
  await page.evaluate(async bytes => window.bandView.loadMidiFile(new File([new Uint8Array(bytes)], 'queen.mid')), [...midi.toArray()]);
  assert.deepEqual(await page.evaluate(() => ['main', 'left', 'right'].map(id => window.bandView.screens.status(id).label)), ['默认图案', 'poster.svg', '默认图案']);
  assert.equal(await page.getByRole('button', { name: '恢复歌曲画面', exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('Chrome theatre: seven acts, three compositions, reference fidelity, pause/seek/blackout, cache cleanup, mainline playback, manual replacement/restore and unrelated MIDI passed.');
} finally { await browser.close(); }
