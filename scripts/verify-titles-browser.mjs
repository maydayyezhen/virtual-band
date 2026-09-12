import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5173/studio/band/');
  await page.getByRole('button', { name: '载入波西米亚示例', exact: true }).click({ timeout: 120000 });
  await page.waitForFunction(() => window.bandView?.titles && document.querySelector('.band-title-previews')?.childElementCount === 2, null, { timeout: 120000 });
  const paths = [];
  for (const [label, id] of [['预览片头', 'opening'], ['预览片尾', 'closing']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction(id => window.bandView.titles.state.cue?.id === id && window.bandView.titles.state.opacity > .99, id);
    assert.equal(await page.evaluate(() => window.bandView.titles.state.cue.credit), 'yezhen 制作');
    await page.getByRole('button', { name: '观看模式', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    const path = join(tmpdir(), `bohemian-title-${id}.png`);
    await page.screenshot({ path }); paths.push(path);
    await page.getByRole('button', { name: '退出观看', exact: true }).click();
  }
  // Validate actual canvas compositing, independent of DOM visibility or screenshot overlays.
  const pixels = await page.evaluate(() => {
    const v = window.bandView;
    const capture = () => v.host.renderer.domElement.toDataURL();
    v.host.render(v.camera.output); const before = capture();
    v.titles.update(7); v.titles.render(v.host.renderer); const after = capture();
    const first = JSON.stringify(v.titles.state);
    v.titles.update(321); v.titles.update(7);
    const seekStable = first === JSON.stringify(v.titles.state);
    v.titles.update(80); const middle = v.titles.state;
    v.titles.update(v.player.total); const end = v.titles.state;
    return { composed: before !== after, seekStable, middle: middle.opacity, endOpacity: end.opacity, black: end.blackout };
  });
  assert.deepEqual(pixels, { composed: true, seekStable: true, middle: 0, endOpacity: 0, black: 1 });
  await page.getByLabel('片头片尾', { exact: true }).uncheck();
  assert.equal(await page.evaluate(() => window.bandView.titles.enabled), false);
  await page.getByRole('button', { name: '预览片头', exact: true }).click();
  assert.equal(await page.evaluate(() => window.bandView.titles.enabled), true);
  await page.evaluate(() => window.bandView.titles.setShow(null));
  assert.equal(await page.evaluate(() => window.bandView.titles.state.blackout), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pixels, paths }));
} finally { await browser.close(); }
