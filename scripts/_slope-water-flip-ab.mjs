// ★liqgl 水体·同页翻面对拍(2026-09-28;_liqgl-ab LA 范式,微光→水):
// 冻结相位(暂停+波场 dt=0+钟面),同帧 liqgl on/off 双臂渲染——跨页相位漂移消除。
// 判据:同帧 census(n/maxd/mean/bbox)+水体窗归因——批化支 vs CPU 支逐位差。
// 运行:SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_slope-water-flip-ab.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
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
await page.evaluate(() => {
  const g = window.__swGame;
  g.camera.x = window.__scene.X0 * 16 + 200; g.camera.y = window.__scene.G * 16 + 40;
});
// 拦 quadSprite(OFF 臂 shim 发射源矩形)
await page.evaluate(() => import('/src/render/GLSpriteLayer.ts').then((m) => {
  const proto = m.GLSpriteLayer.prototype;
  const orig = proto.quadSprite;
  window.__qs = [];
  proto.quadSprite = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
    if (window.__qsOn && e?.key?.startsWith('er:')) window.__qs.push({ key: e.key, sx, sy, sw, sh, dx, dy, dw, dh, a: opts?.alpha });
    return orig.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
  };
}));
// 拦 emitLiquidQuadBatch:记录 byte0(环内偏移)/pass/α 分布
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
    window.__imgDim = [img.width, img.height, img.constructor?.name];
    const alphas = [];
    for (let q = 0; q < Math.min(quads, 400); q++) alphas.push(data[q * 48 + 7]);
    const uniq = [...new Set(alphas.map((a) => +a.toFixed(3)))];
    window.__emits.push({ pass: window.__curPass, quads, byte0: data.byteOffset / 4, uniqA: uniq.slice(0, 6),
      uv0: [data[2] * 48, data[3] * 1360], uv1: [data[10] * 48, data[11] * 1360] });
    return origEmit.call(this, img, key, data, quads, replay);
  };
});
await page.evaluate(() => window.__drive(5));

const snap = () => page.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const lc = document.createElement('canvas');
  lc.width = c.width; lc.height = c.height;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  lx.drawImage(c, 0, 0);
  const d = lx.getImageData(0, 0, lc.width, lc.height).data;
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
  return { w: c.width, h: c.height, b64: btoa(bin) };
});

// ★相位钉死:pinGameTimeTicks(恒定 tick)→液体动画相位冻结→双渲染纯路径差
await page.evaluate(() => { window.__gt.pinGameTimeTicks(12345); window.__swGame.paused = true; });
await page.evaluate(() => window.__drive(3));
// 8 对:每对同 vnow 双渲染(on→snap, off→snap)
const pairs = [];
for (let k = 0; k < 8; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  const a = await page.evaluate(({ v0 }) => {
    window.__vl.liqglSetForTest(true);
    window.__vnow = v0;
    window.__drive(1);
    return v0;
  }, { v0 });
  const fa = await snap();
  await page.evaluate(({ v0 }) => {
    window.__vl.liqglSetForTest(false);
    window.__vnow = v0;
    window.__drive(1);
  }, { v0: a });
  const fb = await snap();
  pairs.push({ a: fa, b: fb });
}
// 对 1:ON 臂批源矩形 vs OFF 臂 shim 源矩形(同 dx 胞)
await page.evaluate(() => { window.__qsOn = true; window.__qs.length = 0; window.__emits.length = 0; window.__vl.liqglSetForTest(true); window.__drive(1); });
const emOn = await page.evaluate(() => window.__emits.splice(0, window.__emits.length));
await page.evaluate(() => { window.__vl.liqglSetForTest(false); window.__qsOn = true; window.__drive(1); });
const qsOff = await page.evaluate(() => { const q = window.__qs.splice(0, window.__qs.length); window.__qsOn = false; return q; });
console.log('ON 批 emission:', JSON.stringify(emOn.filter((e) => e.pass === 'bg').slice(0, 2)));
console.log('ON 批 bg 首 6 quad (dx,dy,u=sx,v=srcY):', JSON.stringify(emOn.filter((e) => e.pass === 'bg')[0]?.uv0) , JSON.stringify(emOn.filter((e) => e.pass === 'bg')[0]?.uv1));
const bgQuads = [];
{
  const e = emOn.find((x) => x.pass === 'bg');
  // 重读全 ring 不便——用 emits 里 uv0(首 quad)即可;这里改从 qsOff 对照 dx
}
const waterRegions = qsOff.filter((q) => q.key.startsWith('er:20:') && q.sh === 16);
console.log('OFF shim 水格 er:20 sh=16(前 10):', JSON.stringify(waterRegions.slice(0, 10)));
console.log('OFF er:20 源矩形去重:', JSON.stringify([...new Set(waterRegions.map((q) => q.key))].slice(0, 10)));
const mainWater = qsOff.filter((q) => q.sh === 16 && (q.a === 1 || q.a === 0.5) && q.key.startsWith('er:'));
console.log('OFF 主水体 quad 源键去重:', JSON.stringify([...new Set(mainWater.map((q) => q.key))].slice(0, 12)));
console.log('OFF 主水体首 3:', JSON.stringify(mainWater.slice(0, 3)));
const onEm = emOn.filter((e) => e.pass === 'bg');
console.log('ON 批键:', JSON.stringify(emOn.map((e) => e.pass + ':' + e.quads + ':' + e.uniqA)));
// 批纹理 TexEntry 维度 vs 源 img 维度(UV 分母一致性)
const dim = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const glw = r._accGlw;
  const e = glw.texs.get('liq:20');
  return { texEntry: e ? [e.w, e.h, e.key] : null, imgDim: window.__imgDim ?? null,
    sheetKeys: Array.from(glw.texs.keys()).filter((k) => k.startsWith('liq:')) };
});
console.log('批纹理维度:', JSON.stringify(dim));
const emitLog2 = await page.evaluate(() => window.__emits.splice(0, window.__emits.length));
// census 汇总
const rep = await page.evaluate((pairs) => {
  const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  let worst = { n: 0, maxd: 0, mean: 0, bbox: null };
  const rows = [];
  for (const p of pairs) {
    const P = dec(p.a.b64), Q = dec(p.b.b64);
    let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = p.a.w;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      if (dd > 0) {
        n++; sum += dd; if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    rows.push({ n, maxd, mean: n ? +(sum / n).toFixed(2) : 0, bbox: n ? [x0, y0, x1, y1] : null });
    if (n > worst.n) worst = rows[rows.length - 1];
  }
  return { rows, worst };
}, pairs);
console.log('对帧 census(on=批化 vs off=CPU):');
for (const r of rep.rows) console.log(`  n=${r.n} maxd=${r.maxd} mean=${r.mean} bbox=${JSON.stringify(r.bbox)}`);
console.log('worst:', JSON.stringify(rep.worst));
// 采样点对拍:水体 8×5 网格(世界坐标→设备),on/off 各取 RGB
const probe = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const cam = g.camera, dpr = window.devicePixelRatio, zoom = cam.zoom;
  const dev = (wx, wy) => [Math.round((wx - cam.x) * zoom * dpr + r.canvas.width / 2),
    Math.round((wy - cam.y) * zoom * dpr + r.canvas.height / 2)];
  const grab = () => {
    const c = r.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    return (x, y) => Array.from(lx.getImageData(x, y, 1, 1).data.slice(0, 3));
  };
  const { G, X0 } = window.__scene;
  const pts = [];
  for (let ty = G + 1; ty <= G + 3; ty++) for (let tx = X0 + 2; tx <= X0 + 17; tx += 2) pts.push(dev(tx * 16 + 8, ty * 16 + 8));
  const readWorld = () => {
    const glw = r._accGlw; const gl = glw.gl; const pipe = glw.pipe;
    const W = glw.canvas.width, H = glw.canvas.height;
    const f = pipe.fbo('world', W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
    const out = pts.map(([x, y]) => { const o = new Uint8Array(4); gl.readPixels(x, H - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o); return Array.from(o); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  };
  window.__vl.liqglSetForTest(true);
  window.__drive(1);
  const on = grab();
  const wOn = readWorld();
  window.__vl.liqglSetForTest(false);
  window.__drive(1);
  const off = grab();
  const wOff = readWorld();
  const rows = pts.map(([x, y], k) => ({ on: on(x, y), off: off(x, y), wOn: wOn[k], wOff: wOff[k] }));
  return rows;
});
console.log('采样对拍 (canvas on | off | worldFBO on | off):');
for (const p of probe) {
  console.log(`  on${p.on.join(',')} off${p.off.join(',')} | wOn${p.wOn.join(',')} wOff${p.wOff.join(',')} | Δa=${p.wOn[3] - p.wOff[3]}`);
}
console.log('errors:', errs.slice(0, 3));
process.exit(0);
