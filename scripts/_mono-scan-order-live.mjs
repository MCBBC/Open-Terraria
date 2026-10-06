// ★债4 活机取证：scanMonolithScene 列主序赢家序（SceneMetrics.cs:456-458）
// run: SW_ORIGIN=http://localhost:5215 node tools/run-diag.mjs scripts/_mono-scan-order-live.mjs
// 判据：真实 TileStore 上双激活 410 柱异型（A=星云 左下 / B=星尘 右上）→
//  activeMonolithType = 2（最右列 B 胜;行主序旧实现给 1=红）
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5215';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.error('PAGEERROR', String(e.message).slice(0, 160)));
await bootstrap(page, ORIGIN + '/');
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('[data-act=sp]')).catch(() => false)) break;
  await sleep(2000);
}
await sleep(1000);
await page.evaluate(() => window.__swFlow.newWorld('mono' + (Date.now() % 10000), 1200, 600));
for (let i = 0; i < 240; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.world && window.__swGame.running === true)).catch(() => false)) break;
  await sleep(500);
}
await sleep(1000);

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const mf = await import('/src/render/MonolithFilters.ts');
  const tiles = await import('/src/data/tiles.ts');
  // 按内部 id 反查天塔柱 sheet（MONO 阈值面与扫描器同源）
  const bySheet = new Map();
  for (let i = 0; i < tiles.TILE_DEFS.length; i++) {
    const sh = tiles.TILE_DEFS[i]?.vanilla?.sheet ?? -1;
    if (sh === 410 || sh === 658) bySheet.set(sh, i);
  }
  const t410 = bySheet.get(410);   // 内部 tile id（数字,setTileSilent type 位）
  const t658 = bySheet.get(658);
  if (t410 == null || t658 == null) return { fail: 'tile-lookup' };
  const set = (x, y, t, fx, fy) => st.setTileSilent(x, y, t, fx, fy);
  // 柱 410 = 2 宽 3 高;激活帧 fy=56+cy*18,fx=style*36+cx*18
  const place410 = (ox, oy, style) => {
    for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 3; cy++)
      set(ox + cx, oy + cy, t410, style * 36 + cx * 18, 56 + cy * 18);
  };
  const place658 = (ox, oy, state) => {
    for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 3; cy++)
      set(ox + cx, oy + cy, t658, cx * 18, state * 54 + cy * 18);
  };
  const FULL = { x0: 0, y0: 0, x1: st.w, y1: st.h };
  // 场景①：A=星云(1) 左下(20,120) / B=星尘(2) 右上(60,30) → 列主序赢家 B=2
  place410(20, 120, 1);
  place410(60, 30, 2);
  const s1 = mf.scanMonolithScene(st, FULL);
  // 场景②：658 三态 A=1 右上(50,40) / B=2 左下(30,60) → 列主序赢家 A=1
  place658(50, 40, 1);
  place658(30, 60, 2);
  const s2 = mf.scanMonolithScene(st, FULL);
  // 场景③：单柱还原（B 单独在场）→ 2
  return {
    case1_rightmostWins: s1.activeMonolithType,   // 期望 2
    case2_658winner: s2.shimmerMonolithState,     // 期望 1
    sheets: [bySheet.get(410), bySheet.get(658)],
  };
});
const ok = res.case1_rightmostWins === 2 && res.case2_658winner === 1;
console.log(JSON.stringify({ ok, ...res }));
process.exit(ok ? 0 : 2);
