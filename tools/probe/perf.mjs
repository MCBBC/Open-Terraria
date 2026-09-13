#!/usr/bin/env node
/**
 * IIII239 统一探针框架 —— 性能评估 CLI(实时跑分;perf.mjs CLI 与 probe.mjs 平行,
 * 不改共享 probe.mjs 的参数面)。
 *
 * 用法:
 *   node tools/probe/perf.mjs run [选项]
 *     --scenario=<biome-tour|stress|all>   场景(缺省 biome-tour)
 *     --seed=<种子|别名>                   缺省 drunk=05162020(双恶地全覆盖,锚定全群落)
 *     --size=<small|medium|large>          缺省 small
 *     --dwell=<ms>                         巡游每站驻留/压力单因子窗(缺省 6000/8000)
 *     --speed=<tile/s>                     巡游平移速度(缺省 40)
 *     --stress=<rain,sand,blood,proj,liquid,dust>   压力因子组合(缺省全开)
 *     --proj-target=<n> --dust-rate=<n>    压力注入量(缺省 260 / 140/s)
 *     --channels=<profile,trace,metrics>   采集通道(缺省全开)
 *     --no-trace-stacks                    关 .trace 的 stack 类目(体积 ×3~5 → 1×)
 *     --trace-gpu                          .trace 加 'gpu' 类目(GPU 段证据;事件量大
 *                                          ~60%,默认关防 trace 缓冲挤掉主线程事件)
 *     --measure-transit=0                  巡游途中段不采集(缺省采集,kind=transit)
 *     --baseline=<json>                    基线对比(回归检测)
 *     --fail-on-regression                 有回归时退出码 2(缺省只报告)
 *     --vite=<auto|PORT|off>               auto=5201+ 扫描私有实例;PORT=复用(会话约定口)
 *     --headed                             有头 Chrome(默认 headless 'new'+GPU args)
 *     --use-angle=<metal|swiftshader|gl>   ANGLE 后端(缺省 metal=硬件路径;swiftshader
 *                                          显式钉软渲染=两象限对拍;darwin 生效)
 *     --no-gpu-args                        去掉 GPU args(全裸回 Chrome 缺省)
 *     --gpu-probe=0                        跳过 GPU 启用定谳(缺省:SystemInfo+renderer 串
 *                                          +fill 基准 → meta.gpuCheck.verdict)
 *     --trace-gpu                          .trace 加 'gpu'+GPU timeline 类目(GPU 证据加厚;
 *                                          GPUTask/Commit 基础类目已带,解析不受此开关限制)
 *     --out=<dir>                          产物目录(缺省 /tmp/probe-out/perf-<ts>)
 *     --timeout=<ms>                       总看门狗(缺省 1500000=25min)
 *     --keep-vite                          收尾不杀私有 vite(调试)
 *   node tools/probe/perf.mjs help
 *
 * 退出码:0 全绿 / 1 环境 / 2 看门狗强杀或断言失败或(开启时)回归 / 64 用法错误。
 *
 * ★互斥纪律:perf 与确定性 pump(pump/pumpUntil/fixedUpdate 直泵)互斥——本 CLI
 *   全程真实 rAF;数据判读先看 meta.loadavg 与 fps.rafMean(环境失真两哨)。
 * ★只读纪律:biome-tour 对世界数据只读(tile/liquid/entities 零写);stress 的
 *   合成注入(液体台/弹幕/尘)是场景语义且用后即拆,勿与金标世界混用。
 */
import process from 'node:process';
import os from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, resolveSeed, sizeDims, outDirDefault, httpUp } from './lib/env.mjs';
import { startPrivateVite, killTree, lsofListeners } from './lib/vite.mjs';
import { launchBrowser, openPage, closeAllBrowsers } from './lib/browser.mjs';
import { bootstrap } from './lib/boot.mjs';
import { createGame, godMode } from './lib/game.mjs';
import {
  armPerfInstrumentation, installFrameProbe, perfProbeReady, createPerfRecorder, sleep,
  probeGpuEnablement,
} from './lib/perf.mjs';
import { runBiomeTour, runStress, STRESS_FACTORS } from './lib/perf-scenarios.mjs';
import {
  aggregateSegments, buildSelfCheck, compareWithBaseline, renderReportMd,
} from './lib/perf-analyze.mjs';

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const USAGE = '见文件头注释;node tools/probe/perf.mjs help';

const args = process.argv.slice(2);
if (!args.length || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  console.log(`IIIII239 perf CLI\n${USAGE}`);
  process.exit(0);
}
const { opts } = parseArgs(args);

const log = (...a) => console.log('[perf]', ...a);
let exitCode = 0;
let vite = null;
let browser = null;
let watchdog = null;

function fail(msg, code = 1) {
  console.error('[perf] FAIL:', msg);
  process.exitCode = code;
}

// ---------- 看门狗(SIGKILL 兜底;先收 browser 再退) ----------
const timeoutMs = Number(opts.timeout ?? 1_500_000);
watchdog = setTimeout(() => {
  console.error(`[perf] 总看门狗 ${timeoutMs}ms 超时,强杀(exit 2)`);
  closeAllBrowsers().finally(() => process.exit(2));
}, timeoutMs);
watchdog.unref?.();
process.on('SIGTERM', () => { closeAllBrowsers().finally(() => process.exit(130)); });
process.on('SIGINT', () => { closeAllBrowsers().finally(() => process.exit(130)); });

try {
  // ---------- vite ----------
  let origin = process.env.SW_ORIGIN ?? '';
  const viteMode = opts.vite ?? (origin ? 'off' : 'auto');
  if (viteMode !== 'off') {
    if (viteMode === 'auto') {
      vite = await startPrivateVite({});
      origin = vite.origin;
      log(`私有 vite @ ${origin}(log ${vite.logPath})`);
    } else {
      const port = Number(viteMode);
      origin = `http://localhost:${port}`;
      if (!(await httpUp(origin))) { fail(`--vite=${port} 不可达(先起:SW_PORT=${port} SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-${port} npx vite)`, 1); process.exit(1); }
      log(`复用私有 vite @ ${origin}`);
    }
  }
  if (!origin) { fail('缺 origin(--vite=off 时需 SW_ORIGIN)', 64); process.exit(64); }

  // ---------- 参数 ----------
  const scenario = String(opts.scenario ?? 'biome-tour');
  if (!['biome-tour', 'stress', 'all'].includes(scenario)) { fail(`未知场景 ${scenario}`, 64); process.exit(64); }
  const seed = resolveSeed(opts.seed ?? 'drunk');
  const size = String(opts.size ?? 'small');
  const dwellTour = Number(opts.dwell ?? 6000);
  const dwellStress = Number(opts['stress-dwell'] ?? opts.dwell ?? 8000);
  const speedTps = Number(opts.speed ?? 40);
  const channelsList = String(opts.channels ?? 'profile,trace,metrics').split(',').map((s) => s.trim()).filter(Boolean);
  const channels = { profile: channelsList.includes('profile'), trace: channelsList.includes('trace'), metrics: channelsList.includes('metrics') };
  const stressFactors = String(opts.stress ?? Object.keys(STRESS_FACTORS).join(','))
    .split(',').map((s) => s.trim()).filter((s) => s && s in STRESS_FACTORS);
  const outDir = opts.out ?? outDirDefault(`perf-${Date.now()}`);
  const measureTransit = opts['measure-transit'] !== '0';
  const projTarget = Number(opts['proj-target'] ?? 260);
  const dustRate = Number(opts['dust-rate'] ?? 140);
  const warmupMs = Number(opts.warmup ?? 3000);
  const baselinePath = opts.baseline ? String(opts.baseline) : null;

  // ---------- browser(GPU args:macOS ANGLE/Metal,_perf-lib.mjs 先例) ----------
  const extraArgs = [];
  if (!opts['no-gpu-args'] && process.platform === 'darwin') {
    // 后端选择(IIIII246 定谳面):缺省 metal=硬件路径;--use-angle=swiftshader 显式
    // 钉软渲染(两象限对拍);--no-gpu-args 全裸(回 Chrome 缺省,用于对照实验)。
    const angle = String(opts['use-angle'] ?? 'metal');
    extraArgs.push('--use-gl=angle', `--use-angle=${angle}`);
  }
  browser = await launchBrowser({ headed: !!opts.headed, extraArgs });
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = origin;

  // ---------- GPU 启用定谳(①:SystemInfo + renderer 串 + fill 基准;--gpu-probe=0 跳) ----------
  let gpuCheck = null;
  if (opts['gpu-probe'] !== '0') {
    gpuCheck = await probeGpuEnablement(page, { browser });
    log(`GPU 定谳: ${gpuCheck.verdict} renderer=${gpuCheck.renderer ?? 'n/a'} model=${gpuCheck.gpuModel ?? 'n/a'}` +
      ` fill=${gpuCheck.fillMsPerFrame ?? 'n/a'}ms/帧(gl=${gpuCheck.glImplementation ?? 'n/a'})`);
    const askedSoftware = String(opts['use-angle'] ?? '') === 'swiftshader' || !!opts['no-gpu-args'];
    if (gpuCheck.verdict === 'software' && !askedSoftware) {
      log('警告:未主动要软渲染却判 software——GPU 参数未生效/驱动回落(坑表 K14),GPU 面数据按软渲染象限判读');
    }
  }

  // ---------- perf 探针(必须导航前) ----------
  await armPerfInstrumentation(page, {});
  const boot = await bootstrap(page, origin);
  if (!boot.ok) { fail(`bootstrap: ${boot.why}`); process.exit(1); }
  const gen = await createGame(page, { mode: 'direct', seed, size });
  if (!gen.ok) { fail(`createGame: ${gen.why}`); process.exit(1); }
  log(`世界就绪 ${gen.w}x${gen.h} seed=${seed || '(random)'}`);
  await godMode(page, true);
  const probe = await perfProbeReady(page);
  if (!probe.ok) { fail('页内 perf 探针未就绪(armPerfInstrumentation 装载序?)'); process.exit(1); }
  if (probe.longtaskUnsupported) log('警告:longtask observer 不可用(旧内核);长任务只看 trace 通道');
  const fp = await installFrameProbe(page);
  if (!fp.ok) { fail(`帧探针: ${fp.why}`); process.exit(1); }
  // 失焦自动暂停哨(visibilitychange 语义):跑分前强制 resume
  await page.evaluate(() => { const g = window.__swGame; if (g) { g.paused = false; } });
  // warmup(真实 rAF,不进计量段):首站区块烘焙/GL 编译/minimap 首扫 = 一次性成本
  await sleep(warmupMs);
  log(`warmup ${warmupMs}ms 完成(实时渲染)`);

  // 环境指纹(GPU/renderer/版本——判读域失真两哨之一)
  const env = await page.evaluate(async () => {
    let gpu = null;
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2') ?? cv.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? `${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)} / ${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}` : (gl ? 'masked' : 'none');
    } catch { gpu = 'err'; }
    // options 单例:裸 import(无 ?t= 击穿——单例禁 bust,坑表 A4)=游戏正消费的那份
    let frameCap = null;
    try { frameCap = (await import('/src/core/Options.ts')).options.data.frameCap ?? null; } catch { /* 读不到即 null */ }
    return { gpu, dpr: window.devicePixelRatio, ua: navigator.userAgent, frameCap };
  });
  const chromeVer = browser.version ? await browser.version() : '';
  const frameCap = env.frameCap;
  const meta = {
    ts: new Date().toISOString(),
    title: `IIIII239/246 perf(${scenario})`,
    seed, size, dims: sizeDims(size).join('x'),
    dwellMs: { tour: dwellTour, stress: dwellStress },
    speedTps, channels: channelsList.join(','), projTarget, dustRate,
    origin, chrome: chromeVer, gpu: env.gpu, viewport: '1280x800',
    dpr: env.dpr, frameCap, warmupMs, ua: env.ua,
    loadavg: os.loadavg().map((x) => +x.toFixed(2)).join(' '),
    headless: !opts.headed, gpuArgs: extraArgs.join(' ') || 'none',
    useAngle: opts['no-gpu-args'] ? 'none' : String(opts['use-angle'] ?? 'metal'),
    gpuCheck,
    traceGpu: !!opts['trace-gpu'],
    notes: [
      '实时模式:全程真实 rAF,未用确定性 pump(与 perf 互斥)。',
      'biome-tour 对世界数据只读;stress 为合成注入(液体台/弹幕/尘)且用后即拆。',
      'CPU profiler 不含 GPU 面(「GPU 页绝不挂」)——GPU 段看 .trace 的 GPUTask/Commit('
        + 'parseTrace.gpu 已解析;基础类目即含 GPU 进程事件,gpu 类目=证据加厚)。',
      `场景前 warmup ${warmupMs}ms(不进计量段):首站区块烘焙/GL 编译/mimap 首扫属一次性成本,看各段 fps.max 仍可见。`,
      ...(gpuCheck ? [`GPU 定谳=${gpuCheck.verdict}(renderer=${gpuCheck.renderer};fill=${gpuCheck.fillMsPerFrame ?? 'n/a'}ms/帧;SystemInfo=${gpuCheck.systemInfoOk ? gpuCheck.gpuModel : 'err'})`] : []),
    ],
  };

  const rec = createPerfRecorder(page, { outDir, scenario: 'run', channels, traceStacks: !opts['no-trace-stacks'], traceGpu: !!opts['trace-gpu'] });
  const scenarios = {};
  const skipStops = [];
  let tourRes = null;
  let stressRes = null;

  if (scenario === 'biome-tour' || scenario === 'all') {
    log('== biome-tour ==');
    tourRes = await runBiomeTour(page, rec, {
      dwellMs: dwellTour, speedTps, measureTransit, log,
    });
    skipStops.push(...(tourRes.skipped ?? []));
    await rec.settled();   // ★IIIII248:异步段收汇合(trace 排空/解析/落盘)后再聚合
    scenarios['biome-tour'] = {
      stops: tourRes.stops ?? [], missing: tourRes.missing ?? [], route: tourRes.route ?? [],
      segments: rec.segments.filter((s) => s.name.startsWith('dwell:') || s.name.startsWith('transit:')),
    };
    scenarios['biome-tour'].aggregate = aggregateSegments(scenarios['biome-tour'].segments);
  }
  if (scenario === 'stress' || scenario === 'all') {
    log('== stress ==');
    // 沙暴段锚到沙漠站(原版沙暴视觉域);巡游扫描结果可复用,stress-only 现扫
    let desertStop = null;
    if (tourRes?.stops?.length) desertStop = tourRes.stops.find((s) => s.key === 'desert' && s.found) ?? null;
    if (!desertStop && stressFactors.includes('sand')) {
      const { discoverBiomeStops } = await import('./lib/perf-scenarios.mjs');
      const scan = await discoverBiomeStops(page, {});
      desertStop = scan.stops?.find((s) => s.key === 'desert' && s.found) ?? null;
      if (desertStop) log(`沙漠站 @ (${desertStop.tx},${desertStop.ty}) count=${desertStop.count}`);
    }
    stressRes = await runStress(page, rec, {
      factors: stressFactors, dwellMs: dwellStress, projTarget, dustPerSec: dustRate, desertStop, log,
    });
    await rec.settled();   // ★IIIII248:异步段收汇合后再聚合
    scenarios['stress'] = {
      factors: stressFactors, anchor: stressRes?.anchor ?? null, stats: stressRes?.stats ?? null,
      segments: rec.segments.filter((s) => s.name.startsWith('stress:')),
    };
    scenarios['stress'].aggregate = aggregateSegments(scenarios['stress'].segments);
  }

  // ---------- 报告+自检+基线 ----------
  const run = { meta, scenarios, artifacts: rec.artifacts, channelErrors: rec.channelErrors };
  const selfCheck = buildSelfCheck(run);
  run.selfCheck = selfCheck;
  let baselineCompare = null;
  if (baselinePath) {
    if (!existsSync(baselinePath)) { fail(`基线文件不存在: ${baselinePath}`); process.exit(1); }
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    baselineCompare = compareWithBaseline(run, baseline, {});
    run.baseline = { path: baselinePath, ok: baselineCompare.ok };
  }
  const jsonPath = join(outDir, 'report.json');
  const mdPath = join(outDir, 'report.md');
  writeFileSync(jsonPath, JSON.stringify({ report: run, baselineCompare, selfCheck }, null, 2));
  writeFileSync(mdPath, renderReportMd(run, { baselineCompare, selfCheck }));
  log(`报告:${mdPath}`);
  log(`      ${jsonPath}`);
  log(`产物:cpuprofile/trace ×${rec.artifacts.length} @ ${rec.dir}`);

  // ---------- 摘要 ----------
  for (const [sname, sc] of Object.entries(scenarios)) {
    const a = sc.aggregate;
    log(`[${sname}] fps=${a.fps.mean} frames=${a.fps.frames} maxFrame=${a.fps.maxFrameMs}ms lt=${a.longtasks.count} gc=${a.gc.count} fw=${a.framework.pct}%`);
    log(`[${sname}] top: ${(a.hotspots.slice(0, 5).map((f) => `${f.fn}(${f.selfPct}%)`)).join(' · ')}`);
  }
  for (const c of selfCheck.checks) log(`自检 ${c.ok ? 'PASS' : 'FAIL'}: ${c.name}(${c.detail})`);
  if (!selfCheck.ok) exitCode = exitCode || 2;
  if (baselineCompare && !baselineCompare.ok) {
    log('基线对比:存在回归' + (opts['fail-on-regression'] ? '(--fail-on-regression → exit 2)' : '(仅报告)'));
    if (opts['fail-on-regression']) exitCode = 2;
  }
  for (const k of skipStops) log(`未锚定群落: ${k}(small 世界可能无该群;加大 --size 或换种子)`);
} catch (e) {
  fail(String(e?.stack ?? e));
  exitCode = 1;
} finally {
  try { await closeAllBrowsers(); } catch { /* 幂等 */ }
  if (vite && !opts['keep-vite']) {
    const r = await killTree(vite.port, vite.child);
    if (r.listenersLeft > 0) console.error(`[perf] 警告:vite ${vite.port} 残留监听者 ${r.listenersLeft}`);
    else log(`vite ${vite.port} 已收口`);
  } else if (vite) {
    log(`keep-vite:私有 vite ${vite.port} 保留`);
  }
  clearTimeout(watchdog);
  process.exit(exitCode);
}
