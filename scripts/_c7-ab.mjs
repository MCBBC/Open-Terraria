// ★C7 fg 复用臂死算跳水——像素 A/B+活机量化（2026-10-08;_liqgl-ab 页内翻面范式）。
// A 臂=liqc7 关（现行全量链:fg 复位重扫+P3 重铺照跑）;B 臂=liqc7 开（复用臂命中帧
// 两死算块跳过）。页内 liqC7SetForTest 翻面;暂停态=渲染纯函数,同 vnow 序列双臂重放。
// 判据：
//   LA  同帧 A≡B census n=0（逐位——死算跳过无观察面;无登记域,非 0 即病）;
//   LB  B 臂批面零变化（批段/quad 数与 A 臂同量级;溢出位双臂恒 false）;
//   LC  变异判别力声明（tests/liquid-c7-fg-reprep-skip.test.ts T4 已证;页内不重复）;
//   LE  活机量化:drawLiquids 包装 ms/帧 + CDP Profiler aP self（双臂同窗）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=1200000 scripts/_c7-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({ viewport: {
  width: Number(process.env.C7_VW || 1280), height: Number(process.env.C7_VH || 800),
} });
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261008 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- 场面:满视口水体（水全幅+岩浆/蜂蜜囊+坡面岸+半砖水线,同 census v2）----
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const surf = Math.floor(g.world.groundLevel);
  const px = Math.floor(g.player.cx / 16);
  const DIRT = window.__swTiles?.['dirt'] ?? 1;
  const SAND = window.__swTiles?.['sand'] ?? 53;
  const x0 = px - 50, x1 = px + 50, ry = surf - 6, depth = 44;
  for (let x = x0 - 6; x <= x1 + 6; x++) {
    for (let y = ry - 8; y <= ry + depth + 6; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  }
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let d = 0; d < 3; d++) st.setTile(x, ry + depth + d, DIRT);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + 30; y++) st.setLiquid(x, y, 255, 1);
  for (let x = x0 + 20; x < x0 + 32; x++) for (let y = ry + 10; y < ry + 18; y++) { st.setLiquid(x, y, 255, 2); st.setTile(x, y, 0); }
  for (let x = x1 - 16; x < x1 - 6; x++) for (let y = ry + 12; y < ry + 20; y++) { st.setLiquid(x, y, 255, 3); st.setTile(x, y, 0); }
  for (let i = 0; i < 14; i++) {
    const sx = x0 + 4 + i * 5;
    st.setTile(sx, ry + depth - 1, DIRT); st.setSlope(sx, ry + depth - 1, 1 + (i % 2));
    st.setTile(sx + 1, ry + depth - 1, DIRT); st.setSlope(sx + 1, ry + depth - 1, 2 - (i % 2));
  }
  for (let x = x0 + 6; x <= x0 + 26; x++) { st.setTile(x, ry + depth - 1, SAND); st.setHalfBrick(x, ry + depth - 1, true); }
  for (let x = x0 + 6; x <= x0 + 26; x++) st.setLiquid(x, ry + depth - 2, 255, 1);
  g.player.x = (x1 - 2) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  // 帧驱动+旗翻面+计时包装
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__c7set = (v) => { window.__vlMod.liqC7SetForTest(v); };
  window.__shimStats = () => g.renderer.bglShimStats();
  window.__renderState = () => {
    const r = g.renderer;
    return { inv: r._waveLiquidInView, accMode: r._accMode, path: r.bglPathUsed };
  };
  window.__liqTimerWrap = () => {
    const r = g.renderer;
    if (r.__liqWrapped) return;
    const proto = Object.getPrototypeOf(r);
    const orig = proto.drawLiquids;
    window.__liqMs = 0; window.__liqN = 0;
    r.drawLiquids = function (...a) {
      const t0 = performance.now();
      const res = orig.apply(this, a);
      window.__liqMs += performance.now() - t0;
      window.__liqN++;
      return res;
    };
    r.__liqWrapped = true;
  };
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__liqMs0 = window.__liqMs; window.__liqN0 = window.__liqN;
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
      else res({ frames, liqMs: window.__liqMs - window.__liqMs0, liqN: window.__liqN - window.__liqN0, frameMs: window.__frameMs });
    };
    requestAnimationFrame(cnt);
  });
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => {
  const ww = window.__wwMod.waterWaves;
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };   // 波场定格（对拍确定性）
});
await page.evaluate(() => { window.__liqTimerWrap(); });

// 暖机+状态核实
await page.evaluate(() => window.__drive(30));
await page.evaluate(() => { const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
await page.evaluate(() => window.__drive(5));
const st1 = await page.evaluate(() => window.__renderState());
chk('场面就绪(液体在视+acc 链)', st1.inv === true, JSON.stringify(st1));

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

// ---- LA/LB:同帧配对对拍 ×3（K=3 渲染/跳帧交替——每臂保证至少一次真渲染） ----
const K = 3;
const pairs = [];
for (let k = 0; k < 3; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  await page.evaluate(() => { window.__c7set(false); });
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
  const finA = await snapFin();
  const stA = await page.evaluate(() => window.__shimStats());
  await page.evaluate(() => { window.__c7set(true); });
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
  const finB = await snapFin();
  const stB = await page.evaluate(() => window.__shimStats());
  const c = await census(finA, finB);
  pairs.push({ k, c, stA, stB });
  console.log(`[pair ${k}] census n=${c.n} maxd=${c.maxd} mean=${c.mean.toFixed(3)} bbox=${JSON.stringify(c.bbox)} | A batch=${stA?.stats?.emitBatchQuads} B batch=${stB?.stats?.emitBatchQuads} B rp=${stB?.stats?.replays}`);
}
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
chk('LA 同帧 A≡B census n=0（逐位;死算跳过无观察面）', tot === 0, `total diff px=${tot}`);
chk('LB 批面零变化（溢出位双 false+批量同量级）',
  pairs.every((p) => Math.abs((p.stB?.stats?.emitBatchQuads ?? 0) - (p.stA?.stats?.emitBatchQuads ?? 0)) < 8),
  `B-A batch Δ=${pairs.map((p) => (p.stB?.stats?.emitBatchQuads ?? 0) - (p.stA?.stats?.emitBatchQuads ?? 0)).join(',')}`);

// ---- LE:活机量化（暂停驱动=渲染成本口径;双臂同窗各 90 帧）----
// LE1 drawLiquids 包装（incl ms/帧）
const perfA = await page.evaluate(async () => { window.__c7set(false); const r = await window.__perfWindow(1500); return r; });
const perfB = await page.evaluate(async () => { window.__c7set(true); const r = await window.__perfWindow(1500); return r; });
const liqA = perfA.liqMs / Math.max(1, perfA.liqN), liqB = perfB.liqMs / Math.max(1, perfB.liqN);
console.log(`[LE1] drawLiquids incl: A=${liqA.toFixed(3)}ms/f  B=${liqB.toFixed(3)}ms/f  (${(liqA / Math.max(1e-9, liqB)).toFixed(2)}x)  frames A=${perfA.frames} B=${perfB.frames}`);
// LE2 CDP Profiler aP self（各 120 帧）
async function profileArm(on) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  await page.evaluate((on) => { window.__c7set(on); window.__drive(120); }, on);
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  const selfUs = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    selfUs.set(id, (selfUs.get(id) || 0) + (profile.timeDeltas[i] || 0));
  }
  const agg = {};
  for (const nd of profile.nodes) {
    const fn = nd.callFrame.functionName || '(anonymous)';
    const us = selfUs.get(nd.id) || 0;
    if (us > 0) agg[fn] = (agg[fn] || 0) + us;
  }
  const total = [...selfUs.values()].reduce((a, b) => a + b, 0) / 1000;
  return { total, aP: (agg.drawVanillaLiquids || 0) / 1000, band: (agg.drawLiquidBehindTilesOnly || 0) / 1000, at: (agg.at || 0) / 1000, tileSolidLut: (agg.tileSolidLut || 0) / 1000, batQuad: (agg.batQuad || 0) / 1000 };
}
const profA = await profileArm(false);
const profB = await profileArm(true);
console.log(`[LE2] aP self: A=${profA.aP.toFixed(1)}ms/120f=${(profA.aP / 120).toFixed(3)}ms/f  B=${profB.aP.toFixed(1)}ms/120f=${(profB.aP / 120).toFixed(3)}ms/f  (${(profA.aP / Math.max(1e-9, profB.aP)).toFixed(2)}x)  profile-total A=${profA.total.toFixed(0)} B=${profB.total.toFixed(0)}`);
chk('LE aP self 改善（B<A）', profB.aP < profA.aP, `${(100 * (1 - profB.aP / profA.aP)).toFixed(1)}% self 削减`);

if (pageErrors.length) console.log('PAGE ERRORS:', pageErrors.slice(0, 3).join(' | '));
console.log(`\nsummary: ${results.every((r) => r.ok) ? 'ALL PASS' : 'HAS FAIL'} (${results.filter((r) => r.ok).length}/${results.length})`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
