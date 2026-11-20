/*
 * Duel: two players, one mirrored battle each. Serve the repo on port 8765, then
 *   node tests/browser-duel.cjs [absolute path to playwright-core]
 * Two pages of one browser play each other over the BroadcastChannel carrier (`?duelnet=local`),
 * so no network is needed. Checks the lobby (host, join by code and by invite link, a wrong code,
 * a third player, the host's terms, the blind draft, Ready), the mirrored start (seed, map,
 * minerals, drafted roster, build time, no hero, no pause, no speed change, same boss treasure),
 * sends (gates, cost, cooldown, income, arrival, half bounty, a refused flood), the rival readout,
 * every way a duel ends (hives, relay, concession, a rival who leaves, a stalled rival, both at
 * once), the rematch, and that the game is untouched without the layer.
 */
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const URL = process.env.TEST_URL || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    const open = async (name, query = '?duelnet=local') => {
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(`${name}: ${process.env.STACK ? e.stack : e.message}`));
      await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });   // the test steps each battle itself
      await page.goto(URL + query);
      await page.waitForFunction(() => window.game?.extras?.duel && window.game?.extras?.hero, null, { polling: 50, timeout: 30000 });
      await page.evaluate((n) => { game.stage.render = () => {}; document.getElementById('playerName').value = n; }, name);
      return page;
    };
    const state = (page) => page.evaluate(() => game.extras.duel.state);
    const step = (page, seconds) => page.evaluate((s) => { for (let i = 0; i < Math.round(s / 0.05); i++) game.update(0.05); }, seconds);
    const draft = async (page, ids) => { for (const id of ids) await page.locator(`#duelDraft [data-unit="${id}"]`).click(); };
    const until = (page, fn, arg) => page.waitForFunction(fn, arg, { polling: 50, timeout: 15000 });

    const ava = await open('Ava'), ben = await open('Ben');

    /* ---------- the start screen and the door ---------- */
    assert.ok(await ava.locator('#btnDuel').isVisible(), 'the Duel button is offered');
    assert.ok(!(await ava.evaluate(() => document.body.textContent.includes('Skirmish'))), 'players never see the word Skirmish');
    await ava.locator('#btnDuel').click();
    assert.ok(await ava.locator('#duelDialog').evaluate(d => d.open), 'the button opens the lobby');
    await ava.locator('#duelCode').fill('abc');
    await ava.locator('#duelJoin').click();
    assert.match(await ava.locator('#duelStatus').textContent(), /5 letters and numbers/, 'a short code is refused before connecting');
    await ava.locator('#duelCode').fill('ZZZZZ');
    await ava.locator('#duelJoin').click();
    await until(ava, () => /No duel is waiting/.test(document.getElementById('duelStatus').textContent));
    assert.equal((await state(ava)).phase, 'door', 'a code nobody hosts returns to the door');

    /* ---------- host, join, terms, blind draft ---------- */
    await ava.locator('#duelHost').click();
    await until(ava, () => game.extras.duel.state.phase === 'room');
    const room = await state(ava);
    assert.match(room.code, /^[A-HJKMNP-Z2-9]{5}$/, 'a room code avoids look-alike characters');
    assert.ok(room.host && room.rival === null);
    assert.equal(room.link, `${URL}?duel=${room.code}&duelnet=local`);
    assert.ok(await ava.locator('#duelReady').isDisabled(), 'nothing to be ready for without a rival');

    await ben.locator('#btnDuel').click();
    await ben.locator('#duelCode').fill(` ${room.code.toLowerCase()} `);
    await ben.locator('#duelJoin').click();
    await until(ava, () => game.extras.duel.state.rival?.name === 'Ben');
    await until(ben, () => game.extras.duel.state.rival?.name === 'Ava');
    assert.ok(!(await ben.locator('#duelCopy').isVisible()), 'only the host hands out the invite');

    // A third player finds the room full.
    const cy = await open('Cy');
    await cy.locator('#btnDuel').click();
    await cy.locator('#duelCode').fill(room.code);
    await cy.locator('#duelJoin').click();
    await until(cy, () => /already has two players/.test(document.getElementById('duelStatus').textContent));
    assert.equal((await state(cy)).phase, 'door');
    assert.equal((await state(ava)).rival.name, 'Ben', 'the room keeps its two players');
    await cy.close();

    // The host sets the battle; the guest sees it and cannot change it.
    await ava.locator('#duelTermRows [data-term="hives"][data-value="1"]').click();
    await ava.locator('#duelTermRows [data-term="minerals"][data-value="800"]').click();
    await until(ben, () => game.extras.duel.state.terms.hives === 1 && game.extras.duel.state.terms.minerals === 800);
    assert.ok(await ben.locator('#duelTermRows [data-term="hives"][data-value="3"]').isDisabled(), 'the guest cannot set the battle');
    await ava.locator('#duelTermRows [data-term="hives"][data-value="2"]').click();
    await ava.locator('#duelTermRows [data-term="minerals"][data-value="480"]').click();
    await until(ben, () => game.extras.duel.state.terms.hives === 2 && game.extras.duel.state.terms.minerals === 480);

    await draft(ava, ['goliath', 'tank']);
    assert.ok(await ava.locator('#duelReady').isDisabled(), 'Ready waits for a full draft');
    await draft(ava, ['mender']);
    assert.ok(await ava.locator('#duelDraft [data-unit="cruiser"]').isDisabled(), 'a fourth pick is not offered');
    await draft(ava, ['mender', 'scorcher']);   // change of mind: drop the Medic, take the Torch
    assert.deepEqual((await state(ava)).picks, ['goliath', 'tank', 'scorcher']);
    await draft(ben, ['falcon', 'deadeye', 'mender']);
    assert.deepEqual((await state(ben)).rival.picks, [], 'the rival sees no picks before the match');

    await ben.locator('#duelReady').click();
    await until(ava, () => game.extras.duel.state.rival.ready);
    assert.equal(await ava.evaluate(() => !!game.match), false, 'one Ready starts nothing');
    assert.ok(await ben.locator('#duelDraft [data-unit="falcon"]').isDisabled(), 'a ready army is locked');
    await ava.locator('#duelReady').click();
    await until(ava, () => game.match?.duel);
    await until(ben, () => game.match?.duel);

    /* ---------- the mirrored start ---------- */
    const start = (page) => page.evaluate(() => {
      const g = game, cells = [];
      for (let y = 0; y < g.grid.ROWS; y++) for (let x = 0; x < g.grid.COLS; x++) cells.push(g.grid.get(x, y));
      g.togglePause();
      document.getElementById('btnSpeed').click();
      return {
        seed: g.mapSeed, map: g.matchMap, size: [g.grid.COLS, g.grid.ROWS], cells: cells.join(''), state: g.state, brief: Math.round(g.briefT),
        minerals: g.minerals, hives: g.hives.map(h => h.maxHp), roster: [...g.match.roster].sort(), army: g.gunners.length,
        cards: [...document.querySelectorAll('[data-build]')].filter(b => !b.hidden).map(b => b.dataset.build).sort(),
        paused: g.paused, speed: g.speed, hud: document.getElementById('matchHud').textContent, rival: g.match.rival.name, theirs: g.match.rival.picks,
        dialog: document.getElementById('duelDialog').open, intro: document.getElementById('intro').hidden,
        pauseShown: document.getElementById('btnPause').offsetWidth > 0, sends: document.getElementById('duelIncome').textContent,
        packs: [...document.querySelectorAll('#duelSends [data-pack]')].filter(b => !b.hidden).length,
        saved: localStorage.getItem('td.checkpoint.v1'), treasure: g.awardTreasureBoxes(4).map(r => `${r.id || r.name}:${r.boxType}`)
      };
    });
    const [a0, b0] = [await start(ava), await start(ben)];
    assert.equal(a0.seed, b0.seed, 'both battles use one seed');
    assert.equal(a0.cells, b0.cells, 'and so the same canyon');
    assert.deepEqual(a0.map, { hives: 2, size: 56 });
    assert.deepEqual([a0.state, a0.brief, a0.minerals, a0.army, a0.hives], ['brief', 20, 480, 0, [2600, 2600]], 'time to build, the same minerals, no free squad');
    assert.deepEqual([b0.state, b0.brief, b0.minerals, b0.army, b0.hives], ['brief', 20, 480, 0, [2600, 2600]]);
    assert.deepEqual(a0.roster, ['bunker', 'goliath', 'marine', 'scorcher', 'tank', 'wall'], 'the drafted army is the whole army, from the first wave');
    assert.deepEqual(a0.cards, a0.roster, 'and the build bar shows exactly it');
    assert.deepEqual(b0.cards, ['bunker', 'deadeye', 'falcon', 'marine', 'mender', 'wall']);
    assert.deepEqual([a0.rival, a0.theirs, b0.rival, b0.theirs], ['Ben', ['falcon', 'deadeye', 'mender'], 'Ava', ['goliath', 'tank', 'scorcher']], 'picks are revealed at the start');
    assert.deepEqual([a0.paused, a0.speed, a0.pauseShown], [false, 1, false], 'a duel cannot be paused or sped up');
    assert.deepEqual([a0.dialog, a0.intro, a0.saved], [false, true, null], 'the lobby closes and no stand is saved');
    assert.match(a0.hud, /^DUEL · HIVES 2\/2 · FIRST WAVE 0:\d\d$/);
    assert.deepEqual([a0.sends, a0.packs], ['SEND BUGS · FROM WAVE 2', 0], 'sending is closed at the start');
    assert.deepEqual(a0.treasure, b0.treasure, 'boss treasure is dealt from the seed, the same to both');
    assert.equal(a0.treasure.length, 4);

    // The units outside the draft cannot be fielded; the drafted specialists can, at wave 1. No hero joins.
    const fielded = await ava.evaluate(() => {
      const g = game, a = g.deployAnchor(), tx = Math.floor(a.x), ty = Math.floor(a.y);
      const spot = (n) => { for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (g.canBuildAt(tx + dx, ty + dy) && !--n) return [tx + dx, ty + dy]; return null; };
      const out = { torch: g.placeGunner('scorcher', ...spot(1)), medic: g.placeGunner('mender', ...spot(1)), trooper: g.placeGunner('marine', ...spot(1)) };
      for (let i = 0; i < 100; i++) g.update(0.05);
      return { ...out, kinds: g.gunners.map(u => u.kind), hero: !!g.hero?.present, state: g.state, minerals: g.minerals };
    });
    assert.deepEqual(fielded, { torch: true, medic: false, trooper: true, kinds: ['scorcher', 'marine'], hero: false, state: 'brief', minerals: 480 - 110 - 60 });

    /* ---------- the rival readout ---------- */
    await until(ben, () => /1 Trooper · 1 Torch/.test(document.getElementById('duelRival').textContent));
    assert.match(await ben.locator('#duelRival').textContent(), /^Ava · RELAY 100% · HIVES 2\/2 · WAVE 1 · 1 Trooper · 1 Torch · INCOME \+0$/);

    /* ---------- sends ---------- */
    // Reach wave 2 on both sides with empty fields, so the numbers below are exact.
    const toWave2 = (page) => page.evaluate(() => {
      const g = game;
      for (let i = 0; i < 2000 && g.level < 2; i++) { g.update(0.05); g.queue.length = 0; for (const z of g.zerglings) if (!z.dead) z.takeDamage(1e9, g); }
      g.queue.length = 0;
      for (let i = 0; i < 40; i++) { for (const z of g.zerglings) if (!z.dead) z.takeDamage(1e9, g); g.update(0.05); }
      return { level: g.level, state: g.state, shown: [...document.querySelectorAll('#duelSends [data-pack]')].filter(b => !b.hidden).map(b => b.dataset.pack) };
    });
    const early = await ava.evaluate(() => ({ sent: game.match.send('rippers'), why: game.match.blocked({ id: 'rippers', from: 2, cost: 60 }) }));
    assert.deepEqual(early, { sent: false, why: 'The first wave has not started' });
    const [a2, b2] = [await toWave2(ava), await toWave2(ben)];
    assert.deepEqual([a2.level, a2.state, b2.level], [2, 'wave', 2]);
    await ava.waitForTimeout(600);   // the strip refreshes twice a second
    assert.deepEqual(await ava.evaluate(() => [...document.querySelectorAll('#duelSends [data-pack]')].filter(b => !b.hidden).map(b => b.dataset.pack)), ['rippers', 'leapers'], 'a pack appears at the wave that opens it');

    const sent = await ava.evaluate(() => {
      const g = game, m = g.match;
      g.minerals = 200;
      const before = g.minerals, late = m.send('behemoth');
      document.querySelector('#duelSends [data-pack="rippers"]').click();
      const again = m.send('rippers');
      return { late, paid: before - g.minerals, income: m.income, sent: m.sent, again, cool: m.cool.rippers, why: m.blocked({ id: 'rippers', from: 2, cost: 60 }) };
    });
    assert.deepEqual(sent, { late: false, paid: 60, income: 4, sent: 1, again: false, cool: 6, why: 'Ready in 6s' }, 'a pack costs minerals, raises income and cools down');

    await until(ben, () => game.match.inbound.length === 8);
    const landing = await ben.evaluate(() => {
      const g = game, m = g.match;
      const callout = document.getElementById('calloutTitle').textContent, flood = m.receive('rippers');
      for (let i = 0; i < 90; i++) g.update(0.05);   // 4.5 s: still on their way
      const before = g.zerglings.filter(z => !z.dead).length;
      for (let i = 0; i < 50; i++) g.update(0.05);
      const bugs = g.zerglings.filter(z => !z.dead && z.sent);
      const minerals = g.minerals, kills = g.kills;
      bugs[0].takeDamage(1e9, g);
      return { callout, flood, before, landed: bugs.length, breeds: [...new Set(bugs.map(z => z.breed.id))], atHive: bugs.every(z => g.grid.spawns.some(s => Math.hypot(z.x - s.x - 0.5, z.z - s.y - 0.85) < 6)),
        bounty: g.minerals - minerals, counted: g.kills - kills, received: m.received };
    });
    assert.deepEqual(landing, { callout: 'INCOMING · 8 RIPPERS', flood: false, before: 0, landed: 8, breeds: ['zergling'], atHive: true, bounty: 4, counted: 1, received: 1 },
      'the pack is announced, climbs out of the hives five seconds later, and pays half the usual bounty');

    const income = await ava.evaluate(() => {
      const g = game, m = g.match;
      g.queue.length = 0;
      const before = g.minerals;
      let wave = g.level;
      for (let i = 0; i < 205; i++) { g.update(0.05); g.queue.length = 0; for (const z of g.zerglings) if (!z.dead) z.takeDamage(1e9, g); if (g.level !== wave) break; }
      return { gained: g.minerals - before, kills: 0, cool: m.cool.rippers, level: g.level };
    });
    assert.equal(income.cool, 0, 'the cooldown runs out');
    assert.ok(income.gained === 4 || income.gained === 8, `income pays every ten seconds (gained ${income.gained})`);
    await until(ben, () => /INCOME \+4$/.test(document.getElementById('duelRival').textContent));

    /* ---------- a win by hives, seen from both sides ---------- */
    await ava.evaluate(() => { for (const h of game.hives) h.takeDamage(1e9, game); game.update(0.05); });
    await until(ben, () => game.ended);
    const result = (page) => page.evaluate(() => ({ state: game.state, r: (({ won, draw, reason, rival, sent, received, hives, destroyed }) => ({ won, draw, reason, rival, sent, received, hives, destroyed }))(game.match.result),
      title: document.getElementById('bannerTitle').textContent, text: document.getElementById('bannerText').textContent, button: document.getElementById('bannerBtn').textContent,
      banner: !document.getElementById('banner').hidden, hud: document.getElementById('duelSends').hidden && document.getElementById('duelRival').hidden,
      saved: localStorage.getItem('td.checkpoint.v1'), record: localStorage.getItem('td.skirmish.v1') }));
    const [aw, bl] = [await result(ava), await result(ben)];
    assert.deepEqual([aw.state, aw.r], ['victory', { won: true, draw: false, reason: 'hives', rival: 'Ben', sent: 1, received: 0, hives: 2, destroyed: 2 }]);
    assert.deepEqual([bl.state, bl.r], ['defeat', { won: false, draw: false, reason: 'rival-hives', rival: 'Ava', sent: 0, received: 1, hives: 2, destroyed: 0 }]);
    assert.deepEqual([aw.title, bl.title, aw.button, aw.banner, aw.hud], ['Duel Won', 'Duel Lost', 'Back to the lobby', true, true]);
    assert.match(aw.text, /^You destroyed both hives before Ben did\. /);
    assert.match(bl.text, /^Ava destroyed both hives first\. /);
    assert.deepEqual([aw.saved, aw.record, bl.record], [null, null, null], 'a duel touches neither the saved stand nor the Survival records');

    /* ---------- rematch: back to the lobby, a new canyon ---------- */
    await ava.locator('#bannerBtn').click();
    assert.ok(await ava.locator('#duelDialog').evaluate(d => d.open), 'the result leads back to the lobby');
    await ben.locator('#bannerBtn').click();
    assert.deepEqual([(await state(ava)).picks, (await state(ava)).ready, (await state(ben)).phase], [['goliath', 'tank', 'scorcher'], false, 'room'], 'the draft is kept, Ready is not');
    await ava.locator('#duelReady').click();
    await ben.locator('#duelReady').click();
    await until(ava, (seed) => game.match?.duel && !game.ended && game.mapSeed !== seed, a0.seed);
    await until(ben, (seed) => game.match?.duel && !game.ended && game.mapSeed !== seed, a0.seed);
    assert.equal(await ava.evaluate(() => game.mapSeed), await ben.evaluate(() => game.mapSeed));
    assert.equal(await ava.evaluate(() => document.getElementById('bannerBtn').textContent), 'Play Again', 'the result button is handed back');

    /* ---------- a fallen relay ---------- */
    await step(ava, 21); await step(ben, 21);
    await ben.evaluate(() => { game.core.takeDamage(1e9, game); game.update(0.05); });
    await until(ava, () => game.ended);
    const [aw2, bl2] = [await result(ava), await result(ben)];
    assert.deepEqual([aw2.state, aw2.r.reason, bl2.state, bl2.r.reason], ['victory', 'rival-relay', 'defeat', 'relay']);
    assert.match(aw2.text, /^Ben's relay fell\. /);
    assert.match(bl2.text, /^Your relay fell\. /);

    /* ---------- a concession, asked twice ---------- */
    const rematch = async () => {
      await ava.locator('#bannerBtn').click(); await ben.locator('#bannerBtn').click();
      await ava.locator('#duelReady').click(); await ben.locator('#duelReady').click();
      await until(ava, () => game.match?.duel && !game.ended); await until(ben, () => game.match?.duel && !game.ended);
    };
    await rematch();
    await ava.locator('#btnRestart').click();
    assert.equal(await ava.evaluate(() => game.ended), false, 'the first press only asks');
    await ava.locator('#btnRestart').click();
    await until(ben, () => game.ended);
    assert.deepEqual([(await result(ava)).r.reason, (await result(ben)).r.reason, (await result(ben)).title], ['forfeit', 'rival-forfeit', 'Duel Won']);

    /* ---------- both at once: the clocks decide ---------- */
    await rematch();
    const tie = await ava.evaluate(() => {
      const m = game.match;
      for (let i = 0; i < 440; i++) game.update(0.05);
      for (const h of game.hives) h.takeDamage(1e9, game);
      game.update(0.05);
      const mine = m.result.seconds;
      const slower = { ...m.rivalOver({ won: true, reason: 'hives', seconds: mine + 3 }) };
      const faster = { ...m.rivalOver({ won: true, reason: 'hives', seconds: mine - 3 }) };
      return { slower: [slower.won, slower.reason], faster: [faster.won, faster.reason], state: game.state, title: document.getElementById('bannerTitle').textContent };
    });
    assert.deepEqual(tie, { slower: [true, 'hives'], faster: [false, 'rival-hives'], state: 'defeat', title: 'Duel Lost' }, 'two wins in the same moment go to the faster clock');
    await until(ben, () => game.ended);

    /* ---------- a rival whose battle stands still ---------- */
    await rematch();
    await ava.evaluate(async () => { (await import('/src/config.js')).DUEL.stall = 2; });
    const stepping = setInterval(() => step(ava, 0.5).catch(() => {}), 300);   // Ava plays on; Ben's battle never moves
    await until(ava, () => game.ended);
    clearInterval(stepping);
    await until(ben, () => game.ended);
    assert.deepEqual([(await result(ava)).r.reason, (await result(ben)).r.reason, (await result(ava)).title], ['stalled', 'idle', 'Duel Won']);
    await ava.evaluate(async () => { (await import('/src/config.js')).DUEL.stall = 60; });

    /* ---------- a rival who leaves mid-match ---------- */
    await rematch();
    await ben.close();
    await until(ava, () => game.ended);
    const left = await result(ava);
    assert.deepEqual([left.r.reason, left.title], ['left', 'Duel Won']);
    assert.match(left.text, /^Ben left the duel\. /);
    assert.equal((await state(ava)).rival, null);
    assert.equal((await state(ava)).phase, 'over', 'the host keeps the room');

    /* ---------- an invite link joins on its own; leaving returns to the start screen ---------- */
    const dan = await open('Dan', `?duel=${room.code}&duelnet=local`);
    await until(dan, () => game.extras.duel.state.rival?.name === 'Ava');
    assert.ok(await dan.locator('#duelDialog').evaluate(d => d.open), 'the link opens the lobby');
    await dan.locator('#duelName').fill('Dan!!');   // a guest who came by link names themselves in the lobby
    await dan.locator('#duelName').blur();
    await until(ava, () => game.extras.duel.state.rival?.name === 'Dan');
    await ava.locator('#bannerBtn').click();
    await ava.locator('#duelLeave').click();
    const home = await ava.evaluate(() => ({ intro: !document.getElementById('intro').hidden, dialog: document.getElementById('duelDialog').open, phase: game.extras.duel.state.phase, duel: document.body.classList.contains('is-duel'),
      pause: document.getElementById('btnPause').offsetWidth > 0 || document.getElementById('btnPause').offsetParent === null }));
    assert.deepEqual([home.intro, home.dialog, home.phase, home.duel], [true, false, 'door', false], 'leaving goes back to the start screen');
    await until(dan, () => game.extras.duel.state.phase === 'door' && /Ava left/.test(document.getElementById('duelStatus').textContent));

    /* ---------- the other modes are untouched ---------- */
    await ava.locator('#introBtn').click();
    const stand = await ava.evaluate(() => {
      const g = game;
      g.togglePause(); const paused = g.paused; g.togglePause();
      document.getElementById('btnSpeed').click();
      return { match: g.match, state: g.state, squad: g.gunners.filter(u => u.kind === 'marine').length, torch: g.isUnlocked('scorcher'), trooper: g.isUnlocked('marine'), paused, speed: g.speed,
        cards: [...document.querySelectorAll('[data-build]')].filter(b => !b.hidden).length, hud: document.getElementById('duelSends').hidden && document.getElementById('duelRival').hidden,
        pause: document.getElementById('btnPause').offsetWidth > 0 };
    });
    assert.deepEqual(stand, { match: null, state: 'brief', squad: 3, torch: false, trooper: true, paused: true, speed: 2, cards: 6, hud: true, pause: true }, 'Endless mode pauses, speeds up and unlocks by round as before');
    await dan.close();

    /* ---------- without the layer ---------- */
    const bare = await context.newPage();
    bare.on('pageerror', e => errors.push(`bare: ${e.message}`));
    await bare.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await bare.route('**/src/duel.js', route => route.abort());
    await bare.goto(URL);
    await bare.waitForFunction(() => window.game?.extras?.skirmish && window.game?.extras?.opening, null, { polling: 50, timeout: 30000 });
    assert.ok(!(await bare.locator('#btnDuel').isVisible()) && !(await bare.locator('#duelInfo').isVisible()), 'no layer, no button');
    await bare.evaluate(() => { game.stage.render = () => {}; });
    await bare.locator('#introBtn').click();
    if (await bare.locator('#replaceDialog').evaluate(d => d.open)) await bare.locator('#confirmReplace').click();   // Ava's stand above was autosaved in this browser
    assert.deepEqual(await bare.evaluate(() => { for (let i = 0; i < 100; i++) game.update(0.05); return [game.state, game.gunners.length > 0, !!game.extras.duel]; }), ['wave', true, false], 'the game plays on without it');

    assert.deepEqual(errors, [], 'no page errors');
    console.log('browser-duel: all checks passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
