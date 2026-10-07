// vsync 实况普查探针 v7：页面级独立 rAF 链测纯 vsync 序列 + 实时读 FrameBeat 状态。
// 运行：SW_ORIGIN=https://sandbox.vinlic.com node tools/run-diag.mjs scripts/_fps-vsync-census.mjs
// 操作：窗口弹出后手动进任意世界（读档/新开均可），进入后自动普查 15s。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'https://sandbox.vinlic.com');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, protocolTimeout: 700000, args: ['--window-size=1540,960'] });
const page = (await browser.pages())[0] ?? await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(URL + '/?v7=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(async () => {
  await page.goto('https://sandbox.vinlic.com/?v7=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
});
console.log('请在弹出的浏览器窗口手动进入任意世界；进入后自动普查 15s');
await page.waitForFunction(() => {
  const g = window.__swGame;
  return !!(g && g.player && g.world?.store?.w > 0);
}, { timeout: 600000, polling: 1000 });
console.log('=== 已进入世界 ===');
await sleep(3000);

// 普查：15s 窗——独立 rAF 链 vsync 序列 + beat 状态每秒快照
const report = await page.evaluate(`(async () => {
  const g = window.__swGame;
  const rafTs = [];
  let stop = false;
  const recorder = (t) => { rafTs.push(t); if (!stop) requestAnimationFrame(recorder); };
  requestAnimationFrame(recorder);
  const beatSnaps = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 15000) {
    const b = g.beat ?? {};
    beatSnaps.push({
      t: Math.round(performance.now() - t0),
      vsyncEst: +(b.vsyncPeriod ?? 0).toFixed(3),
      k: b.k, cap: b.cap, ordinal: b.ordinal,
      deltasN: b.vsyncDeltas?.length ?? 0,
      lastDeltas: (b.vsyncDeltas ?? []).slice(-8).map((x) => +x.toFixed(2)),
      costP50: b.costWin?.length ? +(b.costP50?.() ?? 0).toFixed(2) : 0,
    });
    await new Promise((r) => setTimeout(r, 500));
  }
  stop = true;
  // 独立链 vsync 间隔分布（排除首 20 帧预热）
  const gaps = [];
  for (let i = 20; i < rafTs.length; i++) gaps.push(rafTs[i] - rafTs[i - 1]);
  gaps.sort((a, b) => a - b);
  const q = (p) => gaps[Math.floor(p * gaps.length)];
  const hist = new Map();
  for (const x of gaps) { const b = Math.round(x); hist.set(b, (hist.get(b) ?? 0) + 1); }
  const fpsIndicator = g._paintedFrames;
  return { gapsP50: q(0.5), gapsP05: q(0.05), gapsP95: q(0.95), n: gaps.length,
    hist: [...hist.entries()].filter(([k]) => k >= 3 && k <= 25).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ':' + v).join(' '),
    fracBelow708: +(gaps.filter((x) => x < 7.08).length / gaps.length).toFixed(3),
    beatSnaps: beatSnaps.filter((_, i) => i % 4 === 0), fpsIndicator };
})()`);
console.log('=== 独立 rAF 链 vsync 序列 ===');
console.log(`间隔 p05=${report.gapsP05}ms p50=${report.gapsP50}ms p95=${report.gapsP95}ms n=${report.n}`);
console.log(`间隔直方图(ms→次数): ${report.hist}`);
console.log(`** 间隔<7.08ms 占比 = ${(report.fracBelow708 * 100).toFixed(1)}% **（minK=1 的门槛）`);
console.log('\n=== FrameBeat 实况（每 2s 快照） ===');
for (const b of report.beatSnaps) {
  console.log(`t=${b.t}ms vsyncEst=${b.vsyncEst} k=${b.k} cap=${b.cap} deltas尾=${b.lastDeltas.join(',')} costP50=${b.costP50}`);
}
console.log(`\n15s 渲染帧(_paintedFrames)=${report.fpsIndicator} → 平均 ${(report.fpsIndicator / 15).toFixed(1)}fps`);
await browser.close();
