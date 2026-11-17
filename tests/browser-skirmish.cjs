/*
 * Skirmish: one continuous, winnable match. Serve the repo on port 8765, then
 *   node tests/browser-skirmish.cjs [absolute path to playwright-core]
 * Checks the setup, waves on a timer on one map, hive guards, a destroyed hive's share, the win
 * and its record, a rematch, a loss that leaves the saved stand alone, Quit match, that the
 * endless stand still ends a round when its hives die, and two bot matches: a rush that loses
 * and a measured push that wins.
 */
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const URL = process.env.TEST_URL || 'http://127.0.0.1:8765/';
const SEED = 12345;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(process.env.STACK ? e.stack : e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(URL);
    await page.waitForFunction(() => window.game?.extras?.skirmish, null, { polling: 50 });
    await page.evaluate(() => { game.stage.render = () => {}; });

    /* ---------- a saved stand, to prove a match never touches it ---------- */
    await page.locator('#introBtn').click();
    await page.evaluate(() => game.togglePause());
    await page.locator('#btnSaveQuit').click();
    const saved = await page.evaluate(() => localStorage.getItem('td.checkpoint.v1'));
    assert.ok(saved && JSON.parse(saved).level === 1, 'fixture: a saved stand');
    assert.equal(await page.locator('#btnSaveQuit').textContent(), 'Save & quit');

    /* ---------- the start screen and the setup ---------- */
    assert.ok(await page.locator('#btnSkirmish').isVisible(), 'Skirmish button is offered');
    assert.match(await page.locator('#skirmishInfo').textContent(), /Two hives.*every 40 seconds.*Destroy both hives to win\.$/);
    await page.locator('#btnSkirmish').click();
    await page.waitForFunction(() => !document.getElementById('matchHud').hidden);
    const setup = await page.evaluate(() => ({
      asked: document.getElementById('replaceDialog').open, intro: document.getElementById('intro').hidden,
      match: !!game.match, mapLevel: game.mapLevel, level: game.level, state: game.state, squad: game.gunners.length,
      size: [game.grid.COLS, game.grid.ROWS], hives: game.hives.map(h => [h.hp, h.maxHp, h.reward]),
      hud: document.getElementById('matchHud').textContent, saved: localStorage.getItem('td.checkpoint.v1')
    }));
    assert.deepEqual({ ...setup, hud: null, saved: null }, { asked: false, intro: true, match: true, mapLevel: 1, level: 1, state: 'brief',
      squad: 3, size: [56, 56], hives: [[1800, 1800, 250], [1800, 1800, 250]], hud: null, saved: null });
    assert.match(setup.hud, /^SKIRMISH · HIVES 2\/2 · WAVE 1 · /);
    assert.equal(setup.saved, saved, 'starting a match must not replace the saved stand');

    /* ---------- waves on a timer, on the same map, with no raid and no refund ---------- */
    const waves = await page.evaluate(async () => {
      const { wavePlan } = await import('/src/config.js');
      const g = game, m = g.match;
      for (let i = 0; i < 80 && g.state !== 'wave'; i++) g.update(0.05);
      g.queue.length = 0;   // nothing marches in wave 1: in the stand an empty field would start the raid
      const layout = g.layout, squad = g.gunners.slice(), minerals = g.minerals;
      const states = new Set();
      let idleAtZero = false;
      for (let i = 0; i < 799; i++) {
        g.update(0.05); states.add(g.state);
        if (!g.queue.length && !g.zerglings.some(z => !z.dead)) idleAtZero = true;
      }
      const before = { level: g.level, next: m.nextT };
      for (let i = 0; i < 4; i++) g.update(0.05);
      return { states: [...states], idleAtZero, before, level: g.level, next: m.nextT, sameMap: g.layout === layout,
        kept: squad.every(u => g.gunners.includes(u)), paid: g.minerals - minerals === 55, hives: g.hives.map(h => [h.hp, h.maxHp]),
        coming: g.queue.length + g.zerglings.filter(z => !z.dead).length, planned: wavePlan(2).length,
        torch: g.isUnlocked('scorcher'), card: !document.querySelector('[data-build="scorcher"]').hidden,
        callout: document.getElementById('calloutTitle').textContent, elapsed: m.elapsed };
    });
    assert.deepEqual(waves.states, ['wave'], 'a match stays in battle: no raid, no round reset');
    assert.ok(waves.idleAtZero, 'fixture: the field was empty between waves and the match carried on');
    assert.equal(waves.before.level, 1);
    assert.ok(waves.before.next > 0 && waves.before.next < 0.2, `wave 2 is due at 40 s (${waves.before.next})`);
    assert.equal(waves.level, 2);
    assert.ok(waves.next > 39 && waves.next <= 40, `the timer restarts (${waves.next})`);
    assert.ok(waves.sameMap && waves.kept && waves.paid, JSON.stringify(waves));
    assert.deepEqual(waves.hives, [[2100, 2100], [2100, 2100]], 'hives grow with every wave');
    assert.equal(waves.coming, waves.planned, 'wave 2 is the round-2 swarm');
    assert.ok(waves.torch && waves.card, 'units unlock by wave number');
    assert.equal(waves.callout, 'New unit unlocked');   // the unlock replaces the "Wave 2" callout it follows

    /* ---------- a hive under fire hatches guards, at most once per guardGap ---------- */
    const guards = await page.evaluate(() => {
      const g = game, hive = g.hives[0];
      const count = () => g.zerglings.filter(z => z.isGuard).length;
      const a = count(); hive.takeDamage(10, g);
      const b = count(); hive.takeDamage(10, g);
      const c = count();
      g.time += 5.9; hive.takeDamage(10, g);
      const d = count();
      g.time += 0.2; hive.takeDamage(10, g);
      const e = count();
      const near = g.zerglings.filter(z => z.isGuard).every(z => Math.hypot(z.x - hive.x, z.z - hive.z) < 1);
      return { first: b - a, again: c - b, early: d - c, later: e - d, near, hp: hive.hp };
    });
    assert.deepEqual(guards, { first: 4, again: 0, early: 0, later: 4, near: true, hp: 2060 });

    /* ---------- one hive down: its share of every later wave is gone ---------- */
    const half = await page.evaluate(async () => {
      const { wavePlan } = await import('/src/config.js');
      const g = game, m = g.match, minerals = g.minerals;
      g.hives[0].takeDamage(1e9, g);
      const paid = g.minerals - minerals;
      g.update(0.05);
      const after = { dead: g.hives[0].dead, paid, state: g.state, left: m.hivesLeft,
        lanes: [...new Set(g.queue.map(s => s.lane))], callout: document.getElementById('calloutTitle').textContent };
      g.queue.length = 0;
      m.nextT = 0.01; g.update(0.05);
      return { ...after, level: g.level, queued: g.queue.length, lanesNext: [...new Set(g.queue.map(s => s.lane))],
        share: wavePlan(3).filter((_, i) => i % 2 === 1).length, grown: [g.hives[0].maxHp, g.hives[1].maxHp] };
    });
    assert.deepEqual({ dead: half.dead, paid: half.paid, state: half.state, left: half.left, callout: half.callout },
      { dead: true, paid: 250, state: 'wave', left: 1, callout: 'HIVE DESTROYED' });
    assert.ok(half.lanes.every(l => l === 1), 'the dead hive stops sending what it had queued');
    assert.equal(half.level, 3);
    assert.deepEqual(half.lanesNext, [1]);
    assert.equal(half.queued, half.share, 'only the surviving hive sends its share');
    assert.deepEqual(half.grown, [2100, 2400], 'a dead hive stops growing');

    /* ---------- both hives down: the match is won ---------- */
    const won = await page.evaluate(() => {
      const g = game;
      g.hives[1].takeDamage(1e9, g);
      g.update(0.05);
      const time = g.time; g.update(1);
      const shown = (id) => getComputedStyle(document.querySelector(id)).display !== 'none';
      return { state: g.state, ended: g.ended, frozen: g.time === time, banner: !document.getElementById('banner').hidden,
        title: document.getElementById('bannerTitle').textContent, win: document.getElementById('bannerTitle').classList.contains('is-win'),
        text: document.getElementById('bannerText').textContent, share: shown('#banner .share-actions'), board: shown('#bannerBoard'),
        pause: document.getElementById('btnPause').disabled, hud: document.getElementById('matchHud').hidden,
        record: JSON.parse(localStorage.getItem('td.skirmish.v1')), scores: localStorage.getItem('td.scores'),
        saved: localStorage.getItem('td.checkpoint.v1'), info: document.getElementById('skirmishInfo').textContent, elapsed: g.match.elapsed };
    });
    assert.deepEqual({ state: won.state, ended: won.ended, frozen: won.frozen, banner: won.banner, title: won.title, win: won.win,
      share: won.share, board: won.board, pause: won.pause, hud: won.hud },
    { state: 'victory', ended: true, frozen: true, banner: true, title: 'Canyon Cleared', win: true, share: false, board: false, pause: true, hud: true });
    assert.match(won.text, /^Commander, you destroyed both hives in 0:4\d, on wave 3, with \d+ bugs? killed and the relay at 100%\. First win on this setup\.$/);
    assert.equal(won.record[2].wins, 1); assert.equal(won.record[2].played, 1);
    assert.ok(Math.abs(won.record[2].best - won.elapsed) < 1e-9, 'the winning time is the record');
    assert.equal(won.scores, null, 'a match never reaches the kills board');
    assert.equal(won.saved, saved);
    assert.match(won.info, /Your best: 0:4\d\.$/);

    /* ---------- Play Again is a rematch on the same canyon ---------- */
    const seedBefore = await page.evaluate(() => game.mapSeed);
    await page.locator('#bannerBtn').click();
    const rematch = await page.evaluate(() => ({ match: !!game.match, fresh: game.match?.elapsed === 0, level: game.level, seed: game.mapSeed,
      hives: game.hives.map(h => h.hp), banner: document.getElementById('banner').hidden, asked: document.getElementById('replaceDialog').open, state: game.state }));
    assert.deepEqual(rematch, { match: true, fresh: true, level: 1, seed: seedBefore, hives: [1800, 1800], banner: true, asked: false, state: 'brief' });

    /* ---------- losing a match: its own result, and the saved stand survives ---------- */
    const lost = await page.evaluate(() => {
      const g = game;
      for (let i = 0; i < 80 && g.state !== 'wave'; i++) g.update(0.05);
      g.onCoreDestroyed();
      return { state: g.state, title: document.getElementById('bannerTitle').textContent, win: document.getElementById('bannerTitle').classList.contains('is-win'),
        match: document.getElementById('banner').classList.contains('is-match'), text: document.getElementById('bannerText').textContent,
        record: JSON.parse(localStorage.getItem('td.skirmish.v1'))[2], scores: localStorage.getItem('td.scores'), saved: localStorage.getItem('td.checkpoint.v1') };
    });
    assert.deepEqual({ state: lost.state, title: lost.title, win: lost.win, match: lost.match }, { state: 'defeat', title: 'Outpost Overrun', win: false, match: true });
    assert.match(lost.text, /^Commander, the relay fell on wave 1 after 0:0\d\. 0 of 2 hives destroyed, 0 bugs killed\. Your best win: 0:4\d\.$/);
    assert.equal(lost.record.wins, 1); assert.equal(lost.record.played, 2);
    assert.equal(lost.scores, null); assert.equal(lost.saved, saved, 'losing a match must not delete the saved stand');

    /* ---------- Quit match, then the saved stand continues as an ordinary endless run ---------- */
    await page.locator('#bannerBtn').click();
    await page.evaluate(() => game.togglePause());
    assert.equal(await page.locator('#btnSaveQuit').textContent(), 'Quit match');
    assert.ok(await page.locator('#btnSaveQuit').isEnabled());
    assert.match(await page.locator('#pauseSaveInfo').textContent(), /not saved.*your saved stand is untouched/);
    await page.locator('#btnSaveQuit').click();
    assert.ok(await page.locator('#intro').isVisible());
    await page.locator('#btnContinue').click();
    const stand = await page.evaluate(() => {
      const g = game, facts = { match: g.match, mapLevel: g.mapLevel, level: g.level, paused: g.paused, hives: g.hives.map(h => h.maxHp),
        hud: document.getElementById('matchHud').hidden, quit: document.getElementById('btnSaveQuit').textContent };
      g.togglePause();
      for (let i = 0; i < 80 && g.state !== 'wave'; i++) g.update(0.05);
      for (const hive of g.hives) hive.takeDamage(1e9, g);
      g.update(0.05);
      return { ...facts, after: [g.level, g.state], banner: document.getElementById('banner').hidden };
    });
    assert.deepEqual(stand, { match: null, mapLevel: null, level: 1, paused: true, hives: [300, 300], hud: true, quit: 'Save & quit',
      after: [2, 'brief'], banner: true }, 'the endless stand still ends a round when its hives die');

    /* ---------- push or hold: a rush loses, a measured push wins ---------- */
    // The bot spends everything on Troopers (an Atlas every fourth from wave 3). When it pushes it
    // leaves a quarter of the army home (K) and keeps sending the rest, recruits included (A).
    const play = (plan) => page.evaluate(({ plan, seed }) => {
      const g = game;
      g.reset(seed, g.extras.skirmish.options()); g.extras.skirmish.begin(); g.quickDeploy();
      const anchor = g.deployAnchor(), ax = Math.floor(anchor.x), ay = Math.floor(anchor.y), spots = [];
      for (let r = 0; r <= 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) spots.push([ax + dx, ay + dy]);
      }
      let pushed = false;
      for (let i = 0; i < 20 * 60 * 13 && !g.ended; i++) {
        g.update(0.05);
        if (g.pendingEvolution) g.chooseEvolution('chain');
        if (i % 20) continue;
        for (let n = 0; n < 20; n++) {
          const kind = g.level >= 3 && g.gunners.filter(u => !u.dead).length % 4 === 3 ? 'goliath' : 'marine';
          const spot = g.minerals >= (kind === 'goliath' ? 160 : 60) && spots.find(([x, y]) => g.canBuildAt(x, y));
          if (!spot || !g.placeGunner(kind, spot[0], spot[1])) break;
        }
        if (g.level < plan.pushWave) continue;
        if (!pushed) {
          pushed = true;
          const units = g.gunners.filter(u => !u.dead);
          g.commandDefend(units.slice(0, plan.home ? Math.max(3, Math.round(units.length * plan.home)) : 0), true);
        }
        if (i % 100 === 0) g.commandAdvanceArmy();
      }
      return { state: g.state, seconds: Math.round(g.match.elapsed), wave: g.level, kills: g.kills, hivesLeft: g.match.hivesLeft };
    }, { plan, seed: SEED });
    const rush = await play({ pushWave: 1, home: 0 });
    assert.equal(rush.state, 'defeat', `an all-in rush from the first second must not win: ${JSON.stringify(rush)}`);
    assert.equal(rush.hivesLeft, 2, 'the rush does not even take one hive');
    // Combat is not seeded, so a good plan gets three attempts (it won 9 of 10 while tuning).
    const pushes = [];
    while (pushes.length < 3 && !pushes.some(r => r.state === 'victory')) pushes.push(await play({ pushWave: 9, home: 0.25 }));
    const push = pushes[pushes.length - 1];
    assert.equal(push.state, 'victory', `a built-up push at wave 9 must be able to win: ${JSON.stringify(pushes)}`);
    assert.ok(push.seconds > 320 && push.seconds < 780, `a match is minutes, not hours: ${JSON.stringify(push)}`);

    assert.deepEqual(errors, []);
    console.log('Skirmish passed', { won: won.text, lost: lost.text, rush, push, attempts: pushes.length });
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
