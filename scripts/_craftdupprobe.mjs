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
  // 脚边放工作台（木锤=workbench 站点门；木墙原版段 tile 18 同站）
  const st = g.world.store;
  const cx = Math.floor(g.player.cx / 16), fy = Math.floor((g.player.y + g.player.h) / 16);
  const wb = window.__swTiles['workbench'];
  st.setTile(cx + 1, fy - 1, wb);
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
  // 木墙走原版段(93),材料 id 9 只有本地 wood 无 vid → collectOwnedItems 不可见,
  // 属"本地材料未桥接原版 id 空间"已知缺口(材料桥接待做),非双显问题
  check(`木墙无双显行（≤1 条;0=材料桥接缺口已知项）`, wallRows.length <= 1, JSON.stringify(wallRows));
  // ---- 键盘穿透回归 ----
  const kb = await page.evaluate(() => {
    const out = {};
    const g = window.__swGame;
    // 1) 搜索框打字:按 E 不应关背包(事件从 input 冒泡,target=input)
    const search = window.__swUI.craftSearchEl;
    search.focus();
    search.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true, cancelable: true }));
    out.stillOpenAfterE = window.__swUI.invPanel.style.display === 'block';
    // 2) 空格不再被游戏层 preventDefault(cancelable 事件可查 defaultPrevented)
    const sp = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    search.dispatchEvent(sp);
    out.spaceNotDefaultPrevented = !sp.defaultPrevented;
    // 3) 背包开着按数字键不切快捷栏(uiBlocking 门;事件 target=window)
    const sel0 = g.player.inv.selected;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5', bubbles: true }));
    out.hotbarUnchanged = g.player.inv.selected === sel0;
    return out;
  });
  check('搜索框打字按 E 不关背包', kb.stillOpenAfterE === true, JSON.stringify(kb));
  check('搜索框空格不被游戏层吞掉', kb.spaceNotDefaultPrevented === true, JSON.stringify(kb));
  check('背包打开数字键不切快捷栏', kb.hotbarUnchanged === true, JSON.stringify(kb));
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
