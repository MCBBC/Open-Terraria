// ★shineFpCache 微基准:同 pair 重复指纹调用 = 缓存命中(跳 mix2)的量化证明
// run: SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs scripts/_shine-fp-micro.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, waitForBridge, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5209';
const worldText = readFileSync(needInput(join(DOWNLOADS, 'map-天真的钴最高点 (4).json')), 'utf8');
const browser = await launchBrowser({ headed: true, viewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
try {
  const page = await openPage(browser, { errors: [], maxErrors: 20 });
  installPinnedRandom(page, 118606602);
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) process.exit(1);
  await front(page);
  await page.evaluate((t) => { void window.__swFlow.loadJson(t); }, worldText);
  const ok = await waitForGame(page, { timeout: 240_000, log: () => {} });
  if (!ok) process.exit(1);
  const out = await page.evaluate(async () => {
    const m = await import('/src/render/TileShine.ts');
    const g = window.__swGame;
    const st = g.world.store;
    // 取视口内一个真 chunk 的 pair(真实密集面)
    const cx = Math.floor(g.player.cx / 16), cy = Math.floor(g.player.cy / 16);
    const pair = g.chunks.get(cx, cy);
    const N = 2000;
    // 预热一次(装缓存)
    const fp0 = m.shineChunkFingerprintCached(g.world, pair, cx, cy, 0);
    let t0 = performance.now();
    let hit = 0;
    for (let i = 0; i < N; i++) { if (m.shineChunkFingerprintCached(g.world, pair, cx, cy, 0) === fp0) hit++; }
    const cachedMs = performance.now() - t0;
    // 直调(绕缓存=mix2 全量)对照
    t0 = performance.now();
    let same = 0;
    for (let i = 0; i < N; i++) {
      // shineChunkFingerprint 未导出——经 __SW_SHINE_MEMO_OFF 面对照不可行;改测:
      // 换 pair 身份(缓存必 miss)等价于旧直调成本
      const p2 = { wall: pair.wall, tile: pair.tile, sx: pair.sx, sy: pair.sy, cell: pair.cell, __i: i };
      if (m.shineChunkFingerprintCached(g.world, p2, cx, cy, 0) === fp0) same++;
    }
    const uncachedMs = performance.now() - t0;
    return { N, fp0, hit, cachedMs: +cachedMs.toFixed(2), same, uncachedMs: +uncachedMs.toFixed(2),
      perCallCachedUs: +(cachedMs / N * 1000).toFixed(3), perCallUncachedUs: +(uncachedMs / N * 1000).toFixed(3) };
  });
  console.log('fp microbench:', JSON.stringify(out));
  console.log(`缓存命中 ${out.perCallCachedUs}µs/次 vs miss(=旧直调) ${out.perCallUncachedUs}µs/次 → 单次省 ${((1 - out.perCallCachedUs / out.perCallUncachedUs) * 100).toFixed(1)}%`);
} finally {
  await browser.close().catch(() => {});
}
