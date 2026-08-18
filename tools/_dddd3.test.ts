// DDDD 批探针③：house(1867,543) room1 ②（墙侵蚀）A/B——JS applyChain vs 干净房
// mini-sim（严格按反编译逐行转录）。② 开始时快照 RNG+墙态，双跑对比掷数与首差格。
// 用法：SW_DDDD=3 npx vitest run tools/_dddd3.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runBuriedChestsPass, runUnderworldChestsPass } from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN = process.env.SW_DDDD === '3';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;

function boundary(key: string) {
  const dir = `${BDIR}/${key}`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${dir}/chests.json`, 'utf8')) as unknown[];
  return { gs, gensolid, fx, fy, wire, ids35, chests };
}

function buildHybrid(baseIdx: number, b: ReturnType<typeof boundary>): TileStore {
  const b8 = (e: string) => new Uint8Array(readFileSync(gPath(baseIdx, e)).buffer.slice(0));
  const b16 = (e: string) => new Uint16Array(readFileSync(gPath(baseIdx, e)).buffer.slice(0));
  const c = { t: b16('typ'), a: b8('act'), w: b16('wal'), l: b8('liq'), hf: b8('half'), sl: b8('slope'), lt: b8('lty') };
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = b.ids35.has(i) ? b.ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = 0;
    st.frameX[i] = b.fx[i]; st.frameY[i] = b.fy[i]; st.wire[i] |= b.wire[i];
  }
  return st;
}

// ---- 干净房 ② mini-sim（严格按 Modifiers.cs/Actions.cs/WorldUtils.cs/Framing.cs 转录） ----
const WALL_LARGE_FRAMES = new Set([224, 323, 324, 325, 326, 327, 328, 329, 330, 179, 146, 147, 167, 185, 274, 354, 355, 358, 359, 362, 363, 366]);
const SKIP_AGING = new Set([245, 246, 240, 241, 242]);
interface SimState { wall: Uint16Array; flags: Uint8Array; type: Int32Array; rolls: number; log: string[] }
function simWallFrameResetRoll(S: SimState, rng: RNG, x: number, y: number): void {
  // Framing.WallFrame(i,j,resetFrame=true) 的掷：界外/wall0/大帧墙 → 0 掷
  if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) return;
  const w = S.wall[y * W + x]!;
  if (w === 0) return;
  if (WALL_LARGE_FRAMES.has(w)) return;
  S.rolls++; rng.int(0, 2);
  if (w === 21) { S.rolls++; rng.int(0, 1); }
}
function simChain(S: SimState, rng: RNG, x: number, y: number): void {
  // Chain: Dither(0.85) → Blotches(2,0.3) → OnlyWalls(27) → SkipTiles → ClearWall(true)
  if (!(rng.next() >= 0.85)) { S.log.push(`(${x},${y}) dither fail`); return; }        // Dither.Apply
  // Blotches.Apply
  rng.next();                                                                            // 丢弃掷
  if (rng.next() < 0.3) {
    const x0 = rng.int(1 - 2, 0), x1 = rng.int(0, 2 - 1), y0 = rng.int(1 - 2, 0), y1 = rng.int(0, 2 - 1);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) simTail(S, rng, x + i, y + j, `blotch(${i},${j})`);
    return;
  }
  simTail(S, rng, x, y, 'direct');
}
function simTail(S: SimState, rng: RNG, x: number, y: number, via: string): void {
  // OnlyWalls(27)
  if (S.wall[y * W + x] !== 27) { S.log.push(`(${x},${y}) ${via} onlyWalls fail w${S.wall[y * W + x]}`); return; }
  // SkipTiles(245,246,240,241,242)：!active 放行
  const i = y * W + x;
  if (S.flags[i] && SKIP_AGING.has(SHEET[S.type[i]!] ?? -1)) { S.log.push(`(${x},${y}) ${via} skipTiles`); return; }
  // ClearWall(frameNeighbors:true)
  S.wall[i] = 0;
  simWallFrameResetRoll(S, rng, x + 1, y);
  simWallFrameResetRoll(S, rng, x - 1, y);
  simWallFrameResetRoll(S, rng, x, y + 1);
  simWallFrameResetRoll(S, rng, x, y - 1);
  S.log.push(`(${x},${y}) ${via} CLEAR (+nbr rolls)`);
}

(RUN ? it : it.skip)('DDDD probe3: room1 aging-② A/B sim', async () => {
  const entry = boundary('s17');
  const gs: GenState = structuredClone(entry.gs);
  restoreGenSolid(entry.gensolid);
  const st = buildHybrid(58, entry);
  const chests = structuredClone(entry.chests) as Array<{ x: number; y: number }>;
  const rng = new RNG(SEED);
  // 计数器
  const urAny = (rng as unknown as { ur: { seedArray: Int32Array; inext: number; internalSample(): number } });
  const origSample = urAny.ur.internalSample.bind(urAny.ur);
  let n = 0;
  urAny.ur.internalSample = () => { n++; return origSample(); };

  // 快照与钩子
  let snap: { sa: Int32Array; inext: number; n: number; wall: Uint16Array; flags: Uint8Array; type: Int32Array } | null = null;
  let jsRolls2 = -1;
  const genStarts: Array<[number, number, number, number, number]> = [];
  (globalThis as Record<string, unknown>).__swAgeGen = (_k: number, ox: number, oy: number, w: number, h: number) => {
    // room1 ② rect = (1850,534,22,8)
    if (ox === 1850 && oy === 534 && w === 22 && h === 8) {
      if (!snap) {
        snap = {
          sa: urAny.ur.seedArray.slice(), inext: urAny.ur.inext, n,
          wall: st.wall.slice(), flags: st.flags.slice(), type: st.type.slice(),
        };
        console.log(`② 快照 @n=${n}`);
      } else {
        jsRolls2 = n - snap.n;
      }
    }
    genStarts.push([ox, oy, w, h, n]);
  };

  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs, chests);
  runBuriedChestsPass(st, rng, gs, chests);
  runUnderworldChestsPass(st, rng, gs, chests);
  runCaveHousesPass(st, rng, gs, chests);
  flipGenSolid([226, 162, 225, 190], false);
  delete (globalThis as Record<string, unknown>).__swAgeGen;

  const snapV = snap!;
  console.log(`JS ② 掷数 = ${jsRolls2}`);

  // ---- 干净房 sim：恢复 RNG 状态，克隆墙态，跑 room1 ② ----
  const simRng = new RNG(SEED);
  const simUr = (simRng as unknown as { ur: { seedArray: Int32Array; inext: number; internalSample(): number } });
  const simOrig = simUr.ur.internalSample.bind(simUr.ur);
  let simN = 0;
  simUr.ur.internalSample = () => { simN++; return simOrig(); };
  simUr.ur.seedArray.set(snapV.sa);
  simUr.ur.inext = snapV.inext;
  const S: SimState = { wall: snapV.wall, flags: snapV.flags, type: snapV.type, rolls: 0, log: [] };
  for (let x = 1850; x < 1872; x++) {
    for (let y = 534; y < 542; y++) simChain(S, simRng, x, y);
  }
  console.log(`SIM ② 掷数 = ${simN}`);
  console.log(`SIM clearWall 次数 = ${S.log.filter(l => l.includes('CLEAR')).length}`);
  const clears = S.log.filter(l => l.includes('CLEAR')).map(l => l.split(' ')[0]);
  console.log(`SIM clear cells (${clears.length}): ${clears.join(' ')}`);
  // JS ② 结束时的墙态（st 是跑完的）：不能直接比——用 sim 自身终态对比无意义。
  // 打印 22×8 rect 的全部 hook fire 序列（调试 350 vs 526）
  console.log('room1 rect fires:', genStarts.filter(g => g[0] === 1850 && g[1] === 534 && g[2] === 22 && g[3] === 8).map(g => g[4]).join(','));
}, 560_000);
