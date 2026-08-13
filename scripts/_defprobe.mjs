// 背包防御计数器 + 悬停详情验证
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 开背包 → 防御计数器存在且数值=player.defense
await page.evaluate(() => window.__swUI.openInventory());
await new Promise((r) => setTimeout(r, 600));
const def = await page.evaluate(() => {
  const row = document.querySelector('[data-role="defense"]');
  if (!row) return { missing: true };
  const num = row.querySelector('span')?.textContent;
  return { num, player: window.__swGame.player.defense };
});
check('背包防御数值显示且正确', def.num === String(def.player), JSON.stringify(def));

// 穿 vi_90 铁盔(+2)后再开 → 数值 +2
const def2 = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_90_/.test(k));
  p.inv.armor[0] = { id: window.__swItems[key], stack: 1 };
  window.__swUI.refreshAll();
  const row = document.querySelector('[data-role="defense"]');
  return { num: row?.querySelector('span')?.textContent, player: p.defense };
});
check('穿铁盔后防御数值联动(+2)', def2.num === String(def2.player) && Number(def2.num) === Number(def.num) + 2, JSON.stringify(def2));

// 悬停道具 tooltip:槽 0(铜镐)→ 显示名称+伤害行
// 真实鼠标悬停第一个快捷栏槽(合成 mouseenter 不触发)
const box0 = await page.evaluate(() => {
  const slot = document.querySelector('.sw-hotbar .sw-slot') ?? document.querySelector('.sw-slot');
  const r = slot.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(box0.x, box0.y);
await new Promise((r) => setTimeout(r, 250));
const tt = await page.evaluate(() => {
  const tip = window.__swUI.tooltip;
  return { shown: tip.style.display === 'block' && tip.innerHTML.length > 0, snippet: tip.innerHTML.slice(0, 140) };
});
check('悬停道具显示详情 tooltip', tt.shown, JSON.stringify(tt.snippet));

check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
