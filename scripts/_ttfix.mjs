// 修复验证：①文字层脉冲（面板 filter 空）②数字键切换（真实 KeyboardEvent）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
check('世界就绪', true);

// ① 悬停 + 脉冲归属
const t1 = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const v = await fetch('/sprites/vanilla.json').then((x) => x.json());
  const d = g.spawnDrop(g.player.cx, g.player.y + 4, `vi_4_${v.items['4'].key}`, 1, 0, -1);
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  const sel = g.player.inv.slots.findIndex((sl) => sl && sl.id === d.itemId);
  g.player.inv.selected = sel;
  ui['showTooltipFor'](sel, 'inv');
  await new Promise((r2) => setTimeout(r2, 300));
  const lines = ui.tooltip.querySelector('.sw-tooltip-lines');
  return {
    panelFilter: ui.tooltip.style.filter,
    hasLines: !!lines,
    linesF1: lines?.style.filter ?? '(none)',
    txt: lines?.innerText.slice(0, 16),
  };
});
await new Promise((r) => setTimeout(r, 500));
const t2 = await page.evaluate(() => {
  const el = window.__swUI.tooltip.querySelector('.sw-tooltip-lines');
  return { linesF2: el ? el.style.filter : null };
});
check('面板 filter 已清（恒定底色）', t1.panelFilter === '', JSON.stringify(t1.panelFilter));
check('文字层容器存在', t1.hasLines && !!t1.txt);
check('脉冲只打文字层且在动', t1.linesF1 !== t2.linesF2, `${t1.linesF1} → ${t2.linesF2}`);

// ② 数字键：真实 keydown 事件
const keys = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const before = g.player.inv.selected;
  const results = [];
  const press = (code) => new Promise((res) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    setTimeout(() => res(g.player.inv.selected), 30);
  });
  (async () => {
    results.push(['Digit3', await press('Digit3')]);
    results.push(['Digit7', await press('Digit7')]);
    results.push(['Digit0', await press('Digit0')]);
    results.push(['Digit1', await press('Digit1')]);
    resolve({ before, results });
  })();
}));
check('Digit3 → 2', keys.results[0][1] === 2, JSON.stringify(keys.results));
check('Digit7 → 6', keys.results[1][1] === 6);
check('Digit0 → 9', keys.results[2][1] === 9);
check('Digit1 → 0', keys.results[3][1] === 0);

// ③ 刷新链不再被 advisor 炸掉：refreshAllNow 直调不抛
const rf = await page.evaluate(() => {
  try { window.__swUI['refreshAllNow'](); return 'ok'; } catch (e) { return String(e).slice(0, 80); }
});
check('refreshAllNow 直调无抛', rf === 'ok', rf);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
