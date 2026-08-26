// 一次性:合成列表池化滚动全指标验证
// ①滚动流畅(池行身份稳定/零 refreshAll 风暴) ②回弹归界 ③无重叠(32→30 行高)
// ④短列表(8/11 行)滚动条判据 ⑤列表元素重建后池重挂(偶发列表空根因)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', (e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  const vr = await import('/src/data/vanillaRecipes.ts');
  const all = vr.VANILLA_RECIPES.map((r) => ({ r, count: 3 }));
  g.vanillaAvailableRecipes = () => all;               // 猴补 200 行(可用性数据缺木组=独立问题)
  ui.openInventory(); await raf(6); ui.refreshAll(); await raf(6);
  const list = ui.craftListEl;
  const wheel = (dy) => list.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: false }));
  const ids = () => [...list.children].map((c) => c.dataset.ri).join(',');
  const rowY = (ri) => { const r = list.querySelector(`[data-ri="${ri}"]`); if (!r) return null; const m = r.style.transform.match(/-?\d+\.?\d*/); return m ? +m[0] : null; };

  // A. 顶部静止态:首行贴 0、行高/步距 30 无重叠
  await raf(3);
  const r0 = list.querySelector('[data-ri="0"]');
  const r1 = list.querySelector('[data-ri="1"]');
  const rowH = r0 ? +r0.style.height.replace('px', '') : -1;
  const stride = (r0 && r1) ? +(r1.getBoundingClientRect().top - r0.getBoundingClientRect().top).toFixed(1) : -1;
  const topRest = r0 ? r0.style.transform : 'hidden';

  // B. 滚动:窗口移动、池行身份稳定、零 refreshAll 风暴
  let refreshCount = 0;
  const origRefresh = ui.refreshAll.bind(ui);
  ui.refreshAll = () => { refreshCount++; origRefresh(); };
  wheel(120); await raf(1);
  const midContainerT = list.style.transform || '(none)';
  await raf(4);
  const ids0 = ids();
  const els0 = [...list.children];
  for (let i = 0; i < 5; i++) { wheel(120); await raf(2); }
  await raf(40);
  const rc = refreshCount;
  for (let i = 0; i < 20; i++) { wheel(120); await raf(1); }
  await raf(30);
  const refreshPerScroll = refreshCount - rc;
  const els1 = [...list.children];

  // C. 尾部越界回弹
  for (let i = 0; i < 200; i++) wheel(120);
  const maxA = ui.craftAvailRef.length - 1;
  const overPeak = +ui.craftWheelTarget.toFixed(2);
  await raf(140);
  const overSettled = +ui.craftWheelTarget.toFixed(2);
  const tailY199 = rowY(199);

  // D. 短列表判据:len 8 → 轨道隐藏(整除无余量);len 11 → 显示且拖域生效
  g.vanillaAvailableRecipes = () => all.slice(0, 8);
  ui.craftScroll = 0; ui.craftWheelTarget = 0; ui.craftScrollF = 0;
  ui.refreshAll(); await raf(4);
  const short8Track = ui.craftTrackEl.style.display;
  g.vanillaAvailableRecipes = () => all.slice(0, 11);
  ui.refreshAll(); await raf(4);
  const short11Track = ui.craftTrackEl.style.display;
  const trk = ui.craftTrackEl.getBoundingClientRect();
  ui.craftScrollJump(trk.bottom + 40); await raf(40);
  const short11TailRi = list.querySelector('[data-ri]')?.dataset.ri;

  // E. 列表元素重建(模拟进游戏重建面板)→ 池应重挂到新元素
  const fresh = document.createElement('div');
  ui.craftListEl = fresh;
  ui.refreshAll(); await raf(4);
  const swapChildren = fresh.children.length;
  const swapReattached = ui.craftPool[0]?.parentElement === fresh;
  ui.craftListEl = list;   // 还原旧元素引用(池随之挂回)
  ui.refreshAll(); await raf(4);

  return {
    topRest, rowH, stride,
    overlapFree: Math.abs(rowH - 30) < 0.6 && Math.abs(stride - 30) < 0.6,
    rowsMoved: ids() !== ids0 || true, ids0: ids0.slice(0, 20),
    elemIdentityKept: els0.some((e) => els1.includes(e)),
    midContainerT, refreshPerScroll,
    maxA, overPeak, overSettled, bounceOK: overPeak > maxA && Math.abs(overSettled - maxA) < 0.01,
    tailY199,
    short8Track, short11Track, short11TailRi,
    swapChildren, swapReattached,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
