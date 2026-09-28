// v10:镜像追踪 —— attach 快照 vs drawRain 时镜像 vs translate 调用账。
//   假设:acc=false 帧相机 translate(-camRX,-camRY) 未过 shim 镜像 → 雨批世界坐标。
//   零 ctx 调用(直读 shim.m 字段;translate/setTransform 只记计数与末值)。
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
  window.__flashTimer = setInterval(() => { try { w.newLightning(true); } catch { } }, 1500);
});
await new Promise((r) => setTimeout(r, 5000));

const inst = await page.evaluate(async () => {
  const WRm = await import('/src/render/WeatherRenderer.ts');
  const WR = WRm.WeatherRenderer;
  const R = (await import('/src/render/Renderer.ts')).Renderer;
  const EX = (await import('/src/render/glshim/GLShimExecutor.ts')).GLShimExecutor;
  const g = window.__swGame;
  const r = g.renderer;
  window.__frames = [];
  window.__cap = null;
  window.__probeErr = null;
  const shim = () => r.bglEntShim;

  const origAttach = EX.prototype.attach;
  EX.prototype.attach = function (raw) {
    const ret = origAttach.call(this, raw);
    const f = window.__frames[window.__frames.length - 1];
    if (f) {
      f.attachSnapshot = [this.m.a, this.m.b, this.m.c, this.m.d, Math.round(this.m.e), Math.round(this.m.f)];
      f.attachOk = !!ret;
      this.__tl = { n: 0, stN: 0, lastBig: null };
    }
    return ret;
  };
  const origAttachAcc = EX.prototype.attachAcc;
  EX.prototype.attachAcc = function () {
    const ret = origAttachAcc.call(this);
    const f = window.__frames[window.__frames.length - 1];
    if (f) {
      f.accSnapshot = [this.m.a, this.m.b, this.m.c, this.m.d, Math.round(this.m.e), Math.round(this.m.f)];
      this.__tl = { n: 0, stN: 0, lastBig: null };
    }
    return ret;
  };
  const origTranslate = EX.prototype.translate;
  EX.prototype.translate = function (x, y) {
    const tl = this.__tl;
    if (tl) {
      tl.n++;
      if (Math.abs(x) > 500 || Math.abs(y) > 500) tl.lastBig = [Math.round(x), Math.round(y)];
    }
    return origTranslate.call(this, x, y);
  };
  const origST = EX.prototype.setTransform;
  EX.prototype.setTransform = function (...a) {
    const tl = this.__tl;
    if (tl) tl.stN++;
    return origST.apply(this, a);
  };

  const origDraw = WR.prototype.drawRain;
  WR.prototype.drawRain = function (rr, world) {
    origDraw.call(this, rr, world);
    try {
      const f = window.__frames[window.__frames.length - 1];
      if (!f) return;
      const s = shim();
      f.built = WRm.drawRainBatchCaptureForTest().quads;
      f.accMode = s?.accMode ?? null;
      f.mirror = s ? [s.m.a, s.m.b, s.m.c, s.m.d, Math.round(s.m.e), Math.round(s.m.f)] : null;
      f.rawNull = s ? s.raw === null : null;
      f.tl = s?.__tl ? { n: s.__tl.n, stN: s.__tl.stN, lastBig: s.__tl.lastBig } : null;
    } catch (e) { if (!window.__probeErr) window.__probeErr = 'draw:' + String(e).slice(0, 160); }
  };
  const G = Object.getPrototypeOf(g);
  if (!G.__probeV10) {
    G.__probeV10 = true;
    const origFrame = G.frame;
    G.frame = function (now) {
      window.__frames.push({});
      if (window.__frames.length > 4000) window.__frames.shift();
      const r0 = origFrame.call(this, now);
      try {
        const f = window.__frames[window.__frames.length - 1];
        f.L = Math.round(this.world.weather.lightning * 1000) / 1000;
        const rr = this.renderer;
        f.accEnd = rr._accMode;
        const cap = WRm.drawRainBatchCaptureForTest();
        if (cap.quads > 0) {
          const D = cap.data;
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          for (let q = 0; q < cap.quads; q++) {
            const o = q * 42;
            for (const off of [0, 7, 14, 35]) {
              const px = D[o + off], py = D[o + off + 1];
              if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
              if (px < x0) x0 = px; if (px > x1) x1 = px;
              if (py < y0) y0 = py; if (py > y1) y1 = py;
            }
          }
          f.qbbox = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
        }
        if (window.__cap) {
          const cv = rr.canvas;
          const c2 = cv.getContext('2d');
          let img = null;
          try { img = c2.getImageData(0, 0, cv.width, cv.height); } catch { img = null; }
          if (img) {
            const step = 4, w2 = Math.floor(cv.width / step), h2 = Math.floor(cv.height / step);
            const small = new Uint8Array(w2 * h2 * 4);
            for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
              const si = (y * step * cv.width + x * step) * 4, di = (y * w2 + x) * 4;
              small[di] = img.data[si]; small[di + 1] = img.data[si + 1]; small[di + 2] = img.data[si + 2]; small[di + 3] = 255;
            }
            let bin = '';
            const CH = 8192;
            for (let i = 0; i < small.length; i += CH) bin += String.fromCharCode.apply(null, small.subarray(i, i + CH));
            window.__cap.push({ w: w2, h: h2, b64: btoa(bin) });
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
await new Promise((r) => setTimeout(r, 10000));
const data = await page.evaluate(() => { const d = { frames: window.__frames, cap: window.__cap, err: window.__probeErr }; window.__frames = []; window.__cap = null; return JSON.parse(JSON.stringify(d)); });
console.log('probeErr:', data.err);
{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv10', { recursive: true });
  fs.writeFileSync('/tmp/rainlv10/frames.json', JSON.stringify(data.frames));
  console.log(`frames=${data.frames.length} → /tmp/rainlv10/`);
}
await browser.close();
console.log('DONE');
