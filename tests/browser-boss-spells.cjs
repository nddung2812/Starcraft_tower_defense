const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
 try {
  const page = await browser.newPage();
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
  await page.goto('http://127.0.0.1:8765'); await page.waitForFunction(()=>window.game);
  await page.locator('#introBtn').click();
  await page.evaluate(()=>{
   const g=game; g.level=10; g.loadLevel(); g.state='build'; g.startWave(); g.state='wave';
   const a=g.assault; a.spawnBoss();
   const spot=g.grid.nearestOpen(Math.floor(g.core.x)-3,Math.floor(g.core.z));
   g.minerals=1000; g.placeGunner('marine',spot.x,spot.y); const u=g.gunners.at(-1);
   a.castSpell(); let m=a.marks.find(m=>m.spell==='blind');
   if(!m || m.t!==2)throw Error('Missing blind warning');
   u.x=m.x;u.z=m.z;a.detonate(m);
   if(u.blindT!==5 || u.attackRange!==u.stats.range/2)throw Error('Blind failed');
   u.update(5.01,g); if(u.blindT!==0 || u.attackRange!==u.stats.range)throw Error('Blind expiry failed');
   a.castSpell();m=a.marks.find(m=>m.spell==='silence');u.x=m.x;u.z=m.z;a.detonate(m);
   g.stimUnlocked=true; if(u.stim(g))throw Error('Silence allowed stim');
   const shots=g.tracers.length;u.fire(g);if(g.tracers.length!==shots)throw Error('Silence allowed shooting');
   const duration=u.silenceT;g.paused=true;g.update(5);if(u.silenceT!==duration)throw Error('Pause did not freeze debuff');g.paused=false;
   u.update(3.01,g);if(u.silenceT!==0)throw Error('Silence expiry failed');
   u.x=m.x+10;u.z=m.z;a.detonate(m);if(u.silenceT!==0)throw Error('Dodging spell failed');
   const before=g.zerglings.length;a.castSpell();const babies=g.zerglings.slice(before);
   if(!babies.length || babies.length>a.plan.broodCount || babies.some(b=>!b.isBrood || !g.grid.inside(Math.floor(b.x),Math.floor(b.z))))throw Error('Brood spawn failed');
   for(const b of babies)b.update(0.05,g);
   u.blindT=5;u.silenceT=3;a.defeated(a.boss);
   if(a.marks.length || u.blindT || u.silenceT)throw Error('Boss death cleanup failed');
  });
  assert.deepEqual(errors,[]);console.log('PASS: blind range, silence firing/Stim, expiry, pause, dodge, local brood spawning, death cleanup');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
