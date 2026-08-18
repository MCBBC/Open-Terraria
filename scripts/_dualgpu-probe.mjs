// 双开窗口 GPU 预算风暴复现台(2026-08-18)。
// 背景:用户实报冷启 Chrome + --force-gpu-mem-available-mb=16384 依然 contextlost
// 风暴——"预算不够"模型存疑,本探针在【同一 Chrome 实例 / 两个 tab / 共享一个
// GPU 进程】下复现用户双开联机形态,对照不同旗标,找出真正控制画布后备淘汰的开关。
// 方法:renderMode 钉死 gpu(默认 auto 会自动降级掩盖风暴),window capture 级
// contextlost/contextrestored 计数(同 installGpuPressureGuard 口径),GPU 进程
// RSS/pid 变化采样,Chrome stderr 抓 GPU 服务错误行。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=600000 scripts/_dualgpu-probe.mjs
//   DGP_FLAGS="--a --b"     Chrome 旗标(默认=用户 play 同款三旗标)
//   DGP_WORLD="8400x2400"   世界尺寸(默认大世界)
//   DGP_SECS=100            双窗同跑观察时长
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const UDD = `${TMP}/dgp-profile`;
const SECS = +(process.env.DGP_SECS || 100);
const [WW, WH] = (process.env.DGP_WORLD || '8400x2400').split('x').map(Number);
const flags = (process.env.DGP_FLAGS ?? '--force-gpu-mem-available-mb=16384 --js-flags=--max-old-space-size=8192 --ignore-gpu-blocklist')
  .split(/\s+/).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(UDD, { recursive: true, force: true }); // 全新 profile = 真冷启,旗标必然生效

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: UDD,
  args: ['--no-first-run', ...flags],
  defaultViewport: { width: 1280, height: 800 },
});
console.log(`[probe] Chrome: ${flags.join(' ')}`);

const errLines = [];
browser.process()?.stderr?.on('data', (d) => {
  for (const l of String(d).split('\n')) {
    if (/lost|Lost|SharedImage|IOSurface|budget|memory|Memory|ERROR|gpu/i.test(l)) {
      errLines.push(l.trim());
      if (errLines.length > 500) errLines.shift();
    }
  }
});

// window capture 哨兵(document-start 注入,先于游戏脚本)
const SENTINEL = () => {
  window.__lost = 0; window.__restored = 0; window.__kinds = {};
  const kind = (e) => e.target?.constructor?.name || 'window';
  window.addEventListener('contextlost', (e) => { window.__lost++; const k = kind(e); window.__kinds[k] = (window.__kinds[k] || 0) + 1; }, true);
  window.addEventListener('contextrestored', () => { window.__restored++; }, true);
  window.addEventListener('webglcontextlost', () => { window.__lost++; window.__kinds.webgl = (window.__kinds.webgl || 0) + 1; }, true);
  window.addEventListener('webglcontextrestored', () => { window.__restored++; }, true);
  // renderMode 钉死 gpu(默认 auto 会在第 2 次熔断后切 CPU 软渲染掩盖风暴)
  try { localStorage.setItem('sandboxworld.options', JSON.stringify({ renderMode: 'gpu' })); } catch {}
};

const mkPage = async (tag) => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`[${tag} pageerror]`, String(e.message).slice(0, 200)));
  page.on('console', (m) => { const t = m.text(); if (/contextlost|GPU|熔断|降级/i.test(t)) console.log(`[${tag} console]`, t.slice(0, 160)); });
  await page.evaluateOnNewDocument(SENTINEL);
  page.setDefaultTimeout(300000);
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  // 预热动态导入(roomprobe 教训:vite 依赖再优化可能触发全页 reload,须在状态建立前)
  await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
  await sleep(1500);
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  // 大世界 worldgen 有 worker 栈溢出史(21%):失败重载整页,最多 3 次
  for (let i = 1; i <= 3; i++) {
    try {
      console.log(`[${tag}] 生成世界 ${WW}x${WH}(第 ${i} 次,30-120s)…`);
      await page.evaluate((w, h) => window.__swFlow.newWorld('', w, h), WW, WH);
      await page.waitForFunction(() => !!window.__swGame, { timeout: 180000 });
      console.log(`[${tag}] 世界就绪`);
      return page;
    } catch (e) {
      console.log(`[${tag}] 失败:${String(e).slice(0, 120)} → 重载重试`);
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(2000);
      await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
      await sleep(1500);
      await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 }).catch(() => {});
    }
  }
  throw new Error(`${tag} 世界生成 3 次全失败`);
};

const gpuProcs = () => {
  try {
    const out = execSync(`ps -axo pid,rss,command | grep "Google Chrome Helper" | grep "type=gpu" | grep -v grep`, { encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean).map((l) => {
      const m = l.trim().match(/^(\d+)\s+(\d+)/);
      return m ? { pid: +m[1], rss: Math.round(+m[2] / 1024) } : null;
    }).filter(Boolean);
  } catch { return []; }
};

const pageA = await mkPage('A');
const pageB = await mkPage('B');

console.log(`[probe] 双窗同跑 ${SECS}s(10s 采样 / 5s 轮换前台保两页 rAF)…`);
const t0 = Date.now();
const gpuPids = new Set();
let front = pageA;
const timer = setInterval(() => { front = front === pageA ? pageB : pageA; front.bringToFront().catch(() => {}); }, 5000);
const snap = async (p) => {
  try {
    return await p.evaluate(() => ({
      lost: window.__lost || 0, restored: window.__restored || 0, kinds: window.__kinds || {},
      heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576), alive: !!window.__swGame,
    }));
  } catch (e) { return { lost: -1, err: String(e).slice(0, 60) }; }
};
const samples = [];
while (Date.now() - t0 < SECS * 1000) {
  await sleep(10000);
  const a = await snap(pageA), b = await snap(pageB);
  const g = gpuProcs();
  g.forEach((x) => gpuPids.add(x.pid));
  console.log(`t=${Math.round((Date.now() - t0) / 1000)}s A.lost=${a.lost}/rest=${a.restored}/heap=${a.heapMB} | B.lost=${b.lost}/rest=${b.restored}/heap=${b.heapMB} | gpu=[${g.map((x) => `pid${x.pid}:${x.rss}MB`).join(', ')}] gpuPids总见=${gpuPids.size}`);
  samples.push({ a, b, g });
}
clearInterval(timer);

const last = samples[samples.length - 1];
const storm = ((last?.a?.lost ?? 0) > 200) || ((last?.b?.lost ?? 0) > 200);
console.log(`\n[verdict] ${storm ? '★ 风暴复现' : '未复现(可能 headless 预算与真窗不同)'} A.lost=${last?.a?.lost} B.lost=${last?.b?.lost} GPU进程重启次数=${Math.max(0, gpuPids.size - 1)}`);
console.log(`[kinds] A=${JSON.stringify(last?.a?.kinds)} B=${JSON.stringify(last?.b?.kinds)}`);
console.log('[stderr 末 40 行]');
for (const l of errLines.slice(-40)) console.log('  ', l.slice(0, 240));
await browser.close();
