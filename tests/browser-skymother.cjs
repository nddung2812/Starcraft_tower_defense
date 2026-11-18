const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const URL = process.env.TEST_URL || 'http://127.0.0.1:8765/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(URL);
    await page.waitForFunction(() => window.game?.stage && window.game?.skyfleet, null, { polling: 50, timeout: 30000 });
    const result = await page.evaluate(async () => {
      const { Marine } = await import('/src/entities.js');
      const { wavePlan, SKYMOTHER, BREEDS, ECON } = await import('/src/config.js');
      const { scoutRound } = await import('/src/scouting.js');
      const check = (ok, m) => { if (!ok) throw Error(m); };
      const count = (n) => wavePlan(n).filter((s) => s.breed === 'skymother').length;
      check(count(10) === 0 && count(11) === 1 && count(14) === 1, 'First Skymother round');
      check(count(15) === 0 && count(20) === 0, 'A Skymother arrived with a boss');
      check(count(21) === 2 && count(31) === 3 && count(101) === SKYMOTHER.maxPerWave, 'Skymother escalation');
      check(scoutRound(11).threats.find((t) => t.id === 'skymother').unit === 'cruiser', 'Scouting counter');

      const g = game; g.stage.render = () => {};
      const arena = (level = 11) => {
        g.reset(4242); g.level = level; g.loadLevel(); g.state = 'wave'; g.paused = false;
        g.queue = []; g.crateT = 1e9; g.assault.update = () => {}; g.ambush.update = () => {};
        g.hives.forEach((h) => { h.update = () => {}; });
        g.gunners.forEach((u) => g.world.remove(u.obj)); g.gunners = [];
        g.core.x = 1; g.core.z = 1;
        return { x: Math.floor(g.grid.COLS / 2), z: Math.floor(g.grid.ROWS / 2) };
      };
      const spawn = (x, z, hpScale = 2) => {
        const m = g.skyfleet.hatch(x, z, { hpScale, speedScale: 1 }); g.zerglings.push(m); g.world.add(m.obj); return m;
      };
      const unit = (kind, x, z) => { const u = new Marine(kind, x, z, []); g.gunners.push(u); g.world.add(u.obj); return u; };
      const run = (seconds, until = () => false) => { for (let t = 0; t < seconds && !until(); t += 0.05) g.update(0.05); };
      const talons = () => g.zerglings.filter((z) => z.isTalon && !z.dead);
      const out = {};

      // Stats, flight and a full launch
      let c = arena(); let m = spawn(c.x + 5, c.z);
      check(m.flying && m.maxHp === BREEDS.skymother.hp * 2 && m.armor === BREEDS.skymother.armor, 'Skymother stats');
      check(m.speed < BREEDS.skyhunter.speed / 2, 'Skymother should be slow');
      const trooper = unit('marine', c.x, c.z); trooper.maxHp = trooper.hp = 1e6; trooper.update = () => {};
      run(4);
      out.launched = talons().length;
      check(talons().length === SKYMOTHER.brood && m.docked === 0, 'Eight Talons launch');
      const hurtGround = trooper.hp < 1e6;
      check(hurtGround, 'Talons hit ground units');

      // Air targets, and a Titan comes first
      const titan = unit('cruiser', c.x + 2, c.z + 1); titan.maxHp = titan.hp = 1e6; titan.update = () => {}; titan.obj.position.y = 2.6;
      run(1.5);
      check(m.prey === titan, 'A Titan in reach is hunted first');
      run(3);
      check(titan.hp < 1e6, 'Talons hit aircraft');

      // A Talon pays nothing and scores nothing, and she grows it back
      const kills = g.kills, minerals = g.minerals;
      for (const t of talons()) t.takeDamage(99999, g, 0);
      check(g.kills === kills && g.minerals === minerals, 'Talons must not score or pay');
      check(talons().length === 0, 'Talons were not shot down');
      titan.dead = true; trooper.dead = true; g.gunners = [];
      run(SKYMOTHER.regrow + 0.2, () => m.docked > 0);
      check(m.docked === 1, 'A lost Talon grows back');
      run(SKYMOTHER.regrow * SKYMOTHER.brood + 1);
      check(m.docked === SKYMOTHER.brood, 'The brood never grows past eight');

      // Nothing in reach: they fly home
      c = arena(); m = spawn(c.x + 5, c.z); const bait = unit('marine', c.x, c.z); bait.maxHp = bait.hp = 1e6; bait.update = () => {};
      run(4); check(talons().length > 0, 'Launch before recall');
      bait.dead = true; g.gunners = []; run(6, () => talons().length === 0);
      check(talons().length === 0 && m.docked === SKYMOTHER.brood, 'Talons return to dock');

      // Buildings take a share; a Titan takes the bonus
      const hits = {};
      c = arena(); m = spawn(c.x + 4, c.z); run(0.1);
      m.prey = null;
      const dummy = (kind) => ({ kind, x: c.x + 4, z: c.z, dead: false, flying: kind === 'cruiser', obj: m.obj, hp: 1, takeDamage() {} });
      const { Acid } = await import('/src/entities.js');
      m.docked = 1; m.launch(1, g); const t = talons()[0];
      for (const kind of ['core', 'wall', 'marine', 'cruiser']) {
        t.attackCd = 0; t.x = c.x + 4; t.z = c.z; g.acids.length = 0; t.strike(dummy(kind), 0.001, g);
        hits[kind] = g.acids.at(-1).damage; g.acids.forEach((a) => g.scene.remove(a.mesh)); g.acids.length = 0;
      }
      out.hits = hits;
      check(hits.core === BREEDS.talon.damage * SKYMOTHER.structureShare && hits.wall === hits.core, 'Buildings take a share');
      check(hits.marine === BREEDS.talon.damage && hits.cruiser === BREEDS.talon.damage + SKYMOTHER.titanBonus, 'Titan bonus');

      // Her death: one kill, her bounty, and the whole brood falls
      c = arena(); m = spawn(c.x + 5, c.z); const b2 = unit('marine', c.x, c.z); b2.maxHp = b2.hp = 1e6; b2.update = () => {};
      run(4);
      const before = { kills: g.kills, minerals: g.minerals };
      m.takeDamage(1e6, g, 0);
      check(g.kills === before.kills + 1, 'She counts as one kill');
      check(g.minerals === before.minerals + ECON.perKill * BREEDS.skymother.bounty, 'Her bounty');
      check(talons().length === 0, 'The brood falls with her');
      b2.dead = true; g.gunners = []; run(2.5);
      check(!g.zerglings.includes(m) && !g.zerglings.some((z) => z.isTalon), 'Wreckage cleared');

      // A live cap, so a long Survival match cannot stack them
      c = arena(); for (let i = 0; i < SKYMOTHER.maxAlive; i++) spawn(c.x + i * 4, c.z);
      check(!g.skyfleet.room(), 'Live cap');
      g.queue = [{ at: 0, breed: 'skymother', hpScale: 2, speedScale: 1 }]; g.spawnTimer = 1; g.update(0.05);
      check(g.zerglings.filter((z) => z.isSkymother).length === SKYMOTHER.maxAlive, 'Cap ignored in the wave loop');
      return out;
    });
    assert.deepEqual(errors, []);

    // Without the layer the rest of the wave still plays
    const bare = await browser.newPage(); const bareErrors = []; bare.on('pageerror', (e) => bareErrors.push(e.message));
    await bare.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await bare.route('**/src/skymother.js', (r) => r.abort());
    await bare.goto(URL);
    await bare.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    const missing = await bare.evaluate(() => {
      const g = game; g.stage.render = () => {};
      g.reset(7); g.level = 11; g.loadLevel(); g.state = 'wave'; g.paused = false;
      g.queue = [{ at: 0, breed: 'skymother', hpScale: 2, speedScale: 1 }, { at: 0, breed: 'zergling', hpScale: 1, speedScale: 1 }];
      g.spawnTimer = 1; g.update(0.05);
      return { fleet: g.skyfleet, breeds: g.zerglings.map((z) => z.breedId) };
    });
    assert.equal(missing.fleet, null); assert.ok(missing.breeds.includes('zergling')); assert.ok(!missing.breeds.includes('skymother'));
    assert.deepEqual(bareErrors, []);
    console.log('PASS: Skymother waves, launch, targets, recall, regrowth, scoring, death, cap and missing layer', result);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
