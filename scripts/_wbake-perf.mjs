// ★C4 烘焙 Worker 化——进世界/游玩中 hitch 探针（2026-09-28;验收②③⑤）。
// 两臂各跑一次:?wbake=0（现状主线程烘焙全链）vs ?wbake=1（worker 烘焙）。
// 量面:
//   · bakeSelfMs   = ChunkCache.flushDirty 自耗时累计（旗关=真实烘焙本体;
//                    旗开=快照切片+派发,预期→~0）
//   · applyMs      = completeWorkerBake 自耗时累计（旗开专属;回包落页 drawImage）
//   · longTasks    = PerformanceObserver longtask（>50ms 主线程停顿）计数/总时长
//   · fps          = rAF 帧间隔逐秒均值序列（回升斜率/20fps 段时长）
//   · 级联         = 终态保险(2.5s)全量标脏级联落在采样窗内（0-12s）
//   · mine 突发    = 160×160 tile 连环破坏（≈121+ chunk 重烘）后 8s 观测
// 运行(两臂):
//   SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs --timeout=600000 scripts/_wbake-perf.mjs
// （旗从 URL 读:内部对 ?wbake=0/1 各建一页——本脚本一次跑双臂输出对照表）
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5211';

// 采样器安装（createGame 前装,游戏对象出现即开始计时;12s 窗口）
const INSTALL = () => {
  window.__perfDone = new Promise((resolve) => {
    const S = {
      bakeMs: 0, bakeCalls: 0, applyMs: 0, applyCount: 0,
      mainBakeMs: 0, mainBakeCount: 0,
      longTaskMs: 0, longTasks: 0, worst: 0,
      frames: [],           // {t, dt} 秒桶均值在收尾聚合
      firstFrameAt: 0,
    };
    const t0 = performance.now();
    // longtask
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) { S.longTaskMs += e.duration; S.longTasks++; S.worst = Math.max(S.worst, e.duration); }
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* 无 longtask 支持 */ }
    // rAF 帧序列
    let last = 0;
    const raf = (ts) => {
      if (!S.firstFrameAt) S.firstFrameAt = ts;
      if (last) S.frames.push(ts - last);
      last = ts;
      if (performance.now() - t0 < 12000) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    // ChunkCache 原型钩（模块单例,两臂同构）
    import('/src/render/ChunkCache.ts').then((m) => {
      const proto = m.ChunkCache.prototype;
      // ★bakeChunkInto = 主线程烘焙本体（wbake0: 渲染期 get()+flushDirty 全走它;
      //   wbake1: 主线程应≈0 次——烘焙全在 worker）
      const origBake = proto.bakeChunkInto;
      proto.bakeChunkInto = function (...a) {
        const s = performance.now();
        const r = origBake.apply(this, a);
        S.mainBakeMs += performance.now() - s; S.mainBakeCount++;
        return r;
      };
      const origFlush = proto.flushDirty;
      proto.flushDirty = function (...a) {
        const s = performance.now();
        const r = origFlush.apply(this, a);
        S.bakeMs += performance.now() - s; S.bakeCalls++;
        return r;
      };
      const origApply = proto.completeWorkerBake;
      if (origApply) {
        proto.completeWorkerBake = function (...a) {
          const s = performance.now();
          const r = origApply.apply(this, a);
          S.applyMs += performance.now() - s; S.applyCount++;
          return r;
        };
      }
    });
    // 游戏出现即起表（waitForFunction 语义的页内版）
    const waitGame = () => {
      if (window.__swGame && window.__swGame.chunks) {
        S.startedAt = performance.now() - t0;
        // 终态保险级联打点（console '[rbake]' 由 renderLoadLog 关闭态静默——直接钩 invalidateAll）
        const proto2 = Object.getPrototypeOf(window.__swGame.chunks);
        const origInv = proto2.invalidateAll;
        proto2.invalidateAll = function (...a) { S.cascadeAt = performance.now() - t0; return origInv.apply(this, a); };
        setTimeout(() => {
          const f = S.frames;
          const sec = [];
          for (let i = 0; i < f.length; i++) {
            const b = Math.floor(sec.length);
            void b;
          }
          // 逐秒 fps 聚合
          let acc = 0, n = 0, secIdx = 0; const fps = [];
          for (const dt of f) { acc += dt; n++; if (acc >= 1000) { fps.push(Math.round(1000 / (acc / n))); acc = 0; n = 0; secIdx++; } }
          resolve({ ...S, fps, frames: undefined });
        }, 12000);
      } else setTimeout(waitGame, 50);
    };
    waitGame();
  });
};

async function runArm(flag) {
  const browser = await launchBrowser({});
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await bootstrap(page, ORIGIN);
  await gotoApp(page, ORIGIN, { extraQuery: `?wbake=${flag}` });
  await waitForBridge(page);
  await page.evaluate(INSTALL);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928, settleMs: 0 });
  if (!gen?.ok) { await browser.close(); return { flag, error: 'createGame failed' }; }
  const entry = await page.evaluate(() => window.__perfDone);
  // ---- mine 突发（entry 窗后世界稳态;160×160 tile 连环破坏）----
  const mine = await page.evaluate(async () => {
    const g = window.__swGame;
    const S = { bakeMs: 0, bakeCalls: 0, applyMs: 0, applyCount: 0, mainBakeMs: 0, mainBakeCount: 0, longTaskMs: 0, longTasks: 0, fps: [] };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { S.longTaskMs += e.duration; S.longTasks++; } }).observe({ entryTypes: ['longtask'] }); } catch { }
    const pt = Object.getPrototypeOf(g.chunks);
    const of_ = pt.flushDirty, oa = pt.completeWorkerBake, ob = pt.bakeChunkInto;
    pt.flushDirty = function (...a) { const s = performance.now(); const r = of_.apply(this, a); S.bakeMs += performance.now() - s; S.bakeCalls++; return r; };
    if (oa) pt.completeWorkerBake = function (...a) { const s = performance.now(); const r = oa.apply(this, a); S.applyMs += performance.now() - s; S.applyCount++; return r; };
    pt.bakeChunkInto = function (...a) { const s = performance.now(); const r = ob.apply(this, a); S.mainBakeMs += performance.now() - s; S.mainBakeCount++; return r; };
    const st = g.world.store;
    const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
    const t0 = performance.now();
    // 160×160 连环破坏（地表带;setTile 走监听链=挖掘同域重烘触发）
    for (let y = py - 20; y < py + 140; y++) {
      for (let x = px - 80; x < px + 80; x++) {
        if (st.inBounds(x, y) && st.flags[st.idx(x, y)]) st.setTile(x, y, 0, 0, 0);
      }
    }
    S.breakMs = Math.round(performance.now() - t0);
    S.dirty0 = g.chunks.dirtyQueue.length;
    // 8s 观测（fixedUpdate 照常驱动 flushDirty）
    const f = [];
    let last = 0;
    await new Promise((resolve) => {
      const t1 = performance.now();
      const raf = (ts) => {
        if (last) f.push(ts - last);
        last = ts;
        if (performance.now() - t1 < 8000) requestAnimationFrame(raf);
        else resolve();
      };
      requestAnimationFrame(raf);
    });
    let acc = 0, n = 0;
    for (const dt of f) { acc += dt; n++; if (acc >= 1000) { S.fps.push(Math.round(1000 / (acc / n))); acc = 0; n = 0; } }
    S.dirtyEnd = g.chunks.dirtyQueue.length;
    S.dirtyChunkCount = g.chunks.chunks.size;
    return S;
  });
  const flags = await page.evaluate(() => ({ wbake: window.__swBakeFlags?.enabled, client: !!window.__swGame?.chunks?.bakeClient }));
  await browser.close();
  return { flag, entry, mine, flags, pageErrors: pageErrors.length };
}

const a0 = await runArm(0);
console.log('---- wbake=0（现状主线程烘焙全链）----');
console.log(JSON.stringify(a0, null, 1));
const a1 = await runArm(1);
console.log('---- wbake=1（worker 烘焙）----');
console.log(JSON.stringify(a1, null, 1));

// ---- 对照判语 ----
const line = (name, v0, v1) => console.log(`${name}: wbake0=${v0}  wbake1=${v1}`);
console.log('\n==== C4 wbake perf 对照 ====');
line('entry bakeSelfMs(主线程烘焙自耗)', a0.entry?.bakeMs?.toFixed(1), a1.entry?.bakeMs?.toFixed(1));
line('entry mainBakeMs(烘焙本体)', a0.entry?.mainBakeMs?.toFixed(1), a1.entry?.mainBakeMs?.toFixed(1));
line('entry mainBakeCount', a0.entry?.mainBakeCount, a1.entry?.mainBakeCount);
line('entry flushCalls', a0.entry?.bakeCalls, a1.entry?.bakeCalls);
line('entry applyMs(回包落页)', 'n/a', a1.entry?.applyMs?.toFixed(1));
line('entry longTasks', a0.entry?.longTasks, a1.entry?.longTasks);
line('entry longTaskMs', a0.entry?.longTaskMs?.toFixed(0), a1.entry?.longTaskMs?.toFixed(0));
line('entry fps@0-2s段均值', a0.entry?.fps?.slice(0, 2).join('/'), a1.entry?.fps?.slice(0, 2).join('/'));
line('entry fps 全序列', a0.entry?.fps?.join('/'), a1.entry?.fps?.join('/'));
line('mine bakeSelfMs', a0.mine?.bakeMs?.toFixed(1), a1.mine?.bakeMs?.toFixed(1));
line('mine mainBakeMs(烘焙本体)', a0.mine?.mainBakeMs?.toFixed(1), a1.mine?.mainBakeMs?.toFixed(1));
line('mine mainBakeCount', a0.mine?.mainBakeCount, a1.mine?.mainBakeCount);
line('mine longTasks', a0.mine?.longTasks, a1.mine?.longTasks);
line('mine longTaskMs', a0.mine?.longTaskMs?.toFixed(0), a1.mine?.longTaskMs?.toFixed(0));
line('mine applyCount(回包数)', 'n/a', a1.mine?.applyCount);
line('mine fps', a0.mine?.fps?.join('/'), a1.mine?.fps?.join('/'));
const ok = a0.pageErrors === 0 && a1.pageErrors === 0 && a1.flags?.wbake === true && a0.flags?.wbake === false;
process.exit(ok ? 0 : 1);
