// BJ319 探针：掉帧残留四相位对比（用户实报：杀怪多→掉帧；重进不恢复；刷新恢复）。
// 相位：P0 新页进世界(基线) → P1 杀怪堆积(100敌怪杀掉,drops/gore/尘在场) →
//        P2 同页 save&quit+重进 → P3 page.reload 后重进。
// 每相位双测：natural(自然态) + fixed(固定合成负载=60 活敌怪,不杀)——把「残留税」
// 与场景内容解耦。rAF 包装统计 JS/帧+帧距；Performance.getMetrics 拿 nodes/listeners/heap。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const LIVE_N = 60;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
  args: ['--disable-frame-rate-limit', '--disable-gpu-vsync', '--hide-scrollbars'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
// BJ280 UnloadGuard:局内刷新会弹 beforeunload 原生对话框——自动接受
page.on('dialog', (d) => { void d.accept(); });

// rAF 包装:统计游戏主循环回调 JS 耗时与帧距
await page.evaluateOnNewDocument(() => {
  const orig = window.requestAnimationFrame.bind(window);
  const stats = { n: 0, jsTotal: 0, jsMax: 0, intervals: [], lastTs: 0, mark: 0 };
  window.__frameStats = stats;
  window.__frameMark = () => { stats.mark = stats.n; stats.intervals.length = 0; };
  window.requestAnimationFrame = (cb) => orig((ts) => {
    const t0 = performance.now();
    try { cb(ts); } finally {
      const dt = performance.now() - t0;
      if (stats.n >= stats.mark) {
        stats.jsTotal += dt; if (dt > stats.jsMax) stats.jsMax = dt;
        if (stats.lastTs) stats.intervals.push(ts - stats.lastTs);
        stats.lastTs = ts; stats.n++;
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
  // Esc 打开暂停面板（可能先关背包/地图,按最多 4 次）
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 350));
    const has = await page.evaluate(() => !!document.querySelector('.sw-pause-panel'));
    if (has) break;
  }
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')];
    if (!btns.length) return false;
    btns[btns.length - 1].click(); // bQuit 恒最后
    return true;
  });
  if (!clicked) throw new Error('pause quit button not found');
  // 等 quitToMenu 保存完成回标题（__swGame 置 null）
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
      const e = g.spawnNpcByVanilla(id, x, y);
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

async function measure(label, secs = 3.5) {
  await page.evaluate(() => { window.__frameMark(); if (window.__swGame?.player) { window.__swGame.player.maxHp = 1000000; window.__swGame.player.hp = 1000000; } });
  await new Promise((r) => setTimeout(r, secs * 1000));
  const fs = await page.evaluate(() => {
    const s = window.__frameStats;
    return { n: s.n - s.mark, jsAvg: s.jsTotal / Math.max(1, s.n - s.mark), intervals: s.intervals.slice() };
  });
  const iv = fs.intervals.filter((v) => v > 0 && v < 1000);
  const fps = 1000 / median(iv);
  const natural = await bucketCounts();
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
    label, fps: +fps.toFixed(1), jsMs: +fs.jsAvg.toFixed(2),
    frameMs: +median(iv).toFixed(2), nativeMs: +(median(iv) - fs.jsAvg).toFixed(2),
    canvases: m.canvases, canvasMPx: +(m.canvasPx / 1e6).toFixed(1), domNodes: m.domNodes,
    listeners: Math.round(g('JSEventListeners')), heapMB: +(g('JSHeapUsedSize') / 1e6).toFixed(0),
    buckets: natural,
  };
}

// ---------- 运行 ----------
const rows = [];
const show = (r) => {
  rows.push(r);
  console.log(`${r.label.padEnd(26)} fps=${String(r.fps).padStart(6)} js=${String(r.jsMs).padStart(6)}ms native=${String(r.nativeMs).padStart(6)}ms frame=${String(r.frameMs).padStart(7)}ms cv=${String(r.canvases).padStart(3)}(${r.canvasMPx}MPx) nodes=${String(r.domNodes).padStart(5)} lis=${String(r.listeners).padStart(5)} heap=${String(r.heapMB).padStart(5)}MB buckets=${JSON.stringify(r.buckets)}`);
};

await enterWorld();
await makeImmovablePlayer();
show(await measure('P0 fresh:natural'));
// 固定负载 60 活敌
const added0 = await spawnLive(LIVE_N);
await new Promise((r) => setTimeout(r, 1200));
show(await measure(`P0 fresh:fixed${added0}`));

// P1 杀怪堆积: 杀掉全部（含固定负载 60）+ 再杀 100 新刷的
const killed1 = await killAllEnemies();
const added1 = await spawnLive(100);
await new Promise((r) => setTimeout(r, 1200));
const killed2 = await killAllEnemies();
await new Promise((r) => setTimeout(r, 2500)); // drops/gore/尘沉降
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

console.log('\n===== BJ319 四相位帧成本对比 =====');
for (const r of rows) {
  console.log(`${r.label.padEnd(26)} fps=${String(r.fps).padStart(6)} js=${String(r.jsMs).padStart(6)}ms native=${String(r.nativeMs).padStart(6)}ms frame=${String(r.frameMs).padStart(7)}ms cv=${String(r.canvases).padStart(3)}(${r.canvasMPx}MPx) nodes=${String(r.domNodes).padStart(5)} lis=${String(r.listeners).padStart(5)} heap=${String(r.heapMB).padStart(5)}MB buckets=${JSON.stringify(r.buckets)}`);
}
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
