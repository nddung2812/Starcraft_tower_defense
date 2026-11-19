// Base research raises the base's own health, and from level 5 the cannon's two rails are two lasers
// that charge separately and fire one at a time at different targets.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    const result = await page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const { BASE_LASER } = await import('/src/config.js');
      const { LASER_CELL_OFF } = await import('/src/models.js');
      const { captureCheckpoint, validateCheckpoint, restoreCheckpoint } = await import('/src/checkpoints.js');
      const g = game, out = {}, full = BASE_LASER.chargeTime;
      g.stage.render = () => {};
      g.reset(12345);
      const land = () => { g.baseUpgradeT = 1; g.completeBaseUpgrade(); };

      // ---- health grows with research and each level lands fully repaired ----
      out.start = [g.core.hp, g.core.maxHp];
      land();
      out.level1 = [g.core.hp, g.core.maxHp];
      g.core.hp = g.core.maxHp / 2;
      land();
      out.damaged = [g.core.hp, g.core.maxHp];
      g.core.hp = g.core.maxHp;

      // ---- one laser until level 5 ----
      land(); land();
      out.gunsAt4 = g.laserGuns;
      g.laserCharge2 = 0; g.paused = false; g.state = 'build'; g.update(0.05);
      out.secondIdleAt4 = g.laserCharge2 === 0;
      land();
      out.gunsAt5 = g.laserGuns;
      out.hpAt5 = g.core.maxHp;

      // ---- each rail shows its own charge ----
      const ud = g.core.model.userData, lit = cells => cells.filter(c => c.color.getHex() !== LASER_CELL_OFF).length;
      g.laserCharge = full * 0.5; g.laserCharge2 = full * 0.1; g.core.laserFlash = g.core.laserFlash2 = 0; g.core.syncCannon(g);
      out.rails = [lit(ud.laserCells), lit(ud.laserCellsB)];

      // ---- one at a time, at different targets ----
      g.state = 'wave'; g.paused = false; g.queue = [{ at: 1e9 }];
      const inland = g.core.x > g.grid.COLS / 2 ? -1 : 1, depth = g.core.z > g.grid.ROWS / 2 ? -1 : 1;
      const near = new Zergling(g.core.x + inland * 4, g.core.z, 'zergling', 1, 1);
      const far = new Zergling(g.core.x, g.core.z + depth * 6, 'zergling', 1, 1);
      near.hp = near.maxHp = far.hp = far.maxHp = 9000;
      g.zerglings = [near, far];
      g.laserCharge = g.laserCharge2 = full;
      g.core.update(0.1, g);
      out.first = { near: near.hp < 9000, far: far.hp === 9000, spent: g.laserCharge === 0, kept: g.laserCharge2 === full };
      g.core.update(0.1, g);
      out.waits = far.hp === 9000 && g.laserCharge2 === full;
      for (let i = 0; i < 12; i++) g.core.update(0.1, g);
      out.second = { far: far.hp < 9000, spent: g.laserCharge2 === 0 };

      // ---- a lone enemy still takes both shots ----
      for (let i = 0; i < 12; i++) g.core.update(0.1, g);
      const hurt = near.hp;
      g.zerglings = [near]; g.laserCharge = full;
      g.core.update(0.1, g);
      out.lone = near.hp < hurt;

      // ---- the higher health and second charge survive a save ----
      g.zerglings = []; g.state = 'build'; g.laserCharge2 = 33; g.core.hp = g.core.maxHp;
      const save = captureCheckpoint(g, { player: 'Test', quickDeployment: false, guideDismissed: true });
      out.saveValid = validateCheckpoint(save);
      out.tooHigh = !validateCheckpoint({ ...save, coreHp: g.core.maxHp + 1 });
      restoreCheckpoint(g, save);
      out.restored = [g.core.hp, g.core.maxHp, g.laserCharge2];
      return out;
    });
    assert.deepEqual(result.start, [500, 500]);
    assert.deepEqual(result.level1, [575, 575], 'Full health rises with the maximum');
    assert.deepEqual(result.damaged, [650, 650], 'A damaged base is fully repaired when a level lands');
    assert.equal(result.gunsAt4, 1);
    assert.equal(result.secondIdleAt4, true, 'The second rail does not charge before level 5');
    assert.equal(result.gunsAt5, 2);
    assert.equal(result.hpAt5, 875);
    assert.deepEqual(result.rails, [5, 1], 'Each rail shows its own laser');
    assert.deepEqual(result.first, { near: true, far: true, spent: true, kept: true }, 'Only one laser fires first');
    assert.equal(result.waits, true, 'The second laser waits for the first beam');
    assert.deepEqual(result.second, { far: true, spent: true }, 'The second laser takes a different target');
    assert.equal(result.lone, true, 'A lone enemy can be shot again');
    assert.equal(result.saveValid, true, 'A save with upgraded base health is valid');
    assert.equal(result.tooHigh, true, 'Health above the level maximum is rejected');
    assert.deepEqual(result.restored, [875, 875, 33]);
    assert.deepEqual(errors, []);
    console.log('PASS: base health follows research; two lasers charge separately and fire in turn at different targets');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
