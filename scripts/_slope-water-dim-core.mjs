// ★liqgl 水色差·机制终核验(2026-09-28;flip-ab 姊妹刃):
//  ①两臂同 cell 源矩形逐格对拍(ON 批 UV×sheet 尺寸 vs OFF shim er: 区域)——
//    坐实「错位在发射器」还是「错位在纹理/采样层」;
//  ②liq: 键纹理内容 ground truth(FBO attach readPixels vs ImageBitmap 2D 读回)——
//    坐实「上传内容错位一个 TexEntry」或「上传正确、UV 采样错位」。
// 运行:SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_slope-water-dim-core.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await page.goto(ORIGIN + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
{ const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 180000) {
    ok = await page.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
await godMode(page, true);
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
  g.player.x = (X0 + 12) * 16; g.player.y = (G + 1) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = (G + 2) * 16;
  window.__scene = { G, X0, XE };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vl = m; }));
await page.evaluate(() => import('/src/core/GameTime.ts').then((m) => { window.__gt = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => {
  const ww = window.__wwMod.waterWaves;
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});
await page.evaluate(() => window.__drive(20));
await page.evaluate(() => { window.__gt.pinGameTimeTicks(12345); window.__swGame.paused = true; });
await page.evaluate(() => window.__drive(3));

// 拦 emitLiquidQuadBatch:记录 key/img 尺寸/逐 quad 源·目的矩形(发射时序内同步,ring 未被覆写)
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
    window.__liqImg = img;   // ground truth 读回用(同一 ImageBitmap 实例)
    const W = img.width, H = img.height;
    const qs = [];
    for (let q = 0; q < quads; q++) {
      const o = q * 48;
      qs.push({
        dx0: data[o], dy0: data[o + 1], dx1: data[o + 8], dy1: data[o + 9],
        sx: data[o + 2] * W, sy: data[o + 3] * H, sx1: data[o + 10] * W, sy1: data[o + 11] * H,
        a: data[o + 7],
      });
    }
    window.__emits.push({ pass: window.__curPass, key, imgW: W, imgH: H, imgCtor: img.constructor?.name, quads, qs });
    return origEmit.call(this, img, key, data, quads, replay);
  };
});
// 拦 quadSprite(OFF 臂 shim 源矩形)
await page.evaluate(() => import('/src/render/GLSpriteLayer.ts').then((m) => {
  const proto = m.GLSpriteLayer.prototype;
  const orig = proto.quadSprite;
  window.__qs = [];
  proto.quadSprite = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
    if (window.__qsOn && e?.key?.startsWith('er:')) window.__qs.push({ key: e.key, sx, sy, sw, sh, dx, dy, dw, dh, a: opts?.alpha });
    return orig.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
  };
}));
await page.evaluate(() => window.__drive(1));

// ---- ON 臂:批 emission 采集 ----
await page.evaluate(() => { window.__vl.liqglSetForTest(true); window.__emits.length = 0; window.__drive(1); });
const onData = await page.evaluate(() => {
  const em = window.__emits.splice(0, window.__emits.length);
  // 顺带读 liq: 键纹理 entry 维度
  const glw = window.__swGame.renderer._accGlw;
  const keys = Array.from(glw.texs.keys()).filter((k) => k.startsWith('liq:'));
  const ents = keys.map((k) => { const e = glw.texs.get(k); return { key: k, w: e.w, h: e.h, mipped: e.mipped }; });
  return { em, ents };
});
console.log('ON 批键/纹理 entry:', JSON.stringify(onData.ents));
const liqKey = onData.ents[0]?.key ?? 'liq:?';
const sheetW = onData.em[0]?.imgW, sheetH = onData.em[0]?.imgH;
console.log('ON emission 概览:', JSON.stringify(onData.em.map((e) => ({ pass: e.pass, key: e.key, quads: e.quads, img: e.imgW + 'x' + e.imgH + ':' + e.imgCtor }))));

// ---- OFF 臂:shim er: 区域采集 ----
await page.evaluate(() => { window.__vl.liqglSetForTest(false); window.__qsOn = true; window.__qs.length = 0; window.__drive(1); });
const offQs = await page.evaluate(() => { const q = window.__qs.splice(0, window.__qs.length); window.__qsOn = false; return q; });
const liqTexId = liqKey.split(':')[1];
const offWater = offQs.filter((q) => q.key.startsWith('er:' + liqTexId + ':'));
console.log('OFF er:<sheet> quad 数:', offWater.length, '(全部 er:', offQs.length, ')');

// ---- 逐 cell 匹配:同 dst(±0.5px)同 α → 源矩形对照 ----
const match = await page.evaluate(({ onEm, offQs }) => {
  const off = offQs.map((q) => {
    const m = q.key.match(/^er:\d+:\d+:(-?\d+),(-?\d+),(-?\d+),(-?\d+)$/);
    return { sx: +m[1], sy: +m[2], sw: +m[3], sh: +m[4], dx: q.dx, dy: q.dy, dw: q.dw, dh: q.dh, a: q.a };
  });
  const rows = [];
  const usedOff = new Uint8Array(off.length);
  let matched = 0, srcMismatch = 0, unmatched = 0;
  const examples = [];
  for (const run of onEm) {
    for (const q of run.qs) {
      const dw = q.dx1 - q.dx0, dh = q.dy1 - q.dy0;
      // 找同 dst 同 α 的 OFF quad(发射序就近;dst 为整数设备矩形)
      let hit = -1;
      for (let k = 0; k < off.length; k++) {
        if (usedOff[k]) continue;
        const o = off[k];
        if (Math.abs(o.dx - q.dx0) <= 0.5 && Math.abs(o.dy - q.dy0) <= 0.5
          && Math.abs(o.dw - dw) <= 0.5 && Math.abs(o.dh - dh) <= 0.5
          && Math.abs(o.a - q.a) <= 0.005) { hit = k; break; }
      }
      if (hit < 0) { unmatched++; rows.push({ cell: [q.dx0, q.dy0, dw, dh], a: q.a, onSrc: [q.sx, q.sy, q.sx1, q.sy1], offSrc: null }); continue; }
      usedOff[hit] = 1; matched++;
      const o = off[hit];
      const ok = Math.abs(o.sx - q.sx) <= 0.5 && Math.abs(o.sy - q.sy) <= 0.5
        && Math.abs(o.sw - (q.sx1 - q.sx)) <= 0.5 && Math.abs(o.sh - (q.sy1 - q.sy)) <= 0.5;
      if (!ok) {
        srcMismatch++;
        if (examples.length < 12) examples.push({
          dst: [q.dx0, q.dy0, Math.round(dw), Math.round(dh)], a: +q.a.toFixed(3),
          onSrc: [q.sx, q.sy, +(q.sx1 - q.sx).toFixed(2), +(q.sy1 - q.sy).toFixed(2)],
          offSrc: [o.sx, o.sy, o.sw, o.sh],
          dv: +(q.sy - o.sy).toFixed(2), du: +(q.sx - o.sx).toFixed(2),
        });
      }
    }
  }
  return { matched, srcMismatch, unmatched, examples, offRest: off.length - usedOff.reduce((s, v) => s + v, 0) };
}, { onEm: onData.em, offQs: offWater });
console.log('逐 cell 源矩形对拍:', JSON.stringify({ matched: match.matched, srcMismatch: match.srcMismatch, unmatched: match.unmatched, offRest: match.offRest }));
for (const ex of match.examples) console.log('  mismatch dst=' + JSON.stringify(ex.dst) + ' a=' + ex.a + ' onSrc=' + JSON.stringify(ex.onSrc) + ' offSrc=' + JSON.stringify(ex.offSrc) + ' du=' + ex.du + ' dv=' + ex.dv);

// ---- 纹理内容 ground truth:liq: 键 FBO readPixels vs ImageBitmap 2D 读回 ----
const texTruth = await page.evaluate(async ({ key, W, H }) => {
  const glw = window.__swGame.renderer._accGlw;
  const gl = glw.gl;
  const e = glw.texs.get(key);
  if (!e) return { err: 'no entry' };
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.tex, 0);
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  const rows = 80, y0 = 560;   // band 7 尾 + band 8 头(跨带界 640)
  const buf = new Uint8Array(W * rows * 4);
  gl.readPixels(0, y0, W, rows, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(f);
  // sheet 2D 读回(取发射时捕获的同一 img 实例——经 emit imgCtor 已知 ImageBitmap)
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  // 从 emission 拿 img:重拦截一次 emit 记 img 引用(用全局槽)
  const img = window.__liqImg;
  if (!img) return { err: 'no img ref' };
  cx.drawImage(img, 0, 0);
  const ref = cx.getImageData(0, y0, W, rows).data;
  let diff = 0, first = null, alphaRows = new Map();
  for (let i = 0; i < buf.length; i += 4) {
    const y = y0 + Math.floor((i / 4) / W);
    if (ref[i + 3] !== 255) alphaRows.set(ref[i + 3], (alphaRows.get(ref[i + 3]) ?? 0) + 1);
    if (buf[i] !== ref[i] || buf[i + 1] !== ref[i + 1] || buf[i + 2] !== ref[i + 2] || buf[i + 3] !== ref[i + 3]) {
      diff++;
      if (!first) first = { texel: [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]], ref: [ref[i], ref[i + 1], ref[i + 2], ref[i + 3]] };
    }
  }
  // 关键行采样(band 8 row 0/1 与 band 7 row 79 对比 GL 采样的 floor(v×H))
  const px = (arr, x, y) => { const o = ((y - y0) * W + x) * 4; return [arr[o], arr[o + 1], arr[o + 2], arr[o + 3]]; };
  return { fboStatus: st, entry: [e.w, e.h], diff, first,
    glRow639: px(buf, 0, 639), glRow640: px(buf, 0, 640), glRow641: px(buf, 0, 641),
    refRow639: px(ref, 0, 639), refRow640: px(ref, 0, 640), refRow641: px(ref, 0, 641),
    refRow640c16: px(ref, 16, 640), refRow641c16: px(ref, 16, 641) };
}, { key: liqKey, W: sheetW, H: sheetH });
console.log('liq 纹理 ground truth:', JSON.stringify(texTruth));

// ---- UV→texel 采样数学核验:ON 首 quad 的 uv 对【entry 实际尺寸】推 NEAREST texel ----
await page.evaluate(() => { window.__vl.liqglSetForTest(true); window.__emits.length = 0; window.__drive(1); });
const uvCheck = await page.evaluate(() => {
  const em = window.__emits.splice(0, window.__emits.length);
  const e = window.__swGame.renderer._accGlw.texs.get(em[0]?.key);
  const W = e ? e.w : em[0]?.imgW, H = e ? e.h : em[0]?.imgH;
  const q0 = em[0]?.qs[0];
  if (!q0) return { err: 'no emit' };
  const f = (u) => Math.floor(u * W);
  const g = (v) => Math.floor(v * H);
  return { entryW: W, entryH: H, quad0: { rawU0: q0.sx, rawV0: q0.sy, rawU1: q0.sx1, rawV1: q0.sy1 },
    texelU0: f(q0.sx), texelV0: g(q0.sy), texelU1: f(q0.sx1), texelV1: g(q0.sy1) };
});
console.log('UV→texel 数学(NEAREST floor):', JSON.stringify(uvCheck));
console.log('errors:', errs.slice(0, 3));
process.exit(0);
