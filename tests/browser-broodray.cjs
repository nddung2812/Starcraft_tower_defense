const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
    await page.goto('http://127.0.0.1:8765');
    await page.waitForFunction(()=>window.game?.stage,null,{polling:50});
    const result=await page.evaluate(async()=>{
      const {Marine,Zergling}=await import('/src/entities.js');
      const {wavePlan}=await import('/src/config.js');
      const {scoutRound}=await import('/src/scouting.js');
      const g=game;g.reset(12345);g.state='wave';g.paused=false;
      const damage={};
      for(const kind of ['marine','falcon']) {
        const target=new Marine(kind,10,10,[]);g.gunners=[target];
        target.obj.position.y=target.altitude;
        const bug=new Zergling(target.x+2,target.z,'broodray',1,1);
        bug.attackCd=0;const hp=target.hp;
        if(bug.rangedPrey(g)!==target)throw Error('Cannot acquire '+kind);
        bug.update(.05,g);
        for(let i=0;i<100;i++)for(const shot of g.acids)if(!shot.dead)shot.update(.05,g);
        damage[kind]=hp-target.hp;g.acids=[];
        if(!bug.flying||!bug.model.userData.anim)throw Error('Missing flying model');
      }
      g.level=7;g.zerglings=[];const hive=g.hives[0];hive.update(60,g);
      return {damage,early:wavePlan(6).some(s=>s.breed==='broodray'),unlocked:wavePlan(7).some(s=>s.breed==='broodray'),wraiths:wavePlan(5).filter(s=>s.breed==='skyhunter').length,scouted:scoutRound(7).threats.some(t=>t.id==='broodray'),hatched:g.zerglings.some(z=>z.breedId==='broodray')&&g.zerglings.some(z=>z.breedId==='skyhunter')};
    });
    assert.ok(result.damage.marine>0&&result.damage.falcon>0);
    assert.equal(result.early,false);assert.equal(result.unlocked,true);assert.equal(result.wraiths,3);assert.equal(result.scouted,true);assert.equal(result.hatched,true);assert.deepEqual(errors,[]);
    console.log('PASS: Brood Ray ground/air damage, model, waves, scouting and hive hatching',result);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
