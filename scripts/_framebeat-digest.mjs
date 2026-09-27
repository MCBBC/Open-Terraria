// ★调度面修复刃(2026-09-28):帧模式 subtle 节拍对齐——实机 digest 前后对照探针。
//  判别指标=「帧距序列的跳变次数」(|相邻渲染帧距差|>4ms;用户实报"高于 60fps 仍
//  卡一下"=节拍摆动)。A/B 口径:
//   - 修后=现行 build 的 beat 门(帧序计数落拍);
//   - 修前=运行时仿真(被动 cap 门 + SuppressDraw:0 步进帧跳渲染——g.beat 换旧门
//     shim + g.render 包装跳过渲染体,计时与渲染节奏均与旧代码等价);
//   - 帧耗抖动注入:g.frame 包装 busy-wait(种子 LCG:基础 4ms,25% 帧 +8ms→12ms),
//     两侧同分布;g.render 包装采集真实渲染帧时点。
//  条件:cap=60(缺省档)与 cap=30(门限骑线场景);headless=60Hz 虚拟 vsync,
//  SW_HEADED=1 时有头跑(ProMotion 真机 120Hz 可复现用户实报场景)。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5239';
const HEADED = process.env.SW_HEADED === '1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RUN_MS = 12000;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: HEADED ? false : 'new',
  args: HEADED ? ['--no-sandbox'] : ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('console', async (m) => {
  const texts = await Promise.all(m.args().map((a) => a.jsonValue().then((v) => String(v)).catch(() => '<unser>')));
  const line = `${m.type()}: ${texts.join(' ')}`;
  if (/error|fail/i.test(line)) console.log('[console]', line.slice(0, 300));
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('节拍探针');
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
  await page.keyboard.type('framebeat');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// 注入观测/抖动/仿真机制
await page.evaluate(() => {
  const g = window.__swGame;
  const mod = { stamps: [], suppress: false, seed: 12345 };
  window.__fb = mod;
  const u = () => (mod.seed = (mod.seed * 48271) % 2147483647) / 2147483647;
  // 帧耗抖动注入(两侧同分布;busy-wait 占主线程=真实帧成本)
  const origFrame = g.frame.bind(g);
  g.frame = (now) => {
    const t0 = performance.now();
    origFrame(now);
    const target = 4 + (u() < 0.25 ? 8 : 0);
    while (performance.now() - t0 < target) { /* busy */ }
  };
  // 真实渲染帧观测(旧仿真:suppress 帧跳渲染体=计时等价)
  const origRender = g.render.bind(g);
  g.render = function (...a) {
    if (mod.suppress) return undefined;
    mod.stamps.push(performance.now());
    return origRender.apply(this, a);
  };
  // 旧门仿真(修前 start()/frame() 调度面复刻)
  mod.installOld = (cap) => {
    const FIXED = 1 / 60;
    let lastCapTs = 0;
    let lastTime = g.lastTime ?? performance.now();
    let acc = 0;
    g.beat = {
      observeVsync() { /* 旧被动门无 vsync 观测 */ },
      shouldRender(now) {
        if (cap > 0 && now - lastCapTs < 1000 / cap - 1) return false;
        lastCapTs = now;
        const dtMs = now - lastTime;
        lastTime = now;
        acc += Math.min(dtMs / 1000, 0.25);
        let steps = 0;
        while (acc >= FIXED && steps < 5) { acc -= FIXED; steps++; }
        mod.suppress = steps === 0 && !g.paused;
        return true;
      },
      beginRender() { mod.suppress = mod.suppress; },
      endRender() { mod.suppress = false; },
    };
  };
  mod.realBeat = g.beat;
});

const runCondition = async (label, cap, useOld) => {
  await page.evaluate(async (cap, useOld) => {
    const { options } = await import('/src/core/Options.ts');
    await options.set('frameCap', cap);
    const g = window.__swGame;
    const mod = window.__fb;
    mod.seed = 12345;                     // 每条件同种子(旧/新同分布)
    mod.stamps.length = 0;
    mod.suppress = false;
    if (useOld) mod.installOld(cap);
    else {
      g.beat = mod.realBeat;
      g.beat.resetSampling?.();          // 与进世界/切档后的干净采样面对齐(afterWorldLoad 同源)
      mod.suppress = false;
    }
  }, cap, useOld);
  await new Promise((r) => setTimeout(r, 600));   // 等 saveTimer/门稳定
  await page.evaluate((runMs) => {
    const mod = window.__fb;
    mod.t0 = performance.now(); mod.runMs = runMs;
    mod.trace = [];
    mod.traceTimer = setInterval(() => {
      const g = window.__swGame;
      mod.trace.push({ t: Math.round(performance.now() - mod.t0), ...(g.beat?.snapshot?.() ?? {}) });
    }, 500);
  }, RUN_MS);
  await new Promise((r) => setTimeout(r, RUN_MS + 300));
  await page.evaluate(() => { clearInterval(window.__fb.traceTimer); });
  const trace = await page.evaluate(() => window.__fb.trace ?? []);
  console.log(`  trace[${label}]: ${trace.map((s) => `${s.t}ms:k${s.k}/vs${s.vsync}/r${s.reason}`).join(' ')}`);
  const out = await page.evaluate(() => {
    const mod = window.__fb;
    const stamps = mod.stamps.slice();
    const gaps = [];
    for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
    const s = [...gaps].sort((a, b) => a - b);
    const q = (p) => s[Math.floor(p * (s.length - 1))] ?? 0;
    const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
    const std = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / (gaps.length || 1));
    let jumps = 0;
    for (let i = 1; i < gaps.length; i++) if (Math.abs(gaps[i] - gaps[i - 1]) > 4) jumps++;
    const g = window.__swGame;
    const beatSnap = (g.beat && g.beat.snapshot) ? g.beat.snapshot() : null;
    return { n: gaps.length, p50: q(0.5), p95: q(0.95), std, jumps, beat: beatSnap, frames: stamps.length };
  });
  console.log(`[${label}] frames=${out.frames} p50=${out.p50?.toFixed?.(2) ?? out.p50} p95=${out.p95 && out.p95.toFixed ? out.p95.toFixed(2) : out.p95} std=${out.std.toFixed(2)} jumps=${out.jumps} beat=${JSON.stringify(out.beat)}`);
  return { label, ...out };
};

const results = [];
results.push(await runCondition('cap60-old(修前被动门+SuppressDraw)', 60, true));
results.push(await runCondition('cap60-new(修后节拍对齐)', 60, false));
results.push(await runCondition('cap30-old', 30, true));
results.push(await runCondition('cap30-new', 30, false));

console.log('=== DIGEST SUMMARY ===');
for (const r of results) {
  console.log(`${r.label}: frames=${r.frames} p50=${Number(r.p50).toFixed(2)}ms std=${r.std.toFixed(2)} jumps=${r.jumps}`);
}
await browser.close();
