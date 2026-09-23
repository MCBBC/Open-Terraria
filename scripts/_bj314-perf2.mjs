// BJ314 探针#2：用户环境面复现——DPR2（retina）/ renderMode=cpu / 命中负载（编排尘+伤害数字）。
// + 成本分解：drawArcLayers（导出面直调）与 prettyStarSparkle（导出面直调）在真实
//   worldCtx 上的单独耗时（JS 侧 dispatch 时长,占位对照用）。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function boot(dpr) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-angle=metal'],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: dpr }, protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
  await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
  await new Promise((r) => setTimeout(r, 600));
  await page.click('[data-act=sp]');
  await page.waitForSelector('.sw-vsel', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
  if (!(await page.$('.sw-vsel .sw-vitem'))) {
    await page.click('.sw-vsel [data-act=new]');
    await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 400));
    await page.click('.sw-char-row input[type=text]');
    await page.keyboard.type('BJ314探针');
    await new Promise((r) => setTimeout(r, 200));
    await page.click('[data-act=create]');
    await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 500));
  }
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
  if (!(await page.$('.sw-vsel .sw-vitem'))) {
    await page.click('.sw-vsel [data-act=new]');
    await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
    await page.click('[data-f=seed]');
    await page.keyboard.type('bj314probe');
    await new Promise((r) => setTimeout(r, 200));
    await page.evaluate(() => {
      const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
      opts[0]?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('[data-act=create]');
  }
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 1200));
  return { browser, page };
}

async function prepArena(page) {
  return page.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    const px0 = Math.floor(g.player.cx / 16);
    const gy = Math.floor(g.world.groundLevel) + 4;
    for (let dx = -420; dx <= 420; dx++) {
      for (let dy = -36; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
      st.setTile(px0 + dx, gy + 3, 2);
    }
    g.player.x = px0 * 16; g.player.y = (gy - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    const items = await import('/src/data/items.ts');
    let idx273 = -1;
    items.ITEM_DEFS.forEach((d, i) => { if (d && d.vid === 273) idx273 = i; });
    g.player.inv.selected = 0;
    g.player.inv.slots[0] = { id: idx273, stack: 1 };
    const arcMod = await import('/src/entities/SwingArc.ts');
    window.__arcMod = arcMod;
    const counters = { arcDraw: 0, arcDrawMs: 0, flyDraw: 0, flyDrawMs: 0 };
    const oArc = arcMod.SwingArc.prototype.draw;
    arcMod.SwingArc.prototype.draw = function (r) {
      const t0 = performance.now();
      oArc.call(this, r);
      counters.arcDraw++; counters.arcDrawMs += performance.now() - t0;
    };
    const oFly = arcMod.NightsEdgeFly.prototype.draw;
    arcMod.NightsEdgeFly.prototype.draw = function (r) {
      const t0 = performance.now();
      oFly.call(this, r);
      counters.flyDraw++; counters.flyDrawMs += performance.now() - t0;
    };
    window.__bj314c = counters;
    return { idx273 };
  });
}

async function sampleFrames(page, label, frames, hold) {
  await page.evaluate((n, h) => {
    const g = window.__swGame;
    g.input.mouseX = g.renderer.canvas.width / 2 + 200;
    g.input.mouseY = g.renderer.canvas.height / 2;
    g.input.mouseDown = h; g.input.mouseHeld = h;
    const c = window.__bj314c;
    c.arcDraw = 0; c.arcDrawMs = 0; c.flyDraw = 0; c.flyDrawMs = 0;
    window.__bj314s = { times: [], n, last: 0, done: false };
    const loop = () => {
      const now = performance.now();
      const s = window.__bj314s;
      if (s.last) s.times.push(now - s.last);
      s.last = now;
      if (s.times.length >= s.n) { s.done = true; return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, frames, hold);
  await page.waitForFunction(() => window.__bj314s?.done, { timeout: 120000, polling: 200 });
  return page.evaluate((lb) => {
    const g = window.__swGame;
    const ts = window.__bj314s.times.slice(2).sort((a, b) => a - b);
    const q = (p) => ts[Math.min(ts.length - 1, Math.floor(ts.length * p))];
    const c = window.__bj314c;
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return {
      label: lb, n: ts.length, avg: +(ts.reduce((s, v) => s + v, 0) / ts.length).toFixed(2),
      p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +ts[ts.length - 1].toFixed(2),
      arcMsPerCall: c.arcDraw ? +(c.arcDrawMs / c.arcDraw).toFixed(3) : 0,
      flyMsPerCall: c.flyDraw ? +(c.flyDrawMs / c.flyDraw).toFixed(3) : 0,
      arcCalls: c.arcDraw, flyCalls: c.flyDraw,
    };
  }, label);
}

// ---------- Face 1: DPR2 ----------
{
  const { browser, page } = await boot(2);
  await prepArena(page);
  await page.evaluate(() => { window.__swGame.paused = false; });
  console.log('[dpr2-baseline]', JSON.stringify(await sampleFrames(page, 'dpr2-baseline', 240, false)));
  console.log('[dpr2-swing]', JSON.stringify(await sampleFrames(page, 'dpr2-swing', 480, true)));
  // 成本分解（暂停态,真实 worldCtx 上直调导出面）
  const decomp = await page.evaluate(async () => {
    const g = window.__swGame;
    g.paused = true;
    const arcMod = window.__arcMod;
    const { projSprite } = await import('/src/entities/Arrow.ts');
    const img = projSprite(972);
    const wctx = g.renderer.worldCtxLayer ?? g.renderer.ctx;
    const layers = arcMod.arcLayerList(972, 0.4, 1, 0.8);
    const bench = (fn, iters) => {
      fn();
      const t0 = performance.now();
      for (let i = 0; i < iters; i++) fn();
      return +((performance.now() - t0) / iters).toFixed(3);
    };
    const arcMs = bench(() => arcMod.drawArcLayers(wctx, img, 400, 300, 0.7, 1, 1.1, layers), 60);
    const rr = await import('/src/render/Renderer.ts');
    const sparkMs = bench(() => rr.prettyStarSparkle(wctx, 1, 400, 300, [255, 255, 255], [80, 40, 180], 0.5, 0, 0.5, 0.5, 1, 0.78, [2, 2], [1, 1], 0.5), 60);
    const dpr = window.devicePixelRatio;
    return { arcLayersMs_perCall: arcMs, sparkleMs_perCall: sparkMs, dpr, worldLayerSize: [g.renderer.worldCanvas?.width, g.renderer.worldCanvas?.height] };
  });
  console.log('[decomp-dpr2]', JSON.stringify(decomp));
  await browser.close();
}

// ---------- Face 2: renderMode=cpu ----------
{
  const { browser, page } = await boot(1);
  await prepArena(page);
  await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    options.set('renderMode', 'cpu');
  });
  await new Promise((r) => setTimeout(r, 1500));
  const mode = await page.evaluate(() => ({ cpuRender: window.__swGame.renderer.cpuRender }));
  console.log('[cpu-mode]', JSON.stringify(mode));
  await page.evaluate(() => { window.__swGame.paused = false; });
  console.log('[cpu-baseline]', JSON.stringify(await sampleFrames(page, 'cpu-baseline', 240, false)));
  console.log('[cpu-swing]', JSON.stringify(await sampleFrames(page, 'cpu-swing', 480, true)));
  await page.screenshot({ path: '/tmp/bj314-cpu-swing.png' });
  await browser.close();
}

// ---------- Face 3: 命中负载（6 靶怪在锥内,连挥连击：编排尘+伤害数字+命中特效）----------
{
  const { browser, page } = await boot(1);
  await prepArena(page);
  await page.evaluate(() => {
    const g = window.__swGame;
    // 靶怪：玩家右侧 60-160px 一排 6 只（简单敌怪,常驻）
    const mk = (dx, dy) => {
      const e = g.spawnEnemy?.('zombie', g.player.cx + dx, g.player.cy + dy);
      if (e) { e.hp = 999999; e.maxHp = 999999; if ('ai0' in e) e.ai0 = 0; }
      return e;
    };
    window.__bj314dummies = [];
    for (let i = 0; i < 6; i++) window.__bj314dummies.push(mk(70 + (i % 3) * 34, -20 + Math.floor(i / 3) * 40));
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { window.__swGame.paused = false; });
  console.log('[hitload-swing]', JSON.stringify(await sampleFrames(page, 'hitload-swing', 480, true)));
  await browser.close();
}
process.exit(0);
