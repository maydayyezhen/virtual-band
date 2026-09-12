import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
  const errors = [], audioRequests = []; page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => { if (/\.sf2(?:\?|$)|spessasynth_processor/.test(request.url())) audioRequests.push(request.url()); });
  await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/cello/`);
  await page.waitForFunction(() => window.celloStudy, null, { timeout: 90000 });
  const report = await page.evaluate(async () => {
    const v = window.celloStudy, T = await import('/node_modules/three/build/three.module.js');
    let meshes = 0, vertices = 0, invalid = 0; const materials = new Set();
    v.cello.root.traverse(o => { if (!o.isMesh) return; meshes++; const p = o.geometry.attributes.position; vertices += p.count; for (const n of p.array) if (!Number.isFinite(n)) invalid++; for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
    let bowVertices = 0, bowInvalid = 0;
    v.bow.root.traverse(o => { if (!o.isMesh) return; bowVertices += o.geometry.attributes.position.count; for (const name of ['position', 'normal']) for (const n of o.geometry.attributes[name].array) if (!Number.isFinite(n)) bowInvalid++; });
    return { meshes, vertices, invalid, materials: materials.size, size: new T.Box3().setFromObject(v.cello.root).getSize(new T.Vector3()).toArray(), named: ['body', 'bridge', 'scroll'].map(n => Boolean(v.cello.root.getObjectByName(`cello:${n}`))), bowVertices, bowInvalid, bowHeight: new T.Box3().setFromObject(v.bow.root).getSize(new T.Vector3()).y };
  });
  assert.equal(report.invalid, 0); assert.ok(report.named.every(Boolean));
  assert.ok(report.vertices < 1_000_000, 'single study model stays below one million vertices');
  assert.ok(report.size[1] > 1.3 && report.size[1] < 1.6, 'extended cello is in metres');
  assert.equal(report.bowInvalid, 0); assert.ok(report.bowVertices < 100_000);
  assert.ok(report.bowHeight > .70 && report.bowHeight < .76, 'bow retains full-size proportions');
  async function shot(name) {
    await page.waitForTimeout(250);
    if (process.env.SCREENSHOT_DIR) { fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` }); }
  }
  for (const material of ['clay', 'finish']) {
    await page.evaluate(value => window.celloStudy.setMaterial(value), material);
    for (const view of ['front', 'three-quarter', 'side', 'back', 'scroll', 'bridge', 'body', 'bow', 'bow-frog', 'bow-tip']) {
      await page.evaluate(value => window.celloStudy.frameView(value), view);
      await shot(`cello-${material}-${view}`);
    }
  }
  await page.getByRole('button', { name: '并排对比', exact: true }).click(); await shot('cello-compare');
  assert.equal(await page.evaluate(() => window.celloStudy.subject), 'compare');
  assert.equal(await page.getByRole('button', { name: '琴桥', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '小提琴基准', exact: true }).click(); await shot('cello-violin-reference');
  await page.getByRole('button', { name: '大提琴', exact: true }).click();
  const before = await page.evaluate(() => window.celloStudy.camera.position.toArray());
  await page.mouse.move(1120, 500); await page.mouse.down(); await page.mouse.move(1230, 560, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(300);
  assert.notDeepEqual(await page.evaluate(() => window.celloStudy.camera.position.toArray()), before);
  await page.setViewportSize({ width: 430, height: 900 }); await page.getByRole('button', { name: '整体', exact: true }).click(); await shot('cello-mobile');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(audioRequests, [], 'model study creates no audio engine'); assert.deepEqual(errors, []);
  console.log('Chrome cello study: finite geometry, metre scale, named detail views, clay/finish, baseline comparison, orbit and narrow layout passed.', report);
} finally { await browser.close(); }
