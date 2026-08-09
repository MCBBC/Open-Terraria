// 第九轮b:世吞体节链(vanilla 13+链)与克脑(266)召唤
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat9b');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const results = {};
  g.world.clock.timeOfDay = 0.9;
  // 世吞
  inv.add(items['worm_food'], 1);
  let slot = inv.slots.findIndex(s => s && s.id === items['worm_food']);
  inv.selected = slot;
  g.input.mouseDown = true; await sleep(200); g.input.mouseDown = false;
  await sleep(400);
  const boss = g.boss;
  const segCount = g.entities.enemies.filter(e => e.wormFollow || (e.wormNext && e !== boss)).length;
  results.eow = {
    headVanillaId: boss ? boss.vanillaId : null,
    hasChain: !!boss && !!boss.wormNext,
    segCount,
    ok: !!boss && boss.vanillaId === 13 && !!boss.wormNext,
  };
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
