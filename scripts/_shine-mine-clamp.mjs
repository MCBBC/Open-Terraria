// ★TileShine 挖掘相首曝重烘钳制 A/B 定谳探针——2026-10-04
//
// 【任务】挖掘相 36s 型单秒慢帧簇（x-ray:176ms/s=32 慢帧,mix2 435ms 同相）是否被
//   爆发闩（shineBurstLatch→缺省盒钳 1.5ms）+指纹缓存（shineFpCache）归零。
// 【世界面】用户真实导出档(同 _shine-ab-fall.mjs,seed 118606602)——腐化带
//   shine2 密集(黑曜石墙域)。fixedUpdate 包裹钉位玩家(物理后复位,渲染照常)。
// 【挖掘配方】钉位点右侧 3-tall×40 长走廊逐格 setTile(0)(走真实监听链
//   markDirtyAround→底图重烘→新 pair→首曝重烘),~5.5 格/s×36s≈200 格——
//   持续挖掘压力=每帧新缺额;确定性(零 RNG,编辑表预生成)。
// 【臂】default=本刀(缺省盒+闩) / budget4=?shinebudget=4(本刀前行为逐字,闩惰性)
//   / shineoff=__SW_SHINE_OFF(零 shine 仪,通道总成本上界)。
// 【仪器】第二 rAF 环逐帧 [ts,gap];挖掘窗逐秒:慢帧数(≥12.5ms)/gap p95/超益和;
//   闩位采样 2Hz;shineStats 快照前后。digest=shineDebugChunkDigests 挖掘域盒
//   (沉降排干后)——default vs budget4 逐位对拍(延迟烘焙不改产物;零随机备案)。
// 【运行】SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs --timeout=280000 \
//          scripts/_shine-mine-clamp.mjs          (缺省 default 臂)
//   SW_ARMS=budget4 / shineoff / all 覆盖(all=顺序跑,timeout 需×3)
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5209';
const WORLD_JSON = process.env.SW_WORLD_JSON || '/Users/vinlic/Downloads/map-天真的钴最高点 (4).json';
const OUT = '/tmp/shine-mine';
const ARM = process.env.SW_ARMS || 'default';
const VIEW = { width: Number(process.env.SW_VW || 1280), height: Number(process.env.SW_VH || 800), deviceScaleFactor: Number(process.env.SW_DPR || 2) };
const MINE_MS = Number(process.env.SW_MINE_MS || 36_000);
const PIN_TILE = Number(process.env.SW_PIN_TILE || 885);
const SHAFT_X = Number(process.env.SW_SHAFT_X || 1622);
const TUNNEL_LEN = Number(process.env.SW_LEN || 40);
mkdirSync(OUT, { recursive: true });

const ARMS = ['default', 'budget4', 'shineoff'];
const ARM_FLAG = { default: '', budget4: '?shinebudget=4', shineoff: '' };

const worldText = readFileSync(WORLD_JSON, 'utf8');
console.log(`world ${(worldText.length / 1048576).toFixed(1)}MB, arm=${ARM}, mine=${MINE_MS}ms @(${SHAFT_X},${PIN_TILE}) len=${TUNNEL_LEN}`);

const browser = await launchBrowser({ headed: true, viewport: VIEW });
const errs = [];
try {
  const page = await openPage(browser, { errors: errs, maxErrors: 60 });
  installPinnedRandom(page, 118606602);
  const flag = ARM_FLAG[ARM] ?? '';
  const boot = await bootstrap(page, ORIGIN);
  console.log('bootstrap:', JSON.stringify(boot));
  if (!boot.ok) process.exit(1);
  if (flag) {
    const okNav = await gotoApp(page, ORIGIN, { extraQuery: flag });
    const okBridge = okNav && await waitForBridge(page);
    console.log('flag nav:', flag, okNav && okBridge);
    if (!okBridge) process.exit(1);
  }

  console.log('loadJson start...');
  const tLoad = Date.now();
  await front(page);
  await page.evaluate((text) => { void window.__swFlow.loadJson(text); }, worldText);
  const okGame = await waitForGame(page, { timeout: 240_000, log: (m) => console.log('  ' + m) });
  console.log('loadJson done:', okGame, `${((Date.now() - tLoad) / 1000).toFixed(1)}s`);
  if (!okGame) { await page.screenshot({ path: `${OUT}/${ARM}-loadfail.png` }); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1500));

  // ---- 钉位(自动选 shine2 最密窗口) + 预生成挖掘编辑表 + 装记录仪 ----
  const setup = await page.evaluate(async ({ pinTile, shaftX, len: len0, mineMs, shineOff }) => {
    if (shineOff) globalThis.__SW_SHINE_OFF = true;
    const g = window.__swGame;
    const st = g.world.store;
    const m = await import('/src/render/TileShine.ts');
    const tdefs = (await import('/src/data/tiles.ts')).TILE_DEFS;
    const sheetOf = (type) => tdefs[type]?.vanilla?.sheet ?? null;
    const shine2 = m.SHINE2_SHEETS;
    // 自动钉位:腐化带 y∈[640,1120] 找 48×32 窗 shine2 成员密度最高者(x-ray
    // 176ms/s 爆发域=密集 shine2 墙;空穴钉位烘焙需求过轻不复现爆发)
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
    // 走廊长按半视宽裁剪:digest 盒恒在钉位视界内(界外 get=强迫底图烘/占位对,污染对拍)
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
    // 编辑表:钉位点右侧 3-tall 走廊,列序→行序,仅实心格(空气格跳过=零编辑)
    const edits = [];
    for (let dx = 1; dx <= len; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = shaftX + dx, y = pinTile + dy;
        if (st.inBounds(x, y) && st.hasTile(x, y)) edits.push([x, y]);
      }
    }
    // 加宽第二遍(5-tall,dy=±2)——持续压力拉满 36s
    for (let dx = 1; dx <= len; dx++) {
      for (const dy of [-2, 2]) {
        const x = shaftX + dx, y = pinTile + dy;
        if (st.inBounds(x, y) && st.hasTile(x, y)) edits.push([x, y]);
      }
    }
    const solidNear = edits.length;
    // 记录仪
    window.__rows = [];
    window.__latchLog = [];
    window.__rec = false;         // 挖掘开始时置 true
    window.__t0 = performance.now();
    window.__shineStats = m.shineStats;
    window.__latch = m.shineBurstLatch;
    window.__pickStats = (s) => {
      if (!s) return null;
      const o = {};
      for (const k of ['frames', 'ensures', 'hits', 'resumes', 'resumesStalled', 'bakeMs', 'bakes',
        'memoHits', 'memoMisses', 'stale', 'skips', 'pending', 'immediate', 'catchupMax', 'catchupN', 'catchupSum']) o[k] = s[k];
      return o;
    };
    return {
      ok: true, pinY, solidNear, edits, dens: best.dens, len,
      pinX: shaftX, pinTileY: pinTile,
      py: g.player.y, tileAtStart: st.type[st.idx(shaftX + 1, pinTile)],
      shineBudgetMs: m.shineBudgetMs, explicit: m.shineBudgetExplicit,
      shineOff: !!globalThis.__SW_SHINE_OFF, search: location.search.slice(0, 80),
    };
  }, { pinTile: PIN_TILE, shaftX: SHAFT_X, len: TUNNEL_LEN, mineMs: MINE_MS, shineOff: ARM === 'shineoff' }).catch((e) => ({ ok: false, why: String(e).slice(0, 300) }));
  console.log('setup:', JSON.stringify(setup));
  if (!setup.ok) process.exit(1);

  const statsSnap = (tag) => page.evaluate((t) => ({ tag: t, t: Math.round(performance.now() - window.__t0),
    stats: window.__pickStats ? window.__pickStats(window.__shineStats) : null,
    latch: window.__latch ? window.__latch.active : null }), tag).catch(() => null);
  const pre = await statsSnap('pre-mine');

  // ---- 挖掘驾驶:startRec → setInterval 逐格 setTile(0) → 36s 停 ----
  const mine = await page.evaluate(({ edits, mineMs, interval }) => {
    const g = window.__swGame;
    const st = g.world.store;
    window.__rows = [];
    window.__latchLog = [];
    let last = performance.now();
    window.__rec = true;
    const tick = (ts) => {
      if (!window.__rec) return;
      const s = window.__shineStats;
      const bake = s ? s.bakeMs : 0;
      const d = window.__lastBake === undefined ? 0 : bake - window.__lastBake;
      window.__lastBake = bake;
      const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
      window.__rows.push([Math.round(ts * 100) / 100, Math.round((ts - last) * 100) / 100,
        Math.round(d * 100) / 100, s ? s.pending : -1,
        window.__latch ? window.__latch.active : null,
        Math.round(heap / 1048576 * 10) / 10]);
      last = ts;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const latchTick = setInterval(() => {
      window.__latchLog.push([Math.round(performance.now() - window.__t0), window.__latch.active,
        window.__shineStats.pending]);
    }, 500);
    let i = 0;
    const miner = setInterval(() => {
      if (i >= edits.length) { clearInterval(miner); window.__mineDone = performance.now(); return; }
      const [x, y] = edits[i++];
      st.setTile(x, y, 0);
    }, interval);
    window.__mineStart = performance.now();
    setTimeout(() => { clearInterval(miner); clearInterval(latchTick); window.__rec = false;
      window.__mineDone = performance.now(); }, mineMs);
    return { edits: edits.length, interval };
  }, { edits: setup.edits ?? [], mineMs: MINE_MS, interval: Math.max(120, Math.floor(MINE_MS / Math.max(1, setup.solidNear))) })
    .catch((e) => ({ err: String(e).slice(0, 300) }));
  console.log('mine:', JSON.stringify(mine));
  if (!mine || mine.err || !(mine.edits > 0)) { console.log('!! mine edit list empty/err'); process.exit(1); }
  await new Promise((r) => setTimeout(r, MINE_MS + 800));
  const during = await statsSnap('post-mine');

  // ---- 沉降排干(pendingQ→0) ----
  let drained = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    drained = await page.evaluate(() => ({
      pending: window.__shineStats.pending, bakes: window.__shineStats.bakes,
      latch: window.__latch.active,
    })).catch(() => null);
    if (drained && drained.pending === 0) break;
  }
  console.log('drain:', JSON.stringify(drained));
  const post = await statsSnap('settled');

  // ---- 中途/沉降截图(视觉目检面) ----
  // (挖掘中途截图在 mine 驾驶里没截——沉降后补两张:即时+1.5s 后)

  // ---- digests:挖掘域盒(全在钉位视界±1 内,零界外 get) ----
  const MX = setup.pinX ?? SHAFT_X, MY = setup.pinTileY ?? PIN_TILE;
  const LEN = setup.len ?? TUNNEL_LEN;
  const cx0 = Math.floor(MX / 16) - 1, cx1 = Math.floor((MX + LEN) / 16) + 1;
  const cy0 = Math.floor(MY / 16) - 1, cy1 = Math.floor(MY / 16) + 1;
  const digests = ARM === 'shineoff' ? null : await page.evaluate(async (b) => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    return m.shineDebugChunkDigests(g.chunks, b.cx0, b.cx1, b.cy0, b.cy1);
  }, { cx0, cx1, cy0, cy1 }).catch((e) => ({ err: String(e).slice(0, 200) }));
  const nz = Array.isArray(digests) ? digests.filter((x) => x.sum > 0).length : 0;
  console.log(`digests box cx[${cx0},${cx1}] cy[${cy0},${cy1}] entries=${Array.isArray(digests) ? digests.length : '-'} nz=${nz}`);

  await page.screenshot({ path: `${OUT}/${ARM}-settled.png` });

  // ---- 行落盘 + 挖掘窗逐秒分析(node 侧) ----
  const rows = await page.evaluate(() => ({ rows: window.__rows, latchLog: window.__latchLog,
    mineStart: window.__mineStart, mineDone: window.__mineDone, t0: window.__t0 })).catch(() => null);
  const stats = { arm: ARM, pre, during, post, drained, digests, nz, errs: errs.slice(0, 10) };
  writeFileSync(`${OUT}/${ARM}.json`, JSON.stringify(stats));
  writeFileSync(`${OUT}/${ARM}-rows.json`, JSON.stringify(rows));

  if (rows && Array.isArray(rows.rows)) {
    const { rows: rr, mineStart, mineDone } = rows;
    const inMine = rr.filter(([ts]) => ts >= mineStart && ts <= mineDone);
    // 逐秒聚合(gap 累计计秒,相对挖掘窗起点;慢帧阈 12.5ms 与 x-ray 同阈)
    const agg = new Map();
    let acc = 0;
    for (const [, gap] of inMine) {
      if (!(gap > 0)) continue;
      const sec = Math.floor(acc / 1000);
      acc += gap;
      let a = agg.get(sec); if (!a) agg.set(sec, a = { n: 0, slow: 0, sum: 0, excess: 0, max: 0, gaps: [] });
      a.n++; a.sum += gap; a.excess += Math.max(0, gap - 8.33); if (gap > a.max) a.max = gap;
      if (gap >= 12.5) a.slow++;
      a.gaps.push(gap);
    }
    const pctlOf = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
    let worstSlow = 0, worstExcess = 0, worstSec = -1;
    const allGaps = [];
    for (const [sec, a] of agg) {
      allGaps.push(...a.gaps);
      if (a.slow > worstSlow) { worstSlow = a.slow; worstSec = sec; }
      if (a.excess > worstExcess) worstExcess = a.excess;
    }
    console.log(`\n== 挖掘窗 ${ARM} == ${inMine.length} 帧 / ${agg.size}s`);
    console.log(`   最差秒慢帧(≥12.5ms)=${worstSlow} @${worstSec}s   最差秒超益和=${worstExcess.toFixed(1)}ms`);
    console.log(`   全窗 gap p95=${pctlOf(allGaps, 0.95).toFixed(2)}ms  p50=${pctlOf(allGaps, 0.5).toFixed(2)}ms  max=${Math.max(...allGaps).toFixed(2)}ms`);
    console.log('   逐秒慢帧: ' + [...agg.entries()].sort((a, b) => a[0] - b[0])
      .map(([s, a]) => `${s}:${a.slow}`).join(' '));
    // 慢帧归因:逐帧 [gap, bakeMsΔ, pending, heapMB]——bakeΔ≤2ms ⇒ 慢在盒外(底图/GC/渲染);
    // bakeΔ≈gap ⇒ 盒失效
    const slowFrames = [];
    let acc2 = 0;
    for (const r of inMine) {
      const gap = r[1];
      if (!(gap > 0)) continue;
      const sec = Math.floor(acc2 / 1000);
      acc2 += gap;
      if (gap >= 12.5) slowFrames.push(`s${sec}[${gap.toFixed(1)}ms,bake${(r[2] ?? 0).toFixed(1)},p${r[3]},h${r[5]}MB]`);
    }
    console.log('   慢帧逐帧: ' + slowFrames.slice(0, 40).join(' '));
    const bakeDeltas = inMine.map((r) => r[2] ?? 0).filter((v) => v > 0);
    const sumBake = bakeDeltas.reduce((a, b) => a + b, 0);
    console.log(`   有烘焙帧 bakeΔ: n=${bakeDeltas.length} p95=${pctlOf(bakeDeltas, 0.95).toFixed(2)}ms max=${Math.max(...bakeDeltas, 0).toFixed(2)}ms sum=${sumBake.toFixed(0)}ms`);
    console.log('   latchLog: ' + (rows.latchLog || []).slice(0, 12).map(([t, l, p]) => `${t}ms:${l ? 'ON' : 'off'}/p${p}`).join(' '));
  }
  console.log(`\nstats ${ARM}: pre=${JSON.stringify(pre?.stats)}\n  during=${JSON.stringify(during?.stats)}\n  post=${JSON.stringify(post?.stats)}`);
} finally {
  await browser.close().catch(() => {});
}
