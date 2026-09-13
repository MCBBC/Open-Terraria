#!/usr/bin/env node
/**
 * IIII246 ① GPU 启用定谳(一次性诊断;经 tools/run-diag.mjs 运行)。
 *
 * 五模式矩阵 × 三证据面(CDP SystemInfo.getInfo / 页内 WEBGL_debug_renderer_info /
 * 片元 fill 基准——见 perf.probeGpuEnablement),回答:
 *   - 有头 Chrome(macOS)GPU(Metal)是否真启用?
 *   - headless 'new' 是否也真 GPU(perf 能否双模式)?
 *   - --use-angle=swiftshader 是否可靠钉软渲染(两象限对拍面)?
 * SW_ORIGIN 有值时追加「真实游戏页」复probe(游戏主画布的 GL 后端)。
 *
 * 用法:
 *   node tools/run-diag.mjs --timeout=420000 scripts/_iii246-gpu-verdict.mjs
 *   SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=420000 scripts/_iii246-gpu-verdict.mjs
 * 产物:/tmp/iii246-out/gpu-verdict.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { probeGpuEnablement } from '../tools/probe/lib/perf.mjs';

const OUT = '/tmp/iii246-out';
mkdirSync(OUT, { recursive: true });
const origin = process.env.SW_ORIGIN ?? '';
const throttleTrio = [
  '--no-sandbox',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-dev-shm-usage',
];

const MODES = [
  { key: 'headless-default', headless: true, args: [] },
  { key: 'headless-metal', headless: true, args: ['--use-gl=angle', '--use-angle=metal'] },
  { key: 'headless-swiftshader', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] },
  { key: 'headed-default', headless: false, args: [] },
  { key: 'headed-metal', headless: false, args: ['--use-gl=angle', '--use-angle=metal'] },
];

const results = [];
for (const m of MODES) {
  const row = { mode: m.key, headed: !m.headless, args: m.args.join(' ') || 'none' };
  let browser = null;
  try {
    browser = await launchBrowser({ headed: !m.headless, extraArgs: m.args });
    const page = await openPage(browser, { errors: [] });
    row.blank = await probeGpuEnablement(page, { browser });
    if (origin) {
      try {
        await page.goto(origin + '/?gpuverdict=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction('!!window.__swFlow?.newWorld', { timeout: 90000 });
        row.game = await probeGpuEnablement(page, { browser });
      } catch (e) {
        row.gameErr = String(e?.message ?? e).slice(0, 200);
      }
    }
  } catch (e) {
    row.err = String(e?.stack ?? e).slice(0, 400);
  } finally {
    try { await browser?.close(); } catch { /* 幂等 */ }
  }
  const pick = (p) => p && {
    verdict: p.verdict, renderer: p.renderer, gpuModel: p.gpuModel, glImplementation: p.glImplementation,
    fillMsPerFrame: p.fillMsPerFrame, webgl2: p.webgl2, systemInfoOk: p.systemInfoOk,
  };
  row.summary = { blank: pick(row.blank), game: pick(row.game) };
  results.push(row);
  console.log(`[${m.key}] blank=${row.summary.blank?.verdict ?? 'ERR'}` +
    ` game=${row.summary.game?.verdict ?? (row.gameErr ? 'ERR:' + row.gameErr.slice(0, 60) : 'skipped')}` +
    ` renderer=${row.summary.blank?.renderer ?? 'n/a'} fill=${row.summary.blank?.fillMsPerFrame ?? 'n/a'}ms/帧`);
}

writeFileSync(`${OUT}/gpu-verdict.json`, JSON.stringify({
  ts: new Date().toISOString(),
  origin: origin || null,
  results,
}, null, 2));
console.log(`定谳落盘 ${OUT}/gpu-verdict.json`);
process.exit(0);
