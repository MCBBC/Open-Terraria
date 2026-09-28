// 雷击帧雨消失 - v9 = v3 验证过的非扰动钩组 + 帧尾安全读(qbbox/层宽/accEnd/rainPos):
//   自然雷暴(不强制 newLightning/不强制 1091),20s 采样。目标:消失帧的
//   ①批顶点坐标是否病态 ②flush 路径 ③accFail ④bolt 关联。
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
});
await new Promise((r) => setTimeout(r, 6000));

const inst = await page.evaluate(async () => {
  const WRm = await import('/src/render/WeatherRenderer.ts');
  const WR = WRm.WeatherRenderer;
  const R = (await import('/src/render/Renderer.ts')).Renderer;
  const EX = (await import('/src/render/glshim/GLShimExecutor.ts')).GLShimExecutor;
  const P = await import('/src/entities/proj1457.ts');
  const g = window.__swGame;
  const r = g.renderer;
  window.__frames = [];
  window.__probeErr = null;
  window.__boltLog = [];
  const shim = () => r.bglEntShim;

  const origDraw = WR.prototype.drawRain;
  WR.prototype.drawRain = function (rr, world) {
    origDraw.call(this, rr, world);
    try {
      const f = window.__frames[window.__frames.length - 1] ?? {};
      f.built = WRm.drawRainBatchCaptureForTest().quads;
      f.drops = this.pool.reduce((n, d) => n + (d.active ? 1 : 0), 0);
      const drop = this.pool.find((d) => d.active);
      if (drop && this.hooks) {
        const out = [0, 0, 0];
        this.hooks.lightAtTo(Math.floor((drop.x + 4) / 16), Math.floor((drop.y + 4) / 16), out);
        f.light = out.map((v) => Math.round(v));
      }
      const s = shim();
      f.accMode = s?.accMode ?? null;
      if (window.__frames.length && window.__frames[window.__frames.length - 1] === f) { /* 已在 */ }
      else window.__frames.push(f);
      if (window.__frames.length > 4000) window.__frames.shift();
    } catch (e) { if (!window.__probeErr) window.__probeErr = 'draw:' + String(e).slice(0, 160); }
  };
  const origEmit = R.prototype.emitRainQuadBatch;
  R.prototype.emitRainQuadBatch = function (img, key, data, quads, replay) {
    const ret = origEmit.call(this, img, key, data, quads, replay);
    const f = window.__frames[window.__frames.length - 1];
    if (f) f.emit = { quads, ret };
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
    if (f && rainPos >= 0) { f.rainPos = rainPos; f.flRain = (f.flRain ?? 0) + 1; }
    return origFlushAcc.call(this);
  };
  const G = Object.getPrototypeOf(g);
  if (!G.__probeV9) {
    G.__probeV9 = true;
    const origFrame = G.frame;
    G.frame = function (now) {
      window.__frames.push({});
      if (window.__frames.length > 4000) window.__frames.shift();
      const r0 = origFrame.call(this, now);
      try {
        const f = window.__frames[window.__frames.length - 1];
        const rr = this.renderer;
        f.L = Math.round(this.world.weather.lightning * 1000) / 1000;
        f.accEnd = rr._accMode;
        const cap = WRm.drawRainBatchCaptureForTest();
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
          f.qbbox = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
          f.tint0 = tint; f.bad = bad;
        }
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
            let bin = '';
            const CH = 8192;
            for (let i = 0; i < small.length; i += CH) bin += String.fromCharCode.apply(null, small.subarray(i, i + CH));
            window.__cap.push({ w, h, b64: btoa(bin) });
          }
        }
      } catch (e) { if (!window.__probeErr) window.__probeErr = 'tail:' + String(e).slice(0, 160); }
      return r0;
    };
  }
  return { ok: true };
});
console.log('INST', JSON.stringify(inst));
await page.evaluate(() => { window.__cap = []; });
await new Promise((r) => setTimeout(r, 20000));
const data = await page.evaluate(() => { const d = { frames: window.__frames, cap: window.__cap, err: window.__probeErr }; window.__frames = []; window.__cap = null; return JSON.parse(JSON.stringify(d)); });
console.log('probeErr:', data.err);
{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv9', { recursive: true });
  fs.writeFileSync("/tmp/rainlv9/frames.json", JSON.stringify(data.frames)); fs.writeFileSync("/tmp/rainlv9/cap.json", JSON.stringify(data.cap)); console.log("cap=" + data.cap.length);
  console.log(`frames=${data.frames.length} → /tmp/rainlv9/frames.json`);
}
await browser.close();
console.log('DONE');
