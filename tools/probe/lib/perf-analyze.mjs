/**
 * IIII239 统一探针框架 —— 性能分析器(cpuprofile/trace 解析+场景聚合+报告+基线对比)。
 *
 * 坑史锚:
 *  - memory: playsoft-trace-hotspots-lightfast —— 软渲染 trace 热点定账(Commit 40%/
 *    compositeLight 回退 8.7ms/fixedUpdate 4.5/波场 3.4);「GPU 页绝不挂」:GPU 侧
 *    工作不出现在 CPU profiler 里——.cpuprofile 找的是 JS 卡点,GPU 段走 .trace 的
 *    GPUTask/RasterTask 计时面;
 *  - memory: vitest-default-timeout-pseudo-red —— 负载期超时伪红:perf 结论先看
 *    Duration/环境(机器负载 loadavg 入报告 meta)再定罪;
 *  - 纯 Node 零浏览器:本模块对 fixture 可单测(tests/probe-perf-analyze.test.ts)。
 *
 * 通道分工:
 *  - .cpuprofile(Profiler CDP)=函数级 self-time —— 找卡点的主通道;
 *  - .trace(tracing CDP)=长任务/渲染分段/GC 停顿 —— 归因佐证;
 *  - 页内 frame/rAF/longtask/heap 探针(perf.mjs)=fps/1%low/帧分布 —— 便宜常开;
 *  - Performance.getMetrics=JSHeap/Frames 类快照(fps 交叉核对)。
 *
 * 框架自身开销判定:perf 注入的一切页内函数按命名纪律带 `swperf` 前缀
 * (swPerfFrameProbe/swPerfSimProbe/swPerfRafTick/swPerfTourTick/swPerfStressTick
 * …),分析器据此单独列账并要求 <2%(SELF 自检闸,buildSelfCheck)。
 */

/** 框架注入函数的命名前缀(小写判定;见 perf.mjs 各注入函数)。 */
export const FRAMEWORK_FN_PREFIX = 'swperf';
/** 长任务阈值(µs;PerformanceObserver longtask 同口径 50ms)。 */
export const LONG_TASK_US = 50_000;

/** perf 注入函数/工具代码识别(报告里单列"框架自身开销")。 */
export function isFrameworkFunc(functionName, url) {
  const fn = String(functionName ?? '').toLowerCase();
  if (fn.startsWith(FRAMEWORK_FN_PREFIX)) return true;
  const u = String(url ?? '');
  return u.includes('/tools/probe') || u.toLowerCase().includes(FRAMEWORK_FN_PREFIX);
}

/** url 缩写:剥 origin,留路径+query 首段;空 url → '(eval)'。 */
export function shortUrl(url) {
  const u = String(url ?? '');
  if (!u) return '(eval)';
  try {
    const p = new URL(u);
    return p.pathname + (p.search ? '?' + p.search : '');
  } catch {
    return u.length > 80 ? u.slice(-80) : u;
  }
}

const SPECIAL_NODES = new Set(['(idle)', '(program)', '(garbage collector)', '(root)']);

/**
 * 解析 V8 CPU profile → { totalMs, sampleCount, nodeCount, funcs[], framework, special }。
 * funcs[]: { key, fn, url, line, selfMs, selfPct, samples, avgMs, parents[] } 按 selfMs 降序。
 * parents: 最热节点沿 parent 链的调用路径(每层 { fn, url, selfMs });(root) 止。
 * ★self-time 口径:timeDeltas[i](µs)归 samples[i](该间隔内正采样的节点)。
 */
export function summarizeProfile(profile, { topN = 25, parentDepth = 12 } = {}) {
  if (!profile || !Array.isArray(profile.nodes)) {
    return { totalMs: 0, sampleCount: 0, nodeCount: 0, funcs: [], framework: { selfMs: 0, pct: 0, funcs: [] }, special: [] };
  }
  const nodes = profile.nodes;
  const byId = new Map();
  const parentOf = new Map();
  for (const n of nodes) {
    byId.set(n.id, n);
    const kids = Array.isArray(n.children) ? n.children : [];
    for (const c of kids) if (!parentOf.has(c)) parentOf.set(c, n.id);
  }
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const n = Math.min(samples.length, deltas.length);
  // 聚合键 = 函数名@url(跨行合并;line 取自热最节点)
  const agg = new Map();
  let totalUs = 0;
  const nodeSelfUs = new Map();
  for (let i = 0; i < n; i++) {
    const dUs = Math.max(0, deltas[i]);
    totalUs += dUs;
    nodeSelfUs.set(samples[i], (nodeSelfUs.get(samples[i]) ?? 0) + dUs);
  }
  for (const [nodeId, selfUs] of nodeSelfUs) {
    const node = byId.get(nodeId);
    if (!node) continue;
    const cf = node.callFrame ?? {};
    const fn = cf.functionName || '(anonymous)';
    const url = cf.url ?? '';
    const key = `${fn}@${url}`;
    let rec = agg.get(key);
    if (!rec) { rec = { key, fn, url, line: -1, selfUs: 0, samples: 0, hotNodeId: nodeId, hotSelfUs: 0 }; agg.set(key, rec); }
    rec.selfUs += selfUs;
    rec.samples += 1;
    if (selfUs > rec.hotSelfUs) { rec.hotSelfUs = selfUs; rec.hotNodeId = nodeId; rec.line = (cf.lineNumber ?? -1) + 1; }
  }
  const totalMs = totalUs / 1000;
  const funcs = [...agg.values()].sort((a, b) => b.selfUs - a.selfUs);
  const out = [];
  const framework = { selfMs: 0, pct: 0, funcs: [] };
  const special = [];
  for (const r of funcs) {
    const selfMs = r.selfUs / 1000;
    const pctOf = totalMs > 0 ? (r.selfUs / totalUs) * 100 : 0;
    const isFw = isFrameworkFunc(r.fn, r.url);
    const isSpecial = SPECIAL_NODES.has(r.fn);
    const rec = {
      key: r.key, fn: r.fn, url: shortUrl(r.url), line: r.line,
      selfMs: +selfMs.toFixed(2), selfPct: +pctOf.toFixed(2),
      samples: r.samples, avgMs: r.samples ? +(selfMs / r.samples).toFixed(4) : 0,
      framework: isFw || undefined, special: isSpecial || undefined,
    };
    if (isFw) { framework.selfMs += selfMs; framework.funcs.push(rec); }
    else if (isSpecial) special.push(rec);
    else out.push(rec);
  }
  framework.pct = totalMs > 0 ? +((framework.selfMs / totalMs) * 100).toFixed(2) : 0;
  // 调用路径:主表前若干函数的最热节点 parent 链
  for (const rec of out.slice(0, topN)) {
    const hot = agg.get(rec.key);
    const chain = [];
    let cur = hot ? parentOf.get(hot.hotNodeId) : undefined;
    let depth = 0;
    while (cur != null && depth < parentDepth) {
      const pNode = byId.get(cur);
      if (!pNode) break;
      const cf = pNode.callFrame ?? {};
      const pFn = cf.functionName || '(anonymous)';
      if (pFn !== '(root)') {
        chain.push({ fn: pFn, url: shortUrl(cf.url), selfMs: +((nodeSelfUs.get(cur) ?? 0) / 1000).toFixed(2) });
      }
      cur = parentOf.get(cur);
      depth++;
    }
    rec.parents = chain;
  }
  return {
    totalMs: +totalMs.toFixed(1),
    sampleCount: n,
    nodeCount: nodes.length,
    funcs: out.slice(0, topN),
    framework: { ...framework, funcs: framework.funcs.slice(0, 10) },
    special: special.slice(0, 5),
  };
}

/**
 * 解析 Chrome trace(JSON 字符串/Buffer/TypedArray/对象)→
 * { wallMs, longTasks[], gc{count,totalMs,maxMs,top[]}, gcAll, breakdown[], frames }。
 * 长任务=devtools.timeline 域 dur≥50ms 事件(LONG_TASK_US,与 longtask observer 同口径);
 * GC=名字命中 /GC/ 的事件;breakdown=渲染主线程带 dur 事件按名聚合(归因面)。
 * ★主线程过滤:trace 含 GPU/合成器/后台线程(V8.GC_MC_BACKGROUND_MARKING 是后台
 *  并发标记——算进它会把"GC 停顿"虚高成主线程卡顿)。先从 __metadata thread_name
 *  认出 CrRendererMain 的 pid/tid,gc/longTasks/breakdown 只统计主线程;找不到该
 *  线程元数据时回退全量(不过滤)。gcAll=含后台线程的全量 GC 账(参考面)。
 * ★puppeteer tracing.stop() 回 Uint8Array(getReadableAsTypedArray)——非 Buffer:
 *  必须 ArrayBuffer.isView 分支(IIIII239 smoke 实测漏此支=events 恒 0)。
 */
export function parseTrace(data) {
  let json = data;
  if (typeof data === 'string') { try { json = JSON.parse(data); } catch { return null; } }
  else if (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) {
    try { json = JSON.parse(new TextDecoder().decode(data)); } catch { return null; }
  }
  else if (data == null || typeof data !== 'object') return null;
  const evs = Array.isArray(json?.traceEvents) ? json.traceEvents : [];
  // 主线程识别(CrRendererMain;GPU/合成器/后台标记线程排除在主账外)。
  // ★候选可有多个(headless 常伴一个只含 PerfettoTrace 的备用 Renderer 进程)——
  //   取事件数最多的候选 pid(IIIII239 实测:备用进程 171 事件 vs 真渲染 130610)
  const candPid = new Map();
  for (const e of evs) {
    if (e?.cat === '__metadata' && e?.name === 'thread_name' && e.args?.name === 'CrRendererMain') {
      candPid.set(e.pid, (candPid.get(e.pid) ?? 0) + 1);
    }
  }
  let mainKey = null;
  let mainPid = null;
  if (candPid.size) {
    const counts = new Map();
    for (const e of evs) {
      if (e?.pid != null && candPid.has(e.pid) && e.cat !== '__metadata') counts.set(e.pid, (counts.get(e.pid) ?? 0) + 1);
    }
    mainPid = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? [...candPid.keys()][0];
    for (const e of evs) {
      if (e?.cat === '__metadata' && e?.name === 'thread_name' && e.args?.name === 'CrRendererMain' && e.pid === mainPid) {
        mainKey = `${e.pid}:${e.tid}`;
        break;
      }
    }
  }
  const isMain = (e) => mainKey == null || `${e.pid}:${e.tid}` === mainKey;
  const longTasks = [];
  const gcAll = [];
  const gcMain = [];
  const byName = new Map();
  let drawFrames = 0;
  let lastTs = null;
  let firstTs = null;
  for (const e of evs) {
    if (!e || typeof e !== 'object') continue;
    const cat = String(e.cat ?? '');
    const name = String(e.name ?? '');
    const durUs = typeof e.dur === 'number' ? e.dur : 0;
    const ts = typeof e.ts === 'number' ? e.ts : null;
    // 墙钟窗只取渲染主进程的非元数据 ts(各进程 ts 基准不同;metadata/零 ts 事件
    // 会把窗拉到机器 uptime 量级——IIIII239 实测 wallMs=549615119ms 伪值)
    if (ts != null && ts > 0 && cat !== '__metadata' && (mainPid == null || e.pid === mainPid)) {
      if (firstTs == null || ts < firstTs) firstTs = ts;
      if (lastTs == null || ts > lastTs) lastTs = ts;
    }
    const inTimeline = cat.includes('devtools.timeline');
    const isGcName = /(^|\.)GC|GCEvent|MinorGC|MajorGC|BlinkGC/i.test(name);
    const inV8 = cat.includes('v8') || cat.includes('toplevel');
    if (!inTimeline && !(isGcName && inV8)) continue;
    // DrawFrame 在合成器线程(非 CrRendererMain)——fps 交叉核对面按渲染进程全线程计
    if (name === 'DrawFrame' && (mainPid == null || e.pid === mainPid)) drawFrames++;
    if (durUs <= 0) continue;
    if (isGcName) {
      gcAll.push({ name, durUs, ts });
      if (isMain(e)) gcMain.push({ name, durUs, ts });
    }
    if (inTimeline && isMain(e)) {
      if (durUs >= LONG_TASK_US && name !== '(trace buffer overflow)') {
        longTasks.push({ name, ms: +(durUs / 1000).toFixed(1), t: ts });
      }
      const rec = byName.get(name) ?? { name, count: 0, totalUs: 0 };
      rec.count++; rec.totalUs += durUs;
      byName.set(name, rec);
    }
  }
  gcMain.sort((a, b) => b.durUs - a.durUs);
  gcAll.sort((a, b) => b.durUs - a.durUs);
  const gcTotalUs = gcMain.reduce((s, g) => s + g.durUs, 0);
  const gcAllTotalUs = gcAll.reduce((s, g) => s + g.durUs, 0);
  const wallMs = firstTs != null && lastTs != null ? Math.max(0, (lastTs - firstTs) / 1000) : 0;
  const breakdown = [...byName.values()]
    .sort((a, b) => b.totalUs - a.totalUs)
    .slice(0, 18)
    .map((r) => ({
      name: r.name, count: r.count,
      totalMs: +(r.totalUs / 1000).toFixed(1),
      pct: +(r.totalUs / Math.max(1, totalOf(byName)) * 100).toFixed(2),
    }));
  return {
    wallMs: +wallMs.toFixed(0),
    events: evs.length,
    mainThread: mainKey != null,
    longTasks: longTasks.sort((a, b) => b.ms - a.ms).slice(0, 24),
    gc: {
      // count=MinorGC/MajorGC 次数(≈GC 周期数;一次 scavenge 会拆 MinorGC+V8.GC_SCAVENGER
      // 等多条事件,不能拿全部 GC 名事件当次数);totalMs=主线程全部 GC 名事件时长和
      count: gcMain.filter((g) => /^(MinorGC|MajorGC)$/.test(g.name)).length,
      totalMs: +(gcTotalUs / 1000).toFixed(1),
      maxMs: gcMain.length ? +(gcMain[0].durUs / 1000).toFixed(1) : 0,
      top: gcMain.slice(0, 8).map((g) => ({ name: g.name, ms: +(g.durUs / 1000).toFixed(1) })),
      allCount: gcAll.length,
      allTotalMs: +(gcAllTotalUs / 1000).toFixed(1),   // 含后台并发标记(参考面,非主线程停顿)
    },
    breakdown,
    frames: drawFrames,
  };
}
function totalOf(byName) {
  let s = 0;
  for (const r of byName.values()) s += r.totalUs;
  return s;
}

/** 帧时间数组(ms)→ fps 统计(均值/p50/p95/p99/最大/1% low)。 */
export function fpsStats(frameDts, wallMsHint = 0) {
  const dts = frameDts.filter((d) => Number.isFinite(d) && d > 0 && d < 5000);
  const n = dts.length;
  if (!n) return { frames: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0, low1: 0, wallMs: wallMsHint };
  const s = [...dts].sort((a, b) => a - b);
  const at = (p) => s[Math.min(n - 1, Math.floor(n * p))];
  const worstK = Math.max(1, Math.ceil(n * 0.01));
  let worstSum = 0;
  for (let i = n - worstK; i < n; i++) worstSum += s[i];
  const wallMs = wallMsHint > 0 ? wallMsHint : dts.reduce((a, b) => a + b, 0);
  return {
    frames: n,
    mean: +(n / (wallMs / 1000)).toFixed(2),
    p50: +at(0.50).toFixed(2),
    p95: +at(0.95).toFixed(2),
    p99: +at(0.99).toFixed(2),
    max: +s[n - 1].toFixed(1),
    low1: +(1000 / (worstSum / worstK)).toFixed(2),
    wallMs: Math.round(wallMs),
  };
}

/**
 * 分段聚合到场景(报告"Top 卡点函数表(含 self-time 与所属场景关联)"的数据面)。
 * kind!=='transit' 的段参与默认聚合(巡航途中段单列,不污染驻留读数)。
 */
export function aggregateSegments(segments, { topN = 25, excludeKinds = ['transit'] } = {}) {
  const use = segments.filter((s) => !excludeKinds.includes(s.kind));
  let frames = 0, wallMs = 0, worst = [];
  const hot = new Map();
  let fwSelfMs = 0, fwTotalMs = 0;
  let ltCount = 0, ltMs = 0, gcCount = 0, gcMs = 0;
  for (const seg of use) {
    frames += seg.fps?.frames ?? 0;
    wallMs += seg.fps?.wallMs ?? 0;
    if (seg.fps?.max) worst.push(seg.fps.max);
    ltCount += seg.longtasks?.count ?? 0;
    ltMs += seg.longtasks?.totalMs ?? 0;
    gcCount += seg.gc?.count ?? 0;
    gcMs += seg.gc?.totalMs ?? 0;
    const profTotal = seg.profile?.totalMs ?? 0;
    fwTotalMs += profTotal;
    fwSelfMs += seg.profile?.framework?.selfMs ?? 0;
    for (const f of seg.profile?.funcs ?? []) {
      const key = f.key;
      const rec = hot.get(key) ?? { key, fn: f.fn, url: f.url, line: f.line, selfMs: 0, segs: {} };
      rec.selfMs += f.selfMs;
      rec.segs[seg.name] = +f.selfMs.toFixed(2);
      hot.set(key, rec);
    }
  }
  const hotArr = [...hot.values()]
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, topN)
    .map((r) => ({
      ...r,
      selfMs: +r.selfMs.toFixed(2),
      // selfPct 重算于合并后口径(分母=各段 profile 时长和;段级 selfPct 分母各段不同,不可直接加)
      selfPct: fwTotalMs > 0 ? +((r.selfMs / fwTotalMs) * 100).toFixed(2) : 0,
      segTop: Object.entries(r.segs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}ms`),
    }));
  return {
    segments: use.length,
    // 帧数/墙钟加权聚合(段级 fps 直接平均会被短段放大——按 frames/wall 折算)
    fps: {
      mean: +(frames / Math.max(0.001, wallMs / 1000)).toFixed(2),
      frames, wallMs: Math.round(wallMs),
      maxFrameMs: worst.length ? +Math.max(...worst).toFixed(1) : 0,
    },
    longtasks: { count: ltCount, totalMs: +ltMs.toFixed(1) },
    gc: { count: gcCount, totalMs: +gcMs.toFixed(1) },
    framework: { selfMs: +fwSelfMs.toFixed(2), pct: fwTotalMs > 0 ? +((fwSelfMs / fwTotalMs) * 100).toFixed(2) : 0 },
    hotspots: hotArr,
  };
}

/** 框架开销/热路径命中/渲染活性 自检(任务④"报告合理性自检")。 */
export function buildSelfCheck(run) {
  const checks = [];
  const fwPctLimit = 2;
  for (const [name, sc] of Object.entries(run.scenarios ?? {})) {
    const fw = sc.aggregate?.framework?.pct ?? 0;
    checks.push({
      name: `framework-overhead<${fwPctLimit}%(${name})`,
      ok: fw < fwPctLimit,
      detail: `${fw}%`,
    });
    const top = sc.aggregate?.hotspots ?? [];
    const srcHit = top.slice(0, 10).some((f) => String(f.url).includes('/src/'));
    checks.push({
      name: `top10-hit-src-hotpath(${name})`,
      ok: srcHit,
      detail: srcHit ? 'yes' : `top10 无 src/ 函数:${top.slice(0, 3).map((f) => f.fn).join(',')}`,
    });
    const dead = (sc.segments ?? []).filter((s) => s.kind !== 'transit' && (s.fps?.mean ?? 0) <= 1);
    checks.push({
      name: `renderer-alive(${name})`,
      ok: dead.length === 0,
      detail: dead.length ? `死段:${dead.map((s) => s.name).join(',')}(fps≤1 = rAF 节流/误用确定性泵)` : 'all>1',
    });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * 基线对比(回归检测):新跑 vs 基线的 fps/热点 diff。
 * baseline = 此前 buildReport().json(或其 .report 字段);缺段按"新增段"列出。
 * 阈值:fps 均值降幅 > fpsDropPct% 或 1%low 降幅 > low1DropPct% → 回归;
 * 热点:selfPct 较基线上涨 > hotGrowthPct(pp)→ 热点回归;新进 topN 不在基线 topN → 新热点。
 */
export function compareWithBaseline(report, baseline, {
  fpsDropPct = 10, low1DropPct = 20, hotGrowthPct = 2, topN = 25,
} = {}) {
  const b = baseline?.report ?? baseline;
  const out = { segments: [], newSegments: [], hotspots: { regressions: [], newHotspots: [] }, ok: true };
  const bScen = b?.scenarios ?? {};
  for (const [sname, sc] of Object.entries(report?.scenarios ?? {})) {
    const bs = bScen[sname];
    if (!bs) { out.newSegments.push(`${sname}(整场景)`); continue; }
    const bSegs = new Map((bs.segments ?? []).map((s) => [s.name, s]));
    const nSegs = new Map((sc.segments ?? []).map((s) => [s.name, s]));
    for (const [name, seg] of nSegs) {
      const bseg = bSegs.get(name);
      if (!bseg) { out.newSegments.push(`${sname}/${name}`); continue; }
      const drop = (a, bv) => bv > 0 ? ((bv - a) / bv) * 100 : 0;
      const fpsDrop = drop(seg.fps?.mean ?? 0, bseg.fps?.mean ?? 0);
      const low1Drop = drop(seg.fps?.low1 ?? 0, bseg.fps?.low1 ?? 0);
      const issues = [];
      if (fpsDrop > fpsDropPct) issues.push(`fps ${bseg.fps?.mean}→${seg.fps?.mean}(-${fpsDrop.toFixed(1)}%)`);
      if (low1Drop > low1DropPct) issues.push(`1%low ${bseg.fps?.low1}→${seg.fps?.low1}(-${low1Drop.toFixed(1)}%)`);
      out.segments.push({ scenario: sname, name, fpsDrop: +fpsDrop.toFixed(1), low1Drop: +low1Drop.toFixed(1), ok: issues.length === 0, issues });
    }
    // 热点对比(场景聚合表)
    const bHot = new Map((bs.aggregate?.hotspots ?? []).map((f) => [f.key, f]));
    const nHot = (sc.aggregate?.hotspots ?? []).slice(0, topN);
    const bTopSet = new Set([...bHot.keys()].slice(0, topN));
    for (const f of nHot) {
      const bf = bHot.get(f.key);
      if (!bf) {
        if (!bTopSet.has(f.key)) out.hotspots.newHotspots.push(`${sname}:${f.fn}@${f.url}:${f.line}(self ${f.selfPct}%)`);
        continue;
      }
      if ((f.selfPct ?? 0) - (bf.selfPct ?? 0) > hotGrowthPct) {
        out.hotspots.regressions.push(`${sname}:${f.fn}@${f.url}:${f.line} selfPct ${bf.selfPct}%→${f.selfPct}%`);
      }
    }
  }
  out.ok = out.segments.every((s) => s.ok) && out.hotspots.regressions.length === 0;
  return out;
}

/** 报告 markdown(人读面;json 为机读面)。 */
export function renderReportMd(run, { baselineCompare = null, selfCheck = null } = {}) {
  const L = [];
  L.push(`# IIII239 perf 报告 — ${run.meta?.title ?? run.meta?.scenario ?? 'perf run'}`);
  L.push('');
  const dwellTxt = typeof (run.meta?.dwellMs) === 'object' && run.meta?.dwellMs
    ? `tour=${run.meta.dwellMs.tour}/stress=${run.meta.dwellMs.stress}ms`
    : `${run.meta?.dwellMs ?? ''}ms`;
  L.push(`- 时间:${run.meta?.ts ?? ''} · seed=${run.meta?.seed ?? ''} · size=${run.meta?.size ?? ''} · dwell=${dwellTxt}`);
  L.push(`- 环境:${run.meta?.chrome ?? ''} · GPU=${run.meta?.gpu ?? 'n/a'} · 视口 ${run.meta?.viewport ?? ''} · 通道=${run.meta?.channels ?? ''}`);
  L.push(`- 机器负载 loadavg=${run.meta?.loadavg ?? 'n/a'}(perf 结论判读先看此项——并行负载会整体压低 fps)`);
  if (run.meta?.notes?.length) for (const n of run.meta.notes) L.push(`- 注:${n}`);
  L.push('');
  for (const [sname, sc] of Object.entries(run.scenarios ?? {})) {
    const a = sc.aggregate ?? {};
    L.push(`## 场景 ${sname}(${a.segments ?? 0} 段聚合)`);
    L.push('');
    L.push(`- fps 均值 **${a.fps?.mean ?? 'n/a'}**(frames=${a.fps?.frames ?? 0})· 最长帧 ${a.fps?.maxFrameMs ?? 'n/a'}ms · 长任务 ${a.longtasks?.count ?? 0}(${a.longtasks?.totalMs ?? 0}ms)· GC ${a.gc?.count ?? 0} 次(${a.gc?.totalMs ?? 0}ms)`);
    L.push(`- **框架自身开销 ${a.framework?.pct ?? 0}%**(要求 <2%)`);
    L.push('');
    L.push('### 分段');
    L.push('');
    L.push('| 段 | kind | wall s | fps 均值 | 1% low | p95 帧 ms | p99 帧 ms | 最长帧 ms | 长任务 | GC | 框架 % |');
    L.push('|---|------|--------|----------|--------|-----------|-----------|-----------|--------|----|--------|');
    for (const s of sc.segments ?? []) {
      L.push(`| ${s.name} | ${s.kind} | ${((s.fps?.wallMs ?? 0) / 1000).toFixed(1)} | ${s.fps?.mean ?? '-'} | ${s.fps?.low1 ?? '-'} | ${s.fps?.p95 ?? '-'} | ${s.fps?.p99 ?? '-'} | ${s.fps?.max ?? '-'} | ${s.longtasks?.count ?? 0} | ${s.gc?.count ?? 'n/a'} | ${s.profile?.framework?.pct ?? '-'} |`);
    }
    L.push('');
    L.push('### Top 卡点函数(场景聚合,self-time)');
    L.push('');
    L.push('| # | 函数 | 位置 | self ms | self % | 热分段 |');
    L.push('|---|------|------|---------|--------|--------|');
    (a.hotspots ?? []).slice(0, 15).forEach((f, i) => {
      L.push(`| ${i + 1} | ${f.fn}${f.framework ? ' ⚠框架' : ''} | ${f.url}:${f.line} | ${f.selfMs} | ${f.selfPct}% | ${f.segTop?.join(' · ') ?? ''} |`);
    });
    L.push('');
    const worst = (sc.segments ?? []).flatMap((s) => (s.longtasks?.top ?? []).map((t) => ({ seg: s.name, ...t })))
      .sort((a, b) => b.ms - a.ms).slice(0, 8);
    if (worst.length) {
      L.push('### 最差长任务(>50ms,trace 佐证)');
      L.push('');
      for (const t of worst) L.push(`- ${t.seg}:${t.name ?? 'longtask(observer)'} ${t.ms}ms`);
      L.push('');
    }
  }
  if (selfCheck) {
    L.push('## 自检');
    L.push('');
    for (const c of selfCheck.checks) L.push(`- ${c.ok ? 'PASS' : 'FAIL'}: ${c.name}(${c.detail})`);
    L.push('');
  }
  if (baselineCompare) {
    L.push('## 基线对比');
    L.push('');
    L.push(`- 结论:${baselineCompare.ok ? '无回归' : '**存在回归**'}`);
    for (const s of baselineCompare.segments ?? []) {
      if (!s.ok) L.push(`- 回归:${s.scenario}/${s.name}:${s.issues.join('; ')}`);
    }
    for (const h of baselineCompare.hotspots?.regressions ?? []) L.push(`- 热点增长:${h}`);
    for (const h of baselineCompare.hotspots?.newHotspots ?? []) L.push(`- 新热点:${h}`);
    L.push('');
  }
  return L.join('\n');
}
