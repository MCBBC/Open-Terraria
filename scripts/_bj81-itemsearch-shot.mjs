// ★SW-BJ81 探针：道具搜索浮窗/物品栏同屏/取件-长按-放置流 + 天气/时间面板关闭钮。
// 运行：SW_ORIGIN=http://localhost:5212 node tools/run-diag.mjs scripts/_bj81-itemsearch-shot.mjs
// 产出：/tmp/bj81-itemsearch-open.png、/tmp/bj81-weather-open.png、/tmp/bj81-time-open.png
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
const ok = [];
const chk = (name, cond, extra = '') => {
  ok.push(!!cond);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
};

try {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('sbw.itemSearchConfirmed', '1');
    localStorage.setItem('sbw.journeyQuick.time', '1');
    localStorage.setItem('sbw.journeyQuick.weather', '1');
  });
  await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__swGame?.player, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));

  // ---- 开道具搜索（背包内「设置」钮 → 暂停 → 开发者选项 → 道具搜索） ----
  // ★本仓 Esc 链=背包 toggle(用户明令分歧),暂停浮层唯一入口=背包内设置钮(RB8c)
  const clickBtn = async (text) => {
    await page.waitForFunction((t) =>
      [...document.querySelectorAll('button')].some((b) => b.textContent === t),
      { timeout: 8000 }, text);
    await page.evaluate((t) => {
      [...document.querySelectorAll('button')].find((b) => b.textContent === t)?.click();
    }, text);
  };
  const openDevMenu = async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === '设置');
      btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await clickBtn('开发者选项');
  };
  await openDevMenu();
  await clickBtn('道具搜索');
  await page.waitForSelector('.sw-itemsearch', { timeout: 5000 });

  // ---- 规格④:物品栏同屏在场 ----
  const invVisible = await page.evaluate(() => {
    const v = document.querySelector('.sw-vinv');
    return !!v && getComputedStyle(v).display !== 'none';
  });
  chk('规格④ 开搜索=物品栏同屏在场(.sw-vinv display!=none)', invVisible);

  // ---- 规格③:浮窗几何(右移/缩窄/不压物品栏网格) ----
  const geo = await page.evaluate(() => {
    const p = document.querySelector('.sw-itemsearch').getBoundingClientRect();
    const slots = [...document.querySelectorAll('.sw-vinv .sw-slot')].slice(0, 50)
      .map((s) => s.getBoundingClientRect());
    const gx0 = Math.min(...slots.map((r) => r.left));
    const gx1 = Math.max(...slots.map((r) => r.right));
    const gy0 = Math.min(...slots.map((r) => r.top));
    const gy1 = Math.max(...slots.map((r) => r.bottom));
    const overlap = !(p.left >= gx1 || p.right <= gx0 || p.top >= gy1 || p.bottom <= gy0);
    return { p: { l: p.left, t: p.top, r: p.right, b: p.bottom, w: p.width }, grid: { gx0, gx1, gy0, gy1 }, overlap, vw: innerWidth };
  });
  chk('规格③ 浮窗在物品栏网格右方(不重叠)', !geo.overlap && geo.p.l >= geo.grid.gx1 - 1,
    `panel L${Math.round(geo.p.l)} R${Math.round(geo.p.r)} vs grid ${Math.round(geo.grid.gx0)}..${Math.round(geo.grid.gx1)}`);
  chk('规格③ 浮窗缩窄(≤360px,旧 560)', geo.p.w > 0 && geo.p.w <= 362, `w=${Math.round(geo.p.w)}`);
  chk('规格③ 浮窗右置(左缘过视口中线)', geo.p.l > geo.vw * 0.3, `L=${Math.round(geo.p.l)} vw=${geo.vw}`);
  await page.screenshot({ path: '/tmp/bj81-itemsearch-open.png' });

  // ---- 规格②⑤:点条目=1 件上光标 ----
  const grab0 = await page.evaluate(() => {
    const row = document.querySelector('.sw-itemsearch .sw-lbl') ? null : null;
    const rows = [...document.querySelectorAll('.sw-itemsearch > div:nth-child(3) > div')];
    return rows.length;
  });
  // 直接对首个结果行派发 mousedown(取 1 件)
  await page.evaluate(() => {
    const list = [...document.querySelectorAll('.sw-itemsearch > div')].find((d) => d.style.flex?.length > 0 || getComputedStyle(d).overflowY === 'auto');
    const row = list?.children[0];
    row?.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 120));
  const held0 = await page.evaluate(() => window.__swUI?.heldStack);
  chk('规格②⑤ 点条目=光标持 1 件', held0 && held0.stack === 1, JSON.stringify(held0));
  chk('规格⑤ 光标 ghost 在场', await page.evaluate(() => !!document.querySelector('.sw-drag-ghost')));

  // ---- 规格⑥:长按持续 +1 ----
  const stackAfterHold = await page.evaluate(async () => {
    const list = [...document.querySelectorAll('.sw-itemsearch > div')].find((d) => d.style.flex?.length > 0 || getComputedStyle(d).overflowY === 'auto');
    const row = list?.children[0];
    row.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    await new Promise((r) => setTimeout(r, 760));   // ~6 拍 ×125ms
    const s = window.__swUI.heldStack.stack;
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return s;
  });
  chk('规格⑥ 长按 ~760ms 持续 +1(≥3)', stackAfterHold >= 3, `stack=${stackAfterHold}`);

  // ---- 规格⑤:点物品栏槽=放入 ----
  const placed = await page.evaluate(() => {
    const slot = document.querySelector('.sw-vinv .sw-slot[data-idx="10"]');
    const r = slot.getBoundingClientRect();
    const opts = { bubbles: true, clientX: r.left + 5, clientY: r.top + 5, button: 0 };
    slot.dispatchEvent(new MouseEvent('mousedown', opts));
    document.dispatchEvent(new MouseEvent('mouseup', opts));
    return { held: window.__swUI.heldStack, inv10: window.__swGame.player.inv.slots[10] };
  });
  chk('规格⑤ 点槽=放入(heldStack 清空)', placed.held === null, `inv10=${JSON.stringify(placed.inv10)}`);

  // ---- 规格①:搜索面板 ✕ 关闭(面板关,物品栏仍在场,光标物保留判例面) ----
  await page.evaluate(() => {
    [...document.querySelectorAll('.sw-itemsearch button')].find((b) => b.textContent === '✕')?.click();
  });
  await new Promise((r) => setTimeout(r, 120));
  chk('规格① 搜索面板 ✕ 可关', await page.evaluate(() => !document.querySelector('.sw-itemsearch')));

  // ---- 规格①:天气面板关闭钮(canvas ✕) ----
  await openDevMenu();
  await clickBtn('天气控制');
  await new Promise((r) => setTimeout(r, 400));
  const wOpen = await page.evaluate(() => window.__swGame.renderer.weatherPanelOpen);
  chk('天气面板经暂停入口打开', wOpen === true);
  await page.screenshot({ path: '/tmp/bj81-weather-open.png' });
  const wClosed = await page.evaluate(() => {
    const g = window.__swGame.renderer;
    const mr = g.minimapRect;
    const ox = mr.x + 2, oy = mr.y + 2, size = mr.w - 4;
    const wPanelY = oy + 276;   // 时间面板关 ⇒ 无叠放偏移
    // ✕ 盒 (ox+size-26, wPanelY+5, 20,20) 中心
    return { cx: ox + size - 16, cy: wPanelY + 15, before: g.weatherPanelOpen };
  });
  await page.mouse.move(wClosed.cx, wClosed.cy);
  await page.mouse.down();                       // clicked=按下边沿(逐帧采样)——down/up 须跨帧
  await new Promise((r) => setTimeout(r, 160));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 200));
  chk('规格① 天气面板 ✕ 点击关闭', await page.evaluate(() => window.__swGame.renderer.weatherPanelOpen === false));

  // ---- 规格①:时间面板关闭钮(canvas ✕) ----
  await openDevMenu();
  await clickBtn('时间控制');
  await new Promise((r) => setTimeout(r, 400));
  chk('时间面板经暂停入口打开', await page.evaluate(() => window.__swGame.renderer.timePanelOpen === true));
  await page.screenshot({ path: '/tmp/bj81-time-open.png' });
  const tPos = await page.evaluate(() => {
    const g = window.__swGame.renderer;
    const mr = g.minimapRect;
    const ox = mr.x + 2, oy = mr.y + 2, size = mr.w - 4;
    return { cx: ox + size - 16, cy: oy + 276 + 15 };
  });
  await page.mouse.move(tPos.cx, tPos.cy);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 160));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 200));
  chk('规格① 时间面板 ✕ 点击关闭', await page.evaluate(() => window.__swGame.renderer.timePanelOpen === false));

  await browser.close();
  const pass = ok.filter(Boolean).length;
  console.log(`\nSUMMARY ${pass}/${ok.length} PASS`);
  process.exit(pass === ok.length ? 0 : 1);
} catch (e) {
  console.log('PROBE-ERROR:', String(e).slice(0, 500));
  try { await page.screenshot({ path: '/tmp/bj81-error.png' }); } catch { /* ignore */ }
  await browser.close();
  process.exit(2);
}
