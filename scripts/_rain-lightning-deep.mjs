// 雷击帧雨消失深挖探针 —— 发射面 vs FBO 落地面 vs 终帧三分账:
//   ①drawRain 镜像 CTM+首 quad 角点 bbox(退化/漂移甄别);
//   ②flushAcc 逐次账:队列 rec 数/批 quads/tier 序/begin(clear) 重开;
//   ③含雨批 flush 后 gl.readPixels 直读累积 FBO 天带(雨色命中=FBO 已落);
//   ④终帧同带像素(消失帧对照) → 定位丢失环节(FBO 前/合成/盖写)。
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
page.on('console', (m) => { const t = m.text(); if (t.includes('失败') || t.includes('degrade')) console.log('CON:', t.slice(0, 200)); });
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
  // 可控落雷:每 900ms 一发 1091(玩家视口内;走真实 Kill 帧+bake 链)
  window.__boltTimer = setInterval(() => {
    const gg = window.__swGame, p = gg.player;
    const x = p.cx + (Math.random() * 800 - 400), y = p.cy - 500 + Math.random() * 300;
    gg.spawnStormBolt1091(x, Math.max(100, y), (Math.random() * 4294967295) >>> 0);
  }, 900);
});
await new Promise((r) => setTimeout(r, 5000));

const inst = await page.evaluate(async () => {
  const WRm = await import('/src/render/WeatherRenderer.ts');
  const WR = WRm.WeatherRenderer;
  const R = (await import('/src/render/Renderer.ts')).Renderer;
  const EX = (await import('/src/render/glshim/GLShimExecutor.ts')).GLShimExecutor;
  const GL = (await import('/src/render/GLSpriteLayer.ts')).GLSpriteLayer;
  const P = await import('/src/entities/proj1457.ts');
  const g = window.__swGame;
  const r = g.renderer;
  window.__frames = [];
  window.__cap = null;
  window.__flushLog = [];
  let cur = null;
  const shim = () => r.bglEntShim;
  const glw = () => r._accGlw ?? shim()?.glw;

  const origDraw = WR.prototype.drawRain;
  WR.prototype.drawRain = function (rr, world) {
    const bt = rr.ctx.getTransform();
    cur = {
      built: -1, emit: null, drops: 0, boltDraws: 0,
      ctm: [bt.a, bt.b, bt.c, bt.d, Math.round(bt.e), Math.round(bt.f)],
      flushN0: window.__flushLog.length,
    };
    origDraw.call(this, rr, world);
    const cap = WRm.drawRainBatchCaptureForTest();
    cur.built = cap.quads;
    cur.drops = this.pool.reduce((n, d) => n + (d.active ? 1 : 0), 0);
    // 首 quad 角点 bbox(顶点 0/1/2 = p0/p1/p2)
    if (cap.quads > 0) {
      const D = cap.data;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, bad = 0;
      for (let q = 0; q < Math.min(cap.quads, 40); q++) {
        const o = q * 42;
        for (const [px, py] of [[D[o], D[o + 1]], [D[o + 7], D[o + 8]], [D[o + 14], D[o + 15]], [D[o + 35], D[o + 36]]]) {
          if (!Number.isFinite(px) || !Number.isFinite(py)) { bad++; continue; }
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
      }
      cur.qbbox = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), bad];
    }
    const drop = this.pool.find((d) => d.active);
    if (drop && this.hooks) {
      const out = [0, 0, 0];
      this.hooks.lightAtTo(Math.floor((drop.x + 4) / 16), Math.floor((drop.y + 4) / 16), out);
      cur.light = out.map((v) => Math.round(v));
    }
    cur.flushN1 = window.__flushLog.length;
    window.__frames.push(cur);
    if (window.__frames.length > 3000) window.__frames.shift();
    cur = null;
  };
  const origEmit = R.prototype.emitRainQuadBatch;
  R.prototype.emitRainQuadBatch = function (img, key, data, quads, replay) {
    const ret = origEmit.call(this, img, key, data, quads, replay);
    // 挂到【本帧】记录:drawRain 内 cur 未 push——回填最近一条 built 未知的
    const host = cur ?? window.__frames[window.__frames.length - 1];
    if (host) host.emit = { quads, ret };
    return ret;
  };
  const origBoltDraw = P.StormLightning.prototype.draw;
  P.StormLightning.prototype.draw = function (...a) {
    if (cur) cur.boltDraws++;
    return origBoltDraw.apply(this, a);
  };
  // flushAcc 逐次账 + 含雨批 flush 后 FBO 直读
  const origFlushAcc = EX.prototype.flushAcc;
  EX.prototype.flushAcc = function () {
    try {
      let n = 0, tierSeq = '', hasBatch = false, batchQ = 0;
      for (let p = this.head; p; p = p.next) {
        n++;
        tierSeq += p.batch ? (p.batch.rgba ? 'B' : 'R') : p.solid ? 'S' : p.tier === 1 ? 'A' : p.tier === 2 ? 'E' : p.tier === 3 ? 'M' : 'q';
        if (p.batch && !p.batch.rgba && !p.batch.region) { hasBatch = true; batchQ = p.batch.quads; }
        if (tierSeq.length > 400) break;
      }
      const s = this.stats;
      const bq0 = s.emitBatchQuads;
      const gl = glw();
      const fboOpen0 = gl ? gl.isAccumOpen('world') : null;
      origFlushAcc.call(this);
      const dQ = s.emitBatchQuads - bq0;
      const rec = { n, tierSeq: tierSeq.slice(0, 120), hasBatch, batchQ, dQ, fboOpen0 };
      // 含雨批 flush:readPixels 直读 FBO 天带(仅前 40 次全存,后续只存摘要)
      if (hasBatch && dQ > 0 && gl && gl.isAccumOpen('world') && gl.gl && !gl.unavailable) {
        try {
          const gll = gl.gl;
          const W = gl.canvas.width, H = gl.canvas.height;
          const rx = Math.floor(W * 0.25), ry = Math.floor(H * 0.15), rw = Math.min(320, Math.floor(W * 0.25)), rh = Math.min(120, Math.floor(H * 0.15));
          const px = new Uint8Array(rw * rh * 4);
          gll.readPixels(rx, ry, rw, rh, gll.RGBA, gll.UNSIGNED_BYTE, px);
          rec.fbo = { W, H, rx, ry, rw, rh, err: gll.getError() };
          if (window.__flushLog.length < 2000) rec.px = Array.from(px);
          else {
            // 摘要:雨色线命中数
            const u = [0.403, 0.507, 0.761]; let hits = 0;
            for (let p2 = 0; p2 < px.length; p2 += 4) {
              const dot = px[p2] * u[0] + px[p2 + 1] * u[1] + px[p2 + 2] * u[2];
              const d2 = px[p2] * px[p2] + px[p2 + 1] * px[p2 + 1] + px[p2 + 2] * px[p2 + 2] - dot * dot;
              if (d2 < 1764 && dot > 60 && dot < 292) hits++;
            }
            rec.fboHits = hits;
          }
        } catch (e) { rec.fboErr = String(e).slice(0, 80); }
      }
      window.__flushLog.push(rec);
      if (window.__flushLog.length > 2000) window.__flushLog.shift();
    } catch (e) {
      if (!window.__probeErr) window.__probeErr = String(e).slice(0, 300);
      origFlushAcc.call(this);
    }
  };
  // begin(clear) 重开侦破
  if (!GL.prototype.__rainProbeBegin) {
    const origBegin = GL.prototype.begin;
    GL.prototype.__rainProbeBegin = true;
    GL.prototype.begin = function (fbo, clear) {
      const wasOpen = this.isAccumOpen(fbo);
      if (fbo === 'world' && wasOpen) window.__flushLog.push({ suspiciousRebegin: true, clear, w: this.canvas.width, h: this.canvas.height });
      return origBegin.call(this, fbo, clear);
    };
  }
  // Game.frame 尾:终帧像素 + lightning
  const G = Object.getPrototypeOf(g);
  if (!G.__rainProbeFrame) {
    const origFrame = G.frame;
    G.__rainProbeFrame = true;
    G.frame = function (now) {
      let r0;
      try { r0 = origFrame.call(this, now); } catch (e) {
        if (!window.__probeErr) window.__probeErr = 'frame:' + String(e).slice(0, 300);
        throw e;
      }
      try {
      if (window.__cap) {
        const cv = this.renderer.canvas;
        const c2 = cv.getContext('2d');
        const W = cv.width, H = cv.height;
        const x0 = Math.floor(W * 0.25), y0 = Math.floor(H * 0.10);
        const rw = Math.floor(W * 0.5), rh = Math.floor(H * 0.3);
        const step = 3;
        const w = Math.floor(rw / step), h = Math.floor(rh / step);
        let img = null;
        try { img = c2.getImageData(x0, y0, rw, rh); } catch { img = null; }
        const small = img ? new Uint8Array(w * h * 4) : null;
        if (img) {
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const si = (y * step * rw + x * step) * 4, di = (y * w + x) * 4;
            small[di] = img.data[si]; small[di + 1] = img.data[si + 1];
            small[di + 2] = img.data[si + 2]; small[di + 3] = 255;
          }
        }
        const last = window.__frames[window.__frames.length - 1];
        window.__cap.push({
          w, h, px: small ? Array.from(small) : null,
          lightning: Math.round(this.world.weather.lightning * 1000) / 1000,
          drops: last?.drops ?? -1, built: last?.built ?? -1, emitQ: last?.emit?.quads ?? -1,
          light: last?.light ?? null, boltDraws: last?.boltDraws ?? 0,
        });
      }
      } catch (e) {
        if (!window.__probeErr) window.__probeErr = 'cap:' + String(e).slice(0, 300);
      }
      return r0;
    };
  }
  return { ok: true, hasAccGlw: !!glw() };
});
console.log('INST', JSON.stringify(inst));

const started = await page.evaluate(() => { window.__cap = []; return performance.now(); });
await new Promise((r) => setTimeout(r, 12000));
const data = await page.evaluate(() => {
  const d = { cap: window.__cap, frames: window.__frames, flush: window.__flushLog, probeErr: window.__probeErr ?? null };
  window.__cap = null; window.__frames = []; window.__flushLog = [];
  return JSON.parse(JSON.stringify(d));
});
console.log('probeErr:', data.probeErr);
{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv4', { recursive: true });
  fs.writeFileSync('/tmp/rainlv4/cap.json', JSON.stringify(data.cap));
  fs.writeFileSync('/tmp/rainlv4/frames.json', JSON.stringify(data.frames));
  fs.writeFileSync('/tmp/rainlv4/flush.json', JSON.stringify(data.flush));
  console.log(`cap=${data.cap.length} frames=${data.frames.length} flushes=${data.flush.length} → /tmp/rainlv4/`);
}
await browser.close();
console.log('DONE');
