/*
 * Renders assets/og.jpg, the 1200x630 picture that link previews show (og:image in index.html).
 * It stages a real battle in the real game, so rerun it after a rename or a visual change:
 *
 *   node tests/make-og-image.cjs [playwright-core dir] [out.png]
 *   sips -s format jpeg -s formatOptions 84 out.png --out assets/og.jpg     (macOS)
 *
 * Serve the repo on port 8765 first. Software WebGL is slow; give it a minute.
 */
const { chromium } = require(process.argv[2] || 'playwright-core');
const out = process.argv[3] || require('node:path').join(require('node:os').tmpdir(), 'breachline-og.png');
const URL = process.env.TEST_URL || 'http://127.0.0.1:8765/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1640, height: 800 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.game?.extras?.atmosphere, null, { polling: 50 });
    await page.addStyleTag({ content: `
      #intro, .hud, .panel, #game ~ * { visibility: hidden !important; }
      #game ~ .og-title { position: absolute; left: 0; bottom: 0; z-index: 50; visibility: visible !important; font: 800 74px/1 system-ui, sans-serif; letter-spacing: .04em; color: #eaf5ff; text-shadow: 0 4px 24px #000c, 0 0 2px #000; }
      #game ~ .og-title small { visibility: visible !important; display: block; margin-top: 14px; font: 700 27px/1 system-ui, sans-serif; letter-spacing: .3em; color: #5ad7ff; }` });
    const clip = await page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const g = game, s = g.stage;
      const real = g.update.bind(g); g.update = () => {};
      g.reset(29); g.level = 10; g.loadLevel(); g.state = 'wave'; g.paused = false; g.minerals = 1e7;
      g.assault.plan = null; g.assault.pending = false; g.crateT = 1e9; g.ambush.timer = 1e9;
      g.queue = [{ at: 1e9, breed: 'zergling', lane: 0 }];
      document.getElementById('intro').hidden = true;
      const route = g.grid.findPath(g.grid.spawn.x, g.grid.spawn.y, g.grid.core.x, g.grid.core.y);
      const at = (back) => route[Math.max(0, route.length - 1 - back)];
      const free = (cx, cy, r, used) => {
        for (let d = 0; d <= r; d++) for (let y = cy - d; y <= cy + d; y++) for (let x = cx - d; x <= cx + d; x++) {
          const key = y * 999 + x;
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === d && g.canBuildAt(x, y) && !used.has(key)) { used.add(key); return [x, y]; }
        }
        return null;
      };
      const used = new Set();
      const line = at(11), rear = at(7);
      for (let i = -3; i <= 3; i++) { const c = free(line.x + (i % 2), line.y + i, 2, used); if (c && Math.abs(i) !== 1) g.placeWall(...c); }
      const squad = ['marine', 'marine', 'goliath', 'marine', 'tank', 'scorcher', 'marine', 'goliath', 'deadeye', 'marine', 'mender', 'marine'];
      for (const kind of squad) { const c = free(rear.x, rear.y, 4, used); if (c && g.placeGunner(kind, ...c)) { const u = g.gunners.at(-1); u.spawnT = 1; if (u.upgradeCost != null) g.upgradeGunner(u); } }
      for (const back of [9, 10]) { const c = free(at(back).x, at(back).y + (back === 9 ? 2 : -2), 2, used); if (c) g.placeBunker(...c); }
      const ship = free(at(5).x, at(5).y, 3, used); if (ship && g.placeGunner('cruiser', ...ship)) g.gunners.at(-1).spawnT = 1;
      // the swarm: packed down the approach, heaviest at the front
      const breeds = ['zergling', 'zergling', 'zergling', 'warrior', 'zergling', 'hopper', 'zergling', 'needler', 'zergling', 'zergling', 'tanker', 'zergling'];
      let n = 0;
      for (let back = 14; back < 52 && n < 150; back++) {
        const p = at(back);
        for (let dy = -3; dy <= 3 && n < 150; dy++) for (let dx = -1; dx <= 1; dx += 2) {
          const x = p.x + dx * (0.2 + ((n * 7) % 5) * 0.11), y = p.y + dy;
          if (g.grid.get(Math.floor(x), y) !== 0 || (n * 13) % 4 === 0) { n += 0.25; continue; }
          const bug = new Zergling(x + 0.5, y + 0.5, back === 16 && dy === 0 && dx === 1 ? 'ultralisk' : breeds[Math.floor(n) % breeds.length], 3, 1);
          bug.spawnT = 1; g.zerglings.push(bug); g.world.add(bug.obj); n++;
        }
      }
      for (let t = 0; t < 2.1; t += 0.05) real(0.05);
      s.setQuality('high');
      const front = at(22), home = g.grid.core;
      s.focus.set(line.x * 0.7 + front.x * 0.3 + 0.5, 0, line.y * 0.7 + front.y * 0.3 + 0.5);
      s.yaw = Math.atan2(home.y - front.y, home.x - front.x) + 0.3;
      s.pitch = 0.4; s.dist = 25; s.updateCamera();
      const title = document.createElement('div');
      title.className = 'og-title'; title.innerHTML = 'BREACHLINE: 29<small>HOLD THE LINE</small>';
      document.getElementById('game').parentElement.append(title);
      const r = document.getElementById('game').getBoundingClientRect();
      const w = Math.min(r.width, 1200);
      // keep the title inside the part of the canvas that is kept
      title.style.left = `${(r.width - w) / 2 + 48}px`;
      title.style.bottom = `${Math.max(0, (r.height - 630) / 2) + 44}px`;
      return { x: r.left + (r.width - w) / 2, y: r.top + Math.max(0, (r.height - 630) / 2), width: w, height: Math.min(630, r.height), canvas: [r.width, r.height], bugs: g.zerglings.filter(z => !z.dead).length, units: g.gunners.length };
    });
    await page.waitForTimeout(9000);          // several software-rendered frames with effects settled
    await page.screenshot({ path: out, clip });
    console.log('wrote', out, JSON.stringify(clip), errors);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
