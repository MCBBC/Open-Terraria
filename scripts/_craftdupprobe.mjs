// 背包合成列表去重冒烟：木锤只出现一次；魔力水晶走原版段（坠星×5）不双显
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

// 塞材料：木 30 + 坠星 5（原版段魔力水晶可合成才会列出）
await page.evaluate(() => {
  const g = window.__swGame;
  const wood = window.__swItems['wood'];
  const star = window.__swItems['vi_75_fallen_star'];
  g.player.inv.add(wood, 30);
  g.player.inv.add(star, 5);
});
// 打开背包
await page.evaluate(() => window.__swUI.openInventory());
await new Promise((r) => setTimeout(r, 1200));
const rows = await page.evaluate(() => {
  const list = window.__swUI.craftListEl;
  if (!list) return null;
  return [...list.querySelectorAll('.sw-recipe')].map((r) => r.textContent.trim());
});
if (!rows) {
  check('合成列表存在', false, 'craftListEl null');
} else {
  const hammerRows = rows.filter((t) => t.includes('木锤') || t.includes('Wood Hammer') || t.includes('木 hammer'));
  check(`木锤配方仅一条（得 ${hammerRows.length} 条）`, hammerRows.length === 1, JSON.stringify(hammerRows));
  const manaRows = rows.filter((t) => t.includes('魔力水晶') || t.includes('Mana Crystal'));
  check(`魔力水晶仅一条且坠星×5（得 ${manaRows.length} 条）`,
    manaRows.length === 1 && /5\/5|\/5/.test(manaRows[0] ?? ''), JSON.stringify(manaRows));
  const wallRows = rows.filter((t) => t.includes('木墙') || t.includes('Wood Wall'));
  check(`木墙仅一条（得 ${wallRows.length} 条）`, wallRows.length === 1, JSON.stringify(wallRows));
  // 全列表同产物双显扫描（自制段同名文本 ≥2 即可疑）
  const counts = new Map();
  for (const t of rows) {
    const name = t.split(/\d+\//)[0].trim().replace(/×\d+.*$/, '').trim();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const dupNames = [...counts].filter(([, n]) => n > 1);
  check('全列表无同名双显行', dupNames.length === 0, JSON.stringify(dupNames.slice(0, 5)));
}
check('无页面错误', errors.length === 0, errors.join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
