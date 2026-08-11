// 道具桥接冒烟：vi_ 镐挖掘 / vi_ 治疗药 / vi_ Buff 药（scripts/_itembridge-smoke.mjs）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MACOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('桥接测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const out = {};
  // 1. vi_ 铁镐 → itemFuncTool 桥接出 pick 40
  const pickId = g.itemId('vi_1_IronPickaxe');
  const t = g.itemFuncTool(pickId);
  out.viPick = t ? { type: t.type, power: t.power } : null;
  // 2. vi_ 治疗药水 188（healLife 100）：手持有并触发 updateUse
  const healId = g.itemId('vi_188_HealingPotion');
  p.inv.slots[0] = { id: healId, stack: 5 };
  p.inv.selected = 0;
  p.hp = 50; p.useTime = 0;
  g.input.mouseDown = true; g.input.uiBlocking = false;
  try { g.updateUse(1); } catch (e) { out.useErr = String(e).slice(0, 100); }
  g.input.mouseDown = false;
  out.afterHeal = { hp: p.hp, stack: p.inv.slots[0]?.stack ?? 0, sick: p.buffs.healBlocked };
  // 3. vi_ 铁皮药水 1161（buffType 5 → Ironskin）
  p.useTime = 0; p.hp = 100;
  const ironId = g.itemId('vi_1161_IronskinPotion');
  p.inv.slots[0] = { id: ironId, stack: 2 };
  g.input.mouseDown = true;
  try { g.updateUse(1); } catch (e) { out.useErr2 = String(e).slice(0, 100); }
  g.input.mouseDown = false;
  out.afterBuff = { defense: p.defense, activeCount: p.buffs.active.size, stack: p.inv.slots[0]?.stack ?? 0 };
  return out;
});
console.log('BRIDGE', JSON.stringify(res));
console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
await browser.close();
