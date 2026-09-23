// ★A2 光照×扭曲 FBO 链像素对拍（2026-09-23;_bj77 本命范式——页内运行时翻面）。
// wfbo=运行时可翻旗（Renderer.wfboSetForTest）:A(旧链)→B(FBO 链)→C(翻回)三态捕获,
// 判据:B==A 逐字节(md5+diff==0)+C==A(翻回恢复=翻面无残留)+各自连续帧恒等(确定性哨兵)。
// 场景:地表出生点正午(freezeClock+sky dt=0+持物清空确定性套件)。
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs --timeout=420000 scripts/_a2-pixel-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const L = ledger();
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
L.chk('createGame', gen.ok, gen.why ?? '');

// 确定性套件（_bj77 同源）+ 捕获面
await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  // ★天气钉死（2026-09-23 漂移定位:全宽横带=雨层）——停 update(防回填)+云量归零(drawRain 早退门)+清三池
  try {
    const w = g.world.weather;
    if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; }
    // ★实例级补丁（weather 对象上的 update 不是真挂点;真正每 tick 调的是 renderer.weatherFx.update）
    if (fx) { fx.update = () => {}; }
    const fx = g.renderer.weatherFx;
    if (fx) {
      (fx.pool || []).forEach((d) => { d.active = false; });
      (fx.snow || []).forEach((d) => { d.active = false; });
      (fx.sand || []).forEach((d) => { d.active = false; });
    }
  } catch (e) { console.warn('[probe] 天气钉死失败', e); }
  const lc = document.createElement('canvas');
  const lctx = lc.getContext('2d', { willReadFrequently: true });
  window.__snapB64 = () => {
    const c = g.renderer.canvas;
    const CROP = 720;   // 深裁到地表区（天空/天气带整层排除——A2 刀面=世界层合成）   // ★裁掉 y<350 天气带（雨/云随机面;2026-09-23 漂移定位 bbox y107-331）——下半屏世界主体全判
    const h2 = c.height - CROP;
    if (lc.width !== c.width || lc.height !== h2) { lc.width = c.width; lc.height = h2; }
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.drawImage(c, 0, CROP, c.width, h2, 0, 0, c.width, h2);
    const d = lctx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return btoa(bin);
  };
  window.__wfboSet = (v) => window.__swGame.renderer.constructor.wfboSetForTest(v);
});
await freezeClock(page, { tod: 0.5 });   // 正午
await pump(page, 40);                     // 收敛窗

async function capture(label) {
  await pump(page, 6);
  const b1 = await page.evaluate(() => window.__snapB64());
  await pump(page, 1);
  const b2 = await page.evaluate(() => window.__snapB64());
  const m1 = md5(b1), m2 = md5(b2);
  if (m1 !== m2) {
    const loc = await page.evaluate(({ x, y }) => {
      const dec = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
      const P = dec(x), Q = dec(y);
      let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, maxd = 0;
      for (let i = 0; i < P.length; i++) { const dd = Math.abs(P[i] - Q[i]); if (dd > 0) { n++; if (dd > maxd) maxd = dd; const px = (i >> 2) % 2000, py = (i >> 2) / 2000 | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; } }
      return { n, maxd, bbox: [x0, y0, x1, y1] };
    }, { x: b1, y: b2 });
    console.log(`[${label}] 漂移定位: n=${loc.n} maxΔ=${loc.maxd} bbox=${JSON.stringify(loc.bbox)}`);
  }
  L.chk(`[${label}] 连续帧确定性`, m1 === m2, m1 === m2 ? '' : '随机面在场');
  const path = await page.evaluate(() => window.__swGame.renderer.composePathUsed);
  return { m1, b64: b1, path };
}

await page.evaluate(() => window.__wfboSet(false));
const A = await capture('A 旧链');
await page.evaluate(() => window.__wfboSet(true));
const B = await capture('B FBO链');
await page.evaluate(() => window.__wfboSet(false));
const C = await capture('C 翻回');
// ★A3 光照 GPU 重建翻面（D=wfbo+lrecon,E=lrecon 翻回,F=全回）
await page.evaluate(() => { window.__lreconSet = (v) => window.__swGame.renderer.constructor.lreconSetForTest(v); });
await page.evaluate(() => { window.__wfboSet(true); window.__lreconSet(true); });
const dcond = await page.evaluate(() => { const R = window.__swGame.renderer.constructor; const g = window.__swGame.renderer; return { wfbo: R.wfbo, lrecon: R.lrecon, cpu: g.isCpuRender(), wc: !!g.worldCanvas, fail: wc0() }; function wc0() { try { return (window.__swGame.renderer).worldCompose?.lastFail ?? 'n/a'; } catch { return 'err'; } } });
console.log('D cond:', JSON.stringify(dcond));
const D = await capture('D FBO+GPU光照');
await page.evaluate(() => window.__lreconSet(false));
const E = await capture('E lrecon翻回');
await page.evaluate(() => window.__wfboSet(false));
const F = await capture('F 全回');

console.log(`A=${A.m1.slice(0, 10)} B=${B.m1.slice(0, 10)} C=${C.m1.slice(0, 10)}`);
L.chk('[land] B==A 逐字节（FBO 链等价）', A.m1 === B.m1, `A=${A.m1.slice(0, 8)} B=${B.m1.slice(0, 8)}`);
L.chk('[land] C==A 翻回恢复（无残留）', A.m1 === C.m1, `C=${C.m1.slice(0, 8)}`);

if (A.m1 !== B.m1) {
  const d = await page.evaluate(({ x, y }) => {
    const dec = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
    const P = dec(x), Q = dec(y);
    let n = 0, maxd = 0;
    for (let i = 0; i < P.length; i++) { const dd = Math.abs(P[i] - Q[i]); if (dd > 0) { n++; if (dd > maxd) maxd = dd; } }
    return { n, maxd };
  }, { x: A.b64, y: B.b64 });
  console.log(`diff=${d.n} maxΔ=${d.maxd}`);
  L.chk('[land] diff 分级（0=字节等价;≤1-2LSB 备案口径）', d.n === 0, `diff=${d.n} maxΔ=${d.maxd}`);
}
console.log(`D=${D.m1.slice(0, 10)} E=${E.m1.slice(0, 10)} F=${F.m1.slice(0, 10)}`);
L.chk('[land] D 态实走 recon 路径', D.path === 'lrecon', '实际=' + D.path);
L.chk('[land] D==B（GPU 光照重建 ≡ lightCanvas 路径）', D.m1 === B.m1, `D=${D.m1.slice(0, 8)} B=${B.m1.slice(0, 8)}`);
L.chk('[land] E==B（lrecon 翻回无残留）', E.m1 === B.m1, `E=${E.m1.slice(0, 8)}`);
L.chk('[land] F==A（全回恢复）', F.m1 === A.m1, `F=${F.m1.slice(0, 8)}`);
await browser.close();
console.log(L.ok ? 'ALL PASS' : 'HAS FAIL');
process.exitCode = L.ok ? 0 : 1;
