// 雷击帧雨消失 - v6 非侵入定谳账(零 GL 读,不扰动 acc 模式):
//   每帧:drawN/drops/built/emit/light/ctm/全 quad 顶点扫描(NaN/离屏)/boltDraws/
//   shim accMode/_accMode/accFail 原因/replay2D 次数/flush 分支账(含雨批 rec 的
//   队列位置+tier 前缀)/终帧像素。
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
    if (f) f.drawN++;
    const bt = rr.ctx.getTransform();
    cur = { built: -1, emit: null, drops: 0, boltDraws: 0, light: null, ctm: null, qbbox: null, vscan: null };
    try { cur.ctm = [bt.a, bt.b, bt.c, bt.d, Math.round(bt.e), Math.round(bt.f)]; } catch { }
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
        cur.vscan = { bad, n: cap.quads, tint };
      }
      const drop = this.pool.find((d) => d.active);
      if (drop && this.hooks) {
        const out = [0, 0, 0];
        this.hooks.lightAtTo(Math.floor((drop.x + 4) / 16), Math.floor((drop.y + 4) / 16), out);
        cur.light = out.map((v) => Math.round(v));
      }
      const s = shim();
      cur.accMode = s?.accMode ?? null;
      cur.active = s?.active ?? null;
      const st = s?.stats;
      cur.st = st ? { fl: st.flushes, fb: st.fallback, rp: st.replays, up: st.uploads } : null;
    } catch (e) { if (!window.__probeErr) window.__probeErr = 'draw:' + String(e).slice(0, 200); }
    window.__frames.push(cur);
    if (window.__frames.length > 3000) window.__frames.shift();
    cur = null;
  };
  const origEmit = R.prototype.emitRainQuadBatch;
  R.prototype.emitRainQuadBatch = function (img, key, data, quads, replay) {
    const ret = origEmit.call(this, img, key, data, quads, replay);
    const host = cur;
    if (host) host.emit = { quads, ret };
    return ret;
  };
  const origBoltDraw = P.StormLightning.prototype.draw;
  P.StormLightning.prototype.draw = function (...a) {
    if (cur) cur.boltDraws++;
    else {
      const f = window.__frames[window.__frames.length - 1];
      if (f) f.boltLate = (f.boltLate ?? 0) + 1;
    }
    return origBoltDraw.apply(this, a);
  };
  const origFail = EX.prototype.accFail;
  EX.prototype.accFail = function (why) {
    const f = window.__frames[window.__frames.length - 1];
    if (f) f.accFails = (f.accFails ?? 0) + 1, (f.accFailWhy = f.accFailWhy ?? []).push(why);
    return origFail.call(this, why);
  };
  const origFlush = EX.prototype.flush;
  EX.prototype.flush = function (...a) {
    const f = window.__frames[window.__frames.length - 1];
    if (f) f.flushes = (f.flushes ?? 0) + 1;
    return origFlush.apply(this, a);
  };
  // flushAcc 内含雨批 rec 的位置账
  const origFlushAcc = EX.prototype.flushAcc;
  EX.prototype.flushAcc = function () {
    const f = window.__frames[window.__frames.length - 1];
    let rainPos = -1, n = 0;
    for (let p = this.head; p; p = p.next) {
      if (p.batch && !p.batch.rgba && !p.batch.region) { rainPos = n; break; }
      n++;
      if (n > 9999) break;
    }
    if (f && rainPos >= 0) f.rainPos = rainPos;
    return origFlushAcc.call(this);
  };
  const G = Object.getPrototypeOf(g);
  if (!G.__probeV6) {
    G.__probeV6 = true;
    const origFrame = G.frame;
    G.frame = function (now) {
      let r0;
      try { r0 = origFrame.call(this, now); } catch (e) { if (!window.__probeErr) window.__probeErr = 'frame:' + String(e).slice(0, 200); throw e; }
      try {
        const rr = this.renderer;
        const last = window.__frames[window.__frames.length - 1];
        if (last) last.accModeEnd = rr._accMode;
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
await new Promise((r) => setTimeout(r, 12000));
const data = await page.evaluate(() => {
  const d = { cap: window.__cap, frames: window.__frames, err: window.__probeErr };
  window.__cap = null; window.__frames = [];
  return JSON.parse(JSON.stringify(d));
});
console.log('probeErr:', data.err);
{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv6', { recursive: true });
  fs.writeFileSync('/tmp/rainlv6/cap.json', JSON.stringify(data.cap));
  fs.writeFileSync('/tmp/rainlv6/frames.json', JSON.stringify(data.frames));
  console.log(`cap=${data.cap.length} frames=${data.frames.length} → /tmp/rainlv6/`);
}
await browser.close();
console.log('DONE');
