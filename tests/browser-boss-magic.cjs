// Enemy reach, return fire, the boss's Firestorm and Earthquake, and the enemy hit effects.
// Serve the repo on port 8765, then: node tests/browser-boss-magic.cjs [path/to/playwright-core]
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');

const open = async (browser, block) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (block) await page.route(block, r => r.abort());
  await page.goto('http://127.0.0.1:8765');
  await page.waitForFunction(() => window.game);
  return { page, errors };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--enable-unsafe-swiftshader']
  });
  try {
    const { page, errors } = await open(browser);
    await page.waitForFunction(() => window.game.bossMagic && window.game.impacts);
    await page.locator('#introBtn').click();
    const result = await page.evaluate(async () => {
      const { BREEDS, BOSS_MAGIC, milestonePlan, wavePlan } = await import('/src/config.js');
      const { Zergling, Acid } = await import('/src/entities.js');
      const g = game, check = (ok, why) => { if (!ok) throw Error(why); };
      g.stage.render = () => {};

      // Reach: longer than before, and still inside what a garrisoned bunker can answer.
      check(BREEDS.needler.range === 5.2 && BREEDS.skyhunter.range === 5 && BREEDS.broodray.range === 5.8 && BREEDS.tanker.range === 6, 'Enemy ranges');
      for (const id of ['needler', 'skyhunter', 'broodray', 'tanker']) check(BREEDS[id].range < 6.4, `${id} outranges a bunker`);
      const count = (n, id) => wavePlan(n).filter(s => s.breed === id).length;
      check(count(3, 'needler') === 1 && count(2, 'needler') === 0 && count(8, 'tanker') === 1 && count(7, 'tanker') === 0, 'Ranged wave counts');

      g.level = 10; g.loadLevel(); g.state = 'build'; g.startWave(); g.state = 'wave'; g.minerals = 99999;
      g.queue.length = 0;
      const a = g.assault, magic = g.bossMagic;
      a.spawnBoss();
      const plan = a.plan;
      const free = (dx, dz) => g.grid.nearestOpen(Math.floor(g.core.x) + dx, Math.floor(g.core.z) + dz, 12);

      // Return fire: an idle Trooper answers a shot from beyond its reach; a defender holds.
      g.placeGunner('marine', ...Object.values(free(-5, 0)));
      const idle = g.gunners.at(-1);
      const needler = new Zergling(idle.x + 5, idle.z, 'needler', 50, 1);
      g.zerglings.push(needler); g.world.add(needler.obj);
      const shot = () => new Acid(idle.x, 0.4, idle.z, idle, 1, 'spine', needler);
      shot().update(1, g);
      check(idle.order?.type === 'attack' && idle.order.target === needler, 'Idle unit did not return fire');
      idle.order = null; idle.defend = true; idle.driving = false;
      shot().update(1, g);
      check(!idle.order, 'Defender left its post');
      idle.defend = false;
      needler.dead = true;
      idle.order = null; idle.driving = false;

      // Firestorm: nothing lands during the warning, the impact and the burn hit buildings.
      for (const u of [...g.gunners]) u.hp = u.maxHp;
      const spot = free(-9, 0);
      const before = g.bunkers.length;
      g.placeBunker(spot.x, spot.y);
      check(g.bunkers.length === before + 1, 'Bunker was not placed');
      const bunker = g.bunkers.at(-1);
      bunker.hp = bunker.maxHp = 5000;

      magic.boss = a.boss; magic.turn = 0; magic.casts = []; magic.timer = 0;
      magic.cast(a);
      const fire = magic.casts[0];
      check(fire.kind === 'fire' && Math.hypot(fire.x - bunker.x, fire.z - bunker.z) < 0.01, 'Firestorm did not aim at the bunker');
      magic.timer = 999;
      magic.update(BOSS_MAGIC.fire.telegraph - 0.1, a);
      check(bunker.hp === 5000, 'Firestorm hit before its warning ended');
      magic.update(0.2, a);
      check(bunker.hp === 5000 - plan.fireImpact, 'Firestorm impact damage');
      check(magic.fires.length === 1 && magic.casts.length === 0, 'Firestorm left no flames');
      const burnt = bunker.hp;
      for (let i = 0; i < 40; i++) magic.update(0.05, a);
      check(bunker.hp === burnt - plan.fireDps * BOSS_MAGIC.fire.tick * 4, `Burn damage ${burnt - bunker.hp}`);
      const twin = { ...magic.fires[0], glow: magic.fires[0].glow.clone() };
      g.scene.add(twin.glow); twin.glow.material = twin.glow.material.clone();
      magic.fires.push(twin);
      const single = bunker.hp;
      for (let i = 0; i < 10; i++) magic.update(0.05, a);
      check(bunker.hp === single - plan.fireDps * BOSS_MAGIC.fire.tick, 'Overlapping flames stacked');
      for (let i = 0; i < 100; i++) magic.update(0.05, a);
      check(magic.fires.length === 0, 'Flames never burned out');

      // Earthquake: three widening pulses; the centre takes all three, the rim one.
      const rim = new (bunker.constructor)(bunker.tx, bunker.ty, 5000, 0);
      rim.x = bunker.x + BOSS_MAGIC.quake.radius - 0.2; rim.z = bunker.z;
      rim.takeDamage = function (amount) { this.hp -= amount; };
      g.bunkers.push(rim);
      bunker.hp = 5000;
      magic.turn = 1;
      magic.cast(a);
      const quake = magic.casts[0];
      check(quake.kind === 'quake', 'Earthquake did not follow the Firestorm');
      quake.x = bunker.x; quake.z = bunker.z;
      magic.update(BOSS_MAGIC.quake.telegraph - 0.1, a);
      check(bunker.hp === 5000, 'Earthquake hit before its warning ended');
      for (let i = 0; i < 40; i++) magic.update(0.05, a);
      check(bunker.hp === 5000 - plan.quakeDamage * 3, `Quake centre ${5000 - bunker.hp}`);
      check(rim.hp === 5000 - plan.quakeDamage, `Quake rim ${5000 - rim.hp}`);
      check(magic.scars.length === 1, 'Earthquake left no cracks');
      g.bunkers.splice(g.bunkers.indexOf(rim), 1);

      // Who is safe: bunker crews and aircraft take nothing, ground troops a share.
      g.placeGunner('falcon', ...Object.values(free(-3, 3)));
      const flyer = g.gunners.at(-1);
      flyer.x = bunker.x; flyer.z = bunker.z;
      g.placeGunner('marine', ...Object.values(free(-2, 4)));
      const crew = g.gunners.at(-1); g.garrison(crew, bunker, true);
      check(crew.bunker === bunker, 'Crew did not garrison');
      const crewHp = crew.hp, flyerHp = flyer.hp;
      magic.strike(bunker.x, bunker.z, 3, 100, 0.5);
      check(crew.hp === crewHp && flyer.hp === flyerHp, 'Crew or aircraft were hurt');
      g.placeGunner('goliath', ...Object.values(free(-3, -3)));
      const walker = g.gunners.at(-1);
      walker.x = bunker.x + 1; walker.z = bunker.z;
      const walkerHp = walker.hp;
      magic.strike(bunker.x, bunker.z, 3, 100, 0.5);
      check(walker.hp < walkerHp && walkerHp - walker.hp <= 50, 'Ground troops took the wrong share');

      // A bunker that falls to magic throws its crew out alive.
      bunker.hp = 1;
      magic.strike(bunker.x, bunker.z, 3, 100, 0.5);
      check(bunker.dead && !crew.dead && !crew.bunker, 'Bunker collapse lost the crew');

      // No buildings left: aim at the troops. The boss's death ends everything.
      for (const wall of [...g.walls]) wall.dead = true;
      g.walls.length = 0;
      check(g.gunners.includes(magic.aim(2)) || magic.aim(2) === g.core, 'Fallback aim');
      magic.cast(a); magic.cast(a);
      a.update(0.01);
      const meshes = magic.casts.map(c => c.mark);
      a.boss.dead = true; a.cleared = false; a.clearMarks();
      check(!magic.casts.length && !magic.fires.length && !magic.scars.length && meshes.every(m => !m.parent), 'Boss death left magic behind');

      // Hit effects: every kind plays, the pool never overflows, a new round clears them.
      const hits = g.impacts, target = walker;
      const live = (list) => list.filter(i => i.life > 0).length;
      hits.clear();
      hits.shot('spine', target, 0);
      check(live(hits.flashes) === 1 && live(hits.rings) === 1, 'Spine hit');
      hits.shot('acid', target, 0);
      check(live(hits.pools) === 1 && live(hits.flashes) === 2, 'Acid hit');
      hits.shot('acid', flyer, 0);
      check(live(hits.pools) === 1, 'Acid pooled in mid-air');
      const ripper = new Zergling(target.x + 0.5, target.z, 'zergling', 1, 1);
      const flashes = live(hits.flashes);
      ripper.attackCd = 0; ripper.attack(target, 0.05, g);
      check(live(hits.flashes) === flashes + 1, 'Melee hit showed no slash');
      for (let i = 0; i < 500; i++) { hits.shot('acid', target, i); hits.shot('spine', target, i); hits.bite(ripper, target, i); }
      check(hits.flashes.length === 56 && hits.pools.length === 12 && hits.rings.length === 20, 'Effect pool grew');
      for (let i = 0; i < 80; i++) hits.update(0.05);
      check(live(hits.flashes) + live(hits.rings) + live(hits.pools) === 0, 'Effects never finished');
      hits.shot('acid', target, 0);
      hits.clear();
      check(live(hits.pools) === 0 && hits.group.parent === g.scene, 'Clear');

      return { fireImpact: plan.fireImpact, fireDps: plan.fireDps, quake: plan.quakeDamage, medium: milestonePlan(5).quakeDamage };
    });
    assert.deepEqual(errors, []);
    console.log('PASS: reach, return fire, Firestorm, Earthquake, safe units, cleanup, hit effects', result);

    await page.close();

    // Without the two layers the boss fight and enemy attacks still work.
    const bare = await open(browser, /src\/(bossmagic|impacts)\.js/);
    await bare.page.locator('#introBtn').click();
    await bare.page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const g = game;
      g.stage.render = () => {};
      if (g.bossMagic || g.impacts) throw Error('Layers should be missing');
      g.level = 5; g.loadLevel(); g.state = 'build'; g.startWave(); g.state = 'wave'; g.assault.spawnBoss();
      const spitter = new Zergling(g.core.x + 3, g.core.z, 'tanker', 1, 1);
      g.zerglings.push(spitter); g.world.add(spitter.obj);
      for (let i = 0; i < 120; i++) g.update(0.05);
    });
    assert.deepEqual(bare.errors.filter(e => !/Failed to fetch|dynamically imported/.test(e)), []);
    console.log('PASS: the game plays on without either layer');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
