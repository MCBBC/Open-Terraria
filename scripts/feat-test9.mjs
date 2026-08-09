// 阶段6 第九轮单测:Boss 召唤物(史莱姆王冠→king_slime 生成+消耗)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat9');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const results = {};
  inv.add(items['slime_crown'], 1);
  let slot = -1;
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items['slime_crown']) slot = i;
  inv.selected = slot;
  const enemiesBefore = g.entities.enemies.filter(e => !e.dead).length;
  // 设为夜间(Boss 白天会按原版逻辑逃离)
  g.world.clock.timeOfDay = 0.9;
  g.enemySpawnEnabled = true;
  g.input.mouseDown = true;
  await sleep(200);
  g.input.mouseDown = false;
  await sleep(300);
  const bosses = g.entities.enemies.filter(e => e.constructor && e.def && e.def.boss);
  const bossRef = g.boss;
  results.summon = {
    consumed: !inv.slots[slot],
    bossCount: bosses.length,
    bossKeys: bosses.map(b => b.def.key),
    bossAliveRef: !!bossRef && !bossRef.dead,
    bossKey: bossRef ? bossRef.def.key : null,
    enemiesBefore,
    ok: !!bossRef && !bossRef.dead,
  };
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
