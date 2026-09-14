// IIII249 ?shinebudget=<ms> A/B 探针(flag off/on 双臂)+ 追赶期量化 + 缓存无重烘抖动
// + 多分辨率/降载面 + 视觉条带。
//
// 仪器:
//   · 帧时:armPerfInstrumentation+installFrameProbe(页内 rAF 真实时钟,per-frame dts)
//     + createPerfRecorder 分段(fps.max=最差帧 ms;有头 Chrome+GPU-metal,对齐
//     IIIRS247/IIIII247 仪器口径——headless rAF 节流会整体失真,禁用)。
//   · 机制面:动态 import /src/render/TileShine.ts 读 shineStats(预算模式计数器:
//     bakes 停涨+hits 单调=无重烘抖动;catchupMax/catchupN=chunk 出现→高光完成帧数;
//     pending 曲线=待烘队列排空过程)。
//   · 等价面见 _iii249-equiv.mjs(烘焙产物摘要,与 A/B 分仪器)。
//
// 用法(game/ 下,有头):
//   SW_ORIGIN=http://localhost:5299 node tools/run-diag.mjs --timeout=1800000 \
//     scripts/_iii249-shine-ab.mjs --mode=transit --out=/tmp/iii249-out
//   mode=transit  双臂 A/B:desert→dungeon 长 transit(IIIRS247 66.4ms 段),flag off/on
//   mode=catchup  追赶期三场景(普通移动/传送/地牢高速)flag on 逐帧 shineStats 曲线
//                 + flag off 像素级高光稳定对照 + 视觉条带截图
//   mode=steady   驻留 600 帧缓存无重烘抖动(bakes Δ=0,hits 单调)
//   mode=matrix   多分辨率(1280/1920)与 CPU 降载(4×)transit 短臂
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { camSnapTo } from '../tools/probe/lib/camera.mjs';
import { nextFrame } from '../tools/probe/lib/pump.mjs';
import { discoverBiomeStops, installTourDriver, tourState } from '../tools/probe/lib/perf-scenarios.mjs';
import { armPerfInstrumentation, installFrameProbe, createPerfRecorder } from '../tools/probe/lib/perf.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

function argVal(name, dflt = null) {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const j = process.argv.findIndex((a) => a.startsWith(name + '='));
  return j !== -1 ? process.argv[j].slice(name.length + 1) : dflt;
}
const MODE = argVal('--mode', 'transit');
const OUT = argVal('--out', '/tmp/iii249-out');
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5299';
const SEED = '05162020';
const BUDGET = argVal('--budget', '4');          // flag on 臂的 shinebudget 值
mkdirSync(join(OUT, 'strips'), { recursive: true });
mkdirSync(join(OUT, 'segs'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[ab249]', ...a);

/** 打开一臂页面(flag 查询参数注入)。 */
async function openArm(browser, { flagQuery = '', viewport = null } = {}) {
  const page = await openPage(browser, { errors: [] });
  if (viewport) await page.setViewport(viewport);
  page.__probeOrigin = ORIGIN;
  await armPerfInstrumentation(page, {});          // 必须导航前装
  await cleanStorage(page, {});
  const ok = await gotoApp(page, ORIGIN, { extraQuery: flagQuery, tries: 30 });
  if (!ok) throw new Error('goto failed');
  await waitForBridge(page);
  const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', pinRandom: 913, settleMs: 600 });
  if (!gen.ok) throw new Error('createGame: ' + gen.why);
  await godMode(page, true);
  await installFrameProbe(page);
  return page;
}

/** 双站 transit 段采集(desert→dungeon;近邻序即表序)。返回段 map。 */
async function tourTransit(page, rec, { speedTps = 40, dwellMs = 5000, log: lg = () => {} } = {}) {
  const scan = await discoverBiomeStops(page, { stride: 4, minCount: 12 });
  if (scan.why) throw new Error('scan: ' + scan.why);
  const pick = (k) => scan.stops.find((s) => s.key === k && s.found);
  const a = pick('desert'), b = pick('dungeon');
  if (!a || !b) throw new Error('stops missing: ' + JSON.stringify({ a: !!a, b: !!b }));
  const route = [
    { key: 'desert', label: a.label, idx: 0, x: a.tx * 16, y: a.ty * 16, dwellMs },
    { key: 'dungeon', label: b.label, idx: 1, x: b.tx * 16, y: b.ty * 16, dwellMs },
  ];
  lg(`route: desert(${a.tx},${a.ty}) → dungeon(${b.tx},${b.ty}) dist=${(Math.hypot(b.tx - a.tx, b.ty - a.ty) / 16).toFixed(0)} tiles`);
  await installTourDriver(page, { route, speedTps });
  const segs = {};
  let open = null, lastPhase = null;
  const endOpen = async () => {
    if (!open) return null;
    const seg = await rec.endSegment();
    lg(`seg ${seg.name}: mean=${seg.fps.mean} p95=${seg.fps.p95} max=${seg.fps.max}ms low1=${seg.fps.low1} frames=${seg.fps.frames}`);
    segs[seg.name] = seg;
    open = null;
    return seg;
  };
  const t0 = Date.now();
  let guard = 0;
  while (guard++ < 200000) {
    if (Date.now() - t0 > 12 * 60_000) { lg('超预算强收'); await endOpen(); break; }
    const st = await tourState(page);
    if (!st.installed || st.done) { await endOpen(); break; }
    const pk = `${st.phase}|${st.fromKey ?? ''}|${st.toKey ?? ''}`;
    if (pk !== lastPhase) {
      await endOpen();
      if (st.phase === 'dwell' && st.toKey) {
        await rec.startSegment(`dwell:${st.toKey}`, { kind: 'dwell' });
        open = rec;
      } else if (st.phase === 'transit' && st.fromKey && st.toKey) {
        await rec.startSegment(`transit:${st.fromKey}~${st.toKey}`, { kind: 'transit' });
        open = rec;
      }
      lastPhase = pk;
    }
    await sleep(200);
  }
  await endOpen();
  return segs;
}

/** 页内 shineStats 采样器:rAF 循环采 N 帧 {t,pending,hits,bakes,resumes,frames,catchupMax,catchupN}。 */
async function sampleShine(page, frames, { every = 1 } = {}) {
  return page.evaluate(async ({ frames, every }) => {
    const TS = await import('/src/render/TileShine.ts');
    const rows = [];
    await new Promise((res) => {
      let n = 0;
      const tick = () => {
        const s = TS.shineStats;
        if (n % every === 0) {
          rows.push({ i: n, pending: s.pending, hits: s.hits, bakes: s.bakes, resumes: s.resumes,
            frames: s.frames, catchupMax: s.catchupMax, catchupN: s.catchupN, immediate: s.immediate });
        }
        if (++n > frames) { res(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return rows;
  }, { frames, every });
}

/** pocket 场景(与 _iii249-equiv 同配方;追赶期/稳态用)。fromX = 扫描起点(双 pocket 用)。 */
async function buildPocket(page, fromX = 200) {
  return page.evaluate((fx) => {
    const g = window.__swGame;
    const st = g.world.store;
    const T = (k) => window.__swTiles[k];
    const stone = T('stone'), ore = T('ore_iron'), gem = T('v_262_amethystgemspark'), torch = T('torch');
    const gy = Math.floor(g.world.groundLevel) + 120;
    let cx = -1, cy = -1;
    outer: for (let x = fx; x < st.w - 220; x += 3) {
      for (let y = gy; y < Math.min(gy + 220, st.h - 20); y += 3) {
        if (st.inBounds(x + 26, y + 14) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === stone) { cx = x; cy = y; break outer; }
      }
    }
    if (cx < 0) return { err: 'no pocket' };
    for (let y = cy - 10; y <= cy + 3; y++) for (let x = cx - 13; x <= cx + 12; x++) st.setTileSilent(x, y, 0, 0, 0);
    for (let x = cx - 13; x <= cx + 12; x++) { st.setTileSilent(x, cy + 4, stone, 0, 0); st.setTileSilent(x, cy + 5, stone, 0, 0); st.setTileSilent(x, cy - 11, stone, 0, 0); }
    for (let x = cx - 12; x <= cx + 11; x++) for (let r = 0; r < 8; r++) st.setTileSilent(x, cy - 9 + r, r === 7 ? gem : ore, 0, 0);
    if (torch !== undefined) st.setTileSilent(cx - 11, cy + 3, torch, 0, 0);
    return { cx, cy };
  }, fromX);
}

/** shineStats 复位(场景边界,追赶计量按场景切账)。 */
async function resetStats(page) {
  await page.evaluate(async () => {
    const TS = await import('/src/render/TileShine.ts');
    TS.shineStats.reset();
  });
}

/** 像素级高光爬升曲线:目标区(世界格矩形)逐帧亮度均值,直至稳定(参考=末帧段均值)。 */
async function sampleLuma(page, rect, frames) {
  return page.evaluate(async ({ rect, frames }) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const rows = [];
    const sample = () => {
      const cam = g.camera, z = cam.zoom ?? 1;
      const sx = Math.round((rect.x0 * 16 - (cam.x - cv.width / 2 / z)) * z);
      const sy = Math.round((rect.y0 * 16 - (cam.y - cv.height / 2 / z)) * z);
      const w = Math.round((rect.x1 - rect.x0) * 16 * z), h = Math.round((rect.y1 - rect.y0) * 16 * z);
      if (w <= 0 || h <= 0 || sx < 0 || sy < 0 || sx + w > cv.width || sy + h > cv.height) return -1;
      const d = c2.getImageData(sx, sy, w, h).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return s / (d.length / 4);
    };
    await new Promise((res) => {
      let n = 0;
      const tick = () => {
        rows.push(sample());
        if (++n >= frames) { res(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const tail = rows.slice(-30).filter((v) => v >= 0);
    const ref = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);
    // 稳定帧数:亮度首次进入参考 ±2% 带之后的帧号
    let stableAt = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] < 0) continue;
      let ok = true;
      for (let j = i; j < Math.min(rows.length, i + 12); j++) {
        if (rows[j] >= 0 && Math.abs(rows[j] - ref) > Math.abs(ref) * 0.02) { ok = false; break; }
      }
      if (ok) { stableAt = i; break; }
    }
    return { rows, ref, stableAt };
  }, { rect, frames });
}

// ─────────────────────────── mode: transit(A/B 双臂) ───────────────────────────
async function modeTransit(browser) {
  const arms = [];
  for (const [tag, q] of [['off', ''], ['on', `?shinebudget=${BUDGET}`]]) {
    log(`== arm ${tag} (query='${q || '(none)'}') ==`);
    const page = await openArm(browser, { flagQuery: q });
    try {
      const rec = createPerfRecorder(page, { outDir: join(OUT, 'segs'), scenario: `iii249-transit-${tag}` });
      const segs = await tourTransit(page, rec, { speedTps: 40, dwellMs: 5000, log });
      const key = Object.keys(segs).find((k) => k.startsWith('transit:'));
      const t = key ? segs[key].fps : null;
      arms.push({ tag, query: q, seg: key, fps: t, all: Object.fromEntries(Object.entries(segs).map(([k, s]) => [k, s.fps])) });
    } finally {
      await page.close().catch(() => {});
    }
  }
  const [off, on] = arms;
  log('=== A/B 结论(transit:desert~dungeon 最差帧 fps.max) ===');
  log(`off: max=${off.fps?.max}ms p95=${off.fps?.p95}ms mean=${off.fps?.mean} frames=${off.fps?.frames}`);
  log(`on : max=${on.fps?.max}ms p95=${on.fps?.p95}ms mean=${on.fps?.mean} frames=${on.fps?.frames}`);
  return { arms };
}

// ───────────────────── mode: catchup(追赶期三场景+条带) ─────────────────────
async function modeCatchup(browser) {
  const result = {};
  for (const [tag, q] of [['off', ''], ['on', `?shinebudget=${BUDGET}`]]) {
    log(`== catchup arm ${tag} ==`);
    const page = await openArm(browser, { flagQuery: q });
    try {
      const pocketA = await buildPocket(page, 200);
      if (pocketA.err) throw new Error(pocketA.err);
      const pocketB = await buildPocket(page, pocketA.cx + 160);   // 远端新视野(传送场景目标)
      if (pocketB.err) throw new Error(pocketB.err);
      log(`pocketA(${pocketA.cx},${pocketA.cy}) pocketB(${pocketB.cx},${pocketB.cy})`);
      await camSnapTo(page, pocketA.cx * 16, pocketA.cy * 16);
      await page.evaluate(() => { window.__swGame.paused = false; });
      for (let i = 0; i < 150; i++) await nextFrame(page);   // A 面全暖
      await resetStats(page);

      // 场景① 普通移动:pocket A → +40 格(40tps 短腿)
      await installTourDriver(page, {
        route: [
          { key: 'a', label: 'a', idx: 0, x: (pocketA.cx - 8) * 16, y: (pocketA.cy - 2) * 16, dwellMs: 1200 },
          { key: 'b', label: 'b', idx: 1, x: (pocketA.cx + 40) * 16, y: (pocketA.cy - 2) * 16, dwellMs: 6000 },
        ], speedTps: 40,
      });
      const walk = await sampleShine(page, 480, { every: 2 });
      await sleep(9000);
      await resetStats(page);

      // 场景② 传送:A → pocket B(整面新视野)+像素高光爬升曲线+条带截图
      await camSnapTo(page, pocketB.cx * 16, pocketB.cy * 16);
      const rect = { x0: pocketB.cx - 8, y0: pocketB.cy - 7, x1: pocketB.cx - 4, y1: pocketB.cy - 4 };
      const lumaPromise = sampleLuma(page, rect, 480);
      const strips = [];
      for (let i = 0; i < 14; i++) {
        await sleep(320);
        try { strips.push(await page.screenshot({ path: join(OUT, 'strips', `${tag}-tp-${String(i).padStart(2, '0')}.png`) })); } catch { /* 非阻断 */ }
      }
      const tpLuma = await lumaPromise;
      const tp = await sampleShine(page, 120, { every: 2 });
      await resetStats(page);

      // 场景③ 地牢高速:dungeon(3532,550)±30/60 格 120tps 腿(IIIRS247 同站)
      await installTourDriver(page, {
        route: [
          { key: 'd0', label: 'd0', idx: 0, x: 3502 * 16, y: 550 * 16, dwellMs: 1200 },
          { key: 'd1', label: 'd1', idx: 1, x: 3592 * 16, y: 550 * 16, dwellMs: 6000 },
        ], speedTps: 120,
      });
      const fast = await sampleShine(page, 480, { every: 2 });
      await sleep(9000);
      result[tag] = { pocketA, pocketB, walk, tp, tpLuma, fast, strips: strips.length };
      const sum = (rows) => {
        const pend = rows.map((r) => r.pending);
        const firstP = pend.findIndex((v) => v > 0);
        let drainAt = -1;
        if (firstP >= 0) {
          drainAt = pend.lastIndexOf(pend[firstP]) ;   // 峰值帧号
          for (let i = firstP; i < pend.length; i++) if (pend[i] === 0) { drainAt = i; break; }
        }
        return { pendingPeak: Math.max(0, ...pend), pendingFirstAt: firstP, pendingZeroAt: drainAt,
          catchupMax: rows[rows.length - 1]?.catchupMax ?? 0, catchupN: rows[rows.length - 1]?.catchupN ?? 0,
          immediate: rows[rows.length - 1]?.immediate ?? 0 };
      };
      log(`[${tag}] walk=${JSON.stringify(sum(walk))}`);
      log(`[${tag}] tp=${JSON.stringify(sum(tp))} luma.stableAt=${tpLuma.stableAt} ref=${tpLuma.ref.toFixed(1)}`);
      log(`[${tag}] fast=${JSON.stringify(sum(fast))}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  return result;
}

// ──────────────────── mode: steady(缓存无重烘抖动) ────────────────────
async function modeSteady(browser) {
  const page = await openArm(browser, { flagQuery: `?shinebudget=${BUDGET}` });
  try {
    const pocket = await buildPocket(page);
    if (pocket.err) throw new Error(pocket.err);
    await camSnapTo(page, pocket.cx * 16, pocket.cy * 16);
    await freezeClock(page, { tod: 0.375 });
    for (let i = 0; i < 150; i++) await nextFrame(page);   // 预热全暖
    const before = await page.evaluate(async () => {
      const TS = await import('/src/render/TileShine.ts');
      return JSON.parse(JSON.stringify(TS.shineStats));
    });
    const rows = await sampleShine(page, 600, {});
    const after = rows[rows.length - 1];
    const verdict = {
      bakeGrew: after.bakes - before.bakes,
      resumeGrew: after.resumes - before.resumes,
      hitsGrew: after.hits - before.hits,
      hitsMonotonic: rows.every((r, i) => i === 0 || r.hits >= rows[i - 1].hits),
      pendingAlwaysZero: rows.every((r) => r.pending === 0),
    };
    log('steady verdict:', JSON.stringify(verdict));
    return { before, after, verdict };
  } finally {
    await page.close().catch(() => {});
  }
}

// ─────────────── mode: matrix(多分辨率 + CPU 降载短 transit) ───────────────
async function modeMatrix(browser) {
  const runs = [];
  const cases = [
    { tag: '1280-on', q: `?shinebudget=${BUDGET}`, vp: { width: 1280, height: 800 } },
    { tag: '1920-on', q: `?shinebudget=${BUDGET}`, vp: { width: 1920, height: 1080 } },
    { tag: '1280-on-cpu4x', q: `?shinebudget=${BUDGET}`, vp: { width: 1280, height: 800 }, cpu4x: true },
  ];
  for (const c of cases) {
    log(`== matrix ${c.tag} ==`);
    const page = await openArm(browser, { flagQuery: c.q, viewport: c.vp });
    try {
      if (c.cpu4x) {
        const cdp = await page.createCDPSession();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      const rec = createPerfRecorder(page, { outDir: join(OUT, 'segs'), scenario: `iii249-${c.tag}` });
      const segs = await tourTransit(page, rec, { speedTps: 60, dwellMs: 3000, log });
      const key = Object.keys(segs).find((k) => k.startsWith('transit:'));
      runs.push({ tag: c.tag, fps: key ? segs[key].fps : null, seg: key });
      log(`${c.tag}: ${JSON.stringify(runs[runs.length - 1].fps)}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  return { runs };
}

// ───────────── mode: resumecheck(断行续烘逐位恒等:页内同源证明) ─────────────
//  跨页对拍(shimmer 扫频+双页 budget 1/1000)曾被底图换代时序差污染(bakes 181 vs
//  224)——改为页内同源:shineDebugResumeIdentity 对同一 chunk 一次烘完 vs 按
//  splits 断开+续烘到完成,产物像素校验和逐字节对拍;覆盖 dense/稀疏/加法支 chunk。
async function modeResumeCheck(browser) {
  const page = await openArm(browser, { flagQuery: `?shinebudget=${BUDGET}` });
  try {
    const pocket = await buildPocket(page, 200);
    if (pocket.err) throw new Error(pocket.err);
    await camSnapTo(page, pocket.cx * 16, pocket.cy * 16);
    for (let i = 0; i < 60; i++) await nextFrame(page);
    const result = await page.evaluate(async ({ pocket }) => {
      const g = window.__swGame;
      const TS = await import('/src/render/TileShine.ts');
      // 取样 chunk:pocket 墙心(dense 乘法支)/gem 行(加法支)/房间空气(空)/边缘(跨 chunk)
      const picks = [
        { cx: Math.floor(pocket.cx / 16), cy: Math.floor((pocket.cy - 8) / 16), tag: 'wall-dense' },
        { cx: Math.floor((pocket.cx + 8) / 16), cy: Math.floor((pocket.cy - 2) / 16), tag: 'gem-add' },
        { cx: Math.floor(pocket.cx / 16), cy: Math.floor((pocket.cy - 12) / 16), tag: 'room-air' },
        { cx: Math.floor((pocket.cx - 13) / 16), cy: Math.floor(pocket.cy / 16), tag: 'floor-edge' },
        { cx: Math.floor((pocket.cx + 12) / 16), cy: Math.floor((pocket.cy + 4) / 16), tag: 'mixed' },
      ];
      const rows = [];
      for (const p of picks) {
        const r = TS.shineDebugResumeIdentity(g.renderer.atlas, g.world, p.cx, p.cy, 0, [1, 2, 3, 5, 8, 13, 15]);
        rows.push({ tag: p.tag, cx: p.cx, cy: p.cy, results: r });
      }
      return rows;
    }, { pocket });
    let allEqual = true;
    for (const row of result) {
      const bad = row.results.filter((r) => !r.equal);
      if (bad.length) allEqual = false;
      log(`${row.tag}(${row.cx},${row.cy}): ${row.results.length - bad.length}/${row.results.length} splits 逐位恒等${bad.length ? ' ✗ DIFF at splits ' + bad.map((b) => b.split).join(',') : ''}`);
    }
    log(`resume-identity: ${allEqual ? 'ALL EQUAL(逐位恒等成立)' : 'DIFF!!'}`);
    return { allEqual, rows: result };
  } finally {
    await page.close().catch(() => {});
  }
}

// ───────────── mode: visual(昼夜双拍+ON/OFF 高光对照) ─────────────
async function modeVisual(browser) {
  const page = await openArm(browser, { flagQuery: `?shinebudget=${BUDGET}` });
  const shots = [];
  try {
    const pocket = await buildPocket(page, 200);
    if (pocket.err) throw new Error(pocket.err);
    await camSnapTo(page, pocket.cx * 16, pocket.cy * 16);
    await freezeClock(page, { tod: 0.375 });
    for (let i = 0; i < 120; i++) await nextFrame(page);
    const grab = async (name) => {
      const url = await page.evaluate(() => new Promise((res) => {
        const g = window.__swGame;
        let n = 0;
        const tick = () => { if (++n < 3) { requestAnimationFrame(tick); return; } res(g.renderer.canvas.toDataURL('image/png')); };
        requestAnimationFrame(tick);
      }));
      const { writeFileSync: wf } = await import('node:fs');
      wf(join(OUT, 'strips', `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
      const { createHash } = await import('node:crypto');
      shots.push({ name, sha: createHash('sha256').update(url).digest('hex') });
      log('shot', name);
    };
    await grab('pocket-on-day');
    // 夜(地表 tod 才有昼夜差;地下恒定——这里切回地表站拍全屏氛围)
    await page.evaluate(() => { window.__swGame.renderer.monoFilters.shimmerAlpha = 0; });
    await grab('pocket-on');
    await page.evaluate(() => { globalThis.__SW_SHINE_OFF = true; });
    await grab('pocket-off');
    await page.evaluate(() => { globalThis.__SW_SHINE_OFF = false; });
    // 昼/夜:同一 pocket(地下光照不随时钟,拍地表矿墙补昼夜对照)
    const surf = await page.evaluate(() => {
      const g = window.__swGame;
      const st = g.world.store;
      const ore = window.__swTiles['ore_iron'];
      const gy = Math.floor(g.world.groundLevel);
      let sx = -1;
      for (let x = 300; x < st.w - 300; x += 2) { if (st.hasTile(x, gy - 1) && st.hasTile(x, gy)) { sx = x; break; } }
      if (sx < 0) return { err: 'no surface' };
      for (let x = sx; x < sx + 14; x++) for (let r = 0; r < 3; r++) st.setTileSilent(x, gy - 3 + r, ore, 0, 0);
      return { x: sx, y: gy - 2 };
    });
    if (!surf.err) {
      await camSnapTo(page, surf.x * 16, surf.y * 16);
      await freezeClock(page, { tod: 0.375 });
      for (let i = 0; i < 90; i++) await nextFrame(page);
      await grab('surface-day');
      await freezeClock(page, { tod: 0.95 });
      for (let i = 0; i < 90; i++) await nextFrame(page);
      await grab('surface-night');
    }
  } finally {
    await page.close().catch(() => {});
  }
  return { shots };
}

// ──────────── mode: burst(最差帧归因:逐帧 dt/renderMs/bakeMs/烘焙计数) ────────────
async function modeBurst(browser) {
  const flag = argVal('--flag', 'on');
  const page = await openArm(browser, { flagQuery: flag === 'on' ? `?shinebudget=${BUDGET}` : '' });
  try {
    const scan = await discoverBiomeStops(page, { stride: 4, minCount: 12 });
    const a = scan.stops.find((s) => s.key === 'desert' && s.found);
    const b = scan.stops.find((s) => s.key === 'dungeon' && s.found);
    await installTourDriver(page, {
      route: [
        { key: 'desert', label: 'd', idx: 0, x: a.tx * 16, y: a.ty * 16, dwellMs: 3000 },
        { key: 'dungeon', label: 'g', idx: 1, x: b.tx * 16, y: b.ty * 16, dwellMs: 5000 },
      ], speedTps: 40,
    });
    // 装帧级仪表:rAF dt + render() 耗时 + shineStats 增量
    const rows = await page.evaluate(async () => {
      const g = window.__swGame;
      const TS = await import('/src/render/TileShine.ts');
      const out = [];
      const R = g.renderer;
      const origRender = R.render.bind(R);
      let renderMs = 0;
      R.render = function (...args) {
        const t0 = performance.now();
        const r = origRender(...args);
        renderMs = performance.now() - t0;
        return r;
      };
      let last = { bakeMs: 0, bakes: 0, resumes: 0, t: performance.now() };
      await new Promise((res) => {
        let n = 0;
        const tick = () => {
          const now = performance.now();
          const dt = now - last.t;
          const s = TS.shineStats;
          out.push({
            i: n, dt: +dt.toFixed(1), renderMs: +renderMs.toFixed(1),
            bakeMs: +(s.bakeMs - last.bakeMs).toFixed(1),
            bakes: s.bakes - last.bakes, resumes: s.resumes - last.resumes,
          });
          last = { bakeMs: s.bakeMs, bakes: s.bakes, resumes: s.resumes, t: now };
          if (++n >= 3600) { res(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return out;
    });
    const top = [...rows].sort((a, b) => b.dt - a.dt).slice(0, 12);
    log('=== 最差 12 帧(30s transit 窗,flag on budget=' + BUDGET + ') ===');
    for (const r of top) log(`  dt=${r.dt}ms render=${r.renderMs}ms shineBake=${r.bakeMs}ms bakes=${r.bakes} resumes=${r.resumes}`);
    const shineCapped = rows.filter((r) => r.bakeMs > BUDGET * 1 + 8).length;
    log(`shineBake>${BUDGET + 8}ms 的帧数: ${shineCapped}/${rows.length}`);
    return { top, shineCapped, frames: rows.length };
  } finally {
    await page.close().catch(() => {});
  }
}

// ───────── mode: burstpocket(dense 高光内容 A/B:传送入 pocket 的逐帧归因) ─────────
async function modeBurstPocket(browser) {
  const arms = {};
  for (const flag of ['on', 'off']) {
    const page = await openArm(browser, { flagQuery: flag === 'on' ? `?shinebudget=${BUDGET}` : '' });
    try {
      const pocketA = await buildPocket(page, 200);
      if (pocketA.err) throw new Error(pocketA.err);
      const pocketB = await buildPocket(page, pocketA.cx + 160);
      if (pocketB.err) throw new Error(pocketB.err);
      await camSnapTo(page, pocketA.cx * 16, pocketA.cy * 16);
      await page.evaluate(() => { window.__swGame.paused = false; });
      for (let i = 0; i < 150; i++) await nextFrame(page);   // A 面全暖
      await page.evaluate(async () => { const TS = await import('/src/render/TileShine.ts'); TS.shineStats.reset(); });
      // 传送 → B(整面 dense 新视野):逐帧 dt/renderMs/shineBake/bakes/resumes
      await camSnapTo(page, pocketB.cx * 16, pocketB.cy * 16);
      const rows = await page.evaluate(async () => {
        const g = window.__swGame;
        const TS = await import('/src/render/TileShine.ts');
        const R = g.renderer;
        const origRender = R.render.bind(R);
        let renderMs = 0;
        R.render = function (...args) {
          const t0 = performance.now();
          const r = origRender(...args);
          renderMs = performance.now() - t0;
          return r;
        };
        const out = [];
        let last = { bakeMs: 0, bakes: 0, resumes: 0, t: performance.now() };
        await new Promise((res) => {
          let n = 0;
          const tick = () => {
            const now = performance.now();
            const s = TS.shineStats;
            out.push({ i: n, dt: +(now - last.t).toFixed(1), renderMs: +renderMs.toFixed(1),
              bakeMs: +(s.bakeMs - last.bakeMs).toFixed(1), bakes: s.bakes - last.bakes,
              resumes: s.resumes - last.resumes, pending: s.pending });
            last = { bakeMs: s.bakeMs, bakes: s.bakes, resumes: s.resumes, t: now };
            if (++n >= 300) { res(); return; }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return out;
      });
      const top = [...rows].sort((a, b) => b.dt - a.dt).slice(0, 6);
      const sumBake = rows.reduce((a, r) => a + r.bakeMs, 0);
      const worstDt = rows.reduce((a, r) => Math.max(a, r.dt), 0);
      const shineHeavy = rows.reduce((a, r) => Math.max(a, r.bakeMs), 0);
      arms[flag] = { top, sumBake: +sumBake.toFixed(1), worstDt, maxShineBake: +shineHeavy.toFixed(1) };
      log(`[${flag}] worstDt=${worstDt}ms maxShineBake=${arms[flag].maxShineBake}ms sumBake=${arms[flag].sumBake}ms`);
      for (const r of top) log(`   dt=${r.dt} render=${r.renderMs} shineBake=${r.bakeMs} bakes=${r.bakes} resumes=${r.resumes} pending=${r.pending}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  return arms;
}

// ─────────────────────────────── main ───────────────────────────────
const browser = await launchBrowser({
  headed: true,
  extraArgs: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [],
});
try {
  let result;
  if (MODE === 'transit') result = await modeTransit(browser);
  else if (MODE === 'catchup') result = await modeCatchup(browser);
  else if (MODE === 'steady') result = await modeSteady(browser);
  else if (MODE === 'matrix') result = await modeMatrix(browser);
  else if (MODE === 'resumecheck') result = await modeResumeCheck(browser);
  else if (MODE === 'visual') result = await modeVisual(browser);
  else if (MODE === 'burst') result = await modeBurst(browser);
  else if (MODE === 'burstpocket') result = await modeBurstPocket(browser);
  else throw new Error('unknown mode ' + MODE);
  writeFileSync(join(OUT, `ab-${MODE}.json`), JSON.stringify(result, null, 1));
  log(`written ${join(OUT, `ab-${MODE}.json`)}`);
} finally {
  await browser.close().catch(() => {});
}
