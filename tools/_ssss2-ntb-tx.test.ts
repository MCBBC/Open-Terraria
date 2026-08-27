// SSSSSSSS2 ntb 线·一次性定罪探针 A：NotTheBees() clean-room 转录差分。
// 动机（mile8 #98 Settle_Liquids_Again 首差家族 T225>59×721/T59>225×690/T230↔225）：
//   前 5 次 NTB 调用投影全绿（dump≤#97），唯 pass#50 头第 6 次调用首现——
//   本探针把 Terarria1457 WorldGen.cs:25382-25597 的 NotTheBees() 逐行转录为
//   独立实现（全部常量/短路链按 cs 原文重写，不经 NotTheBeesPass.ts），在
//   __swNTBCap 捕获的同一入口快照上重放同一掷流，与真实 runNotTheBees 输出
//   逐格逐通道对拍。任何分歧都可定位到具体行级语义滑点。
// 用法：cd game && SW_SSSS2NTB=1 npx vitest run tools/_ssss2-ntb-tx.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
void readFileSync;
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { UnifiedRandom } from '../src/core/rng';
import { vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_SSSS2NTB === '1';
const W = Number(process.env.SW_SSSS2NTB_W ?? 4200), H = Number(process.env.SW_SSSS2NTB_H ?? 1200);
const SEED = process.env.SW_SSSS2NTB_SEED ?? '1372357239';
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** 原版 sheet id → 内部 id（写面用；与 NotTheBeesPass 同源但独立重推导） */
const IV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') IV.set(s, i);
}
const v2 = (id: number): number => {
  const t = IV.get(id);
  if (t === undefined) throw new Error(`no internal id for vanilla sheet ${id}`);
  return t;
};


// ---- SSSS2 离线分析快照持久化 ----
const BLOB_DIR = '/tmp/sss2-out/ntb/blobs';
type AnyArr = Uint8Array | Uint16Array;
function storeArrs(st: import('../src/world/TileStore').TileStore): Array<[string, AnyArr]> {
  return [
    ['flags', st.flags], ['type', st.type], ['wall', st.wall],
    ['liq', st.liquid], ['lty', st.liquidType], ['half', st.half],
    ['slope', st.slope], ['wire', st.wire], ['paint', st.paint], ['paintWall', st.paintWall],
  ];
}
function saveBlobs(prefix: string, st: import('../src/world/TileStore').TileStore): void {
  try { mkdirSync(BLOB_DIR, { recursive: true }); } catch { /* ok */ }
  for (const [nm, ar] of storeArrs(st)) {
    writeFileSync(`${BLOB_DIR}/${prefix}_${nm}.bin`, Buffer.from(ar.buffer, ar.byteOffset, ar.byteLength));
  }
}
let SAVE_ENABLED = false;
interface Snap {
  flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liq: Uint8Array;
  lty: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  paint: Uint8Array; paintWall: Uint8Array;
}
function snap(st: import('../src/world/TileStore').TileStore): Snap {
  return {
    flags: st.flags.slice(), type: st.type.slice(), wall: st.wall.slice(),
    liq: st.liquid.slice(), lty: st.liquidType.slice(), half: st.half.slice(),
    slope: st.slope.slice(), wire: st.wire.slice(), paint: st.paint.slice(), paintWall: st.paintWall.slice(),
  };
}

// ---- 掷流录制（真实调用用）：记 method/min/max/result ----
type Draw = { m: string; a: number; b: number; r: number };
let rec: Draw[] | null = null;
let gFlag = false; let gCount = 0;
const urp = UnifiedRandom.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
const oNext = urp.nextDouble!, oInt = urp.nextInt!, oRange = urp.nextIntRange!;
urp.nextDouble = function (this: unknown, ...a: unknown[]) {
  const r = oNext.apply(this, a);
  if (gFlag) gCount++;
  if (rec) rec.push({ m: 'nextDouble', a: NaN, b: NaN, r });
  return r;
};
urp.nextInt = function (this: unknown, ...a: unknown[]) {
  const r = oInt.apply(this, a);
  if (gFlag) gCount++;
  if (rec) rec.push({ m: 'nextInt', a: a[0] as number, b: NaN, r });
  return r;
};
urp.nextIntRange = function (this: unknown, ...a: unknown[]) {
  const r = oRange.apply(this, a);
  if (gFlag) gCount++;
  if (rec) rec.push({ m: 'nextIntRange', a: a[0] as number, b: a[1] as number, r });
  return r;
};

// ---- 转录侧掷流重放器 ----
class ReplaySrc {
  idx = 0;
  anom: string[] = [];
  constructor(private src: Draw[]) {}
  take(m: string, a: number, b: number, r: number): number {
    const d = this.src[this.idx++];
    if (!d) { this.anom.push(`# ${this.idx} @${m}(${a},${b}) 越界（真实侧只画了 ${this.src.length} 抽）`); return r; }
    // 参数不匹配 ⇒ 双方分支路径在同一抽位分叉
    const sameM = d.m === m;
    const sameA = isNaN(a) ? isNaN(d.a) : d.a === a;
    const sameB = isNaN(b) ? isNaN(d.b) : d.b === b;
    if (!sameM || !sameA || !sameB) this.anom.push(`#${this.idx} tx=${m}(${a},${b}) vs rec=${d.m}(${d.a},${d.b})`);
    return d.r;
  }
}
// 统一掷 API：闭区间含两端 int(min,max)；其余同形
class TXRng {
  constructor(private src: ReplaySrc, private report: (r: number) => void) {}
  int(min: number, maxIncl: number): number {
    // 原版 Next(min, max+1)：底层 nextIntRange(min, maxIncl+1)
    return this.report(this.src.take('nextIntRange', min, maxIncl + 1, NaN));
  }
}

// ============================================================
// NotTheBees() clean-room 转录（Terarria1457 WorldGen.cs:25382-25597）
// 工作在 TileStore 克隆上，类型写用内部 id（v2 映射），读经 SHEET。
// 全部门/短路结构以 cs 原文为准；【行号注】内联。
// ============================================================
interface TxRes { draws: number; anom: string[] }
function txNotTheBees(s0: Snap, recDraws: Draw[], gs: import('./../src/world/gen/vanilla/GenState').GenState, w: number, h: number): { s1: Snap; res: TxRes } {
  // 克隆可变副本
  const flags = s0.flags.slice(), type = s0.type.slice(), wall = s0.wall.slice();
  const liq = s0.liq.slice(), lty = s0.lty.slice(), wire = s0.wire.slice();

  const sf = gs.seedFlags;
  if (sf.skyblock) return { s1: { ...s0 }, res: { draws: 0, anom: [] } };  // cs:25384-25386
  const wLocal = w, hLocal = h;
  const numRemix = Math.floor(wLocal / 7);                    // cs:25388（仅 remix 支消费）
  if (!sf.notTheBees) return { s1: { ...s0 }, res: { draws: 0, anom: [] } };  // cs:25389-25391
  const num2 = Math.trunc((gs.lavaLine + hLocal - 180) / 2);  // cs:25392（num2=蜜块下界）
  const lavaLine = gs.lavaLine;
  const ws = gs.worldSurface, rock = gs.rockLevel, bd = gs.beachDistance;
  const remix = !!sf.remix, tenth = !!sf.tenthAnniversary, dstarve = !!sf.theConstant,
    drunk = !!sf.drunkWorld;
  // tile id 常量（cs 字面量；内部映射独立查表）
  const T_MUD = v2(59), T_JGRASS = v2(60), T_VINE62 = v2(62), T_MGRASS = v2(70),
    T_LMAHO = v2(383), T_LMAHOLEAF = v2(384), T_HIVE = v2(225), T_HONEY = v2(229),
    T_CRISPY = v2(230);
  // 集合（TileID.cs/Main.cs 1457 字面，照抄 NotTheBeesPass 注释所引原文出处独立复核）
  const CRACKED = new Set([481, 482, 483]);
  const ORE = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
  const CLOUDS = new Set([189, 196, 460, 717, 718, 719]);
  const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
  const CONV_GRASS = new Set([2, 23, 199, 109, 477, 492]);
  const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
  const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
  const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
    285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
    405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
    601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
  // vanGenSolidType（GenSolid 时间线 solid 表）等价借用：本 pass 时间线全实心表恒定，
  // 与 NotTheBeesPass.solidOrSloped 完全同源才可比——直接复用其导出不可行（私有依赖链），
  // 改从 TILE_DEFS.solid 重构同一时间线快照（见下方 SOLID 构造与口径说明）。
  // ★为使逐格对拍聚焦「函数本身」，这里原样沿用 NotTheBeesPass 的判定函数实现拷贝。

  let draws = 0;
  const report = (r: number) => { draws++; return r; };
  const src = new ReplaySrc(recDraws);
  const rng = new TXRng(src, report);

  const idxAt = (x: number, y: number): number => y * wLocal + x;
  const inB = (x: number, y: number): boolean => x >= 0 && x < wLocal && y >= 0 && y < hLocal;
  const actAt = (x: number, y: number): boolean => inB(x, y) && flags[idxAt(x, y)] !== 0;
  const sheetAt = (x: number, y: number): number => {
    if (!inB(x, y)) return -1;
    const t = SHEET[type[idxAt(x, y)]];
    return typeof t === 'number' && t >= 0 ? t : -1;
  };
  // oceanDepths（cs:10985-11001 / oceanLevel cs:4364）
  const oceanDepths = (x: number, y: number): boolean => {
    if (y > (ws + rock) / 2 + 40) return false;
    return x < bd || x > wLocal - bd;
  };
  // SolidOrSlopedTile（cs:70515-70534）：active && tileSolid && !solidTop && !inActive
  // solid 表取自 TILE_DEFS.solid（生成期 GenSolid 主表==初值，本窗口无翻转涉本函数读者——
  // 与 NotTheBeesPass.solidOrSloped 的 vanGenSolidType(t) 对拍一致即可，均为函数本身公平比较）
  const solidOrSlopedT = (x: number, y: number): boolean => {
    if (!inB(x, y)) return false;
    const i = idxAt(x, y);
    if (!flags[i]) return false;
    if (((wire[i] >>> 5) & 1) !== 0) return false;             // inActive
    return vanGenSolidType(type[i]) && !SOLID_TOP.has(SHEET[type[i]] ?? -1);
  };

  for (let i = 5; i < wLocal - 5; i++) {
    for (let j = 5; j < hLocal - 180; j++) {
      const ii = idxAt(i, j);
      // cs:25289 flag：oceanDepths 短路 → Next(3)×1 → 左界真短路 ×1 / 假再 ×1
      let flag: boolean;
      if (oceanDepths(i, j)) {
        flag = true;
      } else if (j < (ws + rock * 2) / 3 + rng.int(0, 2)) {
        if (i < bd - 50 - rng.int(0, 2)) flag = true;
        else flag = i > wLocal - bd + 50 + rng.int(0, 2);
      } else {
        flag = false;
      }
      // cs:25295-25305 十周年/饥荒/地牢侧半图带：蜂蜜块回水
      if (((tenth || dstarve
        || (gs.dungeonSide <= -1 && i < Math.floor(wLocal / 2))
        || (gs.dungeonSide >= 1 && i > Math.floor(wLocal / 2))) && !remix) & flag) {
        if (flags[ii] !== 0 && sheetAt(i, j) === 229) {
          flags[ii] = 0;
          lty[ii] = 1;                       // liquidType(0)：仓库 +1 编码水=1
          liq[ii] = 255;
        }
        continue;
      }
      // cs:25307-25327 中带草化（纯 NTB 组合种子门恒假，不掷不续）
      if (!remix && (tenth || dstarve || drunk)) {
        /* unreachable for pure NTB（掷序在门内不外溢） */
        continue;
      }
      // cs:25329-25331 藤→丛林藤
      const s0v = sheetAt(i, j);
      if ((s0v === 52) || (s0v === 382)) {
        type[ii] = T_VINE62;
      }
      // cs:25331-25400 实心转化主体
      const cracked = flags[ii] !== 0 && CRACKED.has(sheetAt(i, j));
      const curTypeSheet = sheetAt(i, j);
      if ((solidOrSlopedT(i, j) || cracked)
        && (!dstarve || remix || ![1, 147, 161, 30, 321, 158, 190, 162].includes(curTypeSheet))
        && !ORE.has(curTypeSheet)
        && curTypeSheet !== 368 && curTypeSheet !== 367
        && curTypeSheet !== 123 && curTypeSheet !== 40
        && curTypeSheet !== 379
        && (curTypeSheet !== 56 || !sf.skyblock)) {
        const s = sheetAt(i, j);
        if (s === 191 || s === 383) {
          if (!remix) type[ii] = T_LMAHO;
        } else if (s === 192 || s === 384) {
          if (!remix) type[ii] = T_LMAHOLEAF;
        } else if (s !== 151 && s !== 662 && s !== 661 && !CLOUDS.has(s) && s !== 120
          && s !== 158 && s !== 175 && s !== 45 && s !== 119
          && !(s >= 63 && s <= 68) && s !== 57 && s !== 76 && s !== 75
          && s !== 229 && s !== 230 && s !== 407 && s !== 404) {
          if (s === 224) {
            if (!dstarve || remix) type[ii] = T_HONEY;
          } else if (s === 53) {
            if (!dstarve || remix) {
              if (i < bd + rng.int(0, 2)) type[ii] = T_HONEY;
              else if (i > wLocal - bd - rng.int(0, 2)) type[ii] = T_HONEY;
            }
          } else if (
            (i <= bd - rng.int(0, 2)
              || i >= wLocal - bd + rng.int(0, 2)
              || (s !== 397 && s !== 396))
            && s !== 10 && s !== 203 && s !== 25 && s !== 137
            && !BOULDERS.has(s) && s !== 141) {
            if (TILE_DUNGEON.has(s) || CRACKED.has(s)) {
              /* color(14)：dualDungeons 关 → 不写（漆通道不在比对列，无观察面） */
            } else if (s !== 226 && s !== 202 && s !== 70 && s !== 48 && s !== 232) {
              if (CONV_GRASS.has(s) || s === 60 || s === 70) {
                if (j > lavaLine + rng.int(-2, 2) + 2) type[ii] = T_MGRASS;
                else type[ii] = T_JGRASS;
              } else if (s === 0 || s === 59) {
                type[ii] = T_MUD;
              } else if (s !== 633 && s !== 562 && s !== 563) {
                if (j > lavaLine + rng.int(-2, 2) + 2) {
                  if (j <= num2 + rng.int(0, 2)) type[ii] = T_CRISPY;
                } else {
                  if (!remix || j > ws + rng.int(-1, 1)) type[ii] = T_HIVE;
                }
              }
            }
          }
        }
      }
      // cs:25402-25446 地表蜂巢块/脆蜜块外露重种（非滩带 ±220 内带）
      if (!remix && j < hLocal - 50 && j > 50 && i > bd + 220 && i < wLocal - bd - 220) {
        const lonely = !actAt(i - 1, j - 1) || !actAt(i, j - 1)
          || !actAt(i + 1, j - 1) || !actAt(i - 1, j) || !actAt(i + 1, j)
          || !actAt(i - 1, j + 1) || !actAt(i, j + 1) || !actAt(i + 1, j - 1);
        const wallsClear = wall[idxAt(i - 1, j - 1)] === 0 && wall[idxAt(i, j - 1)] === 0
          && wall[idxAt(i + 1, j - 1)] === 0 && wall[idxAt(i - 1, j)] === 0
          && wall[idxAt(i + 1, j)] === 0 && wall[idxAt(i - 1, j + 1)] === 0
          && wall[idxAt(i, j + 1)] === 0 && wall[idxAt(i + 1, j - 1)] === 0;
        if (flags[ii] !== 0 && sheetAt(i, j) === 225 && lonely && (j < ws || wallsClear)) {
          type[ii] = T_JGRASS;
          for (let k = 0; k < 8; k++) {
            const n3 = i + rng.int(-2, 2), n4 = j + rng.int(-2, 2);
            if (!inB(n3, n4) || !inB(n3 - 1, n4 - 1) || !inB(n3 + 1, n4 + 1)) continue;
            const ki = idxAt(n3, n4);
            const full = actAt(n3 - 1, n4 - 1) && actAt(n3, n4 - 1)
              && actAt(n3 + 1, n4 - 1) && actAt(n3 - 1, n4)
              && actAt(n3 + 1, n4) && actAt(n3 - 1, n4 + 1)
              && actAt(n3, n4 + 1) && actAt(n3 + 1, n4 - 1);
            if (flags[ki] !== 0 && sheetAt(n3, n4) === 225 && full) type[ki] = T_MUD;
          }
        }
        if (flags[ii] !== 0 && sheetAt(i, j) === 230 && lonely && (j < ws || wallsClear)) {
          type[ii] = T_MGRASS;
          for (let l = 0; l < 8; l++) {
            const n5 = i + rng.int(-2, 2), n6 = j + rng.int(-2, 2);
            if (!inB(n5, n6) || !inB(n5 - 1, n6 - 1) || !inB(n5 + 1, n6 + 1)) continue;
            const li = idxAt(n5, n6);
            const full = actAt(n5 - 1, n6 - 1) && actAt(n5, n6 - 1)
              && actAt(n5 + 1, n6 - 1) && actAt(n5 - 1, n6)
              && actAt(n5 + 1, n6) && actAt(n5 - 1, n6 + 1)
              && actAt(n5, n6 + 1) && actAt(n5 + 1, n6 - 1);
            if (flags[li] !== 0 && sheetAt(n5, n6) === 230 && full) type[li] = T_MUD;
          }
        }
      }
      // cs:25448-25490 墙转化
      const wl = wall[ii];
      if (wl !== 15 && wl !== 64 && wl !== 204 && wl !== 205 && wl !== 206 && wl !== 207 && wl !== 87) {
        if (WALL_DUNGEON.has(wl)) {
          /* wallColor(14)：dualDungeons 关 → 无观察面 */
        } else if (
          (!dstarve || remix)
          && wl !== 23 && wl !== 24 && wl !== 42 && wl !== 10
          && wl !== 21                                    // cs:25579（1457 形：单项玻璃豁免）
          && wl !== 82 && wl !== 187 && wl !== 216 && wl !== 34 && wl !== 244) {
          if (wl === 2 || wl === 196 || wl === 197 || wl === 198 || wl === 199) {
            // 自等赋 no-op 支（cs:25468-25481 字面）
          } else if (wl === 63) {
            wall[ii] = 64;
          } else if (wl !== 3 && wl !== 83 && wl !== 73 && wl !== 62
            && wl !== 180 && wl !== 178 && wl !== 13 && wl !== 14
            && wl !== 312 && wl !== 313 && wl > 0
            && (!remix || j > ws + rng.int(-1, 1))
            && j <= num2 + rng.int(0, 2)) {
            wall[ii] = 86;
          }
        }
      }
      // cs:25492-25505 水→蜜（LIQUID_TYPE 仓库编码：水1/岩浆2/蜜3/微光4）
      if ((!tenth || remix || !(j < ws)) && (!dstarve || remix)
        && liq[ii] > 0 && j <= lavaLine + 2) {
        if (i > wLocal * 0.4 && i < wLocal * 0.6) {
          // honey(false)：蜜→水、微光→岩浆（位掩码语义 cs Tile.cs:404）
          if (lty[ii] === 3) lty[ii] = 1;
          else if (lty[ii] === 4) lty[ii] = 2;
        } else if (j > rock && (i < bd + 200 || i > wLocal - bd - 200)) {
          if (lty[ii] === 3) lty[ii] = 1;
          else if (lty[ii] === 4) lty[ii] = 2;
        } else if (WALL_DUNGEON.has(wall[ii])) {
          if (lty[ii] === 3) lty[ii] = 1;
          else if (lty[ii] === 4) lty[ii] = 2;
        } else if (!sf.skyblock) {
          lty[ii] = 3;                     // honey(true)：无条件置蜜
        }
      }
    }
  }

  // 收尾：返回克隆态（未涉通道以入口快照透传）
  const s1: Snap = { ...s0, flags, type, wall, liq, lty, wire };
  return { s1, res: { draws, anom: src.anom } };
}

// ---- 主探针 ----
(RUN ? it : it.skip)('SSSSS2 ntb transcript diff', async () => {
  const g0 = globalThis as { __swNTBCap?: (phase: string, gs: unknown, st: import('../src/world/TileStore').TileStore) => void };
  interface CallRep {
    tag: string; n: number;
    drawsRec: number; drawsTx: number; anomN: number; anomHead: string[];
    dFlags: number; dType: number; dWall: number; dLiq: number; dLty: number;
    pairs: Array<[string, number]>; samples: string[];
  }
  const calls: CallRep[] = [];
  let cur: { snapIn: Snap; rec: Draw[]; tag: string; gs: unknown } | null = null;

  g0.__swNTBCap = (phase, gsRaw, st) => {
    const gs = gsRaw as import('../src/world/gen/vanilla/GenState').GenState;
    if (phase === 'in') {
      let tag = '?';
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('NotTheBeesPass') && !m[1].includes('_ssss2')) {
          tag = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`; break;
        }
      }
      cur = { snapIn: snap(st), rec: [], tag, gs };
      rec = cur.rec;
      gFlag = true;
      if (SAVE_ENABLED) saveBlobs(`c${calls.length}in`, st);
      console.log(`[cap-in #${calls.length}] ${tag} notTheBees=${gs.seedFlags?.notTheBees} flagsKeys=${Object.keys(gs.seedFlags ?? {}).length}`);
      calls.push({ tag, n: calls.length + 1, drawsRec: 0, drawsTx: 0, anomN: 0, anomHead: [],
        dFlags: 0, dType: 0, dWall: 0, dLiq: 0, dLty: 0, pairs: [], samples: [] });
      return;
    }
    // out
    const c = calls[calls.length - 1]!;
    const s = cur!;
    rec = null;
    gFlag = false;
    console.log(`[cap-out #${calls.length}] recLen=${s.rec.length} gCount=${gCount}`);
    if (SAVE_ENABLED) {
      saveBlobs(`c${calls.length}out`, st);
      if (calls.length === 6) {
        const n = s.rec.length;
        const A = new Int32Array(n), B = new Int32Array(n), R = new Int32Array(n);
        const M = new Uint8Array(n);
        for (let q = 0; q < n; q++) {
          const d = s.rec[q]!;
          A[q] = Number.isNaN(d.a) ? -2147483648 : d.a;
          B[q] = Number.isNaN(d.b) ? -2147483648 : d.b;
          R[q] = Math.round(d.r);
          M[q] = d.m === 'nextDouble' ? 1 : d.m === 'nextInt' ? 2 : 3;
        }
        try { mkdirSync(BLOB_DIR, { recursive: true }); } catch { /* ok */ }
        writeFileSync(`${BLOB_DIR}/c6_rec_a.i32`, Buffer.from(A.buffer));
        writeFileSync(`${BLOB_DIR}/c6_rec_b.i32`, Buffer.from(B.buffer));
        writeFileSync(`${BLOB_DIR}/c6_rec_r.i32`, Buffer.from(R.buffer));
        writeFileSync(`${BLOB_DIR}/c6_rec_m.u8`, Buffer.from(M.buffer));
        const g = s.gs;
        const meta = {
          w: W, h: H, seedText: SEED,
          worldSurface: g.worldSurface, rockLevel: g.rockLevel, lavaLine: g.lavaLine,
          beachDistance: g.beachDistance, dungeonSide: g.dungeonSide,
        };
        writeFileSync('/tmp/sss2-out/ntb/meta.json', JSON.stringify(meta));
      }
    }
    const snapOut = snap(st);
    const src = new ReplaySrc([]);
    void src;
    // 转录重放
    let s1: Snap; let res: TxRes;
    try {
      ({ s1, res } = txNotTheBees(s.snapIn, s.rec.slice(), s.gs as never, W, H));
    } catch (err) {
      console.log(`[tx-crash #${calls.length}] ${(err as Error).stack}`);
      cur = null;
      return;
    }
    c.drawsRec = s.rec.length;
    c.drawsTx = res.draws;
    c.anomN = res.anom.length;
    c.anomHead = res.anom.slice(0, 12);
    console.log(`[dbg] call#${c.n} tag=${c.tag} drawsRec=${c.drawsRec} drawsTx=${c.drawsTx} anomN=${c.anomN} dT=${c.dType} dW=${c.dWall}`);
    // 逐格对拍（转录 s1 vs 真实 snapOut）
    const pair = new Map<string, number>();
    const pushPair = (k: string) => pair.set(k, (pair.get(k) ?? 0) + 1);
    const sh = (t: number): number => (SHEET[t] ?? -1);
    for (let i = 0; i < N; i++) {
      if (s1.flags[i] !== snapOut.flags[i]) { c.dFlags++; if (c.samples.length < 8) c.samples.push(`F(${i % W},${(i / W) | 0}) tx${s1.flags[i]} js${snapOut.flags[i]}`); }
      const ts = sh(s1.type[i]), js = sh(snapOut.type[i]);
      if (ts !== js) { c.dType++; pushPair(`T${ts}>${js}`); if (c.samples.length < 8) c.samples.push(`T(${i % W},${(i / W) | 0}) tx${ts} js${js}`); }
      if (s1.wall[i] !== snapOut.wall[i]) { c.dWall++; pushPair(`W${s1.wall[i]}>${snapOut.wall[i]}`); if (c.samples.length < 8) c.samples.push(`W(${i % W},${(i / W) | 0}) tx${s1.wall[i]} js${snapOut.wall[i]}`); }
      if (s1.liq[i] !== snapOut.liq[i]) { c.dLiq++; if (c.samples.length < 8) c.samples.push(`L(${i % W},${(i / W) | 0}) tx${s1.liq[i]} js${snapOut.liq[i]}`); }
      if (s1.lty[i] !== snapOut.lty[i]) { c.dLty++; pushPair(`Y${s1.lty[i]}>${snapOut.lty[i]}`); if (c.samples.length < 8) c.samples.push(`Y(${i % W},${(i / W) | 0}) tx${s1.lty[i]} js${snapOut.lty[i]}`); }
    }
    c.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    cur = null;
  };

  try {
    SAVE_ENABLED = process.env.SW_SSSS2SAVE === '1';
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { notTheBees: true } as never,
      onWorldPartial: (w, i) => {
        if (!SAVE_ENABLED || (i !== 49 && i !== 50)) return;
        saveBlobs(`slot${String(i).padStart(2, '0')}`, w.store);
      },
    });
  } finally {
    delete g0.__swNTBCap;
  }

  console.log('\n=== SSSS2 NTB transcript diff per call ===');
  console.log('# tag                                recDraws txDraws anom  dF    dT     dW   dL    dLty');
  for (const c of calls) {
    console.log(
      `${c.n} ${c.tag.padEnd(36)} ${String(c.drawsRec).padStart(9)} ${String(c.drawsTx).padStart(7)} ${String(c.anomN).padStart(5)} ` +
      `${String(c.dFlags).padStart(5)} ${String(c.dType).padStart(6)} ${String(c.dWall).padStart(5)} ${String(c.dLiq).padStart(5)} ${String(c.dLty).padStart(5)}`
      + (c.pairs.length ? `\n   pairs: ${c.pairs.map(([k, v]) => `${k}×${v}`).join(' ')}\n   samples: ${c.samples.join(' | ')}` : '')
      + (c.anomHead.length ? `\n   anom: ${c.anomHead.join(' ; ')}` : ''));
  }
  writeFileSync('/tmp/sss2-out/ntb/probe-a.json', JSON.stringify({ calls }));
}, 900_000);
