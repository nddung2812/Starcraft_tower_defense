const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const URL = process.env.TEST_URL || 'http://127.0.0.1:8765/';
const layers = () => ['opening', 'touch', 'story', 'atmosphere'].every(k => window.game?.extras?.[k]);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(URL);
    await page.waitForFunction(layers, null, { polling: 50 });

    /* ---------- the numbers and the script ---------- */
    const script = await page.evaluate(async () => {
      const { evacuated, convoySize, radioLine, resultLine, shareLine } = await import('/src/story.js');
      const lines = Array.from({ length: 60 }, (_, i) => radioLine(i + 1));
      return {
        totals: [0, 1, 2, 5, 10].map(evacuated), convoys: [1, 2, 10].map(convoySize),
        sums: [1, 2, 3, 4, 5, 6, 7].every(n => evacuated(n) === Array.from({ length: n }, (_, i) => convoySize(i + 1)).reduce((a, b) => a + b, 0)),
        allSaid: lines.every(l => typeof l === 'string' && l.length > 20 && l.length <= 96),
        firstTenDistinct: new Set(lines.slice(0, 10)).size, flank: lines[6], three: lines[15], four: lines[20],
        noRepeatInARow: lines.every((l, i) => !i || l !== lines[i - 1]),
        fell: resultLine({ level: 1, score: 3 }), held: resultLine({ level: 6, score: 123 }), one: resultLine({ level: 2, score: 9 }),
        share: shareLine({ level: 6, score: 123 }), shareEarly: shareLine({ level: 1, score: 1 })
      };
    });
    assert.deepEqual(script.totals, [0, 150, 330, 1050, 2850]);
    assert.deepEqual(script.convoys, [150, 180, 420]);
    assert.ok(script.sums && script.allSaid && script.noRepeatInARow, JSON.stringify(script));
    assert.equal(script.firstTenDistinct, 10);
    assert.match(script.flank, /more than one side/); assert.match(script.three, /three sides/); assert.match(script.four, /all around you/);
    assert.equal(script.fell, 'Outpost 29 fell before the first convoy was clear.');
    assert.equal(script.held, 'Outpost 29 has fallen, but 1,050 people got out of Ember Reach because you held for 5 rounds.');
    assert.match(script.one, /150 people got out of Ember Reach because you held for 1 round\.$/);
    assert.equal(script.share, 'BREACHLINE: 29. I held Outpost 29 for 5 rounds, stopped 123 bugs and got 1,050 people out. Same canyon, can you hold longer?');
    assert.match(script.shareEarly, /I stopped 1 bug before Outpost 29 fell/);

    /* ---------- in a run: one radio line a round, a convoy for every round held ---------- */
    await page.locator('#introBtn').click();
    const toasts = () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => [t.querySelector('b').textContent, t.querySelector('span').textContent]));
    assert.deepEqual((await toasts()).find(t => t[0] === 'Ember Control'), ['Ember Control', 'Outpost 29, this is Ember Control. The first convoy is loading. Buy us time.']);
    await page.evaluate(() => { const g = game; g.stage.render = () => {}; g.state = 'wave'; g.queue = []; g.completeWave(); });
    assert.deepEqual((await toasts()).find(t => /^Convoy/.test(t[0])), ['Convoy 1 away', '+150 people out. 150 evacuated so far.']);
    await page.evaluate(() => { game.startWave(); });
    assert.match((await toasts()).map(t => t[1]).join('|'), /Convoy one is on the road/);

    /* ---------- the result: what the stand was worth, then the score ---------- */
    await page.evaluate(() => { navigator.share = async (data) => { window.shared = data; }; });
    await page.evaluate(() => { const g = game; g.level = 6; g.kills = g.score = 123; g.onCoreDestroyed(); });
    await page.waitForFunction(() => !document.getElementById('banner').hidden);
    const first = await page.locator('#bannerText').textContent();
    assert.match(first, /^Outpost 29 has fallen, but 1,050 people got out of Ember Reach because you held for 5 rounds\. .*you killed 123 bugs/);
    await page.waitForTimeout(1500);                    // the leaderboard reply redraws the banner
    const settled = await page.locator('#bannerText').textContent();
    assert.equal(settled.match(/Outpost 29 has fallen/g).length, 1, 'Result line repeated after the leaderboard redraw');
    assert.match(settled, /you killed 123 bugs/);
    await page.locator('#btnChallenge').click();
    await page.waitForFunction(() => window.shared);
    const shared = await page.evaluate(() => window.shared);
    assert.equal(shared.text, script.share);
    assert.match(shared.url, /seed=\d+&vs=Commander&kills=123/);

    /* ---------- sky and time of day ---------- */
    const sky = await page.evaluate(() => {
      const g = game, a = g.extras.atmosphere, s = g.stage, hex = c => c.getHex();
      const read = (level) => {
        g.level = level; g.emit('change');
        return { id: a.phase.id, bg: hex(s.scene.background), fog: hex(s.scene.fog.color), sun: hex(s.sun.color), power: s.sun.intensity, sky: hex(a.lights.sky.color) };
      };
      g.reset(99);
      const phases = [1, 3, 4, 6, 7, 9, 10, 12, 13].map(read);
      const meshes = a.backdrop.children;
      s.focus.set(20, 0, 30); s.updateCamera(); delete s.render; s.render();
      const follows = Math.abs(a.backdrop.position.x - s.camera.position.x) < 1e-6 && Math.abs(a.backdrop.position.z - s.camera.position.z) < 1e-6 &&
        Math.abs(meshes[0].position.y - s.camera.position.y) < 1e-6;
      // The ground and the map's own meshes must still end at the map edge.
      const { cols, rows } = s;
      const inScene = s.scene.children.includes(a.backdrop);
      return { phases, follows, inScene, cols, rows,
        backdrop: meshes.map(m => [m.renderOrder < 0, m.material.depthWrite, m.material.depthTest, m.material.fog, m.castShadow, m.frustumCulled]),
        reach: Math.max(...meshes.map(m => { m.geometry.computeBoundingSphere(); return m.geometry.boundingSphere.radius; })) < s.camera.far };
    });
    assert.deepEqual(sky.phases.map(p => p.id), ['afternoon', 'afternoon', 'dusk', 'dusk', 'night', 'night', 'dawn', 'dawn', 'afternoon']);
    // Rounds 1-3 keep the lighting the game has always had.
    assert.deepEqual([sky.phases[0].bg, sky.phases[0].fog, sky.phases[0].sun, sky.phases[0].power, sky.phases[0].sky], [0x0a0f16, 0x0a0f16, 0xffe0b4, 2.2, 0xa5c7e8]);
    assert.equal(new Set(sky.phases.slice(0, 8).filter((_, i) => i % 2 === 0).map(p => p.sun)).size, 4, 'Each phase needs its own light');
    assert.ok(sky.phases.every(p => p.bg === p.fog), 'Fog and sky must share the haze colour');
    assert.ok(sky.phases.every(p => p.power >= 1.8 && p.power <= 2.3), 'A phase is too dark or too bright to read units');
    assert.ok(sky.follows && sky.inScene && sky.reach, JSON.stringify(sky));
    assert.deepEqual(sky.backdrop, Array(3).fill([true, false, false, false, false, false]));

    /* ---------- a missing layer costs only that layer ---------- */
    const bare = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const bareErrors = [], warnings = [];
    bare.on('pageerror', e => bareErrors.push(e.message));
    bare.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
    await bare.route('**/src/story.js', route => route.abort());
    await bare.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await bare.goto(URL);
    await bare.waitForFunction(() => window.game?.extras?.opening && window.game.extras.atmosphere && window.game.extras.touch, null, { polling: 50 });
    await bare.locator('#introBtn').click();
    const survived = await bare.evaluate(() => { const g = game; g.stage.render = () => {}; for (let i = 0; i < 80; i++) g.update(0.05); g.level = 3; g.onCoreDestroyed(); return { story: !!g.extras.story, state: g.state, squad: g.gunners.length }; });
    await bare.waitForFunction(() => !document.getElementById('banner').hidden);
    assert.deepEqual(survived, { story: false, state: 'defeat', squad: 3 });
    assert.match(await bare.locator('#bannerText').textContent(), /^Commander, you killed/);
    assert.ok(warnings.some(w => /\[extras\] story unavailable/.test(w)), warnings.join('|'));
    assert.deepEqual(bareErrors, []);

    assert.deepEqual(errors, []);
    console.log('PASS: evacuation totals, sixty radio lines, round toast, convoy toast, result line once, share text, four light phases with rounds 1-3 unchanged, camera-following backdrop, and a game that still runs with a layer missing');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
