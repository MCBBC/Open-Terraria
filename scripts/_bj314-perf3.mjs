// BJ314 探针#3：命中负载面——6 靶怪在锥内连挥（编排尘+伤害数字+命中编排）。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
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
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(async (e) => {
  console.log('[dbg] img click fail', e.message);
  console.log('[dbg] vsel html:', (await page.evaluate(() => document.querySelector('.sw-vsel')?.innerHTML ?? 'none')).slice(0, 500));
});
try {
  await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
} catch {
  console.log('[dbg] title wait fail:', await page.evaluate(() => document.querySelector('.sw-vsel-title')?.textContent ?? 'no-title'));
  await page.screenshot({ path: '/tmp/bj314-menustuck.png' });
  throw new Error('menu stuck');
}
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

await page.evaluate(async () => {
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
  // 靶怪：右侧 60-160px 一排 6 只
  window.__bj314dummies = [];
  for (let i = 0; i < 6; i++) {
    const dx = 70 + (i % 3) * 34, dy = -20 + Math.floor(i / 3) * 40;
    const e = g.spawnEnemy?.('zombie', g.player.cx + dx, g.player.cy + dy);
    if (e) { e.hp = 9999999; e.maxHp = 9999999; }
    window.__bj314dummies.push(e);
  }
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
  return { dummies: window.__bj314dummies.filter(Boolean).length };
});
console.log('[prep3] done');

await page.evaluate((n) => {
  const g = window.__swGame;
  g.input.mouseX = g.renderer.canvas.width / 2 + 200;
  g.input.mouseY = g.renderer.canvas.height / 2;
  g.input.mouseDown = true; g.input.mouseHeld = true;
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
}, 480);
await page.waitForFunction(() => window.__bj314s?.done, { timeout: 120000, polling: 200 });
const stats = await page.evaluate(() => {
  const g = window.__swGame;
  const ts = window.__bj314s.times.slice(2).sort((a, b) => a - b);
  const q = (p) => ts[Math.min(ts.length - 1, Math.floor(ts.length * p))];
  const c = window.__bj314c;
  g.input.mouseDown = false; g.input.mouseHeld = false;
  return {
    label: 'hitload-swing', n: ts.length,
    avg: +(ts.reduce((s, v) => s + v, 0) / ts.length).toFixed(2),
    p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +ts[ts.length - 1].toFixed(2),
    arcMsPerCall: c.arcDraw ? +(c.arcDrawMs / c.arcDraw).toFixed(3) : 0,
    flyMsPerCall: c.flyDraw ? +(c.flyDrawMs / c.flyDraw).toFixed(3) : 0,
    dummiesAlive: (g.entities.enemies ?? []).filter((e) => !e.dead).length,
    dustCount: (g.entities.particles ?? []).length,
  };
});
console.log('[hitload]', JSON.stringify(stats));
await browser.close();
process.exit(0);
