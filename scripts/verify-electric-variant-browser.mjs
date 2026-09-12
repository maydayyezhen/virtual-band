import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const flying = process.env.ELECTRIC_VARIANT === 'flying-v';
const targetId = flying ? 'electric.main' : 'electric.2';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:5173/studio/band/${flying ? '?electric=flying-v' : ''}`);
  await page.waitForFunction(() => window.bandView?.session, null, { timeout: 120000 });
  await page.getByRole('button', { name: '载入波西米亚示例', exact: true }).click();
  await page.waitForFunction(() => window.bandView.player?.scheduledNotes === 5922, null, { timeout: 120000 });
  const variants = await page.evaluate(() => {
    const v = window.bandView; v.player.pause();
    return ['electric.main', 'electric.2'].map(id => {
      const g = v.instruments.get(id);
      return { id: g.id, variant: g.variant, strings: g.model.strings.size };
    });
  });
  assert.deepEqual(variants, [
    { id: 'electric.main', variant: flying ? 'flying-v' : 'classic', strings: 6 },
    { id: 'electric.2', variant: flying ? 'classic' : 'single-cut', strings: 6 },
  ]);
  await page.evaluate(id => {
    window.variantTargetId = id;
    window.bandView.stage.focusInstrument(id, true);
    window.bandView.presentation.active.selectView('body', true);
  }, targetId);
  await page.waitForTimeout(350);
  const point = await page.evaluate(async () => {
    const v = window.bandView, g = v.instruments.get(window.variantTargetId);
    const T = await import('/node_modules/three/build/three.module.js');
    const string = g.model.strings.get(6);
    const local = string.saddle.clone().lerp(string.nut, .08); local.z += .03;
    const p = g.root.localToWorld(local).project(v.camera.output), r = v.host.renderer.domElement.getBoundingClientRect();
    const x = r.left + (p.x + 1) * r.width / 2, y = r.top + (1 - p.y) * r.height / 2;
    return { x, y, hit: v.interactions.hitTest(x, y, g.id)?.partId,
      height: new T.Box3().setFromObject(g.root).getSize(new T.Vector3()).y };
  });
  assert.match(point.hit, /^pluck:/);
  assert.ok(Math.abs(point.height - 1.08) < .01, 'same physical scale');
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  const motion = await page.evaluate(() => {
    const v = window.bandView, g = v.instruments.get(window.variantTargetId); g.update(.016);
    return { active: g.activeNotes.length, energy: [...g.model.strings.values()].some(s => s.energy > 0), other: v.instruments.get(window.variantTargetId === 'electric.main' ? 'electric.2' : 'electric.main').activeNotes.length };
  });
  assert.ok(motion.active > 0 && motion.energy); assert.equal(motion.other, 0);
  await page.mouse.up();
  const path = join(tmpdir(), `electric-${flying ? 'flying-v' : 'single-cut'}-check.png`);
  await page.screenshot({ path });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ variants, motion, screenshot: path }));
} finally { await browser.close(); }
