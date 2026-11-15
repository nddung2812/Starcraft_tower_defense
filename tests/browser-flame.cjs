// The Torch's flame: one continuous jet of fire, smoke and embers. Serve the repo on port 8765,
// then run `node tests/browser-flame.cjs [playwright-core module directory]`.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto('http://127.0.0.1:8765/');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    await page.locator('#introBtn').click();
    const r = await page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const { UNITS } = await import('/src/config.js');
      const g = game, render = g.stage.render.bind(g.stage);
      g.stage.render = () => {};
      g.reset(12345); g.level = 3; g.state = 'wave'; g.paused = false; g.minerals = 1e6; g.queue = [{ at: 9999, breed: 'zergling', lane: 0 }];
      for (const h of g.hives) h.update = () => {};
      const anchor = g.deployAnchor(), cell = g.grid.nearestOpen(Math.floor(anchor.x), Math.floor(anchor.y), 4);
      g.placeGunner('scorcher', cell.x, cell.y);
      const torch = g.gunners.at(-1), fx = g.layout.front.dx, fz = g.layout.front.dy;
      const bugs = [[1.6, 0], [2.1, 0.7], [2.2, -0.6]].map(([d, s]) => {
        const bug = new Zergling(torch.x + fx * d - fz * s, torch.z + fz * d + fx * s, 'zergling', 1, 1);
        bug.update = () => {}; bug.maxHp = bug.hp = 1e7;
        g.zerglings.push(bug); g.world.add(bug.obj);
        return bug;
      });
      const live = () => ({ fire: g.fx.p.filter(q => q.ramp).length, smoke: g.fx.p.filter(q => q.dark).length,
        embers: g.fx.p.filter(q => !q.seed).length, jets: g.fx.jets.length });
      // Let it settle into sustained fire, then watch two seconds of it frame by frame.
      for (let i = 0; i < 45; i++) g.update(1 / 30);
      const hp = bugs.map(b => b.hp);
      let least = Infinity, most = 0, gaps = 0, far = 0, nearest = Infinity, widest = 0, highest = 0, total = 0;
      for (let i = 0; i < 60; i++) {
        g.update(1 / 30);
        const now = live();
        least = Math.min(least, now.fire); most = Math.max(most, now.fire); total = Math.max(total, g.fx.p.length);
        if (now.jets !== 1) gaps++;
        for (const q of g.fx.p) {
          if (!q.ramp) continue;
          const dx = q.x - torch.x, dz = q.z - torch.z, along = dx * Math.cos(torch.yaw) + dz * Math.sin(torch.yaw);
          const side = Math.abs(-dx * Math.sin(torch.yaw) + dz * Math.cos(torch.yaw));
          far = Math.max(far, along); nearest = Math.min(nearest, Math.hypot(dx, dz)); widest = Math.max(widest, side); highest = Math.max(highest, q.y);
        }
      }
      const burning = live();
      const dealt = bugs.map((b, i) => hp[i] - b.hp);
      // What the renderer is given: fire and smoke in separate draws, sized in tiles.
      render();
      const drawn = { glow: g.fx.glow.geo.drawRange.count, dark: g.fx.dark.geo.drawRange.count, darkVisible: g.fx.dark.points.visible,
        px: g.fx.glow.points.material.uniforms.px.value, buffer: g.stage.renderer.getDrawingBufferSize(new (await import('three')).Vector2()).y,
        seeds: Array.from(g.fx.glow.fire.slice(0, g.fx.glow.n)).filter(v => v > 0).length,
        biggest: Math.max(...g.fx.p.filter(q => q.ramp).map(q => q.size)), smallest: Math.min(...g.fx.p.filter(q => q.ramp).map(q => q.size)) };
      g.stage.render = () => {};
      // Cease fire: the jet stops, what is burning dies down, and nothing is left behind.
      for (const b of bugs) { b.dead = true; g.world.remove(b.obj); }
      g.zerglings = g.zerglings.filter(b => !b.dead);
      for (let i = 0; i < 18; i++) g.update(1 / 30);
      const stopped = live();
      for (let i = 0; i < 120; i++) g.update(1 / 30);
      const cold = { ...live(), fires: g.fx.fires.length, all: g.fx.p.length };
      // A whole flame company: the particle load is shared, not multiplied.
      const more = g.layout.open.filter(([x, y]) => g.grid.buildable(x, y) && Math.hypot(x + 0.5 - torch.x, y + 0.5 - torch.z) < 5).slice(0, 19);
      for (const [x, y] of more) g.placeGunner('scorcher', x, y);
      const swarm = [];
      for (const t of g.gunners) {
        const bug = new Zergling(t.x + 1, t.z + 0.2, 'zergling', 1, 1);
        bug.update = () => {}; bug.maxHp = bug.hp = 1e7; g.zerglings.push(bug); g.world.add(bug.obj); swarm.push(bug);
      }
      let crowd = 0, crowdJets = 0;
      for (let i = 0; i < 90; i++) { g.update(1 / 30); crowd = Math.max(crowd, g.fx.p.length); crowdJets = Math.max(crowdJets, g.fx.jets.length); }
      g.fx.clear();
      return { burning, least, most, gaps, far, nearest, widest, highest, total, dealt, drawn, stopped, cold, crowd, crowdJets, torches: g.gunners.length,
        cleared: g.fx.p.length + g.fx.jets.length + g.fx.fires.length, reach: torch.attackRange, arc: UNITS.scorcher.flame.arc,
        damage: torch.stats.damage, interval: torch.stats.attackSpeed };
    });
    console.log(JSON.stringify(r));
    assert.equal(r.gaps, 0, 'One jet pours without a break between shots');
    assert.ok(r.least >= 25, `The stream never thins to a puff (${r.least} licks at its thinnest)`);
    assert.ok(r.most <= 90, `and stays within its budget (${r.most})`);
    assert.ok(r.nearest < 1, `It starts at the nozzle (${r.nearest.toFixed(2)} tiles from the Torch)`);
    assert.ok(r.far > r.reach * 0.8 && r.far < r.reach * 1.35, `and reaches about as far as it burns (${r.far.toFixed(2)} of ${r.reach})`);
    assert.ok(r.widest > 0.7 && r.widest < r.reach * Math.tan(r.arc) * 1.4, `fanning out across the cone (${r.widest.toFixed(2)})`);
    assert.ok(r.highest > 0.9 && r.highest < 3.5, 'The heat lifts the far end');
    assert.ok(r.burning.smoke >= 6 && r.burning.embers >= 3, 'Smoke rolls off it and embers fly');
    assert.ok(r.drawn.dark === r.burning.smoke && r.drawn.darkVisible && r.drawn.glow === r.burning.fire + r.burning.embers, 'Smoke is drawn apart from the glow');
    assert.equal(r.drawn.px, r.drawn.buffer / 2, 'Fire is sized against the real drawing buffer');
    assert.ok(r.drawn.seeds >= r.least && r.drawn.smallest < 0.35 && r.drawn.biggest > 0.6 && r.drawn.biggest < 2, `Licks grow from the nozzle to tile-sized billows (${r.drawn.smallest.toFixed(2)} to ${r.drawn.biggest.toFixed(2)})`);
    const shots = Math.round(2 / r.interval);
    for (const d of r.dealt) assert.ok(d >= r.damage * (shots - 2) * 0.5 && d <= r.damage * (shots + 1), `Damage is unchanged by the new look (${d})`);
    assert.equal(r.stopped.jets, 0, 'The jet stops when there is nothing left to burn');
    assert.ok(r.cold.all === 0 && r.cold.fires === 0, 'and the fire burns out');
    assert.equal(r.torches, 20);
    assert.ok(r.crowdJets >= 15 && r.crowd < 1500, `Twenty Torches share the particle budget (${r.crowd} particles)`);
    assert.equal(r.cleared, 0, 'A new map starts with no fire');
    assert.deepEqual(errors, []);
    console.log('PASS: Torch flame is one continuous jet from nozzle to reach, fans across the cone, rises, smokes and throws embers; world-sized sprites; damage unchanged; burns out; shared budget for 20 Torches.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
