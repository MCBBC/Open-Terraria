// 第九轮c:护士治疗(付费回满)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat9c');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const results = {};
  const nurse = g.entities.npcs.find(n => n.npcKey === 'nurse');
  results.nurseSpawned = { found: !!nurse };
  if (nurse) {
    p.x = nurse.x - 30; p.y = nurse.y;
    await sleep(300);
    p.hp = 30;
    inv.add(items['coin_copper'], 100);
    const coinSlot = inv.slots.findIndex(s => s && s.id === items['coin_copper']);
    const before = inv.slots[coinSlot].stack;
    const vw = g.camera.viewW, vh = g.camera.viewH;
    g.input.mouseX = (nurse.cx - g.camera.x) * g.camera.zoom + vw / 2;
    g.input.mouseY = (nurse.cy - g.camera.y) * g.camera.zoom + vh / 2;
    g.input.rightDown = true;
    await sleep(150);
    g.input.rightDown = false;
    await sleep(200);
    const after = inv.slots[coinSlot] ? inv.slots[coinSlot].stack : 0;
    const hpNow = g.player.hp;
    results.heal = {
      hpBefore: 30, hpAfter: hpNow,
      coinsBefore: before, coinsAfter: after,
      healed: p.hp > 30, cost: before - after,
    };
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
