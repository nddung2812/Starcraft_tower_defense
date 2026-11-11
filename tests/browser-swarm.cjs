const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/');
    const result = await page.evaluate(async () => {
      const { Grid } = await import('/src/grid.js');
      const { Zergling } = await import('/src/entities.js');
      const { indexSwarm, swarmStepClear } = await import('/src/swarm.js');
      const { carveLevel } = await import('/src/levels.js');
      const { CELL } = await import('/src/config.js');
      const check = (ok, message) => { if (!ok) throw Error(message); };
      const bug = (x, z, i) => Object.assign(Object.create(Zergling.prototype), {
        x, z, yaw: 0, speed: 2.4, scale: 0.6, packPhase: i * 2.39996, packTime: 0,
        stuckT: 0, gait: 0, repathIn: 0, pathVersion: -1, path: null, wp: 0
      });
      const fixture = grid => ({ grid, zerglings: [], fx: { spawn() {}, decal() {} } });
      const grid = new Grid(60, 15); grid.cells.fill(CELL.OPEN);
      const pack = fixture(grid);
      pack.zerglings = Array.from({ length: 16 }, (_, i) => bug(4 - i * 0.13, 7.5, i));
      for (let tick = 0; tick < 160; tick++) {
        pack.swarmIndex = indexSwarm(pack.zerglings);
        for (const b of pack.zerglings) b.steer(55, 7.5, 0.05, pack, false);
      }
      const spread = Math.max(...pack.zerglings.map(b => b.z)) - Math.min(...pack.zerglings.map(b => b.z));
      check(spread > 2, `Pack remained in single file: ${spread}`);
      check(pack.zerglings.every(b => b.x > 15), 'Pack lost forward progress');
      const air = bug(5, 5, 1); air.flying = true;
      grid.set(6, 5, CELL.ROCK);
      check(swarmStepClear(air, 8, 5, grid), 'Flyers cannot cross terrain');
      check(!swarmStepClear(bug(5, 5.5, 1), 8, 5.5, grid), 'Long step tunneled through a rock');
      grid.set(6, 5, CELL.WALL);
      check(!swarmStepClear(bug(5, 5.5, 1), 8, 5.5, grid), 'Long step tunneled through a wall');
      grid.set(6, 5, CELL.BUNKER);
      check(!swarmStepClear(bug(5, 5.5, 1), 8, 5.5, grid), 'Long step tunneled through a bunker');
      check(swarmStepClear(bug(6.5, 5.5, 0), 6.6, 5.5, grid), 'Newly built defender traps a bug inside its tile');
      const corners = new Grid(4, 4); corners.set(1, 1, CELL.OPEN); corners.set(2, 2, CELL.OPEN);
      check(!swarmStepClear(bug(1.5, 1.5, 0), 2.5, 2.5, corners), 'Diagonal corner cut');
      let reached = 0;
      for (const level of [1, 6, 16, 30]) for (const seed of [12345, 7741]) {
        const layout = carveLevel(level, seed), map = new Grid(layout.cols, layout.rows); map.load(layout);
        const g = fixture(map);
        for (const sp of map.spawns) for (let i = 0; i < 6; i++) g.zerglings.push(bug(sp.x + 0.5, sp.y + 0.5 + i * 0.025, i));
        for (let tick = 0; tick < 2800 && g.zerglings.some(b => !b.arrived); tick++) {
          g.swarmIndex = indexSwarm(g.zerglings);
          for (const b of g.zerglings) {
            if (b.arrived) continue;
            b.repathIn -= 0.05;
            if (!b.path || b.repathIn <= 0) b.repath(g);
            const oldX = b.x, oldZ = b.z;
            b.advance(0.05, g);
            check(map.get(Math.floor(b.x), Math.floor(b.z)) !== CELL.ROCK, 'Bug entered rock');
            check(Math.hypot(b.x - oldX, b.z - oldZ) <= 0.121, 'Bug teleported');
            const node = b.path?.[b.wp];
            if (node && map.get(node.cx, node.cy) === CELL.CORE && Math.hypot(b.x - node.x, b.z - node.y) < 1.35) {
              b.arrived = true; b.dead = true; reached++;
            }
          }
        }
        const stuck = g.zerglings.filter(b => !b.arrived);
        check(!stuck.length, `Unreached base level ${level}, seed ${seed}: ${JSON.stringify(stuck.map(b => ({x:b.x,z:b.z,wp:b.wp,path:b.path})))}`);
      }
      return { spread, reached, collision: true };
    });
    assert.ok(result.reached > 100); console.log('PASS: natural pack spread, forward progress, terrain sweeps, and seeded canyon traversal', result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
