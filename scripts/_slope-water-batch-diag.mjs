// ★liqgl 水体批发射诊断(2026-09-28;_slope-water-layer-ab 复现场景收窄):
// 拦 emitLiquidQuadBatch 逐次发射,记录 pass 归属(bg/fg)/quad 数/α 分布/前 2 quad
// 全顶点——定谳 bg 批是否以 α=0.5 数据/被环覆写/缺发。
// 运行:SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_slope-water-batch-diag.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto(ORIGIN + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
{ const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 180000) {
    ok = await page.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ok) throw new Error('bridge-timeout');
}
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
if (!gen?.ok) throw new Error('createGame fail: ' + (gen?.why ?? '?'));
await godMode(page, true);

// 场景(与 AB 探针同构:出生点水池+slope2 阶梯+半砖)
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const JG = window.__swTiles?.['v_60_jungle_grass_block'] ?? 0;
  const PX = Math.floor(g.player.cx / 16);
  const G = Math.floor(g.player.y / 16) + 3, XE = PX + 24, X0 = XE - 26;
  for (let x = X0 - 6; x <= XE + 10; x++) for (let y = G - 12; y <= G + 8; y++) {
    st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); st.setHalfBrick(x, y, false); st.setSlope(x, y, 0);
  }
  for (let x = XE; x <= XE + 8; x++) for (let y = G; y <= G + 6; y++) st.setTile(x, y, JG);
  st.setTile(XE, G, JG); st.setSlope(XE, G, 2);
  st.setTile(XE - 1, G + 1, JG); st.setSlope(XE - 1, G + 1, 2);
  st.setTile(XE - 3, G + 2, JG); st.setSlope(XE - 3, G + 2, 2);
  st.setTile(XE - 4, G + 3, JG); st.setSlope(XE - 4, G + 3, 2);
  st.setTile(XE - 1, G + 2, JG); st.setTile(XE - 1, G + 3, JG);
  st.setTile(XE - 2, G + 3, JG); st.setTile(XE - 2, G + 4, JG); st.setTile(XE - 1, G + 4, JG);
  st.setTile(XE - 3, G + 4, JG); st.setTile(XE - 2, G + 5, JG); st.setTile(XE - 3, G + 5, JG);
  for (let x = X0; x <= XE - 1; x++) {
    for (let y = G + 1; y <= G + 4; y++) if (!st.flags[st.idx(x, y)]) st.setLiquid(x, y, 255, 1);
    st.setLiquid(x, G, 60, 1);
  }
  st.setTile(X0 + 8, G + 4, JG); st.setHalfBrick(X0 + 8, G + 4, true);
  for (let x = X0; x <= XE - 5; x++) st.setTile(x, G + 5, JG);
  g.camera.x = (XE - 2) * 16; g.camera.y = G * 16;
  window.__scene = { G, X0, XE };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; window.__frameNo = (window.__frameNo ?? 0) + 1; g.frame(window.__vnow); } return window.__vnow; };
});
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vl = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => {
  const ww = window.__wwMod.waterWaves;
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});
await page.evaluate(() => window.__drive(10));
await page.evaluate(() => {
  const g = window.__swGame;
  g.camera.x = (window.__scene.XE - 2) * 16; g.camera.y = window.__scene.G * 16;
});

// 拦 emitLiquidQuadBatch(逐次发射记录:pass 归属=drawLiquids isBackground 拦截同拍)
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__emits = [];
  window.__curPass = null;
  const proto = Object.getPrototypeOf(r);
  const origDL = proto.drawLiquids;
  r.drawLiquids = function (...a) {
    window.__curPass = a[5] === true ? 'bg' : 'fg';
    const res = origDL.apply(this, a);
    window.__curPass = null;
    return res;
  };
  const origEmit = proto.emitLiquidQuadBatch;
  r.emitLiquidQuadBatch = function (img, key, data, quads, replay) {
    // α 分布(data[o+7],stride 8) + 前 2 quad 顶点
    const alphas = [];
    for (let q = 0; q < quads; q++) alphas.push(data[q * 48 + 7]);
    const uniq = [...new Set(alphas.map((a) => +a.toFixed(4)))];
    window.__emits.push({
      pass: window.__curPass, quads,
      byteQ0: data.byteOffset / 4,            // 环内起始 float 位——fg 段应为 bg 段尾
      frame: window.__frameNo ?? 0,
      aMin: Math.min(...alphas), aMax: Math.max(...alphas), uniqA: uniq.slice(0, 6),
      q0: Array.from(data.slice(0, 16)),
      qLast: Array.from(data.slice((quads - 1) * 48, (quads - 1) * 48 + 16)),
    });
    return origEmit.call(this, img, key, data, quads, replay);
  };
});

await page.evaluate(() => { window.__frameNo = 0; });
// 拦 quadBatchRgba(渲染管线的所有批量 quad 绘制——世界批+gate 镜像)
await page.evaluate(() => import('/src/render/GLSpriteLayer.ts').then((m) => {
  const proto = m.GLSpriteLayer.prototype;
  const origBegin = proto.begin;
  window.__begins = [];
  proto.begin = function (fboName = 'clouds', clear = true) {
    window.__begins.push({ f: window.__frameNo ?? -1, name: fboName, clear });
    return origBegin.call(this, fboName, clear);
  };
  const origQBR = proto.quadBatchRgba;
  window.__qbr = [];
  proto.quadBatchRgba = function (e, data, quads) {
    let fbo = '?';
    try { fbo = this.pipeFbo?.name ?? 'none'; } catch {}
    const gl = this.gl;
    let fboBound = null;
    try { fboBound = !!gl && gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null; } catch {}
    const alphas = [];
    for (let q = 0; q < Math.min(quads, 200); q++) alphas.push(data[q * 8 + 7]);
    const uniq = [...new Set(alphas.map((a) => +a.toFixed(3)))];
    window.__qbr.push({
      key: e?.key ?? '?', quads, byteQ0: data.byteOffset / 4,
      fbo, v0: [data[2], data[3]], uniqA: uniq.slice(0, 8),
    });
    return origQBR.call(this, e, data, quads);
  };
}));
await page.evaluate(() => import('/src/render/GLSpriteLayer.ts').then((m) => {
  const proto = m.GLSpriteLayer.prototype;
  const origEA = proto.endAccumulate;
  window.__fboReads = [];
  proto.endAccumulate = function () {
    const f = origEA.call(this);
    try {
      // readPixel 读当前绑定 FBO(=world);三采样点:主水体/阶梯列/天空
      const pts = [[320, 430], [680, 400], [200, 100]];
      const reads = pts.map(([x, y]) => {
        const p = this.readPixel(x, y);
        return p ? Array.from(p) : null;
      });
      window.__fboReads.push({ f: window.__frameNo ?? -1, reads });
    } catch (e) { window.__fboReads.push({ err: String(e).slice(0, 80) }); }
    return f;
  };
}));
await page.evaluate(() => { window.__frameNo = 0; });
await page.evaluate(() => window.__drive(2));
const qbr = await page.evaluate(() => window.__qbr);
const begins = await page.evaluate(() => window.__begins);
console.log('quadBatchRgba calls per 2 frames:', qbr.length);
for (const q of qbr) {
  console.log(`key=${q.key} quads=${q.quads} byte0=${q.byteQ0} fbo=${q.fbo} v0=(${q.v0[0]},${q.v0[1]}) α=${JSON.stringify(q.uniqA)}`);
}
console.log('begin sequence:', begins.map((b) => `${b.f}:${b.name}${b.clear ? '!clear' : ''}`).join(' '));
const fboReads = await page.evaluate(() => window.__fboReads);
for (const r of fboReads.slice(0, 2)) {
  console.log('worldFBO readback [water,(680,400)slope,(200,100)sky]:', JSON.stringify(r));
}
await page.evaluate(() => window.__drive(4));
const out = await page.evaluate(() => window.__emits);
console.log('emissions per 4 frames:', out.length);
for (const e of out) {
  console.log(`f${e.frame} pass=${e.pass} quads=${e.quads} byte0=${e.byteQ0} α∈[${e.aMin},${e.aMax}] uniq=${JSON.stringify(e.uniqA)}`);
  console.log(`   q0: ${e.q0.map((v) => +v.toFixed(2)).join(',')}`);
  console.log(`   qL: ${e.qLast.map((v) => +v.toFixed(2)).join(',')}`);
}
console.log('pageErrors:', errs.slice(0, 3));
process.exit(0);
