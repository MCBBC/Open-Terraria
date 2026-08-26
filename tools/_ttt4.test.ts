// TTTTTTT 批一次性探针④：NotTheBees() 反编译直译影子重放（ntb #98 定罪）。
// __swNTBCap('in') 捕获槽 50 入口全量数组 + GenState 标量；生成完毕后以
// new RNG(world.seed) 在入口副本上重放 1457 WorldGen.cs:25382-25653 直译；
// 三方对拍 shadow / x86 dump098.typ / shipped 结果。
// 用法：cd game && SW_T4=1 npx vitest run tools/_ttt4.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_T4 === '1';
const G2 = '/tmp/jjj-out/g1457-ntb';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
function findSuf(idx: number): string {
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m && Number(m[1]) === idx) return `_${m[2]}`;
  }
  throw new Error('no dump');
}
function loadTyp(idx: number): Uint16Array {
  const b = readFileSync(`${G2}/${String(idx).padStart(3, '0')}${findSuf(idx)}.typ`);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
}
function loadAct(idx: number): Uint8Array {
  return readFileSync(`${G2}/${String(idx).padStart(3, '0')}${findSuf(idx)}.act`);
}
const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUSHROOM_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const HIVE = TILE_BY_KEY['v_225_hive_block']!;
const HONEY_BLOCK = TILE_BY_KEY['v_229_honey_block']!;
const CRISPY_HONEY = TILE_BY_KEY['v_230_crispy_honey_block']!;
const LIVING_MAHO = TILE_BY_KEY['v_383_living_mahogany_block']!;
const LIVING_MAHO_LEAF = TILE_BY_KEY['v_384_living_mahogany_leaves_block']!;
const JUNGLE_VINE = TILE_BY_KEY['v_62_jungle_vines']!;
const ORE = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
const CLOUDS = new Set([189, 196, 460, 717, 718, 719]);
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
const CONV_GRASS = new Set([2, 23, 199, 109, 477, 492]);
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
const CRACKED = new Set([481, 482, 483]);
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);

interface ShadowStore {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; wire: Uint8Array;
}
interface GV { lavaLine: number; ws: number; rock: number; bd: number; h: number; ds: number }
const shSheet = (t: number): number => SHEET[t] ?? -1;
const actAt = (s: ShadowStore, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < W && y < H && s.flags[y * W + x] !== 0;
function solidOrSloped(s: ShadowStore, x: number, y: number): boolean {
  if (!actAt(s, x, y)) return false;
  const k = y * W + x;
  if ((s.wire[k] >>> 5) & 1) return false;
  return vanGenSolidType(s.type[k]!) && !SOLID_TOP.has(shSheet(s.type[k]!));
}

export function shadowNTB(s: ShadowStore, rng: RNG, gv: GV, watch?: Set<number>): void {
  const logW = watch ? (from: number, kind: string, to: number): void => {
    console.log(`[w] (${from % W},${Math.floor(from / W)}) ${kind} -> ${to}`);
  } : null;
  const wT = (k: number, v: number): void => { s.type[k] = v; if (watch?.has(k) && logW) logW(k, 'type', shSheet(v)); };
  const wL = (k: number, v: number): void => { s.liquidType[k] = v; if (watch?.has(k) && logW) logW(k, 'lty', v); };
  void wL;
  const wW = (k: number, v: number): void => { s.wall[k] = v; if (watch?.has(k) && logW) logW(k, 'wall', v); };
  void wW;
  const wF = (k: number, v: number): void => { s.flags[k] = v; };
  void wF;
  const w = W, h = gv.h;
  const num2 = Math.trunc((gv.lavaLine + h - 180) / 2);
  const ll = gv.lavaLine;
  for (let i = 5; i < w - 5; i++) {
    for (let j = 5; j < h - 180; j++) {
      const k = j * W + i;
      // cs:25289 flag
      let flag: boolean;
      const od = j > (gv.ws + gv.rock) / 2 + 40 ? false : i < gv.bd || i > w - gv.bd;
      if (od) flag = true;
      else if (j < (gv.ws + gv.rock * 2) / 3 + rng.int(0, 2)) {
        if (i < gv.bd - 50 - rng.int(0, 2)) flag = true;
        else flag = i > w - gv.bd + 50 + rng.int(0, 2);
      } else flag = false;
      // cs:25295 半图蜂蜜块→水（1457 无漆支）
      if (((gv.ds <= -1 && i < w / 2) || (gv.ds >= 1 && i > w / 2)) && flag) {
        if (s.flags[k] && shSheet(s.type[k]!) === 229) {
          s.flags[k] = 0; s.liquidType[k] = 1; s.liquid[k] = 255;
        }
        continue;
      }
      const tA = shSheet(s.type[k]!);
      if (tA === 52 || tA === 382) s.type[k] = JUNGLE_VINE;
      const cracked = s.flags[k] !== 0 && CRACKED.has(shSheet(s.type[k]!));
      let tp = shSheet(s.type[k]!);
      if ((solidOrSloped(s, i, j) || cracked)
        && !ORE.has(tp) && tp !== 368 && tp !== 367 && tp !== 123 && tp !== 40
        && tp !== 379 && tp !== 56) {
        if (tp === 191 || tp === 383) {
          s.type[k] = LIVING_MAHO;
        } else if (tp === 192 || tp === 384) {
          s.type[k] = LIVING_MAHO_LEAF;
        } else if (tp !== 151 && tp !== 662 && tp !== 661 && !CLOUDS.has(tp) && tp !== 120
          && tp !== 158 && tp !== 175 && tp !== 45 && tp !== 119
          && !(tp >= 63 && tp <= 68) && tp !== 57 && tp !== 76 && tp !== 75
          && tp !== 229 && tp !== 230 && tp !== 407 && tp !== 404) {
          if (tp === 224) {
            s.type[k] = HONEY_BLOCK;
          } else if (tp === 53) {
            if (i < gv.bd + rng.int(0, 2)) s.type[k] = HONEY_BLOCK;
            else if (i > w - gv.bd - rng.int(0, 2)) s.type[k] = HONEY_BLOCK;
          } else if (
            (i <= gv.bd - rng.int(0, 2) || i >= w - gv.bd + rng.int(0, 2) || (tp !== 397 && tp !== 396))
            && tp !== 10 && tp !== 203 && tp !== 25 && tp !== 137
            && !BOULDERS.has(tp) && tp !== 141) {
            if (!(TILE_DUNGEON.has(tp) || CRACKED.has(tp))) {
              if (CONV_GRASS.has(tp) || tp === 60 || tp === 70) {
                if (j > ll + rng.int(-2, 2) + 2) s.type[k] = MUSHROOM_GRASS;
                else s.type[k] = JUNGLE_GRASS;
              } else if (tp === 0 || tp === 59) {
                s.type[k] = MUD;
              } else if (tp !== 633 && tp !== 562 && tp !== 563) {
                if (j > ll + rng.int(-2, 2) + 2) {
                  if (j <= num2 + rng.int(0, 2)) s.type[k] = CRISPY_HONEY;
                } else {
                  s.type[k] = HIVE;
                }
              }
            }
          }
        }
      }
      // 孤儿蜂巢/脆蜜重种（cs:25402-25446）
      if (j < h - 50 && j > 50 && i > gv.bd + 220 && i < w - gv.bd - 220) {
        const lonely = !actAt(s, i - 1, j - 1) || !actAt(s, i, j - 1) || !actAt(s, i + 1, j - 1)
          || !actAt(s, i - 1, j) || !actAt(s, i + 1, j)
          || !actAt(s, i - 1, j + 1) || !actAt(s, i, j + 1) || !actAt(s, i + 1, j - 1);
        const wallsClear = s.wall[(j - 1) * W + i - 1] === 0 && s.wall[(j - 1) * W + i] === 0
          && s.wall[(j - 1) * W + i + 1] === 0 && s.wall[j * W + i - 1] === 0 && s.wall[j * W + i + 1] === 0
          && s.wall[(j + 1) * W + i - 1] === 0 && s.wall[(j + 1) * W + i] === 0 && s.wall[(j + 1) * W + i + 1] === 0;
        if (lonely && (j < gv.ws || wallsClear)) {
          if (s.flags[k] && shSheet(s.type[k]!) === 225) {
            s.type[k] = JUNGLE_GRASS;
            for (let q = 0; q < 8; q++) {
              const n3 = i + rng.int(-2, 2), n4 = j + rng.int(-2, 2);
              if (!actAt(s, n3, n4)) continue;
              const kk = n4 * W + n3;
              const full = actAt(s, n3 - 1, n4 - 1) && actAt(s, n3, n4 - 1) && actAt(s, n3 + 1, n4 - 1)
                && actAt(s, n3 - 1, n4) && actAt(s, n3 + 1, n4) && actAt(s, n3 - 1, n4 + 1)
                && actAt(s, n3, n4 + 1) && actAt(s, n3 + 1, n4 - 1);
              if (s.flags[kk] && shSheet(s.type[kk]!) === 225 && full) s.type[kk] = MUD;
            }
          }
          if (s.flags[k] && shSheet(s.type[k]!) === 230) {
            s.type[k] = MUSHROOM_GRASS;
            for (let q = 0; q < 8; q++) {
              const n3 = i + rng.int(-2, 2), n4 = j + rng.int(-2, 2);
              if (!actAt(s, n3, n4)) continue;
              const kk = n4 * W + n3;
              const full = actAt(s, n3 - 1, n4 - 1) && actAt(s, n3, n4 - 1) && actAt(s, n3 + 1, n4 - 1)
                && actAt(s, n3 - 1, n4) && actAt(s, n3 + 1, n4) && actAt(s, n3 - 1, n4 + 1)
                && actAt(s, n3, n4 + 1) && actAt(s, n3 + 1, n4 - 1);
              if (s.flags[kk] && shSheet(s.type[kk]!) === 230 && full) s.type[kk] = MUD;
            }
          }
        }
      }
      // 墙转化（1457 形：wall!=21 单豁免）
      const wl = s.wall[k]!;
      if (wl !== 15 && wl !== 64 && wl !== 204 && wl !== 205 && wl !== 206 && wl !== 207 && wl !== 87) {
        if (!WALL_DUNGEON.has(wl)
          && wl !== 23 && wl !== 24 && wl !== 42 && wl !== 10 && wl !== 21
          && wl !== 82 && wl !== 187 && wl !== 216 && wl !== 34 && wl !== 244) {
          if (wl === 2 || wl === 196 || wl === 197 || wl === 198 || wl === 199) {
            /* no-op */
          } else if (wl === 63) {
            s.wall[k] = 64;
          } else if (wl !== 3 && wl !== 83 && wl !== 73 && wl !== 62 && wl !== 180
            && wl !== 178 && wl !== 13 && wl !== 14 && wl !== 312 && wl !== 313 && wl > 0
            && j <= num2 + rng.int(0, 2)) {
            s.wall[k] = 86;
          }
        }
      }
      // 水↔蜜（cs:25492-25505）
      if (s.liquid[k]! > 0 && j <= ll + 2) {
        if (i > w * 0.4 && i < w * 0.6) {
          if (s.liquidType[k] === 3) s.liquidType[k] = 1;
          else if (s.liquidType[k] === 4) s.liquidType[k] = 2;
        } else if (j > gv.rock && (i < gv.bd + 200 || i > w - gv.bd - 200)) {
          if (s.liquidType[k] === 3) s.liquidType[k] = 1;
          else if (s.liquidType[k] === 4) s.liquidType[k] = 2;
        } else if (WALL_DUNGEON.has(s.wall[k]!)) {
          if (s.liquidType[k] === 3) s.liquidType[k] = 1;
          else if (s.liquidType[k] === 4) s.liquidType[k] = 2;
        } else {
          s.liquidType[k] = 3;
        }
      }
    }
  }
}

(RUN ? it : it.skip)('TTT④ NTB shadow replay', async () => {
  const holder: {
    ds: number; seedN: number; entry: ShadowStore | null; out: Uint16Array | null; outFlags: Uint8Array | null;
    gv: GV | null;
  } = { ds: 0, seedN: 0, entry: null, out: null, outFlags: null, gv: null };
  const g0 = globalThis as { __swNTBCap?: (phase: string, gs: unknown, st: unknown) => void };
  g0.__swNTBCap = (phase, gsObj, stObj) => {
    const gs = gsObj as { lavaLine: number; worldSurface: number; rockLevel: number; beachDistance: number; dungeonSide: number };
    const st = stObj as ShadowStore;
    if (phase === 'in') {
      holder.pairs.push(null);   // 占位：每次 in 都新开一对
    }
    if (phase === 'in' && true) {
      holder.entry = {
        type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(),
        liquid: st.liquid.slice(), liquidType: st.liquidType.slice(), wire: st.wire.slice(),
      };
      holder.gv = {
        lavaLine: gs.lavaLine, ws: gs.worldSurface, rock: gs.rockLevel,
        bd: gs.beachDistance, h: H, ds: gs.dungeonSide,
      };
      console.log(`[cap-in] ${JSON.stringify(holder.gv)}`);
    }
    if (phase === 'out') {
      const ty = new Uint16Array(W * H);
      const fl = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) { fl[i] = st.flags[i]; ty[i] = st.flags[i] ? shSheet(st.type[i]!) : 0; }
      holder.out = ty; holder.outFlags = fl;
    }
  };
  const world = await generateWorld({
    width: W, height: H, seedText: '1372357239', evil: 0,
    seedFlags: { notTheBees: true },
    onWorldPartial: () => {},
  });
  g0.__swNTBCap = undefined;
  if (!holder.entry || !holder.out || !holder.gv) throw new Error('capture missing');
  console.log(`[seed] ${world.seed} ds=${holder.gv.ds}`);
  const s2: ShadowStore = {
    type: holder.entry.type.slice(), flags: holder.entry.flags.slice(), wall: holder.entry.wall.slice(),
    liquid: holder.entry.liquid.slice(), liquidType: holder.entry.liquidType.slice(), wire: holder.entry.wire.slice(),
  };
  shadowNTB(s2, new RNG(world.seed), holder.gv);
  // 三方对拍：shadow vs X098、shadow vs shipped、shipped vs X098（typ 活性掩码）
  const x98t = loadTyp(98), x98a = loadAct(98);
  let svX = 0, spX = 0, svSp = 0, bothFix = 0;
  const samples: Array<string> = [];
  let firstSvX = -1, firstSpX = -1, firstSvSp = -1;
  for (let i = 0; i < W * H; i++) {
    const va = x98a[i] ? (x98t[i] ?? 0) : 0;
    const sv = s2.flags[i] ? shSheet(s2.type[i]!) : 0;
    const sp = holder.outFlags![i] ? holder.out![i]! : 0;
    if (sv !== va) { svX++; if (firstSvX < 0) firstSvX = i; }
    if (sp !== va) { spX++; if (firstSpX < 0) firstSpX = i; }
    if (sv !== sp) { svSp++; if (firstSvSp < 0) firstSvSp = i; }
    if (sp !== va && sv === va) {
      bothFix++;
      if (samples.length < 10) samples.push(`(${i % W},${Math.floor(i / W)}) E=${holder.entry.flags[i] ? shSheet(holder.entry.type[i]!) : -1} X=${va} shipped=${sp} shadow=${sv}`);
    }
  }
  console.log(`[typ diff] shadow-vs-X=${svX}(first ${firstSvX % W},${Math.floor(firstSvX / W)}) shipped-vs-X=${spX}(first ${firstSpX % W},${Math.floor(firstSpX / W)}) shadow-vs-shipped=${svSp}(first ${firstSvSp % W},${Math.floor(firstSvSp / W)}) shadow-fixes=${bothFix}`);
  for (const s of samples) console.log('  FIX', s);
}, 900_000);
