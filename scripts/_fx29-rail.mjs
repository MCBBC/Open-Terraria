// ★SW-FX29 配装钮列竖线定谳探针(2026-09-15)——右缘 60px 可见元素普查 + 配装轨/钮几何对账。
// 运行:SW_ORIGIN=http://localhost:5218 node tools/run-diag.mjs scripts/_fx29-rail.mjs
// 产出:/tmp/fx29-rail.png(物品栏开启态全屏截图)。
// 判据:
//   [G1] 钮 3 颗 32×32 @(sw-40, num20+36i)=loadoutBtnXY ±1(DrawLoadoutButtons Main.cs:42676)。
//   [G2] 竖线元素(宽≤8 高≥50)普查:右缘条带内唯一候选=配装轨 div(4px @sw-44)。
//   [G3] 轨存在性 = SW_EXPECT_RAIL(定谳前=1 在场,摘除后=0 绝迹)。
// 原版对账:DrawLoadoutButtons 42666-42668 的 4px rectangle 仅作钮定位锚,
//   全方法无 spriteBatch.Draw(rectangle);GetLoadoutColor(CurrentLoadoutIndex) 返回值被弃
//   (ItemSlot.cs:2832-2835 纯函数无副作用);Extra_259=114×102=9 帧 38×34 无轨美术
//   → 原版本相=只画 3 颗钮,轨【不渲染】。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const EXPECT_RAIL = process.env.SW_EXPECT_RAIL === '1';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
const fails = [];
const chk = (name, cond, extra = '') => {
  if (!cond) fails.push(name);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
};

try {
  await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__swGame?.player, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1200));
  {   // 关欢迎浮层(canvas 绘制,非 DOM):真鼠标点「我知道了」钮心 ≈(800,815)@1600×1000
    await page.mouse.click(800, 815);
    await new Promise((r) => setTimeout(r, 400));
    await page.mouse.click(800, 815).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
  }
  await page.evaluate(async () => {
    const ui = window.__swUI;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 300));
  });

  const report = await page.evaluate(() => {
    const ui = window.__swUI;
    const ctx = ui.vinvLayoutCtx;
    const stripL = innerWidth - 60;
    const vis = (r) => r.width > 0 && r.height > 0;
    // 全文档竖线普查(宽≤8 且 高≥50)
    const thin = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!vis(r) || r.width > 8 || r.height < 50) continue;
      const cs = getComputedStyle(el);
      thin.push({
        tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60),
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        bg: cs.backgroundColor, inStrip: r.left >= stripL,
      });
    }
    // 右缘 60px 条带全部可见元素
    const strip = [];
    for (const el of document.querySelectorAll('.sw-vinv, .sw-vinv *')) {
      const r = el.getBoundingClientRect();
      if (!vis(r) || r.right < stripL) continue;
      const cs = getComputedStyle(el);
      strip.push({
        tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50),
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        bg: cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? cs.backgroundImage.slice(0, 40) : cs.backgroundColor,
      });
    }
    // 配装钮 + 轨(4px 宽 vinv 子元素)
    const btns = [...document.querySelectorAll('.sw-vinv .sw-loadout-btn')]
      .map((b) => { const r = b.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })
      .sort((a, b) => a.y - b.y);
    const railEls = [...document.querySelectorAll('.sw-vinv *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.width) === 4 && r.height > 50;
    }).map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
    return { sw: innerWidth, sh: innerHeight, ctx, thin, strip, btns, railEls };
  });

  console.log(`ctx=${JSON.stringify(report.ctx)}`);
  console.log(`-- 竖线普查(宽≤8 高≥50,全文档 ${report.thin.length} 条) --`);
  for (const t of report.thin) console.log(`  thin ${t.tag}.${t.cls} @(${t.x},${t.y}) ${t.w}×${t.h} bg=${t.bg} 右缘条带=${t.inStrip}`);
  console.log(`-- 右缘 60px 条带可见元素(${report.strip.length}) --`);
  for (const s of report.strip) console.log(`  strip ${s.tag}.${s.cls} @(${s.x},${s.y}) ${s.w}×${s.h} bg=${s.bg}`);

  // [G1] 钮几何 = loadoutBtnXY(ctx.sw, ctx.num20, i) ±1,32×32
  const expBtns = [0, 1, 2].map((i) => ({ x: report.ctx.sw - 40, y: report.ctx.num20 + 36 * i }));
  chk('[G1] 配装钮 3 颗在场 32×32', report.btns.length === 3 && report.btns.every((b) => b.w === 32 && b.h === 32),
    JSON.stringify(report.btns));
  chk('[G1] 钮位=(sw-40, num20+36i)±1', expBtns.every((e, i) =>
    report.btns[i] && Math.abs(report.btns[i].x - e.x) <= 1 && Math.abs(report.btns[i].y - e.y) <= 1),
    `exp=${JSON.stringify(expBtns)}`);

  // [G2] 竖线普查:右缘条带内竖线候选=轨 4px @sw-44(在场时),无其它来源
  const railExp = { x: report.ctx.sw - 44, y: report.ctx.num20 + 2, h: Math.trunc(report.ctx.visibleRows * 47.6) };
  const stripThin = report.thin.filter((t) => t.inStrip);
  if (report.railEls.length) {
    chk('[G2] 条带竖线唯一来源=轨 div(4px,无第二者)', stripThin.every((t) => t.w === 4) && stripThin.length === report.railEls.length,
      `stripThin=${stripThin.length} railEls=${report.railEls.length}`);
    const r = report.railEls[0];
    chk('[G2] 轨位=(sw-44, num20+2) h=trunc(rows·47.6) ±1', Math.abs(r.x - railExp.x) <= 1 && Math.abs(r.y - railExp.y) <= 1 && Math.abs(r.h - railExp.h) <= 1,
      `got=(${r.x},${r.y}) h=${r.h} exp=(${railExp.x},${railExp.y}) h=${railExp.h}`);
  } else {
    chk('[G2] 条带内无任何竖线元素', stripThin.length === 0, `stripThin=${stripThin.length}`);
  }

  // [G3] 轨存在性 = 期望
  chk('[G3] 轨存在性=SW_EXPECT_RAIL', report.railEls.length > 0 === EXPECT_RAIL, `found=${report.railEls.length} expect=${EXPECT_RAIL}`);

  await page.screenshot({ path: '/tmp/fx29-rail.png' });
  console.log('shot -> /tmp/fx29-rail.png');
} finally {
  await browser.close().catch(() => {});
}
process.exit(fails.length ? 1 : 0);
