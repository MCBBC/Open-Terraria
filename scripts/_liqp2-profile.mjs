// ★液体核第二刀精确剖面（2026-10-08;liqp2 预研）——aP(drawVanillaLiquids)/lP(浸润带
//  drawLiquidBehindTilesOnly) 自耗块级拆解。方法=CDP Profiler positionTicks（行级
//  采样钉）+ dev sourcemap 映射回 TS 行 → 块区间聚合（零源码插桩=插桩中立性自证免）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=900000 scripts/_liqp2-profile.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { gotoApp } from '../tools/probe/lib/boot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const ARMS = (process.env.P2_ARMS || 'default,liqc7').split(',');
const results = {};

// ---- sourcemap 行映射（模块级缓存;decode VLQ 首段/行）----
const lineMaps = new Map();
async function lineMapFor(page, tsPath) {
  if (lineMaps.has(tsPath)) return lineMaps.get(tsPath);
  const map = await page.evaluate(async (p) => {
    const res = await fetch(p);
    const text = await res.text();
    const genLines = text.split('\n');
    const m = text.match(/\/\/[#@]\s*sourceMappingURL=(\S+)/);
    let sm = null;
    if (m) {
      // data: URI 直接 fetch（浏览器原生解码 base64/charset）——最稳
      sm = m[1].startsWith('data:')
        ? JSON.parse(await (await fetch(m[1])).text())
        : JSON.parse(await (await fetch(new URL(m[1], location.origin + p).href)).text());
    }
    if (!sm) return null;
    // decode mappings: per generated line, FIRST segment with a source → original line (0-based)
    // segment = 1 | 4 | 5 VLQ fields; ',' 分段 ';' 分行（','';' 非 base64 字符=天然终止符）
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const readVLQ = (s, st) => {
      let shift = 0, val = 0, cont = 1;
      while (cont) {
        const c = B64.indexOf(s[st.i++]);
        cont = (c & 32) !== 0;
        val += (c & 31) * Math.pow(2, shift);
        shift += 5;
      }
      // sign bit (LSB)
      const neg = val & 1;
      val = Math.floor(val / 2);
      return neg ? -val : val;
    };
    const gen2orig = [];
    let srcIdx = 0, origLine = 0, origCol = 0, nameIdx = 0;
    for (const lineStr of sm.mappings.split(';')) {
      let mapped = -1;
      if (lineStr) {
        const st = { i: 0 };
        while (st.i < lineStr.length) {
          readVLQ(lineStr, st);                    // genCol（弃）
          if (st.i < lineStr.length && lineStr[st.i] !== ',') {
            srcIdx += readVLQ(lineStr, st);
            origLine += readVLQ(lineStr, st);
            origCol += readVLQ(lineStr, st);
            if (st.i < lineStr.length && lineStr[st.i] !== ',') nameIdx += readVLQ(lineStr, st);
            if (mapped < 0) mapped = origLine;
          }
          while (st.i < lineStr.length && lineStr[st.i] === ',') st.i++;
        }
      }
      gen2orig.push(mapped);
    }
    return { gen2orig, sources: sm.sources, genLines };
  }, tsPath).catch(() => null);
  lineMaps.set(tsPath, map);
  return map;
}

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

for (const arm of ARMS) {
  const q = arm === 'default' ? '' : arm === 'liqc7' ? '?liqc7=1' : arm === 'liqp2' ? '?liqp2=1' : '';
  const nav = await gotoApp(page, ORIGIN, { extraQuery: q, tries: 20 });
  if (!nav) { console.log(`[${arm}] gotoApp FAIL`); continue; }
  const bridged = await page.waitForFunction(
    () => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld,
    { timeout: 180000, polling: 500 }).then(() => true).catch(() => false);
  if (!bridged) { console.log(`[${arm}] bridge FAIL`); continue; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261008 });
  console.log(`[${arm}] createGame:`, gen?.ok, gen?.why ?? '');
  await godMode(page, true);

  // ---- 场景:满视口水体（与 _c7-liq-census.mjs 同景——数据可比）----
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
    window.__vnow = performance.now();
    window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; window.__swGame.frame(window.__vnow); } return window.__vnow; };
  });
  await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__liqMod = m; }));
  let ready = false;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(20); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
    const s = await page.evaluate(() => ({ path: window.__swGame.renderer.bglPathUsed, inv: window.__swGame.renderer._waveLiquidInView }));
    if (s.path.startsWith('b2b-acc') && s.inv) { ready = true; break; }
  }
  console.log(`[${arm}] scene ready=${ready}`);
  const geo = await page.evaluate(() => {
    const d = window.__liqMod.liquidDebugState();
    return { win: d.window, bg: d.isBackground };
  });

  // ---- 行映射预取（transformed→TS）----
  const lm = await lineMapFor(page, '/src/render/VanillaLiquidRenderer.ts');
  console.log(`[${arm}] lineMap=${lm ? lm.gen2orig.length + ' gen lines' : 'MISS'}`);

  // ---- 采样窗:300 活帧 @50µs ----
  const cdp = await page.target().createCDPSession();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 50 });
  await cdp.send('Profiler.start');
  const tm = await page.evaluate(() => { const t = performance.now(); window.__drive(300); return performance.now() - t; });
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  const frameMs = tm / 300;

  // 函数级 self（全节点聚合）
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

  // ---- positionTicks → 块级（aP/lP 两节点）----
  const LBASE = process.env.P2_LBASE === '0' ? 0 : 1;   // v8 PositionTick 行基(1-based 缺省假设)
  const FNS = ['drawVanillaLiquids', 'drawLiquidBehindTilesOnly', 'batQuad', 'batQuadAdd', 'shimQuad', 'sparkleShimQuad',
    'texFor', 'at', 'sampleGlint', 'sampleDisplace', 'applyShimmerBaseTint', 'tileSolidLut', 'liquidCacheIsSolid',
    'inBounds', 'liquidCacheIsSolid', 'shimmerWave', 'shimmerWaves4', 'emitLiquidQuadBatch', 'emitShimRun',
    'flushRun', 'flushShimRun', 'flushAddRuns2DAndEmit', 'replayLiqRun2D', 'drawBand', 'glow', 'shimmerGlitterHue', 'shimmerFrame'];
  const row = {};
  for (const k of new Set(FNS)) { const v = (agg[k] || 0) / 1000; if (v > 0.05) row[k] = +v.toFixed(1); }
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([k, v]) => `${k}:${(v / 1000).toFixed(1)}`);

  const blocks = {};
  for (const fnName of ['drawVanillaLiquids', 'drawLiquidBehindTilesOnly']) {
    // ★同函数多节点（CDP 树按调用深度重复出现）——全节点合并
    const nds = profile.nodes.filter((n) => n.callFrame.functionName === fnName);
    if (!nds.length) { blocks[fnName] = null; continue; }
    let selfUsTot = 0, hitsTot = 0;
    const byGenLine = {};
    for (const nd of nds) {
      selfUsTot += selfUs.get(nd.id) || 0;
      hitsTot += profile.samples.filter((s) => s === nd.id).length;
      if (nd.positionTicks) for (const pt of nd.positionTicks) byGenLine[pt.line] = (byGenLine[pt.line] || 0) + pt.ticks;
    }
    const usPerTick = hitsTot > 0 ? selfUsTot / hitsTot : 0;
    const byOrig = {};
    for (const [gl, t] of Object.entries(byGenLine)) {
      const g = Number(gl) - LBASE;
      const ol = lm ? (lm.gen2orig[g] ?? -1) : -1;
      byOrig[ol] = (byOrig[ol] || 0) + t;
    }
    blocks[fnName] = { selfMs: selfUsTot / 1000, usPerTick, byOrig };
  }

  // 块区间定义（TS 行,1-based → 0-based in gen2orig: origLine 是 0-based;2026-10-08 liqp2 后重钉）
  const RANGES = [
    ['resetFills', 1519, 1531], ['P1scan', 1611, 1673], ['rescan', 1674, 1737], ['bboxScan', 1738, 1760],
    ['halfPrefill', 1761, 1776], ['P2vis', 1777, 1804], ['P3fall', 1805, 1836], ['P4walls', 1837, 1871],
    ['P5smooth', 1872, 1889], ['P6fix', 1890, 1905], ['P7corner', 1906, 1926], ['texFor_setup', 1927, 1985],
    ['wvCache', 1999, 2030], ['fgReuse', 2075, 2160], ['mainLoop', 2161, 2565],
    ['slopeEnh', 2566, 2786], ['bandLoop', 2787, 3390],
  ];
  const sumRange = (blk, a, b) => {
    if (!blk) return 0;
    let s = 0;
    for (const [ol, t] of Object.entries(blk.byOrig)) { const l = Number(ol); if (l >= a - 1 && l <= b - 1) s += t; }
    return s * blk.usPerTick / 1000;
  };

  console.log(`[${arm}] frameMs=${frameMs.toFixed(2)} window=${JSON.stringify(geo.win)}`);
  console.log(`[${arm}] [profile] total=${total.toFixed(0)}ms`);
  console.log(`[${arm}] [top]`, top.join(' '));
  console.log(`[${arm}] fn-self: aP=${row.drawVanillaLiquids ?? 0}ms band=${row.drawLiquidBehindTilesOnly ?? 0}ms batQuad=${row.batQuad ?? 0} batQuadAdd=${row.batQuadAdd ?? 0} shimQuad=${row.shimQuad ?? 0} texFor=${row.texFor ?? 0} at=${row.at ?? 0} sampleGlint=${row.sampleGlint ?? 0} sampleDisplace=${row.sampleDisplace ?? 0} tileSolidLut=${row.tileSolidLut ?? 0} liquidCacheIsSolid=${row.liquidCacheIsSolid ?? 0} applyShimmerBaseTint=${row.applyShimmerBaseTint ?? 0}`);

  const ap = blocks.drawVanillaLiquids, bd = blocks.drawLiquidBehindTilesOnly;
  if (ap && lm) {
    // 行基校验:top gen 行的 transformed 原文（两种行基假设并印,人工/自动判定）
    const topGl = Object.entries(ap.byOrig).sort((x, y) => y[1] - x[1]).slice(0, 6);
    console.log(`[${arm}] lineBaseCheck (LBASE=${LBASE}):`);
    for (const [gl, t] of topGl) {
      const g = Number(gl) - (process.env.P2_LBASE === '0' ? 0 : 1);
      const ol = lm.gen2orig[g];
      const snippet = (lm.genLines[g] || '').trim().slice(0, 70);
      console.log(`  raw=${gl}(t=${t}) g${g}→TS:${Number.isFinite(ol) && ol >= 0 ? ol + 1 : '?'} | ${snippet}`);
    }
  }
  if (ap) {
    console.log(`[${arm}] aP self=${ap.selfMs.toFixed(1)}ms block split (ms/300f):`);
    for (const [nm, a, b] of RANGES) {
      const v = sumRange(ap, a, b);
      if (v > 0.3) console.log(`  ${nm}: ${v.toFixed(1)} (${(v / ap.selfMs * 100).toFixed(0)}%)`);
    }
    // 块内 top 行
    const topLines = Object.entries(ap.byOrig).filter(([ol]) => Number(ol) >= 1561 - 1 && Number(ol) <= 2442 - 1)
      .sort((x, y) => y[1] - x[1]).slice(0, 14)
      .map(([ol, t]) => `L${Number(ol) + 1}:${(t * ap.usPerTick / 1000).toFixed(1)}`);
    console.log(`[${arm}] aP topLines:`, topLines.join(' '));
  } else console.log(`[${arm}] aP positionTicks MISSING`);
  if (bd) {
    console.log(`[${arm}] band self=${bd.selfMs.toFixed(1)}ms; topLines:`,
      Object.entries(bd.byOrig).sort((x, y) => y[1] - x[1]).slice(0, 10)
        .map(([ol, t]) => `L${Number(ol) + 1}:${(t * bd.usPerTick / 1000).toFixed(1)}`).join(' '));
  } else console.log(`[${arm}] band positionTicks MISSING`);

  results[arm] = { frameMs: +frameMs.toFixed(2), aP: row.drawVanillaLiquids ?? 0, band: row.drawLiquidBehindTilesOnly ?? 0, total: +total.toFixed(0) };
}

console.log('\n=== liqp2 profile summary (per-frame ms, 300 live frames) ===');
for (const [arm, r] of Object.entries(results)) {
  console.log(`${arm}\tframeMs=${r.frameMs}\taP=${(r.aP / 300).toFixed(3)}\tband=${(r.band / 300).toFixed(3)}`);
}
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
process.exit(0);
