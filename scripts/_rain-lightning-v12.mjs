// v12:desync 算子定位 —— 全执行器/窗口生命周期事件流 + 每事件 raw 变换采样:
//   attachAcc/attach/bridge/detach/bglEntWindowBegin/End/drawRain/flushAcc。
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
  const EX = (await import('/src/render/glshim/GLShimExecutor.ts')).GLShimExecutor;
  const g = window.__swGame;
  const r = g.renderer;
  window.__ev = [];
  window.__probeErr = null;
  let fn = 0;
  const log = (e) => { try { const o = { e, f: fn }; if (r.bglEntShim?.raw) { const t = r.bglEntShim.raw.getTransform(); o.rawT = [t.a, t.b, t.c, t.d, Math.round(t.e), Math.round(t.f)]; } const s = r.bglEntShim; if (s) o.m = [s.m.a, s.m.b, s.m.c, s.m.d, Math.round(s.m.e), Math.round(s.m.f)], o.acc = s.accMode; window.__ev.push(o); } catch { } if (window.__ev.length > 8000) window.__ev.shift(); };

  const origAA = EX.prototype.attachAcc;
  EX.prototype.attachAcc = function () { const ret = origAA.call(this); log('attachAcc:' + (ret ? 'ok' : 'fail')); return ret; };
  const origA = EX.prototype.attach;
  EX.prototype.attach = function (raw) { const ret = origA.call(this, raw); log('attach:' + (ret ? 'ok' : 'fail')); return ret; };
  const origB = EX.prototype.bridge;
  EX.prototype.bridge = function (raw) { log('bridge:pre'); const ret = origB.call(this, raw); log('bridge:post'); return ret; };
  const origD = EX.prototype.detach;
  EX.prototype.detach = function () { log('detach:pre'); const ret = origD.call(this); log('detach:post'); return ret; };
  const origFR = EX.prototype.frameReset;
  EX.prototype.frameReset = function () { log('frameReset'); return origFR.call(this); };
  const origFA = EX.prototype.accFail;
  EX.prototype.accFail = function (why) { log('accFail:' + why); return origFA.call(this, why); };
  const origDraw = WR.prototype.drawRain;
  WR.prototype.drawRain = function (rr, world) { log('drawRain:pre'); const ret = origDraw.call(this, rr, world); log('drawRain:post'); return ret; };
  // 窗口开/关(Renderer 原型——非预绑,可拦)
  const RP = Object.getPrototypeOf(r);
  if (!RP.__probeV12) {
    RP.__probeV12 = true;
    const oWB = RP.bglEntWindowBegin;
    RP.bglEntWindowBegin = function (tag) { log('winBegin:' + tag); return oWB.call(this, tag); };
    const oWE = RP.bglEntWindowEnd;
    RP.bglEntWindowEnd = function () { log('winEnd'); return oWE.call(this); };
    const oBW = RP.beginWorldLayer;
    RP.beginWorldLayer = function (vw, vh, wk) { log('beginWorldLayer'); return oBW.call(this, vw, vh, wk); };
    const oFA2 = RP.finishAccFrame;
    RP.finishAccFrame = function () { log('finishAccFrame:pre'); const ret = oFA2.call(this); log('finishAccFrame:post'); return ret; };
  }
  const G = Object.getPrototypeOf(g);
  if (!G.__probeV12) {
    G.__probeV12 = true;
    const origFrame = G.frame;
    G.frame = function (now) {
      fn++;
      const r0 = origFrame.call(this, now);
      return r0;
    };
  }
  return { ok: true };
});
console.log('INST', JSON.stringify(inst));
await new Promise((r) => setTimeout(r, 9000));
const data = await page.evaluate(() => { const d = { ev: window.__ev, err: window.__probeErr }; window.__ev = []; return JSON.parse(JSON.stringify(d)); });
console.log('probeErr:', data.err);
{
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/rainlv12-ev.json', JSON.stringify(data.ev));
  console.log(`ev=${data.ev.length} → /tmp/rainlv12-ev.json`);
}
await browser.close();
console.log('DONE');
