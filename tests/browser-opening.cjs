const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const URL = process.env.TEST_URL || 'http://127.0.0.1:8765/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const errors = [];
    // The frame loop is stopped: the test steps the simulation and the sweep itself.
    const open = async (options) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
      await page.goto(URL);
      await page.waitForFunction(() => ['opening', 'touch', 'story', 'atmosphere'].every(k => window.game?.extras?.[k]), null, { polling: 50 });
      await page.evaluate(() => { localStorage.removeItem('td.opening.v1'); game.stage.render = () => {}; });
      await page.locator('#introBtn').click();
      return { context, page };
    };
    let { context, page } = await open({});

    /* ---------- round one: where from, the sweep, the manual ---------- */
    const side = await page.evaluate(() => game.layout.sides[0]);
    assert.match(await page.locator('#callout').textContent(), new RegExp(`Round 1\\s*Swarm inbound from the ${side}`));
    assert.match(await page.locator('#guideTitle').textContent(), new RegExp(`They are coming from the ${side}\\.`));
    assert.match(await page.locator('#guideText').textContent(), /press W, then click the canyon floor/);
    assert.equal(await page.locator('.field-guide__tag').textContent(), 'FIELD MANUAL / 01');

    const sweep = await page.evaluate(() => {
      const g = game, o = g.extras.opening.sweep, s = g.stage;
      const beats = []; g.on('openingSweep', b => beats.push(b));
      const home = s.focus.clone();
      for (let i = 0; i < 19; i++) g.update(0.05);
      const early = o.active;                     // nothing until the countdown reaches two
      for (let i = 0; i < 3; i++) g.update(0.05);
      const started = o.active && localStorage.getItem('td.opening.v1') === '1';
      o.update(0.85);
      const half = s.focus.distanceTo(home) > 5;
      o.update(0.9); o.update(0.05);
      const lead = g.grid.spawn;
      const atHive = Math.hypot(s.focus.x - lead.x - 0.5, s.focus.z - lead.y - 0.9) < 0.01;
      for (let i = 0; i < 44; i++) g.update(0.05);   // the wave opens while the camera is on the hive
      const bugsInView = g.state === 'wave' && g.zerglings.length > 0 &&
        g.zerglings.every(z => Math.hypot(z.x - s.focus.x, z.z - s.focus.z) < 8);
      o.update(2.2); o.update(0.8);
      const returning = o.active && s.focus.distanceTo(home) > 1;
      o.update(1);
      const done = !o.active && s.focus.distanceTo(home) < 1e-6;
      return { early, started, half, atHive, bugsInView, returning, done, beats };
    });
    assert.deepEqual(sweep, { early: false, started: true, half: true, atHive: true, bugsInView: true, returning: true, done: true, beats: ['start', 'hive', 'end'] });

    // The arrival estimate is honest: compare it with when the swarm really gets there.
    // It is announced as the sweep hands the camera back, with the time already spent taken off.
    const arrival = await page.evaluate(() => {
      const g = game, toast = document.getElementById('callout').hidden ? '' : document.getElementById('callout').textContent;
      const promised = Number(/about (\d+) seconds/.exec(toast)?.[1]) + g.spawnTimer;
      const started = g.time - g.spawnTimer;
      let actual = null;
      for (let i = 0; i < 1200 && actual === null; i++) {
        g.update(0.05);
        if (g.zerglings.some(z => !z.dead && Math.hypot(z.x - g.core.x, z.z - g.core.z) < 7.5) || g.kills) actual = g.time - started;
      }
      return { toast, promised, actual };
    });
    assert.match(arrival.toast, new RegExp(`^Inbound from the ${side}First contact in about \\d+ seconds$`));
    assert.ok(arrival.actual && Math.abs(arrival.actual - arrival.promised) <= 6, JSON.stringify(arrival));

    // It yields to anything else that moves the camera, and any input skips it back home.
    const yields = await page.evaluate(() => {
      const o = game.extras.opening.sweep, s = game.stage, home = s.focus.clone();
      o.start(); o.update(0.6);
      s.focus.x += 3; const moved = s.focus.clone();
      o.update(0.2);
      const gaveWay = !o.active && s.focus.distanceTo(moved) < 1e-6;
      s.focus.copy(home); o.start(); o.update(0.9);
      return { gaveWay, away: s.focus.distanceTo(home) > 3, home: home.toArray() };
    });
    assert.equal(yields.gaveWay, true); assert.equal(yields.away, true);
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await page.evaluate((home) => [game.extras.opening.sweep.active, game.stage.focus.toArray().map((v, i) => Math.abs(v - home[i]) < 1e-6)], yields.home), [false, [true, true, true]]);

    // The manual follows what the player does.
    const steps = await page.evaluate(() => {
      const g = game, read = () => { g.emit('change'); return [document.querySelector('.field-guide__tag').textContent.slice(-2), document.getElementById('guideTitle').textContent]; };
      g.kills = 0;                                           // undo the kills from the arrival check
      const out = [read()];
      const spot = g.layout.open.find(([x, y]) => g.canBuildAt(x, y) && Math.hypot(x - g.core.x, y - g.core.z) > 8);
      g.placeWall(...spot); out.push(read());
      const u = g.gunners.find(m => !m.dead), to = g.layout.open.find(([x, y]) => g.canBuildAt(x, y) && Math.hypot(x + 0.5 - u.x, y + 0.5 - u.z) > 2 && Math.hypot(x + 0.5 - u.x, y + 0.5 - u.z) < 5);
      g.commandMove([u], ...to); out.push(read());
      g.kills = 1; out.push(read());
      g.level = 2; g.emit('change'); out.push(document.getElementById('fieldGuide').hidden);
      return out;
    });
    assert.deepEqual(steps, [['01', `They are coming from the ${side}.`], ['02', 'Now place your squad.'], ['03', 'Hold the line.'], ['03', 'Kills pay minerals.'], true]);

    // Veterans and reduced-motion players get the callout and the estimate, not the camera move.
    const quiet = async () => page.evaluate(() => {
      const g = game; g.reset(4242); g.quickDeploy();
      for (let i = 0; i < 30; i++) g.update(0.05);
      return g.extras.opening.sweep.active;
    });
    await page.evaluate(() => localStorage.setItem('td.opening.v1', '3'));
    assert.equal(await quiet(), false, 'Sweep shown to a veteran');
    await page.evaluate(() => localStorage.removeItem('td.opening.v1'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await quiet(), false, 'Sweep ignored reduced motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await quiet(), true, 'Sweep did not return for a new commander');
    await page.evaluate(() => game.extras.opening.sweep.cancel());

    // Later rounds name every side under attack.
    const late = await page.evaluate(() => {
      const g = game; g.reset(4242); g.level = 7; g.loadLevel(); g.state = 'build'; g.startWave();
      for (let i = 0; i < 62; i++) g.update(0.05);
      return { sides: [...new Set(g.layout.sides)], toast: document.getElementById('callout').textContent, sweeping: g.extras.opening.sweep.active };
    });
    assert.equal(late.sides.length, 2); assert.equal(late.sweeping, false);
    assert.match(late.toast, new RegExp(`^Inbound from the ${late.sides[0]} and ${late.sides[1]}First contact in about \\d+ seconds$`));

    /* ---------- touch: a tap is an order, two fingers move the camera ---------- */
    await context.close();
    ({ context, page } = await open({ hasTouch: true }));
    const at = (x, z) => page.evaluate(([x, z]) => {
      const s = game.stage; s.updateCamera();
      const p = new s.focus.constructor(x, 0.2, z).project(s.camera), r = document.getElementById('game').getBoundingClientRect();
      return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    }, [x, z]);
    const tap = async (x, z) => { const p = await at(x, z); await page.touchscreen.tap(p.x, p.y); };
    const field = await page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const g = game; g.reset(4242); g.state = 'wave'; g.paused = false; g.minerals = 5000;
      g.queue = [{ at: 1e9, breed: 'zergling', lane: 0 }];
      const cells = g.layout.open.filter(([x, y]) => g.canBuildAt(x, y) && Math.hypot(x - g.core.x, y - g.core.z) > 3 && Math.hypot(x - g.core.x, y - g.core.z) < 6);
      const [a, b] = [cells[0], cells.find(([x, y]) => Math.hypot(x - cells[0][0], y - cells[0][1]) > 2.5)];
      g.placeGunner('marine', ...a); g.placeGunner('marine', ...b);
      const free = cells.find(([x, y]) => g.canBuildAt(x, y) && [a, b].every(([ux, uy]) => Math.hypot(x - ux, y - uy) > 2.2));
      const bug = new Zergling(free[0] + 0.5 + (free[0] > a[0] ? 1 : -1), free[1] + 0.5, 'zergling', 1, 1);
      bug.update = () => {}; bug.spawnT = 1; g.zerglings.push(bug); g.world.add(bug.obj);
      const s = g.stage; s.focus.set(g.core.x, 0, g.core.z); s.dist = 18; s.updateCamera();
      g.emit('selectOnly', null); g.emit('change');
      return { a: g.gunners[0], b: g.gunners[1], free, bug: [bug.x, bug.z] };
    });
    const unit = (i) => page.evaluate((i) => { const u = game.gunners[i]; return { x: u.x, z: u.z, order: u.order?.type || null, driving: u.driving, goal: [u.goalTx, u.goalTy] }; }, i);
    const picked = () => page.evaluate(() => game.selection.map(u => game.gunners.indexOf(u)));

    await tap(field.free[0] + 0.5, field.free[1] + 0.5);
    assert.deepEqual(await picked(), [], 'Tapping the ground with nothing selected must do nothing');
    assert.equal((await unit(0)).driving, false);
    await tap(field.a.x, field.a.z);
    assert.deepEqual(await picked(), [0], 'Tap did not select the unit');
    await tap(field.free[0] + 0.5, field.free[1] + 0.5);
    const moved = await unit(0);
    assert.equal(moved.driving, true, 'Tap on the ground did not order the selected unit to move');
    assert.deepEqual(moved.goal, field.free);
    assert.deepEqual(await picked(), [0], 'An order must keep the selection');
    await tap(field.b.x, field.b.z);
    assert.deepEqual(await picked(), [1], 'Tapping another unit should select it, not order a move onto it');
    await tap(field.bug[0], field.bug[1]);
    assert.equal((await unit(1)).order, 'attack', 'Tap on an enemy did not order an attack');
    await tap(field.b.x, field.b.z);
    assert.deepEqual(await picked(), [], 'Tapping the selected unit again should let go of it');

    // A mouse click on open ground still deselects and never orders.
    await page.evaluate(() => { game.commandStop(game.gunners); game.emit('selectOnly', game.gunners[1]); });
    const ground = await at(field.free[0] + 0.5, field.free[1] + 2.5);
    await page.mouse.click(ground.x, ground.y);
    assert.deepEqual(await picked(), []); assert.equal((await unit(1)).driving, false);

    // Pinch and twist. Fingers are real touch points sent through the browser, not synthetic events.
    const cdp = await context.newCDPSession(page);
    // The browser delivers touch moves on its own frame clock, so give each one a moment to land.
    const touch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
      await page.waitForTimeout(120);
    };
    const cam = () => page.evaluate(() => ({ dist: game.stage.dist, yaw: game.stage.yaw, x: game.stage.focus.x, z: game.stage.focus.z, pinching: game.extras.touch.pinching, picked: game.selection.length, walls: game.walls.length }));
    const before = await cam();
    await touch('touchStart', [[540, 400]]);
    await touch('touchStart', [[540, 400], [640, 400]]);
    await touch('touchMove', [[540, 400], [665, 400]]);                 // 100 -> 125 apart
    const zoomed = await cam();
    assert.ok(Math.abs(zoomed.dist - before.dist * 0.8) < 0.05 && zoomed.pinching, JSON.stringify(zoomed));
    await touch('touchMove', [[540, 400], [540 + 125 * Math.cos(0.3), 400 + 125 * Math.sin(0.3)]]);
    const turned = await cam();
    assert.ok(Math.abs(turned.yaw - (before.yaw - 0.3)) < 0.01 && Math.abs(turned.dist - zoomed.dist) < 0.05, JSON.stringify(turned));
    assert.ok(Math.abs(turned.x - before.x) < 1e-6 && Math.abs(turned.z - before.z) < 1e-6, 'A pinch must not pan');
    await touch('touchEnd', [[540, 400]]);                              // one finger lifts
    await touch('touchMove', [[400, 300]]);                             // the other must not pan or tap
    await touch('touchEnd', []);
    const after = await cam();
    assert.deepEqual([after.x, after.z, after.pinching, after.picked, after.walls], [before.x, before.z, false, 0, before.walls]);
    await touch('touchStart', [[540, 400]]);                            // and one finger pans again afterwards
    await touch('touchMove', [[620, 430]]);
    await touch('touchEnd', []);
    const panned = await cam();
    assert.ok(Math.hypot(panned.x - after.x, panned.z - after.z) > 0.5, 'One-finger pan did not resume after a pinch');

    // On a touch screen the manual speaks in taps.
    assert.match(await page.evaluate(() => { const g = game; g.reset(4242); g.quickDeploy(); g.emit('change'); return document.getElementById('guideText').textContent; }), /tap the Barrier card, then tap the canyon floor/);

    assert.deepEqual(errors, []);
    console.log('PASS: round-one callout, hive sweep and its captions, honest arrival estimate, sweep yields/skips, veteran and reduced-motion opt-outs, field manual steps, multi-front callout, tap orders, tap deselect, mouse unchanged, pinch zoom, twist, pan resume and touch wording', { side, promised: arrival.promised, actual: +arrival.actual.toFixed(1) });
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
