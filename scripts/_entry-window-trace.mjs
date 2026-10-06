// ★入场窗 Chrome timeline trace 探针（2026-10-06）：cap120 进世界 60s 全程 trace,
//  Node 侧逐秒聚合 devtools.timeline 事件（主线程/worker 线程分账）——给
//  「+9.96s 351ms 孤帧」「+28-44s 拍降级」无归因段找真凶。
//  运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs --timeout=280000 scripts/_entry-window-trace.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5221';
const SEED = process.env.SW_DIAG_SEED ?? 'entrydiag';
const SAMPLE_S = Number(process.env.SW_DIAG_SECONDS ?? '60');
const TRACE_PATH = process.env.SW_TRACE_PATH ?? '/tmp/entry-window-trace.json';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T0 = Date.now();
const log = (m) => console.log(`[t+${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  args: ['--no-sandbox', '--window-size=1400,900', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.bringToFront();
await page.evaluate(() => { try { window.focus(); } catch { /* */ } });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));

// 最小插桩:帧距 + 大帧距明细 + 掀幕时刻
await page.evaluate(() => {
  const W = (window.__swInst = { renderT: [], gaps: [], marks: [], freezeAt: { end: [] }, err: [] });
  (async () => {
    try {
      const { FrameBeat } = await import('/src/core/FrameBeat.ts');
      const bp = FrameBeat.prototype;
      const oBeg = bp.beginRender;
      bp.beginRender = function (now) {
        if (W.renderT.length < 200000) {
          const arr = W.renderT, prev = arr.length ? arr[arr.length - 1] : null;
          if (prev != null) { const g = now - prev; if (g > 25 && W.gaps.length < 3000) W.gaps.push({ t: now, g }); }
          arr.push(now);
        }
        return oBeg.call(this, now);
      };
      const { Game } = await import('/src/core/Game.ts');
      const oEnd = Game.prototype.endEntryFreeze;
      Game.prototype.endEntryFreeze = function (...a) { W.freezeAt.end.push(performance.now()); return oEnd.apply(this, a); };
      W.ok = true;
    } catch (e) { W.err.push(String(e && e.message || e)); }
  })();
});
await page.waitForFunction(() => window.__swInst?.ok === true || window.__swInst?.err?.length, { timeout: 30000 });

await page.evaluate(async (cap) => {
  const { options } = await import('/src/core/Options.ts');
  await options.set('frameCap', cap);
  await options.set('frameSkipMode', 'subtle');
}, 120);
log('cap120 subtle set');

await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('入场窗探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type(SEED);
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
log('worldgen-begin');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 240000, polling: 500 });
const inT0 = await page.evaluate(() => performance.now());
log(`inworld @${inT0.toFixed(0)}ms — trace ${SAMPLE_S}s`);

await page.tracing.start({ path: TRACE_PATH, categories: ['devtools.timeline'], defaultFilter: true });
await new Promise((r) => setTimeout(r, SAMPLE_S * 1000));
await page.tracing.stop();
log('trace stopped');

const inst = await page.evaluate(() => {
  const W = window.__swInst;
  return { renderT: W.renderT, gaps: W.gaps, marks: W.marks, freezeAt: W.freezeAt, err: W.err };
});
const gapsSummary = inst.renderT.filter(t => t >= inT0);
console.log(`页内帧距: n=${gapsSummary.length}`);
if (inst.gaps.length) {
  console.log('>25ms 帧距(inworld 相对秒):');
  for (const g of inst.gaps.slice(0, 40)) console.log(`  +${((g.t - inT0) / 1000).toFixed(2)}s  ${g.g.toFixed(0)}ms`);
}
console.log(`freeze end: ${inst.freezeAt.end.map(t => '+' + (t - inT0).toFixed(0) + 'ms').join(', ')}`);
if (inst.err.length) console.log('inst err:', inst.err);

// ---- trace 解析 ----
log('parsing trace…');
const raw = fs.readFileSync(TRACE_PATH, 'utf8');
log(`trace size ${(raw.length / 1048576).toFixed(1)}MB`);
const trace = JSON.parse(raw);
const evs = trace.traceEvents ?? trace;
console.log(`events: ${evs.length}`);

// 线程名表
const tidName = new Map();
const procMain = new Set();
for (const e of evs) {
  if (e.cat === '__metadata') {
    if (e.name === 'thread_name' && e.args?.name) tidName.set(e.pid + ':' + e.tid, e.args.name);
    if (e.name === 'process_name' && e.args?.name) procMain.add(e.pid + ':' + (e.args.name ?? ''));
  }
}
// 渲染进程主线程 tid:进程名含 'Renderer' 且线程名 'CrRendererMain' / 'Renderer'
const rendererPid = [...tidName.entries()].find(([, n]) => n === 'CrRendererMain')?.[0]?.split(':')[0];
const workerTids = [...tidName.entries()].filter(([k, n]) => k.startsWith(rendererPid + ':') && /Worker|Bake|Light|Wave/.test(n));
console.log('renderer threads:', [...tidName.entries()].filter(([k]) => k.startsWith(rendererPid + ':')).map(([k, n]) => `${k.split(':')[1]}=${n}`).slice(0, 20).join(' '));

const t0us = null;
// 逐秒聚合:主线程 vs worker 线程,按事件名 sum dur
const bucket = new Map(); // sec -> name -> {mainMs, wkMs, n}
const SEC = 1000;
let ev0 = null;
let mainTid = null;
for (const [k, n] of tidName) if (k === rendererPid + ':CrRendererMain') mainTid = Number(k.split(':')[1]);
for (const e of evs) {
  if (e.cat !== 'devtools.timeline' || typeof e.dur !== 'number') continue;
  if (ev0 === null) ev0 = e.ts;
  // 以 inworld 对齐:trace 相对秒 = (ts - ev0)/1000;页内 inT0 ≈ trace 起点(启动于 inworld 后)
  const sec = Math.floor((e.ts - ev0) / 1000 / SEC);
  if (sec < 0 || sec >= SAMPLE_S + 2) continue;
  const isMain = e.pid === Number(rendererPid) && e.tid === mainTid;
  const isWk = workerTids.some(([k]) => Number(k.split(':')[0]) === e.pid && Number(k.split(':')[1]) === e.tid);
  if (!isMain && !isWk) continue;
  let b = bucket.get(sec);
  if (!b) { b = new Map(); bucket.set(sec, b); }
  let r = b.get(e.name);
  if (!r) { r = { mainMs: 0, wkMs: 0, n: 0 }; b.set(e.name, r); }
  if (isMain) r.mainMs += e.dur / 1000; else r.wkMs += e.dur / 1000;
  r.n++;
}
console.log('\nsec | 主线程 top 事件(ms) | worker 线程合计(ms)');
for (let s = 0; s < SAMPLE_S; s++) {
  const b = bucket.get(s);
  if (!b) { console.log(`${String(s).padStart(3)} | (空)`); continue; }
  const mains = [...b.entries()].map(([n, r]) => [n, r.mainMs, r.n]).sort((x, y) => y[1] - x[1]);
  const wk = [...b.entries()].reduce((v, [, r]) => v + r.wkMs, 0);
  const top = mains.filter(([, ms]) => ms >= 5).slice(0, 6)
    .map(([n, ms, n2]) => `${n}:${ms.toFixed(0)}(${n2})`).join(' ');
  const mainTotal = mains.reduce((v, [, ms]) => v + ms, 0);
  console.log(`${String(s).padStart(3)} | main=${mainTotal.toFixed(0)}ms ${top}${wk > 5 ? ` | wk=${wk.toFixed(0)}ms` : ''}`);
}
// 全程 top 事件
const all = new Map();
for (const [, b] of bucket) for (const [n, r] of b) {
  let a = all.get(n); if (!a) { a = { mainMs: 0, wkMs: 0, n: 0 }; all.set(n, a); }
  a.mainMs += r.mainMs; a.wkMs += r.wkMs; a.n += r.n;
}
console.log('\n全程 top(主线程 ms):');
for (const [n, r] of [...all.entries()].sort((x, y) => y[1].mainMs - x[1].mainMs).slice(0, 15)) {
  console.log(`  ${n}: ${r.mainMs.toFixed(0)}ms (${r.n}次)${r.wkMs > 0 ? ` [wk ${r.wkMs.toFixed(0)}ms]` : ''}`);
}
await browser.close();
process.exit(0);
