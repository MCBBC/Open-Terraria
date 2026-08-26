// 一次性:合成列表平滑滚动验证——①滚动帧池行元素身份稳定(hover 稳)②滚轮不触发
// refreshAll 风暴③尾部越界回弹归界④拖拽/搜索后状态复位
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
  // 猴补配方源(200 行)——可用性管线的木组缺数据是独立问题,不在本测
  const vr = await import('/src/data/vanillaRecipes.ts');
  const fake = vr.VANILLA_RECIPES.slice(0, 200).map((r) => ({ r, count: 3 }));
  g.vanillaAvailableRecipes = () => fake;
  ui.openInventory();
  await raf(5);
  ui.refreshAll();
  await raf(5);
  if (!ui.craftAvailRef.length) return { fail: 'availRef empty after refresh' };
  const list = ui.craftListEl;
  const topCheck = () => {
    const r0 = list.querySelector('[data-ri="0"]');
    return r0 ? r0.style.transform : 'hidden';
  };
  const rowY = (ri) => {
    const r = list.querySelector(`[data-ri="${ri}"]`);
    if (!r) return null;
    const m = r.style.transform.match(/-?\d+\.?\d*/);
    return m ? +m[0] : null;
  };
  const wheel = (dy) => list.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: false }));
  const ids = () => [...list.children].map((c) => c.dataset.ri).join(',');
  let refreshCount = 0;
  const origRefresh = ui.refreshAll.bind(ui);
  ui.refreshAll = () => { refreshCount++; origRefresh(); };
  // A0: 顶部静止态——首行贴容器顶 + 行高/步距恰好 32(重叠检测)
  await raf(3);
  const topRest = topCheck();
  const containerTAtRest = list.style.transform || '(none)';
  const r0el = list.querySelector('[data-ri="0"]');
  const rowH = r0el ? r0el.getBoundingClientRect().height : -1;
  const r1el = list.querySelector('[data-ri="1"]');
  const stride = (r0el && r1el)
    ? (r1el.getBoundingClientRect().top - r0el.getBoundingClientRect().top) : -1;
  const overlapFree = Math.abs(rowH - 30) < 0.6 && Math.abs(stride - 30) < 0.6;
  // A0.5: 灵敏度——单击一格应走 ≥1 行
  wheel(120); await raf(60);
  const oneNotch = ui.craftScrollF;
  // 回顶
  ui.craftWheelTarget = 0; ui.craftWheelIdle = 0; ui.craftAnimKick();
  await raf(40);
  // 小步距(触控板式 30px)新手势 → 保底 1 行
  ui.craftWheelIdle = -1e9;   // 强制 fresh
  wheel(30); await raf(60);
  const freshSmall = ui.craftScrollF;
  ui.craftWheelTarget = 0; ui.craftWheelIdle = 0; ui.craftAnimKick();
  await raf(40);
  // A: 滚 5 格 → 窗口移动、池元素身份保持
  wheel(120); await raf(1);
  const midAnim = { containerT: list.style.transform || '(none)',
    minY: Math.min(...[...list.children].map((c) => { const m = c.style.transform.match(/-?\d+\.?\d*/); return m ? +m[0] : 999; })) };
  await raf(3);
  const ids0 = ids();
  const els0 = [...list.children];
  for (let i = 0; i < 4; i++) { wheel(120); await raf(2); }
  await raf(40);
  const els1 = [...list.children];
  // B: 滚动过程 refreshAll 风暴计数(应≈0——hover/点击才刷)
  const rcBefore = refreshCount;
  for (let i = 0; i < 20; i++) { wheel(120); await raf(1); }
  await raf(30);
  const refreshPerScroll = refreshCount - rcBefore;
  // C: 尾部越界回弹
  for (let i = 0; i < 200; i++) wheel(120);
  const maxA = ui.craftAvailRef.length - 1;
  const overPeak = ui.craftWheelTarget;
  await raf(120);   // ~2s 静置回弹
  const overSettled = ui.craftWheelTarget;
  return {
    availLen: ui.craftAvailRef.length,
    poolLen: ui.craftPool.length,
    poolParentOK: ui.craftPool[0]?.parentElement === list,
    poolZeroHTML: (ui.craftPool[0]?.outerHTML || 'null').slice(0, 140),
    listHTMLHead: list.outerHTML.slice(0, 160),
    listIsConnected: list.isConnected,
    listIsSame: list === ui.craftListEl,
    rowsMoved: ids0 !== ids(),
    elemIdentityKept: els0.some((e) => els1.includes(e)),
    rowCount: list.children.length,
    refreshPerScroll,
    maxA, overPeak: +overPeak.toFixed(2), overSettled: +overSettled.toFixed(2),
    bounceOK: overPeak > maxA && Math.abs(overSettled - maxA) < 0.01,
    // ---- 短列表场景(用户实报 len≈8-11)----
    short8: (async () => {
      g.vanillaAvailableRecipes = () => fake.slice(0, 8);
      ui.craftScroll = 0; ui.craftWheelTarget = 0; ui.craftScrollF = 0;
      ui.refreshAll();
      await raf(4);
      const trk = ui.craftTrackEl;
      return { track: trk.style.display, firstRi: list.querySelector('[data-ri]')?.dataset.ri };
    })(),
    short11: (async () => {
      g.vanillaAvailableRecipes = () => fake.slice(0, 11);
      ui.craftScroll = 0; ui.craftWheelTarget = 0; ui.craftScrollF = 0;
      ui.refreshAll();
      await raf(4);
      const trk = ui.craftTrackEl;
      const shown = trk.style.display !== 'none';
      // 拖到底:按 track 几何调 jump(与真实拖拽同路径)
      const r = trk.getBoundingClientRect();
      ui.craftScrollJump(r.bottom + 40);
      await raf(4);
      return {
        track: trk.style.display,
        firstRi: list.querySelector('[data-ri]')?.dataset.ri ?? '?',
        anchor: +ui.craftScrollF.toFixed(2),
      };
    })(),
    topRest, rowH: +rowH.toFixed(1), stride: +stride.toFixed(1), overlapFree,
    oneNotch: +oneNotch.toFixed(2), freshSmall: +freshSmall.toFixed(2),
    tailY199: rowY(199),
    tailContainerT: list.style.transform || '(none)',
    listH: list.style.height,
  };
});
(async () => { for (const k of ['short11']) if (out[k] instanceof Promise) out[k] = await out[k]; console.log(JSON.stringify(out)); })();
await page.screenshot({ path: 'shots/craft-scroll.png' });
await browser.close();
