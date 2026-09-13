// IIII239 perf 分析器回归(fixture 驱动;纯 Node 零浏览器零网络):
// cpuprofile 解析/self-time 聚合/调用路径/框架开销识别 · trace 长任务+GC+渲染分段 ·
// fps 统计(1% low 口径) · 场景聚合(分段关联) · 基线对比(回归检测) · 报告自检 ·
// BIOME_STOPS 签名键守卫(防 tiles.ts 键名漂移/臆造)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isFrameworkFunc, shortUrl, summarizeProfile, parseTrace, fpsStats,
  aggregateSegments, buildSelfCheck, compareWithBaseline, renderReportMd, LONG_TASK_US,
  classifyGpuRenderer,
} from '../tools/probe/lib/perf-analyze.mjs';
import { BIOME_STOPS, STRESS_FACTORS } from '../tools/probe/lib/perf-scenarios.mjs';

const GAME = dirname(dirname(fileURLToPath(import.meta.url)));

/** 合成 cpuprofile:树 root→A→B1/B2;self-time 由 samples/timeDeltas(µs) 定。 */
function fixtureProfile() {
  const nodes = [
    { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: -1 }, children: [2] },
    { id: 2, callFrame: { functionName: 'swPerfFrameProbe', url: '', lineNumber: 0 }, children: [3] },
    { id: 3, callFrame: { functionName: 'frame', url: 'http://x/src/core/Game.ts', lineNumber: 7300 }, children: [4, 5] },
    { id: 4, callFrame: { functionName: 'render', url: 'http://x/src/core/Game.ts', lineNumber: 7600 }, children: [6] },
    { id: 5, callFrame: { functionName: 'fixedUpdate', url: 'http://x/src/core/Game.ts', lineNumber: 7000 }, children: [] },
    { id: 6, callFrame: { functionName: 'drawWorld', url: 'http://x/src/render/Renderer.ts', lineNumber: 120 }, children: [] },
  ];
  // 采样序列:render(4)×3=30µs? —— timeDeltas 与 samples 平行,delta[i] 归 samples[i]
  const samples = [2, 3, 4, 6, 6, 4, 5, 5];
  const timeDeltas = [100, 100, 200, 400, 300, 100, 500, 600];
  return { nodes, samples, timeDeltas, startTime: 0, endTime: 2_300 };
}

describe('IIIII239 summarizeProfile(cpuprofile self-time 聚合)', () => {
  const s = summarizeProfile(fixtureProfile() as never, { topN: 10 });
  it('总时长=ΣtimeDeltas(µs→ms)', () => {
    expect(s.totalMs).toBeCloseTo(2.3, 5);
    expect(s.sampleCount).toBe(8);
    expect(s.nodeCount).toBe(6);
  });
  it('self-time 按函数+url 聚合排序,跨行合并(line 取最热节点+1)', () => {
    // drawWorld: 400+300=700µs=0.7ms;fixedUpdate: 500+600=1.1ms;render: 200µs;frame: 100µs
    expect(s.funcs[0].fn).toBe('fixedUpdate');
    expect(s.funcs[0].selfMs).toBeCloseTo(1.1, 5);
    expect(s.funcs[1].fn).toBe('drawWorld');
    expect(s.funcs[1].selfMs).toBeCloseTo(0.7, 5);
    expect(s.funcs[1].line).toBe(121);   // lineNumber 120 → +1(人读行号)
    expect(s.funcs[2].fn).toBe('render');
    expect(s.funcs[2].selfPct).toBeCloseTo((300 / 2300) * 100, 1);   // render=self 200+100µs(两采样段;报表面 2 位小数)
  });
  it('框架注入函数(swperf 前缀)单列,不入主表', () => {
    expect(s.funcs.some((f: { fn: string }) => f.fn === 'swPerfFrameProbe')).toBe(false);
    expect(s.framework.selfMs).toBeCloseTo(0.1, 5);
    expect(s.framework.funcs[0].fn).toBe('swPerfFrameProbe');
  });
  it('调用路径:主表函数带 parent 链(根→frame→render)', () => {
    const dw = s.funcs.find((f: { fn: string }) => f.fn === 'drawWorld');
    expect(dw.parents.map((p: { fn: string }) => p.fn)).toEqual(['render', 'frame', 'swPerfFrameProbe']);
  });
  it('特殊节点((idle)/(program)/(garbage collector))单列 special', () => {
    const p = fixtureProfile();
    p.nodes.push({ id: 7, callFrame: { functionName: '(garbage collector)', url: '', lineNumber: -1 }, children: [] });
    p.samples.push(7); p.timeDeltas.push(900);
    const s2 = summarizeProfile(p as never, { topN: 10 });
    expect(s2.funcs.some((f: { fn: string }) => f.fn === '(garbage collector)')).toBe(false);
    expect(s2.special.some((f: { fn: string }) => f.fn === '(garbage collector)')).toBe(true);
  });
  it('空/畸形 profile 不炸', () => {
    expect(summarizeProfile(null as never).totalMs).toBe(0);
    expect(summarizeProfile({ nodes: [] } as never).sampleCount).toBe(0);
  });
});

describe('IIIII239 parseTrace(长任务/GC/渲染分段)', () => {
  const trace = {
    traceEvents: [
      { cat: 'devtools.timeline', name: 'RunTask', ts: 1000, dur: 80_000 },            // 长任务 80ms
      { cat: 'devtools.timeline', name: 'FunctionCall', ts: 2000, dur: 12_000 },
      { cat: 'devtools.timeline', name: 'MinorGC', ts: 3000, dur: 4_000 },
      { cat: 'devtools.timeline', name: 'MinorGC', ts: 4000, dur: 9_000 },
      { cat: 'devtools.timeline', name: 'MajorGC', ts: 5000, dur: 25_000 },
      { cat: 'devtools.timeline', name: 'Paint', ts: 6000, dur: 3_000 },
      { cat: 'devtools.timeline', name: 'DrawFrame', ts: 7000 },                        // 无 dur:只计 frames
      { cat: 'disabled-by-default-devtools.timeline', name: 'RunTask', ts: 8000, dur: 30_000 },   // <50ms 不算长任务
      { cat: 'v8', name: 'V8.GCCompactor', ts: 9000, dur: 2_000 },                      // v8 域 GC 也收
      { cat: 'metadata', name: 'process_name', ts: 0 },                                 // 忽略域
    ],
  };
  const t = parseTrace(trace as never)!;
  it('长任务=dur≥50ms 的 devtools.timeline 事件', () => {
    expect(LONG_TASK_US).toBe(50_000);
    expect(t.longTasks).toHaveLength(1);
    expect(t.longTasks[0]).toMatchObject({ name: 'RunTask', ms: 80 });
  });
  it('GC 聚合(count=Minor/Major 周期数/total=主线程全部 GC 事件/max/top)', () => {
    expect(t.gc.count).toBe(3);   // MinorGC×2 + MajorGC(V8.GCCompactor 是拆分事件,不算周期)
    expect(t.gc.totalMs).toBeCloseTo(40, 3);
    expect(t.gc.maxMs).toBe(25);
    expect(t.gc.top[0]).toEqual({ name: 'MajorGC', ms: 25 });
  });
  it('渲染分段按名聚合+占比', () => {
    const paint = t.breakdown.find((b: { name: string }) => b.name === 'Paint');
    expect(paint).toMatchObject({ count: 1, totalMs: 3 });
    const rt = t.breakdown.filter((b: { name: string }) => b.name === 'RunTask');
    expect(rt).toHaveLength(1);
    expect(rt[0].totalMs).toBe(110);
  });
  it('DrawFrame 计数(fps 交叉核对面)', () => expect(t.frames).toBe(1));
  it('坏输入返 null(不炸段)', () => {
    expect(parseTrace('not-json')).toBeNull();
    expect(parseTrace({} as never)).not.toBeNull();
  });
});

describe('IIIII239 fpsStats(1% low 口径)', () => {
  it('均值/p50/p95/p99/最大', () => {
    const dts = Array.from({ length: 100 }, (_, i) => 16 + (i % 3));
    const s = fpsStats(dts, 100 * 17);
    expect(s.frames).toBe(100);
    expect(s.mean).toBeCloseTo(100 / 1.7, 1);   // frames/墙钟秒(=58.8)
    expect(s.p50).toBe(17);
    expect(s.max).toBe(18);
  });
  it('1% low = 最差 1% 帧均值的倒数 fps(至少 1 帧)', () => {
    const dts = [...Array(99).fill(16), 200];
    const s = fpsStats(dts, 100 * 16.84);
    expect(s.low1).toBe(5);   // worstK=1 → 1000/200
  });
  it('畸形样本(0/NaN/巨帧)滤除;空数组零值不炸', () => {
    expect(fpsStats([16, 0, NaN, 99999] as never).frames).toBe(1);
    const e = fpsStats([]);
    expect(e.mean).toBe(0);
    expect(e.low1).toBe(0);
  });
});

describe('IIIII239 aggregateSegments(场景聚合+分段关联)', () => {
  const mkSeg = (name: string, kind: string, frames: number, wallMs: number, hot: Array<[string, string, number]>) => ({
    name, kind,
    fps: { frames, wallMs, mean: frames / (wallMs / 1000), max: 40 },
    longtasks: { count: 1, totalMs: 60 },
    gc: { count: 2, totalMs: 13 },
    profile: {
      totalMs: hot.reduce((s, h) => s + h[2], 0) * 10,
      framework: { selfMs: 0.5, pct: 1 },
      funcs: hot.map(([key, fn, ms]) => ({ key, fn, url: '/src/render/Renderer.ts', line: 1, selfMs: ms, selfPct: 5 })),
    },
  });
  const segs = [
    mkSeg('dwell:forest', 'dwell', 300, 5000, [['a@x', 'drawWorld', 10]]),
    mkSeg('transit:a~b', 'transit', 100, 3000, [['b@x', 'compositeLight', 7]]),
    mkSeg('dwell:hell', 'dwell', 100, 5000, [['a@x', 'drawWorld', 4]]),
  ];
  const agg = aggregateSegments(segs as never, {});
  it('transit 段不进默认聚合', () => {
    expect(agg.segments).toBe(2);
    expect(agg.fps.frames).toBe(400);
    expect(agg.fps.mean).toBeCloseTo(400 / 10, 1);
  });
  it('热点跨段合并,分段关联保留(segTop)', () => {
    expect(agg.hotspots[0].key).toBe('a@x');
    expect(agg.hotspots[0].selfMs).toBe(14);
    expect(agg.hotspots[0].segTop[0]).toContain('dwell:forest');
  });
  it('长任务/GC/框架开销聚合', () => {
    expect(agg.longtasks.count).toBe(2);
    expect(agg.gc.totalMs).toBe(26);
    expect(agg.framework.selfMs).toBe(1);
  });
});

describe('IIIII239 buildSelfCheck(报告合理性自检)', () => {
  it('框架开销<2%+top10 命中 src 热路径+渲染活性', () => {
    const run = {
      scenarios: {
        'biome-tour': {
          aggregate: { framework: { pct: 0.9 }, hotspots: [{ url: '/src/render/Renderer.ts', fn: 'drawWorld' }], },
          segments: [{ kind: 'dwell', name: 'dwell:forest', fps: { mean: 55 } }],
        },
      },
    };
    const c = buildSelfCheck(run as never);
    expect(c.ok).toBe(true);
    expect(c.checks.filter((x: { ok: boolean }) => x.ok).length).toBe(3);
  });
  it('框架开销超标/热路径未命中/死段(rAF 节流)各自爆红', () => {
    const bad = {
      scenarios: {
        'biome-tour': {
          aggregate: { framework: { pct: 3.5 }, hotspots: [{ url: '(eval)', fn: 'swPerfTourTick' }] },
          segments: [{ kind: 'dwell', name: 'dwell:forest', fps: { mean: 0.4 } }],
        },
      },
    };
    const c = buildSelfCheck(bad as never);
    expect(c.ok).toBe(false);
    expect(c.checks.every((x: { ok: boolean }) => !x.ok)).toBe(true);
  });
});

describe('IIIII239 compareWithBaseline(基线回归检测)', () => {
  const mkReport = (fpsMean: number, low1: number, hotPct: number) => ({
    scenarios: {
      'biome-tour': {
        segments: [{ name: 'dwell:hell', fps: { mean: fpsMean, low1 } }],
        aggregate: { hotspots: [{ key: 'drawWorld@x', fn: 'drawWorld', url: '/src/render/Renderer.ts', line: 120, selfPct: hotPct }] },
      },
    },
  });
  const baseline = { report: mkReport(60, 30, 8) };
  it('fps/1%low 降幅超阈=回归', () => {
    const r = compareWithBaseline(mkReport(50, 20, 8) as never, baseline as never, {});
    expect(r.ok).toBe(false);
    expect(r.segments[0].issues.join(' ')).toMatch(/fps/);
    expect(r.segments[0].issues.join(' ')).toMatch(/1%low/);
  });
  it('自改进(fps 升)不算回归;新段=新增登记', () => {
    const r = compareWithBaseline(mkReport(65, 35, 8) as never, baseline as never, {});
    expect(r.ok).toBe(true);
    const r2 = compareWithBaseline({
      scenarios: { 'biome-tour': { segments: [{ name: 'dwell:hell', fps: { mean: 60, low1: 30 } }], aggregate: { hotspots: [] } }, 'stress': { segments: [], aggregate: {} } },
    } as never, baseline as never, {});
    expect(r2.newSegments).toContain('stress(整场景)');
  });
  it('热点 selfPct 增长超阈=热点回归', () => {
    const r = compareWithBaseline(mkReport(60, 30, 12) as never, baseline as never, { hotGrowthPct: 2 });
    expect(r.hotspots.regressions[0]).toMatch(/drawWorld/);
  });
});

describe('IIIII239 场景数据面守卫(BIOME_STOPS 签名键/因子表)', () => {
  const tiles = readFileSync(join(GAME, 'src/data/tiles.ts'), 'utf8');
  it('BIOME_STOPS 覆盖任务面 14 群落', () => {
    expect(BIOME_STOPS.map((s) => s.key)).toEqual([
      'forest', 'corrupt', 'crimson', 'jungle', 'hallow', 'snow', 'desert', 'ocean',
      'underground', 'hell', 'space', 'temple', 'dungeon', 'mushroom',
    ]);
  });
  it('每个签名键字面存在于 src/data/tiles.ts(防键名臆造/漂移)', () => {
    const missing: string[] = [];
    for (const s of BIOME_STOPS) {
      for (const k of s.sig) {
        if (!tiles.includes(`key: '${k}'`)) missing.push(`${s.key}:${k}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it('space/underground 无签名键也合法(band 特例)', () => {
    expect(BIOME_STOPS.find((s) => s.key === 'space')!.band).toBe('space');
    expect(BIOME_STOPS.find((s) => s.key === 'underground')!.band).toBe('underground');
  });
  it('STRESS_FACTORS 六因子齐(暴雨/沙尘暴/血月/弹幕/水岩/粒子)', () => {
    expect(Object.keys(STRESS_FACTORS).sort()).toEqual(['blood', 'dust', 'liquid', 'proj', 'rain', 'sand']);
  });
});

describe('IIIII239 renderReportMd(报告渲染)', () => {
  it('含分段表/Top 卡点表/自检/基线节', () => {
    const run = {
      meta: { ts: 'T', seed: '05162020', size: 'small', dwellMs: 6000, chrome: 'Chrome 140', gpu: 'Apple M2', viewport: '1280x800', channels: 'profile,trace,metrics', loadavg: '1.00 1.00 1.00', notes: ['实时模式'] },
      scenarios: {
        'biome-tour': {
          aggregate: {
            segments: 1, fps: { mean: 55, frames: 330, maxFrameMs: 40 }, longtasks: { count: 1, totalMs: 60 }, gc: { count: 2, totalMs: 13 }, framework: { pct: 0.8 },
            hotspots: [{ fn: 'drawWorld', url: '/src/render/Renderer.ts', line: 120, selfMs: 300, selfPct: 12, segTop: ['dwell:forest:300ms'] }],
          },
          segments: [{ name: 'dwell:forest', kind: 'dwell', fps: { wallMs: 6000, mean: 55, low1: 30, p95: 20, p99: 25, max: 40 }, longtasks: { count: 1 }, gc: { count: 2 }, profile: { framework: { pct: 0.8 } } }],
        },
      },
    };
    const md = renderReportMd(run as never, { selfCheck: { ok: true, checks: [{ name: 'fw', ok: true, detail: '0.8%' }] } });
    expect(md).toContain('## 场景 biome-tour');
    expect(md).toContain('| 段 | kind | wall s | fps 均值 |');
    expect(md).toContain('### Top 卡点函数');
    expect(md).toContain('drawWorld');
    expect(md).toContain('loadavg');
    expect(md).toContain('PASS: fw');
  });
});

describe('IIIII239 isFrameworkFunc/shortUrl', () => {
  it('swperf 前缀/tools/probe url=框架;(eval) 缩写', () => {
    expect(isFrameworkFunc('swPerfFrameProbe', '')).toBe(true);
    expect(isFrameworkFunc('', 'http://x/tools/probe/lib/perf.mjs')).toBe(true);
    expect(isFrameworkFunc('drawWorld', 'http://x/src/render/Renderer.ts')).toBe(false);
    expect(shortUrl('http://localhost:5293/src/core/Game.ts')).toBe('/src/core/Game.ts');
    expect(shortUrl('')).toBe('(eval)');
  });
});

// ═══════════════ IIII246 GPU 启用定谳 + GPU 段量化 ═══════════════

describe('IIIII246 parseTrace GPU 段量化(GPU 进程账)', () => {
  const gpuTrace = {
    traceEvents: [
      // 元数据:GPU 进程(900)+ 线程名;Renderer(100)主线程
      { cat: '__metadata', name: 'process_name', pid: 900, args: { name: 'GPU Process' } },
      { cat: '__metadata', name: 'thread_name', pid: 900, tid: 1, args: { name: 'CrGpuMain' } },
      { cat: '__metadata', name: 'thread_name', pid: 900, tid: 2, args: { name: 'VizCompositorThread' } },
      { cat: '__metadata', name: 'process_name', pid: 100, args: { name: 'Renderer' } },
      { cat: '__metadata', name: 'thread_name', pid: 100, tid: 10, args: { name: 'CrRendererMain' } },
      // GPU 侧:GPUTask ×2=2.0ms;Commit 耗时件 0.8ms+无 dur 标记;SwapBuffers 0.3ms
      { pid: 900, tid: 1, cat: 'disabled-by-default-devtools.timeline', name: 'RunTask', ts: 1000, dur: 1600 },
      { pid: 900, tid: 1, cat: 'disabled-by-default-devtools.timeline', name: 'GPUTask', ts: 1100, dur: 1500 },
      { pid: 900, tid: 1, cat: 'disabled-by-default-devtools.timeline', name: 'GPUTask', ts: 3000, dur: 500 },
      { pid: 900, tid: 2, cat: 'disabled-by-default-devtools.timeline', name: 'Commit', ts: 2000, dur: 800 },
      { pid: 900, tid: 2, cat: 'cc,benchmark,disabled-by-default-devtools.timeline.frame', name: 'Commit', ts: 2100 },
      { pid: 900, tid: 2, cat: 'gpu', name: 'SwapBuffers', ts: 4000, dur: 300 },
      // Renderer 主线程:长任务 80ms + 渲染事件(GPU 事件不得混入主账)
      { pid: 100, tid: 10, cat: 'devtools.timeline', name: 'RunTask', ts: 500, dur: 80_000 },
      { pid: 100, tid: 10, cat: 'devtools.timeline', name: 'FunctionCall', ts: 6000, dur: 5_000 },
    ],
  };
  const t = parseTrace(gpuTrace as never)!;
  it('GPU 进程识别(__metadata process_name=GPU Process;线程名入账)', () => {
    expect(t.gpu).not.toBeNull();
    expect(t.gpu!.pid).toBe(900);
    expect(t.gpu!.threads).toContain('CrGpuMain');
    expect(t.gpu!.threads).toContain('VizCompositorThread');
  });
  it('GPUTask 聚合(count/total/max/mean/busyPct=和÷主线程墙钟)', () => {
    expect(t.gpu!.tasks.count).toBe(2);
    expect(t.gpu!.tasks.totalMs).toBeCloseTo(2, 3);
    expect(t.gpu!.tasks.maxMs).toBe(1.5);
    expect(t.gpu!.tasks.meanMs).toBe(1);
    // wall=主线程 ts 窗 500..6000µs=5.5ms → 2/5.5×100=36.4
    expect(t.gpu!.tasks.busyPct).toBeCloseTo(36.4, 1);
  });
  it('Commit 聚合(dur>0 计时长;dur=0 的 frame 域标记只计次)', () => {
    expect(t.gpu!.commit.count).toBe(1);
    expect(t.gpu!.commit.totalMs).toBeCloseTo(0.8, 3);
    expect(t.gpu!.commit.maxMs).toBe(0.8);
    expect(t.gpu!.commit.markers).toBe(1);
  });
  it('GPU breakdown 含 GPUTask/SwapBuffers;主线程 breakdown/长任务不混 GPU 事件', () => {
    const gpuNames = t.gpu!.breakdown.map((b: { name: string }) => b.name);
    expect(gpuNames).toContain('GPUTask');
    expect(gpuNames).toContain('SwapBuffers');
    expect(t.breakdown.map((b: { name: string }) => b.name)).not.toContain('GPUTask');
    expect(t.longTasks).toHaveLength(1);
    expect(t.longTasks[0]).toMatchObject({ name: 'RunTask', ms: 80 });
  });
  it('无 GPU 进程 trace → gpu=null 不炸;回退:无元数据时按 GPUTask 事件 pid 认', () => {
    const bare = parseTrace({ traceEvents: [{ cat: 'devtools.timeline', name: 'RunTask', ts: 1, dur: 100 }] } as never)!;
    expect(bare.gpu).toBeNull();
    const fallback = parseTrace({
      traceEvents: [{ pid: 777, tid: 1, cat: 'disabled-by-default-devtools.timeline', name: 'GPUTask', ts: 100, dur: 900 }],
    } as never)!;
    expect(fallback.gpu!.pid).toBe(777);
    expect(fallback.gpu!.tasks.totalMs).toBeCloseTo(0.9, 3);
  });
});

describe('IIIII246 classifyGpuRenderer(SwiftShader/Apple 指纹)', () => {
  it('Apple Metal(239/246 实测串)→ gpu-metal', () => {
    const c = classifyGpuRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)');
    expect(c).toMatchObject({ software: false, apple: true, backend: 'metal', verdict: 'gpu-metal' });
  });
  it('SwiftShader(Vulkan Device,246 实测串)→ software;llvmpipe/software 同判', () => {
    expect(classifyGpuRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)').verdict).toBe('software');
    expect(classifyGpuRenderer('llvmpipe (LLVM 15.0.7)').software).toBe(true);
    expect(classifyGpuRenderer('Software Renderer').software).toBe(true);
  });
  it('gpuModel 辅助(Apple 串+model)/非 Apple/空串', () => {
    expect(classifyGpuRenderer('ANGLE Metal Renderer: Unknown', 'Apple M5 Pro').apple).toBe(true);
    expect(classifyGpuRenderer('ANGLE (NVIDIA, ...)').verdict).toBe('gpu-other');
    expect(classifyGpuRenderer('').verdict).toBe('unknown');
  });
});

describe('IIIII246 aggregateSegments GPU 聚合/buildSelfCheck GPU 证据闸/renderReportMd GPU 面', () => {
  const segs = [
    { name: 'a', kind: 'dwell', fps: { frames: 60, wallMs: 1000, mean: 60 }, gpu: { tasks: { totalMs: 30, count: 100 }, commit: { totalMs: 5, count: 10 } } },
    { name: 'b', kind: 'dwell', fps: { frames: 120, wallMs: 2000, mean: 60 }, gpu: { tasks: { totalMs: 60, count: 200 }, commit: { totalMs: 10, count: 20 } } },
  ];
  it('GPU 账跨段求和+busyPct 按墙钟加权(tasksMs/commitMs/busyPct)', () => {
    const agg = aggregateSegments(segs as never);
    expect(agg.gpu.tasksMs).toBe(90);
    expect(agg.gpu.tasksCount).toBe(300);
    expect(agg.gpu.commitMs).toBe(15);
    expect(agg.gpu.busyPct).toBeCloseTo(3, 3);   // 90/3000×100
  });
  function mkRun(meta: unknown, list: unknown[]) {
    return {
      meta,
      scenarios: {
        s: {
          aggregate: { framework: { pct: 0.5 }, hotspots: [{ fn: 'drawWorld', url: '/src/render/Renderer.ts' }] },
          segments: list,
        },
      },
    };
  }
  const segOk = { name: 'dwell:a', kind: 'dwell', fps: { mean: 50, frames: 60, wallMs: 1000 }, trace: { events: 10 }, longtasks: { count: 0 }, gc: { count: 0 }, gpu: { tasks: { count: 5, totalMs: 3 } } };
  const segLost = { ...segOk, name: 'dwell:b', gpu: null };
  const findCheck = (r: ReturnType<typeof buildSelfCheck>, n: string) => r.checks.find((c: { name: string }) => c.name === n)!;
  it('traceGpu 开+段缺 GPU 账=FAIL;全段有账=PASS', () => {
    expect(findCheck(buildSelfCheck(mkRun({ traceGpu: true }, [segOk, segLost]) as never), 'gpu-evidence(s)').ok).toBe(false);
    expect(findCheck(buildSelfCheck(mkRun({ traceGpu: true }, [segOk]) as never), 'gpu-evidence(s)').ok).toBe(true);
  });
  it('traceGpu 关且全无 GPU 账=不强制(兼容旧环境);部分段有账(缓冲断流指纹)仍 FAIL', () => {
    expect(findCheck(buildSelfCheck(mkRun({ traceGpu: false }, [segLost]) as never), 'gpu-evidence(s)').ok).toBe(true);
    expect(findCheck(buildSelfCheck(mkRun({}, [segOk, segLost]) as never), 'gpu-evidence(s)').ok).toBe(false);
  });
  it('报告带 GPU 定谳行/聚合 GPU 行/分段 GPU 列', () => {
    const run = mkRun({}, [segOk]) as never as Parameters<typeof renderReportMd>[0];
    (run as { meta: Record<string, unknown> }).meta = {
      gpuCheck: { verdict: 'gpu-metal', renderer: 'ANGLE (Apple...)', gpuModel: 'ANGLE (Apple...)', fillMsPerFrame: 0.6 },
      headless: false,
    };
    const md = renderReportMd(run, {});
    expect(md).toContain('GPU 定谳:**gpu-metal**');
    expect(md).toContain('GPU:GPUTask');
    expect(md).toContain('GPU ms(busy%)');
  });
});
