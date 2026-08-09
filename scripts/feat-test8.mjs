// 阶段6 第八轮单测:魔法武器(消耗魔力→投射物→命中敌人)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat8');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const results = {};
  // 初始魔力
  results.initialMana = { mana: p.mana, max: p.maxMana };
  // 给法杖
  inv.add(items['wand_of_sparking'], 1);
  let slot = -1;
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items['wand_of_sparking']) slot = i;
  inv.selected = slot;
  // 施法(瞄准远处)
  const vw = g.camera.viewW, vh = g.camera.viewH;
  g.input.mouseX = vw - 100; g.input.mouseY = vh / 2;
  g.input.mouseDown = true;
  await sleep(80);
  const projs = g.entities.projectiles.filter(e => e.constructor.name === 'MagicProj');
  const manaAfter = p.mana;
  g.input.mouseDown = false;
  await sleep(150);
  results.cast = { manaAfter, consumed: results.initialMana.mana - manaAfter, projCount: projs.length, ok: projs.length >= 1 && manaAfter < results.initialMana.mana };
  // 魔力耗尽拒绝
  p.mana = 1;
  g.input.mouseDown = true;
  await sleep(100);
  const manaBlocked = p.mana;
  g.input.mouseDown = false;
  results.blocked = { manaBefore: 1, manaAfter: manaBlocked, blocked: manaBlocked === 1 };
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
