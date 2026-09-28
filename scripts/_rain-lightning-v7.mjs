// 雷击帧雨消失 - v7 定谳账(帧头建账对齐+可靠闪电触发,零 GL 读):
//   newLightning(true) 每 1.2s(纯闪) + 1091 每 5s(bolt bake 交互);帧头 push 记录,
//   drawRain/boltDraw/accFail/rainPos 全部归属当帧;L/accMode/像素帧尾补齐。
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5252';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => { window.btnByText2?.('我已知晓')?.click(); });
await new Promise((r) => setTimeout(r, 800));

await page.evaluate(() => {
  const g = window.__swGame, w = g.world.weather;
  g.world.clock.timeOfDay = 0.9;
  w.shouldUseStormMusic = true; w.storming = true;
  window.__pinTimer = setInterval(() => {
    w.raining = true; w.maxRaining = 0.9; w.rainTime = 1e9;
    w.cloudAlpha = 0.9; w.windSpeedTarget = 0.7; w.windSpeedCurrent = 0.7;
  }, 100);
  window.__flashTimer = setInterval(() => { try { w.newLightning(true); } catch { } }, 1200);
  window.__boltTimer = setInterval(() => {
    try {
      const gg = window.__swGame, p = gg.player;
      gg.spawnStormBolt1091(p.cx + (Math.random() * 700 - 350), Math.max(120, p.cy - 450), (Math.random() * 4294967295) >>> 0);
    } catch { }
  }, 5000);
});
await new Promise((r) => setTimeout(r, 5000));

const inst = await page.evaluate(async () => {
  const WRm = await import('/src/render/WeatherRenderer.ts');
  const WR = WRm.WeatherRenderer;
  const R = (await import('/src/render/Renderer.ts')).Renderer;
  const EX = (await import('/src/render/glshim/GLShimExecutor.ts')).GLShimExecutor;
  const P = await import('/src/entities/proj1457.ts');
  const g = window.__swGame;
  const r = g.renderer;
  window.__frames = [];
  window.__cap = null;
  window.__probeErr = null;
  let cur = null;
  const shim = () => r.bglEntShim;

  const origDraw = WR.prototype.drawRain;
  WR.prototype.drawRain = function (rr, world) {
    const f = window.__frames[window.__frames.length - 1];
    if (f) f.drawN = (f.drawN ?? 0) + 1;
    let bt = null;
    try { const m = rr.ctx.getTransform(); bt = [m.a, m.b, m.c, m.d, Math.round(m.e), Math.round(m.f)]; } catch { }
    cur = { built: -1, emit: null, drops: 0, boltDraws: 0, light: null, ctm: bt };
    origDraw.call(this, rr, world);
    try {
      const cap = WRm.drawRainBatchCaptureForTest();
      cur.built = cap.quads;
      cur.drops = this.pool.reduce((n, d) => n + (d.active ? 1 : 0), 0);
      if (cap.quads > 0) {
        const D = cap.data;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, bad = 0, tint = null;
        for (let q = 0; q < cap.quads; q++) {
          const o = q * 42;
          for (const off of [0, 7, 14, 35]) {
            const px = D[o + off], py = D[o + off + 1];
            if (!Number.isFinite(px) || !Number.isFinite(py)) { bad++; continue; }
            if (px < x0) x0 = px; if (px > x1) x1 = px;
            if (py < y0) y0 = py; if (py > y1) y1 = py;
          }
          if (q === 0) tint = [D[o + 4], D[o + 5], D[o + 6]].map((v) => Math.round(v * 255));
        }
        cur.qbbox = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
        cur.tint0 = tint;
        cur.bad = bad;
      }
      const drop = this.pool.find((d) => d.active);
      if (drop && this.hooks) {
        const out = [0, 0, 0];
        this.hooks.lightAtTo(Math.floor((drop.x + 4) / 16), Math.floor((drop.y + 4) / 16), out);
        cur.light = out.map((v) => Math.round(v));
      }
      const s = shim();
      cur.accMode = s?.accMode ?? null;
    } catch (e) { if (!window.__probeErr) window.__probeErr = 'draw:' + String(e).slice(0, 200); }
    // 挂到当帧记录(drawRain 在帧内:最后一条帧记录)
    const f2 = window.__frames[window.__frames.length - 1];
    if (f2) Object.assign(f2, cur);
    cur = null;
  };
  const origEmit = R.prototype.emitRainQuadBatch;
  R.prototype.emitRainQuadBatch = function (img, key, data, quads, replay) {
    const ret = origEmit.call(this, img, key, data, quads, replay);
    if (cur) cur.emit = { quads, ret };
    return ret;
  };
  const origBoltDraw = P.StormLightning.prototype.draw;
  P.StormLightning.prototype.draw = function (...a) {
    const f = window.__frames[window.__frames.length - 1];
    if (f) f.boltDraws = (f.boltDraws ?? 0) + 1;
    return origBoltDraw.apply(this, a);
  };
  const origFail = EX.prototype.accFail;
  EX.prototype.accFail = function (why) {
    const f = window.__frames[window.__frames.length - 1];
    if (f) { f.accFails = (f.accFails ?? 0) + 1; (f.accFailWhy ??= []).push(why); }
    return origFail.call(this, why);
  };
  const origFlushAcc = EX.prototype.flushAcc;
  EX.prototype.flushAcc = function () {
    const f = window.__frames[window.__frames.length - 1];
    let rainPos = -1, n = 0;
    for (let p = this.head; p; p = p.next) {
      if (p.batch && !p.batch.rgba && !p.batch.region) { rainPos = n; break; }
      n++;
      if (n > 9999) break;
    }
    if (f && rainPos >= 0) { f.rainPos = rainPos; f.flushAccWithRain = (f.flushAccWithRain ?? 0) + 1; }
    return origFlushAcc.call(this);
  };
  const G = Object.getPrototypeOf(g);
  if (!G.__probeV7) {
    G.__probeV7 = true;
    const origFrame = G.frame;
    G.frame = function (now) {
      window.__frames.push({});
      if (window.__frames.length > 3000) window.__frames.shift();
      let r0;
      try { r0 = origFrame.call(this, now); } catch (e) { if (!window.__probeErr) window.__probeErr = 'frame:' + String(e).slice(0, 200); throw e; }
      try {
        const f = window.__frames[window.__frames.length - 1];
        const rr = this.renderer;
        f.L = Math.round(this.world.weather.lightning * 1000) / 1000;
        f.accEnd = rr._accMode;
        f.shimAcc = rr.bglEntShim?.accMode ?? null;
        if (window.__cap) {
          const cv = rr.canvas;
          const c2 = cv.getContext('2d');
          let img = null;
          try { img = c2.getImageData(0, 0, cv.width, cv.height); } catch { img = null; }
          if (img) {
            const step = 4, w = Math.floor(cv.width / step), h = Math.floor(cv.height / step);
            const small = new Uint8Array(w * h * 4);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              const si = (y * step * cv.width + x * step) * 4, di = (y * w + x) * 4;
              small[di] = img.data[si]; small[di + 1] = img.data[si + 1]; small[di + 2] = img.data[si + 2]; small[di + 3] = 255;
            }
            window.__cap.push({ w, h, px: Array.from(small) });
          }
        }
      } catch (e) { if (!window.__probeErr) window.__probeErr = 'cap:' + String(e).slice(0, 200); }
      return r0;
    };
  }
  return { ok: true };
});
console.log('INST', JSON.stringify(inst));

await page.evaluate(() => { window.__cap = []; });
await new Promise((r) => setTimeout(r, 14000));
const data = await page.evaluate(() => {
  const d = { cap: window.__cap, frames: window.__frames, err: window.__probeErr };
  window.__cap = null; window.__frames = [];
  return JSON.parse(JSON.stringify(d));
});
console.log('probeErr:', data.err);
{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv7', { recursive: true });
  fs.writeFileSync('/tmp/rainlv7/cap.json', JSON.stringify(data.cap));
  fs.writeFileSync('/tmp/rainlv7/frames.json', JSON.stringify(data.frames));
  console.log(`cap=${data.cap.length} frames=${data.frames.length} → /tmp/rainlv7/`);
}
await browser.close();
console.log('DONE');
