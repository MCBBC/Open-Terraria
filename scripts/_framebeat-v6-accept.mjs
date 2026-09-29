// ★v6 降档边界=帧率优先(2026-09-29)真实流程验收探针(headed)。
//  用户场景:帧模式 subtle+cap120 下注入帧耗 9-15ms 震荡(用户实报区间)——
//   - v6 现行码(降档线=budget(k+1)×1.1):应留 k=1 跑 ~90-110fps 不齐但高(绿);
//   - v5 旧线 shim(capacityBreach=p50>budget(k)):同负载降 k=2 钉 60 档(红,用户实报);
//   - 重载 ~40ms:正确降档保留(k≥2,对齐档);
//   - 自然负载基线(不注入):k=1 全速对照。
//  判别面:beat.snapshot() 轨迹(k/p50/p95/vsync/reason/miss)+ 真实渲染帧 stamps 帧距
//  统计(稳态后半 FPS=用户所见读数)。帧耗注入=包裹 g.frame(now),自旋至 rAF 时间戳+
//  目标成本(总帧耗精确可控;LCG 确定性,同流喂 v6/v5 shim 公平 A/B)。
//  须 SW_HEADED=1 有头跑(ProMotion 真机);SW_ORIGIN 指向私有 vite 实例。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5266';
const HEADED = process.env.SW_HEADED === '1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RUN_MS = Number(process.env.SW_RUN_MS ?? 15000);
// SW_DISABLE_GPU=1:复现用户实档会话的 SHM 软栅交付态(wild trace:delta≈cost+1.9,
// fire-when-free)——判决 rAF 交付 regime 对"不齐但高帧率"可达性的影响
const EXTRA_ARGS = process.env.SW_DISABLE_GPU === '1' ? ['--disable-gpu'] : [];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: HEADED ? false : 'new',
  args: HEADED ? ['--no-sandbox', '--window-size=1400,900', ...EXTRA_ARGS] : ['--no-sandbox', '--use-angle=metal'],
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
  await page.keyboard.type('节拍验收v6');
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
  await page.keyboard.type('framebeat-v6');
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
console.log('in world; mode=' + await page.evaluate(() => {
  const g = window.__swGame;
  return `${(window.__swOptsMode) ?? ''} subtle=${g.frame ? '?' : '?'}`;
}).catch(() => 'n/a'));

// ── 观测注入:渲染帧 stamps + 拍轨迹 ──
await page.evaluate(() => {
  const g = window.__swGame;
  const mod = { stamps: [], trace: [], lcgSeed: 20260929 };
  window.__fb = mod;
  const origRender = g.render.bind(g);
  g.render = function (...a) {
    mod.stamps.push(performance.now());
    return origRender.apply(this, a);
  };
});

// ── 条件驱动器:cap120 + 帧耗注入(v6 现行 / v5 旧线 shim)+ 拍轨迹采集 ──
const runCondition = async (label, { spinMode, shimOld, modeOff = false }) => {
  await page.evaluate(async ({ spinMode, shimOld, modeOff }) => {
    const { options } = await import('/src/core/Options.ts');
    await options.set('frameCap', 120);
    await options.set('frameSkipMode', modeOff ? 'off' : 'subtle');
    const g = window.__swGame;
    const mod = window.__fb;
    mod.stamps.length = 0;
    // 摘旧 shim/注入
    if (mod.origFrame) { g.frame = mod.origFrame; mod.origFrame = null; }
    delete g.beat.capacityBreachShimmed;
    if (shimOld) {
      // v5 旧线复刻(红侧):中位刚超当前拍预算即降——仅此一处语义差
      g.beat.capacityBreach = function () { return this.costP50() > this.budget(); };
    } else {
      delete g.beat.capacityBreach;   // 回到原型方法(v6 现行)
    }
    // 帧耗注入:包裹 g.frame(now),自旋至 rAF 时间戳+目标成本(总帧耗=目标,LCG 确定性)
    if (spinMode !== 'none') {
      mod.origFrame = g.frame;
      let s = mod.lcgSeed % 2147483647;
      const lcg = () => (s = (s * 48271) % 2147483647) / 2147483647;
      const target = spinMode === 'band' ? () => (lcg() < 0.6 ? 9 : lcg() < 0.5 ? 12 : 15)
        : spinMode === 'heavy' ? () => 40
        : () => 0;
      g.frame = function (now, ...rest) {
        const deadline = now + target();
        const out = mod.origFrame.apply(this, [now, ...rest]);
        while (performance.now() < deadline) { /* 自旋至目标总帧耗 */ }
        return out;
      };
    }
    g.beat.resetSampling?.();
    mod.t0 = performance.now();
    mod.trace = [];
    mod.traceTimer = setInterval(() => {
      const g2 = window.__swGame;
      mod.trace.push({ t: Math.round(performance.now() - mod.t0), minK: g2.beat?.minK?.(), mode: g2.mode ?? '', ...(g2.beat?.snapshot?.() ?? {}) });
    }, 500);
  }, { spinMode, shimOld });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate((runMs) => { window.__fb.t0 = performance.now(); }, RUN_MS);
  await new Promise((r) => setTimeout(r, RUN_MS + 300));
  await page.evaluate(() => clearInterval(window.__fb.traceTimer));
  const trace = await page.evaluate(() => window.__fb.trace ?? []);
  console.log(`  trace[${label}]: ${trace.map((s) => `${s.t}:k${s.k}/minK${s.minK}/p50${s.p50}/p95${s.p95}/vs${s.vsync}/${s.reason}/miss${s.miss}`).join(' ')}`);
  const out = await page.evaluate(() => {
    const mod = window.__fb;
    const stamps = mod.stamps.slice();
    const gaps = [];
    for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
    const s = [...gaps].sort((a, b) => a - b);
    const q = (p) => s[Math.floor(p * (s.length - 1))] ?? 0;
    const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
    let jumps = 0;
    for (let i = 1; i < gaps.length; i++) if (Math.abs(gaps[i] - gaps[i - 1]) > 4) jumps++;
    const g = window.__swGame;
    const beatSnap = (g.beat && g.beat.snapshot) ? g.beat.snapshot() : null;
    const half = stamps.slice(Math.floor(stamps.length / 2));
    const gaps2 = [];
    for (let i = 1; i < half.length; i++) gaps2.push(half[i] - half[i - 1]);
    const s2 = [...gaps2].sort((a, b) => a - b);
    const fps = 1000 / (gaps2.reduce((a, b) => a + b, 0) / (gaps2.length || 1));
    const hist = {};
    for (const g2 of gaps2) { const b = Math.round(g2 * 2) / 2; hist[b] = (hist[b] ?? 0) + 1; }
    const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      n: gaps.length, p50: q(0.5), p95: q(0.95), jumps, beat: beatSnap,
      halfP50: s2[Math.floor(s2.length / 2)] ?? 0, halfFps: fps, frames: stamps.length,
      histTop: top.map(([b, c]) => `${b}ms:${c}`).join(' '),
    };
  });
  console.log(`[${label}] frames=${out.frames} gapP50=${Number(out.p50).toFixed(2)} gapP95=${Number(out.p95).toFixed(2)} 稳态后半:P50=${Number(out.halfP50).toFixed(2)} FPS=${out.halfFps.toFixed(1)} jumps=${out.jumps}`);
  console.log(`[${label}] 帧距直方图: ${out.histTop}`);
  console.log(`[${label}] beat=${JSON.stringify(out.beat)}`);
  return { label, ...out };
};

const results = [];
results.push(await runCondition('1-baseline-natural(自然负载对照)', { spinMode: 'none', shimOld: false }));
results.push(await runCondition('2-v6-band9-15(用户场景,现行 v6 线)', { spinMode: 'band', shimOld: false }));
results.push(await runCondition('3-v5shim-band9-15(同负载 v5 旧线=红)', { spinMode: 'band', shimOld: true }));
results.push(await runCondition('4-v6-heavy40(正确降档保留)', { spinMode: 'heavy', shimOld: false }));
// 判决性对照:off 档(beat 旁路=用户满意的 free-run 体验)在同负载下的真实交付帧率
// ——若 off 也只有 ~60fps,则本机 rAF 交付为 vsync 锁相,"不齐但更高"在该负载下物理
// 不可达,k 档面不是限制器;若 off 达 ~90+,则 fire-when-free 交付存在,v6 留 k=1 可兑现。
results.push(await runCondition('5-offmode-band9-15(free-run 交付物理对照)', { spinMode: 'band', shimOld: false, modeOff: true }));

console.log('=== V6 ACCEPT SUMMARY ===');
for (const r of results) {
  console.log(`${r.label}: 稳态FPS=${r.halfFps.toFixed(1)} gapP50=${Number(r.halfP50).toFixed(2)}ms beatK=${r.beat?.k} reason=${r.beat?.reason} costP50=${r.beat?.p50}`);
}
const green = results[1], red = results[2], heavy = results[3], off = results[4];
console.log(`判据0 off 交付物理: FPS=${off.halfFps.toFixed(1)} gapP50=${Number(off.halfP50).toFixed(2)} → ${off.halfFps > 75 ? 'fire-when-free 存在,k=1 可兑现高帧率' : 'vsync 锁相交付,9-15ms 帧耗物理上限≈60'}`);
console.log(`判据1 用户场景绿: k=${green.beat?.k} fps=${green.halfFps.toFixed(1)} → ${green.beat?.k === 1 && green.halfFps > 80 ? 'PASS(留 k=1 跑高帧率)' : 'FAIL'}`);
console.log(`判据2 红侧对照:   k=${red.beat?.k} fps=${red.halfFps.toFixed(1)} → ${red.beat?.k >= 2 ? 'PASS(v5 线锁 60 档复现)' : 'FAIL'}`);
console.log(`判据3 绿>红:      ${green.halfFps.toFixed(1)} > ${red.halfFps.toFixed(1)} → ${green.halfFps > red.halfFps + 10 ? 'PASS' : 'FAIL'}`);
console.log(`判据4 重载降档:   k=${heavy.beat?.k} → ${heavy.beat?.k >= 2 ? 'PASS(正确降档保留)' : 'FAIL'}`);
await browser.close();
