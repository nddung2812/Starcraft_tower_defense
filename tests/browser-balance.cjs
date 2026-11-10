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
    assert.match(await page.title(), /Ridgewatch/);
    const result = await page.evaluate(async () => {
      const { UNITS, BUILD, ARMORY, OVERDRIVE, wavePlan } = await import('/src/config.js');
      const { Zergling } = await import('/src/entities.js');
      const g = game, check = (ok, message) => { if (!ok) throw Error(message); };
      check(g.minerals === 300 && g.gunners.length === 3, 'Opening squad must leave 300 minerals for support');
      check(wavePlan(8).some(e => e.breed === 'tanker') && !wavePlan(7).some(e => e.breed === 'tanker'), 'Artillery introduction must be round 8');
      const opening = [];
      const render = g.stage.render; g.stage.render = () => {};
      try {
        for (const seed of [0, 12345, 4294967295]) {
          g.reset(seed); check(g.quickDeploy(), 'Quick Deploy failed');
          for(let i=0;i<3600 && g.level===1 && g.state!=='defeat';i++) g.update(.05);
          check(g.level===2 && g.core.hp===g.core.maxHp, `Starting squad cannot protect opening seed ${seed}`);
          opening.push({seed,kills:g.kills});
        }
      } finally { g.stage.render=render; }
      g.reset(12345);
      const volleys = [];
      for (const kind of Object.keys(UNITS)) {
        g.wipeUnits(); g.loadLevel(); g.state = 'build'; g.minerals = 10000;
        const [x,y] = g.layout.open.find(([x,y]) => g.grid.buildable(x,y));
        check(g.placeGunner(kind,x,y), `Cannot place ${kind}`);
        const unit = g.gunners[0], spec = UNITS[kind];
        const bug = new Zergling(unit.x + 1,unit.z,'zergling',1,1);
        bug.hp = bug.maxHp = 10000; g.zerglings.push(bug); g.world.add(bug.obj); unit.target = bug;
        unit.obj.updateMatrixWorld(true); unit.fire(g);
        const projectiles = spec.shell ? g.shells : g.tracers;
        check(projectiles.length === spec.shots, `${kind}: volley count disagrees with inspector`);
        for (let i=0;i<100;i++) for(const p of projectiles) if(!p.dead)p.update(.02,g);
        check(10000-bug.hp === unit.stats.damage*spec.shots, `${kind}: live volley damage mismatch`);
        volleys.push({name:spec.info.name,cost:BUILD[kind].cost,damage:10000-bug.hp,dps: +(unit.stats.damage*spec.shots/unit.stats.attackSpeed).toFixed(1)});
        // Imported models can supply a single muzzle without losing half their damage.
        const weapon=unit.model.userData.weapon, muzzle=weapon.userData.muzzle;
        weapon.userData.muzzles=[muzzle]; const before=projectiles.length; unit.fire(g);
        check(projectiles.length-before===spec.shots, `${kind}: art changed combat balance`);
        const oldDamage=unit.stats.damage;
        if(unit.upgradeCost!=null){ check(g.upgradeGunner(unit), 'Upgrade failed'); check(unit.stats.damage>oldDamage,'Promotion did not improve damage'); }
      }
      g.wipeUnits(); g.loadLevel(); g.state='build'; g.minerals=1000;
      const [x,y]=g.layout.open.find(([x,y])=>g.grid.buildable(x,y));
      g.placeGunner('marine',x,y); const u=g.gunners[0]; g.stimUnlocked=true;
      for(const hp of [1,OVERDRIVE.hpCost]) { u.hp=hp; check(!u.stim(g)&&u.hp===hp&&u.stimT===0,'Low-health Overdrive exploit'); }
      u.hp=u.maxHp; const before=u.hp; check(u.stim(g),'Overdrive failed');
      check(u.hp===before-OVERDRIVE.hpCost&&u.stimT===OVERDRIVE.duration,'Overdrive cost/duration mismatch');
      check(!u.stim(g),'Overdrive stacked while active');
      const target=new Zergling(u.x+1,u.z,'zergling',1,1);g.zerglings.push(target);g.world.add(target.obj);
      u.yaw=0;u.target=target;u.cooldown=0;u.update(.01,g);
      check(Math.abs(u.cooldown-u.stats.attackSpeed/OVERDRIVE.fireRate)<1e-9,'Overdrive fire rate mismatch');
      u.stimT=0;u.silenceT=1;check(!u.stim(g),'Silence allowed Overdrive');u.silenceT=0;
      g.armory=ARMORY.slice();u.applyStats(g.marineUpgrades);
      check(u.maxHp===100 && u.stats.damage===13,'Armory stats disagree with advertised bonuses');
      return {volleys,opening};
    });
    console.table(result.volleys);
    console.log('Opening clears:',result.opening);
    for (const [kind,name] of [['marine','Lineguard'],['goliath','Anchor Walker'],['tank','Cinder Crawler'],['falcon','Kestrel'],['zergling','Rift Skitter']]) {
      await page.locator(`[data-unit="${kind}"]`).click();
      assert.equal(await page.locator('#pName').textContent(),name);
      if(kind==='tank') assert.match(await page.locator('#stats').textContent(),/38 ×2/);
    }
    await page.keyboard.press('F1');
    assert.equal(await page.locator('#pName').textContent(),'Patch Rig');
    const forbidden=/Terran|Zergling|StarCraft|Goliath|Siege Tank|Stimpack|Mar Sara|\bSCV\b|\bMarines?\b/i;
    assert.doesNotMatch(await page.locator('body').innerText(),forbidden);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:'/tmp/ridgewatch-balanced.png'});
    console.log('PASS: live volley damage, model-independent shots, promotions, Overdrive limits/rate, armory, wave introduction, roster UI');
  } finally { await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
