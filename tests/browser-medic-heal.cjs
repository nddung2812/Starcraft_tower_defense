// The Medic heals at half its old pace and shows a glow in its hands instead of firing a beam at its patient.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345'); await page.waitForFunction(() => window.game);
    await page.locator('#introBtn').click();
    const r = await page.evaluate(async () => {
      const { Vector3 } = await import('three');
      const { MENDER_TIERS } = await import('/src/config.js');
      const g = game, out = {};
      g.stage.render = () => {}; g.paused = false; g.level = 6; g.minerals = 9000;
      const ally = g.gunners[0];
      let spot = null;
      for (let r = 1; r < 5 && !spot; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
        if (g.canBuildAt(ally.tx + dx, ally.ty + dy)) { spot = [ally.tx + dx, ally.ty + dy]; break; }
      }
      out.placed = g.placeGunner('mender', spot[0], spot[1]);
      const medic = g.gunners.at(-1);
      g.state = 'wave'; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; g.zerglings.length = 0;
      out.rates = MENDER_TIERS.map(t => t.attackSpeed);

      // ---- nobody hurt: no glow ----
      for (let i = 0; i < 30; i++) g.update(0.05);
      out.idle = medic.healAura.some(s => s.visible);

      // ---- healing: a glow on each hand, and nothing drawn between the Medic and its patient ----
      ally.hp = 10;
      const links = []; const link = g.fx.link.bind(g.fx); g.fx.link = (...a) => { links.push(a); return link(...a); };
      const beamsBefore = g.fx.beams.length;
      let elapsed = 0, heals = 0, last = ally.hp;
      while (ally.hp < ally.maxHp && elapsed < 30) {
        g.update(0.05); elapsed += 0.05;
        if (ally.hp > last) { heals++; last = ally.hp; }
        if (heals === 2 && out.glows === undefined) {
          out.glows = medic.healAura.filter(s => s.visible).length;
          medic.obj.updateMatrixWorld(true);
          out.onHands = medic.healHands.every((hand, i) => medic.healAura[i].getWorldPosition(new Vector3()).distanceTo(hand.getWorldPosition(new Vector3())) < 0.02);
        }
      }
      out.heals = heals; out.elapsed = elapsed; out.healed = ally.hp - 10; out.max = ally.maxHp;
      out.links = links.length;
      out.beams = g.fx.beams.length - beamsBefore;
      out.handNames = medic.healHands.map(h => h.name);

      // ---- a silenced Medic, or one with no patient, goes dark ----
      ally.hp = 10; g.update(0.05); medic.silenceT = 5; g.update(0.05); out.silenced = medic.healAura.some(s => s.visible); medic.silenceT = 0;
      ally.hp = ally.maxHp; for (let i = 0; i < 4; i++) g.update(0.05);
      out.done = medic.healAura.some(s => s.visible);
      return out;
    });
    assert.equal(r.placed, true);
    assert.deepEqual(r.rates, [1.6, 1.4], 'Half the old heal rate');
    assert.equal(r.idle, false, 'No glow with nobody to heal');
    assert.equal(r.max, 70);
    assert.equal(r.heals, 5, 'Five heals of 12 take a Trooper from 10 to 70');
    assert.equal(r.healed, 60);
    assert.ok(r.elapsed > 6 && r.elapsed < 8, `Four 1.6 s gaps between five heals, took ${r.elapsed.toFixed(1)} s`);
    assert.equal(r.links, 0, 'No line is drawn to the patient');
    assert.equal(r.beams, 0, 'No beam is drawn to the patient');
    assert.equal(r.glows, 2, 'One glow per hand');
    assert.equal(r.onHands, true, 'The glow sits on the hand');
    assert.deepEqual(r.handNames, ['Middle1L', 'Middle1R']);
    assert.equal(r.silenced, false, 'A silenced Medic does not glow');
    assert.equal(r.done, false, 'The glow ends when the healing does');
    assert.deepEqual(errors, []);
    console.log('PASS: half heal rate, same heal size, glow on both hands, no beam, off when idle or silenced', { seconds: +r.elapsed.toFixed(1) });
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
