// 帧预算探针:rAF 分桶 + present-gap 计数 + longtask 占比 + 堆增长(GC 锯齿),
// 进入世界后按固定巡游路线采集 SW_DUR 秒。判定口径见 mobile/BASELINE.md:
//   p95 rAF dt、>25ms present-gap 计数(防"CPU 曲线重合但呈现面卡顿"假阳性)、
//   300ms+ 长任务用比率限而非清零。
// 用法:SW_DUR=60 SW_ORIGIN=http://localhost:5201 \
//   node tools/run-diag.mjs scripts/_frame-budget-probe.mjs
import { launch, origin, armPerfMeter, loadDefaultWorld, teleportTour, TOUR_POINTS, sleep, pct } from './_perf-lib.mjs';

const DUR = Number(process.env.SW_DUR ?? 60);

const b = await launch();
try {
  const p = await b.newPage();
  await armPerfMeter(p);
  await p.goto(`${origin()}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await loadDefaultWorld(p);

  // 排空进入期计样,世界稳定后再采正式窗(巡游覆盖地表/洞穴/丛林/地牢沿)
  await p.evaluate(() => { window.__swPerf.raf = []; window.__swPerf.gaps = []; window.__swPerf.longtasks = []; });
  const heapStart = await p.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);
  const t0 = Date.now();

  // 巡游时段按 DUR 平摊到各点停留;剩余时间在出生点静置采样(站立帧为主)
  const dwell = Math.max(1500, Math.floor((DUR * 1000 * 0.7) / TOUR_POINTS.length));
  await teleportTour(p, TOUR_POINTS, dwell);
  // 统一等满 DUR 采样窗
  while (Date.now() - t0 < DUR * 1000 - 250) await sleep(250);

  const perf = await p.evaluate(() => JSON.parse(JSON.stringify(window.__swPerf)));
  const heapEnd = await p.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);

  const raf = perf.raf;
  const buckets = {
    lt16_7: raf.filter((x) => x < 16.7).length,
    in16_7to33: raf.filter((x) => x >= 16.7 && x <= 33).length,
    gt33: raf.filter((x) => x > 33).length,
  };
  const lt50 = perf.longtasks.filter((x) => x >= 50 && x < 300).length;
  const lt300 = perf.longtasks.filter((x) => x >= 300).length;
  console.log(JSON.stringify({
    probe: 'frame-budget',
    durationSec: Math.round((Date.now() - t0) / 100) / 10,
    frames: raf.length,
    // ★desktop headless 的 rAF 可跑 >240Hz,p50 可能取到 0ms → 以实测吞吐为准;
    //   真机(60 锁)两者应收敛,fps 取 min(实测吞吐, 1000/p95dt 稳态)
    fpsMeasured: +(raf.length / DUR).toFixed(1),
    fpsFromP50Dt: pct(raf, 0.5) ? Math.round(1000 / pct(raf, 0.5)) : null,
    rafMs: { p50: pct(raf, 0.5), p95: pct(raf, 0.95), p99: pct(raf, 0.99), max: raf.length ? Math.max(...raf) : null },
    buckets,
    presentGaps_gt25ms: perf.gaps.length,
    gapMaxMs: perf.gaps.length ? Math.max(...perf.gaps) : null,
    longtasks: {
      n_50to300: lt50,
      n_ge300: lt300,
      ge300_perMin: +(lt300 * 60 / DUR).toFixed(2), // 比率限口径(/min),非清零
      totalBlockedMs: Math.round(perf.longtasks.reduce((a, x) => a + x, 0)),
    },
    heapMB: heapStart != null ? { start: +(heapStart / 1048576).toFixed(1), end: +(heapEnd / 1048576).toFixed(1) } : 'unavailable(非 Chromium/iOS)',
    samples: perf.heap.length, // GC 直方图原始锯齿留档供离线分析计数
  }));
} finally {
  await b.close();
}
