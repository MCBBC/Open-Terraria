// 成就系统 + 三项 UI 修复探针（垃圾桶图标/面板半透/白闪限定）：
//   ① achievements 实例 137 项注册 + localStorage 持久化
//   ② 垃圾桶空槽 Trash.png 图标（.sw-trash-icon）
//   ③ .sw-panel 半透（alpha ≤0.8）
//   ④ sw-loadout-flash 仅切预设触发且 600ms 后自摘；开关背包不再重播
//   ⑤ 提示牌 .sw-ach-advisor + 成就按钮 → 菜单 137 行 + 分类过滤
//   ⑥ 木头掉落拾取 → TIMBER 解锁 + toast + 持久化
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('成就测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const res = { steps: [] };
  const ok = (name, cond, extra) => { res.steps.push({ name, pass: !!cond, extra }); return cond; };

  // ① 注册表
  ok('achievements.count==137', g.achievements.count === 137, g.achievements.count);
  ok('初始未完成 TIMBER', !g.achievements.isCompleted('TIMBER'));

  // 打开背包
  ui.openInventory();
  await new Promise(r => setTimeout(r, 300));
  // ② 垃圾桶图标（空槽）
  const trashIcon = document.querySelector('.sw-trash .sw-trash-icon');
  ok('垃圾桶空槽画 Trash.png', !!trashIcon && trashIcon.src.includes('Trash.png'), trashIcon?.src ?? null);

  // ③ 面板半透
  const panelBg = getComputedStyle(ui.invPanel).backgroundImage;
  ok('面板背景半透(0.78/0.8)', panelBg.includes('rgba(38, 50, 90, 0.78)') || panelBg.includes('rgba(38,50,90,0.78)'), panelBg.slice(0, 80));

  // ④ 白闪限定：切预设 → 有 class → 700ms 后自摘
  const loBtn = document.querySelector('[data-lo="1"]');
  loBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  const duringSwitch = ui.invPanel.classList.contains('sw-loadout-flash');
  await new Promise(r => setTimeout(r, 750));
  const afterSwitch = ui.invPanel.classList.contains('sw-loadout-flash');
  ok('切预设触发白闪', duringSwitch);
  ok('白闪 600ms 自摘', !afterSwitch);
  // 关开背包不再重播
  ui.closeInventory();
  ui.openInventory();
  await new Promise(r => setTimeout(r, 300));
  ok('重开背包无白闪残留', !ui.invPanel.classList.contains('sw-loadout-flash'));

  // ⑤ 提示牌 + 菜单
  const advisor = document.querySelector('.sw-ach-advisor');
  ok('提示牌存在', !!advisor, advisor?.textContent ?? null);
  const achBtn = [...document.querySelectorAll('button')].find(b => b.textContent === '成就');
  ok('成就按钮存在', !!achBtn);
  achBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const panel = document.querySelector('.sw-ach-panel');
  ok('成就菜单打开', !!panel);
  const rows = document.querySelectorAll('.sw-ach-panel .sw-ach-row').length;
  ok('菜单 137 行', rows === 137, rows);
  const catBtns = document.querySelectorAll('.sw-ach-panel .sw-ach-cat').length;
  ok('分类过滤 4 钮', catBtns === 4, catBtns);
  // 分类过滤：全关 Slayer → 行数减少
  const firstCat = document.querySelector('.sw-ach-panel .sw-ach-cat');
  firstCat.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  const rowsFiltered = document.querySelectorAll('.sw-ach-panel .sw-ach-row').length;
  ok('分类过滤生效', rowsFiltered === 137 - 31, `${rows} → ${rowsFiltered}`);
  // 关闭
  const closeBtn = document.querySelector('.sw-ach-panel .sw-btn');
  closeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  ok('菜单可关', !document.querySelector('.sw-ach-panel'));

  // ⑥ 掉落拾取 → TIMBER 解锁 + 持久化 + toast
  ui.openInventory();
  await new Promise(r => setTimeout(r, 200));
  ui.closeInventory();
  const woodKey = Object.keys(window.__swItems).find(k => k === 'vi_9_wood' || k.startsWith('vi_9_'));
  g.spawnDrop(g.player.cx + 10, g.player.cy, woodKey, 1, 0, 0);
  await new Promise(r => setTimeout(r, 900));
  ok('拾取木头 → TIMBER 解锁', g.achievements.isCompleted('TIMBER'));
  const stored = localStorage.getItem('sbw.achievements.v1');
  ok('localStorage 持久化', !!stored && stored.includes('TIMBER'), stored?.slice(0, 80));

  // 世界进入基线：初始装备（铜镐 vi_3509? 拾取链不触发——但 achOnWorldEnter 已扫包）
  ok('顾问可算进度', typeof g.achievements.progressOf('TIMBER') === 'object');

  ui.closeInventory();
  return res;
});
console.log(JSON.stringify(out, null, 1));
const failed = out.steps.filter(s => !s.pass);
console.log(failed.length ? `✗ ${failed.length} 项未过：${failed.map(f => f.name).join(' | ')}` : '✓ 全部通过');
if (errs.length) console.log('页面错误:', errs.slice(0, 5));
await browser.close();
process.exit(failed.length || errs.length ? 1 : 0);
