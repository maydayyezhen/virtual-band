import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5173/studio/band/');
  await page.waitForFunction(() => window.bandView?.session, null, { timeout: 120000 });
  await page.getByRole('button', { name: '载入波西米亚示例', exact: true }).click();
  await page.waitForFunction(() => window.bandView?.cameraShow.available && window.bandView.player, null, { timeout: 120000 });
  assert.ok(await page.getByLabel('作品导播', { exact: true }).isChecked());
  const check = await page.evaluate(() => {
    const v = window.bandView; v.player.pause();
    const times = v.cameraShow.cues.flatMap((c, i, list) => [c.time, (c.time + (list[i + 1]?.time ?? v.player.total)) / 2]);
    const snapshot = t => {
      v.cameraShow.update(t); return [...v.camera.output.position.toArray(), ...v.camera.targetPosition.toArray(), v.camera.output.fov];
    };
    const poses = times.map(snapshot);
    const stable = JSON.stringify(snapshot(30)) === JSON.stringify((snapshot(245), snapshot(30)));
    const coverage = {};
    for (const cue of v.cameraShow.cues) {
      const s = cue.from.subject;
      if (s) coverage[`${s.type}.${s.instance}`] = (coverage[`${s.type}.${s.instance}`] ?? 0) + 1;
    }
    return { count: v.cameraShow.cues.length, coverage, stable, finite: poses.every(p => p.every(Number.isFinite)),
      within: poses.every(p => p[0] >= -28.4 && p[0] <= 28.4 && p[1] >= .4 && p[1] <= 20.5 && p[2] >= -8 && p[2] <= 57),
      moving: JSON.stringify(snapshot(24)) !== JSON.stringify(snapshot(30)) };
  });
  assert.equal(check.count, 27); assert.ok(check.stable && check.finite && check.within && check.moving);
  for (const subject of ['piano.0', 'keyboard.0', 'drums.0', 'bass.0', 'saxophone.0', 'electric.0', 'electric.1']) {
    assert.ok(check.coverage[subject] > 0, `${subject} needs a featured shot`);
  }
  await page.getByRole('button', { name: '观看模式', exact: true }).click();
  const screenshots = [];
  for (const [name, time] of [['keyboard', 40], ['drums', 103], ['keyboard-side', 133], ['drums-rock', 240], ['keyboard-coda', 295]]) {
    await page.evaluate(async t => { const p = window.bandView.player; p.seek(t); await p.play(); }, time);
    await page.waitForTimeout(280);
    const path = join(tmpdir(), `bohemian-camera-${name}.png`); await page.screenshot({ path }); screenshots.push(path);
    await page.evaluate(() => window.bandView.player.pause());
  }
  await page.getByRole('button', { name: '退出观看', exact: true }).click();
  const canvas = page.locator('[data-band-view] canvas');
  await canvas.click({ position: { x: 900, y: 550 } });
  assert.equal(await page.evaluate(() => window.bandView.stage.current.kind), 'band');
  assert.equal(await page.getByLabel('作品导播', { exact: true }).isChecked(), false);
  await page.getByLabel('作品导播', { exact: true }).check();
  assert.equal(await page.evaluate(() => window.bandView.stage.current.kind), 'broadcast');
  await page.getByLabel('导播镜头', { exact: true }).selectOption({ index: 1 });
  // Allow the audio worker to acknowledge seek before checking the paused camera.
  await page.waitForTimeout(500);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const before = await page.evaluate(() => window.bandView.camera.output.position.toArray());
  await page.waitForTimeout(180);
  assert.deepEqual(await page.evaluate(() => window.bandView.camera.output.position.toArray()), before, 'pause freezes camera');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check, screenshots }));
} finally { await browser.close(); }
