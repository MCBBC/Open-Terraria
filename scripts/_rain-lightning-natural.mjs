// 雷击帧雨消失定谳探针 v3 —— 自然雷暴动态逐帧对齐采样:
//   Game.frame 尾读主画布天带降采样字节 + 同帧雨账(drops/built/emit/flush/雷数/
//   lightning 值) → Node 侧逐帧分析:雨色命中数(预测雨条色=Rain.png×tint)异常帧
//   = 消失候选,连帧差分找突变。1091 自然落雷(spawnStormLightningTick 1/150/tick)。
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5252';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

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

// ---- 雷暴钉(雨侧) + 自然闪电(不钉 lightning,不中和 1091) ----
await page.evaluate(() => {
  const g = window.__swGame, w = g.world.weather;
  g.world.clock.timeOfDay = 0.9;
  w.shouldUseStormMusic = true; w.storming = true;
  window.__pinTimer = setInterval(() => {
    w.raining = true; w.maxRaining = 0.9; w.rainTime = 1e9;
    w.cloudAlpha = 0.9; w.windSpeedTarget = 0.7; w.windSpeedCurrent = 0.7;
  }, 100);
});
await new Promise((r) => setTimeout(r, 5000));

// ---- 逐帧装配 ----
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
  let cur = null;
  const shim = () => r.bglEntShim;

  const origDraw = WR.prototype.drawRain;
  WR.prototype.drawRain = function (rr, world) {
    cur = { built: -1, emit: null, flush: null, drops: 0, boltDraws: 0, accFails: 0 };
    origDraw.call(this, rr, world);
    cur.built = WRm.drawRainBatchCaptureForTest().quads;
    cur.drops = this.pool.reduce((n, d) => n + (d.active ? 1 : 0), 0);
    const drop = this.pool.find((d) => d.active);
    if (drop && this.hooks) {
      const out = [0, 0, 0];
      this.hooks.lightAtTo(Math.floor((drop.x + 4) / 16), Math.floor((drop.y + 4) / 16), out);
      cur.light = out.map((v) => Math.round(v));
    }
    const s = shim()?.stats;
    cur.bq = s ? s.emitBatchQuads : -1;
    window.__frames.push(cur);
    if (window.__frames.length > 4000) window.__frames.shift();
    cur = null;
  };
  const origEmit = R.prototype.emitRainQuadBatch;
  R.prototype.emitRainQuadBatch = function (img, key, data, quads, replay) {
    const host = window.__frames[window.__frames.length - 1];
    const ret = origEmit.call(this, img, key, data, quads, replay);
    if (host) host.emit = { quads, ret };
    return ret;
  };
  const origBoltDraw = P.StormLightning.prototype.draw;
  P.StormLightning.prototype.draw = function (...a) {
    const host = cur ?? window.__frames[window.__frames.length - 1];
    if (host) host.boltDraws++;
    return origBoltDraw.apply(this, a);
  };
  if (!EX.prototype.__rainProbePatched) {
    const origFail = EX.prototype.accFail;
    EX.prototype.accFail = function (why) { window.__frames.push({ accFail: why }); return origFail.call(this, why); };
    EX.prototype.__rainProbePatched = true;
  }
  // Game.frame 尾:主画布天带降采样
  const G = Object.getPrototypeOf(g);
  if (!G.__rainProbeFrame) {
    const origFrame = G.frame;
    G.__rainProbeFrame = true;
    G.frame = function (now) {
      const r0 = origFrame.call(this, now);
      if (window.__cap) {
        const cv = this.renderer.canvas;
        const c2 = cv.getContext('2d');
        const W = cv.width, H = cv.height;
        const x0 = Math.floor(W * 0.25), x1 = Math.floor(W * 0.75);
        const y0 = Math.floor(H * 0.10), y1 = Math.floor(H * 0.40);
        const step = 3;
        const w = Math.floor((x1 - x0) / step), h = Math.floor((y1 - y0) / step);
        let img;
        try { img = c2.getImageData(x0, y0, x1 - x0, y1 - y0); } catch { img = null; }
        const small = img ? new Uint8Array(w * h * 4) : null;
        if (img) {
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const si = ((y * step) * (x1 - x0) + x * step) * 4, di = (y * w + x) * 4;
            small[di] = img.data[si]; small[di + 1] = img.data[si + 1];
            small[di + 2] = img.data[si + 2]; small[di + 3] = 255;
          }
        }
        const last = window.__frames[window.__frames.length - 1];
        window.__cap.push({
          w, h, px: small ? Array.from(small) : null,
          lightning: Math.round(this.world.weather.lightning * 1000) / 1000,
          boltDraws: last?.boltDraws ?? 0, drops: last?.drops ?? -1,
          built: last?.built ?? -1, emitQ: last?.emit?.quads ?? -1, emitRet: last?.emit?.ret ?? null,
          bq: last?.bq ?? -1, paused: this.paused ?? null,
        });
      }
      return r0;
    };
  }
  return { ok: true };
});
console.log('INST', JSON.stringify(inst));

// ---- 采样 10s(约 600 帧;雷暴 1/150/tick ≈ 0.4 雷/s) ----
const started = await page.evaluate(() => { window.__cap = []; return performance.now(); });
await new Promise((r) => setTimeout(r, 10000));
const data = await page.evaluate(() => { const d = { cap: window.__cap, frames: window.__frames }; window.__cap = null; window.__frames = []; return JSON.parse(JSON.stringify(d)); });
console.log(`capFrames=${data.cap.length} traceFrames=${data.frames.length}`);
{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv3', { recursive: true });
  fs.writeFileSync('/tmp/rainlv3/cap.json', JSON.stringify(data.cap));
  fs.writeFileSync('/tmp/rainlv3/frames.json', JSON.stringify(data.frames));
  console.log('saved /tmp/rainlv3/{cap,frames}.json');
}
await browser.close();
console.log('DONE');
