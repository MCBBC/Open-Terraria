/**
 * IIII239 统一探针框架 —— perf 场景跑分器(实时模式)。
 *
 * 场景:
 *  - biome-tour:生物群落自动巡游(森林/腐化/猩红/丛林/神圣/雪原/沙漠/海洋/地下/
 *    地狱/太空/神庙/地牢/蘑菇)——先全图扫描锚定各群落代表列,页内巡游驱动器按
 *    「匀速平移+每站驻留 N 秒」走完全 route,宿主按驱动器相位切分段(dwell/transit);
 *  - stress:压力注入(暴雨/沙尘暴/血月/大量弹幕/水岩交互/大量粒子,可任意组合),
 *    每因子一段+全组合段。
 *
 * 纪律(坑表 K 域):
 *  - 巡游【只读】:除玩家位置/相机(相机由 follow 自行缓动)外不写任何世界数据
 *    (tile/liquid/wire/paint/entities 零触碰)——金标守恒;压力场景的合成注入
 *    (液体台/弹幕/尘)是场景自身语义,用完即拆(teardown 清场),不与金标混用世界;
 *  - 实时模式:全程真实 rAF,窗内禁 pump(坑表 D1/D2 与 perf 互斥,见 perf.mjs 头注);
 *  - 幽灵格纪律(G7):扫描读格一律 st.hasTile(flags bit0),禁裸读 type≠0;
 *  - 注入函数命名纪律:swPerf 前缀(框架开销单列账,<2% 闸,perf-analyze 自检)。
 *
 * 群落锚定数据面:BIOME_STOPS[].sig 为 src/data/tiles.ts 的定义键(经 __swTiles
 * 解析内部 id)——tests/probe-perf-analyze.test.ts 守卫每键字面存在(防漂移/臆造)。
 */
import { front } from './browser.mjs';
import { sleep } from './perf.mjs';

/**
 * 群落锚定表。band:
 *  - surface   :签名块统计窗=地表带 [surf-24, surf+56],站位 y=surf-4;
 *  - ocean     :surface 的边带特例(x<edgeBand 或 x>w-edgeBand,要求近水);
 *  - underground/ hell:带窗统计(rock 带 / 灰烬带);
 *  - space     :无签名,取最高地形列上方 band 高度;
 *  - structure :全列统计(神庙/地牢/蘑菇=地下结构),站位 y=命中均高-6。
 */
export const BIOME_STOPS = [
  { key: 'forest', label: '森林', sig: ['grass', 'tree'], band: 'surface' },
  { key: 'corrupt', label: '腐化', sig: ['v_25_ebonstone_block', 'v_112_ebonsand_block', 'v_152_ebonstone_brick', 'v_636_corrupt_vines'], band: 'surface' },
  { key: 'crimson', label: '猩红', sig: ['v_199_crimson_grass_block', 'v_234_crimsand_block', 'v_205_crimson_vines', 'ore_crimtane'], band: 'surface' },
  { key: 'jungle', label: '丛林', sig: ['v_60_jungle_grass_block', 'mud', 'v_62_jungle_vines'], band: 'surface' },
  { key: 'hallow', label: '神圣', sig: ['v_117_pearlstone_block', 'v_118_pearlstone_brick'], band: 'surface' },
  { key: 'snow', label: '雪原', sig: ['snow', 'ice', 'snow_brick', 'ice_brick'], band: 'surface' },
  { key: 'desert', label: '沙漠', sig: ['sand', 'sandstone', 'hardened_sand'], band: 'surface' },
  { key: 'ocean', label: '海洋', sig: ['sand'], band: 'ocean' },
  { key: 'underground', label: '地下', sig: ['stone'], band: 'underground' },
  { key: 'hell', label: '地狱', sig: ['ash', 'ore_hellstone'], band: 'hell' },
  { key: 'space', label: '太空', sig: [], band: 'space' },
  { key: 'temple', label: '神庙', sig: ['v_226_lihzahrd_brick'], band: 'structure' },
  { key: 'dungeon', label: '地牢', sig: ['v_41_blue_brick', 'v_43_green_brick', 'v_44_pink_brick', 'v_481_cracked_blue_brick'], band: 'structure' },
  { key: 'mushroom', label: '蘑菇', sig: ['v_70_mushroom_grass_block', 'v_190_glowing_mushroom_block'], band: 'structure' },
];

/** 压力因子表(key→{label};缺省参数见 runStress)。 */
export const STRESS_FACTORS = {
  rain: { label: '暴雨' },
  sand: { label: '沙尘暴' },
  blood: { label: '血月' },
  proj: { label: '弹幕' },
  liquid: { label: '水岩交互' },
  dust: { label: '粒子' },
};

/**
 * 全图扫描锚定各群落站位(只读;页内单次 evaluate,~10^6 次格读,亚秒)。
 * 返回 { stops:[{key,label,band,tx,ty,count,found,why?}], surfMin, spawn:{tx,ty} }。
 * stride:列步距(4=小世界 ~1050 列);minCount:该群落最少签名命中才算"找到"。
 */
export async function discoverBiomeStops(page, { stride = 4, minCount = 12 } = {}) {
  await front(page);
  const res = await page.evaluate(function swPerfScanBiomes({ stops, stride, minCount }) {
    const g = window.__swGame;
    if (!g?.world?.store) return { why: 'no-game' };
    const st = g.world.store;
    const w = st.w, h = st.h;
    const T = window.__swTiles ?? {};
    const n = stops.length;
    // 签名 id → stop 下标【列表】(定义键经 TILE_BY_KEY 解析;解析不到的键记 missing)。
    // ★列表非单值:'sand' 同属 desert 与 ocean——单值映射会把后者饿成 count=0(IIIII239 smoke 实测)
    const idStops = new Map();
    const missing = [];
    stops.forEach((s, i) => {
      for (const k of s.sig) {
        const id = T[k];
        if (id == null) { if (!missing.includes(`${s.key}:${k}`)) missing.push(`${s.key}:${k}`); continue; }
        const list = idStops.get(id) ?? [];
        list.push(i);
        idStops.set(id, list);
      }
    });
    const cntSurf = Array.from({ length: n }, () => new Float64Array(w));
    const cntAll = Array.from({ length: n }, () => new Float64Array(w));
    const ySumAll = Array.from({ length: n }, () => new Float64Array(w));
    const surf = new Int16Array(w).fill(-1);
    let surfMin = h, surfMaxX = Math.floor(w / 2);
    const x0 = 8, x1 = w - 9;
    for (let x = x0; x <= x1; x += stride) {
      // 地表:自顶首个活格(★hasTile=flags bit0,G7 幽灵格纪律)
      let sy = -1;
      const scanTop = Math.min(h - 2, 40 + (g.world.groundLevel ?? 300) >> 0);
      for (let y = 20; y < scanTop + 700; y++) {
        if (st.hasTile(x, y)) { sy = y; break; }
      }
      if (sy < 0) sy = -1;
      surf[x] = sy;
      if (sy >= 0 && sy < surfMin) { surfMin = sy; surfMaxX = x; }
      const lo = Math.max(0, sy - 24), hiSurf = Math.min(h - 1, sy + 56);
      for (let y = Math.min(lo, 20); y < h - 1; y++) {
        const id = st.type[st.idx(x, y)];
        const sis = idStops.get(id);
        if (sis === undefined) continue;
        for (const si of sis) {
          cntAll[si][x]++; ySumAll[si][x] += y;
          if (y >= lo && y <= hiSurf) cntSurf[si][x]++;
        }
      }
    }
    const spawnTx = g.world.spawnX ?? Math.floor(w / 2);
    const spawnTy = g.world.spawnY ?? surf[spawnTx] ?? 100;
    const rock = g.world.rockLevel ?? Math.floor(h / 3);
    const pickBest = (si, from = x0, to = x1) => {
      let bx = -1, bc = -1;
      for (let x = from; x <= to; x += stride) {
        if (cntAll[si][x] > bc) { bc = cntAll[si][x]; bx = x; }
      }
      return { x: bx, c: bc };
    };
    const out = stops.map((s, i) => {
      const r = { key: s.key, label: s.label, band: s.band, tx: -1, ty: -1, count: 0, found: false };
      if (s.band === 'space') {
        r.tx = surfMaxX; r.ty = Math.max(40, surfMin - 110); r.found = true; r.count = 0;
        return r;
      }
      if (s.band === 'underground') {
        // 地穴带:直接用 rockLevel 带(签名 stone 到处都是,取 spawn 列为代表)
        r.tx = Math.min(x1, Math.max(x0, spawnTx)); r.ty = rock + 80; r.found = true;
        r.count = cntAll[i]?.[r.tx] ?? 0;
        return r;
      }
      if (s.band === 'ocean') {
        const edge = Math.max(200, Math.floor(w * 0.06));
        const pickSurf = (from, to) => {
          let bx = -1, bc = -1;
          for (let x = from; x <= to; x += stride) {
            if (cntSurf[i][x] > bc) { bc = cntSurf[i][x]; bx = x; }
          }
          return { x: bx, c: bc };
        };
        const L = pickSurf(x0, Math.min(x1, edge));
        const R = pickSurf(Math.max(x0, w - edge), x1);
        const best = L.c >= R.c ? L : R;
        r.tx = best.x; r.count = best.c;
        r.found = best.x > 0 && best.c >= minCount;
        if (r.found) r.ty = Math.max(1, surf[r.tx] - 4);
        return r;
      }
      if (s.band === 'hell') {
        const hLo = h - 260, hHi = h - 60;
        let bx = -1, bc = -1;
        for (let x = x0; x <= x1; x += stride) {
          let c = 0;
          for (let y = hLo; y < hHi; y++) {
            const sis = idStops.get(st.type[st.idx(x, y)]);
            if (sis && sis.includes(i)) c++;
          }
          if (c > bc) { bc = c; bx = x; }
        }
        r.tx = bx; r.count = bc; r.found = bx > 0 && bc >= minCount;
        if (r.found) r.ty = h - 140;
        return r;
      }
      if (s.band === 'structure') {
        const b = pickBest(i);
        r.tx = b.x; r.count = b.c; r.found = b.x > 0 && b.c >= minCount;
        if (r.found) {
          const yMean = ySumAll[i][b.x] / Math.max(1, b.c);
          r.ty = Math.max(1, Math.round(yMean) - 6);
        }
        return r;
      }
      // surface 带
      let bx = -1, bc = -1;
      for (let x = x0; x <= x1; x += stride) {
        if (cntSurf[i][x] > bc) { bc = cntSurf[i][x]; bx = x; }
      }
      r.tx = bx; r.count = bc; r.found = bx > 0 && bc >= minCount;
      if (r.found) r.ty = Math.max(1, surf[bx] - 4);
      return r;
    });
    // forest 兜底:扫不出(理论不可能)→ 出生点
    for (const r of out) {
      if (r.key === 'forest' && !r.found) { r.tx = spawnTx; r.ty = Math.max(1, (surf[spawnTx] ?? 100) - 4); r.found = true; r.why = 'fallback-spawn'; }
    }
    return { stops: out, missing, surfMin, spawn: { tx: spawnTx, ty: spawnTy }, rock, h, w };
  }, { stops: BIOME_STOPS, stride, minCount });
  if (res?.why) return { stops: [], missing: [], why: res.why, spawn: null };
  res.stops.forEach((s) => { const spec = BIOME_STOPS.find((b) => b.key === s.key); s.label = spec?.label ?? s.key; });
  return res;
}

/**
 * 安装巡游驱动器(页内 rAF;swPerf 前缀=框架开销账)。
 * route:[{key,label,x,y,dwellMs}](世界 px);speedTps:平移速度(tile/s)。
 * 相机不经手——camera.follow(player) 每帧自缓(Game.ts:10043),只写玩家位
 * (只读纪律:玩家位置不是世界数据)。
 */
export async function installTourDriver(page, { route, speedTps = 40 }) {
  await front(page);
  return page.evaluate(function swPerfTourInstall(cfg) {
    const P = window.__swPerfTour = {
      route: cfg.route, speedTps: cfg.speedTps,
      i: -1, phase: 'idle', legT0: 0, dwellT0: 0,
      from: null, to: null, legMs: 0, done: false, stopped: false,
    };
    function swPerfTourTick() {
      if (P.stopped) return;
      const g = window.__swGame;
      if (!g?.player) { requestAnimationFrame(swPerfTourTick); return; }
      const now = performance.now();
      if (P.phase === 'idle') {
        // 第一站:直接落位
        P.i = 0; P.phase = 'dwell'; P.dwellT0 = now; P.from = null; P.to = P.route[0];
      } else if (P.phase === 'dwell') {
        const stop = P.to ?? P.route[P.i];
        g.player.x = stop.x; g.player.y = stop.y; g.player.vx = 0; g.player.vy = 0;
        if (now - P.dwellT0 >= (stop.dwellMs ?? 6000)) {
          if (P.i + 1 >= P.route.length) { P.done = true; P.stopped = true; return; }
          P.from = stop; P.i += 1; P.to = P.route[P.i];
          const dx = P.to.x - P.from.x, dy = P.to.y - P.from.y;
          const dist = Math.hypot(dx, dy);
          P.legMs = Math.max(300, (dist / 16 / P.speedTps) * 1000);
          P.legT0 = now; P.phase = 'transit';
        }
      } else if (P.phase === 'transit') {
        const s = Math.min(1, (now - P.legT0) / P.legMs);
        g.player.x = P.from.x + (P.to.x - P.from.x) * s;
        g.player.y = P.from.y + (P.to.y - P.from.y) * s;
        g.player.vx = 0; g.player.vy = 0;
        if (s >= 1) { P.phase = 'dwell'; P.dwellT0 = now; }
      }
      requestAnimationFrame(swPerfTourTick);
    }
    requestAnimationFrame(swPerfTourTick);
    return { ok: true, routeLen: cfg.route.length };
  }, { route, speedTps });
}

/** 巡游驱动器状态(宿主切分段依据)。 */
export async function tourState(page) {
  return page.evaluate(() => {
    const P = window.__swPerfTour;
    if (!P) return { installed: false };
    return {
      installed: true, i: P.i, phase: P.phase, done: !!P.done,
      fromKey: P.from?.key ?? null, toKey: P.to?.key ?? null,
      playerX: window.__swGame?.player?.x ?? 0, playerY: window.__swGame?.player?.y ?? 0,
    };
  });
}

/**
 * biome-tour 跑分:扫描→route(近邻序,短 transit)→驱动器→按相位切段采集。
 * 返回 { stops, missing, route, skipped }。段名 `dwell:<key>` / `transit:<a>~<b>`。
 */
export async function runBiomeTour(page, rec, {
  dwellMs = 6000, speedTps = 40, measureTransit = true, stride = 4, minCount = 12,
  overallBudgetMs = 30 * 60_000, pollMs = 200, log = () => {},
} = {}) {
  const scan = await discoverBiomeStops(page, { stride, minCount });
  if (scan.why) return { ok: false, why: scan.why, stops: [], missing: [], route: [] };
  const found = scan.stops.filter((s) => s.found);
  const skipped = scan.stops.filter((s) => !s.found).map((s) => s.key);
  // 近邻序(从出生点起,确定性)
  const routeStops = [];
  let cx = scan.spawn.tx, cy = scan.spawn.ty;
  const pool = [...found];
  while (pool.length) {
    let bi = 0, bd = Infinity;
    pool.forEach((s, i) => {
      const d = (s.tx - cx) ** 2 + (s.ty - cy) ** 2;
      if (d < bd) { bd = d; bi = i; }
    });
    const s = pool.splice(bi, 1)[0];
    routeStops.push(s);
    cx = s.tx; cy = s.ty;
  }
  const route = routeStops.map((s, i) => ({
    key: s.key, label: s.label, idx: i,
    x: s.tx * 16, y: s.ty * 16, dwellMs,
  }));
  log(`route(${route.length}): ${route.map((r) => r.key).join(' → ')}${skipped.length ? ` | skip: ${skipped.join(',')}` : ''}`);
  await installTourDriver(page, { route, speedTps });

  const t0 = Date.now();
  let openKind = null;      // { name, key }
  let lastPhase = null;
  const seenDwell = new Set();
  const endOpen = async () => {
    if (!openKind) return null;
    const seg = await rec.endSegment();
    log(`seg end ${seg.name}: fps=${seg.fps.mean} low1=${seg.fps.low1} max=${seg.fps.max}ms fw=${seg.profile?.framework?.pct ?? '-'}%`);
    openKind = null;
    return seg;
  };
  let guard = 0;
  while (guard++ < 200000) {
    if (Date.now() - t0 > overallBudgetMs) { log('tour 超预算,强收'); await endOpen(); break; }
    const st = await tourState(page);
    if (!st.installed) { await endOpen(); break; }
    if (st.done) { await endOpen(); break; }   // ★末站驻留到期后驱动器直接 done——先收段再退
    const phaseKey = `${st.phase}|${st.toKey ?? ''}|${st.fromKey ?? ''}`;
    if (phaseKey !== lastPhase) {
      // 相位变化:收旧段,开新段
      await endOpen();
      if (st.phase === 'dwell' && st.toKey && !seenDwell.has(st.toKey)) {
        seenDwell.add(st.toKey);
        await rec.startSegment(`dwell:${st.toKey}`, { kind: 'dwell' });
        openKind = { name: `dwell:${st.toKey}` };
      } else if (st.phase === 'transit' && st.fromKey && st.toKey && measureTransit) {
        await rec.startSegment(`transit:${st.fromKey}~${st.toKey}`, { kind: 'transit' });
        openKind = { name: `transit:${st.fromKey}~${st.toKey}` };
      }
      lastPhase = phaseKey;
    }
    await sleep(pollMs);
  }
  await endOpen();
  return { ok: true, stops: scan.stops, missing: scan.missing, route, skipped };
}

// ───────────────────────────── stress ─────────────────────────────

/** 页内压力驱动器(弹幕补给/液体台补液/尘喷洒;swPerf 前缀)。 */
export async function installStressDriver(page, { projTarget = 260, dustPerSec = 140, rig = null } = {}) {
  await front(page);
  return page.evaluate(function swPerfStressInstall(cfg) {
    const S = window.__swStress = {
      projTarget: cfg.projTarget, dustPerSec: cfg.dustPerSec, rig: cfg.rig,
      on: { proj: false, liquid: false, dust: false },
      rigT0: 0, dustAcc: 0, projBudget: 0, spawnFail: 0, spawnOk: 0, dustOk: 0, refillN: 0,
      stopped: false,
    };
    function swPerfStressTick() {
      if (S.stopped) return;
      const g = window.__swGame;
      if (!g?.player) { requestAnimationFrame(swPerfStressTick); return; }
      const now = performance.now();
      if (S.on.proj) {
        // 弹幕补给:hostile 弹撞人/撞地即亡 → 持续补到目标数(真实持续负载)
        S.projBudget = 24;
        const list = g.entities?.projectiles;
        if (list) {
          let n = list.length;
          while (n < S.projTarget && S.projBudget-- > 0) {
            const a = Math.random() * Math.PI * 2;
            const r = 120 + Math.random() * 320;
            const x = g.player.cx + Math.cos(a) * r;
            const y = g.player.cy + Math.sin(a) * r - 60;
            const speed = 2 + Math.random() * 4;
            const p = window.__swFlow?.spawnHostileProj?.(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 5, 9, 0);
            if (p && typeof p.then === 'function') {
              p.then(() => { S.spawnOk++; }).catch(() => { S.spawnFail++; });
            } else if (p) S.spawnOk++; else S.spawnFail++;
            n++;
          }
        }
      }
      if (S.on.liquid && S.rig?.cells) {
        // 液体台回填:接触面生成黑曜石/消耗掉的液格按原 pattern 复位(水/岩交互持续翻腾)
        if (now - S.rigT0 >= 1000) {
          S.rigT0 = now;
          const st = g.world.store;
          const obsId = S.rig.obsId ?? -1;
          let refilled = 0;
          for (const cell of S.rig.cells) {
            const i = st.idx(cell.x, cell.y);
            if (st.liquid[i] === 0 || (obsId >= 0 && st.type[i] === obsId)) {
              st.setTileSilent?.(cell.x, cell.y, 0, 0, 0);   // 烧除黑曜石残型(裸 type 写禁——G7)
              st.liquid[i] = 255;
              st.liquidType[i] = cell.type;
              refilled++;
            }
          }
          S.refillN += refilled;
        }
      }
      if (S.on.dust) {
        // 尘喷洒:视口内均布(原版 NewDust 密度门会自节流——真实负载语义)
        S.dustAcc += (S.dustPerSec / 60);
        const dust = g.vanillaDust;
        while (S.dustAcc >= 1) {
          S.dustAcc -= 1;
          const x = g.player.cx + (Math.random() - 0.5) * (g.camera?.viewW ?? 1200) * 0.9;
          const y = g.player.cy + (Math.random() - 0.5) * (g.camera?.viewH ?? 700) * 0.9;
          const type = Math.random() < 0.5 ? 31 : 6;   // 31=火 6=烟(尾焰族常用型)
          const d = dust?.spawn?.(x, y, 4, 4, type, (Math.random() - 0.5) * 1.5, -0.5 - Math.random(), 255, null, 1);
          if (d) S.dustOk++;
        }
      }
      requestAnimationFrame(swPerfStressTick);
    }
    requestAnimationFrame(swPerfStressTick);
    return { ok: true, hasSpawnBridge: typeof window.__swFlow?.spawnHostileProj === 'function' };
  }, { projTarget, dustPerSec, rig });
}

export async function stressFlags(page, flags) {
  return page.evaluate(function swPerfStressFlags(f) {
    const S = window.__swStress;
    if (!S) return { ok: false, why: 'no-driver' };
    Object.assign(S.on, f);
    return { ok: true, on: { ...S.on } };
  }, flags);
}

export async function stressStats(page) {
  return page.evaluate(() => {
    const S = window.__swStress;
    if (!S) return null;
    return { spawnOk: S.spawnOk, spawnFail: S.spawnFail, dustOk: S.dustOk, refillN: S.refillN };
  });
}

export async function stopStressDriver(page) {
  return page.evaluate(() => { if (window.__swStress) window.__swStress.stopped = true; return true; });
}

/** 天气/时辰注入(暴雨/沙尘暴/血月;只动天气状态机字段,不写 tile)。 */
export async function setWeather(page, { rain = null, sandstorm = null, bloodMoon = null, tod = null } = {}) {
  await front(page);
  return page.evaluate(function swPerfSetWeather(w) {
    const g = window.__swGame;
    if (!g?.world) return { ok: false, why: 'no-world' };
    const we = g.world.weather, ck = g.world.clock;
    const out = {};
    if (w.rain != null) {
      if (w.rain) {
        we.rainTime = 5183999;                 // 接近永雨上限(5184000 内不死机)
        we.startRain?.(true, 1);               // instant+强度 1(ChangeRain override)
        we.maxRaining = Math.max(we.maxRaining, 1);
        we.cloudAlpha = Math.max(we.cloudAlpha, 1);
      } else {
        we.stopRain?.(true);
        we.raining = false; we.maxRaining = 0; we.cloudAlpha = 0; we.rainTime = 0;
      }
      out.raining = we.raining;
    }
    if (w.sandstorm != null) {
      const ss = we.sandstorm;
      if (w.sandstorm) {
        ss.happening = true; ss.timeLeft = 1e7; ss.severity = 1; ss.intendedSeverity = 1;
        // HasSufficientWind 门:|wind|≥0.6 才维持(Sandstorm.cs:22)——钉住风场
        we.windSpeedCurrent = 0.8; we.windSpeedTarget = 0.8;
      } else {
        ss.happening = false; ss.timeLeft = 0; ss.severity = 0; ss.intendedSeverity = 0;
      }
      out.sandstorm = ss.happening;
    }
    if (w.bloodMoon != null) { ck.bloodMoon = w.bloodMoon; out.bloodMoon = ck.bloodMoon; }
    if (w.tod != null) { ck.timeOfDay = w.tod; out.tod = ck.timeOfDay; }
    return { ok: true, ...out };
  }, { rain, sandstorm, bloodMoon, tod });
}

/**
 * 液体台(水岩交互):石盆+水/岩交界面。build 走【液先置 tile 后置】变体——
 * 盆体一次性静默写(生成期语义),液体直写;返回 cells(驱动器补液用)。
 * teardown=true 时清场(拆台,恢复空地)。
 */
export async function buildLiquidRig(page, { tx, ty, wCols = 44, hRows = 12 } = {}) {
  await front(page);
  return page.evaluate(function swPerfBuildRig(c) {
    const g = window.__swGame;
    const st = g.world.store;
    const T = window.__swTiles ?? {};
    const { tx, ty, wCols, hRows, teardown } = c;
    const stoneId = T['stone'] ?? 1;          // 素名键(src/data/tiles.ts def key)
    const obsId = T['obsidian'] ?? -1;
    const cells = [];
    for (let x = tx; x < tx + wCols; x++) {
      for (let y = ty; y < ty + hRows + 2; y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        // 全位归零(含 liquid/wire/paint/half/slope——clearArea 同款)
        st.setTileSilent?.(x, y, 0, 0, 0);
        st.liquid[i] = 0; st.wire[i] = 0; st.paint[i] = 0; st.half[i] = 0; st.slope[i] = 0;
      }
    }
    if (teardown) { window.__swStressRig = null; return { ok: true, tornDown: true }; }
    // 盆:底 + 左右壁(石),内部下半岩浆上半水(接触面即翻腾源)
    const floorY = ty + hRows - 1;
    for (let x = tx; x < tx + wCols; x++) {
      st.setTileSilent?.(x, floorY, stoneId, 0, 0);
      st.setTileSilent?.(x, floorY + 1, stoneId, 0, 0);
    }
    for (let y = ty; y <= floorY; y++) {
      st.setTileSilent?.(tx, y, stoneId, 0, 0);
      st.setTileSilent?.(tx + wCols - 1, y, stoneId, 0, 0);
    }
    const mid = ty + Math.floor(hRows / 2);
    for (let x = tx + 1; x < tx + wCols - 1; x++) {
      for (let y = mid; y < floorY; y++) {
        const i = st.idx(x, y);
        st.liquid[i] = 255; st.liquidType[i] = 2;          // +1 编码:2=lava(坑表 G 域注)
        cells.push({ x, y, type: 2 });
      }
      for (let y = ty + 1; y < mid; y++) {
        const i = st.idx(x, y);
        st.liquid[i] = 255; st.liquidType[i] = 1;          // 1=water
        cells.push({ x, y, type: 1 });
      }
    }
    window.__swStressRig = { tx, ty, wCols, hRows };
    return { ok: true, n: cells.length, cells, obsId, anchor: { tx, ty } };
  }, { tx, ty, wCols, hRows, teardown: false });
}

export async function teardownLiquidRig(page, { tx, ty, wCols = 44, hRows = 12 } = {}) {
  return buildLiquidRig(page, { tx, ty, wCols, hRows: hRows + 2, teardown: true });
}

/**
 * stress 跑分:每因子一段(注入→测量→还原)+全组合段。
 * 沙尘暴段把玩家挪到沙漠站(原版沙暴视觉域);其余段在液体台锚点上方。
 */
export async function runStress(page, rec, {
  factors = Object.keys(STRESS_FACTORS), dwellMs = 8000, comboMs = 10000,
  projTarget = 260, dustPerSec = 140, rigCols = 44, rigRows = 12,
  desertStop = null, anchor = null, log = () => {},
} = {}) {
  const g_info = await page.evaluate(() => {
    const g = window.__swGame, st = g?.world?.store;
    return {
      ok: !!st, spawnX: g?.world?.spawnX ?? 0, surfY: g?.world?.groundLevel ?? 300, w: st?.w ?? 0,
      px: g?.player?.cx ?? 0, py: g?.player?.cy ?? 0,
    };
  });
  if (!g_info.ok) return { ok: false, why: 'no-game' };
  // 锚点:出生点右侧 80 格地表(避开出生结构;越界钳制)
  const atx = anchor?.tx ?? Math.min(g_info.w - 120, g_info.spawnX + 80);
  const aty = anchor?.ty ?? g_info.surfY - 8;
  const rigAnchor = { tx: atx + 4, ty: aty + 4 };
  await installStressDriver(page, { projTarget, dustPerSec, rig: null });
  const segments = [];
  const doSeg = async (name, kind, fn) => {
    await rec.startSegment(name, { kind });
    await fn();
    const seg = await rec.endSegment();
    segments.push(seg);
    log(`seg end ${name}: fps=${seg.fps.mean} low1=${seg.fps.low1} max=${seg.fps.max}ms lt=${seg.longtasks.count}`);
    return seg;
  };
  const park = async (tx, ty) => {
    await page.evaluate(({ tx, ty }) => {
      const g = window.__swGame;
      g.player.x = tx * 16; g.player.y = ty * 16; g.player.vx = 0; g.player.vy = 0;
      g.camera.x = tx * 16; g.camera.y = ty * 16;
    }, { tx, ty });
    await sleep(700);   // 相机 follow 缓动稳定(坑表 E1)
  };
  await park(atx, aty);
  const restoreTod = 0.5;
  for (const f of factors) {
    if (f === 'rain') {
      await setWeather(page, { rain: true });
      await doSeg('stress:rain', 'stress', async () => { await sleep(dwellMs); });
      await setWeather(page, { rain: false });
    } else if (f === 'sand') {
      const d = desertStop;
      const px = d ? d.tx : atx, py = d ? d.ty : aty;
      await park(px, py);
      await setWeather(page, { sandstorm: true });
      await doSeg('stress:sandstorm', 'stress', async () => { await sleep(dwellMs); });
      await setWeather(page, { sandstorm: false });
      await park(atx, aty);
    } else if (f === 'blood') {
      await setWeather(page, { bloodMoon: true, tod: 23 / 24 });
      await doSeg('stress:bloodmoon', 'stress', async () => { await sleep(dwellMs); });
      await setWeather(page, { bloodMoon: false, tod: restoreTod });
    } else if (f === 'proj') {
      await stressFlags(page, { proj: true });
      await doSeg('stress:projectiles', 'stress', async () => { await sleep(dwellMs); });
      await stressFlags(page, { proj: false });
      await page.evaluate(() => { const g = window.__swGame; if (g) g.entities.projectiles.length = 0; });
    } else if (f === 'liquid') {
      const rig = await buildLiquidRig(page, { tx: rigAnchor.tx, ty: rigAnchor.ty, wCols: rigCols, hRows: rigRows });
      await page.evaluate((r) => { if (window.__swStress) window.__swStress.rig = { cells: r.cells, obsId: r.obsId }; }, rig);
      await stressFlags(page, { liquid: true });
      await doSeg('stress:liquid', 'stress', async () => { await sleep(dwellMs); });
      await stressFlags(page, { liquid: false });
      await teardownLiquidRig(page, { tx: rigAnchor.tx, ty: rigAnchor.ty, wCols: rigCols, hRows: rigRows });
    } else if (f === 'dust') {
      await stressFlags(page, { dust: true });
      await doSeg('stress:dust', 'stress', async () => { await sleep(dwellMs); });
      await stressFlags(page, { dust: false });
    }
  }
  // 全组合段(所有已跑因子同时开)
  if (factors.length > 1) {
    if (factors.includes('liquid')) {
      const rig = await buildLiquidRig(page, { tx: rigAnchor.tx, ty: rigAnchor.ty, wCols: rigCols, hRows: rigRows });
      await page.evaluate((r) => { if (window.__swStress) window.__swStress.rig = { cells: r.cells, obsId: r.obsId }; }, rig);
    }
    await setWeather(page, {
      rain: factors.includes('rain'),
      sandstorm: false,   // 沙暴视觉域在沙漠,组合段在锚点(保留 sim 成本,关视觉重复)
      bloodMoon: factors.includes('blood'),
      tod: factors.includes('blood') ? 23 / 24 : restoreTod,
    });
    await stressFlags(page, { proj: factors.includes('proj'), liquid: factors.includes('liquid'), dust: factors.includes('dust') });
    await doSeg('stress:combo', 'stress', async () => { await sleep(comboMs); });
    await stressFlags(page, { proj: false, liquid: false, dust: false });
    await setWeather(page, { rain: false, sandstorm: false, bloodMoon: false, tod: restoreTod });
    await page.evaluate(() => { const g = window.__swGame; if (g) g.entities.projectiles.length = 0; });
    if (factors.includes('liquid')) await teardownLiquidRig(page, { tx: rigAnchor.tx, ty: rigAnchor.ty, wCols: rigCols, hRows: rigRows });
  }
  const stats = await stressStats(page);
  await stopStressDriver(page);
  return { ok: true, anchor: { tx: atx, ty: aty }, rigAnchor, stats };
}
