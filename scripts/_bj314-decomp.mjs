// BJ314 残差归因：SwingArc.draw 拆解——drawSparkle（原型法可包装）vs 其余（=drawArcLayers）。
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
  const items = await import('/src/data/items.ts');
  let idx273 = -1;
  items.ITEM_DEFS.forEach((d, i) => { if (d && d.vid === 273) idx273 = i; });
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx273, stack: 1 };
  const arcMod = await import('/src/entities/SwingArc.ts');
  const c = { arc: 0, arcMs: 0, spark: 0, sparkMs: 0, rest: 0, restMs: 0, resize: 0 };
  const oArc = arcMod.SwingArc.prototype.draw;
  const oSpark = arcMod.SwingArc.prototype.drawSparkle;
  arcMod.SwingArc.prototype.drawSparkle = function (ctx, fw) {
    const t0 = performance.now();
    oSpark.call(this, ctx, fw);
    c.spark++; c.sparkMs += performance.now() - t0;
  };
  arcMod.SwingArc.prototype.draw = function (r) {
    const t0 = performance.now();
    oArc.call(this, r);
    c.arc++; c.arcMs += performance.now() - t0;
  };
  // resize 计数（CanvasRenderingContext2D 不可 wrap width setter——挂在 canvas 原型）
  const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  if (d?.set) {
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      get: d.get,
      set: function (v) { if (this[d.get.call(this)] !== undefined || true) { if (d.get.call(this) !== v) c.resize++; } d.set.call(this, v); },
      configurable: true,
    });
  }
  window.__bj314c = c;
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
});
await page.evaluate((n) => {
  const g = window.__swGame;
  g.input.mouseX = g.renderer.canvas.width / 2 + 200;
  g.input.mouseY = g.renderer.canvas.height / 2;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  const c = window.__bj314c;
  c.arc = 0; c.arcMs = 0; c.spark = 0; c.sparkMs = 0; c.resize = 0;
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
    p50: +q(0.5).toFixed(2), p99: +q(0.99).toFixed(2),
    arcCalls: c.arc, arcMsPerCall: c.arc ? +(c.arcMs / c.arc).toFixed(3) : 0,
    sparkCalls: c.spark, sparkMsPerCall: c.spark ? +(c.sparkMs / c.spark).toFixed(3) : 0,
    canvasResizes: c.resize,
  };
});
console.log(JSON.stringify(stats));
await browser.close();
process.exit(0);
