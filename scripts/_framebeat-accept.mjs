// ★升拍 p50 制热修刃(2026-09-28):真实流程验收探针——cap120@120Hz 进世界后应回升
//  120(拍=1)。与 _framebeat-digest.mjs 的注入式 A/B 不同,本探针【不注入帧耗】,
//  量测本机真实稳态帧耗分布(p50/p95)与拍轨迹——定谳面:
//   - real 档(现行 p50 制):进世界 resetSampling 后 20s,k 轨迹应回升/驻留 1(拍=1
//     =每 vsync 渲染);real cost p50<8.33 且 p95<8.33 时应稳定驻留(无看门狗拉回);
//     p95>8.33 时按边界②呈有界震荡(准稳态)。
//   - gridfloor 档(修前网格地板 shim 对照):同 real 会话,旧语义 k=2 恒 60(红)。
//  判别指标:beat.snapshot() 轨迹(k/p50/p95/reason)+ 真实渲染帧 stamps 的帧距统计。
//  须 SW_HEADED=1 有头跑(ProMotion 真机 120Hz);vsync 估计≈8.33 时判别面成立。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5241';
const HEADED = process.env.SW_HEADED === '1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RUN_MS = Number(process.env.SW_RUN_MS ?? 20000);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: HEADED ? false : 'new',
  args: HEADED ? ['--no-sandbox', '--window-size=1400,900'] : ['--no-sandbox', '--use-angle=metal'],
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
  await page.keyboard.type('节拍验收');
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

// 观测注入:真实渲染帧 stamps + 拍轨迹(无帧耗注入=本机真实成本面)
await page.evaluate(() => {
  const g = window.__swGame;
  const mod = { stamps: [], trace: [] };
  window.__fb = mod;
  const origRender = g.render.bind(g);
  g.render = function (...a) {
    mod.stamps.push(performance.now());
    return origRender.apply(this, a);
  };
});

const runCondition = async (label, cap, mode) => {
  await page.evaluate(async (cap, mode) => {
    const { options } = await import('/src/core/Options.ts');
    await options.set('frameCap', cap);
    const g = window.__swGame;
    const mod = window.__fb;
    mod.stamps.length = 0;
    g.beat = mod.realBeat ?? g.beat;
    delete g.beat.targetMs;                       // 先摘 shim
    if (mode === 'gridfloor') {
      // 修前语义复刻:targetMs 网格地板 max(1000/60, 1000/cap)——仅此一处语义差
      g.beat.targetMs = (c = g.beat.cap) => Math.max(1000 / 60, c > 0 ? 1000 / c : 0);
    }
    mod.realBeat = g.beat;
    g.beat.resetSampling?.();                     // 与进世界采样面对齐(afterWorldLoad 同源)
    mod.t0 = performance.now();
    mod.traceTimer = setInterval(() => {
      const g = window.__swGame;
      mod.trace.push({ t: Math.round(performance.now() - mod.t0), ...(g.beat?.snapshot?.() ?? {}) });
    }, 500);
  }, cap, mode);
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate((runMs) => { window.__fb.t0 = performance.now(); window.__fb.runMs = runMs; }, RUN_MS);
  await new Promise((r) => setTimeout(r, RUN_MS + 300));
  await page.evaluate(() => clearInterval(window.__fb.traceTimer));
  const trace = await page.evaluate(() => window.__fb.trace ?? []);
  console.log(`  trace[${label}]: ${trace.map((s) => `${s.t}:k${s.k}/p50${s.p50}/p95${s.p95}/vs${s.vsync}/${s.reason}`).join(' ')}`);
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
    // 后半段稳态帧距(去预热)
    const half = stamps.slice(Math.floor(stamps.length / 2));
    const gaps2 = [];
    for (let i = 1; i < half.length; i++) gaps2.push(half[i] - half[i - 1]);
    const s2 = [...gaps2].sort((a, b) => a - b);
    const fps = 1000 / (gaps2.reduce((a, b) => a + b, 0) / (gaps2.length || 1));
    return {
      n: gaps.length, p50: q(0.5), p95: q(0.95), std, jumps, beat: beatSnap,
      halfP50: s2[Math.floor(s2.length / 2)] ?? 0, halfFps: fps, frames: stamps.length,
    };
  });
  console.log(`[${label}] frames=${out.frames} gapP50=${Number(out.p50).toFixed(2)} gapP95=${Number(out.p95).toFixed(2)} 稳态后半:P50=${Number(out.halfP50).toFixed(2)} FPS=${out.halfFps.toFixed(1)} std=${out.std.toFixed(2)} jumps=${out.jumps} beat=${JSON.stringify(out.beat)}`);
  return { label, ...out };
};

const results = [];
results.push(await runCondition('cap120-real(现行 p50 制,真实帧耗)', 120, 'new'));
results.push(await runCondition('cap120-real-gridfloor(修前网格地板 shim 对照=红)', 120, 'gridfloor'));

console.log('=== ACCEPT SUMMARY ===');
for (const r of results) {
  console.log(`${r.label}: 稳态FPS=${r.halfFps.toFixed(1)} gapP50=${Number(r.halfP50).toFixed(2)}ms beatK=${r.beat?.k} reason=${r.beat?.reason}`);
}
await browser.close();
