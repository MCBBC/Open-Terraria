// ★C13b 液体 op-batch 像素对拍（2026-09-30;_liqpolish-ab 页内翻旗范式同构）。
// 场景=地表湖+坡面岸（slope1 左岸/slope2 右岸=增强+斜面带+III256 亮线触发面）+
// 半砖行+墙面 α 档（21→0.9/普通→0.6）——覆盖本刀三形态全部。
// 判据：
//   LA  A≡B census 有界（A=c13b 关=逐 op shim 原链;B=批化。GL quad vs shim quad
//       同纹理同 NEAREST,差=设备矩形 f32 舍入边域;登记域见 chk 注）
//   LB  B 臂批真在走（emitBatchQuads↑/fallback=0/replays=0/accFailLedger 空）
//   LC  逐 op 计数差（B 臂 drawLiquids/实心层 shim draws 显著下降）
//   LE  帧耗对照（B ≤ A×1.02）
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=600000 scripts/_c13b-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260930 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const surf = Math.floor(g.world.groundLevel);
  const px = Math.floor(g.player.cx / 16);
  const DIRT = window.__swTiles?.['dirt'] ?? 1;
  const x0 = px - 60, x1 = px + 60, ry = surf + 1, depth = 8;
  for (let x = x0 - 10; x <= x1 + 10; x++) {
    for (let y = ry - 8; y <= ry + depth + 8; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); if (st.setWall) st.setWall(x, y, 0); }
  }
  // 盆:底+两侧壁
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = ry + depth; y <= ry + depth + 2; y++) st.setTile(x, y, DIRT);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  // 水
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 1);
  // 坡面岸块:左岸 slope1（水在右）×3、右岸 slope2（水在左）×3 → 增强+斜面带+III256 亮线
  for (let i = 0; i < 3; i++) { st.setTile(x0 - 1, ry + i * 3, DIRT); st.setSlope(x0 - 1, ry + i * 3, 1); }
  for (let i = 0; i < 3; i++) { st.setTile(x1 + 1, ry + 1 + i * 3, DIRT); st.setSlope(x1 + 1, ry + 1 + i * 3, 2); }
  // 池底坡面块（上方水 → 增强全格支+实心层斜面带）
  for (let i = 0; i < 6; i++) { const bx = x0 + 6 + i * 12; st.setTile(bx, ry + depth, DIRT); st.setSlope(bx, ry + depth, 1 + (i % 2)); }
  // 半砖行（右岸台上,水线视觉带+足迹面）
  for (let x = x1 + 3; x <= x1 + 14; x++) { st.setTile(x, ry + 4, DIRT); st.setHalfBrick(x, ry + 4, true); }
  for (let x = x1 + 3; x <= x1 + 14; x++) st.setLiquid(x, ry + 3, 200, 1);
  // 墙面 α 档（墙 21→0.9 / 普通墙→0.6）
  for (let x = x0 + 4; x <= x0 + 20; x++) if (st.setWall) st.setWall(x, ry + depth, 21);
  for (let x = x1 - 20; x <= x1 - 4; x++) if (st.setWall) st.setWall(x, ry + depth, 5);
  // 玩家落右岸
  g.player.x = (x1 + 8) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__scene = { x0, x1, ry, depth, surf };

  // 逐 op 差分仪（_c13b-census 同式）
  const r = g.renderer;
  window.__shimDraws = () => {
    const s = r.bglShimStats()?.stats;
    return s ? { draws: s.draws, batch: s.emitBatchQuads, fb: s.fallback, rp: s.replays } : null;
  };
  const wrap = (name) => {
    const proto = Object.getPrototypeOf(r);
    const orig = proto[name];
    window['__d_' + name] = 0;
    window['__n_' + name] = 0;
    r[name] = function (...a) {
      const s0 = window.__shimDraws();
      const res = orig.apply(this, a);
      const s1 = window.__shimDraws();
      if (s0 && s1) window['__d_' + name] += s1.draws - s0.draws;
      window['__n_' + name]++;
      return res;
    };
  };
  wrap('drawLiquids');
  wrap('drawLiquidBehindSolidTiles');
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__c13bSet = (v) => window.__vlm?.liqC13bSetForTest?.(v);
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__frameMs = 0;
    const gf = window.__swGame.frame.bind(window.__swGame);
    const t0 = performance.now();
    const cnt = () => {
      window.__vnow += 16.6667;
      const tf = performance.now();
      gf(window.__vnow);
      window.__frameMs += performance.now() - tf;
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
      else res({ frames, frameMs: window.__frameMs });
    };
    requestAnimationFrame(cnt);
  });
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlm = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => import('/src/render/glshim/GLShimExecutor.ts').then((m) => { window.__gse = m; }));
await freezeClock(page, { tod: 0.5 });
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(15); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
  const s = await page.evaluate(() => ({ path: window.__swGame.renderer.bglPathUsed, inv: window.__swGame.renderer._waveLiquidInView }));
  if (s.path.startsWith('b2b-acc') && s.inv) { chk('场面就绪(液体在视+acc 窗)', true, JSON.stringify(s)); break; }
  if (i === 11) chk('场面就绪(液体在视+acc 窗)', false, JSON.stringify(s));
}
// 暂停+波场定格（对拍确定性——worker 场吞掉,_liqpolish-ab 同式）
await page.evaluate(() => {
  window.__swGame.paused = true; window.__swGame.running = false;
  const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y;
  const ww = window.__wwMod.waterWaves;
  if (!ww.__fieldFrozen) {
    ww.__origApplyField = ww._wwApplyField.bind(ww);
    ww._wwApplyField = function () { /* 冻结:吞 worker 场 */ };
    ww.__fieldFrozen = true;
  }
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});

// ---- 逐 op 计数对照（A/B 各 120 帧）----
async function opCounts(arm) {
  await page.evaluate((v) => window.__c13bSet(v), arm === 'A' ? false : true);
  await page.evaluate(() => { window.__d_drawLiquids = 0; window.__d_drawLiquidBehindSolidTiles = 0; window.__n_drawLiquids = 0; window.__n_drawLiquidBehindSolidTiles = 0; });
  await page.evaluate(() => window.__drive(120));
  const s = await page.evaluate(() => ({
    dLiq: window.__d_drawLiquids, nLiq: window.__n_drawLiquids,
    dSolid: window.__d_drawLiquidBehindSolidTiles, nSolid: window.__n_drawLiquidBehindSolidTiles,
    shim: window.__shimDraws(),
  }));
  console.log(`[op ${arm}] drawLiquids draws/frame=${(s.dLiq / Math.max(1, s.nLiq)).toFixed(1)} solid draws/frame=${(s.dSolid / Math.max(1, s.nSolid)).toFixed(1)} fb=${s.shim?.fb} rp=${s.shim?.rp}`);
  return s;
}
const opA = await opCounts('A');
const opB = await opCounts('B');
chk('LC 逐 op 计数差（B 臂液体域 shim draws 显著下降 ≥60%）',
  (opB.dLiq + opB.dSolid) <= (opA.dLiq + opA.dSolid) * 0.4,
  `A=${opA.dLiq + opA.dSolid} B=${opB.dLiq + opB.dSolid}`);

// ---- snapFin/census（_liqpolish-ab 同式）----
async function snapFin() {
  return page.evaluate(() => {
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
}
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
        Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) {
        n++; sum += dd;
        if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { n, maxd, mean: n ? sum / n : 0, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a: aFin, b: bFin });
}
const md5fin = (label, fin) => {
  const buf = Buffer.from(fin.b64, 'base64');
  writeFileSync(`/tmp/c13b-${label}.rgba`, buf);
  return createHash('md5').update(buf).digest('hex');
};

const K = 3;
const pairs = [];
for (let k = 0; k < K; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  await page.evaluate(() => window.__c13bSet(false));
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K: 3 });
  const finA = await snapFin();
  const md5A = md5fin(`A${k}`, finA);
  await page.evaluate(() => window.__c13bSet(true));
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K: 3 });
  const finB = await snapFin();
  const stB = await page.evaluate(() => window.__shimDraws());
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB);
  pairs.push({ k, c, md5A, md5B, stB });
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census n=${c.n}(${(c.n * 100 / (finA.w * finA.h)).toFixed(5)}%) maxd=${c.maxd} mean=${c.mean.toFixed(3)} bbox=${JSON.stringify(c.bbox)} | B: batch=${stB?.batch} fb=${stB?.fb} rp=${stB?.rp}`);
}
const area = await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height);
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const nPct = (tot / (pairs.length * area)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
chk('LA census 有界（登记域:带/亮线/坡面 quad GL 设备矩形 f32 舍入边域 maxd≤72=liqgl LA 同族）',
  worstMaxd <= 72 && nPct < 5, `n=${tot}(${nPct.toFixed(5)}%) maxd=${worstMaxd} bbox=${JSON.stringify(pairs[0]?.c.bbox)}`);
chk('LB B 臂批真在走（batchQuads>0/fallback=0/replays=0）',
  pairs.every((p) => p.stB?.batch > 0 && p.stB?.fb === 0 && p.stB?.rp === 0),
  `batch=${pairs[0]?.stB?.batch}`);
const ledger = await page.evaluate(() => window.__gse?.GLShimExecutor?.accFailLedger ?? null);
chk('LB2 accFailLedger 恒空（GLShimExecutor 静态累计账）',
  !!ledger && Object.keys(ledger).length === 0, JSON.stringify(ledger));

// ---- LE:帧耗对照（活帧;A/B 各 4s）----
await page.evaluate(() => { window.__c13bSet(false); });
await new Promise((r) => setTimeout(r, 300));
const perfA2 = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
await page.evaluate(() => { window.__c13bSet(true); });
await new Promise((r) => setTimeout(r, 300));
const perfB2 = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
const fmA = perfA2.frameMs / Math.max(1, perfA2.frames), fmB = perfB2.frameMs / Math.max(1, perfB2.frames);
chk('LE 帧耗对照（B ≤ A×1.02）', fmB <= fmA * 1.02,
  `整帧 A=${fmA.toFixed(2)}ms（fps≈${(perfA2.frames / 4).toFixed(0)}） B=${fmB.toFixed(2)}ms（fps≈${(perfB2.frames / 4).toFixed(0)}）`);

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
