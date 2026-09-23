// BJ319 探针 v2：掉帧残留四相位对比（用户实报：杀怪多→掉帧；重进不恢复；刷新恢复）。
// 相位：P0 新页进世界(基线) → P1 杀怪堆积(杀 162,drops/gore/尘在场) →
//        P2 同页 save&quit+重进 → P3 page.reload 后重进。
// 每相位双测：natural(自然态) + fixed(固定合成负载=60 活敌怪)——把「残留税」与场景内容解耦。
// 指标：①游戏真帧 JS 耗时（rAF 包装,过滤 <1ms 空拍——游戏 60Hz 固定步进自限速,
//        非真帧早退 0.36ms 会污染均值）②CDP Tracing 3s：Commit 均值/帧 + BMF fps
//       （对齐用户 trace 002132 的病灶指标）③canvases/nodes/listeners/heap/实体桶。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const LIVE_N = 60;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
  args: ['--hide-scrollbars'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
// BJ280 UnloadGuard:局内刷新会弹 beforeunload 原生对话框——自动接受
page.on('dialog', (d) => { void d.accept(); });
// 失焦暂停(playWhenUnfocused 默认关=失焦即暂停):headless 页未聚焦会整局冻结
const cdp0 = await page.createCDPSession();
await cdp0.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.bringToFront().catch(() => {});

// rAF 包装:只统计真帧(回调 ≥1ms)——空拍早退不计
await page.evaluateOnNewDocument(() => {
  const orig = window.requestAnimationFrame.bind(window);
  const stats = { mark: 0, real: 0, jsTotal: 0, intervals: [], lastRealTs: 0 };
  window.__frameStats = stats;
  window.__frameMark = () => { stats.mark = stats.real; stats.intervals.length = 0; stats.lastRealTs = 0; };
  window.requestAnimationFrame = (cb) => orig((ts) => {
    const t0 = performance.now();
    try { cb(ts); } finally {
      const dt = performance.now() - t0;
      const s = window.__frameStats;
      if (dt >= 1 && s.real >= s.mark) {
        s.real++;
        s.jsTotal += dt;
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

async function quitAndReenter() {
  // 直调探针桥（含保存链;比 UI 点击链稳）
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await page.waitForFunction(() => !window.__swGame, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.waitForSelector('select', { timeout: 60000 });
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
}

async function makeImmovablePlayer() {
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.maxHp = 1000000; g.player.hp = 1000000;
  });
}

async function spawnLive(n) {
  return page.evaluate((n) => {
    const g = window.__swGame;
    const p = g.player;
    const ids = [201, 202, 203, 254, 144];
    let added = 0;
    for (let i = 0; i < n; i++) {
      const id = ids[i % ids.length];
      const x = p.x + ((i % 20) - 10) * 48;
      const y = p.y - 96 - Math.floor(i / 20) * 48;
      const e = g.spawnEnemy('v_' + id, x, y);
      if (e) added++;
    }
    return added;
  }, n);
}

async function killAllEnemies() {
  return page.evaluate(() => {
    const g = window.__swGame;
    let killed = 0;
    for (const e of g.entities.enemies ?? []) {
      if (e && e.active !== false && e.hp > 0) { try { e.hurt(1e9, 0, 0, g, 0, false, 1, true); killed++; } catch { /* ignore */ } }
    }
    return killed;
  });
}

async function bucketCounts() {
  return page.evaluate(() => {
    const g = window.__swGame;
    const em = g.entities;
    const out = {};
    for (const k of ['enemies', 'drops', 'npcs', 'critters', 'projectiles']) {
      out[k] = Array.isArray(em?.[k]) ? em[k].length : -1;
    }
    return out;
  });
}

/** CDP Tracing secs 秒,聚合主线程 Commit/BMF */
async function traceCommit(secs = 3) {
  const cdp = await page.createCDPSession();
  const evs = [];
  cdp.on('Tracing.dataCollected', (e) => { if (Array.isArray(e.value)) evs.push(...e.value); else evs.push(e.value); });
  const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.frame' });
  await new Promise((r) => setTimeout(r, secs * 1000));
  await cdp.send('Tracing.end');
  await done;
  try { await cdp.detach(); } catch { /* ignore */ }
  const bmfByTid = new Map();
  const commitByTid = new Map();
  for (const ev of evs) {
    if (ev.name === 'BeginMainThreadFrame') bmfByTid.set(ev.tid, (bmfByTid.get(ev.tid) ?? 0) + 1);
    else if (ev.name === 'Commit' && typeof ev.dur === 'number') {
      const a = commitByTid.get(ev.tid) ?? [0, 0];
      a[0] += ev.dur / 1000; a[1] += 1;
      commitByTid.set(ev.tid, a);
    }
  }
  let mt = -1, best = 0;
  for (const [tid, n] of bmfByTid) if (n > best) { best = n; mt = tid; }
  const [cSum, cN] = commitByTid.get(mt) ?? [0, 0];
  return { fps: best / secs, commitMsPerF: cN ? +(cSum / cN).toFixed(2) : -1, commits: cN };
}

async function measure(label) {
  await page.evaluate(() => { window.__frameMark(); if (window.__swGame?.player) { window.__swGame.player.maxHp = 1000000; window.__swGame.player.hp = 1000000; } });
  const tr = await traceCommit(3);
  const fs = await page.evaluate(() => {
    const s = window.__frameStats;
    return { real: s.real - s.mark, jsAvg: s.jsTotal / Math.max(1, s.real - s.mark), intervals: s.intervals.slice() };
  });
  const realFps = fs.intervals.length ? +(1000 / median(fs.intervals.filter((v) => v > 0 && v < 400))).toFixed(1) : -1;
  const buckets = await bucketCounts();
  const m = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    canvasPx: [...document.querySelectorAll('canvas')].reduce((s, c) => s + c.width * c.height, 0),
    domNodes: document.getElementsByTagName('*').length,
  }));
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.send('Performance.disable');
  await cdp.detach();
  const g = (n) => metrics.find((x) => x.name === n)?.value ?? -1;
  return {
    label, commitFps: tr.fps, commitMsPerF: tr.commitMsPerF,
    realFrames: fs.real, jsMs: +fs.jsAvg.toFixed(2), realFps,
    canvases: m.canvases, canvasMPx: +(m.canvasPx / 1e6).toFixed(1), domNodes: m.domNodes,
    listeners: Math.round(g('JSEventListeners')), heapMB: +(g('JSHeapUsedSize') / 1e6).toFixed(0),
    buckets,
  };
}

// ---------- 运行 ----------
const rows = [];
const show = (r) => {
  rows.push(r);
  console.log(`${r.label.padEnd(24)} traceFps=${String(r.commitFps).padStart(5)} commit=${String(r.commitMsPerF).padStart(5)}ms/f realFrames=${String(r.realFrames).padStart(4)} js=${String(r.jsMs).padStart(6)}ms realFps=${String(r.realFps).padStart(5)} cv=${String(r.canvases).padStart(3)}(${r.canvasMPx}MPx) nodes=${String(r.domNodes).padStart(5)} lis=${String(r.listeners).padStart(5)} heap=${String(r.heapMB).padStart(5)}MB ${JSON.stringify(r.buckets)}`);
};

await enterWorld();
await makeImmovablePlayer();
show(await measure('P0 fresh:natural'));
const added0 = await spawnLive(LIVE_N);
await new Promise((r) => setTimeout(r, 1200));
show(await measure(`P0 fresh:fixed${added0}`));

// P1 杀怪堆积
const killed1 = await killAllEnemies();
const added1 = await spawnLive(100);
await new Promise((r) => setTimeout(r, 1200));
const killed2 = await killAllEnemies();
await new Promise((r) => setTimeout(r, 2500));
show(await measure(`P1 killed${killed1 + killed2}:natural`));
const addedP1 = await spawnLive(LIVE_N);
await new Promise((r) => setTimeout(r, 1200));
show(await measure(`P1 killed:fixed${addedP1}`));

// P2 同页重进
await quitAndReenter();
await makeImmovablePlayer();
show(await measure('P2 reenter:natural'));
const added2 = await spawnLive(LIVE_N);
await new Promise((r) => setTimeout(r, 1200));
show(await measure(`P2 reenter:fixed${added2}`));

// P3 刷新重进
await enterWorld();
await makeImmovablePlayer();
show(await measure('P3 reload:natural'));
const added3 = await spawnLive(LIVE_N);
await new Promise((r) => setTimeout(r, 1200));
show(await measure(`P3 reload:fixed${added3}`));

console.log('\nphase key: traceFps=BeginMainFrame/秒 commit=主线程Commit ms/帧 js=真帧JS均值 realFps=真帧间隔fps');
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
