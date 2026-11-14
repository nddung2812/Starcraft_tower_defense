const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>window.requestAnimationFrame=()=>1);
    await page.goto(process.env.TEST_URL||'http://127.0.0.1:8765/');
    await page.waitForFunction(()=>window.game?.stage,null,{polling:50});
    const result=await page.evaluate(async()=>{
      const {Zergling,Marine}=await import('/src/entities.js');
      const {CELL,wavePlan}=await import('/src/config.js');
      const {startYamato,updateBattlecruiser}=await import('/src/battlecruiser.js');
      const {scoutRound}=await import('/src/scouting.js');
      const check=(ok,m)=>{if(!ok)throw Error(m);};
      check(!wavePlan(7).some(e=>e.breed==='ultralisk'),'Ultra arrived too early');
      check(wavePlan(8).filter(e=>e.breed==='ultralisk').length===1,'First ultra count');
      check(wavePlan(12).filter(e=>e.breed==='ultralisk').length===2,'Escalation missing');
      check(wavePlan(100).filter(e=>e.breed==='ultralisk').length===4,'Ultra count uncapped');
      check(scoutRound(8).threats.find(t=>t.id==='ultralisk').unit==='cruiser','Scouting counter missing');
      const g=game;g.reset(12345);g.level=8;g.loadLevel();g.state='wave';g.paused=false;
      for(let y=18;y<25;y++)for(let x=18;x<26;x++)g.grid.set(x,y,CELL.OPEN);
      const u=new Zergling(20.5,20.5,'ultralisk',1.7,1);g.zerglings=[u];g.world.add(u.obj);
      check(u.hp===2210&&u.armor===7,'Heavy stats incorrect');
      const defender=(kind,x,z,extra={})=>({kind,x,z,hp:5000,dead:false,...extra,takeDamage(amount){this.hp-=amount;}});
      const front=defender('marine',21.5,20.5),side=defender('marine',21.7,21.2),rear=defender('marine',19.5,20.5),far=defender('marine',24.5,20.5);
      const air=defender('cruiser',21.5,20.5,{flying:true}),inside=defender('marine',21.5,20.5,{bunker:{}});
      const wall=defender('wall',21.5,19.7),bunker=defender('bunker',21.6,21.1);
      g.gunners=[front,side,rear,far,air,inside];g.walls=[wall];g.bunkers=[bunker];
      u.attack(front,.05,g);
      check(front.hp===4952&&side.hp===4952,'Primary double-hit or cleave missing');
      check(rear.hp===5000&&far.hp===5000&&air.hp===5000&&inside.hp===5000,'Hit rear/out-of-range/air/garrison');
      check(Math.abs(wall.hp-4923.2)<.01&&Math.abs(bunker.hp-4923.2)<.01,'Siege damage missing');
      u.attack(front,.05,g);check(front.hp===4952,'Attack cooldown ignored');
      g.grid.set(21,20,CELL.WALL,wall);front.x=22.2;wall.x=21.5;wall.z=20.5;u.attackCd=0;
      u.attack(wall,.05,g);check(front.hp===4952,'Cleave passed through wall');
      g.grid.set(21,20,CELL.OPEN);g.gunners=[];g.walls=[];g.bunkers=[];
      u.takeDamage(20,g,0,true);check(u.hp===2197,'Armour not applied');
      u.hp=2210;const c=new Marine('cruiser',16,20,[]);g.gunners=[c];g.focus=u;
      check(startYamato(c,g,true),'Yamato failed to lock Ultralisk');updateBattlecruiser(c,1.5,g);
      check(u.hp===810&&!u.dead,'First-wave Ultralisk should survive standard Yamato');
      check(!u.preyOk(c,g),'Ultralisk hunted aircraft');
      // Real wave spawn and one warning, rather than a model-only addition.
      g.reset(12345);g.level=8;g.loadLevel();g.startWave();g.assault.plan=null;g.assault.pending=false;
      let warnings=0;g.on('ultralisk',()=>warnings++);g.state='wave';g.spawnTimer=5.99;g.update(.05);
      check(g.zerglings.some(e=>e.breedId==='ultralisk'),'Wave did not spawn Ultralisk');check(warnings===1,'Missing arrival warning');
      const beast=g.zerglings.find(e=>e.breedId==='ultralisk');
      // Walk actual large model through the canyon to combat range without terrain crossings.
      beast.bar.set=()=>{};let reached=false;
      for(let i=0;i<2400;i++){
        beast.update(.05,g);
        check(g.grid.get(Math.floor(beast.x),Math.floor(beast.z))!==CELL.ROCK,'Ultra crossed rock');
        if(Math.hypot(beast.x-g.core.x,beast.z-g.core.z)<3){reached=true;break;}
      }
      check(reached,'Ultra stuck in canyon');
      // Preview at an open defense line with its real animation and inspector.
      document.getElementById('intro').hidden=true;beast.x=g.core.x-5;beast.z=g.core.z;beast.spawnT=1;beast.model.scale.setScalar(beast.scale);beast.animate(.05,g);
      g.stage.focus.set(beast.x,.8,beast.z);g.stage.dist=14;g.stage.updateCamera();g.stage.render();g.emit('selectOnly',beast);g.emit('change');
      return {firstRound:8,firstHp:2210,armor:7,cleaveDamage:48,structureDamage:76.8,reached};
    });
    assert.match(await page.locator('#pName').textContent(),/Ultralisk/);
    await page.screenshot({path:'/tmp/ridgewatch-ultralisk.png'});
    assert.deepEqual(errors,[]);console.log('PASS: Ultralisk wave progression, cleave, siege, armour, air immunity, Yamato survival, scouting and canyon traversal',result);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
