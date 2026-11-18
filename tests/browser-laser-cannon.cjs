// The base cannon shows its charge on its rails, its beam burns for longer, and the shot still lands once.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345'); await page.waitForFunction(() => window.game);
    await page.locator('#introBtn').click();
    const result = await page.evaluate(async () => {
      const { Vector3 } = await import('three');
      const { Zergling } = await import('/src/entities.js');
      const { BASE_LASER } = await import('/src/config.js');
      const { LASER_CELLS, LASER_CELL_OFF } = await import('/src/models.js');
      const g = game, core = g.core, ud = core.model.userData, out = {};
      g.stage.render = () => {}; g.paused = true;
      const off = c => c.color.getHex() === LASER_CELL_OFF;
      const litAt = pct => { g.laserCharge = BASE_LASER.chargeTime * pct; core.laserFlash = 0; core.syncCannon(g); return ud.laserCells.filter(c => !off(c)).length; };

      // ---- the bar fills one cell at a time, from the breech ----
      out.cells = ud.laserCells.length === LASER_CELLS && LASER_CELLS === 10;
      out.noRedBar = core.laserBar === undefined;
      out.steps = [0, 0.1, 0.5, 0.9].map(litAt);
      litAt(0.5);
      out.order = ud.laserCells.slice(0, 5).every(c => !off(c)) && ud.laserCells.slice(5).every(off);
      out.full = litAt(1);

      // ---- one shot: the beam outlasts the old 0.45 s, holds its strength, and the damage lands once ----
      g.paused = false; g.state = 'wave'; g.queue = [{ at: 1e9 }]; g.zerglings.length = 0; g.laserCharge = BASE_LASER.chargeTime;
      const inland = core.x > g.grid.COLS / 2 ? -1 : 1;
      const bug = new Zergling(core.x + inland * 6, core.z, 'zergling', 1, 1); bug.hp = bug.maxHp = 5000; g.zerglings.push(bug);
      out.fired = g.fireLaser(bug.x, bug.z);
      const hurt = bug.hp, beam = g.fx.beams.at(-1);
      const muzzle = ud.laserMuzzle.getWorldPosition(new Vector3());
      const length = beam.group.children[0].geometry.parameters.width;
      out.startsAtMuzzle = beam.group.localToWorld(new Vector3(-length / 2, 0, 0)).distanceTo(muzzle) < 1e-6;
      out.damaged = hurt < 5000;
      out.life = beam.max;
      core.syncCannon(g);
      out.drainStart = ud.laserCells.filter(c => !off(c)).length;
      g.fx.update(0.5, g.camera, g.viewport); core.laserFlash -= 0.5; core.syncCannon(g);
      out.midStrength = beam.group.children[0].material.opacity;
      out.draining = ud.laserCells.filter(c => !off(c)).length;
      out.alive = g.fx.beams.includes(beam);
      g.fx.update(0.5, g.camera, g.viewport);
      out.fading = beam.group.children[0].material.opacity < 0.5;
      out.oneHit = bug.hp === hurt;
      g.fx.update(0.2, g.camera, g.viewport);
      out.gone = !g.fx.beams.includes(beam);
      core.laserFlash = 0; g.paused = true;

      // ---- the panel button fills as a progress bar ----
      g.laserCharge = BASE_LASER.chargeTime * 0.4; g.emit('change');
      out.button = document.getElementById('btnLaser').style.getPropertyValue('--charge');
      return out;
    });
    assert.equal(result.cells, true);
    assert.equal(result.noRedBar, true, 'The cannon is the only charge bar on the base');
    assert.deepEqual(result.steps, [0, 1, 5, 9], 'Cells lit at 0, 10, 50 and 90 percent');
    assert.equal(result.order, true, 'Cells light from the breech');
    assert.equal(result.full, 10);
    assert.equal(result.fired, true);
    assert.equal(result.startsAtMuzzle, true, 'The beam starts at the new muzzle');
    assert.equal(result.damaged, true);
    assert.equal(result.life, 1.1);
    assert.equal(result.drainStart, 10, 'The bar is full as the beam starts');
    assert.equal(result.midStrength, 1, 'Full strength halfway through');
    assert.ok(result.draining > 0 && result.draining < 10, `The bar drains while firing (${result.draining})`);
    assert.equal(result.alive, true);
    assert.equal(result.fading, true, 'The beam fades at the end');
    assert.equal(result.oneHit, true, 'A longer beam does not hit twice');
    assert.equal(result.gone, true);
    assert.equal(parseFloat(result.button), 40);
    assert.deepEqual(errors, []);
    console.log('PASS: ten charge cells, breech-to-muzzle fill, 1.1 s beam from the muzzle, held strength, drain, single hit, button progress');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
