// ★BJ318 进出世界 N 轮内存爬升探针（用户实报：读档炸 "[worldGen worker] Array buffer
// allocation failed"，tab 内存 1.7GB；怀疑退世界释放不干净）。
// 方法：cycle1 = newWorld(小世界 4200x1200) → quitToMenu（BJ144 全链落定+Game.destroy）；
// cycle2..N = quickLoad（走 worker saveParse 读档链）→ quitToMenu。每轮收场
// 强制 GC（HeapProfiler.collectGarbage，主线程+worker）后采样：
//   ① 主 isolate retained（performance.memory.usedJSHeapSize）
//   ② CDP Performance.getMetrics JSHeapUsedSize/Total
//   ③ 渲染进程 RSS（SystemInfo.getProcessInfo，含 worker isolate+外部 buffer）
// 判据：退出+GC 后水位应回基线（±噪声）。阶梯=每轮净泄漏。
// 产物：/tmp/bj318-cycles.log 逐轮表；--snap 落堆快照 /tmp/bj318-cycleN.heapsnapshot。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const CYCLES = Number(process.env.SW_CYCLES ?? 4);
const W = Number(process.env.SW_W ?? 4200);
const H = Number(process.env.SW_H ?? 1200);
const SNAP = process.env.SW_SNAP === '1';
const LOG = fs.openSync('/tmp/bj318-cycles.log', 'w');
const log = (s) => { fs.writeSync(LOG, s + '\n'); console.log(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 600000,
  userDataDir: '/tmp/bj318-prof-' + (Date.now() % 100000),
  args: ['--no-sandbox', '--no-proxy-server'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGEERR ${String(e.message).slice(0, 200)}`));
page.on('console', (m) => {
  const t = m.text();
  if (/Array buffer allocation|allocation failed|RangeError|FATAL|crash|worker.*error|存档|读档失败/i.test(t)) {
    log(`[c] ${t.slice(0, 300)}`);
  }
});

const bcdp = await browser.target().createCDPSession();
const cdp = await page.createCDPSession();
await cdp.send('Performance.enable').catch(() => {});
await cdp.send('HeapProfiler.enable').catch(() => {});

async function metrics() {
  try {
    const m = await cdp.send('Performance.getMetrics');
    const g = (n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
    return { used: Math.round(g('JSHeapUsedSize') / 1e6), total: Math.round(g('JSHeapTotalSize') / 1e6) };
  } catch { return { used: -1, total: -1 }; }
}
async function rendererRSS() {
  try {
    const { processes } = await bcdp.send('SystemInfo.getProcessInfo');
    const rs = processes.filter((p) => p.type === 'renderer');
    // 本页 renderer：取内存最大的（本探针独占浏览器）
    const top = rs.sort((a, b) => (b.memory ?? 0) - (a.memory ?? 0))[0];
    return { rss: Math.round((top?.memory ?? 0) / 1e6), pid: top?.id ?? -1 };
  } catch { return { rss: -1, pid: -1 }; }
}
async function workerHeaps() {
  const out = [];
  for (const t of browser.targets()) {
    if (t.type() !== 'worker' && t.type() !== 'other') continue;
    try {
      const s = await t.createCDPSession();
      await s.send('HeapProfiler.enable');
      await s.send('HeapProfiler.collectGarbage').catch(() => {});
      const r = await s.send('Runtime.evaluate', { expression: 'performance.memory ? performance.memory.usedJSHeapSize : -1', returnByValue: true }).catch(() => null);
      out.push({ url: (t.url() || '').split('/').pop().slice(0, 40), mb: r ? Math.round((r.result?.value ?? -1) / 1e6) : -1 });
      await s.detach().catch(() => {});
    } catch { /* skip */ }
  }
  return out;
}
async function forceGCAll() {
  // 主线程：expose-gc 若有优先（含年轻代多扫几遍），否则 CDP collectGarbage
  await page.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } }).catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await sleep(300);
  await page.evaluate(() => { if (window.gc) window.gc(); }).catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  // worker 侧只做 CDP GC（无 expose-gc）
  for (const t of browser.targets()) {
    if (t.type() !== 'worker' && t.type() !== 'other') continue;
    try {
      const s = await t.createCDPSession();
      await s.send('HeapProfiler.enable');
      await s.send('HeapProfiler.collectGarbage');
      await s.detach().catch(() => {});
    } catch { /* skip */ }
  }
}
async function sample(tag) {
  await forceGCAll();
  await sleep(200);
  const m = await metrics();
  const rss = await rendererRSS();
  const wh = await workerHeaps();
  const pm = await page.evaluate(() => ({
    used: performance.memory ? performance.memory.usedJSHeapSize : -1,
    limit: performance.memory ? performance.memory.jsHeapSizeLimit : -1,
    game: !!window.__swGame,
    renderLog: typeof window.__swRenderLog,
  })).catch(() => ({ used: -1, limit: -1, game: '?', renderLog: '?' }));
  log(`SAMPLE ${tag} mainIso=${Math.round(pm.used / 1e6)}MB cdpUsed=${m.used}MB cdpTotal=${m.total}MB rendererRSS=${rss.rss}MB (pid=${rss.pid}) workers=${wh.length}(ww=${wh.filter((w) => w.url.includes('WaveWorker')).length},wg=${wh.filter((w) => w.url.includes('worldGen')).length}) __swGame=${pm.game} __swRenderLog=${pm.renderLog}`);
}

async function waitRunning(how) {
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.world && window.__swGame.running === true && window.__swGame.player)).catch(() => false);
    if (ok) return Date.now() - t0;
    if (Date.now() - t0 > 420000) throw new Error(`waitRunning timeout (${how})`);
    await sleep(500);
  }
}

log(`T0 goto ${ORIGIN} cycles=${CYCLES} world=${W}x${H}`);
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => {
  const w = window;
  w.__uhr = [];
  window.addEventListener('unhandledrejection', (e) => w.__uhr.push('UHR: ' + String(e.reason?.stack ?? e.reason).slice(0, 500)));
  window.addEventListener('error', (e) => w.__uhr.push('ERR: ' + (e.error?.stack ?? e.message).slice(0, 500)));
});
// 资产预热完（标题可用）
for (let i = 0; i < 90; i++) {
  const hasTitle = await page.evaluate(() => !!document.querySelector('[data-act=sp]')).catch(() => false);
  if (hasTitle) break;
  await sleep(2000);
}
await sleep(1500);
await sample('baseline-title');

for (let c = 1; c <= CYCLES; c++) {
  log(`---- cycle ${c} ----`);
  const uhrBefore = await page.evaluate(() => window.__uhr.length).catch(() => -1);
  if (c === 1) {
    log(`cycle1 newWorld(${W}x${H})`);
    await page.evaluate((cfg) => window.__swFlow.newWorld('bj318' + (Date.now() % 10000), cfg.w, cfg.h), { w: W, h: H });
  } else {
    log(`cycle${c} quickLoad`);
    await page.evaluate(() => window.__swFlow.quickLoad());
  }
  const ms = await waitRunning(c === 1 ? 'newWorld' : 'quickLoad');
  await sleep(4000);   // 进世界后缓冲（minimap/首帧烘焙等）
  await sample(`in-world-${c}(run ${Math.round(ms / 1000)}s)`);
  // 退出（BJ144 全链落定）
  await page.evaluate(() => window.__swFlow.quitToMenu());
  for (let i = 0; i < 120; i++) {
    const back = await page.evaluate(() => !window.__swGame && !!document.querySelector('[data-act=sp]')).catch(() => false);
    if (back) break;
    await sleep(1000);
  }
  await sleep(1500);
  await sample(`after-quit-${c}`);
  const uhr = await page.evaluate(() => window.__uhr).catch(() => []);
  if (uhr.length > uhrBefore) log(`UHR[${uhr.length}]: ${uhr.slice(uhrBefore).join(' || ').slice(0, 600)}`);
  if (SNAP) {
    const file = `/tmp/bj318-cycle${c}.heapsnapshot`;
    log(`snapshot -> ${file}`);
    let buf = '';
    cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => { buf += e.chunk; });
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    fs.writeFileSync(file, buf);
    buf = '';
    log(`snapshot done ${(fs.statSync(file).size / 1e6).toFixed(0)}MB`);
  }
}
log('DONE');
await browser.close();
fs.closeSync(LOG);
process.exit(0);
