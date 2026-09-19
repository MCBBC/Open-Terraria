// 原版 pass "BrokenTrapCleanup"(1456 WorldGen.cs:22283-22302)+
// ClearBrokenTraps(cs:26984-27102)1:1 移植。
//
// ── 建议接入位(协调者接线用) ──
//   原版注册序 cs:22283(TileCleanup cs:21327 之后、FinalCleanup cs:22304 之前);
//   我方应在 runTileCleanupPass 之后、runFinalCleanupPass 之前调用:
//     runBrokenTrapCleanupPass(store);
//   原版门 `!noTrapsWorldGen || tenthAnniversaryWorldGen || notTheBees`(cs:22286):
//   普通世界恒 true;no traps 种子需跳过——接线时按 gs.seedFlags.noTraps 门控
//   (本函数不收 gs,签名按审计清单定为 (st))。
//
// 语义:全图 [50,w-50)×[50,h-50) 扫**红线**(Tile.wire()=sTileHeader 0x80 仅红色,
// Tile.cs:653-656)起点,沿电线 BFS(双层 2000 步预算,frontier 不去重、网络格去重,
// 非红线格也会入队探边);网络内**同时**含陷阱与触发器则保留,否则整网清红线+清致动器
// (其上方 2×2 巨石回滚为石 1)、杀孤儿陷阱(tile 105 雕像除外)、触发器杀除
// (矿轨 314 压板改 frameX=1)。
//
// 判定表(1456 原文):
//   IsItATrap(cs:26932-26944)  = active && (actuator || (IsAMechanism && !IgnoreWhenValidatingTraps))
//   IsItATrigger(cs:26946-26968) = active && (IsATrigger || (467 && frameX/36==4)
//                                || (314 && Minecart.IsPressurePlate(frameX∈{20,21})))
//   TileID.Sets.Wiring 三表(TileID.cs:130-136);Boulders(TileID.cs:195)。
//
// 零掷骰 → 不收 rng。
import { TileStore } from '../../TileStore';
import { TILE_DEFS, TILE_BY_KEY, BOULDERS_IDS } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';
import { genKillTile } from './FinalCleanupPass';
import type { RNG } from '../../../core/rng';
import { RNG as RNGCtor } from '../../../core/rng';

/** 兜底流（探针直调无 rng 时——引擎 killTileGen 无 ctx.rng 时尘掷退化 0，与旧零掷
 *  行为兼容；管线/重放一律显式传 rng） */
const makeRng = (): RNG => new RNGCtor(0);

/** sheet(=原版 tile id)→ 内部 id;未实装时 0(空格)安全退化 */
const SHEET_TO_INTERNAL = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET_TO_INTERNAL.has(vs)) SHEET_TO_INTERNAL.set(vs, TILE_BY_KEY[d.key]);
}
const sid = (sheet: number): number => SHEET_TO_INTERNAL.get(sheet) ?? 0;

/** TileID.Sets.Wiring.IsAMechanism(TileID.cs:130) */
const IS_A_MECHANISM = idsByVanillaSheet(
  420, 419, 411, 4, 33, 100, 93, 42, 34, 215, 405, 92, 35, 126, 95, 149, 593, 594, 564,
  10, 11, 387, 386, 388, 389, 137, 443, 141, 130, 131, 546, 557, 421, 422, 209, 212, 216,
  338, 335, 497, 406, 244, 452, 565, 139, 506, 105, 349, 531, 429, 142, 143, 235, 210, 425,
  21, 467, 219, 642, 356, 663, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266,
  267, 268, 207, 480, 455, 509, 657, 658, 720, 721, 725, 733, 314,
);
/** TileID.Sets.Wiring.IsATrigger(TileID.cs:132) */
const IS_A_TRIGGER = idsByVanillaSheet(135, 136, 132, 144, 411, 423, 476, 440, 441, 468);
/** TileID.Sets.Wiring.IgnoreWhenValidatingTraps(TileID.cs:134) */
const IGNORE_WHEN_VALIDATING = idsByVanillaSheet(411, 10, 11, 387, 386, 388, 389, 4, 215, 21, 467, 219, 642, 314);
/** TileID.Sets.Boulders(TileID.cs:195) */
// ★BJ182b 收编单源 data/tiles.ts:BOULDERS_IDS(内部 id 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const BOULDERS = BOULDERS_IDS;

const STATUE = sid(105);
const TRACK = sid(314);
const CHEST2 = sid(467);
const STONE = sid(1);
const WIRE_RED = TileStore.WIRE_RED;
const WIRE_ACTUATOR = TileStore.WIRE_ACTUATOR;

/** IsItATrap(cs:26932-26944)。注意:致动器位由调用方在清位后重评(原版同) */
function isItATrap(st: TileStore, i: number): boolean {
  if (!st.flags[i]) return false;
  const t = st.type[i];
  if (st.wire[i] & WIRE_ACTUATOR) return true;
  return IS_A_MECHANISM.has(t) && !IGNORE_WHEN_VALIDATING.has(t);
}

/** IsItATrigger(cs:26946-26968) */
function isItATrigger(st: TileStore, i: number): boolean {
  if (!st.flags[i]) return false;
  const t = st.type[i];
  if (IS_A_TRIGGER.has(t)) return true;
  if (t === CHEST2 && Math.floor(st.frameX[i] / 36) === 4) return true;
  if (t === TRACK && (st.frameX[i] === 20 || st.frameX[i] === 21)) return true; // Minecart.IsPressurePlate(Minecart.cs:549)
  return false;
}

/** 生成期 KillTile(cs:63559)+尾 SquareTileFrame 级联——AAAAAA：改派 FCP 引擎
 *  （genKillTile：尘掷表 + 九宫级联）。曾"仅清活性/类型"零级联——孤儿 411 起爆器
 *  另半 2×2 残留（#104 T0>411×2：(1098,711) 金标 Check2x2 完整性杀整件、本仓只杀
 *  红线列）。105 为末 pass 槽内掷差不外溢。 */
function killTile(st: TileStore, rng: RNG, x: number, y: number): void {
  genKillTile(st, rng, x, y);
}

/** Tile.ResetToType(Tile.cs:279-289):liquid=0、sTileHeader=32(active,线/致动/已致动全清)、
 *  slope/half/liquidType 复位、帧 0、type 改写;wall 保留 */
function resetToType(st: TileStore, x: number, y: number, type: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.liquid[i] = 0;
  st.wire[i] = 0; // sTileHeader=32:红线/蓝线/绿线/黄线/致动器/inActive 全清
  st.slope[i] = 0;
  st.half[i] = 0;
  st.frameX[i] = 0;
  st.frameY[i] = 0;
  st.type[i] = type;
  st.flags[i] = type !== 0 ? 1 : 0;
}

/** ClearBrokenTraps(cs:26984-27102)。startIdx = y*w+x 编码 */
function clearBrokenTraps(st: TileStore, rng: RNG, startIdx: number, visited: Set<number>): void {
  const { w, h } = st;
  let t: number[] = []; // 当前处理队列(=原版 t)
  let t2: number[] = [startIdx]; // 下一层队列(=原版 t2)
  const net: number[] = []; // 网络内红线格(=原版 list)
  const inNet = new Set<number>(); // List.Contains 的 O(1) 等价(语义相同)
  let hasTrap = false;
  let hasTrigger = false;
  let budget = 2000; // 外层步预算(cs:26998)
  while (t2.length > 0) {
    budget--;
    if (budget <= 0) break;
    const swap = t; t = t2; t2 = swap; // Utils.Swap(ref t, ref t2)
    let innerBudget = 2000; // 内层步预算(cs:27006,每轮外层重置)
    while (t.length > 0) {
      innerBudget--;
      if (innerBudget <= 0) break;
      const cur = t.shift()!;
      const x = cur % w;
      const y = (cur - x) / w;
      if (x < 5 || y < 5 || x >= w - 5 || y >= h - 5) continue; // InWorld(x,y,5)
      if (!(st.wire[cur] & WIRE_RED)) continue;
      visited.add(cur);
      net.push(cur);
      inNet.add(cur);
      if (isItATrap(st, cur)) hasTrap = true;
      if (isItATrigger(st, cur)) hasTrigger = true;
      if (hasTrigger && hasTrap) break;
      const push = (px: number, py: number) => {
        const p = py * w + px;
        if (!inNet.has(p)) t2.push(p);
      };
      push(x - 1, y);
      push(x + 1, y);
      push(x, y - 1);
      push(x, y + 1);
    }
    if (hasTrigger && hasTrap) break;
  }
  if (hasTrigger && hasTrap) return; // 网络完整 → 保留

  for (const cur of net) {
    const x = cur % w;
    const y = (cur - x) / w;
    st.wire[cur] &= ~WIRE_RED; // wire(wire:false):仅清红
    if (st.wire[cur] & WIRE_ACTUATOR) {
      st.wire[cur] &= ~WIRE_ACTUATOR;
      // 上方巨石回滚(cs:27075-27092):正上格是巨石且 frameX%16==0 → 其上 2×2 巨石 ResetToType(1)
      const above = cur - w;
      if (y - 1 >= 0 && BOULDERS.has(st.type[above]) && st.frameX[above] % 16 === 0) {
        for (let dx = 0; dx < 2; dx++) {
          for (let dy = -2; dy < 0; dy++) {
            const cx = x + dx;
            const cy = y + dy;
            if (!st.inBounds(cx, cy)) continue;
            const c = st.idx(cx, cy);
            if (st.flags[c] && BOULDERS.has(st.type[c])) resetToType(st, cx, cy, STONE);
          }
        }
      }
    }
    if (isItATrap(st, cur) && st.type[cur] !== STATUE) {
      killTile(st, rng, x, y); // 105 雕像豁免(cs:27094)
    } else if (isItATrigger(st, cur)) {
      if (st.type[cur] === TRACK) {
        st.frameX[cur] = 1; // 矿轨压板 → 普通轨(cs:27100)
      } else {
        killTile(st, rng, x, y);
      }
    }
  }
}

export function runBrokenTrapCleanupPass(st: TileStore, rng?: RNG): void {
  const { w, h } = st;
  const nrng = rng ?? makeRng();
  const visited = new Set<number>(); // 原版 pointsWeAlreadyWentOver(跨网络累积,红线格入册)
  for (let i = 50; i < w - 50; i++) {
    for (let j = 50; j < h - 50; j++) {
      const idx = st.idx(i, j);
      if (st.wire[idx] & WIRE_RED && !visited.has(idx)) {
        clearBrokenTraps(st, nrng, idx, visited);
      }
    }
  }
}
