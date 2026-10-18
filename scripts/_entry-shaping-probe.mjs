// 入场窗负载定谳探针(任务:入场窗负载整形,先定谳再动刀)——2026-10-06
//
// 【任务】用户实报「刚进世界存档的那几十秒里会有抖动,过后就稳了」。本探针量化:
//   ①入场窗负载构成与时长:进世界(loadJson 用户档)→ 逐帧采样到稳态——
//     帧距分布 / bakeBudget 消耗(_bakeSpent 残值) / chunk dirtyQueue 深度 /
//     workerAwaiting+budgetAwaiting 占位账 / shineStats 增量 / 光照区域状态。
//   ②幕布期(entryFreeze)边界:冻结窗开/关沿、覆盖门满足时刻、掀幕首帧巨帧。
//   ③CPU 归因:CDP Profiler 采样入场窗(0-25s)自耗时 Top(每秒分段)。
// 【世界面】用户真实导出存档(与 _shine-ab-fall 同档:map-天真的钴最高点 (4).json,
//   seed 118606602)——比 createGame 重生成更忠实(玩家位/已探索域/tile 态 1:1)。
// 【运行】SW_ORIGIN=http://localhost:5218 node tools/run-diag.mjs --timeout=280000 \
//          scripts/_entry-shaping-probe.mjs
//   SW_TAG=baseline / SW_RUN_MS=75000 / SW_PROFILE_MS=25000 / SW_VW / SW_VH / SW_DPR
// 【产物】/tmp/entry-shaping/<tag>.json(summary+rows)+ <tag>.cpuprofile + 截图。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, waitForBridge, gotoApp, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5218';
const WORLD_JSON = process.env.SW_WORLD_JSON || needInput(join(DOWNLOADS, 'map-天真的钴最高点 (4).json'));
const OUT = '/tmp/entry-shaping';
const TAG = process.env.SW_TAG || 'baseline';
const RUN_MS = Number(process.env.SW_RUN_MS || 75_000);
const PROFILE_MS = Number(process.env.SW_PROFILE_MS || 25_000);
const VIEW = { width: Number(process.env.SW_VW || 1280), height: Number(process.env.SW_VH || 800), deviceScaleFactor: Number(process.env.SW_DPR || 2) };
mkdirSync(OUT, { recursive: true });

const worldText = readFileSync(WORLD_JSON, 'utf8');
console.log(`world json ${(worldText.length / 1048576).toFixed(1)}MB, tag=${TAG}, run=${RUN_MS}ms, profile=${PROFILE_MS}ms, viewport=${VIEW.width}x${VIEW.height} dpr${VIEW.deviceScaleFactor}`);

const browser = await launchBrowser({ headed: true, viewport: VIEW });
const errs = [];
let cdp = null;
try {
  const page = await openPage(browser, { errors: errs, maxErrors: 60 });
  installPinnedRandom(page, 118606602);
  const boot = await bootstrap(page, ORIGIN);
  console.log('bootstrap:', JSON.stringify(boot));
  if (!boot.ok) process.exit(1);

  // ---- 采样器预装(loadJson 前挂:轮询 __swGame 出现即起表,零延迟缝) ----
  await page.evaluate(() => {
    window.__rows = [];
    window.__t0 = 0;
    window.__marks = [];
    let prevTs = 0;
    let shinePrev = null;
    const tick = () => {
      const g = window.__swGame;
      if (!g || !g.world || !g.player || !g.chunks) { requestAnimationFrame(tick); return; }
      if (!window.__t0) {
        window.__t0 = performance.now();
        prevTs = window.__t0;
        shinePrev = { bakes: g.__swShineStats ? g.__swShineStats.bakes : 0, bakeMs: g.__swShineStats ? g.__swShineStats.bakeMs : 0 };
        window.__marks.push({ ev: 'first-visible-frame', t: 0 });
        window.__shineStats = g.__swShineStats || null;
      }
      const now = performance.now() - window.__t0;
      const dt = now - prevTs;
      prevTs = now;
      const cc = g.chunks;
      const lt = g.lighting;
      const ss = window.__shineStats;
      const row = [
        Math.round(now * 10) / 10,            // 0 t(ms)
        Math.round(dt * 100) / 100,           // 1 dt(ms)
        g.entryFreezeActive ? 1 : 0,          // 2 freeze
        g._tpVeil ? 1 : 0,                    // 3 veil
        cc.viewportCovered() ? 1 : 0,         // 4 covered
        cc.workerAwaiting.size,               // 5 workerAwaiting
        cc.budgetAwaiting.size,               // 6 budgetAwaiting
        cc.dirtyQueue.length,                 // 7 dirtyQueue depth
        Math.round((cc._bakeSpent || 0) * 100) / 100, // 8 bakeSpent(ms, 帧内预算残值)
        Math.round((cc.lastFlushMs || 0) * 100) / 100,// 9 flushDirty 耗时
        cc.lastFlushCount | 0,                // 10 flushDirty 块数
        ss ? ss.bakes : -1,                   // 11 shine bakes 累计
        ss ? Math.round(ss.bakeMs) : -1,      // 12 shine bakeMs 累计
        ss ? ss.pending : -1,                 // 13 shine pendingQ
        lt ? (lt.snapRw * lt.snapRh) : -1,    // 14 light region tiles
        lt ? (lt.dirty ? 1 : 0) : -1,         // 15 light dirty
        lt ? (lt.lwLive ? 1 : 0) : -1,        // 16 light worker live
        Math.round(g.camera.x), Math.round(g.camera.y), // 17/18 cam
      ];
      window.__rows.push(row);
      // 状态沿标记
      const M = window.__marks;
      const last = (ev) => M.length && M[M.length - 1].ev === ev;
      if (g.entryFreezeActive && !last('freeze-open')) M.push({ ev: 'freeze-open', t: Math.round(now) });
      if (!g.entryFreezeActive && M.length && M[M.length - 1].ev === 'freeze-open') M.push({ ev: 'freeze-close', t: Math.round(now) });
      if (cc.viewportCovered() && !last('covered')) M.push({ ev: 'covered', t: Math.round(now) });
      if (window.__rows.length < 20000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // ---- 载入用户真实存档(loadJson 桥) ----
  console.log('loadJson start...');
  const tLoad = Date.now();
  await front(page);
  await page.evaluate((text) => { void window.__swFlow.loadJson(text); }, worldText);
  const okGame = await waitForGame(page, { timeout: 240_000, log: (m) => console.log('  ' + m) });
  console.log('loadJson done:', okGame, `${((Date.now() - tLoad) / 1000).toFixed(1)}s`);
  if (!okGame) { await page.screenshot({ path: `${OUT}/${TAG}-loadfail.png` }); process.exit(1); }

  // ---- shineStats 桥(TileShine 模块动态 import;vite dev 直供源模块) ----
  try {
    await page.evaluate(async () => {
      const m = await import('/src/render/TileShine.ts');
      window.__shineStats = m.shineStats;
      window.__shineBudget = { ms: m.shineBudgetMs, explicit: m.shineBudgetExplicit };
    });
  } catch (e) { console.log('shineStats bridge failed:', String(e).slice(0, 120)); }

  // ---- CPU 归因:CDP Profiler 覆盖入场窗前 PROFILE_MS ----
  if (PROFILE_MS > 0) {
    try {
      cdp = await page.createCDPSession();
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 300 });
      await cdp.send('Profiler.start');
      setTimeout(() => {
        cdp.send('Profiler.stop').then(({ profile }) => {
          writeFileSync(`${OUT}/${TAG}.cpuprofile`, JSON.stringify(profile));
          console.log('profile saved:', `${OUT}/${TAG}.cpuprofile`, `nodes=${profile.nodes.length}`);
        }).catch(() => {});
      }, PROFILE_MS);
    } catch (e) { console.log('profiler arm failed:', String(e).slice(0, 120)); }
  }

  await new Promise((r) => setTimeout(r, RUN_MS));
  await page.screenshot({ path: `${OUT}/${TAG}-end.png` });

  const marks = await page.evaluate(() => window.__marks);
  const flags = await page.evaluate(() => ({
    wbake: window.__swBakeFlags ? window.__swBakeFlags.enabled : null,
    shine: window.__shineBudget || null,
    fpsCap: window.__swGame?.beat ? 'beat' : 'n/a',
    renderMode: window.__swGame?.renderer?.mode ?? null,
  }));
  const rows = await page.evaluate(() => window.__rows);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ tag: TAG, marks, flags, rows }, null, 1));
  console.log('rows:', rows.length, 'marks:', JSON.stringify(marks));
  console.log('flags:', JSON.stringify(flags));
  console.log('saved:', `${OUT}/${TAG}.json`);
  console.log('errs:', errs.slice(0, 6));
} finally {
  try { if (cdp) await cdp.detach().catch(() => {}); } catch {}
  await browser.close();
}
process.exit(0);
