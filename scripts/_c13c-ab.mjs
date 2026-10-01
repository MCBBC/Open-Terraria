// ★C13c 微光波场 GLSL 化整帧 A/B（2026-10-01;_c13b-ab 页内翻旗范式同构,设计案 §4.2）。
// 场景=大微光湖（lt=4 满液柱+土岸→基体段+浸润带微光段+亮纹面全覆盖）。
// 臂 A=c13c 关（CPU 双线性张量现行链）,臂 B=c13c 开（GLSL 逐像素场+stride-11 环）。
// 判据:
//   LA  A≡B census 有界（差源=逐像素场 vs CPU 双线性张量的系统性差,设计案 §5.3
//       登记域;maxd≤72=liqgl LA 同族登记域,真域以实测收紧 ∧ n%<20）
//   LB  B 臂批真在走（emitBatchQuads↑/fb=0/rp=0/accFailLedger 空）
//   LS  CPU sin 减半计数（Math.sin 逐帧计数 B<A;方案 H 实测口径）
//   LE  帧耗对照（B ≤ A×1.02）
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_c13c-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
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
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261001 });
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
  for (let x = x0 - 12; x <= x1 + 12; x++) {
    for (let y = ry - 10; y <= ry + depth + 10; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); if (st.setWall) st.setWall(x, y, 0); }
  }
  // 盆:底+两侧壁（土）
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = ry + depth; y <= ry + depth + 2; y++) st.setTile(x, y, DIRT);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  // 微光湖（lt=4）
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
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
  // CPU sin 计数仪（方案 H 实测口径;全帧口径,两臂共域差=液体场构造面）
  window.__sinCount = (n) => {
    const orig = Math.sin;
    let c = 0;
    Math.sin = function (...a) { c++; return orig.apply(Math, a); };
    try { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } } finally { Math.sin = orig; }
    return c;
  };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__c13cSet = (v) => window.__vlm?.liqC13cSetForTest?.(v);
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
// ★玩家钉位（未暂停渲染面交付确定性:落底后钉坐标+零速,防相机跟手 1px 抖动
//  污染全帧 census——20261001 determinism bbox 漂移判谳）
await page.evaluate(() => {
  const g = window.__swGame;
  window.__drive(90);   // 落底 settle
  window.__pin = { x: g.player.x, y: g.player.y };
  window.__drive = (n) => {
    for (let i = 0; i < n; i++) {
      window.__vnow += 16.6667;
      g.player.x = window.__pin.x; g.player.y = window.__pin.y;
      g.player.vx = 0; g.player.vy = 0;
      g.frame(window.__vnow);
    }
    return window.__vnow;
  };
  g.camera.x = g.player.x; g.camera.y = g.player.y;
});

// 波场定格（对拍确定性——worker 场吞掉,_c13b-ab 同式）。★不暂停:C13b 同款
// paused 态在当前构建下 g.frame 不重渲世界（臂翻面后 canvas 恒旧帧=20261001 实测,
// canvas sweep+PNG 留档判谳）——确定性由 freezeClock+波场冻结+按臂重置 vnow 序列交付。
await page.evaluate(() => {
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

// ---- LS:CPU sin 计数对照（每臂 30 帧;两臂共域差=液体场构造面）----
const sinA = await page.evaluate(() => { window.__c13cSet(false); return window.__sinCount(30); });
const sinB = await page.evaluate(() => { window.__c13cSet(true); return window.__sinCount(30); });
chk('LS CPU sin 减半计数（B<A;方案 H——波值 4 sin 上 GPU,噪声 4 sin 留 CPU）',
  sinB < sinA, `A=${(sinA / 30).toFixed(0)}/帧 B=${(sinB / 30).toFixed(0)}/帧 降幅=${((1 - sinB / sinA) * 100).toFixed(1)}%`);

// ---- snapFin/census（_c13b-ab 同式;★快照面=sw-c10e-glcanvas——20261001 canvas
// sweep+PNG 留档判谳:renderer.canvas 为死面,A/B 差只落 c10e 现役呈现面）----
async function snapFin() {
  return page.evaluate(() => {
    const c = document.getElementById('sw-c10e-glcanvas') ?? window.__swGame.renderer.canvas;
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
async function census(aFin, bFin, band) {
  return page.evaluate(({ a, b, band }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    const yLo = band ? band[0] : 0, yHi = band ? band[1] : a.h;
    let area = 0;
    for (let i = 0; i < P.length; i += 4) {
      const py0 = (i >> 2) / W | 0;
      if (py0 < yLo || py0 >= yHi) continue;
      area++;
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
    return { n, maxd, mean: n ? sum / n : 0, area, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a: aFin, b: bFin, band });
}
const md5fin = (label, fin) => {
  const buf = Buffer.from(fin.b64, 'base64');
  writeFileSync(`/tmp/c13c-${label}.rgba`, buf);
  return createHash('md5').update(buf).digest('hex');
};
// ★差值可视化（一次性判谳面）:pair0 的 A/B/×32 放大差值图落 PNG
const dumpDiffPng = async (aFin, bFin, tag) => {
  const dataUrl = await page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    const W = a.w, H = a.h;
    const out = new Uint8ClampedArray(P.length);
    for (let i = 0; i < P.length; i += 4) {
      const d = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      const v = Math.min(255, d * 32);
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
      if (d > 0) { out[i] = Math.min(255, 64 + d * 8); out[i + 1] = v; out[i + 2] = 255 - v; }
    }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
    return cv.toDataURL('image/png');
  }, { a: aFin, b: bFin });
  writeFileSync(`/tmp/c13c-diff-${tag}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
};

// ★渲染确定性判谳:同 vnow 重渲差分（零=帧级确定;非零=墙钟环境域在帧间漂移）
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: (await page.evaluate(() => window.__vnow)), K: 3 });
const detA = await snapFin();
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: (await page.evaluate(() => window.__vnow)), K: 3 });
const detB = await snapFin();
const detC = await census(detA, detB, null);
console.log(`[determinism] same-vnow re-render diff n=${detC.n} maxd=${detC.maxd} bbox=${JSON.stringify(detC.bbox)}`);
// ★LA 判据域自校准:漂移域底边以下=帧级确定域（树冠/云=墙钟环境不确定性,臂无关,
//  探针环境登记）;湖带顶边抬到漂移域之下
const driftBottom = detC.bbox ? detC.bbox[3] + 2 : 0;
// 湖带屏域（c13c 差异域;树冠/云=墙钟动画漂移域排除——差值图判谳:顶部黄边团=环境
//  动画在两臂快照间的墙钟相位漂移,非场差,探针环境登记）
const lakeBandRaw = await page.evaluate(() => {
  const g = window.__swGame, sc = window.__scene;
  const z = g.camera.zoom ?? 1.25, H = g.renderer.canvas.height;
  const yTop = Math.max(0, Math.round((sc.ry * 16 - g.camera.y) * z + H / 2) - 48);
  const yBot = Math.round(((sc.ry + sc.depth) * 16 - g.camera.y) * z + H / 2) + 8;
  return [yTop, yBot];
});
const lakeBand = [Math.max(lakeBandRaw[0], driftBottom), lakeBandRaw[1]];
console.log(`[band] raw=${JSON.stringify(lakeBandRaw)} driftBottom=${driftBottom} calibrated=${JSON.stringify(lakeBand)}`);
if (lakeBand[1] - lakeBand[0] < 24) {
  chk('LA 判据域（漂移域吞没湖带=不可判）', false, `band=${JSON.stringify(lakeBand)}`);
  const fails0 = results.filter((r) => !r.ok).length;
  console.log(`== ${fails0} FAIL ==`);
  process.exit(1);
}

const K = 4;
// ★跨 pair 逐像素最小差分判别器（场像素=全部 pair 一致差[确定];漂移像素=部分 pair 差
//  [随机]——min 跨 pair 归零即分离;树冠/云墙钟漂移=臂无关环境域,由此剔除）
await page.evaluate(() => {
  window.__minDiff = null;
  window.__minW = 0;
  window.__pairMin = (aB64, bB64) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(aB64), Q = dec(bB64);
    if (!window.__minDiff) { window.__minDiff = new Float32Array(P.length / 4); window.__minW = P.length; }
    const M = window.__minDiff;
    for (let i = 0, p = 0; i < P.length; i += 4, p++) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      if (window.__pairMinCall === undefined) M[p] = dd;
      else if (dd < M[p]) M[p] = dd;
    }
    window.__pairMinCall = (window.__pairMinCall ?? 0) + 1;
  };
  window.__minStats = (band) => {
    const M = window.__minDiff, W = Math.sqrt(0) || 0;
    let n = 0, maxd = 0, sum = 0;
    for (let p = 0; p < M.length; p++) {
      const py = (p / 1280) | 0;
      if (band && (py < band[0] || py >= band[1])) continue;
      if (M[p] > 0) { n++; sum += M[p]; if (M[p] > maxd) maxd = M[p]; }
    }
    return { n, maxd, mean: n ? sum / n : 0 };
  };
});
const pairs = [];
for (let k = 0; k < K; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  await page.evaluate(() => window.__c13cSet(false));
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K: 3 });
  const finA = await snapFin();
  const md5A = md5fin(`A${k}`, finA);
  await page.evaluate(() => window.__c13cSet(true));
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K: 3 });
  const finB = await snapFin();
  const stB = await page.evaluate(() => window.__shimDraws());
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB, lakeBand);
  const cFull = await census(finA, finB, null);
  await page.evaluate((p) => window.__pairMin(p.a, p.b), { a: finA.b64, b: finB.b64 });
  if (k === 0) await dumpDiffPng(finA, finB, 'pair0');
  pairs.push({ k, c, cFull, md5A, md5B, stB });
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census[湖带] n=${c.n}(${(c.n * 100 / Math.max(1, c.area)).toFixed(4)}%) maxd=${c.maxd} mean=${c.mean.toFixed(3)} bbox=${JSON.stringify(c.bbox)} | full n=${cFull.n} maxd=${cFull.maxd} | B: batch=${stB?.batch} fb=${stB?.fb} rp=${stB?.rp}`);
}
const area = await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height);
// ---- 快照活性自证（判据面前置）:同臂 v0 vs v0+120 tick——场相位 +2.09rad+纹理
//  帧带前移 ⇒ 快照必变;不变=快照死面（census 判据作废,直 FAIL）----
const live0 = await page.evaluate(() => window.__vnow);

await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: live0, K: 3 });
const finL0 = await snapFin();
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: live0 + 120, K: 3 });
const finL1 = await snapFin();
const liveC = await census(finL0, finL1);
chk('快照活性自证（v0 vs v0+120 tick 场相位必变）', liveC.n > 0 && liveC.maxd > 0,
  `n=${liveC.n} maxd=${liveC.maxd}`);
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: live0, K: 3 });
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const bandArea = pairs.reduce((s, p) => s + p.c.area, 0) / pairs.length;
const nPct = (tot / Math.max(1, bandArea * pairs.length)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
const worstFull = Math.max(...pairs.map((p) => p.cFull?.maxd ?? 0));
// ★LA 终判=跨 pair min-diff（湖带域;场像素 4/4 一致差,漂移像素被 min 剔除）。
//  真域以实测收紧（设计案 §4.2 条款）:确定湖域实测 maxd=2（≙离线场值闸字节界）,
//  判据收紧 maxd≤8 ∧ mean≤2;n%=场 ±1LSB 弥散面（逐像素场 vs 双线性本质形态）留档
const minStats = await page.evaluate((band) => window.__minStats(band), lakeBand);
chk('LA census 有界（c13c 域=确定湖带×跨pair一致差;实测收紧 maxd≤8 ∧ mean≤2;登记上限 72）',
  minStats.maxd <= 8 && minStats.mean <= 2,
  `湖带一致差 maxd=${minStats.maxd} mean=${minStats.mean.toFixed(3)} n=${minStats.n}(${(minStats.n * 100 / Math.max(1, (lakeBand[1] - lakeBand[0]) * 1280)).toFixed(4)}%) | 逐对最差 maxd=${worstMaxd}（含漂移渗入） | 全幅 maxd=${worstFull}（树冠/云墙钟漂移域,臂无关,留档）`);
chk('LB B 臂批真在走（batchQuads>0/fallback=0/replays=0）',
  pairs.every((p) => p.stB?.batch > 0 && p.stB?.fb === 0 && p.stB?.rp === 0),
  `batch=${pairs[0]?.stB?.batch}`);
const ledger = await page.evaluate(() => window.__gse?.GLShimExecutor?.accFailLedger ?? null);
chk('LB2 accFailLedger 恒空（GLShimExecutor 静态累计账）',
  !!ledger && Object.keys(ledger).length === 0, JSON.stringify(ledger));

// ---- LE:帧耗对照（活帧;A/B 各 4s）----
await page.evaluate(() => { window.__c13cSet(false); });
await new Promise((r) => setTimeout(r, 300));
const perfA2 = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
await page.evaluate(() => { window.__c13cSet(true); });
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
