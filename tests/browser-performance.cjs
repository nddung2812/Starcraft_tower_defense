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
      renders=0;
      Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
      const pausedAt=g.time;__pump(240);const hidden=renders,hiddenSeconds=g.time-pausedAt;
      Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));
      // Resume timestamp follows the browser clock; align the synthetic clock before pumping.
      window.__time=performance.now();__pump(120);const resumed=renders;
      return {idle,eco,high,hidden,hiddenSeconds,ecoSeconds,ecoPortraits,ecoMinimaps,highPortraits,highMinimaps,resumed};
    });
    assert.ok(scheduling.idle>=7&&scheduling.idle<=9,JSON.stringify(scheduling));
    assert.ok(scheduling.eco>=58&&scheduling.eco<=62,JSON.stringify(scheduling));
    assert.ok(scheduling.high>=118&&scheduling.high<=122,JSON.stringify(scheduling));
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
    assert.deepEqual(errors,[]);
    console.log('PASS: Eco defaults, lazy effects, 30/60 fps caps, 4 fps menus, 8 Hz portrait, 10 Hz minimap, hidden-tab pause, resume, reduced GPU passes');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
