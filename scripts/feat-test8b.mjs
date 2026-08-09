// 阶段6 第八轮b:商人 NPC(生成+交易)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat8b');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const results = {};
  // 商人存在
  const merch = g.entities.npcs.find(n => n.npcKey === 'merchant');
  results.merchantSpawned = { found: !!merch, pos: merch ? [Math.floor(merch.cx / 16), Math.floor(merch.cy / 16)] : null };
  // 走到商人旁右键
  if (merch) {
    p.x = merch.x - 30; p.y = merch.y;
    await sleep(300);
    // 给铜币
    inv.add(items['coin_copper'], 200);
    const coinSlot = inv.slots.findIndex(s => s && s.id === items['coin_copper']);
    const before = inv.slots[coinSlot].stack;
    const invCount = inv.slots.filter(s => s).length;
    // 右键商人方向
    const vw = g.camera.viewW, vh = g.camera.viewH;
    g.input.mouseX = (merch.cx - g.camera.x) * g.camera.zoom + vw / 2;
    g.input.mouseY = (merch.cy - g.camera.y) * g.camera.zoom + vh / 2;
    g.input.rightDown = true;
    await sleep(150);
    g.input.rightDown = false;
    await sleep(150);
    const after = inv.slots[coinSlot] ? inv.slots[coinSlot].stack : 0;
    results.trade = {
      coinsBefore: before, coinsAfter: after,
      spent: before - after,
      invGrew: inv.slots.filter(s => s).length > invCount,
    };
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
