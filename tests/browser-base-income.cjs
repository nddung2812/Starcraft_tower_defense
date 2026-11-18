// Every third base level pays: minerals on a half-second tick and free Troopers every 30 seconds.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.route('**/src/hero.js', route => route.abort());   // this suite reads the toasts, and the hero's messages would replace them
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345'); await page.waitForFunction(() => window.game);
    await page.locator('#introBtn').click();
    const r = await page.evaluate(() => {
      const g = game, out = {};
      g.stage.render = () => {}; g.paused = false;
      const hold = () => { g.state = 'wave'; g.zerglings.length = 0; g.crates.length = 0; g.crateT = 1e9; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; for (const h of g.hives) h.hp = h.maxHp; };
      const play = seconds => { for (let i = 0; i < Math.round(seconds / 0.05); i++) { hold(); g.update(0.05); } };
      const earned = seconds => { const start = g.minerals; play(seconds); return g.minerals - start; };
      const free = () => g.gunners.filter(u => u.kind === 'marine' && u.invested === 0 && !u.dead).length;
      const research = () => { g.minerals += 1e6; g.upgradeBase(); g.completeBaseUpgrade(); };

      research(); research();
      out.level2 = { minerals: earned(5), free: free() };
      research();
      out.toast3 = document.getElementById('toasts').textContent;
      out.level3 = earned(10);
      g.incomeT = 0; out.tick = [earned(0.45), earned(0.1)];
      g.troopT = 0; play(29.9); out.before30 = free(); play(0.15); out.after30 = free();
      g.emit('selectOnly', g.core); g.emit('change');
      out.panel3 = document.getElementById('baseBonus').textContent;

      research(); out.level4 = earned(10);
      research(); research();
      out.toast6 = document.getElementById('toasts').textContent;
      out.level6 = earned(10);
      const had6 = free(); g.troopT = 0; play(30.1); out.troops6 = free() - had6;
      research(); research(); research();
      out.level9 = earned(10);
      const had9 = free(); g.troopT = 0; play(30.1); out.troops9 = free() - had9;

      // ---- free means free: nothing back, and Redeploy does not buy them ----
      const trooper = g.gunners.find(u => u.kind === 'marine' && u.invested === 0);
      g.state = 'build'; const before = g.minerals; g.sell(trooper); out.salvage = g.minerals - before; hold();
      g.completeWave(); out.redeploy = (g.lastArmy || []).filter(u => u.invested === 0).length; out.freeAfterRound = free();

      // ---- the field never fills without limit, and pausing stops everything ----
      hold(); for (let i = 0; i < 30; i++) g.sendFreeTroopers(9); out.cap = free();
      g.paused = true; const held = g.minerals, t = g.troopT; for (let i = 0; i < 40; i++) g.update(0.05);
      out.paused = { minerals: g.minerals - held, timer: g.troopT === t }; g.paused = false;
      g.reset(12345); hold(); out.newRun = { minerals: earned(5), free: free() };
      return out;
    });
    assert.deepEqual(r.level2, { minerals: 0, free: 0 }, 'Nothing before level 3');
    assert.match(r.toast3, /2 minerals a second and 1 free Trooper every 30 seconds/);
    assert.equal(r.level3, 20, 'Level 3 pays 1 every half second');
    assert.deepEqual(r.tick, [0, 1], 'Minerals land on the half second');
    assert.deepEqual([r.before30, r.after30], [0, 1], 'One free Trooper at 30 seconds');
    assert.match(r.panel3, /\+2 minerals\/s · 1 Trooper\/30s/);
    assert.equal(r.level4, 20, 'Levels 4 and 5 change nothing');
    assert.match(r.toast6, /4 minerals a second and 2 free Troopers every 30 seconds/);
    assert.equal(r.level6, 40, 'Level 6 earns 4 a second'); assert.equal(r.troops6, 2, 'Level 6 sends two');
    assert.equal(r.level9, 60, 'Level 9 earns 6 a second, not 8'); assert.equal(r.troops9, 3, 'Level 9 sends three');
    assert.equal(r.salvage, 0, 'A free Trooper salvages for nothing');
    assert.equal(r.redeploy, 0, 'Redeploy does not rebuy free Troopers');
    assert.equal(r.freeAfterRound, 0);
    assert.equal(r.cap, 40, 'At most 40 free Troopers');
    assert.deepEqual(r.paused, { minerals: 0, timer: true });
    assert.deepEqual(r.newRun, { minerals: 0, free: 0 });
    assert.deepEqual(errors, []);
    console.log('PASS: level 3 income, tick, 30-second Troopers, +2 a second at 6 and 9, free refunds, Redeploy, cap, pause and new run');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
