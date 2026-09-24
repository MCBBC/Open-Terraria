// BJ319 探针 v6（headed,真实合成器）：P0 新页 → P2 重进×1 → P2b 重进×2 → P3 刷新。
// 每相位：CDP Tracing 3s → 主线程 Commit ms/帧 + BMF fps（Commit 事件只在真实合成器
// 管线出现,headless 测不到=v3 commit=-1 的原因）。焦点仿真防失焦暂停,每相位重发。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  defaultViewport: { width: 1280, height: 800 },
  args: ['--hide-scrollbars'],
});
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });

const cdp0 = await page.createCDPSession();
async function refocus() {
  await cdp0.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.bringToFront().catch(() => {});
}

async function enterWorld() {
  await refocus();
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await refocus();
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForFunction(() => window.__swGame && window.__swGame.paused === false, { timeout: 30000 }).catch(() => {});
}

async function reenter() {
  await refocus();
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await page.waitForFunction(() => !window.__swGame, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.waitForSelector('select', { timeout: 60000 });
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await refocus();
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForFunction(() => window.__swGame && window.__swGame.paused === false, { timeout: 30000 }).catch(() => {});
}

async function traceCommit(secs = 3) {
  const cdp = await page.createCDPSession();
  const evs = [];
  cdp.on('Tracing.dataCollected', (e) => { if (Array.isArray(e.value)) evs.push(...e.value); else if (e.value) evs.push(e.value); });
  const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,benchmark' });
  await new Promise((r) => setTimeout(r, secs * 1000));
  await cdp.send('Tracing.end');
  await done;
  try { await cdp.detach(); } catch { /* ignore */ }
  const bmf = new Map(); const commit = new Map(); const raf = new Map();
  for (const ev of evs) {
    const tid = ev.tid;
    if (ev.name === 'BeginMainThreadFrame') bmf.set(tid, (bmf.get(tid) ?? 0) + 1);
    else if (ev.name === 'Commit' && typeof ev.dur === 'number') {
      const a = commit.get(tid) ?? [0, 0]; a[0] += ev.dur / 1000; a[1]++; commit.set(tid, a);
    } else if (ev.name === 'FireAnimationFrame') raf.set(tid, (raf.get(tid) ?? 0) + 1);
  }
  let mt = -1, best = 0;
  for (const [tid, n] of bmf) if (n > best) { best = n; mt = tid; }
  const [cSum, cN] = commit.get(mt) ?? [0, 0];
  return { fps: +(best / secs).toFixed(1), commitMsPerF: cN ? +(cSum / cN).toFixed(2) : -1, commits: cN };
}

async function phase(label) {
  await refocus();
  const paused = await page.evaluate(() => window.__swGame ? window.__swGame.paused : 'nogame');
  const tr = await traceCommit(3);
  const m = await page.evaluate(() => ({
    inst: window.__swInstanceCount ?? -1,
    canvases: document.querySelectorAll('canvas').length,
    domNodes: document.getElementsByTagName('*').length,
  }));
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  try { await cdp.send('Performance.disable'); } catch { /* ignore */ }
  try { await cdp.detach(); } catch { /* ignore */ }
  const g = (n) => metrics.find((x) => x.name === n)?.value ?? -1;
  const targets = await (async () => {
    const c = await page.createCDPSession();
    const { targetInfos } = await c.send('Target.getTargets');
    try { await c.detach(); } catch { /* ignore */ }
    const byType = {};
    for (const t of targetInfos) byType[t.type] = (byType[t.type] ?? 0) + 1;
    return byType;
  })();
  console.log(`${label.padEnd(22)} paused=${paused} fps=${String(tr.fps).padStart(5)} Commit=${String(tr.commitMsPerF).padStart(5)}ms/f(${tr.commits}) inst=${m.inst} cv=${m.canvases} nodes=${m.domNodes} lis=${Math.round(g('JSEventListeners'))} heap=${(g('JSHeapUsedSize') / 1e6).toFixed(0)}MB targets=${JSON.stringify(targets)}`);
}

await enterWorld();
await phase('P0 fresh page');
await reenter();
await phase('P2 after reenter x1');
await reenter();
await phase('P2b after reenter x2');
await enterWorld();
await phase('P3 after reload');
await browser.close();
