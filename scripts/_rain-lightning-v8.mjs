// v8 最小侵入实验:仅帧尾读批槽+层尺寸,不碰 drawRain/不调 getTransform。
// 判据:qbbox 是否天然 ~33000(层坐标系大于视口)还是 v6/v7 的钩子扰动。
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
});
await new Promise((r) => setTimeout(r, 5000));

const inst = await page.evaluate(async () => {
  const WRm = await import('/src/render/WeatherRenderer.ts');
  const g = window.__swGame;
  const r = g.renderer;
  window.__frames = [];
  window.__probeErr = null;
  const G = Object.getPrototypeOf(g);
  if (!G.__probeV8) {
    G.__probeV8 = true;
    const origFrame = G.frame;
    G.frame = function (now) {
      let r0;
      try { r0 = origFrame.call(this, now); } catch (e) { throw e; }
      try {
        const rr = this.renderer;
        const cap = WRm.drawRainBatchCaptureForTest();
        const rec = {
          L: Math.round(this.world.weather.lightning * 1000) / 1000,
          built: cap.quads,
          layerW: rr.bglEntShim?.glw?.canvas.width ?? null,
          layerH: rr.bglEntShim?.glw?.canvas.height ?? null,
          worldLowW: rr._worldLowW, worldLowH: rr._worldLowH,
          zoom: rr._lastZoom ?? rr.cam?.zoom ?? null,
          camX: Math.round(this.world.cam?.x ?? this.world.camera?.x ?? -1),
        };
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
          rec.qbbox = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
        }
        window.__frames.push(rec);
        if (window.__frames.length > 3000) window.__frames.shift();
      } catch (e) { if (!window.__probeErr) window.__probeErr = String(e).slice(0, 200); }
      return r0;
    };
  }
  return { ok: true };
});
console.log('INST', JSON.stringify(inst));
await new Promise((r) => setTimeout(r, 6000));
const data = await page.evaluate(() => { const d = { frames: window.__frames, err: window.__probeErr }; window.__frames = []; return JSON.parse(JSON.stringify(d)); });
console.log('err:', data.err);
console.log('frames:', data.frames.length);
for (const f of data.frames.slice(0, 6)) console.log(JSON.stringify(f));
const x0s = data.frames.filter(f=>f.qbbox).map(f=>f.qbbox[0]);
console.log('qbbox.x0 分布: min=', Math.min(...x0s), 'max=', Math.max(...x0s));
console.log('layerW 分布:', JSON.stringify(data.frames.reduce((a,f)=>{a[f.layerW]=(a[f.layerW]||0)+1;return a;},{})));
await browser.close();
