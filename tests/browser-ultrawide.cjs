const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
 try {
  const page = await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [width,height] of [[2560,1080],[3440,1440],[3840,1600],[1720,720]]) {
   await page.setViewportSize({width,height});
   await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>window.game);
   await page.locator('#introBtn').click();await page.locator('#btnPause').click();
   const info=await page.evaluate(()=>{
    const s=game.stage,rect=document.getElementById('game').getBoundingClientRect();
    const bounds=['.hud','.stage','.panel','.dock','.minimap','#btnPause'].map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {sel,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
    const hit=s.pick({x:0,y:0});
    return {overflow:document.documentElement.scrollWidth>innerWidth,bounds,aspect:s.camera.aspect,expected:rect.width/rect.height,dist:s.dist,hitError:Math.hypot(hit.x-s.focus.x,hit.z-s.focus.z)};
   });
   assert.equal(info.overflow,false);assert.ok(Math.abs(info.aspect-info.expected)<0.001);assert.ok(info.hitError<0.01);assert.equal(info.dist,14);
   for(const r of info.bounds){assert.ok(r.x>=0&&r.y>=0&&r.right<=width+1&&r.bottom<=height+1&&r.width>0&&r.height>0,JSON.stringify(r));}
   await page.locator('#camOut').click();assert.ok(await page.evaluate(()=>game.stage.dist>14));
   await page.locator('#camReset').click();assert.equal(await page.evaluate(()=>game.stage.dist),14);
   await page.locator('[data-build="marine"]').click();
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#btnPause').textContent(),'Resume');
   if(width===3440)await page.screenshot({path:'/tmp/td-ultrawide-3440.png'});
   console.log(`PASS ${width}×${height}: layout, camera aspect, picking, zoom/reset, build control, pause`);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
