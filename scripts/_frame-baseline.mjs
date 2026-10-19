#!/usr/bin/env node
// 帧基线仪（桌面化方案 G0 对照表产出工具，见 docs/desktop-packaging-research.md §七）。
//
// 在"壳内页面"上直采 rAF 帧间隔分布（不依赖游戏内部 frameDts，菜单页即可跑，
// 三种形态完全同构可比）：
//   Electron 桌面壳 | 本机 Chrome/Edge --app 独立 profile + 性能旗集 | 裸浏览器
//
// 用法（game/ 目录下，经 run-diag 执行；私有预览实例自备，如 vite preview :5207 dist-release）：
//   node tools/run-diag.mjs --timeout=180000 scripts/_frame-baseline.mjs \
//     --mode=electron --url=http://localhost:5207/ --dur=60 [--label=Electron37]
//   node tools/run-diag.mjs --timeout=180000 scripts/_frame-baseline.mjs \
//     --mode=browser --browser=chrome|edge --url=https://sandboxworld.online/ --dur=60
//
// 输出：一行 markdown 结果追加到 docs/frame-baseline.md（不存在则建表头）。
// 正式 G0 建议：三方言 × 各 10 分钟 × 固定剧本；本仪器只负责"同一把尺子"。

import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..', '..', 'docs', 'frame-baseline.md');
const DESKTOP_DIR = join(HERE, '..', 'desktop');

function argVal(name, dflt = null) {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const j = process.argv.findIndex((a) => a.startsWith(name + '='));
  return j !== -1 ? process.argv[j].slice(name.length + 1) : dflt;
}

const MODE = argVal('--mode', 'electron'); // electron | browser
// URL 空 = 内嵌自包含形态(壳自己起环回服务);browser 形态必须给 --url
const EXPLICIT_URL = argVal('--url', '');
let URL_ = EXPLICIT_URL;
if (URL_ && !/[?&]sw\b/.test(URL_)) URL_ += (URL_.includes('?') ? '&' : '?') + 'sw';
const DUR_MS = Number(argVal('--dur', '60')) * 1000;
const LABEL = argVal('--label') || (MODE === 'electron' ? 'Electron壳' : argVal('--browser', 'chrome'));
const BROWSER = (argVal('--browser', 'chrome') || 'chrome').toLowerCase();

const PERF_FLAGS = [
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion,MemorySaver',
];

const jobTmp = process.env.CLAUDE_JOB_DIR ? join(process.env.CLAUDE_JOB_DIR, 'tmp') : tmpdir();
let child = null;

process.on('exit', () => {
  try {
    if (child?.pid && !child.killed) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  } catch {}
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { process.exit(130); } catch {} });

async function freePort(prefer) {
  for (const p of [prefer, ...Array.from({ length: 20 }, (_, k) => prefer + 1 + k)]) {
    const ok = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  return 0;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitWs(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl || null;
    } catch {}
    await sleep(300);
  }
  return null;
}

function findBrowserExe() {
  const candidates =
    BROWSER === 'edge'
      ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
         '/usr/bin/microsoft-edge-stable']
      : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
         '/usr/bin/google-chrome-stable'];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`未找到 ${BROWSER} 可执行文件`);
}

async function getPage() {
  if (MODE === 'electron') {
    const port = await freePort(9455);
    console.log(`[baseline] cdpPort=${port}`);
    let wsReady = false;
    const userData = mkdtempSync(join(jobTmp, 'frame-base-'));
    child = spawn(join(DESKTOP_DIR, 'node_modules', '.bin', 'electron'), ['.'], {
      cwd: DESKTOP_DIR,
      detached: true,
      env: {
        ...process.env,
        ...(URL_ ? { SANDBOX_DESKTOP_URL: URL_ } : {}),
        SANDBOX_DESKTOP_CDP_PORT: String(port),
        SANDBOX_DESKTOP_USERDATA: userData,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.unref();
    child.on('exit', (code, sig) => {
      if (!wsReady) console.error(`[baseline] electron 提前退出 code=${code} sig=${sig}`);
    });
    const ws = await waitWs(port, 30_000);
    if (!ws) throw new Error('CDP 未就绪');
    wsReady = true;
    const browser = await puppeteer.connect({ browserWSEndpoint: ws });
    const page = await attachPage(browser);
    return { browser, page, cleanup: async () => { /* exit 钩子统一杀 */ } };
  }
  // browser 形态：独立 profile + 全套旗集（与启动器 .cmd 同参）——必须显式给 --url
  if (!URL_) throw new Error('browser 形态必须传 --url（零壳模式没有内嵌资源）');
  const exe = findBrowserExe();
  const profile = mkdtempSync(join(jobTmp, 'frame-base-br-'));
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: false,
    defaultViewport: null,
    args: [`--app=${URL_}`, `--user-data-dir=${profile}`, '--window-size=1280,800', ...PERF_FLAGS],
  });
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  if (!pages[0]) await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  return { browser, page, cleanup: async () => { try { await browser.close(); } catch {} rmSync(profile, { recursive: true, force: true }); } };
}

async function attachPage(browser) {
  const wantOrigin = URL_ ? new URL(URL_).origin : '';
  for (let t = 0; t < 60; t++) {
    await sleep(500);
    for (const tgt of browser.targets()) {
      const u = tgt.url?.() || '';
      if (tgt.type() === 'page' && /^https?:/i.test(u) &&
          (!wantOrigin || u.startsWith(wantOrigin))) return tgt.page();
    }
  }
  throw new Error('页面 target 未就绪');
}

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

try {
  const { browser, page, cleanup } = await getPage();
  console.log(`[baseline] mode=${MODE} label=${LABEL} url=${URL_} dur=${DUR_MS / 1000}s`);

  // 等首屏稳定（splash/字体加载期不入样）
  await sleep(6000);

  const res = await page.evaluate(async (ms) => {
    const dts = [];
    let last = performance.now();
    const start = last;
    while (performance.now() - start < ms) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      dts.push(now - last);
      last = now;
    }
    dts.sort((a, b) => a - b);
    const q = (p) => dts[Math.min(dts.length - 1, Math.floor((p / 100) * dts.length))];
    return { n: dts.length, p50: q(50), p95: q(95), p99: q(99), max: dts[dts.length - 1], jank: dts.filter((d) => d > 50).length };
  }, DUR_MS);

  await browser.disconnect().catch(() => {});
  await cleanup();

  const row = `| ${new Date().toISOString().slice(0, 16)} | ${LABEL} | ${MODE} | ${res.n} | ${res.p50.toFixed(1)} | ${res.p95.toFixed(1)} | ${res.p99.toFixed(1)} | ${res.max.toFixed(1)} | ${res.jank} |`;
  if (!existsSync(DOCS)) {
    writeFileSync(DOCS, '# 帧基线对照表（G0 对锚；同一把尺：CDP 层 rAF 直采，默认菜单页）\n\n' +
      '| 时间 | 方言 | 形态 | 样本n | p50(ms) | p95(ms) | p99(ms) | max(ms) | >50ms抖动数 |\n|---|---|---|---|---|---|---|---|---|\n');
  }
  appendFileSync(DOCS, row + '\n');
  console.log('[baseline]', row);
  console.log('[baseline] 已归档 docs/frame-baseline.md');
} catch (e) {
  console.error('[baseline] 异常:', e);
  process.exitCode = 1;
}
