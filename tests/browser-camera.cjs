const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/?seed=12345');
    await page.waitForFunction(() => window.game?.stage);
    await page.locator('#introBtn').click();
    await page.locator('#guideDismiss').click();
    // Keep the real frame/input loop running, without advancing the battle.
    await page.evaluate(() => { game.paused = true; game.stage.shake = 0; });
    const rect = await page.locator('#game').boundingBox();
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    const cursor = () => page.locator('#game').evaluate(e => getComputedStyle(e).cursor);
    assert.equal(await cursor(), 'default');
    const state = () => page.evaluate(() => {
      const s = game.stage;
      return { x: s.focus.x, z: s.focus.z, yaw: s.yaw, pitch: s.pitch, dist: s.dist };
    });
    const reset = () => page.evaluate(() => {
      const s = game.stage;
      s.resetView(); s.focus.set(s.cols / 2, 0, s.rows / 2); s.updateCamera();
    });
    const gesture = async (button, dx, dy, modifier) => {
      await page.mouse.move(cx, cy);
      if (modifier) await page.keyboard.down(modifier);
      await page.mouse.down({ button });
      assert.equal(await cursor(), 'default');
      await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
      assert.equal(await cursor(), 'default');
      await page.mouse.up({ button });
      assert.equal(await cursor(), 'default');
      if (modifier) await page.keyboard.up(modifier);
    };
    // Grab stays under the pointer in every direction and at rotated/tilted angles.
    for (const yaw of [Math.PI / 2, 0.3, 3.8]) {
      for (const [dx, dy] of [[100, 0], [-100, 0], [0, 80], [0, -80]]) {
        await reset();
        await page.evaluate(yaw => { game.stage.yaw = yaw; game.stage.pitch = 0.6; game.stage.updateCamera(); }, yaw);
        const before = await state();
        await gesture('left', dx, dy);
        const after = await state();
        assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.5);
        assert.equal(after.yaw, before.yaw); assert.equal(after.pitch, before.pitch);
        const point = await page.evaluate(({ x, z }) => {
          const s = game.stage, r = document.getElementById('game').getBoundingClientRect();
          const p = s.focus.clone().set(x, 0, z).project(s.camera);
          return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
        }, before);
        assert.ok(Math.hypot(point.x - cx - dx, point.y - cy - dy) < 1, JSON.stringify(point));
        assert.equal(await page.locator('#selbox').isVisible(), false);
      }
    }
    // Rotation never issues a unit command; a right-click still does.
    await reset();
    await page.evaluate(() => {
      window.commandCount = 0;
      const original = game.commandMove.bind(game);
      game.commandMove = (...args) => { window.commandCount++; return original(...args); };
    });
    await page.keyboard.press('F2');
    const beforeRight = await state();
    await gesture('right', 120, 70);
    assert.deepEqual(await state(), beforeRight);
    // Holding the wheel rotates and tilts without moving the camera focus or issuing orders.
    await page.evaluate(() => { window.commandCount = 0; });
    const beforeOrbit = await state();
    await gesture('middle', 120, 70);
    const afterOrbit = await state();
    assert.ok(afterOrbit.yaw > beforeOrbit.yaw && afterOrbit.pitch > beforeOrbit.pitch);
    assert.equal(afterOrbit.x, beforeOrbit.x); assert.equal(afterOrbit.z, beforeOrbit.z);
    assert.equal(await page.evaluate(() => window.commandCount), 0);
    await gesture('left', -80, -40, 'Alt');
    assert.ok((await state()).yaw < afterOrbit.yaw);
    await gesture('middle', 60, 30, 'Alt');
    assert.equal((await state()).x, afterOrbit.x);
    assert.equal((await state()).z, afterOrbit.z);
    const beforeButtons = await state();
    await page.locator('#camLeft').click();
    assert.ok((await state()).yaw < beforeButtons.yaw);
    await page.locator('#camRight').click();
    assert.ok(Math.abs((await state()).yaw - beforeButtons.yaw) < 1e-10);

    // Reset returns home; a slightly shaky click still selects a unit.
    await page.locator('#camReset').click();
    await page.evaluate(() => game.stage.updateCamera());
    const unit = await page.evaluate(() => {
      const u = game.gunners[0], r = document.getElementById('game').getBoundingClientRect();
      const p = u.obj.position.clone().set(u.x, 0, u.z).project(game.stage.camera);
      return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
    });
    await page.mouse.move(unit.x, unit.y); await page.mouse.down();
    for (let i = 0; i < 8; i++) await page.mouse.move(unit.x + i % 2, unit.y);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => game.selection.includes(game.gunners[0])), true);
    const commandPoint = await page.evaluate(() => {
      const u = game.gunners[0], s = game.stage, r = document.getElementById('game').getBoundingClientRect();
      const cell = game.layout.open.find(([x, y]) => game.grid.buildable(x, y) && Math.hypot(x + .5 - u.x, y + .5 - u.z) < 3);
      const p = s.focus.clone().set(cell[0] + .5, 0, cell[1] + .5).project(s.camera);
      return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
    });
    await page.mouse.move(commandPoint.x, commandPoint.y);
    await page.mouse.down({ button: 'right' });
    assert.equal(await cursor(), 'default');
    await page.mouse.move(commandPoint.x + 1, commandPoint.y);
    assert.equal(await cursor(), 'default');
    await page.mouse.up({ button: 'right' });
    assert.equal(await page.evaluate(() => window.commandCount), 1);
    await page.keyboard.press('Escape');
    const beforeBox = await state();
    await page.keyboard.down('Shift');
    assert.equal(await cursor(), 'default');
    await page.mouse.move(unit.x - 45, unit.y - 45); await page.mouse.down();
    assert.equal(await cursor(), 'default');
    await page.mouse.move(unit.x + 45, unit.y + 45, { steps: 8 });
    assert.equal(await page.locator('#selbox').isVisible(), true);
    await page.mouse.up(); await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => game.selection.includes(game.gunners[0])), true);
    assert.deepEqual(await state(), beforeBox);

    // Shift-click toggles units without dropping the rest of the group.
    await page.keyboard.press('F2');
    const armySize = await page.evaluate(() => game.selection.length);
    assert.ok(armySize > 1);
    await page.keyboard.down('Shift');
    await page.mouse.click(unit.x, unit.y);
    assert.equal(await page.evaluate(() => game.selection.length), armySize - 1);
    await page.mouse.click(unit.x, unit.y);
    assert.equal(await page.evaluate(() => game.selection.length), armySize);
    // Releasing Shift before the mouse preserves an additive box selection.
    await page.mouse.move(unit.x - 12, unit.y - 30); await page.mouse.down();
    await page.mouse.move(unit.x + 12, unit.y + 12, { steps: 4 });
    await page.keyboard.up('Shift'); await page.mouse.up();
    assert.equal(await page.evaluate(() => game.selection.length), armySize);
    assert.equal(await cursor(), 'default');

    // Wheel deltas are proportional, bounded, and a zero delta is a no-op.
    await page.mouse.move(cx, cy);
    const beforeZoom = (await state()).dist;
    await page.mouse.wheel(0, 20);
    await page.waitForFunction(d => game.stage.dist > d, beforeZoom);
    assert.ok((await state()).dist < beforeZoom * 1.1);
    await page.locator('#game').dispatchEvent('wheel', { deltaY: 0 });
    const zoom = (await state()).dist;
    await page.locator('#game').dispatchEvent('wheel', { deltaY: 0 });
    assert.equal((await state()).dist, zoom);
    for (let i = 0; i < 20; i++) await page.locator('#game').dispatchEvent('wheel', { deltaY: -100 });
    assert.equal((await state()).dist, 10);

    // No drift at canvas edges; losing focus cancels the drag and allows the next one.
    await reset(); const beforeEdge = await state();
    await page.mouse.move(rect.x + rect.width - 2, cy);
    await page.waitForTimeout(350);
    assert.deepEqual(await state(), beforeEdge);
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + 70, cy);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const afterBlur = await state();
    await page.mouse.move(cx + 140, cy); await page.mouse.up();
    assert.deepEqual(await state(), afterBlur);
    assert.equal(await cursor(), 'default');
    await gesture('left', -70, 0);
    assert.notEqual((await state()).x, afterBlur.x);
    await page.screenshot({ path: '/tmp/td-camera-controls.png' });
    assert.deepEqual(errors, []);
    console.log('PASS camera: anchored four-way pan at multiple angles, orbit/tilt, Alt/middle gestures, click jitter, selection/orders, zoom, no edge drift, focus cleanup');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
