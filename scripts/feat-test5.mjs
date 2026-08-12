// 阶段6 第五轮单测:弓箭(消耗弹药→投射物→命中敌人/撞块回收)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
await page.type('input', 'feat5');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const results = {};
  // 给弓+箭
  inv.add(items['wooden_bow'], 1);
  inv.add(items['wooden_arrow'], 50);
  let bowSlot = -1, arrowSlot = -1;
  for (let i = 0; i < inv.slots.length; i++) {
    const sl = inv.slots[i];
    if (sl && sl.id === items['wooden_bow']) bowSlot = i;
    if (sl && sl.id === items['wooden_arrow']) arrowSlot = i;
  }
  inv.selected = bowSlot;
  const arrowsBefore = inv.slots[arrowSlot].stack;
  // 瞄准:鼠标放玩家右侧远处
  g.input.mouseX = 1100; g.input.mouseY = 400;
  g.input.mouseDown = true;
  await sleep(80);
  const arrowsEarly = g.entities.projectiles.filter((e) => e.constructor.name === 'Arrow').length;
  g.input.mouseDown = false;
  await sleep(200);
  const arrowsAfter = inv.slots[arrowSlot].stack;
  const arrows = g.entities.projectiles.filter((e) => e.constructor.name === 'Arrow');
  results.bowShoot = {
    consumed: arrowsBefore - arrowsAfter,
    projCount: arrowsEarly,
    ok: arrowsBefore - arrowsAfter >= 1 && arrowsEarly >= 1,
  };
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
