// Medic mines: three scattered on placement, 100 damage each, saved with the run, optional layer.
// Serve the repo on port 8765, then: node tests/browser-mines.cjs [playwright-core dir]
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/src/hero.js', route => route.abort());   // this suite counts the army, so it runs without the hero (tests/browser-hero.cjs covers the hero)
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345');
    await page.waitForFunction(() => window.game?.stage && window.game.extras.mines, null, { polling: 50 });
    await page.locator('#introBtn').click();

    const out = await page.evaluate(async () => {
      const { MINES, UNITS } = await import('/src/config.js');
      const { Zergling } = await import('/src/entities.js');
      const { captureCheckpoint, validateCheckpoint, restoreCheckpoint } = await import('/src/checkpoints.js');
      const g = game, field = g.minefield, out = {}, check = (ok, message) => { if (!ok) throw Error(message); };
      g.stage.render = () => {};
      check(field === g.extras.mines && UNITS.mender.mines === MINES, 'The layer installs the minefield and the Medic carries the kit');
      check(MINES.count === 3 && MINES.damage === 100, 'Three mines of 100 damage');
      const bug = (x, z, breed = 'zergling', hp = 10000) => {
        const b = new Zergling(x, z, breed, 1, 1);
        b.hp = b.maxHp = hp; b.speed = 0; b.update = () => {};
        g.zerglings.push(b); g.world.add(b.obj); return b;
      };
      // An open patch with room for a full ring of mines around the Medic.
      const fresh = (state = 'wave') => {
        g.reset(12345); g.level = 4; g.loadLevel(); g.state = state; g.minerals = 10000; g.crateT = 1e9;
        g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }];
        // The roomiest tile in the canyon: the most free ground within three tiles.
        const room = ([x, y]) => {
          let n = 0;
          for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (g.grid.buildable(x + dx, y + dy)) n++;
          return n;
        };
        const spot = g.layout.open.filter(([x, y]) => g.grid.buildable(x, y)).reduce((best, t) => room(t) > room(best) ? t : best);
        if (room(spot) < 20) throw Error('No open patch');
        return spot;
      };
      const settle = () => { for (let i = 0; i < 20; i++) field.update(0.05); };

      // ---- placement: three mines, on free tiles around the Medic, and only for the Medic ----
      for (let run = 0; run < 25; run++) {
        const [x, y] = fresh();
        const [fx, fy] = g.layout.open.find(([ox, oy]) => g.grid.buildable(ox, oy) && Math.hypot(ox - x, oy - y) > 7);
        check(g.placeGunner('marine', fx, fy) && field.mines.length === 0, 'Other units lay nothing');
        check(g.placeGunner('mender', x, y), 'Medic placed');
        const medic = g.gunners[1], mines = field.mines;
        check(mines.length === 3 && field.count(medic) === 3, `Three mines (got ${mines.length})`);
        check(new Set(mines.map(m => m.tx + ',' + m.ty)).size === 3, 'Each mine has its own tile');
        for (const m of mines) {
          const d = Math.hypot(m.x - medic.x, m.z - medic.z);
          check(g.grid.buildable(m.tx, m.ty) && (m.tx !== medic.tx || m.ty !== medic.ty), 'Mines land on free ground, never under a unit');
          check(d > 0.9 && d < MINES.far + 0.75, `Mines land around the Medic (${d.toFixed(2)} tiles away)`);
          check(!m.armed && m.owner === medic, 'A thrown mine is not armed yet');
        }
        if (run) continue;
        out.spread = mines.map(m => [m.tx - medic.tx, m.ty - medic.ty]);
        // Placement is the only time: moving, promoting and time lay no more.
        settle();
        check(mines.every(m => m.armed && m.obj.position.y === 0 && m.obj.position.x === m.x), 'Mines settle on their tile and arm');
        g.commandMove([medic], fx + 1, fy); g.upgradeGunner(medic);
        for (let i = 0; i < 80; i++) g.update(0.05);
        check(field.mines.length === 3, 'A Medic lays mines once');
        check(g.grid.buildable(mines[0].tx, mines[0].ty) && g.canBuildAt(mines[0].tx, mines[0].ty), 'A mine does not take its tile');
      }

      // ---- detonation: 100 to every ground bug in the blast, nothing to aircraft or bugs outside ----
      let [x, y] = fresh();
      g.placeGunner('mender', x, y);
      let [m1, m2, m3] = field.mines;
      const early = bug(m1.x, m1.z);
      field.update(0.05);
      check(early.hp === 10000 && field.mines.length === 3, 'A mine in the air cannot go off');
      early.dead = true; g.zerglings.length = 0;
      settle();
      const flyer = bug(m1.x, m1.z, 'skyhunter');
      field.update(0.05);
      check(flyer.hp === 10000 && field.mines.length === 3, 'Aircraft do not set a mine off');
      // Keep the other two mines out of this blast and out of reach of these bugs.
      m2.x = m1.x + 30; m3.x = m1.x - 30;
      const near = bug(m1.x + MINES.trigger + 0.6, m1.z);
      field.update(0.05);
      check(near.hp === 10000 && field.mines.length === 3, 'A bug beside the mine walks past');
      const kills = g.kills, heard = []; g.on('mine', m => heard.push(m));
      const stepper = bug(m1.x + 0.2, m1.z - 0.1), beside = bug(m1.x - 0.9, m1.z + 0.4), weak = bug(m1.x + 0.5, m1.z + 0.5, 'zergling', 60);
      const plated = bug(m1.x, m1.z + 0.8, 'warrior'), outside = bug(m1.x + MINES.blast + 1.2, m1.z);
      field.update(0.05);
      check(heard.length === 1 && heard[0] === m1 && field.mines.length === 2 && !field.mines.includes(m1), 'The mine goes off once and is gone');
      check(!m1.obj.parent, 'The spent mine leaves the scene');
      check(10000 - stepper.hp === 100 && 10000 - beside.hp === 100 && 10000 - near.hp === 100, 'Every ground bug in the blast takes 100');
      check(10000 - plated.hp === 100 - plated.armor, 'Armour applies as it does to any hit');
      check(weak.dead && g.kills === kills + 1 && g.score === g.kills, 'A mine kill is a kill');
      check(outside.hp === 10000 && flyer.hp === 10000, 'Bugs outside the blast and aircraft are spared');
      out.dealt = 10000 - stepper.hp;
      // Through the real tick: a bug that walks onto a mine during play sets it off.
      g.zerglings.length = 0; m2.x = m2.tx + 0.5;
      const walker = bug(m2.x, m2.z);
      g.update(0.05);
      check(10000 - walker.hp === 100 && field.mines.length === 1, 'game.update runs the minefield');
      // A friendly unit standing on a mine is safe.
      g.zerglings.length = 0;
      const medic = g.gunners[0];
      medic.x = field.mines[0].x; medic.z = field.mines[0].z;
      for (let i = 0; i < 10; i++) field.update(0.05);
      check(field.mines.length === 1 && medic.hp === medic.maxHp, 'Our own units never set a mine off');

      // ---- a new battlefield clears the field ----
      g.loadLevel();
      check(field.mines.length === 0, 'loadLevel clears the mines');

      // ---- salvage takes the unexploded mines back ----
      [x, y] = fresh('build');
      g.placeGunner('mender', x, y); g.placeGunner('mender', x + 1, y);
      const [first, second] = g.gunners;
      check(field.mines.length === 6, 'Two Medics, six mines');
      check(g.sell(first) && field.mines.length === 3 && field.mines.every(m => m.owner === second), 'Selling a Medic recalls its mines');

      // ---- saved runs keep the field ----
      settle();
      const lay = field.mines.map(m => [m.x, m.z]);
      const save = captureCheckpoint(g, { player: 'Mines', quickDeployment: false, guideDismissed: true });
      check(validateCheckpoint(save) && save.mines.length === 3 && save.mines.every(m => m.unit === 0), 'The checkpoint records each mine and its Medic');
      const old = { ...save }; delete old.mines;
      const bad = [{ ...save, mines: [{ x: -4, z: 2, unit: 0 }] }, { ...save, mines: [{ x: 3, z: 3, unit: 9 }] }, { ...save, mines: 'three' }];
      check(validateCheckpoint(old) && bad.every(s => !validateCheckpoint(s)), 'Older saves load; damaged mine lists are rejected');
      g.sell(second);
      restoreCheckpoint(g, save);
      check(field.mines.length === 3 && field.mines.every((m, i) => m.x === lay[i][0] && m.z === lay[i][1] && m.armed && m.owner === g.gunners[0]),
        'Continue puts every mine back, armed, with its Medic');
      check(g.gunners.length === 1, 'Restoring a Medic lays no second set');
      restoreCheckpoint(g, old);
      check(field.mines.length === 0, 'A save from before mines restores none');

      // ---- the layer is optional: without it the Medic still deploys and saves ----
      [x, y] = fresh('build');
      g.minefield = null;
      check(g.placeGunner('mender', x, y) && field.mines.length === 0, 'No layer, no mines, Medic still placed');
      for (let i = 0; i < 5; i++) g.update(0.05);
      const bare = captureCheckpoint(g, { player: 'Mines', quickDeployment: false, guideDismissed: true });
      check(validateCheckpoint(bare) && !('mines' in bare), 'A run without the layer saves no mine list');
      check(g.sell(g.gunners[0]), 'Salvage works without the layer');
      g.minefield = field;
      restoreCheckpoint(g, save);
      // Leave the saved Medic in view, with the pause menu closed, for the inspector check below.
      g.paused = false; g.emit('change');
      const unit = g.gunners[0];
      g.stage.focus.set(unit.x, 0, unit.z); g.stage.updateCamera(); g.camera.updateMatrixWorld(true);
      const v = unit.obj.position.clone(); v.y = 0; v.project(g.camera);
      const r = document.getElementById('game').getBoundingClientRect();
      out.point = { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
      return out;
    });
    // ---- the inspector counts the mines a selected Medic still has out ----
    await page.mouse.click(out.point.x, out.point.y);
    assert.match(await page.locator('#stats').textContent(), /Mines\s*3 of 3 left · 100 each/);
    assert.equal(out.dealt, 100);
    assert.deepEqual(errors, []);
    console.log('Medic mines: ok', JSON.stringify(out.spread));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
