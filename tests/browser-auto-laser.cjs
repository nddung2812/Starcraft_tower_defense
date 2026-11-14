const {chromium}=require(process.argv[2]||'playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>window.game?.stage,null,{polling:50});
  const result=await page.evaluate(async()=>{
   const {Zergling}=await import('/src/entities.js');const {BASE_LASER}=await import('/src/config.js');
   const g=game;g.reset(12345);g.state='wave';g.paused=false;
   const direction=g.core.x>g.grid.COLS/2?-1:1;
   const enemy=new Zergling(g.core.x+direction*3,g.core.z+2,'broodray',1,1);enemy.hp=enemy.maxHp=2000;g.zerglings=[enemy];
   g.laserCharge=89;const turret=g.core.model.userData.laserTurret;const before=turret.rotation.y;g.core.update(.1,g);
   const tracks=turret.rotation.y!==before, waits=enemy.hp===2000;
   g.laserCharge=BASE_LASER.chargeTime;g.paused=true;g.core.update(.1,g);const paused=enemy.hp===2000;
   g.paused=false;g.state='brief';g.core.update(.1,g);const peaceful=enemy.hp===2000;
   g.state='wave';g.core.update(.1,g);const fired=enemy.hp===2000-BASE_LASER.damage+enemy.armor&&g.laserCharge===0;
   g.core.update(.1,g);const once=enemy.hp===2000-BASE_LASER.damage+enemy.armor;
   g.zerglings=[];g.state='raid';g.laserCharge=90;const hiveHp=g.hives.reduce((n,h)=>n+h.hp,0);g.core.update(.1,g);
   const bases=g.hives.reduce((n,h)=>n+h.hp,0)<hiveHp&&g.laserCharge===0;
   g.hives.forEach(h=>h.dead=true);g.laserCharge=90;g.core.update(.1,g);const holds=g.laserCharge===90;
   return {tracks,waits,paused,peaceful,fired,once,bases,holds};
  });for(const [k,v]of Object.entries(result))assert.equal(v,true,k);assert.deepEqual(errors,[]);console.log('PASS: automatic base laser',result);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
