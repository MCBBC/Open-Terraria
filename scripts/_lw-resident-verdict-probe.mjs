// ★WASM 二期驻留管线·定谳探针(2026-10-06):exportTo-WASM 段账的浏览器域分解。
//   node 域微账(tests/lw-verdict-bench)已定谳 kernel 主导(77%);本探针在【部署域】
//   (worker 线程,活机)复测四段:窗口上传(行拷)/内核(lightExport)/读回/整片 bulk
//   上传变体——判定驻留处方收益上界与 CutD(bulk 上传)的真实可省量。
//   A1 臂 ?lightworker=1&lightwasm=1(缺省态)+ A0 臂 ?lightworker=1&lightwasm=0(对照)。
//   段账台架=worker evaluate 内合成世界直呼 exports(经 __lightWasmExportsForTest 测试钩;
//   src 零改动)。运行:
//   SW_ORIGIN=http://localhost:5218 node tools/run-diag.mjs --timeout=280000 scripts/_lw-resident-verdict-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, teleport, nextFrame, godMode } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5218';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

async function workerEval(page, fn, arg = null) {
  for (const w of page.workers()) {
    if (!w.url().includes('LightWorker')) continue;
    return await w.evaluate(fn, arg).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
  }
  return null;
}

// ---- 段账台架(worker 域;合成世界=1080p 游戏形 + worker 形切片 store) ----
const SEGMENTS = () => {
  (async () => {
    if (globalThis.__lwSeg) return;
    const LW = await import('/src/wasm/lightWasm.ts');
    const TS = await import('/src/lighting/TileLightScanner.ts');
    await LW.ensureLightWasm();
    const ex = LW.__lightWasmExportsForTest();
    if (!ex) { globalThis.__lwSeg = { err: 'wasm not ready' }; return; }
    const cap = 1 << 18;
    const mem = ex.memory;
    const V = {
      type: new Uint16Array(mem.buffer, ex.lightTypeBuf(), cap),
      flags: new Uint8Array(mem.buffer, ex.lightFlagsBuf(), cap),
      fx: new Uint16Array(mem.buffer, ex.lightFxBuf(), cap),
      fy: new Uint16Array(mem.buffer, ex.lightFyBuf(), cap),
      wall: new Uint16Array(mem.buffer, ex.lightWallBuf(), cap),
      liq: new Uint8Array(mem.buffer, ex.lightLiqBuf(), cap),
      liqT: new Uint8Array(mem.buffer, ex.lightLiqTBuf(), cap),
      half: new Uint8Array(mem.buffer, ex.lightHalfBuf(), cap),
      slope: new Uint8Array(mem.buffer, ex.lightSlopeBuf(), cap),
      wire: new Uint8Array(mem.buffer, ex.lightWireBuf(), cap),
      paint: new Uint8Array(mem.buffer, ex.lightPaintBuf(), cap),
      paintWall: new Uint8Array(mem.buffer, ex.lightPaintWallBuf(), cap),
      coat: new Uint8Array(mem.buffer, ex.lightCoatBuf(), cap),
      r: new Float32Array(mem.buffer, ex.lightRBuf(), cap),
      g: new Float32Array(mem.buffer, ex.lightGBuf(), cap),
      b: new Float32Array(mem.buffer, ex.lightBBuf(), cap),
      mask: new Uint8Array(mem.buffer, ex.lightMaskBuf(), cap),
      lut: new Uint8Array(mem.buffer, ex.lightLutBuf(), cap),
      sp: new Uint32Array(mem.buffer, ex.lightSpListBuf(), cap),
    };
    // 合成 store:worker 形切片(区域±16),游戏形内容(土/石/火把/玻璃/水/岩浆)
    const W = 181, H = 129, sw = W + 28, sh = H + 32, rx = 14, ry = 16;
    const GROUND = 76, LAVA = 116;
    const n = sw * sh;
    const st = {
      w: sw, h: sh, showInvisibleBlocks: false,
      type: new Uint16Array(n), flags: new Uint8Array(n),
      frameX: new Uint16Array(n), frameY: new Uint16Array(n),
      wall: new Uint16Array(n), liquid: new Uint8Array(n), liquidType: new Uint8Array(n),
      half: new Uint8Array(n), slope: new Uint8Array(n), wire: new Uint8Array(n),
      paint: new Uint8Array(n), paintWall: new Uint8Array(n), coat: new Uint8Array(n),
    };
    const idx = (x, y) => y * sw + x;
    for (let x = 0; x < sw; x++) {
      for (let y = GROUND; y <= GROUND + 4; y++) { const i = idx(x, y); st.type[i] = 1; st.flags[i] = 1; }
      for (let y = LAVA + 2; y < sh; y++) { const i = idx(x, y); st.type[i] = 2; st.flags[i] = 1; }
    }
    for (let x = 18; x < sw; x += 16) { const i = idx(x, GROUND - 1); st.type[i] = 4; st.flags[i] = 1; st.frameY[i] = (x % 6) * 22; }
    for (let x = 24; x < 44; x++) { const i = idx(x, GROUND - 2); st.type[i] = 54; st.flags[i] = 1; }
    for (let x = 54; x < 164; x++) for (let y = GROUND - 3; y < GROUND; y++) { const i = idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 1; }
    for (let x = 0; x < sw; x++) for (let y = LAVA; y < LAVA + 2; y++) { const i = idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 2; }
    for (let x = 0; x < sw; x++) for (let y = GROUND + 6; y < sh; y++) st.wall[idx(x, y)] = 1;
    // 窗口几何(与 lightWasmExportScan 同式)
    const wx0 = Math.max(0, rx - 1), wy0 = Math.max(0, ry - 1);
    const ww = Math.min(st.w, rx + W + 1) - wx0, wh = Math.min(st.h, ry + H + 1) - wy0;
    const nWin = ww * wh, nMap = W * H;
    const chans = [st.type, st.flags, st.frameX, st.frameY, st.wall, st.liquid, st.liquidType,
      st.half, st.slope, st.wire, st.paint, st.paintWall, st.coat];
    const views = [V.type, V.flags, V.fx, V.fy, V.wall, V.liq, V.liqT, V.half, V.slope, V.wire, V.paint, V.paintWall, V.coat];
    const upRows = () => {
      for (let ci = 0; ci < 13; ci++) {
        const src = chans[ci], dst = views[ci];
        for (let y = 0; y < wh; y++) {
          const s = (wy0 + y) * sw + wx0;
          dst.set(src.subarray(s, s + ww), y * ww);
        }
      }
    };
    const upBulk = () => { for (let ci = 0; ci < 13; ci++) views[ci].set(chans[ci]); };
    const kernelArgs = [ww, wh, rx - wx0, ry - wy0, W, H, GROUND - wy0, LAVA - wy0, wx0, wy0,
      0x9e3779b9, 0.3, 0.25, 0.4, 0.9, 0.5, 0.6, 0.36, 0.12, 0.61, 210, 0.3, 0.5, 0.2, 0.37, -1, 0, 0];
    const kernelArgsBulk = [st.w, st.h, rx, ry, W, H, GROUND, LAVA, 0, 0,
      0x9e3779b9, 0.3, 0.25, 0.4, 0.9, 0.5, 0.6, 0.36, 0.12, 0.61, 210, 0.3, 0.5, 0.2, 0.37, -1, 0, 0];
    const rA = new Float32Array(nMap), gA = new Float32Array(nMap), bA = new Float32Array(nMap), mkA = new Uint8Array(nMap);
    const lut = new Uint8Array(nMap);
    // ★Chrome 非 crossOriginIsolated 页 performance.now() 钳 100µs——单次读数全量化。
    //  批量计时(500 次/批 ×5 批取 min/500):批量总时 ≥ms 级,钳制误差摊薄 <2%。
    const best = (f) => {
      for (let k = 0; k < 1500; k++) f();   // 强置 TurboFan(产线稳态层级)
      let b = Infinity;
      for (let k = 0; k < 5; k++) {
        const t = performance.now();
        for (let q = 0; q < 500; q++) f();
        const dt = (performance.now() - t) / 500;
        if (dt < b) b = dt;
      }
      return b;
    };
    // 表上传就位(先真实扫一次)
    const tables = TS.getScanTablesPayload();
    const TBL_N = 65536, WN = 512;
    const m8 = (p) => new Uint8Array(mem.buffer, p, TBL_N);
    m8(ex.lightTblBlocks()).set(tables.blocks); m8(ex.lightTblNoSun()).set(tables.noSun);
    m8(ex.lightTblCracked()).set(tables.cracked); m8(ex.lightTblAllowWater()).set(tables.allowWater);
    m8(ex.lightTblMush()).set(tables.mushroom); m8(ex.lightTblFlicker()).set(tables.flicker);
    m8(ex.lightTblHasLight()).set(tables.hasLight); m8(ex.lightTblSpecial()).set(tables.special);
    new Int16Array(mem.buffer, ex.lightTblSheet(), TBL_N).set(tables.sheet);
    new Float32Array(mem.buffer, ex.lightTblLightR(), TBL_N).set(tables.lightR);
    new Float32Array(mem.buffer, ex.lightTblLightG(), TBL_N).set(tables.lightG);
    new Float32Array(mem.buffer, ex.lightTblLightB(), TBL_N).set(tables.lightB);
    new Uint8Array(mem.buffer, ex.lightTblWallLight(), WN).set(tables.wallLight);
    new Uint8Array(mem.buffer, ex.lightTblWallEmHas(), WN).set(tables.wallEmHas);
    new Uint8Array(mem.buffer, ex.lightTblWallEmGated(), WN).set(tables.wallEmGated);
    new Float32Array(mem.buffer, ex.lightTblWallEmR(), WN).set(tables.wallEmR);
    new Float32Array(mem.buffer, ex.lightTblWallEmG(), WN).set(tables.wallEmG);
    new Float32Array(mem.buffer, ex.lightTblWallEmB(), WN).set(tables.wallEmB);
    new Float64Array(mem.buffer, ex.lightTblTorch(), 72).set(tables.torch);
    new Float64Array(mem.buffer, ex.lightTblGlass(), 21).set(tables.glass);
    new Float64Array(mem.buffer, ex.lightTblPaint(), 768).set(tables.paint);
    m8(ex.lightTblTogAxis()).set(tables.togAxis);
    new Uint16Array(mem.buffer, ex.lightTblTogDelta(), TBL_N).set(tables.togDelta);
    ex.lightSetPixelBlock(tables.pixelBlockId);
    ex.lightMarkTablesReady();
    // 段账(min-of-40,TurboFan 预热)
    const out = {};
    out.uploadRows = best(upRows);
    upRows();
    out.kernelWin = best(() => ex.lightExport(...kernelArgs));
    out.uploadBulk = best(upBulk);
    upBulk();
    out.kernelBulk = best(() => ex.lightExport(...kernelArgsBulk));
    // ★产线时序账:上传→内核紧邻(每次迭代先传后跑,数据新鲜度=产线态)——
    //  隔离热循环内核账会因 L2 常驻低估新鲜数据成本,上界失真;合流账为判准。
    out.flowWin = best(() => { upRows(); ex.lightExport(...kernelArgs); });
    out.flowBulk = best(() => { upBulk(); ex.lightExport(...kernelArgsBulk); });
    // bulk 与 window 布局位级对拍(同世界两种布局产物)
    upRows();
    const rcW = ex.lightExport(...kernelArgs);
    const snapW = { r: V.r.slice(0, nMap), g: V.g.slice(0, nMap), b: V.b.slice(0, nMap), mask: V.mask.slice(0, nMap), sp: V.sp.slice(0, Math.max(rcW, 0)), rc: rcW };
    upBulk();
    const rcB = ex.lightExport(...kernelArgsBulk);
    let bitDiff = -1;
    for (let i = 0; i < nMap && bitDiff < 0; i++) {
      if (V.r[i] !== snapW.r[i] || V.g[i] !== snapW.g[i] || V.b[i] !== snapW.b[i] || V.mask[i] !== snapW.mask[i]) bitDiff = i;
    }
    out.bulkVsWinBitDiff = bitDiff;
    out.bulkVsWinRc = rcW + '/' + rcB;
    out.readback = best(() => {
      rA.set(V.r.subarray(0, nMap)); gA.set(V.g.subarray(0, nMap));
      bA.set(V.b.subarray(0, nMap)); mkA.set(V.mask.subarray(0, nMap));
    });
    out.blurIn = best(() => {
      V.r.set(rA.subarray(0, nMap)); V.g.set(gA.subarray(0, nMap)); V.b.set(bA.subarray(0, nMap));
      V.mask.set(mkA.subarray(0, nMap)); V.lut.set(lut.subarray(0, nMap));
    });
    out.blurKernel = best(() => ex.lightBlur(W, H, 4, 0.86, 0.64, 0.52, 0.90, 0.88, 0.92, 0.74, 0.72, 0.80));
    out.blurOut = best(() => {
      rA.set(V.r.subarray(0, nMap)); gA.set(V.g.subarray(0, nMap)); bA.set(V.b.subarray(0, nMap));
    });
    out.present = best(() => {
      const scale = 1.2 * 255;
      for (let i = 0; i < nMap; i++) { const vr = rA[i] * scale; mkA[i] = vr >= 255 ? 255 : vr | 0; }
    });
    out.enabled = LW.lightWasmEnabled();
    globalThis.__lwSeg = out;
  })();
  return 'installing';
};

const READ_SEG = async () => {
  for (let i = 0; i < 120; i++) {
    if (globalThis.__lwSeg && globalThis.__lwSeg.uploadRows) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return globalThis.__lwSeg ?? { err: 'harness timeout' };
};

const INSTALL = () => {
  (async () => {
    if (globalThis.__swScanProf) return;
    const LE = await import('/src/lighting/LightingEngine.ts');
    const TS = await import('/src/lighting/TileLightScanner.ts');
    const prof = { compute: 0, computeN: 0, scan: 0, scanN: 0, blur: 0, blurN: 0, exportTo: 0, exportToN: 0 };
    globalThis.__swScanProf = prof;
    const wrap = (proto, key, k) => {
      const o = proto[key];
      if (typeof o !== 'function') return;
      proto[key] = function (...a) {
        const t = performance.now();
        const r = o.apply(this, a);
        prof[k] += performance.now() - t;
        prof[k + 'N']++;
        return r;
      };
    };
    wrap(LE.LightingEngine.prototype, 'compute', 'compute');
    wrap(LE.LightingEngine.prototype, 'processScan', 'scan');
    wrap(LE.LightingEngine.prototype, 'processBlurAndPresent', 'blur');
    wrap(TS.TileLightScanner.prototype, 'exportTo', 'exportTo');
  })();
  return 'installing';
};

const READ = async () => {
  const p = globalThis.__swScanProf;
  const avg = (k) => (p && p[k + 'N'] > 0 ? +(p[k] / p[k + 'N']).toFixed(4) : null);
  let wasmStats = null;
  try {
    const m = await import('/src/wasm/lightWasm.ts');
    wasmStats = { ...m.__lightWasmStats, ready: m.lightWasmReady() };
  } catch (e) { wasmStats = { err: String(e).slice(0, 80) }; }
  return {
    prof: p ? { exportToMs: avg('exportTo'), exportToN: p.exportToN, blurMs: avg('blur'), blurN: p.blurN, computeMs: avg('compute'), computeN: p.computeN } : null,
    wasmStats,
  };
};

async function samplePhase(page, frames, tag) {
  await workerEval(page, () => { const p = globalThis.__swScanProf; if (p) { for (const k of Object.keys(p)) p[k] = 0; } });
  const per = Math.max(1, Math.floor(frames / 4));
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < per; k++) await nextFrame(page);
  }
  const wd = await workerEval(page, READ);
  console.log(`  [${tag}] ${JSON.stringify(wd?.prof ?? wd)} wasm=${JSON.stringify(wd?.wasmStats?.scanRuns)}`);
  return wd;
}

const browser = await launchBrowser({});
const pageErrors = [];

async function arm(tag, urlSuffix, { bootOnly = false } = {}) {
  console.log(`\n======== ${tag} 臂(${urlSuffix}) ========`);
  const page = await openPage(browser, { errors: pageErrors });
  await page.goto(ORIGIN + '/?' + urlSuffix + '&pbust=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  let boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) {
    if (bootOnly) { console.log(`  [${tag}] 预热臂 bootstrap=${boot.why}(冷桥牺牲位,不计账)`); await page.close(); return null; }
    chk(`${tag}: bootstrap`, false, boot.why); await page.close(); return null;
  }
  if (bootOnly) { console.log(`  [${tag}] 预热臂 ok(桥已热)`); await page.close(); return null; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) { chk(`${tag}: createGame`, false, gen.why); await page.close(); return null; }
  await godMode(page, true);
  await workerEval(page, INSTALL);
  await nextFrame(page);
  const idle = await samplePhase(page, 60, tag + ':静置');
  const winfo = await page.evaluate(() => {
    const g = window.__swGame;
    return { w: g.world.w, h: g.world.h, surf: g.world.groundLevel ?? 0 };
  });
  await teleport(page, Math.floor(winfo.w / 2) * 16, Math.max(80, (winfo.surf - 70) * 16));
  const fall = await samplePhase(page, 240, tag + ':下坠');
  await page.evaluate(() => { window.__swGame.camera.zoom = 0.5; });
  const zoom = await samplePhase(page, 120, tag + ':zoom-out');
  await page.evaluate(() => { window.__swGame.camera.zoom = 1; });
  // 段账台架(★主线程域跑——worker 域会被 2s 看门狗 terminate;同浏览器同引擎,
  //  WASM 段账数字等价;阻塞主线程 ~5s 在相位采样之后,不污染帧账)
  await page.evaluate(SEGMENTS).catch((e) => console.log(`  [${tag}:段账安装] ${String(e).slice(0, 120)}`));
  const seg = await page.evaluate(READ_SEG).catch((e) => ({ evalErr: String(e).slice(0, 120) }));
  console.log(`  [${tag}:段账] ${JSON.stringify(seg)}`);
  await page.close();
  return { idle, fall, zoom, seg };
}

try {
  // ★预热臂(探针框架已知 flake:冷臂桥等 >180s 偶发,热身后必过——先跑一次丢弃)
  await arm('WARMUP', 'lightworker=1&lightwasm=1', { bootOnly: true });
  const A1 = await arm('A1', 'lightworker=1&lightwasm=1');
  const A0 = await arm('A0', 'lightworker=1&lightwasm=0');
  console.log('\n======== 对账 ========');
  chk('A1: worker scan 核 WASM 接通(scanRuns>0)', (A1?.idle?.wasmStats?.scanRuns ?? 0) > 0, JSON.stringify(A1?.idle?.wasmStats));
  chk('A0: 全 JS 态(scanRuns=0)', (A0?.idle?.wasmStats?.scanRuns ?? 0) === 0, JSON.stringify(A0?.idle?.wasmStats));
  chk('A1: 段账台架产出', !!(A1?.seg && A1.seg.uploadRows), JSON.stringify(A1?.seg?.err ?? 'ok'));
  if (A1?.seg) {
    const s = A1.seg;
    chk('段账: bulk 布局与 window 布局产物位级一致', s.bulkVsWinBitDiff === -1, `diffIdx=${s.bulkVsWinBitDiff} rc=${s.bulkVsWinRc}`);
    const cutD = s.uploadRows - s.uploadBulk;
    const cutABC = s.readback + (s.blurIn - 0.0005) + s.blurOut;
    console.log(`  [browser 上界] CutD(rows→bulk)=${cutD.toFixed(4)}ms  CutA(免读回)=${s.readback.toFixed(4)}ms  CutB(blur免拷入)≈${(s.blurIn - 0.0005).toFixed(4)}ms  CutC(blur免拷出)=${s.blurOut.toFixed(4)}ms  合计≈${(cutD + cutABC).toFixed(4)}ms`);
    console.log(`  [browser 产线时序账] flowWin(行拷+内核)=${s.flowWin.toFixed(4)}ms  flowBulk(整片+内核)=${s.flowBulk.toFixed(4)}ms  净差=${(s.flowWin - s.flowBulk).toFixed(4)}ms`);
    console.log(`  [browser 段账] uploadRows=${s.uploadRows.toFixed(4)} kernelWin=${s.kernelWin.toFixed(4)} uploadBulk=${s.uploadBulk.toFixed(4)} kernelBulk=${s.kernelBulk.toFixed(4)} readback=${s.readback.toFixed(4)} blurIn=${s.blurIn.toFixed(4)} blurKernel=${s.blurKernel.toFixed(4)} blurOut=${s.blurOut.toFixed(4)} present=${s.present.toFixed(4)}`);
  }
  chk('全程零页面错误', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
  console.log('\n页面错误账:', pageErrors.length, JSON.stringify(pageErrors.slice(0, 6)));
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.ok).length;
console.log(`\n[lw-resident-verdict-probe] 台账: ${results.length - fails}/${results.length} PASS`);
process.exit(fails === 0 ? 0 : 2);
