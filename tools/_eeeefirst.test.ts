// EEEE 批·首发散定位：JS 接受序列 vs golden 陷阱集合，找第一个 JS 接受在 golden 无对应。
// 用法：cd game && SW_EEEE_DBG=1 SW_EEEE4=1 npx vitest run tools/_eeeefirst.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid, vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runTrapsPass, placeTrap, placeSandTrap as placeSandTrapPub, eeeeLog, SAND_REJ } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_EEEE4 === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const rd16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

(RUN ? it : it.skip)('EEEE first divergence', () => {
  const gs = JSON.parse(readFileSync(`${BDIR}/s30/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s30/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s30/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${BDIR}/s30/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);

  const t75 = rd16(gPath(75, 'typ')), a75 = rd8(gPath(75, 'act'));
  const w75 = rd16(gPath(75, 'wal')), l75 = rd8(gPath(75, 'liq')), lt75 = rd8(gPath(75, 'lty'));
  const hf75 = rd8(gPath(75, 'half')), sl75 = rd8(gPath(75, 'slope'));
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = a75[i]!;
    st.flags[i] = act;
    if (act || t75[i]) {
      const sh = t75[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      if (id < 0) id = 0;
      st.type[i] = id;
    } else st.type[i] = 0;
    st.wall[i] = w75[i]!;
    st.liquid[i] = l75[i]!;
    st.liquidType[i] = l75[i] ? lt75[i]! + 1 : 0;
    st.half[i] = hf75[i]!;
    st.slope[i] = sl75[i]!;
    st.wire[i] = wire[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  __setGenStateForProbe(structuredClone(gs));
  // ---- 逐步驱动主循环（带 RNG 计数），登记每次尝试 ----
  const rng0 = new RNG(SEED);
  let rolls = 0;
  const rng = new Proxy(rng0, {
    get(t, k) {
      const v = Reflect.get(t, k);
      if (k === 'int' || k === 'next') {
        return (...args: unknown[]) => { rolls++; return (v as (...a: unknown[]) => unknown).apply(t, args); };
      }
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  type Att = { i: number; j: number; x: number; y: number; ok: boolean; r0: number; r1: number; accept: number; l0: number; l1: number };
  const atts: Att[] = [];
  let accept = 0;
  const gsRun = structuredClone(gs);
  const st2 = st;
  const flips: Array<[number, boolean]> = [];
  for (let n = 0; n < st2.w * 0.05; n++) {
    for (let k = 0; k < 1150; k++) {
      let x = rng.int(200, st2.w - 201);
      let y = rng.int(gsRun.worldSurface, st2.h - 211);
      const oceanTop = (gsRun.worldSurface + gsRun.rockLevel) / 2 + 40;
      while (y <= oceanTop && (x < gsRun.beachDistance || x > st2.w - gsRun.beachDistance)) {
        x = rng.int(200, st2.w - 201);
        y = rng.int(gsRun.worldSurface, st2.h - 211);
      }
      const r0 = rolls;
      const ok = st2.wall[st2.idx(x, y)] === 0 && placeTrap(st2, rng, gsRun, x, y, -1);
      const l0 = eeeeLog.length;
      atts.push({ i: n, j: k, x, y, ok, r0, r1: rolls, accept: ok ? accept++ : -1, l0, l1: eeeeLog.length });
      if (ok) break;
    }
    if (n === 208) flips.push([0, false]);
  }
  void flips;
  // 沙子循环（镜像 runTrapsPass 尾段）+ k4 登记
  const gsSand = structuredClone(gs);
  let wallHits = 0, tries = 0;
  for (let n = 0; n < st2.w * 0.003; n++) {
    for (let k = 0; k < 20000; k++) {
      tries++;
      const x = rng.int(Math.floor(st2.w * 0.15), Math.floor(st2.w * 0.85) - 1);
      const y = rng.int(gsSand.worldSurface + 20, st2.h - 211);
      if (st2.wall[st2.idx(x, y)] === 187) {
        wallHits++;
        if (placeSandTrapPub(st2, rng, gsSand, x, y)) break;
      }
    }
  }
  console.log(`sand stats: tries=${tries} wall187hits=${wallHits}`);
  console.log('sand rejects:', JSON.stringify(Object.fromEntries(Object.entries(SAND_REJ).sort((a, b) => b[1] - a[1]))));
  const k4 = eeeeLog.filter(e => e.k === 4);
  console.log(`k4 sand accepts: ${k4.length}: ${k4.map((e, q) => `(${e.x2},${e.py})`).join(' ')}`);
  // eeeeLog 由 placeTrap 填充（SW_EEEE_DBG）
  __setGenStateForProbe(null);
  const acc173 = atts.find(a => a.accept === 173)!;
  console.log(`accept#173 at i=${acc173.i} j=${acc173.j} (${acc173.x},${acc173.y}) rolls=${acc173.r0}`);
  // eeeeLog#172(geyser 1548,997) 到 #173 之间的尝试：列出消耗>2 掷的（进入分支者）
  const idx172 = atts.findIndex(a => a.l1 === 173);   // 该尝试把 eeeeLog 推到 173（即 #172 号接受）
  let idx173 = -1;
  for (let q = idx172 + 1; q < atts.length; q++) if (atts[q]!.l1 > 173) { idx173 = q; break; }
  console.log(`#172 at att#${idx172} (${atts[idx172]!.x},${atts[idx172]!.y}); #173 at att#${idx173} = (${atts[idx173]!.x},${atts[idx173]!.y})`);
  for (let q = idx172 + 1; q <= idx173; q++) {
    const a = atts[q]!;
    const d = a.r1 - a.r0;
    // 逐门复算（状态在此窗口内不变）
    const shx = gs.shimmerX >= 0 ? gs.shimmerX : 0, shy = gs.shimmerY >= 0 ? gs.shimmerY : 0;
    const shimmer = Math.hypot(a.x - shx, a.y - shy) < 100;
    const wallv = st.wall[st.idx(a.x, a.y)];
    let py = a.y, why = '';
    const solidAt = (x: number, y: number) => {
      if (!st.inBounds(x, y)) return false;
      const i = st.idx(x, y);
      return st.flags[i] !== 0;
    };
    void solidAt;
    if (shimmer) why = 'shimmer';
    else if (wallv !== 0) why = `wall${wallv}`;
    else {
      // 下扫复算（solidTileV 语义粗算：active 即记行——精确谓词在 pass 内，此处仅定位）
      let j = a.y, deep = false;
      while (j < st.h - 1 && !st.flags[st.idx(a.x, j)]) { j++; if (j > st.h - 10) break; if (j >= st.h - 300) deep = true; }
      py = j - 1;
      why = `py=${py} deep=${deep}`;
    }
    if (d >= 2) {
      // 复算 pass 级下扫（solidTileV 语义）+ 逐门
      const SOLID_TOP = new Set([14,16,18,19,87,88,101,114,134,239,275,276,277,278,279,280,281,285,286,296,297,298,299,309,310,339,358,359,361,362,363,364,376,380,391,392,393,394,405,413,414,427,469,532,533,538,542,544,550,551,553,554,555,556,558,559,582,599,600,601,602,603,604,605,606,607,608,609,610,611,612,619,629,632,640,643,644,645,710]);
      const sheetOfT = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
      const solidV = (x: number, y: number) => {
        if (!st.inBounds(x, y)) return false;
        const i = st.idx(x, y);
        const t = st.type[i]!;
        return st.flags[i] !== 0 && vanGenSolidType(t) && !SOLID_TOP.has(sheetOfT(t)) && !st.half[i] && st.slope[i] === 0 && ((st.wire[i] >>> 5) & 1) === 0;
      };
      let py2 = a.y, deep2 = false;
      while (!solidV(a.x, py2)) { py2++; if (py2 > st.h - 10) break; if (py2 >= st.h - 300) deep2 = true; }
      py2--;
      const gi = st.idx(a.x, py2);
      const nine = [[0,0],[-1,0],[1,0],[0,-1],[-1,-1],[1,-1],[0,-2],[-1,-2],[1,-2]].some(([dx,dy]) => st.flags[st.idx(a.x+dx, py2+dy)] !== 0);
      const below = st.idx(a.x, py2 + 1);
      console.log(`    ↳ py2=${py2} deep=${deep2} nactive9=${nine} below(type=${TILE_DEFS[st.type[below]!]?.vanilla?.sheet},h=${st.half[below]},s=${st.slope[below]},fx=${st.frameX[below]}) wall@py=${st.wall[gi]} liq=${st.liquid[gi]}/${st.liquidType[gi]}`);
    }
    console.log(`  att#${q} i=${a.i} j=${a.j} (${a.x},${a.y}) delta=${d} ${why}`);
  }

  // golden76 的新增陷阱集合（75→76）
  const t76 = rd16(gPath(76, 'typ')), a76 = rd8(gPath(76, 'act'));
  const newPlates = new Set<number>(), newDarts = new Set<number>(), newGeysers = new Set<number>(), newExpl = new Set<number>();
  const newBoulderAnchor = new Set<number>();
  const isB = (t: number) => t === 138 || t === 664 || (t >= 711 && t <= 716);
  for (let i = 0; i < N; i++) {
    if (!a76[i]) continue;
    const t = t76[i]!;
    if (a75[i] && t75[i] === t) continue;   // 已存在
    if (t === 135) newPlates.add(i);
    else if (t === 137) newDarts.add(i);
    else if (t === 443) newGeysers.add(i);
    else if (t === 141) newExpl.add(i);
    else if (isB(t) && !(a76[i - 1] && isB(t76[i - 1]!)) && !(a76[i - W] && isB(t76[i - W]!))) newBoulderAnchor.add(i);
  }
  console.log(`golden new: plates=${newPlates.size} darts=${newDarts.size} geysers=${newGeysers.size} expl=${newExpl.size} boulderAnchors=${newBoulderAnchor.size}`);
  console.log(`JS eeeeLog: ${eeeeLog.length}  kinds: ${[...new Set(eeeeLog.map(e => e.k))].join(',')}`);
  // 逐 JS 接受对账：plate@ (x2,py)；dart@(ax,ay)；boulder@(ax+1,ay+1)；geyser@(x2,py)；explt@(ax,ay)
  let firstMiss = -1;
  const missList: string[] = [];
  for (let q = 0; q < eeeeLog.length; q++) {
    const e = eeeeLog[q]!;
    let ok = false;
    if (e.k === 0) {
      ok = newPlates.has(e.py! * W + e.x2!) && newDarts.has(e.ay! * W + e.ax!);
    } else if (e.k === 1) {
      ok = newPlates.has(e.py! * W + e.x2!) && newBoulderAnchor.has((e.ay! - 2) * W + e.ax!);   // ay 记录于 top+=2 后，锚=(ax, ay-2)
    } else if (e.k === 2) {
      ok = newPlates.has(e.py! * W + e.x2!) && newExpl.has(e.ay! * W + e.ax!);
    } else if (e.k === 3) {
      ok = newGeysers.has(e.py! * W + e.x2!);
    } else if (e.k === 4) {
      ok = newPlates.has(e.py! * W + e.x2!);
    }
    if (!ok) {
      if (firstMiss < 0) firstMiss = q;
      if (missList.length < 30) missList.push(`#${q} k${e.k} x2=${e.x2} py=${e.py} ax=${e.ax} ay=${e.ay}`);
    }
  }
  console.log(`first miss at log index: ${firstMiss} / ${eeeeLog.length}`);
  // 反向：golden 新陷阱在 JS 日志无对应
  const jsPlates = new Set<number>(), jsDarts = new Set<number>(), jsGeysers = new Set<number>(), jsExpl = new Set<number>(), jsAnchors = new Set<number>();
  for (const e of eeeeLog) {
    if (e.k === 0) { jsPlates.add(e.py! * W + e.x2!); jsDarts.add(e.ay! * W + e.ax!); }
    else if (e.k === 1) { jsPlates.add(e.py! * W + e.x2!); jsAnchors.add((e.ay! - 2) * W + e.ax!); }
    else if (e.k === 2) { jsPlates.add(e.py! * W + e.x2!); jsExpl.add(e.ay! * W + e.ax!); }
    else if (e.k === 3) jsGeysers.add(e.py! * W + e.x2!);
    else if (e.k === 4) jsPlates.add(e.py! * W + e.x2!);
  }
  const gOnly = { plate: 0, dart: 0, geyser: 0, expl: 0, anchor: 0 };
  const gOnlyList: string[] = [];
  for (const i of newPlates) if (!jsPlates.has(i)) { gOnly.plate++; if (gOnlyList.length < 20) gOnlyList.push(`plate(${i % W},${(i / W) | 0})`); }
  for (const i of newDarts) if (!jsDarts.has(i)) { gOnly.dart++; if (gOnlyList.length < 20) gOnlyList.push(`dart(${i % W},${(i / W) | 0})`); }
  for (const i of newGeysers) if (!jsGeysers.has(i)) gOnly.geyser++;
  for (const i of newExpl) if (!jsExpl.has(i)) gOnly.expl++;
  for (const i of newBoulderAnchor) if (!jsAnchors.has(i)) { gOnly.anchor++; if (gOnlyList.length < 20) gOnlyList.push(`anchor(${i % W},${(i / W) | 0})`); }
  console.log(`golden-only traps: ${JSON.stringify(gOnly)}`);
  console.log(`entries near 3787 site (x2∈[3775,3800]): ${eeeeLog.map((e, q) => ({ q, ...e })).filter(e => e.x2! >= 3775 && e.x2! <= 3800).map(e => `#${e.q}k${e.k}(${e.x2},${e.py})a(${e.ax},${e.ay})`).join(' ')}`);
  console.log(`entries near 878/880 site (x2∈[870,890]): ${eeeeLog.map((e, q) => ({ q, ...e })).filter(e => e.x2! >= 870 && e.x2! <= 890).map(e => `#${e.q}k${e.k}(${e.x2},${e.py})a(${e.ax},${e.ay})`).join(' ')}`);
  console.log(`JS kinds count: k0=${eeeeLog.filter(e => e.k === 0).length} k1=${eeeeLog.filter(e => e.k === 1).length} k2=${eeeeLog.filter(e => e.k === 2).length} k3=${eeeeLog.filter(e => e.k === 3).length}`);
  // 邻域细看：golden (2022,581) 巨石 2×2 vs JS 的对应
  console.log(`entries near x2∈[2015,2035]: ${eeeeLog.map((e, q) => ({ q, ...e })).filter(e => e.x2! >= 2015 && e.x2! <= 2035).map(e => `#${e.q}k${e.k}(${e.x2},${e.py})a(${e.ax},${e.ay})`).join(' ')}`);
  const a2022 = [...newBoulderAnchor].map(i => `(${i % W},${(i / W) | 0})`).filter(t => t.startsWith('(20') && (parseInt(t.slice(1)) >= 2010 && parseInt(t.slice(1)) <= 2040));
  console.log(`golden anchors 2010-2040: ${a2022.join(' ')}`);
  console.log(`  ${gOnlyList.join(' ')}`);
  console.log(`misses:\n  ${missList.join('\n  ')}`);
  // 前后文
  if (firstMiss > 0) {
    console.log('context around first miss:');
    for (let q = Math.max(0, firstMiss - 6); q < Math.min(eeeeLog.length, firstMiss + 8); q++) {
      const e = eeeeLog[q]!;
      console.log(`  ${q === firstMiss ? '>>' : '  '} #${q} k${e.k} x2=${e.x2} py=${e.py} ax=${e.ax} ay=${e.ay} b=${e.b ?? ''}`);
    }
  }
}, 560_000);
