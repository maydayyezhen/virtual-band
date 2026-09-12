import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/band/`);
  await page.waitForFunction(() => window.bandView?.stage && window.bandView.instruments.size === 9, null, { timeout: 90000 });
  const position = () => page.evaluate(() => window.bandView.camera.output.position.toArray());
  const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
  async function settled() { await page.waitForFunction(() => !window.bandView.camera.isTransitioning); await page.waitForTimeout(80); }
  async function stable(label) {
    await settled();
    const first = await position();
    await page.waitForTimeout(350);
    assert.ok(distance(first, await position()) < .03, `${label}: camera snapped back after arrival`);
  }
  await page.evaluate(() => {
    window.cameraFrames = [];
    window.cameraRotations = [];
    window.recordCamera = true;
    function frame() {
      if (!window.recordCamera) return;
      window.cameraFrames.push(window.bandView.camera.output.position.toArray());
      window.cameraRotations.push(window.bandView.camera.output.quaternion.toArray());
      requestAnimationFrame(frame);
    }
    frame();
  });
  for (const view of ['band:rear', 'band:overhead', 'band:wing', 'band:audience']) {
    await page.getByLabel('固定机位').selectOption(view);
    await stable(view);
  }
  const frames = await page.evaluate(() => { window.recordCamera = false; return window.cameraFrames; });
  let maxStep = 0;
  for (let i = 1; i < frames.length; i++) maxStep = Math.max(maxStep, distance(frames[i], frames[i - 1]));
  assert.ok(maxStep < 2, `camera teleport: ${maxStep}m in a rendered frame`);
  assert.ok(frames.every(p => p.every(Number.isFinite) && p[1] >= .4 && p[2] >= -8));
  const rotations = await page.evaluate(() => window.cameraRotations);
  let maxAngle = 0;
  for (let i = 1; i < rotations.length; i++) {
    const dot = rotations[i].reduce((sum, n, k) => sum + n * rotations[i - 1][k], 0);
    maxAngle = Math.max(maxAngle, 2 * Math.acos(Math.min(1, Math.abs(dot))));
  }
  assert.ok(maxAngle < .55, `orientation snapped at look-at pole: ${maxAngle} radians`);
  console.log('fixed views: stable handoff, bounded paths, max rendered position/angle step', maxStep, maxAngle);

  await page.getByLabel('固定机位').selectOption('band:rear');
  await page.waitForTimeout(180);
  await page.getByLabel('固定机位').selectOption('band:wing');
  await stable('interrupted selection');
  await page.evaluate(() => window.bandView.stage.focusInstrument('keyboard.main'));
  await page.waitForFunction(() => window.bandView.presentation.active?.id === 'keyboard.main:showcase');
  await stable('keyboard handoff');
  await page.keyboard.press('4');
  await stable('keyboard lower preset');
  await page.getByRole('button', { name: '返回全景', exact: true }).click();
  await stable('return to stage');

  await page.getByRole('button', { name: '自由漫游', exact: true }).click();
  await settled();
  assert.equal(await page.evaluate(() => window.bandView.stage.current.kind), 'audience');
  const start = await position();
  await page.keyboard.down('s');
  await page.waitForTimeout(420);
  await page.keyboard.up('s');
  await page.waitForTimeout(220);
  const moved = await position();
  assert.ok(distance(start, moved) > .1, 'WASD must move the spectator');
  assert.ok(Math.abs(moved[1] - start[1]) < .001, 'horizontal travel preserves altitude');
  await page.keyboard.down('e');
  await page.waitForTimeout(350);
  await page.keyboard.up('e');
  const elevated = await position();
  assert.ok(elevated[1] > moved[1] + .5, 'E raises the free camera');
  await page.keyboard.down('q');
  await page.waitForTimeout(180);
  await page.keyboard.up('q');
  assert.ok((await position())[1] < elevated[1] - .2, 'Q lowers the free camera');
  await stable('released movement');
  const beforeLook = await page.evaluate(() => window.bandView.camera.output.quaternion.toArray());
  await page.mouse.move(780, 430);
  await page.mouse.down();
  await page.mouse.move(960, 490, { steps: 8 });
  await page.mouse.up();
  const afterLook = await page.evaluate(() => window.bandView.camera.output.quaternion.toArray());
  assert.ok(distance(beforeLook, afterLook) > .1, 'drag looks around in spectator mode');
  const beforePan = await position();
  await page.mouse.move(800, 420);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(900, 460, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  assert.ok(distance(beforePan, await position()) > 1, 'right drag translates the camera');
  assert.equal(await page.evaluate(() => window.bandView.stage.current.kind), 'audience');
  assert.ok(distance(afterLook, await page.evaluate(() => window.bandView.camera.output.quaternion.toArray())) < .001, 'pan preserves orientation');
  const beforeZoom = await position();
  const lens = () => page.evaluate(() => window.bandView.camera.output.fov);
  const beforeFov = await lens();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(120);
  assert.ok(Math.abs((await lens()) - beforeFov - 7) < .01, 'wheel changes FOV using reference gain');
  assert.ok(distance(beforeZoom, await position()) < .001, 'lens zoom does not dolly');
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await position();
  await page.waitForTimeout(250);
  assert.ok(distance(blurred, await position()) < .001, 'blur clears movement');
  await page.keyboard.up('w');
  const travel = await page.evaluate(() => {
    const { audience, camera } = window.bandView;
    const origin = camera.output.position.clone().set(0, 7, 25);
    const reset = () => camera.setPose({ position: origin, target: origin.clone().add({ x: 0, y: 0, z: -5 }), fov: 62 }, true);
    function move(keys, frames) {
      reset();
      keys.forEach(key => audience.setMoveKey(key, true));
      for (let i = 0; i < frames; i++) audience.update(1 / 60);
      keys.forEach(key => audience.setMoveKey(key, false));
      return camera.output.position.toArray();
    }
    const forward = move(['KeyW'], 60);
    const diagonal = move(['KeyW', 'KeyD', 'KeyE'], 60);
    const fast = move(['KeyW', 'ShiftLeft'], 60);
    const ceiling = move(['KeyE', 'ShiftLeft'], 180);
    const floor = move(['KeyQ', 'ShiftLeft'], 180);
    const hall = move(['KeyS', 'ShiftLeft'], 180);
    reset();
    return { origin: origin.toArray(), forward, diagonal, fast, ceiling, floor, hall };
  });
  assert.ok(Math.abs(distance(travel.origin, travel.forward) - 6) < .001, 'normal movement: 6m/s');
  assert.ok(Math.abs(distance(travel.origin, travel.diagonal) - 6) < .001, '3D diagonal is normalized');
  assert.ok(Math.abs(distance(travel.origin, travel.fast) - 15) < .001, 'Shift movement: 15m/s');
  assert.equal(travel.ceiling[1], 20.5);
  assert.equal(travel.floor[1], 1.7);
  assert.equal(travel.hall[2], 57, 'roaming reaches the audience hall beyond the old stage bounds');
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH });
  await page.getByRole('button', { name: '鼠标跟随', exact: true }).click();
  await page.waitForFunction(() => !!document.pointerLockElement);
  const lockedLook = await page.evaluate(() => window.bandView.camera.output.quaternion.toArray());
  await page.mouse.move(580, 320);
  await page.waitForTimeout(100);
  assert.ok(distance(lockedLook, await page.evaluate(() => window.bandView.camera.output.quaternion.toArray())) > .01);
  // Browser pointer-lock exit and the stage must agree on who owns the camera.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.bandView.stage.current.kind === 'band');
  await stable('pointer unlock');
  await page.getByRole('button', { name: '自由漫游', exact: true }).click();
  await settled();
  assert.ok(distance(travel.origin, await position()) < .001, 'return to roaming restores the saved position');
  await page.getByRole('button', { name: '重置漫游', exact: true }).click();
  await stable('reset roaming');
  assert.ok(distance(start, await position()) < .001, 'reset restores the initial viewpoint');
  await page.getByRole('button', { name: '返回全景', exact: true }).click();
  await settled();
  await page.getByRole('button', { name: '自由漫游', exact: true }).click();
  await page.keyboard.down('e');
  assert.equal(await page.evaluate(() => window.bandView.camera.isTransitioning), false, 'manual input interrupts entry transition');
  await page.keyboard.up('e');
  await page.keyboard.press('Escape');
  await stable('exit spectator');
  assert.equal(await page.evaluate(() => window.bandView.stage.current.kind), 'band');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByLabel('固定机位').selectOption('band:overhead');
  assert.equal(await page.evaluate(() => window.bandView.camera.isTransitioning), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.getByRole('button', { name: '自由漫游', exact: true }).isVisible());
  assert.deepEqual(errors, []);
  await page.close();
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  touch.on('pageerror', error => errors.push(error.message));
  await touch.goto(`${process.env.TEST_URL || 'http://localhost:5173'}/studio/band/`);
  await touch.waitForFunction(() => window.bandView?.stage && window.bandView.instruments.size === 9, null, { timeout: 90000 });
  await touch.getByRole('button', { name: '自由漫游', exact: true }).tap();
  await touch.waitForFunction(() => !window.bandView.camera.isTransitioning);
  const cdp = await touch.context().newCDPSession(touch);
  const up = await touch.getByRole('button', { name: '升高', exact: true }).boundingBox();
  assert.ok(up && up.x >= 0 && up.x + up.width <= 390, 'touch elevation control fits viewport');
  const height = () => touch.evaluate(() => window.bandView.camera.output.position.y);
  const initialHeight = await height();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: up.x + up.width / 2, y: up.y + up.height / 2 }] });
  await touch.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await height() > initialHeight + .2, 'held touch E control raises the camera');
  const releasedHeight = await height();
  await touch.waitForTimeout(150);
  assert.ok(Math.abs((await height()) - releasedHeight) < .001, 'touch release stops movement');
  const initialFov = await touch.evaluate(() => window.bandView.camera.output.fov);
  // The LED panel occupies the old hard-coded y=400. Pinch on exposed scene pixels.
  const pinchY = await touch.evaluate(() => {
    for (let y = Math.floor(innerHeight * .4); y < innerHeight - 60; y += 10)
      if ([100, 140, 240, 280].every(x => document.elementFromPoint(x, y)?.tagName === 'CANVAS')) return y;
    return null;
  });
  assert.notEqual(pinchY, null, 'an unobstructed canvas row is available for touch look/zoom');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 140, y: pinchY }, { id: 2, x: 240, y: pinchY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: 100, y: pinchY }, { id: 2, x: 280, y: pinchY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await touch.evaluate(() => window.bandView.camera.output.fov) < initialFov - 3, 'pinch outward narrows FOV');
  assert.ok(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'toolbar has no horizontal overflow');
  if (process.env.SCREENSHOT_PATH) await touch.screenshot({ path: process.env.SCREENSHOT_PATH.replace(/\.png$/, '-touch.png') });
  assert.deepEqual(errors, []);
  console.log('Chrome camera: transitions, free movement/elevation/speed/bounds, drag/pan/FOV, saved poses, interruption, pointer lock, blur/Escape and narrow toolbar passed.');
} finally { await browser.close(); }
