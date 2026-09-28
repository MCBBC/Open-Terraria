// v11:镜像 vs raw 变换失同步追踪 —— drawRain 时直读 shim.m(字段)与
//   shim.raw.getTransform()(真 ctx,安全);实例 bound 表覆盖计数
//   translate/scale/setTransform/save/restore(原型补丁拦不到 buildBound 预绑)。
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
  window.__probeErr = null;
  const shim = () => r.bglEntShim;

  // attach 后覆盖实例 bound 计数器(每帧在帧头重置)
  const origAttach = EX.prototype.attach;
  EX.prototype.attach = function (raw) {
    const ret = origAttach.call(this, raw);
    if (ret && !this.__probePatched) {
      this.__probePatched = true;
      const self = this;
      const wrap = (name) => {
        const orig = self.bound[name];
        self.bound[name] = function (...a) {
          const tl = self.__tl;
          if (tl) {
            tl[name] = (tl[name] ?? 0) + 1;
            if (name === 'translate' && (Math.abs(a[0]) > 500 || Math.abs(a[1]) > 500)) tl.bigT = [Math.round(a[0]), Math.round(a[1])];
            if (name === 'setTransform') tl.lastST = a.slice(0, 6).map((v) => Math.round(Number(v) || 0));
          }
          return orig.apply(self, a);
        };
      };
      for (const n of ['translate', 'scale', 'setTransform', 'save', 'restore']) wrap(n);
    }
    if (ret) {
      const f = window.__frames[window.__frames.length - 1];
      if (f) f.attachM = [this.m.a, this.m.b, this.m.c, this.m.d, Math.round(this.m.e), Math.round(this.m.f)];
      this.__tl = {};
    }
    return ret;
  };
  const origAttachAcc = EX.prototype.attachAcc;
  EX.prototype.attachAcc = function () {
    const ret = origAttachAcc.call(this);
    if (ret) {
      const f = window.__frames[window.__frames.length - 1];
      if (f) f.accM = [this.m.a, this.m.b, this.m.c, this.m.d, Math.round(this.m.e), Math.round(this.m.f)];
      this.__tl = {};
    }
    return ret;
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
      if (s?.raw) {
        const t = s.raw.getTransform();   // 真 ctx,安全
        f.rawT = [t.a, t.b, t.c, t.d, Math.round(t.e), Math.round(t.f)];
      } else f.rawT = null;
      f.tl = s?.__tl ?? null;
    } catch (e) { if (!window.__probeErr) window.__probeErr = 'draw:' + String(e).slice(0, 160); }
  };
  const G = Object.getPrototypeOf(g);
  if (!G.__probeV11) {
    G.__probeV11 = true;
    const origFrame = G.frame;
    G.frame = function (now) {
      window.__frames.push({});
      if (window.__frames.length > 4000) window.__frames.shift();
      const r0 = origFrame.call(this, now);
      try {
        const f = window.__frames[window.__frames.length - 1];
        f.L = Math.round(this.world.weather.lightning * 1000) / 1000;
        const rr = this.renderer;
        const cap = WRm.drawRainBatchCaptureForTest();
        if (cap.quads > 0) {
          const D = cap.data;
          let x0 = Infinity, x1 = -Infinity;
          for (let q = 0; q < cap.quads; q++) {
            const o = q * 42;
            for (const off of [0, 7, 14, 35]) {
              const px = D[o + off];
              if (Number.isFinite(px)) { if (px < x0) x0 = px; if (px > x1) x1 = px; }
            }
          }
          f.form = x0 > 5000 ? 'WORLD' : 'DEVICE';
        }
      } catch (e) { if (!window.__probeErr) window.__probeErr = 'tail:' + String(e).slice(0, 160); }
      return r0;
    };
  }
  return { ok: true };
});
console.log('INST', JSON.stringify(inst));
await new Promise((r) => setTimeout(r, 12000));
const data = await page.evaluate(() => { const d = { frames: window.__frames, err: window.__probeErr }; window.__frames = []; return JSON.parse(JSON.stringify(d)); });
console.log('probeErr:', data.err);
{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv11', { recursive: true });
  fs.writeFileSync('/tmp/rainlv11/frames.json', JSON.stringify(data.frames));
  console.log(`frames=${data.frames.length}`);
}
await browser.close();

// 分析
const frames = data.frames;
const summary = {};
for (const f of frames) {
  const desync = f.mirror && f.rawT && (Math.abs(f.mirror[4] - f.rawT[4]) > 2 || Math.abs(f.mirror[5] - f.rawT[5]) > 2);
  const k = `acc=${f.accMode} form=${f.form ?? '-'} desync=${desync ? 'YES' : 'no'}`;
  summary[k] = (summary[k] || 0) + 1;
}
console.log(JSON.stringify(summary, null, 1));
let shown = 0;
for (const f of frames) {
  const desync = f.mirror && f.rawT && (Math.abs(f.mirror[4] - f.rawT[4]) > 2 || Math.abs(f.mirror[5] - f.rawT[5]) > 2);
  if (desync && shown < 4) {
    shown++;
    console.log('DESYNC:', JSON.stringify({ L: f.L, acc: f.accMode, form: f.form, mirror: f.mirror, rawT: f.rawT, attachM: f.attachM, accM: f.accM, tl: f.tl, built: f.built }));
  }
}
