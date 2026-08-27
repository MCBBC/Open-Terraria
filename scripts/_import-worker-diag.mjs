// 一次性:导入 worker 路径直证(2026-08-27 用户报导入卡 UI → 搬 save.worker)——
//  页内手动 spawn save.worker,postMessage importWld(带 UI 活性计测),断言返回
//  'imported' 且 meta 齐全;同时计测 import 期间主线程最大帧间隔(应 ≪ 同步路径)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('sw-boot-prime') && !document.getElementById('sw-splash'), { timeout: 240000, polling: 500 });
await new Promise((r) => setTimeout(r, 500));

const res = await page.evaluate(async () => {
  const buf = await (await fetch('tests/golden/wld/12345世界.wld')).arrayBuffer();
  // 主线程活性计测:import 期间 rAF 帧间隔采样
  let maxGap = 0, last = performance.now(), running = true;
  const tick = () => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last);
    last = now;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const out = await new Promise((resolve) => {
    const w = new Worker(new URL('/src/workers/save.worker.ts', location.origin), { type: 'module' });
    const timer = setTimeout(() => resolve({ fail: 'timeout 60s' }), 60000);
    w.onmessage = (e) => {
      clearTimeout(timer);
      w.terminate();
      resolve({ type: e.data.type, meta: e.data.meta ?? null, jsonLen: e.data.json?.length ?? 0 });
    };
    w.onerror = (e) => { clearTimeout(timer); resolve({ fail: 'worker error: ' + e.message }); };
    w.postMessage({ type: 'importWld', id: 1, buf }, [buf]);
  });
  running = false;
  return { ...out, maxFrameGapMs: +maxGap.toFixed(1) };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
