// ★TileShine 三债清偿定谳探针——2026-10-06
//
// 【任务】挖掘相三笔登记债的量化与 digest 逐位对拍:
//   债1 孤儿 256² 画布 GC（重烘 churn 喂 GC≈0.1-0.3 慢帧/s）→ 画布池化刀;
//   债2 pair 换代重启浪费（partial 进度被丢弃重烘）→ 跨 pair 行级 carry 刀;
//   债3 行粒度过冲（死线只在行首检查,密集行 ~2ms+ 过冲）→ 格级断行刀。
// 【世界面】用户真实导出档(同 _shine-mine-clamp.mjs,seed 118606602)——自动钉位
//   shine2 最密 48×32 窗(确定性扫描),挖掘走廊 3-tall×40+5-tall 加宽,全量编辑表
//   150ms/格定间隔灌完(终态=全编辑已施=与帧时序抖动无关)。
// 【仪器】
//   · 256² 画布普查:createElement 包装+微任务尺寸落定计数(债1 孤儿 churn 上游
//     计数——两版同仪=差分有意义;刀后应≈池填充量,稳态趋零)。
//   · shineStats 快照 pre/mine/settled(债2 carries/carriedRows/carriesMiss;
//     bakes/catchupMax 跨版可比;债1 pool*/canvases*)。
//   · 第二 rAF 环逐帧 [ts,gap,bakeΔ,pending,heap]——债3 bakeΔ 过冲分布。
//   · digests=shineDebugChunkDigests 挖掘域盒(沉降排干后)——跨版逐位对拍通道
//     (cx,cy,q,done,hasMul,hasAdd,resumeRow,sum,sumX 共享字段;零随机备案)。
// 【运行】SW_ORIGIN=http://localhost:5214 node tools/run-diag.mjs --timeout=280000 \
//          scripts/_shine-debt-ab.mjs
//   输出 /tmp/shine-debt/<tag>.json + <tag>-digests.json(tag=SW_TAG,缺省 run)
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5214';
const WORLD_JSON = process.env.SW_WORLD_JSON || '/Users/vinlic/Downloads/map-天真的钴最高点 (4).json';
const OUT = '/tmp/shine-debt';
const TAG = process.env.SW_TAG || 'run';
const VIEW = { width: Number(process.env.SW_VW || 1280), height: Number(process.env.SW_VH || 800), deviceScaleFactor: Number(process.env.SW_DPR || 2) };
const MINE_MS = Number(process.env.SW_MINE_MS || 36_000);
const SHAFT_X = Number(process.env.SW_SHAFT_X || 1622);
const PIN_TILE = Number(process.env.SW_PIN_TILE || 885);
const TUNNEL_LEN = Number(process.env.SW_LEN || 40);
mkdirSync(OUT, { recursive: true });

const worldText = readFileSync(WORLD_JSON, 'utf8');
console.log(`world ${(worldText.length / 1048576).toFixed(1)}MB, tag=${TAG}, mine=${MINE_MS}ms`);

const browser = await launchBrowser({ headed: true, viewport: VIEW });
const errs = [];
try {
  const page = await openPage(browser, { errors: errs, maxErrors: 60 });
  installPinnedRandom(page, 118606602);
  // ★硬冻结钩（digest 可比性的根）：拦 __swGame 赋值（mainFlow onWorldReady,世界
  //   首帧前）即 no-op fixedUpdate——世界模拟零帧运行,终态内容 = 加载档 + 本探针
  //   确定性编辑表,与帧时序/装载时长完全解耦。（实体清桶不再需要——模拟根本不跑）
  await page.evaluateOnNewDocument(() => {
    let frozen = null;
    Object.defineProperty(window, '__swGame', {
      configurable: true,
      get() { return frozen; },
      set(v) {
        frozen = v;
        try { v.__simFrozen = true; v.fixedUpdate = () => {}; } catch { /* null 赋值 */ }
      },
    });
  });
  const boot = await bootstrap(page, ORIGIN);
  console.log('bootstrap:', JSON.stringify(boot));
  if (!boot.ok) process.exit(1);

  console.log('loadJson start...');
  const tLoad = Date.now();
  await front(page);
  await page.evaluate((text) => { void window.__swFlow.loadJson(text); }, worldText);
  const okGame = await waitForGame(page, { timeout: 240_000, log: (m) => console.log('  ' + m) });
  console.log('loadJson done:', okGame, `${((Date.now() - tLoad) / 1000).toFixed(1)}s`);
  if (!okGame) { await page.screenshot({ path: `${OUT}/${TAG}-loadfail.png` }); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1500));

  // ---- 钉位 + 编辑表 + 仪器 ----
  const setup = await page.evaluate(async ({ pinTile, shaftX, len: len0, shineOff, memoOff }) => {
    const g = window.__swGame;
    const st = g.world.store;
    if (shineOff) globalThis.__SW_SHINE_OFF = true;
    if (memoOff) globalThis.__SW_SHINE_MEMO_OFF = true;
    // ★硬冻结已在 __swGame setter 装好(fixedUpdate=no-op,世界零模拟帧)——此处只核验
    const simFrozen = g.__simFrozen === true;
    const m = await import('/src/render/TileShine.ts');
    const tdefs = (await import('/src/data/tiles.ts')).TILE_DEFS;
    const sheetOf = (type) => tdefs[type]?.vanilla?.sheet ?? null;
    const shine2 = m.SHINE2_SHEETS;
    let best = { dens: -1, bx: shaftX, by: pinTile };
    const W = 48, H = 32;
    for (let wy = 640; wy <= 1120 - H; wy += 8) {
      for (let wx = 1400; wx <= 1800 - W; wx += 8) {
        let n = 0;
        for (let y = wy; y < wy + H; y += 2) {
          for (let x = wx; x < wx + W; x += 2) {
            if (!st.hasTile(x, y)) continue;
            const sheet = sheetOf(st.type[st.idx(x, y)]);
            if (sheet != null && shine2.has(sheet)) n++;
          }
        }
        if (n > best.dens) best = { dens: n, bx: wx + W / 2, by: wy + H / 2 };
      }
    }
    shaftX = Math.round(best.bx); pinTile = Math.round(best.by);
    const pinY = pinTile * 16;
    const halfViewTiles = Math.floor((g.camera.viewW / (g.camera.zoom || 1)) / 16 / 2);
    const len = Math.max(12, Math.min(len0, halfViewTiles - 8));
    g.player.debugGod = true;
    g.player.x = shaftX * 16 + 8;
    g.player.y = pinY;
    g.player.vx = 0; g.player.vy = 0;
    g.player.statLife = g.player.statLifeMax2;
    if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    if (!window.__fuPinned) {
      window.__fuPinned = true;
      const fu0 = g.fixedUpdate.bind(g);
      g.fixedUpdate = (...a) => { const r = fu0(...a); g.player.y = pinY; g.player.vy = 0; g.player.vx = 0; return r; };
    }
    const edits = [];
    for (let dx = 1; dx <= len; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = shaftX + dx, y = pinTile + dy;
        if (st.inBounds(x, y) && st.hasTile(x, y)) edits.push([x, y]);
      }
    }
    for (let dx = 1; dx <= len; dx++) {
      for (const dy of [-2, 2]) {
        const x = shaftX + dx, y = pinTile + dy;
        if (st.inBounds(x, y) && st.hasTile(x, y)) edits.push([x, y]);
      }
    }
    // 256² 画布普查仪(createElement 包装;微任务里尺寸已落定)
    if (!window.__censusInstalled) {
      window.__censusInstalled = true;
      window.__c256 = 0;
      const origCreate = document.createElement.bind(document);
      document.createElement = function (tag, ...rest) {
        const el = origCreate(tag, ...rest);
        if (tag === 'canvas') {
          queueMicrotask(() => { if (el.width === 256 && el.height === 256) window.__c256++; });
        }
        return el;
      };
    }
    window.__rows = [];
    window.__t0 = performance.now();
    window.__shineStats = m.shineStats;
    const statKeys = ['frames', 'ensures', 'hits', 'resumes', 'resumesStalled', 'bakeMs', 'bakes',
      'memoHits', 'memoMisses', 'stale', 'skips', 'pending', 'immediate', 'catchupMax', 'catchupN', 'catchupSum',
      'poolHits', 'poolCreates', 'poolReturns', 'poolOverflow', 'canvasesCreated', 'canvasesAcquired',
      'carries', 'carriedRows', 'carriesMiss'];
    window.__pickStats = (s) => {
      if (!s) return null;
      const o = {};
      for (const k of statKeys) if (typeof s[k] === 'number') o[k] = s[k];
      return o;
    };
    return {
      ok: true, solidNear: edits.length, edits, dens: best.dens, len,
      pinX: shaftX, pinTileY: pinTile, densWindow: best, simFrozen,
      search: location.search.slice(0, 80),
    };
  }, { pinTile: PIN_TILE, shaftX: SHAFT_X, len: TUNNEL_LEN,
    shineOff: process.env.SW_SHINE_OFF === '1', memoOff: process.env.SW_MEMO_OFF === '1' })
    .catch((e) => ({ ok: false, why: String(e).slice(0, 300) }));
  console.log('setup:', JSON.stringify(setup));
  if (!setup.ok) process.exit(1);

  const statsSnap = (tag) => page.evaluate((t) => ({ tag: t, t: Math.round(performance.now() - window.__t0),
    c256: window.__c256, stats: window.__pickStats ? window.__pickStats(window.__shineStats) : null }), tag).catch(() => null);
  const pre = await statsSnap('pre-mine');

  // ---- 挖掘驾驶:150ms/格灌完全部编辑(终态确定) ----
  const mine = await page.evaluate(({ edits, mineMs, interval }) => {
    const g = window.__swGame;
    const st = g.world.store;
    window.__rows = [];
    let last = performance.now();
    const tick = (ts) => {
      const s = window.__shineStats;
      const bake = s ? s.bakeMs : 0;
      const d = window.__lastBake === undefined ? 0 : bake - window.__lastBake;
      window.__lastBake = bake;
      const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
      if (window.__rec) window.__rows.push([Math.round(ts * 100) / 100, Math.round((ts - last) * 100) / 100,
        Math.round(d * 100) / 100, s ? s.pending : -1, Math.round(heap / 1048576 * 10) / 10]);
      last = ts;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__rec = true;
    let i = 0;
    const miner = setInterval(() => {
      if (i >= edits.length) { clearInterval(miner); window.__mineDone = performance.now(); return; }
      const [x, y] = edits[i++];
      st.setTile(x, y, 0);
    }, interval);
    window.__mineStart = performance.now();
    setTimeout(() => { clearInterval(miner); window.__rec = false;
      window.__mineDone = performance.now(); }, mineMs);
    return { edits: edits.length, interval };
  }, { edits: setup.edits ?? [], mineMs: MINE_MS, interval: 150 })
    .catch((e) => ({ err: String(e).slice(0, 300) }));
  console.log('mine:', JSON.stringify(mine));
  if (!mine || mine.err || !(mine.edits > 0)) { console.log('!! mine edit list empty/err'); process.exit(1); }
  await new Promise((r) => setTimeout(r, MINE_MS + 800));
  const during = await statsSnap('post-mine');

  // ---- 沉降排干(pendingQ→0) ----
  let drained = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    drained = await page.evaluate(() => ({
      pending: window.__shineStats.pending, bakes: window.__shineStats.bakes,
    })).catch(() => null);
    if (drained && drained.pending === 0) break;
  }
  console.log('drain:', JSON.stringify(drained));
  const post = await statsSnap('settled');
  await new Promise((r) => setTimeout(r, 1200));
  const settled2 = await statsSnap('settled+1.2s');

  // ---- digests:挖掘域盒(沉降后) ----
  const MX = setup.pinX, MY = setup.pinTileY;
  const LEN = setup.len;
  const cx0 = Math.floor(MX / 16) - 1, cx1 = Math.floor((MX + LEN) / 16) + 1;
  const cy0 = Math.floor(MY / 16) - 1, cy1 = Math.floor(MY / 16) + 1;
  const digests = await page.evaluate(async (b) => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    const rows = m.shineDebugChunkDigests(g.chunks, b.cx0, b.cx1, b.cy0, b.cy1);
    // ★逐 16×16 格芯 byte-sum（差分定位面;mul+add 分面,格芯只读不含溢出带）
    const cells = await m.shineDebugCellDigests(g.chunks, b.cx0, b.cx1, b.cy0, b.cy1);
    return { rows, cells };
  }, { cx0, cx1, cy0, cy1 }).catch((e) => ({ err: String(e).slice(0, 200) }));
  const nz = Array.isArray(digests?.rows) ? digests.rows.filter((x) => x.sum > 0).length : 0;
  console.log(`digests box cx[${cx0},${cx1}] cy[${cy0},${cy1}] entries=${Array.isArray(digests?.rows) ? digests.rows.length : '-'} nz=${nz}`);

  // ---- 债3 格级断行逐位恒等(直证):一次烘完 vs 格序数链断-续,像素校验和对拍 ----
  const cellId = await page.evaluate(async (b) => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    const cx = b.cx0 + 1, cy = b.cy0 + 1;   // 盒内首个非空 chunk
    const out = m.shineDebugResumeIdentity(g.renderer.atlas, g.world, cx, cy, 0, [],
      [[1, 1, 1, 1, 1], [1, 15, 1, 15], [3, 5, 7, 13], [16, 16, 16, 16], [64, 64], [255, 1]]);
    return { cx, cy, rows: out };
  }, { cx0, cy0 }).catch((e) => ({ err: String(e).slice(0, 200) }));
  if (cellId && cellId.rows) {
    const allEq = cellId.rows.every((r) => r.equal);
    console.log(`cellSplits identity @(${cellId.cx},${cellId.cy}): ${cellId.rows.map((r) => `${r.split}=${r.equal ? 'EQ' : 'DIFF'}`).join(' ')} all=${allEq}`);
  } else {
    console.log('cellSplits identity: ERR', JSON.stringify(cellId));
  }

  await page.screenshot({ path: `${OUT}/${TAG}-settled.png` });
  const rows = await page.evaluate(() => ({ rows: window.__rows, mineStart: window.__mineStart,
    mineDone: window.__mineDone, t0: window.__t0 })).catch(() => null);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ tag: TAG, setup: { ...setup, edits: setup.edits.length }, pre, during, post, settled2, drained, digests, nz, errs: errs.slice(0, 10) }));
  writeFileSync(`${OUT}/${TAG}-digests.json`, JSON.stringify(digests));
  writeFileSync(`${OUT}/${TAG}-rows.json`, JSON.stringify(rows));

  if (rows && Array.isArray(rows.rows)) {
    const { rows: rr, mineStart, mineDone } = rows;
    const inMine = rr.filter(([ts]) => ts >= mineStart && ts <= mineDone);
    const pctlOf = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
    let slow = 0, secAcc = 0; const perSec = new Map();
    const bakeDeltas = [];
    for (const r of inMine) {
      const gap = r[1];
      if (!(gap > 0)) continue;
      const sec = Math.floor(secAcc / 1000); secAcc += gap;
      let a = perSec.get(sec); if (!a) perSec.set(sec, a = { n: 0, slow: 0 });
      a.n++; if (gap >= 12.5) { a.slow++; slow++; }
      if ((r[2] ?? 0) > 0) bakeDeltas.push(r[2]);
    }
    console.log(`\n== 挖掘窗 ${TAG} == ${inMine.length} 帧, 慢帧(≥12.5ms)=${slow}`);
    console.log(`   bakeΔ: n=${bakeDeltas.length} p95=${pctlOf(bakeDeltas, 0.95).toFixed(2)}ms max=${Math.max(...bakeDeltas, 0).toFixed(2)}ms`);
    const gaps = inMine.map((r) => r[1]).filter((v) => v > 0);
    console.log(`   gap p50=${pctlOf(gaps, 0.5).toFixed(2)} p95=${pctlOf(gaps, 0.95).toFixed(2)} max=${Math.max(...gaps, 0).toFixed(2)}`);
    console.log('   逐秒慢帧: ' + [...perSec.entries()].sort((a, b) => a[0] - b[0]).map(([s, a]) => `${s}:${a.slow}`).join(' '));
  }
  console.log(`\nstats ${TAG}: pre=${JSON.stringify(pre?.stats)}\n  during=${JSON.stringify(during?.stats)}\n  post=${JSON.stringify(post?.stats)}\n  settled2=${JSON.stringify(settled2?.stats)}`);
  console.log(`c256 census: pre=${pre?.c256} during=${during?.c256} post=${post?.c256}`);
} finally {
  await browser.close().catch(() => {});
}
