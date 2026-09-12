import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5173/studio/band/?offline=1');
  await page.waitForFunction(() => window.bandView?.session && window.bandView.offline, null, { timeout: 120000 });
  await page.getByRole('button', { name: '自由创作示例', exact: true }).click();
  await page.waitForFunction(() => window.bandView?.lighting.currentShow?.id === 'freeform-wave' && !document.querySelector('.band-lighting button').disabled, null, { timeout: 120000 });
  assert.equal(await page.getByLabel('作品导播', { exact: true }).isChecked(), true);
  const result = await page.evaluate(() => {
    const v = window.bandView;
    const capture = t => {
      v.lighting.update(t); v.cameraShow.update(t);
      return { position: v.camera.output.position.toArray(), target: v.camera.targetPosition.toArray(), light: v.lighting.frame };
    };
    const original = capture(13); capture(89); const repeated = capture(13);
    if (v.cameraShow.error || v.lighting.error) throw Error(v.cameraShow.error || v.lighting.error);
    v.offline.begin(); v.offline.renderAt(13);
    const exported = capture(13);
    return { stable: JSON.stringify(original) === JSON.stringify(repeated),
      sameOffline: JSON.stringify(original) === JSON.stringify(exported),
      screen: v.screens.status('main').label, count: v.cameraShow.cues.length,
      target: original.light.fixtures[0].target, position: original.position };
  });
  assert.equal(result.stable, true); assert.equal(result.sameOffline, true);
  assert.equal(result.count, 2); assert.match(result.screen, /波西米亚/);
  await page.screenshot({ path: 'exports/freeform-study.png' });
  await page.getByLabel('作品导播', { exact: true }).uncheck();
  assert.equal(await page.evaluate(() => window.bandView.stage.current.kind), 'band');
  await page.getByLabel('歌曲灯光', { exact: true }).uncheck();
  assert.equal(await page.evaluate(() => window.bandView.lighting.enabled), false);
  await page.getByRole('button', { name: '载入波西米亚示例', exact: true }).click();
  await page.waitForFunction(() => window.bandView?.lighting.currentShow?.id === 'bohemian-rhapsody' && !document.querySelector('.band-lighting button').disabled, null, { timeout: 120000 });
  assert.equal(await page.evaluate(() => window.bandView.cameraShow.cues.length), 27);
  // Small-screen controls wrap instead of clipping; named native button is keyboard focusable.
  await page.setViewportSize({ width: 390, height: 844 });
  const fit = await page.getByRole('button', { name: '自由创作示例', exact: true }).evaluate(el => {
    const r = el.getBoundingClientRect(); return { fits: r.left >= 0 && r.right <= innerWidth, disabled: el.disabled, tabIndex: el.tabIndex };
  });
  assert.deepEqual(fit, { fits: true, disabled: false, tabIndex: 0 });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...result, mobile: fit, screenshot: 'exports/freeform-study.png' }));
} finally { await browser.close(); }
