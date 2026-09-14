// IIII249 诊断:steady 场景卡死 partial 条目定位
import { launchBrowser, openPage } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { camSnapTo } from '../tools/probe/lib/camera.mjs';
import { nextFrame } from '../tools/probe/lib/pump.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5299';
const browser = await launchBrowser({ headed: false, extraArgs: ['--use-gl=angle', '--use-angle=metal'] });
const pageErrors = [];
const page = await openPage(browser, { errors: pageErrors });
page.__probeOrigin = ORIGIN;
await cleanStorage(page, {});
const okGoto = await gotoApp(page, ORIGIN, { extraQuery: '?shinebudget=4', tries: 30 });
if (!okGoto) throw new Error('goto');
await waitForBridge(page);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 600 });
if (!gen.ok) throw new Error('gen');
const pocket = await page.evaluate((fx) => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = (k) => window.__swTiles[k];
  const stone = T('stone'), ore = T('ore_iron'), gem = T('v_262_amethystgemspark');
  const gy = Math.floor(g.world.groundLevel) + 120;
  let cx = -1, cy = -1;
  outer: for (let x = fx; x < st.w - 220; x += 3) {
    for (let y = gy; y < Math.min(gy + 220, st.h - 20); y += 3) {
      if (st.inBounds(x + 26, y + 14) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === stone) { cx = x; cy = y; break outer; }
    }
  }
  if (cx < 0) return { err: 'no pocket' };
  for (let y = cy - 10; y <= cy + 3; y++) for (let x = cx - 13; x <= cx + 12; x++) st.setTileSilent(x, y, 0, 0, 0);
  for (let x = cx - 13; x <= cx + 12; x++) { st.setTileSilent(x, cy + 4, stone, 0, 0); st.setTileSilent(x, cy + 5, stone, 0, 0); st.setTileSilent(x, cy - 11, stone, 0, 0); }
  for (let x = cx - 12; x <= cx + 11; x++) for (let r = 0; r < 8; r++) st.setTileSilent(x, cy - 9 + r, r === 7 ? gem : ore, 0, 0);
  return { cx, cy };
}, 200);
console.log('pocket', JSON.stringify(pocket));
await camSnapTo(page, pocket.cx * 16, pocket.cy * 16);
await page.evaluate(async () => { const TS = await import('/src/render/TileShine.ts'); TS.shineStats.reset(); });
for (let i = 0; i < 400; i++) await nextFrame(page);
const snap1 = await page.evaluate(async () => {
  const g = window.__swGame;
  const TS = await import('/src/render/TileShine.ts');
  const cam = g.camera;
  const bx = Math.floor(cam.x / 256), by = Math.floor(cam.y / 256);
  const s = TS.shineStats;
  const out = { stats: JSON.parse(JSON.stringify(s)), pending: TS.shineDebugPendingState(g.chunks, bx - 2, bx + 2, by - 2, by + 2, 0) };
  return out;
});
console.log('stats:', JSON.stringify(snap1.stats));
console.log('pending:', JSON.stringify(snap1.pending, null, 1).slice(0, 2400));
// 再泵 200 帧看 stalled 是否增长
for (let i = 0; i < 200; i++) await nextFrame(page);
const snap2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const TS = await import('/src/render/TileShine.ts');
  const cam = g.camera;
  const bx = Math.floor(cam.x / 256), by = Math.floor(cam.y / 256);
  const st2 = TS.shineStats;
const alpha = g.renderer?.monoFilters?.shimmerAlpha ?? -1;
const q = alpha > 0 ? Math.min(1, Math.ceil(alpha * 8) / 8) : 0;
return { stats: JSON.parse(JSON.stringify(st2)), lastResume: st2.lastResume, shimmerAlpha: alpha, shimmerQ: q, pending: TS.shineDebugPendingState(g.chunks, bx - 2, bx + 2, by - 2, by + 2, q) };
});
console.log('stats2:', JSON.stringify(snap2.stats));
console.log('pageErrors:', JSON.stringify(pageErrors.slice(0, 6), null, 1));
console.log('pending2:', JSON.stringify(snap2.pending.pendingQ?.slice(0, 8)));
await browser.close();
