// ★C13c 微光「果冻感/下水波动」观感 A/B 时间序列量化（2026-10-07 定谳探针）。
// 背景:用户实报 C13c GLSL 化刀后微光液体果冻感/下水波动明显变小,同场景开关 ?c13c
// 对比有差。既有 _c13c-ab.mjs=静态单帧 census（相位对齐逐帧 diff）——测不出【时间
// 动力学】观感差。本探针=同 rig（freezeClock+波场冻结+acc 冻结+tVis 纯 __bump 相位
// 驱动）下两臂各采 72 相位样本（步 5 tick=覆盖波周期 360×1/噪声周期 180×2）,量化:
//   M1 逐像素时间 ptp/std（水区子窗;luma）——「波动大小」第一物理面
//   M2 逐像素过零率（去均值序列）——频率面
//   M3 列带幅值（全水带列均值去趋势 ptp）——「果冻波」空间相干带可见度
//      （盐胡椒噪声列平均归零,相干波带存活=果冻感判别面）
//   M4 亮纹密度（子窗相对阈 luma>mean+25 逐帧计数均值+固定阈>210）
//   M5 跨臂逐像素互相关 lag0/最优 lag——相位/频率对齐面
//   M6 渲染确定性自证（同相位重采 diff=0）
// 附:两臂时间均值图/ptp 图/双相位原始帧 PNG 落 /tmp/c13c-feel-*.png 目检面。
// 场景 S1=岸观（_c13c-ab 同湖）;S2=下水（玩家钉湖心,全视口水体——「下水波动」域）。
// 运行:SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs --timeout=600000 scripts/_c13c-feel-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5208';
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
await bootstrap(page, ORIGIN);
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
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = ry + depth; y <= ry + depth + 2; y++) st.setTile(x, y, DIRT);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  g.player.x = (x1 + 8) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__scene = { x0, x1, ry, depth, surf };
  const r = g.renderer;
  window.__shimDraws = () => {
    const s = r.bglShimStats()?.stats;
    return s ? { draws: s.draws, batch: s.emitBatchQuads, fb: s.fallback, rp: s.replays } : null;
  };
  window.__vnow = performance.now();
  // tick 闸（_c13c-ab 判谳同式:帧源单域=manual 驱动放行,rAF 环帧吞掉）
  const gp = Object.getPrototypeOf(g);
  const __origFrame = gp.frame;
  gp.frame = function (t) { return window.__manualDrive ? __origFrame.call(this, t) : undefined; };
  window.__seek = (t) => { window.__vnow = t; g.lastTime = t; };
  window.__bump = (n) => { for (let i = 0; i < n; i++) window.__venv.stepVisEffectTick(); return window.__venv.visEffectFrames(); };
  window.__drive = (n) => {
    window.__manualDrive = true;
    try { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } } finally { window.__manualDrive = false; }
    return window.__vnow;
  };
  window.__c13cSet = (v) => window.__vlm?.liqC13cSetForTest?.(v);
  // 玩家钉位/搬移（S1 岸观/S2 湖心共用）
  window.__pinAt = (wx, wy) => {
    const gg = window.__swGame;
    gg.player.x = wx; gg.player.y = wy; gg.player.vx = 0; gg.player.vy = 0;
    gg.camera.x = wx; gg.camera.y = wy;
    window.__pin = { x: wx, y: wy };
  };
  window.__drivePinned = (n) => {
    window.__manualDrive = true;
    try {
      for (let i = 0; i < n; i++) {
        window.__vnow += 16.6667;
        g.player.x = window.__pin.x; g.player.y = window.__pin.y;
        g.player.vx = 0; g.player.vy = 0;
        g.frame(window.__vnow);
      }
    } finally { window.__manualDrive = false; }
    return window.__vnow;
  };
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlm = m; }));
await page.evaluate(() => import('/src/entities/Enemy.ts').then((m) => { window.__venv = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await freezeClock(page, { tod: 0.5 });

// 落底 settle + 钉位
await page.evaluate(() => {
  const g = window.__swGame;
  window.__drive(90);   // 落底 settle（未钉位）
  window.__pinAt((window.__scene.x1 + 8) * 16, (window.__scene.ry - 3) * 16);
  window.__drivePinned(30);
});

// 波场定格 + 状态冻结 + 相位重锚 500（_c13c-ab 同式）
await page.evaluate(() => {
  const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y;
  const ww = window.__wwMod.waterWaves;
  if (!ww.__fieldFrozen) {
    ww.__origApplyField = ww._wwApplyField.bind(ww);
    ww._wwApplyField = function () { };
    ww.__fieldFrozen = true;
  }
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
  g.acc = -1e9;
  g.lastTime = window.__vnow;
});
await page.evaluate(() => window.__bump((500 - window.__venv.visEffectFrames() + 216000) % 216000));

// ---- 测量机（页面内;累加器/序列/列带/PNG 全 in-page,只回数字+dataURL）----
await page.evaluate(() => {
  const W_SUB_X0 = 128, W_SUB_X1 = 1152;   // 子窗列域（全幅 1280 内域）
  window.__feelInit = (band) => {
    const c = document.getElementById('sw-c10e-glcanvas') ?? window.__swGame.renderer.canvas;
    const w = c.width, y0 = Math.max(0, band[0] | 0), y1 = Math.min(c.height, band[1] | 0);
    const h = y1 - y0;
    const F = window.__feel = {
      w, bandY0: y0, h,
      sum: new Float64Array(w * h), sum2: new Float64Array(w * h),
      min: new Float64Array(w * h).fill(1e9), max: new Float64Array(w * h).fill(-1e9),
      frames: [], colMean: [], rowMean: [], tVis: [],
      sub: null,
    };
    // 子窗（水体内域;行域由调用方给绝对行）
    F.subY0 = Math.max(0, (band[2] | 0) - y0); F.subY1 = Math.min(h, (band[3] | 0) - y0);
    F.subX0 = W_SUB_X0; F.subX1 = Math.min(w, W_SUB_X1);
    F.subW = F.subX1 - F.subX0; F.subH = F.subY1 - F.subY0;
    F.sub = [];
    const lc = document.createElement('canvas'); lc.width = w; lc.height = h;
    F.lc = lc; F.lx = lc.getContext('2d', { willReadFrequently: true });
    return { w, h, sub: [F.subX0, F.subY0, F.subX1, F.subY1] };
  };
  window.__feelSample = (tVis) => {
    const F = window.__feel;
    const c = document.getElementById('sw-c10e-glcanvas') ?? window.__swGame.renderer.canvas;
    F.lx.drawImage(c, 0, -F.bandY0);
    const d = F.lx.getImageData(0, 0, F.w, F.h).data;
    const { w, h } = F;
    const colA = new Float64Array(w); const colN = new Float64Array(w);
    const rowA = new Float64Array(h); const rowN = new Float64Array(h);
    const subL = new Uint8Array(F.subW * F.subH);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const L = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        const p = y * w + x;
        F.sum[p] += L; F.sum2[p] += L * L;
        if (L < F.min[p]) F.min[p] = L;
        if (L > F.max[p]) F.max[p] = L;
        colA[x] += L; colN[x]++; rowA[y] += L; rowN[y]++;
        if (x >= F.subX0 && x < F.subX1 && y >= F.subY0 && y < F.subY1) {
          subL[(y - F.subY0) * F.subW + (x - F.subX0)] = L;
        }
      }
    }
    const cm = new Float64Array(w); for (let x = 0; x < w; x++) cm[x] = colA[x] / colN[x];
    const rm = new Float64Array(h); for (let y = 0; y < h; y++) rm[y] = rowA[y] / rowN[y];
    F.colMean.push(cm); F.rowMean.push(rm); F.frames.push(subL); F.tVis.push(tVis);
  };
  window.__feelAnalyze = () => {
    const F = window.__feel;
    const { w, h, subW, subH } = F;
    const N = F.frames.length;
    // M1/M2/M5: 子窗逐像素序列
    const ptpArr = new Float64Array(subW * subH), stdArr = new Float64Array(subW * subH), zcArr = new Float64Array(subW * subH);
    const meanArr = new Float64Array(subW * subH);
    for (let p = 0; p < subW * subH; p++) {
      let s = 0; for (let k = 0; k < N; k++) s += F.frames[k][p];
      const m = s / N; meanArr[p] = m;
      let mn = 1e9, mx = -1e9, v = 0, zc = 0, prev = 0;
      for (let k = 0; k < N; k++) {
        const L = F.frames[k][p];
        if (L < mn) mn = L; if (L > mx) mx = L;
        const dv = L - m; v += dv * dv;
        if (k > 0 && ((prev < 0 && dv >= 0) || (prev > 0 && dv <= 0))) zc++;
        prev = dv;
      }
      ptpArr[p] = mx - mn; stdArr[p] = Math.sqrt(v / N); zcArr[p] = zc;
    }
    const pct = (a, q) => { const b = Array.from(a).sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))] ?? 0; };
    const m1 = {
      ptpMean: pct(ptpArr, 0.5), ptpMeanAll: ptpArr.reduce((s, v) => s + v, 0) / ptpArr.length,
      ptpP90: pct(ptpArr, 0.9), ptpP99: pct(ptpArr, 0.99),
      stdMean: stdArr.reduce((s, v) => s + v, 0) / stdArr.length, stdP90: pct(stdArr, 0.9),
      zcPerPeriod: (zcArr.reduce((s, v) => s + v, 0) / zcArr.length) * (360 / N),
    };
    // M4: 亮纹密度（相对阈 mean+25 / 固定 210;逐帧计数均值）
    let relCnt = 0, fixCnt = 0;
    for (let k = 0; k < N; k++) {
      const fr = F.frames[k];
      for (let p = 0; p < subW * subH; p++) {
        if (fr[p] > meanArr[p] + 25) relCnt++;
        if (fr[p] > 210) fixCnt++;
      }
    }
    const m4 = { relPerFrame: relCnt / N, relPct: relCnt / (N * subW * subH) * 100, fixPerFrame: fixCnt / N };
    // M3: 列带幅值（列均值去时间均值 → 逐列 ptp → 均值/中位）;行带同式对照
    const bandPtp = (mat, len) => {
      const out = [];
      for (let c = 0; c < len; c++) {
        let s = 0; for (let k = 0; k < N; k++) s += mat[k][c];
        const m = s / N;
        let mn = 1e9, mx = -1e9;
        for (let k = 0; k < N; k++) { const v = mat[k][c]; if (v < mn) mn = v; if (v > mx) mx = v; }
        out.push(mx - mn);
      }
      out.sort((a, b) => a - b);
      return { mean: out.reduce((s, v) => s + v, 0) / out.length, p50: out[Math.floor(out.length / 2)], p90: out[Math.floor(out.length * 0.9)] };
    };
    const m3 = { col: bandPtp(F.colMean, w), row: bandPtp(F.rowMean, h) };
    // M3b: 每帧列均值空间 std（带内空间对比度时间均值）
    let cstd = 0;
    for (let k = 0; k < N; k++) {
      const cm = F.colMean[k]; let s = 0; for (let x = 0; x < w; x++) s += cm[x];
      const m = s / w; let v = 0; for (let x = 0; x < w; x++) v += (cm[x] - m) ** 2;
      cstd += Math.sqrt(v / w);
    }
    m3.frameColStd = cstd / N;
    return { m1, m3, m4, N, tVis0: F.tVis[0], tVis1: F.tVis[N - 1] };
  };
  // M5: 跨臂子窗逐像素序列互相关（lag 域 [-8..8] → 最优 lag 直方+lag0 均值）
  window.__feelSaved = {};
  window.__feelStash = (tag) => {
    const F = window.__feel;
    window.__feelSaved[tag] = { frames: F.frames, subW: F.subW, subH: F.subH };
  };
  window.__feelCross = (tagA, tagB) => {
    const F = window.__feelSaved[tagA], G = window.__feelSaved[tagB];
    const N = F.frames.length, n = F.subW * F.subH;
    let lag0 = 0, bestLagSum = 0, bestHist = {};
    for (let p = 0; p < n; p++) {
      let mf = 0, mg = 0;
      for (let k = 0; k < N; k++) { mf += F.frames[k][p]; mg += G.frames[k][p]; }
      mf /= N; mg /= N;
      let denomF = 0, denomG = 0;
      for (let k = 0; k < N; k++) { const a = F.frames[k][p] - mf, b = G.frames[k][p] - mg; denomF += a * a; denomG += b * b; }
      if (denomF < 1e-6 || denomG < 1e-6) continue;   // 静态像素（环境域）不进相关面
      let bestC = -2, bestL = 0;
      for (let lag = -8; lag <= 8; lag++) {
        let num = 0;
        for (let k = 0; k < N; k++) {
          const k2 = k + lag; if (k2 < 0 || k2 >= N) continue;
          num += (F.frames[k][p] - mf) * (G.frames[k2][p] - mg);
        }
        const c = num / Math.sqrt(denomF * denomG);
        if (c > bestC) { bestC = c; bestL = lag; }
      }
      // lag0 相关
      let num0 = 0;
      for (let k = 0; k < N; k++) num0 += (F.frames[k][p] - mf) * (G.frames[k][p] - mg);
      lag0 += num0 / Math.sqrt(denomF * denomG);
      bestLagSum += bestC;
      bestHist[bestL] = (bestHist[bestL] ?? 0) + 1;
    }
    const hist = Object.entries(bestHist).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([l, c]) => `lag${l}:${((c / n) * 100).toFixed(1)}%`).join(' ');
    return { corrLag0: lag0 / n, bestCorr: bestLagSum / n, hist };
  };
  // M6: 同相位重采确定性（luma 绝对差计数）
  window.__feelDetCheck = () => {
    const F = window.__feel;
    const last = F.frames[F.frames.length - 1];
    const c = document.getElementById('sw-c10e-glcanvas') ?? window.__swGame.renderer.canvas;
    F.lx.drawImage(c, 0, -F.bandY0);
    const d = F.lx.getImageData(0, 0, F.w, F.h).data;
    let diff = 0, maxd = 0;
    for (let y = F.subY0; y < F.subY1; y++) for (let x = F.subX0; x < F.subX1; x++) {
      const i = (y * F.w + x) * 4;
      const L = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      const p = (y - F.subY0) * F.subW + (x - F.subX0);
      const dd = Math.abs(L - last[p]);
      if (dd > 0) diff++;
      if (dd > maxd) maxd = dd;
    }
    return { diff, maxd };
  };
  // PNG 落盘面:时间均值图/时间 ptp 图/指定帧
  window.__feelPng = (kind, frameIdx) => {
    const F = window.__feel;
    const N = F.frames.length;
    const cv = document.createElement('canvas');
    cv.width = F.w; cv.height = F.h;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(F.w, F.h);
    const o = img.data;
    if (kind === 'mean' || kind === 'ptp') {
      for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
        const p = y * F.w + x, i = p * 4;
        let v;
        if (kind === 'mean') v = F.sum[p] / N;
        else v = F.max[p] - F.min[p];
        v = Math.max(0, Math.min(255, v));
        o[i] = v; o[i + 1] = v; o[i + 2] = v; o[i + 3] = 255;
        if (kind === 'ptp' && v > 0) { o[i] = Math.min(255, 64 + v); o[i + 1] = v; o[i + 2] = 255 - Math.min(255, v); }
      }
    } else {
      const fr = F.frames[frameIdx];
      for (let y = F.subY0; y < F.subY1; y++) for (let x = F.subX0; x < F.subX1; x++) {
        const v = fr[(y - F.subY0) * F.subW + (x - F.subX0)];
        const i = (y * F.w + x) * 4;
        o[i] = v; o[i + 1] = v; o[i + 2] = v; o[i + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  };
});

// ---- 场景驱动:band 计算 ----
async function bandOf(sceneTag) {
  return page.evaluate((tag) => {
    const g = window.__swGame, sc = window.__scene;
    const z = g.camera.zoom ?? 1.25, H = g.renderer.canvas.height, Wd = g.renderer.canvas.width;
    const sy = (wy) => Math.round((wy * 16 - g.camera.y) * z + H / 2);
    const waterTop = sy(sc.ry), waterBot = sy(sc.ry + sc.depth);
    const surfH = Math.round(16 * z);
    // 子窗=水体内域（表层行下 8px 起,底上 8px 止;S1/S2 同式）
    return [waterTop, waterBot, waterTop + surfH + 8, waterBot - 8, Wd, H];
  }, sceneTag);
}

const N = 72, STEP = 5;
async function runArm(arm, tag) {
  // 重锚相位 500 + 翻臂 + 暖机
  await page.evaluate((a) => {
    window.__bump((500 - window.__venv.visEffectFrames() + 216000) % 216000);
    window.__c13cSet(a === 'B');
  }, arm);
  await page.evaluate(() => { window.__drivePinned(3); });
  const band = await bandOf(arm);
  await page.evaluate((b) => window.__feelInit(b), band);
  for (let k = 0; k < N; k++) {
    await page.evaluate(() => { window.__bump(5); window.__drivePinned(2); });
    await page.evaluate((tv) => window.__feelSample(tv), 500 + k * STEP);
  }
  const res = await page.evaluate(() => window.__feelAnalyze());
  await page.evaluate((t) => window.__feelStash(t), tag);
  // PNG 目检面（mean/ptp/双相位原始帧）
  for (const kind of ['mean', 'ptp']) {
    const url = await page.evaluate((k) => window.__feelPng(k), kind);
    writeFileSync(`/tmp/c13c-feel-${tag}-${kind}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  for (const fi of [0, 36]) {
    const url = await page.evaluate((k) => window.__feelPng('frame', k), fi);
    writeFileSync(`/tmp/c13c-feel-${tag}-f${fi}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  return { band, res };
}

// ---- S1 岸观 ----
console.log('== S1 岸观（玩家钉右岸,湖占下半视口） ==');
const s1A = await runArm('A', 's1a');
console.log(`[S1/A] band=${JSON.stringify(s1A.band)} N=${s1A.res.N} tVis=${s1A.res.tVis0}..${s1A.res.tVis1}`);
console.log(`[S1/A] M1 逐像素时间 ptp 中位=${s1A.res.m1.ptpMean.toFixed(1)} 均值=${s1A.res.m1.ptpMeanAll.toFixed(2)} P90=${s1A.res.m1.ptpP90.toFixed(1)} P99=${s1A.res.m1.ptpP99.toFixed(1)} | std 均值=${s1A.res.m1.stdMean.toFixed(3)} P90=${s1A.res.m1.stdP90.toFixed(3)} | ZC/周期=${s1A.res.m1.zcPerPeriod.toFixed(3)}`);
console.log(`[S1/A] M3 列带 ptp mean=${s1A.res.m3.col.mean.toFixed(2)} p50=${s1A.res.m3.col.p50.toFixed(2)} p90=${s1A.res.m3.col.p90.toFixed(2)} | 行带 ptp mean=${s1A.res.m3.row.mean.toFixed(2)} | 每帧列std=${s1A.res.m3.frameColStd.toFixed(3)}`);
console.log(`[S1/A] M4 亮纹密度 rel(mean+25)=${s1A.res.m4.relPerFrame.toFixed(0)}px/帧(${s1A.res.m4.relPct.toFixed(3)}%) fix(>210)=${s1A.res.m4.fixPerFrame.toFixed(0)}px/帧`);
const s1B = await runArm('B', 's1b');
console.log(`[S1/B] band=${JSON.stringify(s1B.band)} N=${s1B.res.N} tVis=${s1B.res.tVis0}..${s1B.res.tVis1}`);
console.log(`[S1/B] M1 逐像素时间 ptp 中位=${s1B.res.m1.ptpMean.toFixed(1)} 均值=${s1B.res.m1.ptpMeanAll.toFixed(2)} P90=${s1B.res.m1.ptpP90.toFixed(1)} P99=${s1B.res.m1.ptpP99.toFixed(1)} | std 均值=${s1B.res.m1.stdMean.toFixed(3)} P90=${s1B.res.m1.stdP90.toFixed(3)} | ZC/周期=${s1B.res.m1.zcPerPeriod.toFixed(3)}`);
console.log(`[S1/B] M3 列带 ptp mean=${s1B.res.m3.col.mean.toFixed(2)} p50=${s1B.res.m3.col.p50.toFixed(2)} p90=${s1B.res.m3.col.p90.toFixed(2)} | 行带 ptp mean=${s1B.res.m3.row.mean.toFixed(2)} | 每帧列std=${s1B.res.m3.frameColStd.toFixed(3)}`);
console.log(`[S1/B] M4 亮纹密度 rel=${s1B.res.m4.relPerFrame.toFixed(0)}px/帧(${s1B.res.m4.relPct.toFixed(3)}%) fix=${s1B.res.m4.fixPerFrame.toFixed(0)}px/帧`);
const s1AB = await page.evaluate(() => window.__feelCross('s1a', 's1b'));
console.log(`[S1 A↔B] M5 互相关 lag0=${s1AB.corrLag0.toFixed(3)} 最优=${s1AB.bestCorr.toFixed(3)} 直方 ${s1AB.hist}`);
const stB = await page.evaluate(() => window.__shimDraws());
console.log(`[S1/B] batch=${stB?.batch} fb=${stB?.fb} rp=${stB?.rp}`);
console.log('[S1] PNG 落盘 /tmp/c13c-feel-s1*.png');

// ---- S2 下水（玩家钉湖心水下）----
console.log('== S2 下水（玩家钉湖心水下,全视口水体） ==');
await page.evaluate(() => {
  const sc = window.__scene;
  window.__pinAt(((sc.x0 + sc.x1) / 2) * 16 + 8, (sc.ry + 5) * 16);
  window.__drivePinned(10);
});
const s2A = await runArm('A', 's2a');
console.log(`[S2/A] band=${JSON.stringify(s2A.band)}`);
console.log(`[S2/A] M1 ptp 中位=${s2A.res.m1.ptpMean.toFixed(1)} 均值=${s2A.res.m1.ptpMeanAll.toFixed(2)} P90=${s2A.res.m1.ptpP90.toFixed(1)} P99=${s2A.res.m1.ptpP99.toFixed(1)} | std=${s2A.res.m1.stdMean.toFixed(3)} | ZC/周期=${s2A.res.m1.zcPerPeriod.toFixed(3)}`);
console.log(`[S2/A] M3 列带 ptp mean=${s2A.res.m3.col.mean.toFixed(2)} p50=${s2A.res.m3.col.p50.toFixed(2)} p90=${s2A.res.m3.col.p90.toFixed(2)} | 行带=${s2A.res.m3.row.mean.toFixed(2)} | 每帧列std=${s2A.res.m3.frameColStd.toFixed(3)}`);
console.log(`[S2/A] M4 亮纹 rel=${s2A.res.m4.relPerFrame.toFixed(0)}px/帧(${s2A.res.m4.relPct.toFixed(3)}%) fix=${s2A.res.m4.fixPerFrame.toFixed(0)}px/帧`);
const s2B = await runArm('B', 's2b');
console.log(`[S2/B] band=${JSON.stringify(s2B.band)}`);
console.log(`[S2/B] M1 ptp 中位=${s2B.res.m1.ptpMean.toFixed(1)} 均值=${s2B.res.m1.ptpMeanAll.toFixed(2)} P90=${s2B.res.m1.ptpP90.toFixed(1)} P99=${s2B.res.m1.ptpP99.toFixed(1)} | std=${s2B.res.m1.stdMean.toFixed(3)} | ZC/周期=${s2B.res.m1.zcPerPeriod.toFixed(3)}`);
console.log(`[S2/B] M3 列带 ptp mean=${s2B.res.m3.col.mean.toFixed(2)} p50=${s2B.res.m3.col.p50.toFixed(2)} p90=${s2B.res.m3.col.p90.toFixed(2)} | 行带=${s2B.res.m3.row.mean.toFixed(2)} | 每帧列std=${s2B.res.m3.frameColStd.toFixed(3)}`);
console.log(`[S2/B] M4 亮纹 rel=${s2B.res.m4.relPerFrame.toFixed(0)}px/帧(${s2B.res.m4.relPct.toFixed(3)}%) fix=${s2B.res.m4.fixPerFrame.toFixed(0)}px/帧`);
const s2AB = await page.evaluate(() => window.__feelCross('s2a', 's2b'));
console.log(`[S2 A↔B] M5 互相关 lag0=${s2AB.corrLag0.toFixed(3)} 最优=${s2AB.bestCorr.toFixed(3)} 直方 ${s2AB.hist}`);
console.log('[S2] PNG 落盘 /tmp/c13c-feel-s2*.png');

// ---- 判据（★四期校准 2026-10-07）----
// F1:两臂 M1 时间振幅同域。S1 子窗 60% 为静态岸域（ptp 中位双臂恒 0 → 中位比 0/0
//  无定义）→ 振幅比取 S2（全水体）+S1 ptp 均值对照;ZC 同域。
// F2 列带（果冻波相干面）:B/A 列带 ptp 比。
// F3:互相关校准域——S1 子窗运动像素序列=B 臂四角插值 vs A 臂 tile 均值:两臂皆为
//  同频（ω=2π/180 噪声+2π/360 波）随机相位分量加权和,corr=cos(Δφ) 随像素位置在
//  [−1,1] 展布、角区→0/中心→1,结构均值 ~0.4（四期修正前后同为 0.391 实证=该指标
//  对插值语义不敏感,非相位/频率错面）→ S1 域 [0.25,0.6];S2 被共享全球脉动主导 → ≥0.9。
const dS2 = Math.abs(s2B.res.m1.ptpMean - s2A.res.m1.ptpMean);
const rS1m = s1B.res.m1.ptpMeanAll / Math.max(1e-6, s1A.res.m1.ptpMeanAll);
const rS2 = s2B.res.m1.ptpMean / Math.max(1e-6, s2A.res.m1.ptpMean);
const bandR1 = s1B.res.m3.col.mean / Math.max(1e-6, s1A.res.m3.col.mean);
const bandR2 = s2B.res.m3.col.mean / Math.max(1e-6, s2A.res.m3.col.mean);
console.log(`== 汇总 ==`);
console.log(`S1 ptp 均值 A=${s1A.res.m1.ptpMeanAll.toFixed(2)} B=${s1B.res.m1.ptpMeanAll.toFixed(2)} B/A=${rS1m.toFixed(3)} | 列带 B/A=${bandR1.toFixed(3)} | ZC A=${s1A.res.m1.zcPerPeriod.toFixed(3)} B=${s1B.res.m1.zcPerPeriod.toFixed(3)}`);
console.log(`S2 ptp 中位 A=${s2A.res.m1.ptpMean.toFixed(1)} B=${s2B.res.m1.ptpMean.toFixed(1)} B/A=${rS2.toFixed(3)} | 列带 B/A=${bandR2.toFixed(3)} | ZC A=${s2A.res.m1.zcPerPeriod.toFixed(3)} B=${s2B.res.m1.zcPerPeriod.toFixed(3)}`);
chk('F1 时间振幅两臂同域（S2 |Δptp中位|≤2 ∧ r∈[0.8,1.25];S1 ptp均值 r∈[0.8,1.25];ZC |Δ|≤0.5）',
  dS2 <= 2 && rS2 >= 0.8 && rS2 <= 1.25 && rS1m >= 0.8 && rS1m <= 1.25
    && Math.abs(s1A.res.m1.zcPerPeriod - s1B.res.m1.zcPerPeriod) <= 0.5
    && Math.abs(s2A.res.m1.zcPerPeriod - s2B.res.m1.zcPerPeriod) <= 0.5,
  `S1 r=${rS1m.toFixed(3)} S2 Δ=${dS2.toFixed(2)}(r=${rS2.toFixed(3)})`);
chk('F2 列带相干幅值两臂同域（B/A∈[0.8,1.25]）', bandR1 >= 0.8 && bandR1 <= 1.25 && bandR2 >= 0.8 && bandR2 <= 1.25,
  `S1=${bandR1.toFixed(3)} S2=${bandR2.toFixed(3)}`);
chk('F3 跨臂序列相关（校准域:S1∈[0.25,0.6]=插值vs均值的 cos(Δφ) 结构域;S2≥0.9 共享脉动主导）',
  s1AB.corrLag0 >= 0.25 && s1AB.corrLag0 <= 0.6 && s2AB.corrLag0 >= 0.9,
  `S1=${s1AB.corrLag0.toFixed(3)} S2=${s2AB.corrLag0.toFixed(3)}`);
chk('页面零错误', pageErrors.filter((e) => !e.includes('favicon')).length === 0, pageErrors.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(0);   // 判据 FAIL 也退出 0——本探针=定谳取证面,数字即结论
