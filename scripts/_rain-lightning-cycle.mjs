// 雷击帧雨消失 - 执行器生命周期全景账:
//   flush()/flushAcc()/presentBatch()/replay2D()/attachAcc/attach/bridge/detach/
//   frameReset()/pushQuadBatch() 全钩 + 渲染器 _accMode/层尺寸/执行器身份 + 每帧
//   drawRain 调用数 + 终帧像素。目标:雨批 rec 从入队到发射的完整路径 + 消失帧的
//   生命周期异常。
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
  window.__boltTimer = setInterval(() => {
    const gg = window.__swGame, p = gg.player;
    gg.spawnStormBolt1091(p.cx + (Math.random() * 800 - 400), Math.max(100, p.cy - 500 + Math.random() * 300), (Math.random() * 4294967295) >>> 0);
  }, 900);
});
await new Promise((r) => setTimeout(r, 5000));

const inst = await page.evaluate(async () => {
  const WRm = await import('/src/render/WeatherRenderer.ts');
  const WR = WRm.WeatherRenderer;
  const R = (await import('/src/render/Renderer.ts')).Renderer;
  const EX = (await import('/src/render/glshim/GLShimExecutor.ts')).GLShimExecutor;
  const g = window.__swGame;
  const r = g.renderer;
  window.__ev = [];        // 执行器生命周期事件流
  window.__frames = [];
  window.__cap = null;
  window.__probeErr = null;
  let frameNo = 0;
  const log = (o) => { o.f = frameNo; window.__ev.push(o); if (window.__ev.length > 6000) window.__ev.shift(); };
  const shims = () => r.bglEntShim;

  // 执行器身份
  if (!EX.prototype.__probeIdSeq) EX.prototype.__probeIdSeq = 0;
  const origAttachAcc = EX.prototype.attachAcc;
  EX.prototype.attachAcc = function (...a) {
    if (this.__probeId === undefined) this.__probeId = ++EX.prototype.__probeIdSeq;
    const ret = origAttachAcc.apply(this, a);
    log({ e: 'attachAcc', id: this.__probeId, ok: !!ret, accMode: this.accMode });
    return ret;
  };
  const origAttach = EX.prototype.attach;
  EX.prototype.attach = function (...a) {
    if (this.__probeId === undefined) this.__probeId = ++EX.prototype.__probeIdSeq;
    const ret = origAttach.apply(this, a);
    log({ e: 'attach', id: this.__probeId, ok: !!ret, accMode: this.accMode });
    return ret;
  };
  const origBridge = EX.prototype.bridge;
  EX.prototype.bridge = function (...a) {
    log({ e: 'bridge', id: this.__probeId, accMode: this.accMode, q: this.head ? 1 : 0 });
    return origBridge.apply(this, a);
  };
  const origDetach = EX.prototype.detach;
  EX.prototype.detach = function (...a) {
    log({ e: 'detach', id: this.__probeId, q: this.head ? 1 : 0 });
    return origDetach.apply(this, a);
  };
  const origFrameReset = EX.prototype.frameReset;
  EX.prototype.frameReset = function (...a) {
    log({ e: 'frameReset', id: this.__probeId, q: this.head ? 1 : 0 });
    return origFrameReset.apply(this, a);
  };
  const origPush = EX.prototype.pushQuadBatch;
  EX.prototype.pushQuadBatch = function (img, key, data, quads, replay) {
    const ret = origPush.call(this, img, key, data, quads, replay);
    log({ e: 'pushRain', id: this.__probeId, quads, ret, accMode: this.accMode, active: this.active, qLen: (() => { let n = 0; for (let p = this.head; p; p = p.next) { n++; if (n > 999) break; } return n; })() });
    return ret;
  };
  const origFlush = EX.prototype.flush;
  EX.prototype.flush = function (...a) {
    const hadQ = !!this.head;
    const acc = this.accMode;
    log({ e: 'flush>', id: this.__probeId, hadQ, acc });
    return origFlush.apply(this, a);
  };
  const origFlushAcc = EX.prototype.flushAcc;
  EX.prototype.flushAcc = function () {
    let n = 0, hasR = false, rQ = 0;
    for (let p = this.head; p; p = p.next) {
      n++;
      if (p.batch && !p.batch.rgba && !p.batch.region) { hasR = true; rQ = p.batch.quads; }
      if (n > 9999) break;
    }
    const bq0 = this.stats.emitBatchQuads;
    const glw = this.glw;
    const wh = glw ? [glw.canvas.width, glw.canvas.height] : null;
    origFlushAcc.call(this);
    const rec = { e: 'flushAcc', id: this.__probeId, n, hasR, rQ, dQ: this.stats.emitBatchQuads - bq0, accMode: this.accMode, wh };
    if (hasR && glw && glw.isAccumOpen('world') && glw.gl && !glw.unavailable) {
      try {
        const gll = glw.gl, W = glw.canvas.width, H = glw.canvas.height;
        const rw = 256, rh = 96, rx = Math.floor(W / 2 - rw / 2), ry = Math.floor(H / 2 - rh / 2);
        const px = new Uint8Array(rw * rh * 4);
        gll.readPixels(rx, ry, rw, rh, gll.RGBA, gll.UNSIGNED_BYTE, px);
        rec.fbo = { W, H, rx, ry, err: gll.getError(), px: Array.from(px) };
      } catch (e) { rec.fboErr = String(e).slice(0, 60); }
    }
    log(rec);
  };
  const origPresent = EX.prototype.presentBatch;
  EX.prototype.presentBatch = function (glw, wctx, w, h, tier, additive) {
    let n = 0, hasR = false, rQ = 0;
    for (let p = this.head; p; p = p.next) {
      if (p.tier !== tier) continue;
      n++;
      if (p.batch && !p.batch.rgba && !p.batch.region) { hasR = true; rQ = p.batch.quads; }
      if (n > 9999) break;
    }
    log({ e: 'presentBatch', id: this.__probeId, tier, n, hasR, rQ, wh: glw ? [glw.canvas.width, glw.canvas.height] : null });
    return origPresent.call(this, glw, wctx, w, h, tier, additive);
  };
  const origReplay = EX.prototype.replay2D;
  EX.prototype.replay2D = function (...a) {
    log({ e: 'replay2D', id: this.__probeId, q: this.head ? 1 : 0 });
    return origReplay.apply(this, a);
  };
  // 渲染器:accMode 状态 + drawRain 计数
  const origDraw = WR.prototype.drawRain;
  WR.prototype.drawRain = function (rr, world) {
    const f = window.__frames[window.__frames.length - 1];
    if (f) f.drawN++;
    else log({ e: 'drawRainNoFrame' });
    return origDraw.call(this, rr, world);
  };
  const G = Object.getPrototypeOf(g);
  if (!G.__probeCycle) {
    G.__probeCycle = true;
    const origFrame = G.frame;
    G.frame = function (now) {
      let r0;
      try { r0 = origFrame.call(this, now); } catch (e) { if (!window.__probeErr) window.__probeErr = 'frame:' + String(e); throw e; }
      try {
        frameNo++;
        const rr = this.renderer;
        window.__frames.push({
          drawN: 0, L: Math.round(this.world.weather.lightning * 1000) / 1000,
          accMode: rr._accMode, hasShim: !!rr.bglEntShim,
          shimActive: rr.bglEntShim?.active ?? null, shimAccMode: rr.bglEntShim?.accMode ?? null,
          shimId: rr.bglEntShim?.__probeId ?? null,
          worldLowW: rr._worldLowW, worldLowH: rr._worldLowH,
          degraded: rr._accGlw ? !!rr._accGlw.unavailable : null,
        });
        if (window.__frames.length > 3000) window.__frames.shift();
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
            window.__cap.push({ w, h, px: Array.from(small), f: frameNo });
          }
        }
      } catch (e) { if (!window.__probeErr) window.__probeErr = 'cap:' + String(e); }
      return r0;
    };
  }
  return { ok: true };
});
console.log('INST', JSON.stringify(inst));

await page.evaluate(() => { window.__cap = []; });
await new Promise((r) => setTimeout(r, 12000));
const data = await page.evaluate(() => {
  const d = { cap: window.__cap, frames: window.__frames, ev: window.__ev, err: window.__probeErr };
  window.__cap = null; window.__frames = []; window.__ev = [];
  return JSON.parse(JSON.stringify(d));
});
console.log('probeErr:', data.err);
{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv5', { recursive: true });
  fs.writeFileSync('/tmp/rainlv5/cap.json', JSON.stringify(data.cap));
  fs.writeFileSync('/tmp/rainlv5/frames.json', JSON.stringify(data.frames));
  fs.writeFileSync('/tmp/rainlv5/ev.json', JSON.stringify(data.ev));
  console.log(`cap=${data.cap.length} frames=${data.frames.length} ev=${data.ev.length} → /tmp/rainlv5/`);
}
await browser.close();
console.log('DONE');
