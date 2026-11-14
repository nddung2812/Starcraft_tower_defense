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
    const result = await page.evaluate(async () => {
      const T = await import('three');
      const { makeModel, loadedModels } = await import('/src/assets.js');
      const { Marine, Zergling } = await import('/src/entities.js');
      const { syncEvolutionVisual } = await import('/src/evolutions.js');
      const check = (ok, message) => { if (!ok) throw Error(message); };
      check(loadedModels().includes('goliath'), 'Walker silently fell back to procedural art');
      const a = makeModel('goliath'), b = makeModel('goliath', 2);
      check(a.userData.fromFile && a.userData.anim, 'Missing model or animation rig');
      check(a.getObjectByName('ArmoredCockpit').parent.isBone, 'Cockpit detached from animated chassis');
      check(a.getObjectByName('RankPlate1').material.color.getHex() !== b.getObjectByName('RankPlate1').material.color.getHex(), 'Promotion did not change rank markings');
      a.userData.anim('idle', .3); a.updateMatrixWorld(true);
      const bone = a.getObjectByName('LowerLegL'), before = bone.quaternion.clone();
      for (let i = 0; i < 8; i++) a.userData.anim('walk', .1);
      check(before.angleTo(bone.quaternion) > .01, 'Walking legs are frozen');
      check(b.getObjectByName('LowerLegL').quaternion.angleTo(bone.quaternion) > .01, 'Model instances share an animation rig');
      for (const state of ['shoot', 'death', 'idle']) {
        for (let i = 0; i < 12; i++) a.userData.anim(state, .1);
        a.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(a, true);
        check(Number.isFinite(bounds.min.x) && bounds.getSize(new T.Vector3()).length() < 6, state + ' corrupts model bounds');
      }
      const g = game; g.reset(12345); g.minerals = 5000; g.state = 'wave';
      document.getElementById('intro').hidden = true;
      const [x, y] = g.layout.open.find(([x,y]) => g.canBuildAt(x,y) && x > 10 && x < g.grid.COLS - 12);
      const u = new Marine('goliath', x, y, []); g.gunners.push(u); g.world.add(u.obj);
      u.spawnT = 1; u.model.scale.setScalar(u.visualScale); u.model.rotation.y = .5;
      u.model.userData.anim('idle', .3);
      const enemy = new Zergling(u.x + 4, u.z, 'warrior', 100, 1); g.zerglings.push(enemy); u.target = enemy;
      const flashes = []; const oldFlash = g.fx.muzzleFlash; g.fx.muzzleFlash = p => flashes.push(p.clone());
      u.fire(g); g.fx.muzzleFlash = oldFlash;
      check(flashes.length === 2 && flashes[0].distanceTo(flashes[1]) > .5, 'Twin cannon origins collapsed');
      check(g.tracers.length === 2 && g.tracers.every(t => t.target === enemy), 'Twin cannon volley changed');
      g.evolutions.chain = 1; syncEvolutionVisual(u, g); check(u.evolutionVisual, 'Chain lightning visual missing');
      u.obj.updateMatrixWorld(true);
      const muzzles = ['Muzzle-1','Muzzle1'].map(name => u.model.getObjectByName(name).getWorldPosition(new T.Vector3()).toArray());
      check(flashes.every(f => muzzles.some(m => f.distanceTo(new T.Vector3(...m)) < .2)), 'Shots miss the visible cannon tips');
      u.upgrade(g.marineUpgrades); check(u.model.userData.fromFile && u.model.userData.anim, 'Promotion lost imported rig');
      u.model.scale.setScalar(u.visualScale); u.model.rotation.y = .5; u.model.userData.anim('idle', .3);
      const friend = new Marine('marine', x + 2, y, []); friend.spawnT=1; friend.model.scale.setScalar(friend.visualScale); g.gunners.push(friend); g.world.add(friend.obj); friend.model.userData.anim('idle',.3);
      g.stage.focus.set(u.x + .5, g.heightAt(u.x,u.z) + .7, u.z); g.stage.dist = 9; g.stage.updateCamera(); g.stage.render();
      return { imported: true, animations: true, promotions: true, twinCannons: true, chain: true, muzzles, flashes: flashes.map(p => p.toArray()) };
    });
    await page.screenshot({ path: '/tmp/ridgewatch-goliath.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: imported Goliath, independent rigs, animations, promotions, twin cannons and evolution', result);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
