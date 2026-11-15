const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    await page.locator('#introBtn').click();
    const result = await page.evaluate(async () => {
      const T = await import('three');
      const { makeModel, loadedModels } = await import('/src/assets.js');
      const { Zergling } = await import('/src/entities.js');
      const check = (ok, message) => { if (!ok) throw Error(message); };
      const g = game, out = {};
      const stats = (model) => {
        let meshes = 0, tris = 0, bad = 0; const geos = new Set();
        model.traverse(o => {
          if (!o.isMesh) return;
          meshes++; geos.add(o.geometry);
          const p = o.geometry.attributes.position;
          tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
          for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) bad++;
        });
        model.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(model, true), size = box.getSize(new T.Vector3());
        return { meshes, tris, bad, geos, minY: box.min.y, size };
      };
      // The four ground strains share one kit: few draw calls, shared geometry, feet on the ground, distinct outlines.
      const outlines = [];
      for (const kind of ['zergling', 'hopper', 'warrior', 'tanker']) {
        check(!loadedModels().includes(kind), `${kind}: this test covers the built-in model`);
        const a = makeModel(kind), b = makeModel(kind), sa = stats(a), sb = stats(b);
        check(a.userData.swarm?.strain === kind && typeof a.userData.swarm.pose === 'function', `${kind}: no swarm rig`);
        check(sa.bad === 0, `${kind}: broken geometry`);
        check(sa.meshes <= 16 && sa.tris <= 3600, `${kind}: too heavy (${sa.meshes} meshes, ${sa.tris} triangles)`);
        check([...sa.geos].every(geo => sb.geos.has(geo)), `${kind}: geometry is rebuilt for every bug`);
        check(Math.abs(sa.minY) < 0.035, `${kind}: feet are not on the ground (${sa.minY.toFixed(3)})`);
        check(sa.size.x > 0.8 && sa.size.x < 1.9 && sa.size.z > 0.45 && sa.size.z < 1.3 && sa.size.y > 0.3, `${kind}: wrong size ${sa.size.toArray().map(v => v.toFixed(2))}`);
        outlines.push(sa.size.toArray().map(v => v.toFixed(2)).join('x'));
        out[kind] = `${sa.meshes} meshes, ${Math.round(sa.tris)} triangles`;
      }
      check(new Set(outlines).size === 4, `Strains share an outline: ${outlines}`);
      check(!!makeModel('tanker').userData.sac && !makeModel('zergling').userData.sac, 'Only the Corroder carries an acid sac');
      // Posing: legs stride, the bite lunges, a leap tucks the legs, and nothing drifts between calls.
      const pose = (model, p) => { model.userData.swarm.pose(p); model.updateMatrixWorld(true); const v = []; model.traverse(o => { if (o !== model) v.push(...o.rotation.toArray().slice(0, 3), o.position.y); }); return v; };
      const differs = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 1e-3);
      const m = makeModel('hopper');
      const rest = pose(m, {}), stride = pose(m, { gait: 1.2, run: 1 }), bite = pose(m, { swing: 1 }), leap = pose(m, { air: true });
      check(differs(rest, stride) && differs(rest, bite) && differs(rest, leap) && differs(stride, leap), 'Poses do not differ');
      check(!differs(rest, pose(m, {})), 'Pose does not return to rest');
      // Live bugs drive that rig from their own movement and attack state.
      for (const kind of ['zergling', 'hopper', 'warrior', 'tanker']) {
        const bug = new Zergling(10, 10, kind, 1, 1); bug.spawnT = 1;
        const before = pose(bug.model, {});
        bug.moving = 1; bug.gait = 2.1; bug.swing = 0.7; bug.animate(0.05, g);
        const after = []; bug.model.traverse(o => { if (o !== bug.model) after.push(...o.rotation.toArray().slice(0, 3), o.position.y); });
        check(differs(before, after), `${kind}: the live bug is not animated`);
        bug.dead = true; for (let i = 0; i < 20; i++) bug.update(0.05, g);
        check(Math.abs(bug.model.rotation.z) > 1, `${kind}: no death roll`);
      }
      // The two flyers: shared geometry, beating wings, the usual model contract.
      for (const [kind, span] of [['skyhunter', 1.6], ['broodray', 1.9]]) {
        const a = makeModel(kind), b = makeModel(kind), sa = stats(a), sb = stats(b);
        check(sa.bad === 0 && sa.meshes <= 8 && sa.tris <= 2400, `${kind}: too heavy (${sa.meshes} meshes, ${sa.tris} triangles)`);
        check([...sa.geos].every(geo => sb.geos.has(geo)), `${kind}: geometry is rebuilt for every flyer`);
        check(sa.size.z > span, `${kind}: wingspan ${sa.size.z.toFixed(2)}`);
        check(a.userData.torso && a.userData.weapon?.userData.muzzle && typeof a.userData.anim === 'function', `${kind}: model contract`);
        const wing = a.userData.torso.children.find(o => o.isGroup && o.children[0]?.isMesh && Math.abs(o.position.z) > 0.05);
        const angles = new Set();
        for (let i = 0; i < 12; i++) { a.userData.anim('walk', 0.03); angles.add(wing.rotation.x.toFixed(2)); }
        check(angles.size > 4, `${kind}: wings do not beat`);
        for (let i = 0; i < 40; i++) a.userData.anim('death', 0.05);
        check(a.userData.torso.rotation.z > 1, `${kind}: no death roll`);
        out[kind] = `${sa.meshes} meshes, ${Math.round(sa.tris)} triangles`;
      }
      // The inspector portrait shows the new Ripper and animates it.
      document.querySelector('[data-unit="zergling"]').click();
      return out;
    });
    assert.deepEqual(errors, []);
    console.log('PASS: swarm strains (shared kits, size, footing, poses, live animation, death), both flyers and the portrait', result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
