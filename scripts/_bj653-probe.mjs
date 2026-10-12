// 一次性:BJ653 落刀后取证探针 v2（私有实例 5204）。
//   面2 修后：掉落行 hover → .sw-tooltip 挂 body（顶层语境）→ 面板/遮罩之上（截屏物证）
//   面1 修后：掉落行文案合成（无段行无前导空格;段前缀形 "(1-2) 100%"）
//   面3：进度条几何（15px 滑条/7px 带——原版 1:1,零刀面复核）
// SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_bj653-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());

await page.evaluate(async () => {
  const g = window.__swGame;
  const { bestiaryGating } = await import('/src/data/Bestiary.ts');
  bestiaryGating.unlockAll = true;
  const ui = window.__swUI;
  const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
  window.__bj653Panel = new BestiaryPanel(document.body, {
    getTracker: () => g.world.bestiary,
    atlas: g.renderer?.atlas ?? null,
    isCrimson: () => false,
    isExpert: () => true,
    isMaster: () => false,
    showItemTooltip: (itemId, anchor, notes) => ui.showFloatingItemTooltip(itemId, anchor, notes),
    hideItemTooltip: () => ui.hideFloatingItemTooltip(),
    uiHeldItemRef: () => false,
    onBack: () => {},
  });
  await new Promise((r) => setTimeout(r, 800));
});
await page.waitForSelector('.sw-bst', { timeout: 8000 });
await wait(1200);

// 真击杀注入（tracker.registerKill → realUnlockState 满 → 无需 unlockAll 兜底也行）
const clickCell = async (creditRe) => {
  for (let pg = 0; pg < 16; pg++) {
    const hit = await page.evaluate((re) => {
      const rx = new RegExp(re, 'i');
      const cells = [...document.querySelectorAll('.sw-bst-cell')];
      const c = cells.find((x) => rx.test(x.dataset.credit ?? ''));
      if (!c) return false;
      c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }, creditRe);
    if (hit) { await wait(700); return true; }
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.sw-bst-imgbtn');
      (btns[1] ?? null)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await wait(450);
  }
  return false;
};

const opened = await clickCell('BlueSlime|蓝史莱姆');
console.log('BlueSlime cell clicked:', opened);
const dbg = await page.evaluate(() => ({
  dropRows: document.querySelectorAll('.sw-bst-drop').length,
  rtTexts: [...document.querySelectorAll('.sw-bst-drop .rt')].map((e) => JSON.stringify(e.textContent)),
  detailHead: document.querySelector('.sw-bst-nameplate')?.textContent ?? '(no nameplate)',
}));
console.log('detail:', JSON.stringify(dbg));

// 面1：行文案合成（凝胶行 "(1-2) 100%" 无前导空格;法杖行 ".01%"）
const gelRow = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.sw-bst-drop')];
  return rows.map((r) => r.querySelector('.rt')?.textContent ?? '');
});
console.log('F1 row texts:', JSON.stringify(gelRow));
const compositionOk = gelRow.some((t) => t === ' (1-2) 100%') && gelRow.some((t) => t === '.01%');
console.log('F1 composition (no leading space, ???-shape n/a here):', compositionOk ? 'PASS' : 'FAIL');

// 面2：悬停史莱姆法杖行（.01% 行）→ tooltip 层序取证
const staffLine = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.sw-bst-drop')];
  const line = rows.find((r) => /^\.01%$/.test(r.querySelector('.rt')?.textContent ?? '')) ?? rows[0];
  if (!line) return null;
  const r = line.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (staffLine) {
  await page.mouse.move(staffLine.x, staffLine.y);
  await wait(450);
  const layer = await page.evaluate(() => {
    const tip = document.querySelector('.sw-tooltip');
    const bst = document.querySelector('.sw-bst');
    const chain = [];
    let e = tip;
    while (e && e !== document.documentElement) { chain.push((e.className?.toString().split(' ')[0]) || e.tagName); e = e.parentElement; }
    return {
      tipDisplay: tip?.style.display ?? 'none',
      parentChain: chain.join(' < '),
      zTip: tip ? getComputedStyle(tip).zIndex : null,
      zBst: bst ? getComputedStyle(bst).zIndex : null,
      tipText: (tip?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 60),
    };
  });
  console.log('F2 layer (post-fix):', JSON.stringify(layer));
  await page.screenshot({ path: '/tmp/bj653-tooltip-postfix.png' });
  await page.mouse.move(10, 10);
  await wait(300);
}

// 面3：进度条几何（修后复核 = 零刀面）
const bar = await page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { h: +b.height.toFixed(2), w: +b.width.toFixed(2) }; };
  return { bottom: r(document.querySelector('.sw-bst-bottom')), bar: r(document.querySelector('.sw-bst-bar')), band: r(document.querySelector('.sw-bst-bar i')) };
});
console.log('F3 bar (post-fix):', JSON.stringify(bar));

await page.evaluate(() => window.__bj653Panel?.close());
await wait(300);
console.log('panel closed:', await page.evaluate(() => !document.querySelector('.sw-bst')));
console.log('done');
browser.close();
process.exit(0);
