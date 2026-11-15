// The Hammer's all-terrain driving on real maps. Serve the repo on port 8765, then run
// `node tests/browser-tank.cjs [playwright-core module directory]`.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto('http://127.0.0.1:8765/');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    await page.locator('#introBtn').click();

    // 1. A move order between two canyon tiles that are close over the rock and far by road.
    const move = await page.evaluate(async () => {
      const { UNITS, CELL } = await import('/src/config.js');
      const g = game, off = UNITS.tank.offroad;
      window.__render = g.stage.render; g.stage.render = () => {};
      g.reset(11); g.level = 7; g.loadLevel(); g.state = 'build'; g.paused = false; g.minerals = 100000;
      const grid = g.grid, open = g.layout.open.filter(([x, y]) => grid.buildable(x, y));
      // The pair with the biggest saving, sampled across the map.
      let best = null;
      for (let i = 0; i < open.length; i += 5) for (let j = i + 3; j < open.length; j += 7) {
        const [ax, ay] = open[i], [bx, by] = open[j];
        const gap = Math.hypot(ax - bx, ay - by);
        if (gap < 6 || gap > 14) continue;
        const walk = grid.walkRoute(ax, ay, bx, by);
        if (!walk || walk.length < gap * 1.8) continue;
        if (!best || walk.length - gap > best.walk.length - best.gap) best = { a: [ax, ay], b: [bx, by], gap, walk };
      }
      if (!best) throw Error('No ridge between two canyon tiles on this map');
      const [ax, ay] = best.a, [bx, by] = best.b;
      if (!g.placeGunner('tank', ax, ay)) throw Error('Cannot place the tank');
      const tank = g.gunners.at(-1);
      const beside = grid.nearestOpen(ax, ay, 3);
      g.placeGunner('marine', beside.x, beside.y);
      const marine = g.gunners.at(-1);
      window.__fix = { a: best.a, b: best.b, beside: [beside.x, beside.y] };

      g.commandMove([tank], bx, by);
      const route = tank.waypoints.slice();
      const rockTiles = route.filter(p => grid.get(p.cx, p.cy) === CELL.ROCK).length;
      // The marine is sent to the same place and must keep to the canyon floor.
      marine.orderMove(...[grid.nearestOpen(bx, by, 3, new Set([grid.idx(bx, by)]))].map(s => [s.x, s.y])[0], g);
      const marineRock = marine.waypoints.filter(p => grid.get(p.cx, p.cy) !== CELL.OPEN && grid.get(p.cx, p.cy) !== CELL.TOWER).length;
      const marineLength = marine.waypoints.length;

      let seconds = 0, peak = 0, tilt = 0, onRock = 0, bad = 0, slowest = Infinity, rockDistance = 0;
      while (tank.driving && seconds < 400) {
        const before = { x: tank.x, z: tank.z };
        g.update(0.05); seconds += 0.05;
        const cx = Math.floor(tank.x), cz = Math.floor(tank.z), cell = grid.get(cx, cz);
        if (cell === CELL.ROCK) {
          onRock++;
          if (grid.ground.solid[grid.idx(cx, cz)]) bad++;
          const speed = Math.hypot(tank.x - before.x, tank.z - before.z) / 0.05;
          rockDistance += speed * 0.05;
          if (speed > 0.01) slowest = Math.min(slowest, speed);
          if (Math.abs(tank.obj.position.y - g.heightAt(tank.x, tank.z)) > 0.9) bad++;
        } else if (cell !== CELL.OPEN && cell !== CELL.TOWER) bad++;
        peak = Math.max(peak, tank.obj.position.y);
        tilt = Math.max(tilt, Math.abs(tank.model.rotation.z), Math.abs(tank.model.rotation.x));
      }
      for (let i = 0; i < 20; i++) g.update(0.05);
      return {
        gap: best.gap, walkLength: best.walk.length, routeLength: route.length, rockTiles, marineRock, marineLength,
        seconds, peak, tilt, onRock, bad, slowest, rockSpeed: rockDistance / (onRock * 0.05), roadSpeed: tank.stats.moveSpeed, off,
        placed: tank.isPlaced(g), at: [tank.tx, tank.ty], want: best.b, owner: grid.occupant(bx, by) === tank,
        restY: tank.obj.position.y, restTilt: Math.abs(tank.model.rotation.z) + Math.abs(tank.model.rotation.x)
      };
    });
    console.log('Move over the ridge:', JSON.stringify(move));
    assert.ok(move.rockTiles >= 3, 'The tank route leaves the canyon');
    assert.ok(move.routeLength < move.walkLength * 0.7, 'and is much shorter than the canyon road');
    assert.equal(move.marineRock, 0, 'A Trooper keeps to the canyon floor');
    assert.ok(move.marineLength > move.routeLength, 'so its walk is longer');
    assert.equal(move.bad, 0, 'Never through a boulder, a spire or a building, and always seated on the ground');
    assert.ok(move.onRock > 20 && move.peak > 0.5, `The tank climbs (${move.peak.toFixed(2)} tiles up)`);
    assert.ok(move.tilt > 0.1 && move.tilt <= 0.9 + 1e-9, 'and leans with the slope');
    assert.ok(move.rockSpeed < move.roadSpeed * move.off.rock, `Rock is slower than road (${move.rockSpeed.toFixed(2)} of ${move.roadSpeed} tiles a second)`);
    assert.ok(move.rockSpeed > move.roadSpeed * 0.5 && move.slowest > move.roadSpeed * 0.2, 'but never a crawl');
    assert.ok(move.seconds < (move.walkLength - 1) / move.roadSpeed * 0.8, `Arrives well before the road would allow (${move.seconds.toFixed(1)} s)`);
    assert.ok(move.placed && move.owner && move.at[0] === move.want[0] && move.at[1] === move.want[1], 'Parks on the ordered tile and owns it');
    assert.ok(move.restY < 0.01 && move.restTilt < 0.02, 'Sits flat on the canyon floor again');

    // 2. On the ridge: selectable where it is drawn, out of the Maw's reach, and Stop brings it down.
    const ridge = await page.evaluate(async () => {
      const { CELL } = await import('/src/config.js');
      const THREE = await import('three');
      const g = game, grid = g.grid, tank = g.gunners.find(u => u.kind === 'tank');
      g.emit('selectOnly', null);
      g.commandMove([tank], ...window.__fix.a);
      let guard = 0;
      while (!(tank.offGround(g) && tank.obj.position.y > 0.8) && guard++ < 4000) g.update(0.05);
      if (!tank.offGround(g)) throw Error('Tank never left the canyon on the way back');
      const high = { y: tank.obj.position.y, driving: tank.driving, exposed: g.gunners.filter(u => !u.dead && !u.flying && u.spec.mobile && !u.offGround(g)).includes(tank) };
      // The Maw picks only among units it can reach.
      g.level = 99; g.state = 'wave'; g.queue = [{ at: 9999, breed: 'zergling', lane: 0 }];
      const others = g.gunners.filter(u => u !== tank); g.gunners = [tank];
      g.ambush.timer = 0; g.ambush.update(0.05);
      high.marks = g.ambush.marks.length;
      g.gunners = [tank, ...others]; g.ambush.clearMarks(); g.state = 'build'; g.queue = [];
      g.stage.render = window.__render; g.stage.shake = 0; g.stage.focus.set(tank.x, 0, tank.z); g.stage.updateCamera(); g.stage.render();
      const p = new THREE.Vector3(tank.x, tank.obj.position.y + 0.4, tank.z).project(g.camera);
      const flat = new THREE.Vector3(tank.x, 0.4, tank.z).project(g.camera);
      const r = document.getElementById('game').getBoundingClientRect();
      const px = v => ({ x: r.left + (v.x + 1) * r.width / 2, y: r.top + (1 - v.y) * r.height / 2 });
      return { ...high, point: px(p), ground: px(flat) };
    });
    assert.equal(ridge.exposed, false, 'A tank on the rock is not open ground');
    assert.equal(ridge.marks, 0, 'The Tunnel Maw does not come up through a mountain');
    assert.ok(Math.hypot(ridge.point.x - ridge.ground.x, ridge.point.y - ridge.ground.y) > 12, 'The tank is drawn well away from its ground tile');
    await page.mouse.click(ridge.point.x, ridge.point.y);
    assert.equal(await page.evaluate(() => game.selected?.kind), 'tank', 'Clicking the tank where it is drawn selects it');

    const stopped = await page.evaluate(async () => {
      const { CELL } = await import('/src/config.js');
      const g = game, grid = g.grid, tank = g.gunners.find(u => u.kind === 'tank');
      g.stage.render = () => {};
      const from = { x: tank.x, z: tank.z };
      g.commandStop([tank]);
      let guard = 0, bad = 0;
      while (!tank.isPlaced(g) && guard++ < 4000) {
        g.update(0.05);
        const c = grid.get(Math.floor(tank.x), Math.floor(tank.z));
        if (c === CELL.ROCK && grid.ground.solid[grid.idx(Math.floor(tank.x), Math.floor(tank.z))]) bad++;
      }
      const owners = g.gunners.filter(u => u.isPlaced(g));
      return { placed: tank.isPlaced(g), cell: grid.get(tank.tx, tank.ty) === CELL.TOWER, y: tank.obj.position.y, bad,
        drove: Math.hypot(tank.x - from.x, tank.z - from.z), order: tank.order,
        unique: new Set(owners.map(u => grid.idx(u.tx, u.ty))).size === owners.length };
    });
    console.log('Stop on the ridge:', JSON.stringify(stopped));
    assert.ok(stopped.placed && stopped.cell && stopped.unique && stopped.bad === 0, 'Stop drives it down to a free tile of its own');
    assert.ok(stopped.y < 0.01 && stopped.drove > 0.5 && stopped.drove < 12, 'the nearest one, not the far end of the order');
    assert.equal(stopped.order, null);

    // 3. Attack: the quickest way to get the guns on the hive, and it holds a ridge to shoot from.
    const attack = await page.evaluate(async () => {
      const { UNITS, CELL } = await import('/src/config.js');
      const { Zergling } = await import('/src/entities.js');
      const g = game, off = UNITS.tank.offroad;
      const price = (grid, route) => {
        let t = 0;
        for (let i = 1; i < route.length; i++) {
          const a = route[i - 1], b = route[i];
          const pace = p => Math.min(grid.drivePace(p.cx, p.cy, off), i === 1 && p === a ? 1.4 : Infinity);
          const climb = Math.abs(grid.ground.height[grid.idx(b.cx, b.cy)] - grid.ground.height[grid.idx(a.cx, a.cy)]) * off.climb;
          t += (Math.hypot(b.cx - a.cx, b.cy - a.cy) + climb) * (pace(a) + pace(b)) / 2;
        }
        return t;
      };
      // Find a round where going over the rock clearly beats the canyon for a tank parked by the base.
      const stage = (level, seed) => {
        g.reset(seed); g.level = level; g.loadLevel();
        g.state = 'wave'; g.paused = false; g.minerals = 100000; g.queue = [{ at: 9999, breed: 'zergling', lane: 0 }];
        const grid = g.grid, anchor = g.deployAnchor();
        const cell = grid.nearestOpen(Math.floor(anchor.x), Math.floor(anchor.y), 6);
        if (!cell || !grid.buildable(cell.x, cell.y) || !g.placeGunner('tank', cell.x, cell.y)) return null;
        const tank = g.gunners.at(-1), hive = g.advanceTarget(tank), reach = tank.attackRange * 0.9;
        const drive = grid.driveAttackRoute(cell.x, cell.y, hive.x, hive.z, reach, off);
        const walk = grid.attackRoute(cell.x, cell.y, hive.x, hive.z, reach);
        return { level, seed, saving: 1 - price(grid, drive) / price(grid, walk), drive: drive.length, walk: walk.length,
          rock: drive.filter(p => grid.get(p.cx, p.cy) === CELL.ROCK).length,
          predicted: price(grid, drive) / tank.stats.moveSpeed, walkSeconds: price(grid, walk) / tank.stats.moveSpeed };
      };
      // The round in the sample where going over the rock beats the canyon by most, for a tank parked at the defence line.
      let found = null;
      for (const [level, seed] of [[7, 11], [9, 4242], [12, 99], [6, 2024], [8, 3], [16, 31337], [3, 777], [1, 12345], [10, 8], [14, 61]]) {
        const option = stage(level, seed);
        if (option && option.rock && (!found || option.saving > found.saving)) found = option;
      }
      if (!found || found.saving < 0.04) throw Error('No round in the sample offers a mountain shortcut to the hive');
      stage(found.level, found.seed);
      const grid = g.grid, tank = g.gunners.at(-1), hive = g.advanceTarget(tank);
      for (const h of g.hives) { h.update = () => {}; h.maxHp = h.hp = 1e9; }
      const sent = g.commandAdvanceArmy();
      const end = tank.waypoints.at(-1);
      let seconds = 0, onRock = 0, bad = 0, peak = 0;
      while (tank.distTo(hive) > tank.attackRange && seconds < 600) {
        g.update(0.05); seconds += 0.05;
        const cx = Math.floor(tank.x), cz = Math.floor(tank.z), c = grid.get(cx, cz);
        if (c === CELL.ROCK) { onRock++; if (grid.ground.solid[grid.idx(cx, cz)]) bad++; }
        else if (c !== CELL.OPEN && c !== CELL.TOWER) bad++;
        peak = Math.max(peak, tank.obj.position.y);
      }
      const hp = hive.hp;
      for (let i = 0; i < 200; i++) g.update(0.05);
      const result = { ...found, sent, seconds, onRock, bad, peak, order: tank.order?.type, fired: hp - hive.hp,
        endOpen: [CELL.OPEN, CELL.TOWER].includes(grid.get(end.cx, end.cy)), endInRange: Math.hypot(end.x - hive.x, end.y - hive.z) <= tank.attackRange * 0.9 + 1e-6 };

      // Holding a ridge: an attack order on a bug that comes into range while the tank is up there.
      g.reset(11); g.level = 7; g.loadLevel(); g.state = 'wave'; g.paused = false; g.minerals = 100000; g.queue = [{ at: 9999, breed: 'zergling', lane: 0 }];
      for (const h of g.hives) h.update = () => {};
      const [ax, ay] = window.__fix.a, [bx, by] = window.__fix.b;
      g.placeGunner('tank', ax, ay);
      const t2 = g.gunners.at(-1);
      g.commandMove([t2], bx, by);
      let guard = 0;
      while (!(t2.offGround(g) && t2.obj.position.y > 0.8) && guard++ < 4000) g.update(0.05);
      const bug = new Zergling(bx + 0.5, by + 0.5, 'zergling', 1, 1);
      bug.update = () => {}; bug.maxHp = bug.hp = 1e6;
      g.zerglings.push(bug); g.world.add(bug.obj);
      g.commandAttack([t2], bug);
      guard = 0;
      while (t2.distTo(bug) > t2.attackRange * 0.9 && guard++ < 4000) g.update(0.05);
      const inRange = t2.distTo(bug) <= t2.attackRange * 0.9 && t2.offGround(g);
      const held = { x: t2.x, z: t2.z };
      for (let i = 0; i < 160; i++) g.update(0.05);
      const hold = { inRange, moved: Math.hypot(t2.x - held.x, t2.z - held.z), offGround: t2.offGround(g), damage: 1e6 - bug.hp, order: t2.order?.type };
      bug.hp = 1; bug.takeDamage(50, g, 0, true);
      guard = 0;
      while (!t2.isPlaced(g) && guard++ < 4000) g.update(0.05);
      hold.after = { placed: t2.isPlaced(g), y: t2.obj.position.y, order: t2.order };
      return { attack: result, hold };
    });
    console.log('Attack:', JSON.stringify(attack.attack));
    console.log('Hold:', JSON.stringify(attack.hold));
    const a = attack.attack;
    assert.equal(a.sent, 1);
    assert.equal(a.order, 'advance', 'Attack keeps its order');
    assert.ok(a.endOpen && a.endInRange, 'The route ends on a free tile with the hive in range');
    assert.ok(a.onRock > 10 && a.peak > 0.05 && a.bad === 0, 'It leaves the canyon for the rock, round every boulder');
    assert.ok(a.seconds < a.walkSeconds * 0.99, `and gets its guns on the hive sooner than the canyon allows (${a.seconds.toFixed(1)} s vs ${a.walkSeconds.toFixed(1)} s)`);
    assert.ok(Math.abs(a.seconds - a.predicted) < a.predicted * 0.15 + 2, `close to the time the route was priced at (${a.predicted.toFixed(1)} s)`);
    assert.ok(a.fired > 0, 'Then it shells the hive');
    const h = attack.hold;
    assert.ok(h.inRange, 'Fixture: the bug comes into range while the tank is still on the ridge');
    assert.ok(h.moved < 0.6 && h.offGround && h.damage > 0 && h.order === 'attack', 'A tank with the range from a ridge fires from there');
    assert.ok(h.after.placed && h.after.y < 0.01 && h.after.order === null, 'and drives down to dig in once the target is gone');

    assert.deepEqual(errors, []);
    console.log('PASS: Hammer crosses mountains on move and Attack orders, leans and slows on the rock, stays clear of boulders, is selectable on a ridge, is safe from the Maw up there, holds a ridge to fire, and parks on a free tile.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
