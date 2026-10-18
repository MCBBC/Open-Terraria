// wld 导入白屏崩溃回归探针：导入 Starter_World Master.wld → 开全屏地图 10s，
// 统计 longtask 与 rAF 帧间隔（修复前：每 15 tick 全量重建 288 万像素雾画布）
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const WLD = needInput(join(DOWNLOADS, 'Starter_World Master.wld'));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

// wld 二进制 → 页面（base64 中转）
const b64 = readFileSync(WLD).toString('base64');
const out = await page.evaluate(async (b64: string) => {
  const res: Record<string, unknown> = {};
  const flow = (window as any).__swFlow;
  if (!flow?.importWld) { res.err = 'no __swFlow'; return res; }
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const t0 = Date.now();
  await flow.importWld(buf);
  const game = (window as any).__swGame;
  while (!(game?.world) && Date.now() - t0 < 240000) await new Promise((r) => setTimeout(r, 1000));
  res.importMs = Date.now() - t0;
  if (!game?.world) { res.err = 'world not ready'; return res; }
  res.worldSize = `${game.world.w}x${game.world.h}`;

  // longtask 观察器 + rAF 帧间隔
  const longTasks: number[] = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks.push(e.duration);
  }).observe({ entryTypes: ['longtask'] });
  const frames: number[] = [];
  let last = performance.now();
  const sample = (n: number) => new Promise<void>((done) => {
    const tick = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (frames.length >= n) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // ---- 阶段1：正常游戏画面 6s（小地图迷雾路径）----
  await sample(360);
  res.gameplay = {
    longTasks: longTasks.length,
    worstLongMs: Math.round(Math.max(0, ...longTasks)),
    p99FrameMs: Math.round([...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.99)]),
    worstFrameMs: Math.round(Math.max(...frames)),
  };
  longTasks.length = 0;

  // ---- 阶段2：全屏地图 8s（drawFog 全图路径）----
  game.renderer.fullMap.open = true;
  frames.length = 0;
  await sample(480);
  res.fullMap = {
    longTasks: longTasks.length,
    worstLongMs: Math.round(Math.max(0, ...longTasks)),
    p99FrameMs: Math.round([...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.99)]),
    worstFrameMs: Math.round(Math.max(...frames)),
  };
  return res;
}, b64);
console.log(JSON.stringify(out, null, 1));
await browser.close();
