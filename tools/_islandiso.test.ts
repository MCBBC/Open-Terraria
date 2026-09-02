// 一次性诊断：#23 浮空岛隔离重放——dump022（原版 Granite 末态）直接构造 store，
// 跑 runFloatingIslandsPass，对拍 dump023。剥离 #21/#22 上游污染，纯测本 pass。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runFloatingIslandsPass } from '../src/world/gen/vanilla/StructuresPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const load = (idx: number, ext: string, name: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const t22 = RUN ? new Uint16Array(load(22, 'typ', 'Granite').buffer.slice(0)) : new Uint16Array(0);
const a22 = RUN ? load(22, 'act', 'Granite') : Buffer.alloc(0);   // ★套件门:RUN=0 不读夹具
const w22 = RUN ? new Uint16Array(load(22, 'wal', 'Granite').buffer.slice(0)) : new Uint16Array(0);
const l22 = RUN ? load(22, 'liq', 'Granite') : Buffer.alloc(0);
const t23 = RUN ? new Uint16Array(load(23, 'typ', 'Floating_Islands').buffer.slice(0)) : new Uint16Array(0);
const a23 = RUN ? load(23, 'act', 'Floating_Islands') : Buffer.alloc(0);
const w23 = RUN ? new Uint16Array(load(23, 'wal', 'Floating_Islands').buffer.slice(0)) : new Uint16Array(0);
const l23 = RUN ? load(23, 'liq', 'Floating_Islands') : Buffer.alloc(0);

// sheet → repo id 反查
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const CLOUDS = new Set([189, 196, 717, 718, 719]);

(RUN ? it : it.skip)('islands isolated replay from dump022', () => {
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    if (a22[i]) st.type[i] = REV.get(t22[i]) ?? 0;
    st.flags[i] = a22[i] ? 1 : 0;
    st.wall[i] = w22[i];
    st.liquid[i] = l22[i];
    st.liquidType[i] = 0;
  }
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const gs = rt.gs;
  const rng = new RNG(gs.seed);
  let draws = 0;
  const oInt = rng.int.bind(rng);
  rng.int = (a: number, b: number) => { draws++; return oInt(a, b); };
  runFloatingIslandsPass(st, rng, gs);
  console.log(`pass 掷骰数=${draws}`);

  // 对拍 dump023：云族格 + 全域 act/typ/wal/liq 差
  let cloudVan = 0, cloudJs = 0, act = 0, typ = 0, wal = 0, liq = 0;
  const cells: string[] = [];
  for (let y = 0; y < 340; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const vT = a23[i] ? t23[i] : 0, jT = st.flags[i] ? (SHEET[st.type[i]] ?? -1) : 0;
    if (CLOUDS.has(vT)) cloudVan++;
    if (CLOUDS.has(jT)) cloudJs++;
    const dA = (a23[i] !== 0) !== (st.flags[i] !== 0);
    if (dA) { act++; if (cells.length < 30) cells.push(`(${x},${y})v${vT}/j${jT}`); }
    if (!dA && a23[i] && vT !== jT) typ++;
    if (st.wall[i] !== w23[i]) wal++;
    if (st.liquid[i] !== l23[i]) liq++;
  }
  console.log(`y<340: 云族 van=${cloudVan} js=${cloudJs} | act差=${act} typ差=${typ} wal差=${wal} liq差=${liq}`);
  console.log(cells.join(' '));

  // 岛锚点 bbox
  const massesOf = (getT: (i: number) => number): string => {
    const mark = new Uint8Array(340 * W);
    const out: string[] = [];
    const fam = (t: number) => CLOUDS.has(t) || t === 0 || t === 2 || t === 53 || t === 57;
    for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mark[i] || !fam(getT(i))) continue;
      let x0 = x, x1 = x, y0 = y, y1 = y, cnt = 0;
      const q: number[] = [i];
      mark[i] = 1;
      while (q.length) {
        const c = q.pop()!;
        const cx = c % W, cy = (c / W) | 0;
        cnt++;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= 200) continue;
          const ni = ny * W + nx;
          if (!mark[ni] && fam(getT(ni))) { mark[ni] = 1; q.push(ni); }
        }
      }
      if (cnt > 200) out.push(`(${x0},${y0})-(${x1},${y1})n${cnt}`);
    }
    return out.join(' ');
  };
  console.log('van 岛团:', massesOf((i) => (a23[i] ? t23[i] : -1)));
  console.log('js  岛团:', massesOf((i) => (st.flags[i] ? SHEET[st.type[i]]! : -1)));
}, 480000);

// 附加:岛锚点序列日志 + 逐岛区间
(RUN ? it : it.skip)('island anchor sequence log', () => {
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    if (a22[i]) st.type[i] = REV.get(t22[i]) ?? 0;
    st.flags[i] = a22[i] ? 1 : 0;
    st.wall[i] = w22[i];
    st.liquid[i] = l22[i];
    st.liquidType[i] = 0;
  }
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const gs = rt.gs;
  console.log(`gs.worldSurface=${gs.worldSurface} worldSurfaceLow=${gs.worldSurfaceLow}`);
  const rng = new RNG(gs.seed);
  let draws = 0;
  const oInt = rng.int.bind(rng), oNext = rng.next.bind(rng);
  rng.int = (a: number, b: number) => { draws++; return oInt(a, b); };
  rng.next = () => { draws++; return oNext(); };
  const d0 = draws;
  const islands: Array<[number, number, boolean]> = [];
  // 包装 cloudIsland/cloudLake 不可行(模块内私有)——用 gs.floatingIslands 后验。
  // 改为逐岛截断:手动重放 driver 逻辑复刻 runFloatingIslandsPass 但每岛后记 draws。
  const { w } = st;
  const isCount = Math.trunc(w * 0.0008);
  const total = isCount + 1;
  const housesX: number[] = [];
  let lakes = 0;
  for (let n = 0; n < total; n++) {
    let budget = w;
    while (--budget > 0) {
      let ok = true;
      let x = rng.int(Math.floor(w * 0.1), Math.floor(w * 0.9) - 1);
      while (x > w / 2 - 150 && x < w / 2 + 150) x = rng.int(Math.floor(w * 0.1), Math.floor(w * 0.9) - 1);
      for (let j = 0; j < housesX.length; j++) {
        if (x > housesX[j]! - 180 && x < housesX[j]! + 180) { ok = false; break; }
      }
      if (!ok) continue;
      ok = false;
      let surf = 0;
      for (let y = 200; y < gs.worldSurface && y < st.h; y++) {
        if (st.flags[st.idx(x, y)]) { surf = y; ok = true; break; }
      }
      if (!ok) continue;
      budget = -1;
      const y = Math.min(rng.int(90, surf - 101), gs.worldSurfaceLow - 50);
      const isLake = lakes >= isCount;
      islands.push([x, y, isLake, draws - d0]);
      // 复刻真实放置(直接再跑一遍完整 pass 会重复——这里只记锚点,放置用原函数无法逐岛截断)
      housesX.push(x);
      if (!isLake) lakes++;
      break;
    }
  }
  console.log('JS 锚点序列(driver 重放,无放置):', JSON.stringify(islands));
}, 480000);

// 附加:岛#1 ASCII 对照(隔离重放 JS 写入)
(RUN ? it : it.skip)('island1 ascii js', () => {
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    if (a22[i]) st.type[i] = REV.get(t22[i]) ?? 0;
    st.flags[i] = a22[i] ? 1 : 0;
    st.wall[i] = w22[i];
    st.liquid[i] = l22[i];
    st.liquidType[i] = 0;
  }
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const rng = new RNG(rt.gs.seed);
  const tape: number[] = [];
  const oInt2 = rng.int.bind(rng);
  rng.int = (a: number, b: number) => { const v = oInt2(a, b); tape.push(v); return v; };
  runFloatingIslandsPass(st, rng, rt.gs);
  console.log('实际岛序列:', JSON.stringify(rt.gs.floatingIslands));
  console.log('TAPE=' + JSON.stringify({ tape, a: tape.length }));
  const rows = [];
  for (let y = 135; y <= 170; y++) {
    let rj = '';
    for (let x = 3505; x <= 3635; x++) {
      const i = y * W + x;
      const jNew = st.flags[i] && !a22[i];
      const sh = st.flags[i] ? SHEET[st.type[i]]! : -1;
      rj += jNew ? (sh === 0 ? 'D' : sh === 189 ? 'C' : sh === 196 ? 'R' : String(sh)[0]) : st.flags[i] ? '.' : ' ';
    }
    rows.push(`${y} ${rj}`);
  }
  console.log('JS 岛#1 写入:');
  console.log(rows.join('\n'));
}, 480000);

// 附加:残余 71 格清单
(RUN ? it : it.skip)('island residual cells', () => {
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    if (a22[i]) st.type[i] = REV.get(t22[i]) ?? 0;
    st.flags[i] = a22[i] ? 1 : 0;
    st.wall[i] = w22[i];
    st.liquid[i] = l22[i];
    st.liquidType[i] = 0;
  }
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const rng = new RNG(rt.gs.seed);
  runFloatingIslandsPass(st, rng, rt.gs);
  const cells: string[] = [];
  for (let y = 0; y < 340; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jT = st.flags[i] ? SHEET[st.type[i]]! : 0;
    if ((a23[i] !== 0) !== (st.flags[i] !== 0)) {
      cells.push(`ACT(${x},${y}) v${a23[i] ? t23[i] : 0}/j${jT} l${l23[i]}/${st.liquid[i]}`);
    } else if (st.flags[i] && a23[i] && jT !== t23[i]) {
      cells.push(`TYP(${x},${y}) v${t23[i]}/j${jT}`);
    } else if (st.liquid[i] !== l23[i]) {
      cells.push(`LIQ(${x},${y}) v${l23[i]}/j${st.liquid[i]} act=${st.flags[i]}/${a23[i]}`);
    }
  }
  console.log(`残余=${cells.length}`);
  console.log(cells.slice(0, 80).join('\n'));
}, 480000);
