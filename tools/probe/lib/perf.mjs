/**
 * IIII239 统一探针框架 —— 性能评估模块(CDP 双通道+页内探针+分段跑分器)。
 *
 * 坑史锚:
 *  - memory: playsoft-trace-hotspots-lightfast —— 「GPU 页绝不挂」:CPU profiler 只见
 *    JS 面,GPU 工作走 .trace 的 GPUTask/RasterTask/DrawFrame 计时面;trace 根因
 *    三坑(合成链/只挂即丢点/GPU 页)——结论判读纪律见 docs/methodology/probe-guide.md
 *    「性能评估(perf)」章;
 *  - memory: spikeball-chain-anchor-pixels-paladin-ai-verdict —— headless rAF ~27fps
 *    时间膨胀:确定性 pump(pump/pumpUntil/fixedUpdate 直泵)与 perf【互斥】——泵是
 *    确定性工具,绕过真实 rAF 节拍,perf 数据会整体失真;perf 模式必须真 rAF 实时
 *    渲染,禁用一切 fixedUpdate 直泵;
 *  - memory: lavaslope-infiltration-type-blind-enhancement「无头后台探针五坑」——
 *    后台 tab 节流:launchBrowser 三件套 args 已带,perf 采集期间每段前 front(page);
 *  - scripts/_perf-lib.mjs(移动基线批)先例:rAF 包裹计量/longtask observer/
 *    heap 采样/teleportTour —— 本模块收编进框架并加 CDP 双通道。
 *
 * 通道:
 *  - profile:Profiler.enable/setSamplingInterval/start/stop → .cpuprofile
 *    (函数级 self-time,找卡点的主通道);
 *  - trace:page.tracing.start/stop → .trace(长任务/渲染分段/GC 停顿);
 *  - metrics:Performance.enable+getMetrics(JSHeapTotal/Used/Frames/TaskDuration…,
 *    fps 交叉核对面);
 *  - fps:页内 frame 探针(常开,见下)——真 rAF 实时渲染下的逐帧计量。
 *
 * 页内注入命名纪律:一切注入函数带 swPerf 前缀(或 evaluateOnNewDocument 顶函数
 * swPerfArm)——分析器(isFrameworkFunc)据此单列"框架自身开销"并要求 <2%。
 *
 * 用法(场景脚本):
 *   const page = await openPage(browser, {});
 *   await armPerfInstrumentation(page, {});          // 必须【导航前】装(evaluateOnNewDocument)
 *   await bootstrap(page, origin);                    // ← goto 在此之后
 *   await createGame(page, { mode: 'direct', seed });
 *   await installFrameProbe(page);                    // 游戏就绪后:包 g.frame/g.fixedUpdate
 *   const rec = createPerfRecorder(page, { outDir, scenario: 'biome-tour' });
 *   await rec.startSegment('dwell:forest', { kind: 'dwell' });
 *   await sleep(6000);                                // 真实时间窗(rAF 实时渲染)
 *   const seg = await rec.endSegment();               // { fps, longtasks, gc, profile, … }
 *
 * CLI:node tools/probe/perf.mjs run --scenario=biome-tour|stress [--seed=…] [--dwell=…]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { front } from './browser.mjs';
import { fpsStats, summarizeProfile, parseTrace, classifyGpuRenderer } from './perf-analyze.mjs';

/** tracing categories(任务面:devtools.timeline + stack + toplevel + gpu 等)。
 *  ★默认集不带 'gpu':GPU 进程事件量 ~60%(IIIII239 实测 205k/340k),会把共享
 *  trace 缓冲灌满——record-until-full 语义下主线程事件中途断流(实测段窗只录到
 *  前 0.5~1.4s);默认走 record-continuously(环形,保末段)+减容,gpu 证据面用
 *  traceGpu 开关(--trace-gpu)要的时候再开。
 *  ★stack 类目让 .trace 体积 ×3~5——traceStacks=false 可关,长任务/GC 不受影响。 */
export const TRACE_CATEGORIES = [
  'toplevel',
  'devtools.timeline',
  'v8',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack',
];
export const TRACE_CATEGORY_GPU = 'gpu';
/** GPU timeline 域(IIIII246):GPU 侧 SwapBuffers/DrawCommands 等;与 'gpu' 成对开
 *  (--trace-gpu)。★注意:GPUTask/Commit 本就随 'disabled-by-default-devtools.timeline'
 *  类目落 trace(IIIII246 对 239 final trace 复核)——GPU 账解析(parseTrace.gpu)在
 *  基础类目下即可工作,这对类目是"加厚 GPU 证据面",不是 GPU 账的前提。 */
export const TRACE_CATEGORY_GPU_TIMELINE = 'disabled-by-default-devtools.timeline.gpu';
export const TRACE_CATEGORIES_NOSTACK = TRACE_CATEGORIES.filter((c) => !c.endsWith('.stack'));

const SEGMENT_CAP = 400_000;   // 页内帧样本上限(防长会话无界增长)

/**
 * 页内 perf 探针(必须导航前装)。四路:
 *  ① rAF 包裹(swPerfRafTick):真实 rAF 节拍 + 节流 gap(dt>gapMs);
 *  ② longtask observer(swPerfLongtaskSink):>50ms 长任务(与 trace RunTask 同口径);
 *  ③ heap 采样(swPerfHeapTick,performance.memory 存在时);
 *  ④ reset()/dump(since) 分段提取。
 * 注入函数全带 swPerf 前缀(框架开销账的识别面,见 perf-analyze.isFrameworkFunc)。
 */
export async function armPerfInstrumentation(page, { gapMs = 25, heapMs = 500 } = {}) {
  await page.evaluateOnNewDocument(function swPerfArm(cfg) {
    const P = {
      v: 1,
      t0: 0,
      raf: [],       // rAF 相邻间隔 ms
      frames: [],    // 游戏渲染帧(painted)相邻间隔 ms
      frameAt: [],   // frames 平行:帧起始 ts
      gaps: [],      // rAF 节流 gap(>gapMs)
      simMs: 0, simCount: 0,   // fixedUpdate 自计量(逻辑/渲染拆分)
      longtasks: [], // {t, ms}
      heap: [],      // {t, used, total}
      cap: 400000,
      gapMs: cfg.gapMs,
      lastRaf: 0, lastFrame: 0,
      frameProbeOn: false,
      resetAt: 0,
    };
    window.__swPerf = P;
    P.t0 = performance.now();
    const rawRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function swPerfRafEntry(cb) {
      return rawRaf(function swPerfRafTick(t) {
        if (P.lastRaf) {
          const dt = t - P.lastRaf;
          if (P.raf.length < P.cap) P.raf.push(dt);
          if (dt > P.gapMs && P.gaps.length < P.cap) P.gaps.push(dt);
        }
        P.lastRaf = t;
        cb(t);
      });
    };
    try {
      const po = new PerformanceObserver(function swPerfLongtaskSink(list) {
        const es = list.getEntries();
        for (let i = 0; i < es.length; i++) {
          if (P.longtasks.length < 5000) P.longtasks.push({ t: es[i].startTime, ms: +es[i].duration.toFixed(1) });
        }
      });
      po.observe({ type: 'longtask', buffered: true });
    } catch (e) { P.longtaskUnsupported = true; }
    if (performance.memory) {
      setInterval(function swPerfHeapTick() {
        if (P.heap.length >= 8000) return;
        P.heap.push({
          t: performance.now(),
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
        });
      }, cfg.heapMs);
    } else {
      P.noPerformanceMemory = true;
    }
    P.reset = function () {
      P.raf.length = 0; P.frames.length = 0; P.frameAt.length = 0; P.gaps.length = 0;
      P.longtasks.length = 0; P.heap.length = 0;
      P.simMs = 0; P.simCount = 0;
      P.lastRaf = 0; P.lastFrame = 0;
      P.resetAt = performance.now();
    };
    P.dump = function (since) {
      let frames = P.frames, frameAt = P.frameAt;
      if (since > 0 && P.frameAt.length) {
        let k = 0;
        while (k < P.frameAt.length && P.frameAt[k] < since) k++;
        if (k > 0) { frames = P.frames.slice(k); frameAt = P.frameAt.slice(k); }
      }
      return {
        resetAt: P.resetAt,
        now: performance.now(),
        raf: P.raf,
        gaps: P.gaps,
        frames,
        frameAt,
        simMs: +P.simMs.toFixed(1),
        simCount: P.simCount,
        longtasks: P.longtasks,
        heap: P.heap,
        frameProbeOn: P.frameProbeOn,
        longtaskUnsupported: !!P.longtaskUnsupported,
        noPerformanceMemory: !!P.noPerformanceMemory,
      };
    };
    P.cutHeap = function (since) {
      let k = 0;
      while (k < P.heap.length && P.heap[k].t < since) k++;
      return P.heap.slice(k);
    };
  }, { gapMs, heapMs });
  return true;
}

/**
 * 游戏就绪后的帧探针:实例补丁遮蔽原型方法(Game.prototype.frame/fixedUpdate,
 * 帧循环 this.frame(now)/this.fixedUpdate(FIXED_DT) 走实例属性)。
 *  - g.frame 包装 → 渲染帧(painted)间隔:frameCap 跳帧不计(游戏 Game.ts:7298
 *    loop 的 cap 早退不进 frame)——fps 语义=真实渲染帧率;
 *  - g.fixedUpdate 包装 → 逻辑 self ms(渲染≈帧-逻辑,cpu profile 里另有函数级拆分)。
 * 签名保真:frame(now)/fixedUpdate(dt, game)(坑表 D8:少参必炸)。
 */
export async function installFrameProbe(page) {
  await front(page);
  return page.evaluate(function swPerfInstallFrameProbe() {
    const g = window.__swGame;
    const P = window.__swPerf;
    if (!g || !P) return { ok: false, why: !g ? 'no-game' : 'no-perf' };
    if (P.frameProbeOn) return { ok: true, already: true };
    const proto = Object.getPrototypeOf(g);
    const origFrame = proto.frame;
    const origSim = proto.fixedUpdate;
    if (typeof origFrame !== 'function' || typeof origSim !== 'function') return { ok: false, why: 'no-proto-method' };
    g.frame = function swPerfFrameProbe(now) {
      const r = origFrame.call(g, now);
      const dt = now - P.lastFrame;
      P.lastFrame = now;
      if (P.frames.length < P.cap && dt > 0 && dt < 5000) { P.frames.push(dt); P.frameAt.push(now); }
      return r;
    };
    g.fixedUpdate = function swPerfSimProbe(dt, game) {
      const t0 = performance.now();
      const r = origSim.call(g, dt, game);
      P.simMs += performance.now() - t0;
      P.simCount++;
      return r;
    };
    P.frameProbeOn = true;
    return { ok: true, frame: typeof origFrame === 'function', sim: typeof origSim === 'function' };
  });
}

/** 卸帧探针(回原语义;perf 会话收尾用——非必须,页面即弃)。 */
export async function removeFrameProbe(page) {
  return page.evaluate(function swPerfRemoveFrameProbe() {
    const g = window.__swGame;
    const P = window.__swPerf;
    if (!g || !P?.frameProbeOn) return { ok: false };
    delete g.frame;
    delete g.fixedUpdate;
    P.frameProbeOn = false;
    return { ok: true };
  });
}

/**
 * 分段跑分器。startSegment(复位页内探针+起 profiler/trace+metrics 前照)→
 * 场景驱动真实时间窗 → endSegment(停通道+拉页内样本+算 fps/长任务/GC/热点+落盘)。
 * ★互斥纪律:startSegment..endSegment 之间禁 pump/pumpUntil/pumpInline(确定性泵
 * 与 perf 互斥,见文件头)——窗内只有真实 rAF 驱动的游戏循环与场景驱动器。
 */
export function createPerfRecorder(page, {
  outDir = '/tmp/probe-out/perf', scenario = 'perf',
  channels = { profile: true, trace: true, metrics: true },
  samplingIntervalUs = 1000, traceStacks = true, traceGpu = false, topN = 20,
} = {}) {
  let profCdp = null;        // metrics 会话(Performance 域;常驻)
  let open = null;           // { name, kind, t0, metricsBefore, resetAt }
  const segments = [];
  const artifacts = [];
  const channelErrors = [];
  let metricsEnabled = false;
  // ★会话卫生(IIIII239 三连坑的终解,全为实测):
  //  ① Profiler 与 Tracing 同会话 → trace 事件整段被吞(0 事件);
  //  ② 复用会话逐段 start/end → Tracing.end 后残留僵尸态,下一段
  //     "Tracing has already been started"(全程 10 次,段文件成批缺失);
  //  ⇒ trace 会话【每段新建、用完即 detach】;profiler 会话同样每段一套,
  //    metrics(Performance 域)独立常驻。会话生命周期=通道生命周期。
  let traceEvents = null;
  // ★IIIII248 异步段收:trace 事件按 client 分桶(段间可重叠——下一段 startSegment
  //  不再被上一段的 tracingComplete 排空阻塞,排空转后台)
  const traceEventsByClient = new Map();
  const onDataCollected = (client) => (e) => {
    const arr = traceEventsByClient.get(client);
    if (arr && Array.isArray(e?.value)) arr.push(...e.value);
  };

  const dir = join(outDir, scenario);
  mkdirSync(dir, { recursive: true });

  // ★IIIII246→248 两项仪器口径债修复:
  //  ①Profiler 首启停顿(390-425ms CpuProfiler::StartProfiling 堆遍历 safepoint)
  //    → 段起前做一次【丢弃式】warmup start/stop,把一次性成本移出计量窗;
  //  ②段收尾 traceStop 排空侵蚀段窗(7/13 dwell <1s、transit 丢段、80.1s 段溢出)
  //    → endSegment 同步收页内计量(墙钟窗闭合)后,trace 排空/解析/落盘转后台
    //    (先开下一段再收上一段),settled() 供报告/聚合前汇合。
  let profWarmupDone = false;
  const pendingFinalizes = new Set();

  async function ensureMetricsSess() {
    if (!profCdp) {
      profCdp = await page.createCDPSession();
      if (channels.metrics) {
        try { await profCdp.send('Performance.enable'); metricsEnabled = true; }
        catch (e) { channelErrors.push(`metrics:${String(e?.message ?? e).slice(0, 120)}`); }
      }
    }
    return profCdp;
  }

  /** trace 通道:每段全新会话;record-continuously(环形缓冲,高事件量段不断流)。
   *  ★IIIII248:事件按 client 分桶,段间重叠安全(上一段后台排空时下一段已在录)。 */
  async function traceStart() {
    const client = await page.createCDPSession();
    const categories = [...(traceStacks ? TRACE_CATEGORIES : TRACE_CATEGORIES_NOSTACK)];
    if (traceGpu) categories.push(TRACE_CATEGORY_GPU, TRACE_CATEGORY_GPU_TIMELINE);
    traceEventsByClient.set(client, []);
    const sink = onDataCollected(client);
    client.on('Tracing.dataCollected', sink);
    try {
      await client.send('Tracing.start', {
        transferMode: 'ReportEvents',
        traceConfig: { recordMode: 'record-continuously', includedCategories: categories, excludedCategories: [] },
      });
    } catch (e) {
      client.off('Tracing.dataCollected', sink);
      traceEventsByClient.delete(client);
      await client.detach().catch(() => {});
      throw e;
    }
    client.__swPerfSink = sink;
    return client;
  }

  async function traceStop(client) {
    const complete = new Promise((resolve) => {
      client.once('Tracing.tracingComplete', () => resolve('event'));
      setTimeout(() => resolve('timeout'), 8000).unref?.();
    });
    try { await client.send('Tracing.end'); } catch { /* 已停 */ }
    const how = await complete;
    client.off('Tracing.dataCollected', client.__swPerfSink ?? onDataCollected(client));
    const events = traceEventsByClient.get(client) ?? [];
    traceEventsByClient.delete(client);
    await client.detach().catch(() => {});   // 会话即弃:根治僵尸 tracing 态
    if (how === 'timeout' && events.length === 0) {
      channelErrors.push('trace:tracingComplete 超时且 0 事件(僵尸态?)');
    }
    return Buffer.from(JSON.stringify({ traceEvents: events }), 'utf8');
  }

  async function getMetrics() {
    if (!metricsEnabled || !profCdp) return null;
    try {
      const { metrics } = await profCdp.send('Performance.getMetrics');
      const map = {};
      for (const m of metrics) map[m.name] = m.value;
      return map;
    } catch (e) { channelErrors.push(`getMetrics:${String(e?.message ?? e).slice(0, 120)}`); return null; }
  }

  function metricsDelta(before, after) {
    if (!before || !after) return null;
    const keys = ['JSHeapUsedSize', 'JSHeapTotalSize', 'Frames', 'TaskDuration', 'ScriptDuration', 'LayoutCount', 'RecalcStyleCount', 'Nodes', 'JSEventListeners'];
    const d = {};
    for (const k of keys) {
      if (typeof before[k] === 'number' && typeof after[k] === 'number') d[k] = +(after[k] - before[k]).toFixed(3);
    }
    return d;
  }

  function safeName(name) {
    return String(name).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  }

  return {
    scenario,
    dir,
    segments,
    artifacts,
    channelErrors,
    get cdp() { return profCdp; },

    /** 段起:warmup(丢弃式,首段前) → 复位页内探针 → tracing.start → Profiler.start
     *  → metrics 前照。★IIIII248 ①:warmup 在【reset 之前】执行——每页首次
     *  Profiler.start 的 CpuProfiler::StartProfiling 主线程停顿(实测 390-425ms,
     *  堆遍历 safepoint)落在计量窗外,首段 max/low1 恢复真实。 */
    async startSegment(name, { kind = 'dwell' } = {}) {
      if (open) throw new Error(`[perf] 段 ${open.name} 未收口就开 ${name}`);
      await front(page);
      if (channels.profile && !profWarmupDone) {
        profWarmupDone = true;
        try {
          const wSess = await page.createCDPSession();
          try {
            await wSess.send('Profiler.enable');
            await wSess.send('Profiler.setSamplingInterval', { interval: Math.max(samplingIntervalUs, 1000) });
            await wSess.send('Profiler.start');
            await sleep(250);   // 覆盖首次 start 的堆遍历 safepoint(实测 ~400ms 内)
            await wSess.send('Profiler.stop');   // 丢弃(不计入任何段)
          } finally {
            await wSess.detach().catch(() => {});
          }
        } catch (e) {
          channelErrors.push(`profile.warmup:${String(e?.message ?? e).slice(0, 120)}`);
        }
      }
      const client = await ensureMetricsSess();
      await page.evaluate(() => { window.__swPerf?.reset?.(); });
      const metricsBefore = await getMetrics();
      let traceClient = null;
      let traceOn = false;
      if (channels.trace) {
        try {
          traceClient = await traceStart();
          traceOn = true;
        } catch (e) { channelErrors.push(`trace:${String(e?.message ?? e).slice(0, 120)}`); }
      }
      // profiler 亦每段一套会话(会话生命周期=通道生命周期,见文件头铁律)
      let profSess = null;
      let profileOn = false;
      if (channels.profile) {
        try {
          profSess = await page.createCDPSession();
          await profSess.send('Profiler.enable');
          await profSess.send('Profiler.setSamplingInterval', { interval: samplingIntervalUs });
          await profSess.send('Profiler.start');
          profileOn = true;
        } catch (e) {
          channelErrors.push(`profile:${String(e?.message ?? e).slice(0, 120)}`);
          await profSess?.detach().catch(() => {});
          profSess = null;
        }
      }
      open = { name, kind, t0: Date.now(), metricsBefore, traceOn, traceClient, profSess, profileOn };
      return open;
    },

    /** 段收:先快照页内计量 → 停 trace/profiler → 统计+落盘。 */
    async endSegment() {
      if (!open) throw new Error('[perf] 无开着的段');
      await front(page);
      const seg = open;
      open = null;
      // ★先快照页内计量(IIIII246):墙钟窗=reset→此刻(纯计量窗)。若先停通道,
      //   tracingComplete 排空(实测可到秒级)会把 fps 窗掺进排空期,段间相位也被
      //   这段延迟吃掉(巡游 dwell 缩水的机制)。
      const metricsAfter = await getMetrics();
      const since = await page.evaluate(() => window.__swPerf?.resetAt ?? 0);
      const dump = await page.evaluate((s) => {
        const d = window.__swPerf?.dump?.(s) ?? null;
        const heapCut = window.__swPerf?.cutHeap ? window.__swPerf.cutHeap(s) : (d?.heap ?? []);
        return { ...d, heap: heapCut };
      }, since);
      const wallMs = Math.max(1, dump.now - since);
      let profile = null;
      if (seg.profileOn && seg.profSess) {
        try {
          const { profile: prof } = await seg.profSess.send('Profiler.stop');
          profile = prof;
        } catch (e) { channelErrors.push(`profile.stop:${String(e?.message ?? e).slice(0, 120)}`); }
        finally {
          await seg.profSess.detach().catch(() => {});   // 会话即弃
          seg.profSess = null;
        }
      }

      const fps = fpsStats(dump.frames ?? [], wallMs);
      const rafFps = fpsStats(dump.raf ?? [], wallMs);
      const simPerFrame = dump.frames?.length ? dump.simMs / dump.frames.length : 0;
      const heapSeries = dump.heap ?? [];
      const heap0 = heapSeries[0]?.used ?? null;
      const heapEnd = heapSeries[heapSeries.length - 1]?.used ?? null;
      const lt = dump.longtasks ?? [];
      lt.sort((a, b) => b.ms - a.ms);

      // profile 通道归因(热点主通道)
      let prof = null;
      if (profile) {
        try { prof = summarizeProfile(profile, { topN }); } catch (e) { channelErrors.push(`summarizeProfile:${String(e?.message ?? e).slice(0, 120)}`); }
      }

      const record = {
        name: seg.name,
        kind: seg.kind,
        scenario,
        t0: seg.t0,
        wallMs: Math.round(wallMs),
        fps: {
          ...fps,
          rafMean: rafFps.mean,        // rAF 节拍(含 frameCap 跳帧)——与渲染帧率互证
          rafGaps: (dump.gaps ?? []).length,
        },
        sim: { msPerFrame: +simPerFrame.toFixed(3), sharePct: fps.mean > 0 ? +((simPerFrame * fps.mean / 10)).toFixed(1) : 0, calls: dump.simCount },
        longtasks: { count: lt.length, totalMs: +lt.reduce((s, x) => s + x.ms, 0).toFixed(1), maxMs: lt[0]?.ms ?? 0, top: lt.slice(0, 10) },
        heap: {
          startMB: heap0 != null ? +(heap0 / 1048576).toFixed(1) : null,
          endMB: heapEnd != null ? +(heapEnd / 1048576).toFixed(1) : null,
          deltaMB: heap0 != null && heapEnd != null ? +((heapEnd - heap0) / 1048576).toFixed(1) : null,
          samples: heapSeries.length,
          unsupported: !!dump.noPerformanceMemory,
        },
        metrics: { delta: metricsDelta(seg.metricsBefore, metricsAfter), before: seg.metricsBefore, after: metricsAfter },
        gc: null,
        trace: null,
        gpu: null,
        traceSpanCoveragePct: null,
        longTasksTrace: null,
        profile: prof ? { totalMs: prof.totalMs, sampleCount: prof.sampleCount, funcs: prof.funcs, framework: prof.framework, special: prof.special } : null,
      };
      // 落盘(cpuprofile 原始件;段记录归 run 级 report)
      if (profile) {
        const p = join(dir, `${safeName(seg.name)}.cpuprofile`);
        writeFileSync(p, JSON.stringify(profile));
        artifacts.push(p);
        record.artifacts = { ...(record.artifacts ?? {}), profile: p };
      }
      segments.push(record);
      // ★IIIII248 ②异步段收:trace 排空(tracingComplete 可达秒级)/解析/落盘转后台
      //  ——墙钟窗已随页内计量快照闭合,排空不再侵蚀段窗/吃掉段间相位(修 7/13
      //  dwell<1s、transit:dungeon~ocean 丢段、80.1s 段环形溢出证据面缺失)。
      //  下一段可在排空期间照常 startSegment(事件按 client 分桶,见 traceStart)。
      //  依赖 trace 字段的面(聚合/报告/基线)先 await rec.settled()。
      if (seg.traceOn && seg.traceClient) {
        const fin = (async () => {
          let traceBuf = null;
          try { traceBuf = await traceStop(seg.traceClient); }
          catch (e) { channelErrors.push(`trace.stop:${String(e?.message ?? e).slice(0, 120)}`); }
          if (traceBuf) {
            const p = join(dir, `${safeName(seg.name)}.trace`);
            try { writeFileSync(p, traceBuf); } catch (e) { channelErrors.push(`trace.write:${String(e?.message ?? e).slice(0, 120)}`); }
            artifacts.push(p);
            record.artifacts = { ...(record.artifacts ?? {}), trace: p };
            // trace 通道归因(长任务/GC/渲染分段;解析失败不炸段)
            let tr = null;
            try { tr = parseTrace(traceBuf); } catch (e) { channelErrors.push(`parseTrace:${String(e?.message ?? e).slice(0, 120)}`); }
            if (tr) {
              record.gc = tr.gc;
              record.trace = { wallMs: tr.wallMs, events: tr.events, frames: tr.frames, breakdown: tr.breakdown };
              record.gpu = tr.gpu;
              // trace 环形覆盖哨(IIIII246):tr.wallMs << 段墙钟 = 缓冲被灌只剩段尾
              record.traceSpanCoveragePct = tr.wallMs > 0 ? +((tr.wallMs / wallMs) * 100).toFixed(1) : null;
              record.longTasksTrace = tr.longTasks;
            }
          }
        })();
        pendingFinalizes.add(fin);
        fin.finally(() => pendingFinalizes.delete(fin)).catch(() => {});
      }
      return record;
    },

    /** ★IIIII248:汇合全部后台段收(trace 排空/解析/落盘)——聚合/报告/基线前调用。 */
    async settled() {
      while (pendingFinalizes.size > 0) {
        await Promise.all([...pendingFinalizes].map((p) => p.catch(() => {})));
      }
    },

    /** 当前是否有开着的段。 */
    get openSegment() { return open?.name ?? null; },
  };
}

/** 真实时间窗(perf 互斥纪律:窗内只 sleep,不泵)。 */
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 页内探针就绪哨(bootstrap 后、装帧探针前自检)。 */
export async function perfProbeReady(page) {
  return page.evaluate(() => {
    const P = window.__swPerf;
    return {
      ok: !!P && typeof P.reset === 'function' && typeof P.dump === 'function',
      v: P?.v ?? null,
      longtaskUnsupported: !!P?.longtaskUnsupported,
      noPerformanceMemory: !!P?.noPerformanceMemory,
    };
  });
}

/**
 * GPU 启用定谳(IIIII246;有头/headless 通用,launchBrowser 后任意时刻可调)。
 * 三证据面:
 *  ① CDP SystemInfo.getInfo → gpu.devices[].deviceString / gpu.auxAttributes(gl 实现);
 *  ② 页内 WEBGL_debug_renderer_info 的 UNMASKED_RENDERER/VENDOR 串(主证据,与
 *     meta.gpu 同源;SwiftShader/Software 指纹=软渲染铁证);
 *  ③ 片元 fill 基准(旁证):1200 迭代 sin/cos 着色器 × 256²,≤12 帧逐帧 readPixels
 *     同步——Apple GPU 实测 0.5~0.7ms/帧,SwiftShader(Vulkan Device)实测 ~28ms/帧
 *     (40~56× 鸿沟;>10ms/帧判软,超 2.5s 预算早停)。
 * verdict:renderer 串分类(classifyGpuRenderer)为主,fill 慢为否决票(两者冲突
 * 几乎不可能——renderer 串来自实际在用的 GL 后端;真冲突=功耗管控误报,信串)。
 * ★SystemInfo.getInfo 只在 browser target 可用(页 session 报 "only supported on
 * the browser target",IIIII246 实测)——要 gpuModel 就传 browser;不传只给页内串。
 */
export async function probeGpuEnablement(page, { browser = null } = {}) {
  let info = null;
  let infoErr = null;
  try {
    const c = browser
      ? await browser.target().createCDPSession()
      : await page.createCDPSession();
    try { info = await c.send('SystemInfo.getInfo'); } finally { await c.detach().catch(() => {}); }
  } catch (e) { infoErr = String(e?.message ?? e).slice(0, 120); }
  const p = await page.evaluate(async function swPerfGpuProbe() {
    try {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 256;
      const gl2 = cv.getContext('webgl2', { antialias: false });
      const gl = gl2 ?? cv.getContext('webgl', { antialias: false });
      if (!gl) return { webgl: false };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      const vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
      // fill 基准:全屏三角形 × 重片元(1200 迭代 sin/cos),readPixels 逐帧同步排空管线
      const fsSrc = 'precision mediump float;uniform float u;void main(){float x=u;'
        + 'for(int i=0;i<1200;i++){x=sin(x)*1.01+cos(x)*0.99;}'
        + 'gl_FragColor=vec4(fract(x),0.5,0.5,1.0);}';
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        return { webgl: true, renderer, vendor, webgl2: !!gl2, fillErr: 'link-failed' };
      }
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const uLoc = gl.getUniformLocation(prog, 'u');
      gl.viewport(0, 0, 256, 256);
      const px = new Uint8Array(4);
      const frame = (k) => {
        gl.uniform1f(uLoc, k * 0.001);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(128, 128, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      for (let k = 0; k < 3; k++) frame(k);   // warmup(着色器编译/管线预热)
      const t0 = performance.now();
      let fillFrames = 0;
      let fillAborted = false;
      for (let k = 3; k < 15; k++) {
        frame(k);
        fillFrames++;
        if (performance.now() - t0 > 2500) { fillAborted = true; break; }
      }
      const fillMsPerFrame = +((performance.now() - t0) / Math.max(1, fillFrames)).toFixed(3);
      return { webgl: true, renderer, vendor, webgl2: !!gl2, fillMsPerFrame, fillFrames, fillAborted };
    } catch (e) {
      return { webgl: false, fillErr: String(e?.message ?? e).slice(0, 120) };
    }
  });
  const devices = info?.gpu?.devices ?? [];
  const gpuModel = devices.find((d) => d?.deviceString)?.deviceString
    ?? info?.gpu?.deviceString ?? null;
  const aux = info?.gpu?.auxAttributes ?? null;
  const renderer = p?.renderer ?? null;
  const cls = classifyGpuRenderer(renderer, gpuModel ?? '');
  const fillSlow = p?.fillMsPerFrame != null && p.fillMsPerFrame > 10;   // 实测校准:Apple GPU 0.5~0.7 / SwiftShader ~28
  const verdict = cls.software || fillSlow ? 'software' : cls.verdict;
  return {
    renderer, vendor: p?.vendor ?? null,
    webgl2: !!p?.webgl2,
    fillMsPerFrame: p?.fillMsPerFrame ?? null,
    fillFrames: p?.fillFrames ?? 0,
    fillAborted: !!p?.fillAborted,
    fillErr: p?.fillErr ?? null,
    fillSlow,
    gpuModel,
    glImplementation: aux?.glImplementation ?? null,
    glRenderer: aux?.glRenderer ?? null,
    machineModel: info?.modelName ?? null,
    systemInfoOk: info != null,
    systemInfoErr: infoErr,
    classify: cls,
    verdict,
  };
}
