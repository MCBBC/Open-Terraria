// ★浸没透明案 定位探针 2:rasterizeDrawImage 逐调用入参/出口/分支面
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.world && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 2000));

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = 16;
  const px = Math.floor((g.player.x + g.player.w / 2) / T);
  let surf = -1;
  for (let y = 10; y < 500; y++) { const i = st.idx(px, y); if ((st.flags[i] & 1) && st.type[i]) { surf = y; break; } }
  for (let x = px - 4; x <= px + 4; x++) for (let y = surf; y < surf + 7; y++) {
    const i = st.idx(x, y);
    st.flags[i] = 0; st.type[i] = 0; st.half[i] = 0; st.slope[i] = 0;
    st.liquid[i] = 255; st.liquidType[i] = 1;
  }
  g.player.x = (px + 0.5) * T - g.player.w / 2;
  g.player.y = (surf + 1) * T + 40 - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  window.__px = px; window.__surf = surf;
});
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const shim = g.renderer.bglEntShim;
  const log = { calls: [], flushAcc: 0, accFail: [], replay2D: 0, pushCount: 0, headSamples: [] };
  if (!shim) return { noShim: true };
  const orR = shim.rasterizeDrawImage.bind(shim);
  shim.rasterizeDrawImage = function (img, sx, sy, sw, sh, geo) {
    const before = { acc: this.accMode, clip: this.clipped, gco: this.gco, filter: String(this.filterV).slice(0, 20), m: [this.m.a, this.m.b, this.m.c, this.m.d, Math.round(this.m.e), Math.round(this.m.f)] };
    const r = orR(img, sx, sy, sw, sh, geo);
    if (log.calls.length < 8) log.calls.push({ ...before, ret: r, iw: img.width, ih: img.height, geo: geo ? { dx: Math.round(geo.dx), dy: Math.round(geo.dy), dw: Math.round(geo.dw), dh: Math.round(geo.dh), rot: +geo.rot.toFixed(2) } : null });
    return r;
  };
  const orP = shim.push.bind(shim);
  shim.push = function (...a) { log.pushCount++; return orP(...a); };
  const orFA = shim.flushAcc.bind(shim);
  shim.flushAcc = function () { log.flushAcc++; log.headSamples.push({ n: (() => { let c = 0; for (let p = this.head; p && c < 9999; p = p.next) c++; return c; })() }); return orFA(); };
  const orAF = shim.accFail.bind(shim);
  shim.accFail = function (why) { log.accFail.push(why); return orAF(why); };
  const orR2 = shim.replay2D.bind(shim);
  shim.replay2D = function () { log.replay2D++; return orR2(); };
  return new Promise((resolve) => setTimeout(() => {
    const stats = g.renderer.bglShimStats();
    resolve({ log, stats, headUw: g.player.headUnderwater });
  }, 800));
});
console.log('INTROSPECT=' + JSON.stringify(out).slice(0, 4000));
await browser.close();
