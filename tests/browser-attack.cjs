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
    await page.evaluate(() => {
      const g = game; g.reset(12345); g.state = 'wave'; g.paused = false;
      g.queue = [{ at: 9999, breed: 'zergling', lane: 0 }]; g.minerals = 10000;
      for (const kind of ['marine', 'goliath', 'tank', 'falcon', 'marine']) {
        const cell = g.layout.open.find(([x,y]) => g.grid.buildable(x,y) && Math.hypot(x-g.core.x,y-g.core.z)<8);
        if (!cell || !g.placeGunner(kind,...cell)) throw Error('Cannot place army fixture');
      }
      const cell = g.layout.open.find(([x,y]) => g.grid.buildable(x,y) && Math.hypot(x-g.core.x,y-g.core.z)<8);
      g.placeBunker(...cell); g.garrison(g.gunners.at(-1),g.bunkers[0],true);
      g.emit('selectOnly',null); g.emit('change');
      window.__starts = g.gunners.map(u=>({x:u.x,z:u.z}));
    });
    assert.equal(await page.locator('[data-cmd="attack"]').isEnabled(),true);
    await page.locator('[data-cmd="attack"]').click();
    assert.equal(await page.evaluate(()=>game.gunners.every(u=>u.order?.type==='advance'&&!u.bunker)),true);
    assert.equal(await page.evaluate(()=>document.getElementById('game').classList.contains('is-targeting')),false);
    const combat = await page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const g=game, troops=g.gunners.slice(), first=troops[0];
      const node=first.waypoints[3];
      const enemy=new Zergling(node.x,node.y,'zergling',1,1);
      enemy.update=()=>{}; g.zerglings.push(enemy);g.world.add(enemy.obj);
      const friends=[g.core,g.scv,g.bunkers[0],...g.gunners];
      const hp=friends.map(e=>e.hp);
      const refusesFriends=friends.every(e=>!g.commandAttack(g.gunners,e));
      g.focus=g.core;
      const targetsEnemy=first.acquire(g)===enemy;
      g.focus=null;
      for(const u of g.gunners)u.stats.damage=200;
      const bases=g.hives.slice();
      let afterFight=null,steps=0;
      for(;steps<6000&&!bases.every(h=>h.dead);steps++) {
        g.update(.05);
        if(enemy.dead&&!afterFight)afterFight={x:first.x,z:first.z,order:first.order?.type};
      }
      return {refusesFriends,targetsEnemy,killedEnemy:enemy.dead,afterFight,
        marched:troops.map((u,i)=>Math.hypot(u.x-__starts[i].x,u.z-__starts[i].z)>3),
        allBasesDestroyed:bases.every(h=>h.dead),friendlyHpUnchanged:friends.every((e,i)=>e.hp===hp[i]),seconds:steps*.05};
    });
    assert.equal(combat.refusesFriends,true);assert.equal(combat.targetsEnemy,true);
    assert.equal(combat.killedEnemy,true);assert.equal(combat.afterFight?.order,'advance');
    assert.ok(combat.marched.every(Boolean),JSON.stringify(combat));
    assert.equal(combat.allBasesDestroyed,true,JSON.stringify(combat));
    assert.equal(combat.friendlyHpUnchanged,true);
    console.log('Army attack:',combat);
    const controls = await page.evaluate(async () => {
      const g=game;g.reset(12345);g.minerals=1000;g.paused=false;
      g.quickDeploy();g.emit('selectOnly',g.gunners[0]);
      return g.gunners.length;
    });
    await page.keyboard.press('a');
    assert.equal(await page.evaluate(()=>game.gunners.filter(u=>u.order?.type==='advance').length),controls);
    await page.keyboard.press('s');
    assert.equal(await page.evaluate(()=>game.gunners.every(u=>u.order===null)),true);
    const checkpoint = await page.evaluate(async () => {
      const {captureCheckpoint,validateCheckpoint,restoreCheckpoint}=await import('/src/checkpoints.js');
      const g=game;g.commandAdvanceArmy();
      const saved=captureCheckpoint(g,{player:'Attack',quickDeployment:true,guideDismissed:true});
      const valid=validateCheckpoint(saved);restoreCheckpoint(g,saved);
      const restored=g.gunners.every(u=>u.order?.type==='advance');
      saved.units.forEach(u=>delete u.advancing);
      const legacy=validateCheckpoint(saved);
      saved.units[0].advancing='invalid';
      return {valid,restored,legacy,rejected:!validateCheckpoint(saved)};
    });
    for(const value of Object.values(checkpoint))assert.equal(value,true);
    await page.evaluate(()=>{const g=game;g.reset(12345);g.paused=false;g.state='wave';g.queue=[];g.stage.render();g.update(.05);});
    assert.equal(await page.locator('#raidNotice').isVisible(),true);
    assert.match(await page.locator('#raidNotice').textContent(),/Destroy enemy's base/);
    assert.equal(await page.locator('#raidCountdown').count(),0);
    await page.screenshot({path:'/tmp/td-raid-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>game.emit('raid'));
    const notice=await page.locator('#raidNotice').boundingBox();
    assert.ok(notice&&notice.x>=0&&notice.x+notice.width<=390);
    await page.screenshot({path:'/tmp/td-raid-mobile.png'});
    await page.locator('#raidNotice').waitFor({state:'hidden',timeout:3000});
    const phases=await page.evaluate(()=>{
      const g=game,level=g.level;
      const initial=g.raidT;
      g.paused=true;g.update(120);const paused=g.raidT===initial;
      g.paused=false;g.update(59.9);const held=g.state==='raid'&&g.level===level;
      g.update(.1);const timedOut=g.state==='brief'&&g.level===level+1;
      g.state='wave';g.queue=[];g.update(.05);
      const round=g.level,money=g.minerals,reward=g.hives.reduce((n,h)=>n+h.reward,0);
      g.hives.forEach(h=>{h.takeDamage(100000,g);h.takeDamage(100000,g);});
      const rewarded=g.minerals-money===reward;g.update(.05);
      const early=g.state==='brief'&&g.level===round+1;
      g.reset(12345);g.paused=false;g.state='wave';
      g.hives[0].takeDamage(100000,g);
      g.queue=[{at:0,lane:0,breed:'zergling',hpScale:1,speedScale:1},{at:0,lane:1,breed:'zergling',hpScale:1,speedScale:1}];
      g.update(.05);
      return {initial,paused,held,timedOut,rewarded,early,deadBaseStopsSpawning:g.zerglings.length===1};
    });
    assert.equal(phases.initial,60);
    for(const [key,value] of Object.entries(phases))if(key!=='initial')assert.equal(value,true,key);
    assert.deepEqual(errors,[]);
    console.log('PASS: one-click/keyboard whole-army advance, fighting en route, no friendly fire, all bases, stop, saves, 2-second notice, optional 60-second timeout and early finish',phases);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
