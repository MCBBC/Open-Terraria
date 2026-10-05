// ★v9.4 cap 硬顶门活机验证探针(2026-10-05 反馈环断点刀;机制/容差定谳见 FrameBeat.ts 头注 v9.4)。
//  四段长跑(cap120 菜单稳态 10s → cap120 世界内稳态 25s → cap60 12s → cap30 12s):
//  ①门健康静默:capSkips 稳态零增量(健康 cadence 帧距 ≥p01 6.60 恒在阈 6.33 外);
//  ②cap120 稳态:gameFps ≤121、est ≥8.2 带、帧距零抖动簇(gap p95 ≤10.5 带内);
//  ③k>1 回归:cap60/cap30 段门零咬合=行为零变化。
//  ★边界:本探针机(Dev Mac)rAF ticker 恒 8.30(反馈环不复现,b2-regress 实测 neo=legacy
//  ≈120.0)——门在超速环境的断环验证须用户机(其 trace:BeginFrame 125.18/s=7.988ms)
//  用本探针 + capSkips 遥测对照;本机四段=非回归面。
//  运行:SW_HEADED=1 SW_ORIGIN=http://localhost:5218 node tools/run-diag.mjs --timeout=280000 scripts/_framebeat-captop.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5218';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T0 = Date.now();
const log = (m) => console.log(`[t+${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false,
  // 插桩中立性:禁后台化(遮挡 headed 窗会触发 rAF 节流脉冲=伪族源,v9.1 有案)
  args: ['--no-sandbox', '--window-size=1400,900', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const beats = [];
const allConsole = [];
page.on('console', (m) => { const t = m.text(); if (t.includes('[beat]')) beats.push({ t: performance.now(), text: t }); if (allConsole.length < 400) allConsole.push({ t: Math.round(performance.now()), type: m.type(), text: t.slice(0, 300) }); });
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

async function install() {
  await page.evaluate(async () => {
    const mod = window.__fbcap && window.__fbcap.__ctx === performance.timeOrigin
      ? window.__fbcap
      : { __ctx: performance.timeOrigin, events: [], states: [], deltas: [], renderT: [], gameFps: [], lastVsyncTs: undefined, obsN: 0 };
    window.__fbcap = mod;
    const beatProto = (await import('/src/core/FrameBeat.ts')).FrameBeat.prototype;
    if (!mod.__wired) {
      mod.__wired = true;
      const origObs = beatProto.observeVsync;
      beatProto.observeVsync = function (now, cap) {
        if (!mod.inst) mod.inst = this;
        const d = mod.lastVsyncTs !== undefined && mod.lastVsyncTs >= 0 ? now - mod.lastVsyncTs : null;
        mod.lastVsyncTs = now;
        mod.obsN++;
        if (d !== null && d <= 250) mod.deltas.push({ t: now, d, cap });
        if (mod.renderT.length < 90000 && mod.obsN % 1 === 0) { /* renderT 由 beginRender 记 */ }
        return origObs.call(this, now, cap);
      };
      const origBegin = beatProto.beginRender;
      beatProto.beginRender = function (now) { mod.renders = (mod.renders ?? 0) + 1; if (mod.renderT.length < 90000) mod.renderT.push(now); return origBegin.call(this, now); };
      const poll = () => {
        if (mod.inst) mod.states.push({ t: performance.now(), ...mod.inst.snapshot(), renders: mod.renders ?? 0, obsN: mod.obsN });
        try { if (window.__swGame) mod.gameFps.push({ t: performance.now(), fps: window.__swGame.fps }); } catch { /* */ }
        if (!window.__fbcapStop) setTimeout(poll, 200);
      };
      poll();
    }
    const { options } = await import('/src/core/Options.ts');
    window.__fbMark = (n) => mod.events.push({ ev: 'mark', t: performance.now(), n, fsm: options.data.frameSkipMode, cap: options.data.frameCap });
  });
}
async function ensureInstalled() {
  if (!(await page.evaluate(() => typeof window.__fbMark === 'function' && !!window.__fbcap))) {
    console.log('[install] 上下文丢失,重装 instrumentation');
    await install();
  }
}
async function setCap(v) {
  await page.evaluate(async (v) => { const { options } = await import('/src/core/Options.ts'); await options.set('frameCap', v); }, v);
}

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.bringToFront();
await page.evaluate(() => { try { window.focus(); window.dispatchEvent(new FocusEvent('focus')); document.dispatchEvent(new Event('visibilitychange')); } catch { /* */ } });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
await install();
await ensureInstalled();
await setCap(120);
await page.evaluate(async () => { const { options } = await import('/src/core/Options.ts'); await options.set('frameSkipMode', 'subtle'); });
await ensureInstalled();
await page.evaluate((n) => window.__fbMark(n), 'cap120-subtle-menu'); log('cap120-subtle-menu');
// 场景A:菜单稳态 10s
await new Promise((r) => setTimeout(r, 10000));
await page.evaluate((n) => window.__fbMark(n), 'menu-steady-done'); log('menu-steady-done');
// 入世界(复用 b2-regress 世界:seed=b2-regress)
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('B2回归');
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
  await page.keyboard.type('b2-regress');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.evaluate((n) => window.__fbMark(n), 'worldgen-begin'); log('worldgen-begin');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 240000, polling: 1000 });
await page.evaluate((n) => window.__fbMark(n), 'inworld'); log('inworld');
// 场景B:世界内稳态 25s(cap120 subtle,用户实报场景)
await new Promise((r) => setTimeout(r, 25000));
await page.evaluate((n) => window.__fbMark(n), 'steady-done'); log('steady-done');
// 场景C:k>1 回归(cap60 12s → cap30 12s;门应零咬合)
await setCap(60);
await page.evaluate((n) => window.__fbMark(n), 'cap60-begin'); log('cap60-begin');
await new Promise((r) => setTimeout(r, 12000));
await page.evaluate((n) => window.__fbMark(n), 'cap60-done'); log('cap60-done');
await setCap(30);
await page.evaluate((n) => window.__fbMark(n), 'cap30-begin'); log('cap30-begin');
await new Promise((r) => setTimeout(r, 12000));
await page.evaluate((n) => window.__fbMark(n), 'cap30-done'); log('cap30-done');
await page.evaluate(() => { window.__fbcapStop = true; });
const out = await page.evaluate(() => ({ events: window.__fbcap.events, states: window.__fbcap.states, deltas: window.__fbcap.deltas, renderT: window.__fbcap.renderT, gameFps: window.__fbcap.gameFps, renders: window.__fbcap.renders, obsN: window.__fbcap.obsN }));
out.beats = beats; out.console = allConsole;
const { writeFileSync } = await import('node:fs');
writeFileSync('/tmp/captop-live.json', JSON.stringify(out));

// ── 分段摘要 ──
const ev = Object.fromEntries(out.events.map((e) => [e.n, e.t]));
function q(s, p) { return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; }
function summ(name, t0, t1) {
  const rt = out.renderT.filter((t) => t >= t0 && t < t1);
  const st = out.states.filter((s) => s.t >= t0 && s.t < t1);
  const dl = out.deltas.filter((e) => e.t >= t0 && e.t < t1 && e.cap > 0).map((e) => e.d);
  const gf = out.gameFps.filter((e) => e.t >= t0 && e.t < t1).map((e) => e.fps);
  if (rt.length < 20) return console.log(`${name}: (样本不足 renders=${rt.length})`);
  const gaps = [];
  for (let i = 1; i < rt.length; i++) gaps.push(rt[i] - rt[i - 1]);
  const sg = [...gaps].sort((a, b) => a - b);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
  const se = st.map((s) => s.vsync).sort((a, b) => a - b);
  const skips0 = st[0].capSkips, skips1 = st[st.length - 1].capSkips;
  const sdl = [...dl].sort((a, b) => a - b);
  const fpsReal = 1000 * (rt.length - 1) / (rt[rt.length - 1] - rt[0]);
  console.log(`${name}: renders=${rt.length} fps=${fpsReal.toFixed(2)} | gap p01=${q(sg, 0.01).toFixed(2)} p50=${q(sg, 0.5).toFixed(2)} p95=${q(sg, 0.95).toFixed(2)} p99=${q(sg, 0.99).toFixed(2)} sd=${sd.toFixed(2)} min=${sg[0].toFixed(2)} max=${sg[sg.length - 1].toFixed(2)}`
    + ` | est p50=${q(se, 0.5).toFixed(2)} min=${se[0].toFixed(2)} max=${se[se.length - 1].toFixed(2)}`
    + ` | capSkips ${skips0}→${skips1}(Δ${skips1 - skips0}) | tickerΔp50=${dl.length ? q(sdl, 0.5).toFixed(2) : '-'}`
    + ` | gameFps min/mean/max=${gf.length ? Math.min(...gf).toFixed(1) + '/' + (gf.reduce((a, b) => a + b, 0) / gf.length).toFixed(1) + '/' + Math.max(...gf).toFixed(1) : '-'}`
    + ` | k=${st[st.length - 1].k}(${[...new Set(st.map((s) => s.k))].join(',')})`);
}
summ('A 菜单稳态 cap120 ', ev['cap120-subtle-menu'], ev['menu-steady-done']);
summ('B 世界稳态 cap120 ', ev['inworld'], ev['steady-done']);
summ('C1 世界 cap60     ', ev['cap60-begin'], ev['cap60-done']);
summ('C2 世界 cap30     ', ev['cap30-begin'], ev['cap30-done']);
console.log(`=== [beat] 记录仪(${beats.length} 条) ===`);
for (const b of beats) console.log(b.text);
console.log(`console 总数=${allConsole.length}(前 10 条异常筛查)`);
for (const c of allConsole.slice(0, 10)) console.log(`  [${c.type}] ${c.text.slice(0, 160)}`);
await browser.close();
