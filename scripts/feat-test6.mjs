// 阶段6 第六轮单测:篝火光环回血
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat6');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player;
  const tiles = window.__swTiles;
  const results = {};
  const px = Math.floor(p.cx / 16), py = Math.floor((p.y + p.h) / 16);
  const FIRE = tiles['v_215_campfires'];
  // 放篝火在玩家旁边
  const fx = px + 2, fy = py - 2;
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
    st.setTile(fx + dx, fy + dy, 0);
  }
  st.setTile(fx, fy, FIRE, 0, 0);
  // 扣血到 50
  p.hp = 50;
  p.sinceHurt = 999;
  await sleep(3200); // 3 秒:光环扫描(20tick)+ 回血 3 次
  results.campfireRegen = {
    hpBefore: 50, hpAfter: p.hp,
    hasBuff: p.buffs.has(5),
    ok: p.hp > 50,
  };
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
