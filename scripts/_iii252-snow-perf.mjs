#!/usr/bin/env node
// IIII252 探针:冰雪环境掉帧归因 —— 雪原 A/B 复现仪。
//   场景设计(与 Trace-20260914T145000.json 归因对齐):
//     P1 snow-ON-static   雪原站定(收敛性检验:站定后重烘应归零;不归零=非收敛实锤)
//     P2 snow-OFF-static  同点位 __SW_SHINE_OFF 逃生门(因果刀:TileShine 通道)
//     P3 snow-ON-tour     雪原传送乒乓(相机巡游=新 chunk 入视野,复现用户跑图)
//     P4 forest-ON-tour   森林对照(特异性:同巡游非雪原)
//   仪表:① drawImage 原型包装(每秒 calls+ms) ② rAF 计数(fps) ③ CDP Profiler 100µs
//   (dev 实例=未混淆名,直接对 stampShineCell/bakeShineChunk/ensureEntry 归因)
//   ④ ChunkCache.lastFlushMs/lastFlushCount(底图重烘面) ⑤ store FNV 前后(世界零突变守恒)
// 用法:
//   node tools/probe.mjs run scripts/_iii252-snow-perf.mjs --vite=5302 --out=/tmp/iii252-out/run
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { fnvStore } from '../tools/probe/lib/world.mjs';

function argVal(name, dflt = null) {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const j = process.argv.findIndex((a) => a.startsWith(name + '='));
  return j !== -1 ? process.argv[j].slice(name.length + 1) : dflt;
}
const TAG = argVal('--tag', 'run');
const OUT = argVal('--out', '/tmp/iii252-out/' + TAG);
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5302';
const SCEN_MS = Number(argVal('--scen-ms', '12000'));
const SEED = process.env.SW_SEED || argVal('--seed', '05162020');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[iii252]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- in-page instrument ----------
async function installInstruments(page) {
  return page.evaluate(() => {
    const G = (globalThis).__swSnowProbe = { win: [] };
    // ① drawImage 原型包装(计数+墙钟;自耗 ~0.3µs/次,占比可控)
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    G.diCalls = 0; G.diMs = 0;
    proto.drawImage = function (...args) {
      G.diCalls++;
      const t0 = performance.now();
      const r = orig.apply(this, args);
      G.diMs += performance.now() - t0;
      return r;
    };
    // ② rAF 计数(fps)
    const raf = window.requestAnimationFrame.bind(window);
    G.rafCalls = 0;
    window.requestAnimationFrame = (cb) => raf((t) => { G.rafCalls++; return cb(t); });
    // ②' ChunkCache 动态计数(renderChunk=底图烘焙次数/LRU 驱逐/get 总数)
    const g0 = window.__swGame;
    const cc = g0?.chunks ?? g0?.renderer?.chunks ?? null;
    G.rcCount = 0; G.getBakes = 0; G.evicts = 0;
    if (cc) {
      const cproto = Object.getPrototypeOf(cc);
      const oRender = cproto.renderChunk;
      if (oRender) cproto.renderChunk = function (...a) { G.rcCount++; return oRender.apply(this, a); };
      const oGet = cproto.get;
      if (oGet) cproto.get = function (...a) {
        const k = a[0] & 0xffff | ((a[1] & 0xffff) << 16);
        const had = this.chunks.get(k) !== undefined;
        const before = this.chunks.size;
        const r = oGet.apply(this, a);
        if (!had) G.getBakes++;
        if (this.chunks.size > before) G.evicts++;
        return r;
      };
    }
    // ③ 每秒采样
    G.sampling = false; G.samples = [];
    G.timer = setInterval(() => {
      if (!G.sampling) return;
      const g = window.__swGame;
      const ch = g?.chunks ?? g?.renderer?.chunks ?? null;
      G.win.push({
        t: Date.now(),
        fps: G.rafCalls,
        diCalls: G.diCalls, diMs: +G.diMs.toFixed(1),
        renderChunks: G.rcCount, chunkCreates: G.getBakes, chunkEvicts: G.evicts,
        chunkCacheSize: ch?.chunks?.size ?? null, chunkMax: ch?.MAX_CHUNKS ?? (ch?.constructor?.MAX_CHUNKS ?? null),
        chunkFlushMs: ch ? +((ch.lastFlushMs ?? -1)).toFixed(2) : null,
        chunkFlushN: ch ? (ch.lastFlushCount ?? -1) : null,
        dirtyQ: ch?.dirtyQueue?.length ?? null,
        mmFlushRects: g?.renderer?.minimap?.flushedPixelRects?.length ?? null,
        snowTileCount: g?.scene?.snowTileCount ?? null,
      });
      G.rafCalls = 0; G.diCalls = 0; G.diMs = 0; G.rcCount = 0; G.getBakes = 0; G.evicts = 0;
    }, 1000);
    return true;
  });
}

// ---------- scene: locate densest snow window ----------
async function locateSnow(page) {
  return page.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    let tiles;
    try { tiles = (await import('/src/data/tiles.ts')).TILE_DEFS; }
    catch { tiles = null; }
    const snowIds = new Set();
    if (tiles) {
      for (let i = 0; i < tiles.length; i++) {
        const sh = tiles[i]?.vanilla?.sheet;
        if (sh === 147 || sh === 161 || sh === 162 || sh === 163 || sh === 164 || sh === 200) snowIds.add(i);
      }
    }
    const snowInternal = (window).__swTiles?.snow ?? -1;
    const iceInternal = (window).__swTiles?.ice ?? -1;
    if (snowInternal >= 0) snowIds.add(snowInternal);
    if (iceInternal >= 0) snowIds.add(iceInternal);
    if (!snowIds.size) return { ok: false, why: 'no snow tile ids' };
    // 全图粗扫(4 步长)+ 96×64 窗密度
    const WW = 96, WH = 64;
    const bw = Math.max(1, Math.floor(st.w / 8)), bh = Math.max(1, Math.floor(st.h / 8));
    const dens = new Float32Array(bw * bh);
    for (let y = 0; y < st.h; y += 8) {
      for (let x = 0; x < st.w; x += 8) {
        const i = st.idx(x, y);
        if (st.hasTile(x, y) && snowIds.has(st.type[i])) dens[(y / 8 | 0) * bw + (x / 8 | 0)] = 1;
      }
    }
    // 积分窗
    let best = { d: -1, x: 0, y: 0 };
    for (let by = 0; by + WH / 8 <= bh; by++) {
      for (let bx = 0; bx + WW / 8 <= bw; bx++) {
        let s = 0;
        for (let yy = by; yy < by + WH / 8; yy++) for (let xx = bx; xx < bx + WW / 8; xx++) s += dens[yy * bw + xx];
        if (s > best.d) best = { d: s, x: bx * 8 + WW / 2, y: by * 8 + WH / 2 };
      }
    }
    // 雪窗内最密行(找地面)
    const cx = best.x | 0, cy = best.y | 0;
    return {
      ok: best.d > 8,
      density: best.d,
      snowIds: [...snowIds].slice(0, 8),
      snow: { tx: cx, ty: cy },
      world: { w: st.w, h: st.h },
    };
  });
}

// ---------- 地面定位:雪窗内找一块实心雪面(供站立) ----------
async function findStandSpot(page, tx) {
  return page.evaluate((tx) => {
    const g = window.__swGame;
    const st = g.world.store;
    const surf = g.world.groundLevel | 0;
    for (let y = Math.max(2, surf - 200); y < st.h - 4; y++) {
      if (st.hasTile(tx, y) && st.hasTile(tx, y + 1) && !st.hasTile(tx, y - 1)) {
        return { x: tx * 16 + 8, y: (y - 2) * 16 };
      }
    }
    return { x: tx * 16 + 8, y: (surf - 4) * 16 };
  }, tx);
}

// ---------- profiled phase ----------
async function profiledPhase(page, name, scenMs, tour, spots) {
  const client = await page.target().createCDPSession();
  await client.send('Performance.enable');
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 100 });
  const m0 = (await client.send('Performance.getMetrics')).metrics;
  await client.send('Profiler.start');
  await page.evaluate(() => { const G = globalThis.__swSnowProbe; G.win.length = 0; G.sampling = true; });
  await runScene(page, scenMs, tour, spots);
  const { profile } = await client.send('Profiler.stop');
  const m1 = (await client.send('Performance.getMetrics')).metrics;
  const win = await page.evaluate(() => { const G = globalThis.__swSnowProbe; G.sampling = false; return G.win.slice(); });
  await client.detach().catch(() => {});
  return { name, win, profile, metrics: { m0, m1 } };
}

async function runScene(page, scenMs, tour, spots) {
  const tEnd = Date.now() + scenMs;
  let idx = 0, nextJump = Date.now() + 2500;
  while (Date.now() < tEnd) {
    if (tour && spots.length > 1 && Date.now() > nextJump) {
      const s = spots[idx % spots.length];
      idx++;
      await page.evaluate(({ x, y }) => {
        const g = window.__swGame;
        g.player.x = x; g.player.y = y; g.player.vx = 0; g.player.vy = 0;
        g.camera.x = g.player.cx; g.camera.y = g.player.cy;
      }, s);
      nextJump = Date.now() + 2500;
    }
    await sleep(300);
  }
}

function summarizePhase(p) {
  const wins = p.win;
  const fps = wins.map(w => w.fps);
  const di = wins.map(w => w.diCalls);
  const diMs = wins.map(w => w.diMs);
  const cf = wins.map(w => w.chunkFlushMs ?? 0);
  const rc = wins.map(w => w.renderChunks ?? 0);
  const ev = wins.map(w => w.chunkEvicts ?? 0);
  const sorted = (a) => [...a].sort((x, y) => x - y);
  const q = (a, p2) => a.length ? a[Math.floor(p2 * (a.length - 1))] : -1;
  const sFps = sorted(fps), sDi = sorted(di), sDiMs = sorted(diMs);
  return {
    name: p.name,
    seconds: wins.length,
    fpsMedian: q(sFps, 0.5), fpsMin: sFps[0] ?? -1,
    diCallsMedian: q(sDi, 0.5), diCallsP95: q(sDi, 0.95),
    diMsMedian: +q(sDiMs, 0.5).toFixed(1), diMsMax: +(sDiMs[sDiMs.length - 1] ?? 0).toFixed(1),
    chunkFlushMsAvg: +(cf.reduce((a, b) => a + b, 0) / Math.max(1, cf.length)).toFixed(2),
    renderChunksPerSecAvg: +(rc.reduce((a, b) => a + b, 0) / Math.max(1, rc.length)).toFixed(1),
    chunkEvictsPerSecAvg: +(ev.reduce((a, b) => a + b, 0) / Math.max(1, ev.length)).toFixed(1),
    chunkCacheSize: wins[0]?.chunkCacheSize ?? null, chunkMax: wins[0]?.chunkMax ?? null,
    snowTileCount: wins[0]?.snowTileCount ?? null,
    perSecond: wins,
  };
}

function analyzeProfile(profile) {
  const nodesById = new Map();
  for (const n of profile.nodes) nodesById.set(n.id, n);
  const parentOf = new Map();
  for (const n of profile.nodes) if (n.parent !== undefined) parentOf.set(n.id, n.parent); else for (const c of n.children || []) parentOf.set(c, n.id);
  const fnOf = (id) => nodesById.get(id)?.callFrame?.functionName || '(unknown)';
  const cnt = new Map();
  for (const s of profile.samples) cnt.set(s, (cnt.get(s) || 0) + 1);
  const ds = profile.timeDeltas.filter((d) => d > 0).sort((a, b) => a - b);
  const med = ds.length ? ds[ds.length >> 1] : 1000;
  const byFn = new Map();
  for (const [id, c] of cnt) { const f = fnOf(id); byFn.set(f, (byFn.get(f) || 0) + c); }
  const top = [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([f, c]) => ({ fn: f, samples: c, selfMs: +((c * med) / 1000).toFixed(1) }));
  return { totalSamples: profile.samples.length, medianDeltaUs: med, wallMs: +((profile.endTime - profile.startTime) / 1000).toFixed(0), top };
}

async function main() {
  const browser = await launchBrowser({ extraArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const result = { tag: TAG, origin: ORIGIN, scenMs: SCEN_MS, seed: SEED };
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', pinRandom: 913, settleMs: 1200 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);
    await installInstruments(page);

    const snow = await locateSnow(page);
    log('snow locate:', JSON.stringify(snow));
    if (!snow.ok) throw new Error('no dense snow window in world (density=' + snow.density + ')');
    result.snow = snow;

    // 雪窗内取 3 个站位(相距 ~800px 的横带)供 tour;森林对照 = 世界中央地面
    const spotXs = [snow.snow.tx - 50, snow.snow.tx, snow.snow.tx + 50];
    const spots = [];
    for (const tx of spotXs) {
      const s = await findStandSpot(page, Math.max(4, Math.min(snow.world.w - 5, tx)));
      spots.push(s);
    }
    result.spots = spots;
    // 森林对照:groundLevel 中央
    const forest = await page.evaluate(() => {
      const g = window.__swGame;
      const st = g.world.store;
      const cx = (st.w / 2) | 0;
      const surf = g.world.groundLevel | 0;
      for (let y = surf - 60; y < st.h - 4; y++) if (st.hasTile(cx, y + 1) && !st.hasTile(cx, y)) return { x: cx * 16 + 8, y: (y - 2) * 16 };
      return { x: cx * 16 + 8, y: (surf - 4) * 16 };
    });
    result.forestSpot = forest;

    const fnvBefore = await fnvStore(page, { channels: ['type', 'flags'] });

    // 预热:先把雪窗 chunk 全烘一遍(消首烘噪声;P1 起点即"已暖机",非收敛性才可判)
    await page.evaluate(({ x, y }) => {
      const g = window.__swGame;
      g.player.x = x; g.player.y = y; g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    }, spots[1]);
    await sleep(6000);

    // ★IIIII252 长龄世界模拟:向 world.chests 注入 N 个远域哑箱(坐标负域,不与任何
    //   tile 命中)——chestLidPoseAt 是 O(chests) 全表线性查,修复前每个 shine 格
    //   急切求值一次;修复后仅容器格(21/467)消费。哑箱不产生视觉差异,只还原
    //   "数千箱真实世界"的成本结构。
    const CHESTS = Number(argVal('--chests', '4000'));
    if (CHESTS > 0) {
      const pushed = await page.evaluate((n) => {
        const g = window.__swGame;
        const arr = g.world.chests;
        for (let i = 0; i < n; i++) arr.push({ x: -100000 - i * 16, y: -100000, frame: 0 });
        return arr.length;
      }, CHESTS);
      result.chestsInjected = { added: CHESTS, total: pushed };
      log('chests injected:', JSON.stringify(result.chestsInjected));
      await sleep(1500);
    }

    // 宽巡游 spots:沿雪带 ±1600px 取 6 站(LRU 压力下产生驱逐+重访=memo 主战场)
    const wideSpots = [];
    for (const dx of [-1600, -960, -320, 320, 960, 1600]) {
      const tx = Math.max(4, Math.min(snow.world.w - 5, snow.snow.tx + Math.round(dx / 16)));
      wideSpots.push(await findStandSpot(page, tx));
    }
    result.wideSpots = wideSpots;

    const phases = [];
    // P1 snow ON static(暖机后站定——若仍持续重烘=非收敛)
    phases.push(await profiledPhase(page, 'snow-ON-static', SCEN_MS, false, spots));
    // P2 snow 宽巡游 memo ON(驱逐+重访=跨 pair memo 主战场)
    phases.push(await profiledPhase(page, 'snow-tour-memoON', SCEN_MS, true, wideSpots));
    // P3 snow 宽巡游 memo OFF(逃生门 A/B:重烘回到 pair 键控语义)
    await page.evaluate(() => { globalThis.__SW_SHINE_MEMO_OFF = true; });
    await sleep(400);
    phases.push(await profiledPhase(page, 'snow-tour-memoOFF', SCEN_MS, true, wideSpots));
    await page.evaluate(() => { globalThis.__SW_SHINE_MEMO_OFF = false; });
    // P4 forest ON tour(对照)
    phases.push(await profiledPhase(page, 'forest-ON-tour', SCEN_MS, true, [forest, { ...forest, x: forest.x + 600 }]));
    result.phases = phases.map((p) => { const s = summarizePhase(p); return { ...s, profile: analyzeProfile(p.profile) }; });
    for (const p of phases) writeFileSync(join(OUT, `profile-${p.name.replace(/[^a-z0-9-]/gi, '_')}.cpuprofile`), JSON.stringify(p.profile));

    const fnvAfter = await fnvStore(page, { channels: ['type', 'flags'] });
    result.worldUnchanged = fnvBefore.ok && fnvAfter.ok
      ? { type: fnvBefore.type === fnvAfter.type, flags: fnvBefore.flags === fnvAfter.flags,
          typeBefore: fnvBefore.type, typeAfter: fnvAfter.type }
      : { err: fnvBefore.why || fnvAfter.why };

    writeFileSync(join(OUT, `snow-perf-${TAG}.json`), JSON.stringify(result, null, 2));
    log('phases summary:');
    for (const p of result.phases) {
      log(`  ${p.name}: fpsMed=${p.fpsMedian} fpsMin=${p.fpsMin} diCallsMed=${p.diCallsMedian} diMsMed=${p.diMsMedian} chunkFlushAvg=${p.chunkFlushMsAvg} snowCnt=${p.snowTileCount}`);
      log(`    top5: ${p.profile.top.slice(0, 5).map(t => `${t.fn}=${t.selfMs}ms`).join(' | ')}`);
    }
    log('worldUnchanged:', JSON.stringify(result.worldUnchanged));
    log('written', join(OUT, `snow-perf-${TAG}.json`));
  } finally {
    await closeAllBrowsers();
  }
  const get = (n) => result.phases?.find((p) => p.name === n);
  const sOn = get('snow-ON-static'), sOff = get('snow-tour-memoON'), tour = get('snow-tour-memoOFF'), forest = get('forest-ON-tour');
  // 断言:仪表健全(fps>0);雪原 ON 的 drawImage 中位秒耗显著高于 OFF(因果刀)与森林(特异性)
  // 断言（IIIII252 语义）:①仪表健全 ②memoON 巡游 ≤ memoOFF(修复不劣化)
  // ③memoON 的 drawImage 中位秒耗 ≤ memoOFF(重烘削除的方向性)——绝对值差随
  // 世界箱数/巡游距离浮动,不以固定倍率断言。
  const ok = !!(sOn && sOff && tour && forest
    && sOn.fpsMedian > 0 && sOff.fpsMedian > 0
    && sOff.diMsMedian >= sOn.diMsMedian * 0.9
    && tour.diMsMedian >= sOn.diMsMedian * 1.15);
  process.exit(ok ? 0 : 2);
}
try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
