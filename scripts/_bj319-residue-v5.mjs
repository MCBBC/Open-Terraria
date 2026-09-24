// BJ319 探针 v5：残留面精查。P0(新页) → P2(同页重进×1) → P2b(再重进×1) → P3(刷新)。
// 修 v3 jsTotal 跨相位污染 bug（mark 时重置）。新增：
//  · Target.getTargets → worker/类 worker 目标数（泄漏 worker 计数）
//  · LayerTree.layerTreeDidChange → 合成器图层数（Commit 膨胀机制候选）
//  · Profiler top10（确保局内 2.5s 后再采）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp0 = await page.createCDPSession();
await cdp0.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.bringToFront().catch(() => {});

await page.evaluateOnNewDocument(() => {
  const orig = window.requestAnimationFrame.bind(window);
  const stats = { mark: 0, real: 0, jsTotal: 0, intervals: [], lastRealTs: 0 };
  window.__frameStats = stats;
  window.__frameMark = () => { stats.mark = stats.real; stats.jsTotal = 0; stats.intervals.length = 0; stats.lastRealTs = 0; };
  window.requestAnimationFrame = (cb) => orig((ts) => {
    const t0 = performance.now();
    try { cb(ts); } finally {
      const dt = performance.now() - t0;
      const s = window.__frameStats;
      if (dt >= 1 && s.real >= s.mark) {
        s.real++; s.jsTotal += dt;
        if (s.lastRealTs) s.intervals.push(ts - s.lastRealTs);
        s.lastRealTs = ts;
      }
    }
  });
});

function median(a) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

async function enterWorld() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
}

async function reenter() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await page.waitForFunction(() => !window.__swGame, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.waitForSelector('select', { timeout: 60000 });
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
}

async function targetCensus() {
  const cdp = await page.createCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  try { await cdp.detach(); } catch { /* ignore */ }
  const byType = {};
  for (const t of targetInfos) byType[t.type] = (byType[t.type] ?? 0) + 1;
  return byType;
}

async function layerCount() {
  const cdp = await page.createCDPSession();
  let n = -1;
  await cdp.send('LayerTree.enable');
  await new Promise((r) => setTimeout(r, 700));
  n = await new Promise((res) => {
    const iv = setInterval(() => { /* wait first event */ }, 100);
    cdp.once('LayerTree.layerTreeDidChange', (e) => {
      clearInterval(iv);
      res((e.layers ?? []).length);
    });
    setTimeout(() => { clearInterval(iv); res(-1); }, 3000);
  });
  try { await cdp.send('LayerTree.disable'); } catch { /* ignore */ }
  try { await cdp.detach(); } catch { /* ignore */ }
  return n;
}

async function profileTop(label) {
  const cdp = await page.createCDPSession();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await new Promise((r) => setTimeout(r, 3000));
  const { profile } = await cdp.send('Profiler.stop');
  try { await cdp.send('Profiler.disable'); } catch { /* ignore */ }
  try { await cdp.detach(); } catch { /* ignore */ }
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let busy = 0, idle = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = Math.max(0, profile.timeDeltas[i] ?? 0);
    const n = nodes.get(profile.samples[i]);
    const fn = n ? n.callFrame.functionName : '?';
    if (fn === '(idle)') { idle += dt; continue; }
    busy += dt;
    const key = n ? `${fn}@${(n.callFrame.url || '').split('/').pop().replace(/-[A-Za-z0-9_]+\.js/, '')}:${n.callFrame.lineNumber}` : '?';
    self.set(key, (self.get(key) ?? 0) + dt);
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, us]) => `${(us / 1000).toFixed(0).padStart(5)}ms ${k}`);
  console.log(`\n===== ${label} ===== busy=${(busy / 1000).toFixed(0)}ms idle=${(idle / 1000).toFixed(0)}ms / 3s`);
  for (const l of top) console.log('  ' + l);
}

async function phase(label) {
  await page.evaluate(() => {
    window.__frameMark();
    if (window.__swGame?.player) { window.__swGame.player.maxHp = 1e6; window.__swGame.player.hp = 1e6; }
  });
  await new Promise((r) => setTimeout(r, 3500));
  const fs = await page.evaluate(() => {
    const s = window.__frameStats;
    return { real: s.real - s.mark, jsAvg: s.jsTotal / Math.max(1, s.real - s.mark), intervals: s.intervals.slice() };
  });
  const realFps = fs.intervals.length ? +(1000 / median(fs.intervals.filter((v) => v > 0 && v < 400))).toFixed(1) : -1;
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
  const targets = await targetCensus();
  const layers = await layerCount();
  console.log(`${label.padEnd(22)} js=${(fs.jsAvg).toFixed(2)}ms/真帧 real=${fs.real} realFps=${realFps} inst=${m.inst} cv=${m.canvases} layers=${layers} nodes=${m.domNodes} listeners=${Math.round(g('JSEventListeners'))} heap=${(g('JSHeapUsedSize') / 1e6).toFixed(0)}MB targets=${JSON.stringify(targets)}`);
  await profileTop(label);
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
