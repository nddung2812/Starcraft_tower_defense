const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({ viewport: {width: 960, height: 640}, deviceScaleFactor: 2 });
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    // Exercise the scheduler at 120 Hz without running hundreds of GPU-heavy frames.
    await page.addInitScript(() => {
      let next=0;const pending=new Map();
      window.requestAnimationFrame=fn=>{pending.set(++next,fn);return next;};
      window.cancelAnimationFrame=id=>pending.delete(id);
      window.__pump=(steps,hz=120)=>{window.__time ??= performance.now();for(let i=0;i<steps;i++){window.__time+=1000/hz;const callbacks=[...pending.values()];pending.clear();for(const callback of callbacks)callback(window.__time);}};
    });
    await page.goto('http://127.0.0.1:8765/'); await page.waitForFunction(()=>window.game?.stage, null, { polling: 50 });
    const scheduling=await page.evaluate(async()=>{
      const g=game,s=g.stage;
      if(s.quality!=='low'||s.renderer.getPixelRatio()!==2||s.composer!==null||s.renderer.shadowMap.enabled)throw Error('Eco defaults are not sharp/lightweight/lazy');
      if (!s.renderer.getContext().getContextAttributes().antialias) throw Error('Edge antialiasing disabled');
      window.__actualRender=s.render.bind(s);
      let renders=0,portraits=0,minimaps=0;
      s.render=()=>{renders++;};
      const portraitContext = document.getElementById('portrait').getContext('webgl2');
      const clear = portraitContext.clear.bind(portraitContext);
      portraitContext.clear = (...args) => { portraits++; return clear(...args); };
      const drawImage=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='minimap')minimaps++;return drawImage.apply(this,args);};
      __pump(240); const idle=renders;renders=portraits=minimaps=0;
      document.getElementById('introForm').requestSubmit(document.getElementById('introBtn'));
      const before=g.time;__pump(240);const eco=renders,ecoPortraits=portraits,ecoMinimaps=minimaps,ecoSeconds=g.time-before;
      renders=portraits=minimaps=0;
      document.getElementById('btnFx').click();__pump(240);const high=renders,highPortraits=portraits,highMinimaps=minimaps;
      g.paused=true;__pump(60);renders=0;
      const pauseTime=g.time;__pump(240);const paused=renders,pausedSeconds=g.time-pauseTime;
      const camera=s.focus.clone();renders=0;
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
      __pump(120);const pausedInteractive=renders,cameraMoved=s.focus.distanceTo(camera)>0.1;
      window.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));
      g.paused=false;
      renders=0;
      Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
      const pausedAt=g.time;__pump(240);const hidden=renders,hiddenSeconds=g.time-pausedAt;
      Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));
      // Resume timestamp follows the browser clock; align the synthetic clock before pumping.
      window.__time=performance.now();__pump(120);const resumed=renders;
      return {idle,eco,high,paused,pausedSeconds,pausedInteractive,cameraMoved,hidden,hiddenSeconds,ecoSeconds,ecoPortraits,ecoMinimaps,highPortraits,highMinimaps,resumed};
    });
    assert.ok(scheduling.idle>=7&&scheduling.idle<=9,JSON.stringify(scheduling));
    assert.ok(scheduling.eco>=58&&scheduling.eco<=62,JSON.stringify(scheduling));
    assert.ok(scheduling.high>=118&&scheduling.high<=122,JSON.stringify(scheduling));
    assert.ok(scheduling.paused>=7&&scheduling.paused<=9,JSON.stringify(scheduling));
    assert.equal(scheduling.pausedSeconds,0);
    assert.ok(scheduling.pausedInteractive>=58&&scheduling.pausedInteractive<=62);
    assert.equal(scheduling.cameraMoved,true);
    assert.equal(scheduling.hidden,0);assert.equal(scheduling.hiddenSeconds,0);
    assert.ok(scheduling.resumed>=58&&scheduling.resumed<=62);
    assert.ok(scheduling.ecoSeconds>1.9&&scheduling.ecoSeconds<2.15);
    assert.ok(scheduling.ecoPortraits>=12&&scheduling.ecoPortraits<=17&&scheduling.highPortraits>=12&&scheduling.highPortraits<=17);
    assert.ok(scheduling.ecoMinimaps<=21&&scheduling.highMinimaps<=21);
    console.log('Two seconds at simulated 120 Hz:',scheduling);
    const draws=await page.evaluate(()=>{
      const s=game.stage;const measure=q=>{
        s.setQuality(q);s.renderer.info.autoReset=false;s.renderer.info.reset();window.__actualRender();
        const r={calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles,pixels:s.renderer.domElement.width*s.renderer.domElement.height,shadows:s.renderer.shadowMap.enabled};
        s.renderer.info.autoReset=true;return r;
      };
      const high=measure('high'),eco=measure('low');
      return {high,eco};
    });
    assert.ok(draws.eco.calls<draws.high.calls,JSON.stringify(draws));
    assert.ok(draws.eco.pixels===draws.high.pixels);assert.equal(draws.eco.shadows,false);
    console.log('One actual battlefield frame:',draws);
    const resources=await page.evaluate(()=>{
      const s=game.stage;
      const baseline=s.renderer.info.memory.textures;
      const cycles=[];
      for(let i=0;i<3;i++){
        s.setQuality('high');window.__actualRender();
        const full=s.renderer.domElement;
        if(s.composer.readBuffer.width!==full.width||s.composer.readBuffer.height!==full.height)throw Error('High reduced scene resolution');
        if(s.gtao.width!==Math.ceil(full.width/2)||s.gtao.height!==Math.ceil(full.height/2))throw Error('AO buffers were not scaled independently');
        s.setQuality('low');window.__actualRender();
        if(s.composer||s.gtao||s.bloom||s.sun.shadow.map)throw Error('High GPU targets retained in Eco');
        cycles.push(s.renderer.info.memory.textures);
      }
      const original=s.renderer.setSize.bind(s.renderer);let resizes=0;
      s.renderer.setSize=(...args)=>{resizes++;return original(...args);};
      s.resize(s.width,s.height);s.resize(s.width,s.height);
      s.renderer.setSize=original;
      const w=s.width,h=s.height;
      const dpr=Object.getOwnPropertyDescriptor(window,'devicePixelRatio');
      try {
        s.setQuality('high');
        for(const ratio of [1,2]){
          Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:ratio});
          s.resize(640,360);
          if(s.renderer.domElement.width!==640*ratio||s.composer.readBuffer.width!==640*ratio||s.composer.readBuffer.height!==360*ratio)throw Error('Display-density resize lost sharp scene pixels');
          if(s.gtao.width!==640||s.gtao.height!==360)throw Error('AO size did not follow display-density resize');
          window.__actualRender();
        }
      } finally {
        if(dpr)Object.defineProperty(window,'devicePixelRatio',dpr);else delete window.devicePixelRatio;
        s.resize(w,h);s.setQuality('low');
      }
      return {baseline,cycles,resizes};
    });
    assert.ok(resources.cycles.every(n=>n===resources.baseline),JSON.stringify(resources));
    assert.equal(resources.resizes,0,'Unchanged layout reallocated drawing buffers');
    console.log('Quality switching GPU textures:',resources);
    const terrain=await page.evaluate(()=>{
      const g=game,s=g.stage;
      g.reset(12345);g.wipeUnits();g.level=16;g.state='build';g.loadLevel();s.updateCamera();
      const sections=g.zoneMesh.children.filter(o=>o.name.startsWith('terrain-'));
      const seen=new Map();let shared=0;
      for(const mesh of sections){
        const {position,normal,color}=mesh.geometry.attributes;
        for(let i=0;i<position.count;i++){
          const key=[position.getX(i),position.getY(i),position.getZ(i)].join(',');
          const value=[normal.getX(i),normal.getY(i),normal.getZ(i),color.getX(i),color.getY(i),color.getZ(i)].join(',');
          if(seen.has(key)){shared++;if(seen.get(key)!==value)throw Error('Terrain section has a lighting seam');}
          else seen.set(key,value);
        }
      }
      const measure=()=>{s.renderer.info.reset();window.__actualRender();return s.renderer.info.render.triangles;};
      const culled=measure();
      sections.forEach(o=>{o.frustumCulled=false;});const whole=measure();
      sections.forEach(o=>{o.frustumCulled=true;});
      return {sections:sections.length,shared,culled,whole};
    });
    assert.ok(terrain.sections>1&&terrain.shared>0,JSON.stringify(terrain));
    assert.ok(terrain.culled<terrain.whole*0.5,JSON.stringify(terrain));
    console.log('Same terrain with/without off-screen culling:',terrain);
    assert.deepEqual(errors,[]);
    console.log('PASS: sharp Eco/High, frame caps, paused input, hidden-tab resume, GPU cleanup, stable resize, seamless terrain culling');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
