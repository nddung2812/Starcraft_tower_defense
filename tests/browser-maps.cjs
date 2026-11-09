const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/'); await page.waitForFunction(()=>window.game);
    await page.getByRole('button',{name:'Build my own defense'}).click();
    const layouts=await page.evaluate(async()=>{
      const THREE=await import('three');
      const {Zergling}=await import('/src/entities.js');
      const g=game, render=g.stage.render.bind(g.stage); g.stage.render=()=>{};
      const check=(ok,message)=>{if(!ok)throw Error(message);};
      const result=[];
      for(const level of [1,5,6,10,11,20,21,26,30,100]){
        g.wipeUnits();g.level=level;g.state='build';g.loadLevel();
        const {cols,rows,routeCount}=g.layout;
        check(routeCount===(level<=5?1:level<=15?2:3),'Incorrect difficulty-based route count');
        check(g.grid.cells.length===cols*rows,'Grid was not resized');
        check(g.stage.cols===cols&&g.stage.rows===rows,'Camera bounds were not resized');
        g.zoneMesh.geometry.computeBoundingBox();
        const terrain=g.zoneMesh.geometry.boundingBox;
        check(terrain.min.x>=0&&terrain.min.z>=0&&terrain.max.x<=cols&&terrain.max.z<=rows,'Terrain extends outside map');
        const ground=new THREE.Box3().setFromObject(g.stage.ground);
        check(Math.abs(ground.min.x)<.001&&Math.abs(ground.max.x-cols)<.001&&Math.abs(ground.min.z)<.001&&Math.abs(ground.max.z-rows)<.001,'Ground extends outside map');
        g.startWave();
        check(new Set(g.queue.map(s=>s.lane)).size===routeCount,'Wave did not use every attack route');
        for(const spawn of g.grid.spawns){
          const bug=new Zergling(spawn.x+.5,spawn.y+.85,'zergling',1,1);
          bug.repath(g);check(bug.path?.length>1,'Spawned bug could not read a route');
        }
        g.stage.pan(1e5,1e5);
        check(g.stage.focus.x>=0&&g.stage.focus.x<=cols&&g.stage.focus.z>=0&&g.stage.focus.z<=rows,'Camera escaped bounds');
        result.push({level,size:cols,routes:routeCount,terrainVertices:g.zoneMesh.geometry.attributes.position.count});
      }
      g.wipeUnits();g.level=5;g.state='build';g.loadLevel();g.completeWave();
      check(g.level===6&&g.grid.COLS===72&&g.stage.cols===72,'5→6 transition failed');
      g.reset(12345);check(g.grid.COLS===56&&g.stage.cols===56,'Restart did not shrink the map');
      g.stage.render=render;
      g.stage.focus.set(28,0,28);g.stage.pitch=1.1;g.stage.dist=g.stage.fitDistance();g.stage.updateCamera();g.stage.render();
      return result;
    });
    await page.waitForTimeout(250);
    const mini=await page.locator('#minimap').boundingBox();
    await page.mouse.click(mini.x+mini.width-3,mini.y+mini.height/2);
    const clicked=await page.evaluate(()=>({x:game.stage.focus.x,z:game.stage.focus.z}));
    assert.ok(clicked.x>53&&clicked.x<56);assert.ok(clicked.z>27&&clicked.z<29);
    await page.evaluate(()=>{game.stage.focus.set(28,0,28);game.stage.updateCamera();game.stage.render();});
    await page.screenshot({path:path.join(os.tmpdir(),'td-map-overview.png')});
    assert.deepEqual(errors,[]);
    console.log('Dynamic map integration:',layouts);
    console.log('PASS: exact terrain/ground bounds, 1–3 difficulty-based live wave routes, shared routing, map growth, restart shrink, camera clamps and minimap coordinates');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
