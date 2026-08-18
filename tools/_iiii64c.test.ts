// IIII 批 #64 诊断⑤：site#0 尾流移位搜索——vanilla site#1 落点定 delta。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runGemCavesPass } from '../src/world/gen/vanilla/GemPasses';

const RUN = process.env.SW_IIII64 === '3';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if ( typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
function solidAt(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || x >= W || y < 0 || y >= H) return false;
  const i = y * W + x;
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !SOLID_TOP.has(SHEET[t] ?? -1)
    && st.half[i] === 0 && st.slope[i] === 0 && ((st.wire[i]! >>> 5) & 1) === 0;
}

function buildStore(): { st: TileStore; gs: GenState; gensolid: Map<number, boolean> } {
  const base = 63;
  const t = b16(base, 'typ'), a = b8(base, 'act'), wl = b16(base, 'wal'), lq = b8(base, 'liq'), lt = b8(base, 'lty');
  const hf = b8(base, 'half'), sl = b8(base, 'slope');
  const gs = JSON.parse(readFileSync(`${BDIR}/s18/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s18/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s18/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N);
  for (let q = 0; q < fw.length; q += 4) { fx[fw[q]!] = fw[q + 1]!; fy[fw[q]!] = fw[q + 2]!; }
  const ids35 = new Map<number, number>();
  const iw = new Uint32Array(readFileSync(`${BDIR}/s18/ids35.bin`).buffer.slice(0));
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = a[i]!;
    st.flags[i] = act;
    let id = 0;
    if (act || t[i]) {
      id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== t[i]) id = REV.get(t[i]!) ?? 0;
    }
    st.type[i] = id;
    st.wall[i] = wl[i]!;
    st.liquid[i] = lq[i]!;
    st.liquidType[i] = lq[i] ? lt[i]! + 1 : 0;
    st.half[i] = hf[i]!; st.slope[i] = sl[i]!;
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  return { st, gs, gensolid };
}

// countTiles 副本（与 GemPasses 同谓词）
function makeCounter(st: TileStore) {
  const seenArr = new Uint8Array(N);
  const visited: number[] = [];
  const stackX = new Int32Array(4096);
  const stackY = new Int32Array(4096);
  const ICE147 = REV.get(147)!, ICE161 = REV.get(161)!, STONE1 = REV.get(1)!;
  return (sx: number, sy: number): { air: number; lava: number; ice: number; rock: number } => {
    let air = 0, lava = 0, ice = 0, rock = 0;
    let sp = 0;
    stackX[sp] = sx; stackY[sp] = sy; sp++;
    while (sp > 0) {
      if (air >= 300) break;
      sp--;
      const x = stackX[sp], y = stackY[sp];
      if (x <= 1 || x >= W - 1 || y <= 1 || y >= H - 1) { for (const v of visited) seenArr[v] = 0; visited.length = 0; return { air: 300, lava, ice, rock }; }
      const ii = y * W + x;
      if (seenArr[ii]) continue;
      seenArr[ii] = 1; visited.push(ii);
      if (st.wall[ii] === 244 || st.wall[ii] !== 0 || (st.liquid[ii] > 0 && st.liquidType[ii] === 4)) { for (const v of visited) seenArr[v] = 0; visited.length = 0; return { air: 300, lava, ice, rock }; }
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) { lava++; for (const v of visited) seenArr[v] = 0; visited.length = 0; return { air: 300, lava, ice, rock }; }
      if (st.flags[ii]) {
        if (st.type[ii] === ICE147 || st.type[ii] === ICE161) ice++;
        else if (st.type[ii] === STONE1) rock++;
      }
      if (!solidAt(st, x, y)) {
        air++;
        stackX[sp] = x - 1; stackY[sp] = y; sp++;
        stackX[sp] = x + 1; stackY[sp] = y; sp++;
        stackX[sp] = x; stackY[sp] = y - 1; sp++;
        stackX[sp] = x; stackY[sp] = y + 1; sp++;
      }
    }
    for (const v of visited) seenArr[v] = 0;
    visited.length = 0;
    return { air, lava, ice, rock };
  };
}

class Abort extends Error {}

(RUN ? it : it.skip)('iiii64c delta search', () => {
  const w4 = b16(64, 'wal');
  const { st, gs, gensolid } = buildStore();
  restoreGenSolid(gensolid);
  __setGenStateForProbe(structuredClone(gs));
  // 计数 RNG 包装
  let consumed = 0;
  const real = new RNG(SEED);
  const counting = new Proxy(real, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, target);
      if (typeof v === 'function' && (prop === 'nextInt' || prop === 'nextIntRange' || prop === 'nextDouble' || prop === 'next')) {
        return (...args: unknown[]) => { consumed++; return v.apply(target, args); };
      }
      return typeof v === 'function' ? v.bind(target) : v;
    },
  }) as RNG;
  const g0 = globalThis as Record<string, unknown>;
  let site1Start = -1;
  g0.__swGcCap = (site: number, _x1: number, _y1: number, tries: number) => {
    if (site === 1 && tries === 0) { site1Start = consumed - 2; throw new Abort(); }
    void _x1; void _y1;
  };
  try { runGemCavesPass(st, counting, structuredClone(gs) as GenState); } catch (e) { if (!(e instanceof Abort)) throw e; }
  delete g0.__swGcCap;
  __setGenStateForProbe(null);
  console.log(`site#1 candidate#0 rolls start at sample index P1=${site1Start}`);
  // 腔检查函数（对 post-site#0 态）
  const countTiles = makeCounter(st);
  const cavityOf = (sx: number, sy: number): number[] => {
    const seenL = new Set<number>();
    const cells: number[] = [];
    const stack: Array<[number, number]> = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x <= 1 || x >= W - 1 || y <= 1 || y >= H - 1) continue;
      const ii = y * W + x;
      if (seenL.has(ii)) continue;
      seenL.add(ii);
      if (st.wall[ii] !== 0) continue;
      if (solidAt(st, x, y)) continue;
      cells.push(ii);
      if (cells.length > 400) return cells; // 大腔忽略
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    return cells;
  };
  const rockLevel = gs.rockLevel;
  // 尾部滚动日志：重跑一遍（同流）记录每个 sample 的调用点栈
  {
    const { st: st2, gs: gs2, gensolid: gsol2 } = buildStore();
    restoreGenSolid(gsol2);
    __setGenStateForProbe(structuredClone(gs2));
    const log: string[] = [];
    const real2 = new RNG(SEED);
    const logging = new Proxy(real2, {
      get(target, prop) {
        const v = Reflect.get(target, prop, target);
        if (typeof v === 'function' && (prop === 'nextInt' || prop === 'nextIntRange' || prop === 'nextDouble')) {
          return (...args: unknown[]) => {
            const st2 = new Error().stack!.split('\n')[2] ?? '';
            const result = v.apply(target, args);
            log.push(`#${log.length} ${String(prop)}(${args.join(',')})=${result} @ ${st2.replace(/.*\//, '').slice(0, 40)}`);
            return result;
          };
        }
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as RNG;
    runGemCavesPass(st2, logging, structuredClone(gs2) as GenState);
    __setGenStateForProbe(null);
    for (let q = Math.max(0, site1Start - 60); q < site1Start + 4; q++) console.log(log[q]);
  }
  for (let delta = 0; delta <= 40; delta++) {
    const rng = new RNG(SEED);
    for (let q = 0; q < site1Start + delta; q++) rng.nextInt(2);
    let found = -1;
    const cands: string[] = [];
    for (let tries = 0; tries < 400; tries++) {
      const x = rng.nextIntRange(200, W - 200);
      const y = rng.nextIntRange(rockLevel + 30, H - 230);
      const c = countTiles(x, y);
      const ok = c.air >= 50 && c.air < 300 && c.lava === 0 && c.ice === 0 && c.rock > 0;
      if (ok) {
        const cav = cavityOf(x, y);
        let van = 0;
        for (const i of cav) { const wv = w4[i]!; if (wv >= 48 && wv <= 53) van++; }
        cands.push(`→ACC(${x},${y}) cav=${cav.length} van=${van}`);
        if (cav.length >= 30 && van >= cav.length * 0.9) { found = tries; break; }
        // 接受但腔不含 vanilla 墙—— vanilla 也接受了这个(模拟态同构)→ 流仍错位,记录
        break;
      }
      if (tries < 3) cands.push(`(${x},${y})a${c.air}`);
    }
    console.log(`delta=${delta}: ${cands.join(' ')}`);
  }
}, 560_000);
