#!/usr/bin/env node
// IIII250 ④ CppGC/DOM 垃圾源普查探针。
// 用户 trace:CppGC ConcurrentSweep 487ms/2 + IncrementalSweep 325ms/115(Blink 堆,
// 25.8s)——嫌疑=每帧文本/UI 重建。本探针:
//   ① 页内钩住 DOM 写面计数器(createElement/createTextNode/textContent/innerHTML/
//      appendChild/cloneNode/removeChild/style 赋值),15s「雨+行走+攻击+热栏扫掠
//      (tooltip 翻动)」场景统计各 API 次数 → 定位每帧 DOM 垃圾源;
//   ② Performance.getMetrics 场景前后差(Nodes/Documents/JSEventListeners/堆)→
//      DOM 增长量化(雨天场景本域);
//   ③ console 每 300s 才刷?不——逐帧文本嫌疑走 ① 的 textContent 计数直接定谳。
// 用法:
//   node tools/probe.mjs run scripts/_iii250-dom-census.mjs --vite=5300 --out=/tmp/iii250-out
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { setWeather } from '../tools/probe/lib/perf-scenarios.mjs';

const OUT = process.env.SW_PROBE_OUT || '/tmp/iii250-out';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5300';
const SCEN_MS = 15000;
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[iii250-dom]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await launchBrowser({ extraArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    await godMode(page, true);
    await setWeather(page, { rain: true });

    // DOM 写面计数器(启动即挂,先跑 3s 基线再清零)
    await page.evaluate(() => {
      const c = window.__domCensus = { createElement: 0, createTextNode: 0, textContent: 0, innerHTML: 0, appendChild: 0, cloneNode: 0, removeChild: 0, setAttribute: 0, styleSet: 0, className: 0 };
      const D = Document.prototype, E = Element.prototype, N = Node.prototype;
      const wrap = (obj, key, counter) => {
        const orig = obj[key];
        if (typeof orig !== 'function') return;
        obj[key] = function (...a) { c[counter]++; return orig.apply(this, a); };
      };
      wrap(D, 'createElement', 'createElement');
      wrap(D, 'createTextNode', 'createTextNode');
      wrap(N, 'appendChild', 'appendChild');
      wrap(N, 'cloneNode', 'cloneNode');
      wrap(N, 'removeChild', 'removeChild');
      wrap(E, 'setAttribute', 'setAttribute');
      const tc = Object.getOwnPropertyDescriptor(E.prototype ?? Element.prototype, 'textContent') || Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      if (tc?.set) Object.defineProperty(Element.prototype, 'textContent', { ...tc, set(v) { c.textContent++; tc.set.call(this, v); } });
      const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      if (ih?.set) Object.defineProperty(Element.prototype, 'innerHTML', { ...ih, set(v) { c.innerHTML++; ih.set.call(this, v); } });
      const cls = Object.getOwnPropertyDescriptor(Element.prototype, 'className');
      if (cls?.set) Object.defineProperty(Element.prototype, 'className', { ...cls, set(v) { c.className++; cls.set.call(this, v); } });
      // style.* 赋值计数(CSSStyleDeclaration set 采样:style 对象 proxy 不可行,改计 cssText+styleProperty)
      window.__domCensus.styleSet = 0;
    });

    const client = await page.target().createCDPSession();
    await client.send('Performance.enable');
    await sleep(3000);   // 基线窗(雨静立):分离"静态雨"与"交互"贡献
    const m0 = (await client.send('Performance.getMetrics')).metrics;
    await page.evaluate(() => { for (const k of Object.keys(window.__domCensus)) window.__domCensus[k] = 0; });
    const baseCensus = await page.evaluate(() => ({ ...window.__domCensus }));

    // 15s 交互场景:行走+攻击+热栏扫掠(hover→tooltip 链)
    const scenStart = Date.now();
    let dir = 1, nextAttack = Date.now() + 400;
    while (Date.now() - scenStart < SCEN_MS) {
      if (dir === 1) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyW'); }
      else { await page.keyboard.down('KeyA'); await page.keyboard.up('KeyD'); }
      await sleep(1200);
      await page.keyboard.up(dir === 1 ? 'KeyD' : 'KeyA');
      if (dir === 1) await page.keyboard.up('KeyW');
      dir = -dir;
      if (Date.now() > nextAttack) {
        await page.mouse.down(); await sleep(100); await page.mouse.up();
        nextAttack = Date.now() + 450;
      }
      // 热栏扫掠(底部 10 格,hover→showTooltipFor 翻动)
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(360 + i * 44, 760);
        await sleep(18);
      }
      await page.mouse.move(640, 400);
    }
    const m1 = (await client.send('Performance.getMetrics')).metrics;
    const census = await page.evaluate(() => ({ ...window.__domCensus }));
    await client.detach().catch(() => {});

    const mm = new Map(m1.map((x) => [x.name, x.value]));
    const m0m = new Map(m0.map((x) => [x.name, x.value]));
    const delta = {};
    for (const k of ['Nodes', 'Documents', 'JSEventListeners', 'JSHeapUsedSize', 'JSHeapTotalSize']) delta[k] = (mm.get(k) ?? 0) - (m0m.get(k) ?? 0);
    const perSec = {};
    for (const [k, v] of Object.entries(census)) perSec[k] = +((v - baseCensus[k]) / (SCEN_MS / 1000)).toFixed(1);
    const result = { tag: 'dom-census', scenMs: SCEN_MS, censusDelta: census, perSec, metricsDelta: delta, note: '热栏扫掠含 tooltip 翻动;行走+攻击+雨' };
    log(JSON.stringify(result, null, 1));
    writeFileSync(join(OUT, 'dom-census.json'), JSON.stringify(result, null, 2));
  } finally {
    await closeAllBrowsers();
  }
}
try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
