import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 950 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5173/assets/instruments/');
  await page.waitForFunction(() => window.virtualBandV2?.state.getSnapshot().running, null, { timeout: 120000 });
  const select = page.getByLabel('选择乐器与款式');
  const ids = await select.locator('option').evaluateAll(options => options.map(o => o.value));
  assert.equal(ids.length, 12);
  for (const id of ids) {
    await select.selectOption(id);
    const visible = await page.evaluate(() => window.virtualBandV2.instruments.list().filter(i => i.root.visible).map(i => i.id));
    assert.deepEqual(visible, [id]);
    assert.ok(await page.evaluate(() => window.virtualBandV2.camera.output.position.toArray().every(Number.isFinite)));
  }
  await select.selectOption('acoustic.sunburst');
  await page.evaluate(() => window.virtualBandV2.presentation.active.selectView('body', true));
  await page.waitForTimeout(350);
  const point = await page.evaluate(() => {
    const app = window.virtualBandV2, g = app.instruments.get('acoustic.sunburst');
    const string = g.model.strings.get(6), p = string.a.clone().lerp(string.b, .08); p.z += .025;
    g.root.localToWorld(p).project(app.camera.output);
    const r = app.renderer.renderer.domElement.getBoundingClientRect();
    const x = r.left + (p.x + 1) * r.width / 2, y = r.top + (1 - p.y) * r.height / 2;
    return { x, y, hit: app.interactions.hitTest(x, y, g.id)?.partId, strings: g.model.strings.size, variant: g.variant };
  });
  assert.equal(point.variant, 'cutaway-sunburst'); assert.equal(point.strings, 6); assert.match(point.hit, /^pluck:/);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  const playing = await page.evaluate(() => {
    const app = window.virtualBandV2, g = app.instruments.get('acoustic.sunburst'); g.update(.016);
    return { active: g.activeNotes.length, vibrating: [...g.model.strings.values()].some(s => s.energy > 0), other: app.instruments.get('acoustic.main').activeNotes.length };
  });
  assert.ok(playing.active > 0 && playing.vibrating); assert.equal(playing.other, 0);
  await page.mouse.up();
  const screenshot = join(tmpdir(), 'acoustic-sunburst-library-check.png'); await page.screenshot({ path: screenshot });
  await page.getByRole('button', { name: '上一款', exact: true }).click();
  assert.equal(await select.inputValue(), 'electric.flying-v');
  await page.getByRole('button', { name: '下一款', exact: true }).click();
  assert.equal(await select.inputValue(), 'acoustic.sunburst');
  await select.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), '上一款', 'Tab reaches controls');
  await page.getByRole('link', { name: '在乐队舞台查看', exact: true }).click();
  await page.waitForFunction(() => window.bandView?.instruments.get('acoustic.main')?.variant === 'cutaway-sunburst' && window.bandView.session, null, { timeout: 120000 });
  assert.equal(await page.evaluate(() => window.bandView.stage.current.instrumentId), 'acoustic.main');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ assets: ids.length, playing, screenshot, stageVariant: 'cutaway-sunburst' }));
} finally { await browser.close(); }
