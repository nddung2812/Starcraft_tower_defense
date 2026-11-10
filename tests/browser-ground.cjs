const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto('http://127.0.0.1:8765/');
    const results = await page.evaluate(async () => {
      const { Grid } = await import('/src/grid.js');
      const { Marine } = await import('/src/entities.js');
      const { CELL } = await import('/src/config.js');
      const check = (ok, message) => { if (!ok) throw Error(message); };
      const fixture = () => {
        const grid = new Grid(8, 7);
        const tank = new Marine('tank', 4, 3, []);
        grid.set(4, 3, CELL.TOWER, tank);
        return { grid, tank };
      };

      // An occupied arrival tile has an isolated opening across a rock strip
      // (lakes and mountains both use ROCK) and a reachable opening to its east.
      const g = fixture(), tank = g.tank;
      g.grid.set(2, 1, CELL.OPEN);
      g.grid.set(5, 3, CELL.TOWER, {});
      g.grid.set(6, 3, CELL.OPEN);
      g.grid.set(4, 3, CELL.TOWER, {});
      tank.driving = true;
      tank.finishMove(g);
      check(tank.x === 4.5 && tank.z === 3.5, 'Tank teleported while resolving an occupied destination');
      check(tank.driving && tank.goalTx === 6 && tank.goalTy === 3, 'Tank did not choose a reachable destination');
      for (let i = 0; i < 100 && tank.driving; i++) {
        const x = tank.x, z = tank.z;
        tank.stepMove(0.05, g);
        check(Math.hypot(tank.x - x, tank.z - z) < 0.08, 'Tank jumped between tiles');
        check(g.grid.clearWalkLine(x, z, tank.x, tank.z), 'Tank crossed blocked terrain');
      }
      check(g.grid.occupant(6, 3) === tank, 'Tank did not arrive and occupy its new tile');
      check(!tank.orderMove(3, 3, g), 'Tank accepted a rock destination');
      check(!tank.orderMove(2, 1, g), 'Tank accepted an unreachable opening');

      // A structure placed after an order must cause a detour, even on a long frame.
      const route = fixture();
      for (let x = 4; x <= 6; x++) {
        route.grid.set(x, 2, CELL.OPEN);
        if (x !== 4) route.grid.set(x, 3, CELL.OPEN);
      }
      check(route.tank.orderMove(6, 3, route), 'Initial movement order failed');
      route.grid.set(5, 3, CELL.WALL, {});
      for (let i = 0; i < 30 && route.tank.driving; i++) {
        const x = route.tank.x, z = route.tank.z;
        route.tank.stepMove(1, route);
        check(route.grid.clearWalkLine(x, z, route.tank.x, route.tank.z), 'Tank crossed a newly blocked route');
      }
      check(route.grid.occupant(6, 3) === route.tank, 'Tank failed to detour around a new wall');

      const corners = new Grid(4, 4);
      corners.set(1, 1, CELL.OPEN); corners.set(2, 2, CELL.OPEN);
      check(!corners.clearWalkLine(1.5, 1.5, 2.5, 2.5), 'Ground movement cuts a solid corner');
      check(!corners.clearWalkLine(0.2, 0.2, 0.8, 0.8), 'Blocked movement within one tile was accepted');
      const falcon = new Marine('falcon', 1, 1, []);
      check(falcon.orderMove(3, 3, { grid: corners }), 'Aircraft lost its terrain movement');
      for (let i = 0; i < 30 && falcon.driving; i++) falcon.stepMove(0.1, { grid: corners });
      check(falcon.x === 3.5 && falcon.z === 3.5, 'Aircraft did not cross terrain');
      return { occupiedDestination: true, blockedOrders: true, dynamicDetour: true, solidCorners: true, flight: true };
    });
    assert.ok(Object.values(results).every(Boolean));
    console.log('PASS: ground terrain collision and reachable arrival placement', results);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
