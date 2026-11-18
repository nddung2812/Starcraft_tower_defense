// The battlefield stays clear: the unit panel is closed until asked for, and messages are few, slim and short.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8765'); await page.waitForFunction(() => window.game);
    await page.locator('#introBtn').click();
    await page.evaluate(() => { game.paused = true; game.stage.render = () => {}; });
    const stageWidth = () => page.evaluate(() => document.querySelector('.stage').getBoundingClientRect().width);
    const panel = page.locator('#unitPanel'), tabs = page.locator('.panel__tabs');

    // ---- closed by default, the battlefield takes the full width ----
    assert.equal(await panel.isVisible(), false);
    const full = await stageWidth();
    assert.ok(full > 1400, `Battlefield is ${full}px wide`);

    // ---- I and the info button open it beside the battlefield, not over it ----
    await page.keyboard.press('i');
    assert.equal(await tabs.isVisible(), true);
    assert.equal(await page.locator('#btnInspector').getAttribute('aria-expanded'), 'true');
    const open = await page.evaluate(() => ({ stage: document.querySelector('.stage').getBoundingClientRect().right, panel: document.getElementById('unitPanel').getBoundingClientRect().left }));
    assert.ok(open.panel >= open.stage, 'Open panel sits beside the battlefield');
    await page.locator('#btnInspector').click();
    assert.equal(await panel.isVisible(), false);
    assert.equal(await stageWidth(), full);

    // ---- selecting a unit leaves it closed; the Ridge Relay opens it and closes it again ----
    await page.evaluate(() => game.emit('selectOnly', game.gunners[0]));
    assert.equal(await panel.isVisible(), false);
    await page.evaluate(() => { game.emit('selectOnly', game.core); game.emit('change'); });
    assert.equal(await page.locator('#btnBaseUpgrade').isVisible(), true);
    await page.evaluate(() => game.emit('selectOnly', game.gunners[0]));
    assert.equal(await panel.isVisible(), false);

    // ---- a panel you opened yourself stays open when the selection changes ----
    await page.keyboard.press('i');
    await page.evaluate(() => { game.emit('selectOnly', game.core); game.emit('selectOnly', game.gunners[0]); });
    assert.equal(await tabs.isVisible(), true);
    await page.keyboard.press('i');

    // ---- a boss keeps a slim health bar on screen, and nothing else of the panel ----
    await page.evaluate(() => {
      const a = game.assault; a.plan = { name: 'Test Boss', difficulty: 'hard' }; a.marks = a.marks || []; a.status = 'Testing';
      game.ui?.updateAssault?.(); game.emit('change');
    });
    assert.equal(await page.locator('#bossMeter').isVisible(), true);
    assert.equal(await tabs.isVisible(), false);
    const bar = await panel.boundingBox();
    assert.ok(bar.width <= 260 && bar.height <= 110, `Boss bar is ${bar.width}×${bar.height}`);
    await page.evaluate(() => { game.assault.plan = null; game.emit('change'); });
    assert.equal(await panel.isVisible(), false);

    // ---- one message at a time, a warning survives routine news, and each leaves quickly ----
    const toasts = () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast b')].map(b => b.textContent));
    await page.evaluate(() => { document.getElementById('toasts').replaceChildren(); game.emit('supplyCollected', { crate: { value: 10 }, recharge: false }); game.emit('redeployed', { placed: 2, waiting: 0 }); });
    assert.deepEqual(await toasts(), ['Army redeployed · 2 units']);
    await page.evaluate(() => { document.getElementById('toasts').replaceChildren(); game.emit('mawTook', { spec: { info: { name: 'Trooper' } } }); game.emit('redeployed', { placed: 2, waiting: 0 }); });
    assert.deepEqual(await toasts(), ['Unit lost to a Tunnel Maw']);
    await page.waitForFunction(() => !document.querySelector('#toasts .toast'), null, { timeout: 4600 });

    // ---- streaks and supply drops no longer take the top of the screen; an event gets one message, not two ----
    await page.evaluate(() => { document.getElementById('callout').hidden = true; game.emit('streak', { name: 'LINE HOLDING', streak: 10, bonus: 20 }); game.emit('supply'); });
    assert.equal(await page.locator('#callout').isVisible(), false);
    await page.evaluate(() => { document.getElementById('toasts').replaceChildren(); game.emit('maw'); });
    assert.equal(await page.locator('#callout').isVisible(), true);
    assert.deepEqual(await toasts(), []);
    const strip = await page.locator('#callout').boundingBox();
    assert.ok(strip.height <= 40, `Callout is ${strip.height}px tall`);
    await page.locator('#callout').waitFor({ state: 'hidden', timeout: 2600 });

    assert.deepEqual(errors, []);
    console.log('PASS: panel closed by default, I and button toggle, relay opens and closes it, boss bar, one short message at a time, warnings kept, no duplicate messages');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
