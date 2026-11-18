// The hero: Trooper stats plus health and armour, double-damage melee, levels and gear that persist, boss loot.
// Serve the repo on port 8765, then: node tests/browser-hero.cjs [playwright-core dir]
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const URL = process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345';
const SHOTS = process.env.HERO_SHOTS || require('node:os').tmpdir();

async function open(context) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
  await page.goto(URL);
  await page.waitForFunction(() => window.game?.stage && window.game.extras.hero, null, { polling: 50 });
  return page;
}
const start = async page => {
  await page.locator('#playerName').fill('Rico');
  await page.locator('#introBtn').click();
  await page.evaluate(() => { game.stage.render = () => {}; });
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await open(context);
    await start(page);

    const out = await page.evaluate(async () => {
      const { HERO, LOOT, UNITS, MARINE_TIERS, MARINE_INFO, milestonePlan } = await import('/src/config.js');
      const { Zergling } = await import('/src/entities.js');
      const { captureCheckpoint, validateCheckpoint } = await import('/src/checkpoints.js');
      const items = await import('/src/heroitems.js');
      const g = game, corps = g.hero, check = (ok, message) => { if (!ok) throw Error(message); };
      const hero = () => corps.unit;
      const bug = (x, z, breed = 'zergling', hp = 100000) => {
        const b = new Zergling(x, z, breed, 1, 1);
        b.hp = b.maxHp = hp; b.speed = 0; b.update = () => {};
        g.zerglings.push(b); g.world.add(b.obj); return b;
      };
      const clearBugs = () => { for (const z of g.zerglings) g.world.remove(z.obj); g.zerglings = []; };
      const fight = () => { g.state = 'wave'; g.paused = false; g.crateT = 1e9; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; };
      const out = {};

      // ---- level 1 is a Trooper with extra health and armour ----
      const u = hero(), base = MARINE_TIERS[0];
      check(u?.isHero && g.gunners.includes(u), 'The hero is on the field from the first round');
      check(g.gunners.filter(m => m.isHero).length === 1, 'Exactly one hero');
      check(u.stats.damage === base.damage && u.stats.attackSpeed === base.attackSpeed && u.stats.range === base.range, 'Gun matches a Recruit Trooper');
      check(u.stats.moveSpeed === UNITS.marine.speed, 'Speed matches a Trooper');
      check(u.maxHp === base.hp + HERO.extraHp && HERO.extraHp > 0, 'Extra health');
      check(u.stats.armor === MARINE_INFO.armor + HERO.extraArmor && HERO.extraArmor > 0, 'Extra armour');
      check(UNITS.hero.info.name === 'Rico', 'The hero carries the commander name');

      // ---- the gun, and the blade at double damage ----
      fight(); clearBugs();
      const far = bug(u.x + 3, u.z), near = bug(u.x + 1, u.z);
      u.silenceT = 0; u.target = far; u.fire(g);
      for (let i = 0; i < 40 && g.tracers.length; i++) { for (const t of g.tracers) t.update(0.05, g); g.tracers = g.tracers.filter(t => !t.dead); }
      out.gun = far.maxHp - far.hp;
      u.target = near; u.fire(g);
      out.melee = near.maxHp - near.hp;
      check(out.gun === base.damage, `A shot deals gun damage, got ${out.gun}`);
      check(out.melee === base.damage * HERO.melee.multiplier && HERO.melee.multiplier === 2, `The blade deals double, got ${out.melee}`);
      const sky = bug(u.x + 1, u.z, 'skyhunter');
      check(!u.inReach(sky), 'Aircraft are out of blade reach');

      // ---- experience: nearby kills pay in full, levels raise stats and heal ----
      clearBugs();
      const p = corps.profile;
      const xpFor = (x, z) => { const before = p.xp, b = bug(x, z, 'zergling', 100); corps.killed(b); return p.xp - before; };
      p.xp = 0;
      const close = xpFor(u.x + 1, u.z), away = xpFor(u.x + HERO.xp.near + 5, u.z);
      check(Math.abs(away - close * HERO.xp.far) < 1e-6, `Distant kills pay ${HERO.xp.far}`);
      u.hp = 5;
      corps.gain(items.xpToNext(p.level));
      check(p.level === 2, 'XP buys a level');
      check(u.hp === u.maxHp && u.maxHp > base.hp + HERO.extraHp && u.stats.damage > base.damage, 'A level adds stats and heals');
      check(JSON.parse(localStorage.getItem(items.HERO_KEY)).level === 2, 'A level is saved at once');

      // ---- bosses drop loot; rounds 10-50 always include a rare ----
      p.found = 5; p.bag = []; for (const s of items.SLOTS) p.worn[s] = null;
      const realRandom = Math.random;
      const rolled = {};
      Math.random = () => 0;                     // every roll lands on the lowest rarity
      for (const round of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]) {
        g.assault.plan = milestonePlan(round); g.assault.boss = { x: u.x + 3, z: u.z };
        corps.bossFell(round);
        rolled[round] = corps.drops.map(d => d.item.rarity);
        for (const d of corps.drops) g.world.remove(d.obj);
        corps.drops = [];
      }
      Math.random = realRandom;
      for (const round of LOOT.rareRounds) check(rolled[round].filter(r => r === 'rare').length === 1 && rolled[round].length === 3, `Round ${round} boss drops a rare: ${rolled[round]}`);
      for (const round of [5, 15, 25, 35, 45, 55, 60]) check(!rolled[round].includes('rare'), `Round ${round} has no guaranteed rare: ${rolled[round]}`);
      check(rolled[5].length === LOOT.drops.medium && rolled[60].length === LOOT.drops.hard, 'Drop counts follow the boss');
      out.rolled = rolled;
      p.found = 0;
      Math.random = () => 0;
      g.assault.plan = milestonePlan(5); g.assault.boss = { x: u.x + 3, z: u.z };
      corps.bossFell(5);
      Math.random = realRandom;
      check(corps.drops[0].item.rarity === 'rare', 'The very first find is at least rare');

      // ---- walking over a drop picks it up and wears it; a click works too; nothing is left behind ----
      const first = corps.drops[0], second = corps.drops[1];
      first.t = 1; first.x = u.x + 0.3; first.z = u.z;
      corps.update(0.05);
      check(!corps.drops.includes(first) && p.worn[first.item.slot] === first.item, 'Walking onto a drop wears it in an empty slot');
      second.t = 1; second.x = u.x + 40; second.z = u.z;
      check(corps.grabLoot({ x: second.x, z: second.z }) && !corps.drops.includes(second), 'A click collects a drop');
      g.assault.boss = { x: u.x + 3, z: u.z }; corps.bossFell(5);
      check(corps.drops.length === 2, 'Fresh drops on the ground');
      corps.collectAll();
      check(corps.drops.length === 0, 'Leftovers go in the bag');

      // ---- gear changes the numbers and swaps cleanly ----
      p.bag = []; for (const s of items.SLOTS) p.worn[s] = null;
      corps.refit();
      const plain = u.stats.damage;
      const make = (slot, rarity, mods, power = null, id = slot + rarity) => ({ id, slot, rarity, power, round: 10, name: id, mods });
      const old = make('weapon', 'magic', { damage: 10 }), better = make('weapon', 'rare', { damage: 40 });
      items.stash(p, old); items.stash(p, better);
      check(p.worn.weapon === old && p.bag[0] === better, 'A second item waits in the bag');
      corps.refit();
      check(Math.abs(u.stats.damage - plain * 1.1) < 1e-6, 'Worn damage applies');
      check(corps.wear(better.id) && p.worn.weapon === better && p.bag[0] === old, 'Wearing swaps the old item into the bag');
      check(Math.abs(u.stats.damage - plain * 1.4) < 1e-6, 'The new item applies');
      const lvl = p.level, xp = p.xp;
      check(corps.breakDown(old.id) === LOOT.rarity.magic.scrapXp && !p.bag.length && (p.level > lvl || p.xp > xp), 'Scrapping pays XP');
      for (let i = 0; i < HERO.bag; i++) items.stash(p, make('weapon', 'rare', { damage: 5 }, null, 'x' + i));
      const full = items.stash(p, make('weapon', 'magic', { damage: 1 }, null, 'junk'));
      check(p.bag.length === HERO.bag && full.scrapped?.id === 'junk', 'A full bag scraps the weakest');
      p.bag = [];

      // ---- every legendary power does what it says ----
      const wearOnly = (...list) => { for (const s of items.SLOTS) p.worn[s] = null; for (const i of list) p.worn[i.slot] = i; corps.refit(); };
      const legend = id => make(LOOT.legendaries[id].slot, 'legendary', {}, id, id);
      clearBugs(); u.hp = u.maxHp; u.shieldT = 0; u.aegisCd = 0;
      wearOnly(legend('reaper'));
      const a = bug(u.x + 1, u.z), b = bug(u.x - 1, u.z), c = bug(u.x, u.z + 1.2);
      u.target = a; u.fire(g);
      check(a.hp < a.maxHp && b.hp < b.maxHp && c.hp < c.maxHp, "Reaper's Arc hits all around");
      clearBugs(); wearOnly(legend('ember'));
      const e1 = bug(u.x + 1, u.z), e2 = bug(u.x + 3, u.z); u.yaw = 0; u.target = e1; u.fire(g);
      check(e2.hp < e2.maxHp, 'Emberfang burns past blade reach');
      clearBugs(); wearOnly(legend('storm')); u.shots = 3;
      const s1 = bug(u.x + 3, u.z), s2 = bug(u.x + 4, u.z); u.yaw = 0; u.target = s1; u.fire(g);
      check(s2.hp < s2.maxHp, 'Stormcaller arcs on the 4th shot');
      g.tracers.forEach(t => { t.dead = true; });
      clearBugs(); wearOnly(legend('cinder')); u.shots = 2;
      const shells = g.shells.length, c1 = bug(u.x + 3, u.z); u.target = c1; u.fire(g);
      check(g.shells.length === shells + 1, 'Cinder Repeater fires an explosive round');
      clearBugs(); wearOnly(legend('aegis')); u.hp = u.maxHp * 0.32;
      const a1 = bug(u.x + 2, u.z); u.takeDamage(u.maxHp * 0.1, g, 0);
      check(u.shieldT > 0 && a1.hp < a1.maxHp && u.hp === u.maxHp * 0.32, 'Aegis blocks the blow and answers with a shockwave');
      u.takeDamage(99999, g, 0);
      check(!u.downed, 'Aegis makes the hero untouchable while it lasts');
      u.shieldT = 0; u.hp = u.maxHp;
      clearBugs(); wearOnly(legend('static')); u.staticT = 0;
      const st = bug(u.x + 2, u.z); u.runPowers(0.05, g);
      check(st.hp < st.maxHp && u.staticT > 0, 'Static Mantle shocks nearby enemies');
      clearBugs(); wearOnly(legend('drone')); u.droneT = 0;
      const tracers = g.tracers.length, d1 = bug(u.x + 4, u.z); u.runPowers(0.05, g);
      check(g.tracers.length === tracers + 1 && !!u.droneMesh, 'The drone fires');
      g.tracers.forEach(t => { t.dead = true; });
      clearBugs(); wearOnly(legend('skyfall')); corps.nearKills = LOOT.legendaries.skyfall.kills - 1;
      const bombs = g.bombs.length; corps.killed(bug(u.x + 1, u.z, 'zergling', 10));
      check(g.bombs.length === bombs + LOOT.legendaries.skyfall.bombs, 'Skyfall Sigil calls a strike');
      clearBugs(); wearOnly();

      // ---- the hero is not army hardware ----
      g.state = 'build';
      check(!g.sell(u) && g.gunners.includes(u), 'The hero cannot be salvaged');
      g.state = 'brief'; g.briefT = 3;
      const save = captureCheckpoint(g, { player: 'Rico', quickDeployment: true, guideDismissed: false });
      check(save.units.every(x => x.kind !== 'hero') && save.units.length === g.gunners.length - 1, 'The hero stays out of the round checkpoint');
      check(validateCheckpoint(save), 'The checkpoint is valid');

      // ---- a new round brings the same hero back with the same level ----
      fight(); clearBugs();
      const level = p.level, round = g.level;
      g.completeWave();
      check(g.level === round + 1 && hero() && hero() !== u && g.gunners.includes(hero()), 'The hero musters on the next round');
      check(p.level === level && g.gunners.filter(m => m.isHero).length === 1, 'Level kept, one hero');
      check(!(g.lastArmy || []).some(x => x.kind === 'hero'), 'Redeploy never buys the hero');

      // ---- death: back after the timer, nothing lost ----
      fight(); clearBugs();
      const fallen = hero();
      fallen.hp = 1; fallen.takeDamage(9999, g, 0);
      check(fallen.downed, 'The hero goes down');
      fallen.finishDeath(g);
      for (let i = 0; i < 60; i++) g.update(0.05);
      check(!corps.present && corps.respawnT > 0 && corps.respawnT < HERO.respawn, 'A fallen hero waits out the timer');
      for (let i = 0; i < (HERO.respawn + 1) * 20; i++) g.update(0.05);
      check(corps.present && hero() !== fallen && p.level === level, 'The hero returns with the same level');
      return out;
    });
    console.log('  gun', out.gun, 'melee', out.melee);

    // ---- the gear screen pauses the battle, and leaves it as it was ----
    await page.evaluate(async () => {
      const g = game, p = g.hero.profile;
      g.state = 'wave'; g.paused = false; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }];
      p.bag = [{ id: 'b1', slot: 'weapon', rarity: 'legendary', power: 'storm', round: 20, name: 'Stormcaller', mods: { damage: 22, crit: 8 } },
        { id: 'b2', slot: 'armor', rarity: 'rare', power: null, round: 10, name: 'Outpost Ridge Harness', mods: { hp: 20, armor: 2 } }];
      p.worn.blade = { id: 'w1', slot: 'blade', rarity: 'rare', power: null, round: 10, name: 'Veteran Mono Sabre', mods: { melee: 30, leech: 4 } };
      g.hero.refit();
    });
    await page.keyboard.press('Shift+C');
    assert.equal(await page.locator('#heroDialog').evaluate(d => d.open), true, 'Shift+C opens the gear screen');
    assert.equal(await page.evaluate(() => game.paused), true, 'The battle pauses');
    await page.locator('[data-item="b1"]').click();
    await page.getByRole('button', { name: 'Wear', exact: true }).click();
    assert.equal(await page.evaluate(() => game.hero.profile.worn.weapon?.id), 'b1', 'Wear puts the item on');
    assert.equal(await page.evaluate(() => game.hero.unit.gear.powers.has('storm')), true, 'The unit gains the power');
    await page.screenshot({ path: `${SHOTS}/hero-panel-1440.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    const fit = await page.locator('#heroDialog').evaluate(d => ({ w: d.getBoundingClientRect().width, scroll: d.scrollWidth - d.clientWidth }));
    assert.ok(fit.w <= 390 && fit.scroll <= 0, `The screen fits a phone: ${JSON.stringify(fit)}`);
    await page.screenshot({ path: `${SHOTS}/hero-panel-390.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#heroClose').click();
    await page.waitForFunction(() => !game.paused, null, { polling: 50, timeout: 3000 });   // a dialog's close event arrives a moment later
    for (const width of [390, 800, 900, 1100]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(200);
      const edge = await page.evaluate(() => Math.max(...['btnPause', 'btnMore'].map(id => document.getElementById(id).getBoundingClientRect().right)));
      assert.ok(edge <= width, `The toolbar fits at ${width}px: its right edge is ${edge}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.keyboard.press('Shift+W');
    assert.equal(await page.evaluate(() => game.selected === game.hero.unit), true, 'Shift+W selects the hero');
    assert.deepEqual(page.errors, []);

    // ---- levels and gear survive a reload ----
    const before = await page.evaluate(() => { game.hero.save(); return { level: game.hero.profile.level, weapon: game.hero.profile.worn.weapon?.id }; });
    const again = await open(context);
    assert.deepEqual(await again.evaluate(() => ({ level: game.hero.profile.level, weapon: game.hero.profile.worn.weapon?.id })), before, 'The hero is kept between visits');
    await again.close();

    // ---- a damaged save starts over; a missing layer costs only the hero ----
    const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await fresh.addInitScript(() => localStorage.setItem('td.hero.v1', '{"v":1,"level":9999,"worn":{"weapon":{"slot":"weapon","mods":{"damage":1e9}}}}'));
    const damaged = await open(fresh);
    assert.deepEqual(await damaged.evaluate(() => ({ level: game.hero.profile.level, weapon: game.hero.profile.worn.weapon })), { level: 1, weapon: null }, 'A damaged save is ignored');
    await fresh.close();

    const bare = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await bare.route('**/src/hero.js', route => route.abort());
    const without = await bare.newPage();
    without.errors = []; without.on('pageerror', e => without.errors.push(e.message));
    await without.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await without.goto(URL);
    await without.waitForFunction(() => window.game?.stage && window.game.extras.mines, null, { polling: 50 });
    await without.locator('#introBtn').click();
    const alone = await without.evaluate(() => { game.stage.render = () => {}; for (let i = 0; i < 80; i++) game.update(0.05); return { hero: game.hero, units: game.gunners.length, button: !!document.getElementById('btnHero') }; });
    assert.deepEqual(alone, { hero: null, units: 3, button: false }, 'The game plays on without the layer');
    assert.deepEqual(without.errors, []);
    await bare.close();

    console.log('PASS: Trooper start, gun and double melee, XP and levels, boss loot with rares on rounds 10-50, gear, all 8 legendaries, rounds, death, gear screen, saves, missing layer');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
