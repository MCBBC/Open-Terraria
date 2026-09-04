// 原版 pass 76 "Traps" 1:1（1456 WorldGen.cs:18769-18898 主体 + placeTrap cs:8875-9460
// + PlaceSandTrap cs:35505-35781；EEEE 批 2026-08-18 对照 1456 全量重写——旧实现系
// 1405 行号混编，缺 CanGeneratePressurePlateAt/巨石变体掷/沙陷阱整尾段）。
// 全类型 placeTrap：0 飞镖 / 1 巨石陷阱 / 2 炸药桶 / 3 热喷泉，type=-1 随机
// （1/20 炸药桶；lavaLine+30 以下 5/6 热喷泉；否则 50/50 飞镖|巨石）。
// 地下沙漠 PlaceSandTrap（w*0.003）：蜂窝墙内砂岩顶掏沙穴 + 致动沙栅 + 中心红线。
// RNG 映射：Next(a,b) → rng.int(a, b-1)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';
import { flipGenSolid, vanGenSolidType } from './GenSolid';
import { checkStalactite } from './ShimmerPass';
// ★MMMMMMM：巨石支受理门双态门（1456/1457 分叉实证,见 placeTrap case1 注）
import { hfIs1457 } from './HellFortPass';
import type { SparseChestSink } from '../ChestRegistry';   // ★IIII102c 稀疏 sink 槽模型
// ★dungeon-1457 批：placeTrap 双地牢界拒门（WorldGen.cs:8865）三因子承载
import { placeTrapDualDungeonReject } from './DungeonStyles1457';
// ★IIII162：树族邻格真分派引擎（vanilla/FinalCleanupPass 的 1:1 TileFrame；见
//   cascade3x3T 树族支注释——与 FinishNoTrapsPass 同款 co-import 既有惯例）
import { genTileFrameNeighbor } from './FinalCleanupPass';

const __swProcessEnv: Record<string, string | undefined> = (typeof process !== 'undefined') ? (process as unknown as { env?: Record<string, string | undefined> }).env ?? {} : {};


// ---- 内部 id / sheet 解析（表均为原版 sheet id 空间，消费端经 sheetOf 换算） ----
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}
const sheetOf = (t: number): number => (t >= 0 && t < SHEET_OF.length ? SHEET_OF[t] : -1);

/** TileID.Sets.Boulders（TileID.cs:195）= {138,484,664,665,711-716}（sheet 空间） */
const BOULDER_SHEETS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
const isBoulderType = (t: number): boolean => BOULDER_SHEETS.has(sheetOf(t));
/** Main.tileDungeon（Main.cs:7941-7946）= {41,43,44,677,678,679}（sheet 空间） */
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
/** Main.wallDungeon（Main.cs:10507-10515）= {7,8,9,94-99}（wall id 空间，免换算） */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** Main.tileSolidTop（Main.cs:6764+ 全 86 项，U/DDDD 批同表副本——不 import 防耦合） */
const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** TileID.Sets.Platforms（TileID.cs:243） */
const PLATFORM_SHEETS = new Set([19, 427, 435, 436, 437, 438, 439]);
/** TileID.Sets.Ore（TileID.cs:399） */
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
/** PlaceSandTrap ±25 禁置族：BasicChest{21,467}+Paintings{240,241,242,245,246}+{10,19,15,219,314} */
const SAND_FORBID = new Set([21, 467, 240, 241, 242, 245, 246, 10, 19, 15, 219, 314]);

const SHEET_ID_MAP = new Map<number, number>();
const sheetId = (s: number): number => {
  let v = SHEET_ID_MAP.get(s);
  if (v === undefined) {
    v = -1;
    for (let i = 0; i < TILE_DEFS.length; i++) if (SHEET_OF[i] === s) { v = i; break; }
    SHEET_ID_MAP.set(s, v);
  }
  return v;
};
const PLATE = sheetId(135);
const TRAP137 = sheetId(137);
const EXPLOSIVES = sheetId(141);
const GEYSER = sheetId(443);
const STONE1 = sheetId(1);          // 原版石头（巨石壳/致动石栅）
const SAND = sheetId(53);
const SANDSTONE = sheetId(396);
const HARDSAND = sheetId(397);
const MUSH_GRASS70 = sheetId(70);
const GLOW190 = sheetId(190);
const SPIKE48 = sheetId(48);
const WSPIKE232 = sheetId(232);
const SNOW147 = sheetId(147);
const ICE161 = sheetId(161);
const DOOR10 = sheetId(10);
const CHEST21 = sheetId(21);
const CHEST467 = sheetId(467);
const BOULDER138 = sheetId(138);
const BOULDER711 = sheetId(711);
const BOULDER712 = sheetId(712);
const BOULDER713 = sheetId(713);
const BOULDER714 = sheetId(714);
const BOULDER715 = sheetId(715);
const BOULDER664 = sheetId(664);
const BOULDER716 = sheetId(716);
const SHEET379 = sheetId(379);

const WIRE_RED = TileStore.WIRE_RED;
const WIRE_ACTUATOR = TileStore.WIRE_ACTUATOR;

// ★SSSSSSSS2 批：placeTrap 事件流仪（与 x86 rig JJHook.TrapEv/SW_TRAPSLOG 同名同位；
//   未注册零开销）。锚序与语义严格对齐 rig WorldGen.cs 内插入点，供逐事件对拍 diff。
function trapEv(kind: string, a: number, b: number, v: number): void {
  (globalThis as { __swTrapEv?: (kind: string, a: number, b: number, v: number) => void }).__swTrapEv?.(kind, a, b, v);
}

// ---- ★IIII29 批（2026-08-28）：TNT 桶受理面流仪 + PlaceTile 头变异触发仪 ----
// 均未注册零开销，语义与 x86 rig 侧 BW / PTreset_n<type> 标签同位对齐：
//   - TNT 流：`A` 尝试起点(k,x,y,bss)、`X` 扫描早退(H350/shimmer)、`H` 扫描命中锚行、
//     `C/G/R` Place2x2 逐门记录（空置门/地基门/决定）、`D` 决定；
//   - 头变异：`P <tag> x y hx hy(half 前) sl slope前 fxy(帧前)→fxy(帧后)`——
//     vanilla cs:60113-60121 的 active 非 frameImportant 锚重排分支。
function tntProbe(msg: string): void {
  (globalThis as { __swTntEv?: (m: string) => void }).__swTntEv?.(msg);
}
let tntSeq = 0;

/** WorldGen.SetBoulderSolidity（cs:11036）＝tileSolid 九巨石族整体翻转。
 *  ★集合不含 665（生命水晶巨石在 Boulders 集但不在本翻转列——1456/1457 逐行同）。
 *  SSSSSS-NOTRAPS 批接线（原 GenSolid.ts「特殊种子专属翻转备案」三处之一）。 */
const BOULDER_FLIP_SHEETS = [138, 484, 664, 711, 712, 713, 714, 715, 716];
export function setBoulderSolidity(solid: boolean): void {
  flipGenSolid(BOULDER_FLIP_SHEETS, solid);
}

/** GenVars.boulderPetsPlaced（cs:9302 宠物巨石计数，每局生成清零） */
let boulderPetsPlaced = 0;

/** ★IIII29：生成期 pass 共享 rng 兜底（runTrapsPass 头灌入）。vanilla SquareTileFrame
 *  / KillTile 链里的 genRand 是全局单例、永远可用；JS 曾按可选参数传递，CheckSuper/
 *  Chest 等毁除循环递归调用 killTileWholeCore 时丢参 ⇒ 环内 165 分派跳过
 *  checkStalactite（要求 rng），反被 MULTI_DEFS 整块近似误杀 —— const#31 两格
 *  T165>0@1681,480 实证。模块外直调本模块函数且未灌兜底的场景保持旧行为。 */
let passRngT: RNG | null = null;
function normRng(r?: RNG | null): RNG | undefined {
  return (r ?? passRngT) ?? undefined;
}

// ★IIII29：KillTile 湿尸支所需生成期旗标快照（runTrapsPass 头灌入；模块外调用=
// 未灌旗标，分支恒假——与旧行为一致，备案）
let genGetGoodT = false;
let genRemixT = false;
let genDrunkT = false;
/** TileID.Sets.Ices（1457 Terraria.ID/TileID.cs Ice 族表）sheet 空间副本 */
const ICE_SHEET_SET = new Set([161, 163, 164, 200]);

/** 多格 framed 物体表（KillTile 整块语义：破坏任一格=整块移除，见
 *  MultitileFragmentSweep 注释；Traps 的井杀/镖锚杀会波及陶罐/雕像/滚地仙人掌
 *  等邻接物体——golden (3787..3788,412..413) 陶罐被镖锚 KillTile 整块带走实证）。 */
const MULTI_DEFS = new Map<number, { w: number; h: number }>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i]!;
  if (d.framed && ((d.w ?? 1) > 1 || (d.h ?? 1) > 1)) MULTI_DEFS.set(i, { w: d.w!, h: d.h! });
}
export function killTileWhole(st: TileStore, x: number, y: number, rng?: RNG): void {
  killTileWholeCore(st, x, y, rng);
}

// ---- ★IIIIII5 批（2026-08-28）：KillTile_MakeTileDust 隐藏掷模型 ----
// vanilla KillTile（1457 cs:64029）在移除本格前恒执行
//   `int num12 = KillTile_GetTileDustAmount(fail, tile);`  （cs:67119）
//   `for (k < num12) KillTile_MakeTileDust(i, j, tile);`   （cs:67209）
// 服务端生成期（dedServ）尘粒本体被 Dust.NewDust 的 dedServ 门吞掉，但
// MakeTileDust 内 **type 表里约 40 个分支的 genRand.Next 照常消耗 genRand**
// ——KLOG+taglog 值级实证（m 链 g248：(5881..5882,470..487) 井穿列恰含 6 格
// 玻璃(25)，25 族 dustAmount=default 10 × 每 call 恰 1 掷 ⇒ +60 掷；其余石/泥
// 格零掷）。缺此模型 ⇒ 本格后所有掷位平移（m #76 T664>138×4 变体带、notraps
// 主循环 ±小 blip 族）。该段 1456/1457/1458 三版逐行同构（dust-14*.cs diff 空）
// ⇒ 无需版本双态门。
/** KillTile_GetTileDustAmount（cs:67119-67208）1:1（sheet 空间）。 */
const KDUST_AMT0_A = new Set([654, 630, 631]);
const KDUST_AMT0_B = new Set([125, 138, 172, 287, 300, 301, 302, 303, 304, 305, 306, 307, 308,
  354, 355, 373, 374, 375, 376, 461, 484, 499, 564, 565, 593, 594, 617, 664, 665, 699, 709,
  711, 712, 713, 714, 715, 716]);
function dustAmount(fail: boolean, sh: number, fx: number): number {
  if (KDUST_AMT0_A.has(sh)) return 0;
  if (sh === 231) return fail ? 3 : 6;
  if (sh === 481 || sh === 482 || sh === 483) return 3;
  if (sh === 541) return 1;
  if (sh === 549) return 2;
  if (KDUST_AMT0_B.has(sh)) return 0;
  if (sh === 534 || sh === 536 || sh === 539 || sh === 625 || sh === 627) return fail ? 3 : 5;
  if (sh === 184) return Math.trunc(fx / 22) >= 5 ? 5 : (!fail ? 10 : 3);
  return fail ? 3 : 10;                                   // cs default 支
}
/** KillTile_MakeTileDust 单次调用的 genRand 消耗（cs:67209-69695 内含 Next 的分支
 *  逐支转录；纯赋值/视觉块不影响掷流故省略——type 各自独占分支，短路序与源一致。
 *  大型家具列表为 cs:1809-1812 else-if 链（597 为首元，勿展开重排）。 */
const KDUST_FURN = new Set([358, 359, 360, 361, 362, 363, 364, 275, 276, 277, 278, 279, 280, 281,
  282, 285, 286, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 309, 310, 339, 538,
  413, 414, 505, 521, 522, 523, 524, 525, 526, 527, 532, 533, 543, 544, 550, 551, 553, 554, 555,
  556, 558, 559, 542, 391, 394, 392, 393, 568, 569, 570, 582, 580, 598, 599, 600, 601, 602, 603,
  604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 620, 629, 632, 640, 643, 644, 645, 710]);
function kdustRolls(st: TileStore, ci: number, rng: RNG): void {
  kdustRollsSh(sheetOf(st.type[ci]!), st.frameX[ci]!, rng);
}
/** ★IIII162：kdust 的 sheet/fx 直参变体——供 killObjectAt destroyObject 补掷支
 *  在【整块清除后】按快照重放其余格 dust 掷账（tile 已清,读不到 sh/fx）。 */
function kdustRollsSh(sh: number, fx: number, rng: RNG): void {
  switch (sh) {                                            // 主 switch 内含掷支（cs 相对 342-386）
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
      rng.int(0, 9); break;                                // Next(10)
    case 633:
      rng.int(0, 5); break;                                // Next(6)
    case 634:
      rng.int(0, 9); rng.int(0, 11); break;                // Next(10)+Next(12)
  }
  if (sh === 641) { rng.int(0, 1); return; }               // rel482
  if (sh === 370) { rng.int(0, 1); return; }               // rel510
  if (sh === 171) { rng.int(0, 1); return; }               // rel514
  if (sh === 254) {                                        // rel1639-1659 frameX 带
    if (fx < 108 && fx >= 72) rng.int(0, 2);
    else if (fx < 144 && fx >= 108) rng.int(0, 1);
    else if (fx >= 144) rng.int(0, 3);
    // fx<72：无掷
    return;
  }
  if (sh === 2 || sh === 477) { rng.int(0, 1); return; }   // 草/硬化丛林草 rel1675
  if (sh === 204 || sh === 478) { rng.int(0, 1); return; } // rel1778
  if (sh === 243) { rng.int(0, 1); return; }               // rel1789
  if (sh === 244) { rng.int(0, 1); return; }               // rel1801
  if (sh === 597) return;                                  // rel1807 else-if 首元（无掷）
  if (KDUST_FURN.has(sh)) { rng.int(0, 2); return; }       // rel1810 Next(3)!=0→num=-1
  if (sh === 231) { rng.int(0, 2); return; }               // rel2016
  if (sh === 238) { rng.int(0, 2); return; }               // rel2079 矿脉漆
  if (sh === 109 || sh === 492) { rng.int(0, 1); return; } // 丛林草 rel2187
  if (sh === 58 || sh === 76 || sh === 77 || sh === 684) { rng.int(0, 1); return; }  // rel2259
  if (sh === 37) { rng.int(0, 1); return; }                // rel2263
  if (sh === 32) { rng.int(0, 1); return; }                // rel2267
  if (sh === 352) { rng.int(0, 2); return; }               // rel2271
  if (sh === 23 || sh === 24 || sh === 661) { rng.int(0, 1); return; }               // rel2275
  if (sh === 31 || sh === 696) {                           // rel2279
    if (fx < 36) rng.int(0, 1);
    return;
  }
  if (sh === 25) { rng.int(0, 1); return; }                // rel2279 type25 支恒掷
  if (sh === 26 || sh === 695) {                           // rel2283
    if (fx < 54) rng.int(0, 1);
    return;
  }
  if (sh === 27) { rng.int(0, 1); return; }                // rel2299
  if (sh === 385) { rng.int(68, 70); return; }             // rel2311 Next(68,71)
  if (sh === 35) {                                         // rel2321 短路 && 掷
    if (fx < 36) rng.int(0, 1);
    return;
  }
  if (sh === 34 || sh === 42) { rng.int(0, 1); return; }   // rel2326 条件尾掷
  if (sh === 314) { rng.int(-2, 2); rng.int(-2, 2); rng.int(0, 50); return; }  // 尾部 spawn arg ×3
}

function killTileWholeCore(st: TileStore, x: number, y: number, rng?: RNG): void {
  // ★IIII29 watch 钩（__swKillW，未注册零开销）：观察盒内 KillTile 入口事件。
  (globalThis as { __swKillW?: (m: string) => void }).__swKillW?.(`${x},${y}`);
  // ★KillTile 1:1 头链（cs:63559-63990）。SSSSS 批（2026-08-20）补三件：
  //   ①CheckTileBreakability 门（cs:62403——容器上格保护/魔金矿/仙人掌基座/
  //     巨石骑箱 fail + 含 loot 箱拒杀）——m20260811 #76 双站点实证
  //     ((3073-3074,688-691) 井穿箱+箱下木与丛林草全存)；
  //   ②AttemptFossilShattering（cs:63526——杀化石 404 时 3×3 邻化石掷
  //     Next(15|4)==0 连锁杀，★掷流）——m20260811 (3703,483) 实证；
  //   ③fail 支类型转化（cs:63787-63810 草→土/丛林草→泥/苔→石…）。
  //   12345 #76 双根因（Check1x1 压板支撑杀 + Check2x2 残缺巨石帧锚杀）见
  //   cascade3x3T 分派注释。陶罐/雕像族仍走旧近似（9293480 golden 四站点实证）。
  // ★IIIIII5（2026-08-28）：补第④件【KillTile_MakeTileDust 隐藏掷】（见下方
  //   dustAmount/kdustDraws 与注释）——vanilla 服务端生成期 KillTile 恒跑
  //   GetTileDustAmount(fail) 次 MakeTileDust，其 type 表内玻璃/草族等分支耗
  //   genRand（KLOG 值级实证：m 链 g248 巨石井穿 6 格玻璃 25 → 恰 +60 掷，
  //   rollwin/taglog 锚 /tmp/iii5-out/x-mtaglog*.txt；缺失曾致 m #76
  //   T664>138×4 变体带错位与 notraps 主循环 ±20/±10 补偿型 blip）。
  //   次序对齐 vanilla：breakability → 【dust 循环】 → 化石碎裂 → fail 支。
  if (!st.inBounds(x, y)) return;
  const ci = st.idx(x, y);
  if (!st.flags[ci]) return;                          // cs:63573 !active()
  const killedSheet = st.type[ci]!;                   // ★IIII29 湿尸支需杀前类型（cs:64409）
  const br = checkBreakabilityT(st, x, y);
  if (br === 2) return;                               // cs:63584 num==2 拒杀
  // ★IIIIII5：cs:64213-64218 dust 循环（num12 次 MakeTileDust；本仓只计掷不产尘）
  if (rng) {
    const amt = dustAmount(br === 1, sheetOf(st.type[ci]!), st.frameX[ci]!);
    for (let k = 0; k < amt; k++) kdustRolls(st, ci, rng);
  }
  // cs:63756 化石碎裂在杀除本格**之前**（邻化石支撑判读本格仍活性；vanilla 位
  // 序=dust 之后、effectOnly 早退之后 cs:64222——本语境 effectOnly 恒 false）
  if (rng && sheetOf(st.type[ci]!) === 404) attemptFossilShatterT(st, x, y, rng, br === 1);
  if (br === 1) {
    // ★IIIIII5 备裁：vanilla fail 支内还有 ShakeTree（cs:64214，netMode!=1 且
    //   IsShakeable 家族——整树摇落长掷链）。本域 trap 杀列未触发过 IsShakeable
    //   （KLOG 全窗口零摇树），暂不移植；若未来 blip 出现 +50/+300 量级再补。
    failConvertT(st, x, y);
    // ★GGGGGGGG2-D 备裁：fail 支 SquareTileFrame(i,j,true) 的合并族帧号掷在生成期
    //   零耗（cs:82659 `!generatingWorld` 门）；cascade 中心=转化后格仍活性但
    //   cosmetic 分派不进 → 与旧实现一致零掷。
    cascade3x3T(st, x, y, rng); return;
  }
  // ★IIIIII5：非 fail 支的两个 KillTile 体内隐藏掷+级联（本仓fail支=转化后早退，位置同源）：
  //   ①裂缝砖系（cs:64290-64342）：type 481-483 时对 8 邻做 `active && Next(num16)==0
  //     && ∈[481,483]` 短路判读——**Next 只因邻格 active 即消耗**（type 判读在后），
  //     m==2（上邻）时 num16=3 否则 6；中签者先置本格 !active 再递归 KillTile(noItem)
  //     （邻居的 dust/web 等隐藏掷在递归内同样生效）。getGood 泥溅射支 cs:64268 仅
  //     getGoodWorld，两链旗标恒假不移植。OOB 邻格 vanilla 为 null 引用路径，trap 杀列
  //     不触界，按 skip 处理。
  if (rng) {
    const bsh = sheetOf(st.type[ci]!);
    if (bsh === 481 || bsh === 482 || bsh === 483) {
      for (let m = 0; m < 8; m++) {
        const num16 = m === 2 ? 3 : 6;
        const nx = x + [-1, 1, 0, 0, -1, 1, -1, 1][m]!;
        const ny = y + [0, 0, -1, 1, -1, -1, 1, 1][m]!;
        if (!st.inBounds(nx, ny)) continue;
        if (!st.flags[st.idx(nx, ny)]) continue;
        const hit = rng.int(0, num16 - 1) === 0;
        const nsh = sheetOf(st.type[st.idx(nx, ny)]!);
        if (hit && nsh >= 481 && nsh <= 483) {
          st.flags[ci] = 0;
          killTileWholeCore(st, nx, ny, rng);             // 不 break：vanilla 对剩余邻格继续判读
        }
      }
    }
    // ②蛛网缄默门（cs:64369）：type51(蛛网) && wall62(蜘蛛墙) → Next(4)!=0 ⇒ noItem
    //   ——**无论走哪个结果都先耗 1 掷**；ShouldTileSurvive 门对 web 恒假故省略。
    if (bsh === 51 && st.wall[ci] === 62) rng.int(0, 3);
  }
  // ★IIII29 定罪修复④（notraps #76 尾差 L/Y×1 @3548,1068）：vanilla KillTile 杀除
  //   体内的【湿尸】支（cs:64406-64426，紧随 ClearBlockPaintAndCoating、先于 type=0
  //   与 SquareTileFrame 尾）：type==58 叶子且 j>Main.UnderworldLayer(=h-200) ⇒ 死格
  //   留 lava 液 128；type==230 && getGoodWorld && Next(2)==0（耗掷!）⇒ 同留 lava128；
  //   (147||224||Ices) && getGood&&remix&&!drunk && Next(2)==0（耗掷!）⇒ 留水64。
  //   本域此前直接清空 ⇒ X 深渊叶被镖锚杀后残 lava 半池、J 全净（单格差在 #76 即现，
  //   且被二次沉降池聚合放大）。netMode!=1 门生成期恒真。行号=1457。
  killObjectAt(st, x, y, rng);   // ★IIII162 传 rng：destroyObject 其余格 dust 补掷（sandy #76 祭坛案）
  {
    // （湿尸支：死格残留液体——setTileSilent 清 type/帧不触 liquid）
    const wi = st.idx(x, y);
    const ksh = sheetOf(killedSheet);
    const underworld = st.h - 200;                // Main.UnderworldLayer（Main.cs:2886）
    if (ksh === 58 && y > underworld) {
      st.liquid[wi] = 128; st.liquidType[wi] = 2; // tile.lava(true)+liquid=128
    } else if (ksh === 230 && genGetGoodT && normRng(rng)!.int(0, 1) === 0) {
      st.liquid[wi] = 128; st.liquidType[wi] = 2;
    } else if (genGetGoodT && genRemixT && !genDrunkT
      && (ksh === 147 || ksh === 224 || ICE_SHEET_SET.has(ksh)) && normRng(rng)!.int(0, 1) === 0) {
      st.liquid[wi] = 64; st.liquidType[wi] = 1;  // 水残（vanilla liquidType(0)+64）
    }
  }
  cascade3x3T(st, x, y, rng);
}

/** KillTile 尾 SquareTileFrame（cs:63983→80924）3×3 TileFrame 分派级联。
 *  SSSSS 批按 vanilla TileFrame 真分派重构（12345 #76 双根因：①镖锚杀地基 →
 *  上方压板 Check1x1 支撑杀缺失（cs:45226→86307）；②残缺巨石块帧锚 Check2x2
 *  完整性杀缺失（cs:48405）——旧"整块搜索+支撑列"近似对残块必空转）。 */
function cascade3x3T(st: TileStore, x: number, y: number, rng0?: RNG, multiFallback = true): void {
  // ★IIII29：环分派的 genRand 兜底（见 passRngT 注）
  const rng = normRng(rng0);
  // SquareTileFrame 调用序（cs:80925-80933）列优先
  for (const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]] as const) {
    const ux = x + dx, uy = y + dy;
    // TileFrame 头界（cs:82069）：5 格 padding
    if (ux <= 5 || uy <= 5 || ux >= st.w - 5 || uy >= st.h - 5) continue;
    const ui = st.idx(ux, uy);
    const ut = st.type[ui];
    // TileFrame 失活格清 half/slope/块漆（cs:82077-82082，零掷零杀）
    // ★IIIII217（2026-09-03）涂层方块侧补清（Tile.cs:906-911 ClearBlockPaintAndCoating
    //   = color(0)+fullbrightBlock(false)+invisibleBlock(false)）——本文件本地级联
    //   cascade3x3T 曾漏 coat 位（IIIII111c 只补了 FinalCleanupPass.tileFrameGen
    //   主副本=平行副本陷阱；WetCollision 三副本同族第三犯）。waterpark #105 残格
    //   (2103,818) 定罪：placeTrap case0 飞镖 PlaceTile(137) 尾 SquareTileFrame 3×3
    //   对非活性幽灵格走本支，x86 清 fullbright 位（.cbt 075=04→076=00 实证）而 JS
    //   盈余 → Finish doExtraLiquidFinish fullbright 支误杀 t374 滴头（A=2/T=2）。
    if (!st.flags[ui]) { st.half[ui] = 0; st.slope[ui] = 0; st.paint[ui] = 0; st.coat[ui] &= ~TileStore.COAT_BLOCK_MASK; continue; }
    // ★IIII111 环分派取证钩（缺省零开销；与 x86 TRLOG SQF 行同构对拍用）
    (globalThis as { __swSqfF?: (x: number, y: number, t: number) => void }).__swSqfF?.(ux, uy, ut);
    const sh = sheetOf(ut);
    if (sh === 165 && rng) { checkStalactite(st, rng, ux, uy); continue; }
    if (ut === GEM178) { check178Gen(st, ux, uy, rng); continue; }
    if (CHECK1X1_SHEETS.has(sh)) { check1x1Gen(st, ux, uy, rng); continue; }
    if (CHEST_SHEETS.has(sh)) { checkChestGen(st, ux, uy, rng); continue; }
    if (CHECK2X2_SHEETS.has(sh)) { check2x2Gen(st, ux, uy, rng); continue; }
    // ★IIII162（sandy #76 定罪修复②）：树族邻格真分派——TileFrameImportant
    //   case 5/323/583-589/596/616/634 → CheckTree/CheckPalmTree/CheckTreeWithSettings
    //   （cs:87421+）。vanilla 飞镖井 KillTile(dart格 cs:9105) 尾环触树帧检即整树
    //   坍塌；JS 旧近似漏派发 ⇒ sandy (3636,440) 井邻树 8 格 x86 塌/JS 存（#76 残差）。
    //   走 FinalCleanup 引擎 1:1 TileFrame（resetFrame=false 邻格语义，YYYYY 批
    //   s22222 #97 树坍塌 118 杀实证）；树族 dust=0（KDUST 表）掷中性。
    if (rng && !i13Legacy() && TREE_DISPATCH_SHEETS.has(sh)) { genTileFrameNeighbor(st, rng, ux, uy); continue; }
    // ★IIIII221（graveyard #76 定罪修复）：Sign 家族 {55,85,395,425,510,511,573} 真分派
    //   （TileFrameImportant case 55/85/... → CheckSign cs:43944）——墓碑(85) 2×2 完整
    //   性组杀 + **case 85 尾幽灵掷 Next(8) 恒耗**（砸墓碑 1/8 刷幽灵 316；x86 rig
    //   rc 2169→2170 +1 掷实证,栈=CheckSign←TileFrameImportant←KillTile←placeTrap）。
    //   曾落 MULTI_DEFS 兜底（任意列悬空即塌近似）⇒ 掷流无 +1 → 本 pass 自此 +1
    //   错位（#76 巨石变体双翻 716>664/138>716 + 受理双不对称全 cascade）。
    //   实现体=引擎 checkSignSweep（FinalCleanupPass）。★同文件双编辑勿用两次
    //   write——本行曾因旧串二次覆写自灭（教训在案）。
    if (rng && !i13Legacy() && SIGN_DISPATCH_SHEETS.has(sh)) { genTileFrameNeighbor(st, rng, ux, uy); continue; }
    if (sh === 185) { checkPileTrap(st, ux, uy); continue; }
    // ★IIII10：墙挂/吊挂族真分派（CheckBanner/CheckXxxWall/CheckChand）——
    //   与 TileFrameImportant 同族互斥（不在 CHECK1X1/CHEST/CHECK2X2/185 表内），
    //   命中即消费本次邻格分派，绝不落入下方的地板支撑近似。
    if (!i13Legacy() && wallArtDispatchT(st, ux, uy, rng)) continue;   // ★IIII10（SW_I13_LEGACY=1 反演回退）
    // ★IIII29（2026-08-28）TNT 桶受理面收官定罪修复①：vanilla TileFrameImportant
    //   对 {172,360,505,521-527,543,568-570,580,598,620,652,654,713-716,751,752}
    //   是【空 case → break】（cs:86947-86975 区段逐枚转录）＝完全无完整性检查。
    //   曾让这些类型落入 MULTI_DEFS 兜底「整块支撑近似」，而该近似的支撑谓词
    //   （vanGenSolidType 严判）比 Place2x2 受理谓词（SolidTile2||tileTable）窄：
    //   落在桌/梁类地基上的正当 TNT 桶刚写完就在本格尾环分派中被自体静默擦除
    //   （notraps #76 四站实证：(742,697)/(887,750)+(893,749)/(3610,760) 全部
    //   tbl1(sol0) 地基；k1622/k6673 双写双自杀遗迹即此）。补空派发表后，
    //   X/J 两端 TNT 受理面在本域首次全等。
    // ★IIIII110b（pglun #76 定罪收官）：上表【并非】"零完整性检查"——vanilla
    //   TileFrameImportant 的 case 751/752/713-716/172/360/505/521-527/543/568-570/
    //   580/598/620/652/654 空支只 break【switch C】（cs:86978-86980），控制流随后
    //   落到 switch B default 尾的 `goto case 132;`（cs:87216）→ **Check2x2(i,j,type)**
    //   （cs:87234）。IIII29 曾把"空 case"读成"无检查"直返（在桶格自身被 frame 场景
    //   恰与 vanilla 同果），但 PlaceSandTrap 清场 KillTile→SquareTileFrame→TileFrame
    //   的【邻格锚横扫】路径下，x86 以 Check2x2 完整性清算整块（SW_KILLWATCH 栈实证：
    //   KillTile(2620,387)←Check2x2←TileFrameImportant←TileFrame←SquareTileFrame←
    //   KillTile←PlaceSandTrap，金字塔 TNT 桶 2×2 即此被毁）→ JS 桶存留 4 格
    //   （T0>751）+ 掷流位移 30 行级联。现按原文补路由：同族并入 check2x2Gen 精确分派
    //   （支撑谓词含 TILE_TABLE/巨石支/destroyObject 抑制,与 cs:48819-48988 1:1）。
    //   IIII29 受理面四案（桌基 TNT 桶）不受扰——Check2x2 支撑门 tileSolid||tileTable
    //   对桌基桶照常放行。
    if (!i13Legacy() && TILEFRAME_NO_CHECK.has(sh)) { check2x2Gen(st, ux, uy, rng); continue; }
    if (!multiFallback || !MULTI_DEFS.has(ut)) continue;
    (globalThis as { __swCascW?: (m: string) => void }).__swCascW?.(`${ux},${uy} sh${sh}`);   // ★IIII29 级联分派观察钩
    // 找含 (ux,uy) 的完整块锚
    const m = MULTI_DEFS.get(ut)!;
    for (let ay = uy; ay > uy - m.h; ay--) {
      let hit = false;
      for (let ax = ux; ax > ux - m.w; ax--) {
        let full = true;
        for (let ddy = 0; ddy < m.h && full; ddy++) {
          for (let ddx = 0; ddx < m.w; ddx++) {
            if (!st.inBounds(ax + ddx, ay + ddy) || st.type[st.idx(ax + ddx, ay + ddy)] !== ut) { full = false; break; }
          }
        }
        if (!full) continue;
        // 锚校验（旧近似，陶罐/雕像/186/187 族）：165 族（钟乳石）顶锚，余者底锚。
        //   ★巨石族（含滚地仙人掌 484）须全支撑列悬空才塌（golden site A 双列杀→塌 /
        //   site B 右列杀→存）；陶罐/雕像等任意列悬空即塌（site ①右列杀→塌 /
        //   site ②双列存→存）。巨石族现先走 check2x2Gen 精确分派，此处仅兜底。
        let ok = true;
        let anyBad = false, allBad = true;
        const ceiling = sh === 165;
        for (let c = 0; c < m.w; c++) {
          const sx = ax + c, sy = ceiling ? ay - 1 : ay + m.h;
          const bad = !st.inBounds(sx, sy) || !st.flags[st.idx(sx, sy)] || !vanGenSolidType(st.type[st.idx(sx, sy)]!);
          if (bad) anyBad = true; else allBad = false;
        }
        ok = isBoulderType(ut) ? !allBad : !anyBad;
        if (!ok) {
          for (let ddy = 0; ddy < m.h; ddy++) {
            for (let ddx = 0; ddx < m.w; ddx++) st.setTileSilent(ax + ddx, ay + ddy, 0);
          }
        }
        hit = true;
        break;
      }
      if (hit) break;
    }
  }
}

// ---- vanilla TileFrame 分派族（SSSSS 批） ----
/** TileID.Sets.PreventsTileRemovalIfOnTopOfIt（TileID.cs:169） */
const PREVENTS_REMOVAL = new Set([5, 323, 72, 488, 26, 583, 584, 585, 586, 587, 588, 589, 596, 616, 470, 475, 634]);
/** TileID.Sets.IsATreeTrunk（TileID.cs:161，sheet 空间）——不含 323（棕榈干单列
 *  独立臂，1457 cs:62914-62921 与树干族帧形豁免表不同）。★IIIII169：本域
 *  checkBreakabilityT 的树干帧门用（与 HalfBrickPass.TREE_TRUNK/TrackPass.
 *  TREE_TRUNK_SS 同一全集，第三副本勿再散表）。 */
const TREE_TRUNK_T = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
/** IsAContainer（cs:48831）：BasicDresser{88}+{470,475}+BasicChest{21,467}+Fake{441,468} */
const CONTAINER_SHEETS = new Set([88, 470, 475, 21, 467, 441, 468]);

/** Main.tileMoss（Main.cs tileMoss[x]=true 全 11 项）与 TileID.Sets.tileMossBrick（:309） */
const TILE_MOSS = new Set([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);
const TILE_MOSS_BRICK = new Set([512, 513, 514, 515, 516, 517, 535, 537, 540, 626, 628]);
/** fossilBreak（WorldGen 静态位，cs:63528 再入闸） */
let fossilBreakT = false;
const isLockedDoorT = (st: TileStore, i: number): boolean =>
  st.type[i] === DOOR10 && st.frameY[i]! >= 594 && st.frameY[i]! <= 646 && st.frameX[i]! < 54;

/** CheckTileBreakability（cs:62403-62520）Traps 语境 1:1：2=拒杀 / 1=fail /
 *  0=可杀。★含 loot 箱拒杀门（SSSSS 证据补——反编译无此分支，x86 金标四链
 *  Traps 全程零箱杀 + m20260811 双井穿站点箱存活实证；语义=Chest.CanDestroyChest
 *  cs:590 有物不可毁，游戏内同规则"有物箱不可开采"）。 */
function checkBreakabilityT(st: TileStore, x: number, y: number): 0 | 1 | 2 {
  const i = st.idx(x, y);
  const t = st.type[i]!;
  const sh = sheetOf(t);
  if (st.inBounds(x, y + 1)) {
    const bi = st.idx(x, y + 1);
    if (st.flags[bi] && isLockedDoorT(st, bi)) return 2;          // cs:62424
  }
  if (!vanGenSolidType(t) && !SOLID_TOP.has(sh)) {
    // ★SSSSS 证据门：含 loot 箱拒杀（锚=帧列模 2/帧行 18，同 CheckChest 锚）
    if (CHEST_SHEETS.has(sh) && chestItemAnchors) {
      let num = Math.trunc(st.frameX[i]! / 18);
      while (num > 1) num -= 2;
      const ax = x - num, ay = y - Math.trunc(st.frameY[i]! / 18);
      if (chestItemAnchors.has(ay * st.w + ax)) return 2;
    }
    return 0;                                                     // cs:62427 非实心早退
  }
  if (st.inBounds(x, y - 1) && st.flags[st.idx(x, y - 1)]) {
    const ai = st.idx(x, y - 1);
    const at = st.type[ai]!, ash = sheetOf(at);
    const scanForContainer = !CONTAINER_SHEETS.has(sh);
    // CheckTileBreakability_HasReasonToReturnEarly（cs:62524）
    // ★IIIII169（2026-09-02）拒杀树干豁免臂补移植（1457 cs:62906-62921；1456 同形
    //   cs:62435-62445）——HasReason 命中后 vanilla 先分型再定拒/放：
    //   ①上格=IsATreeTrunk（TileID.cs:161 全集）→ 三种"基座/树冠"帧形豁免放行
    //     （frameX 66 且 frameY 0..44 / frameX 88 且 frameY 66..110 / frameY≥198
    //     ⇒ return 0 可杀），其余帧形（干身/侧枝带）⇒ return 2 拒杀；
    //   ②上格=323 棕榈干 → frameX∈{66,220} 拒杀，其余放行；
    //   ③其余 HasReason 类型（77/488/26/470/475/锁门/容器）维持无条件拒杀。
    //   此前本域副本对全部 PREVENTS_REMOVAL 直接 return 2 ⇒ 树干基座帧形/棕榈
    //   非锚帧形下的 kill 目标被多拒：vanilla 杀（尘掷流位+killTileWhole 尾
    //   cascade3x3T 级联全跑）而 JS 零掷零写，随后 PlaceTile(forced) 照写同型
    //   ——掷流差 + 写位双级联差。sandy (3636,440) 站点上格恰为侧枝帧形（两侧
    //   同拒）故 mile8 未爆；本臂为结构缺口预防性清偿（HalfBrick 引擎副本
    //   cs:62427-62437 臂 918-927 行与 TrackPass 642-650 行早已同形）。
    if (sh !== ash && (ash === 77 || PREVENTS_REMOVAL.has(ash))) {
      if (TREE_TRUNK_T.has(ash)) {                        // IsATreeTrunk 帧门（cs:62906-62913）
        const fx = st.frameX[ai]!, fy = st.frameY[ai]!;
        if ((fx === 66 && fy >= 0 && fy <= 44) || (fx === 88 && fy >= 66 && fy <= 110) || fy >= 198) return 0;
        return 2;
      }
      if (ash === 323) {                                  // 棕榈干锚帧门（cs:62914-62921）
        const fx = st.frameX[ai]!;
        if (fx === 66 || fx === 220) return 2;
        return 0;
      }
      return 2;
    }
    if (isLockedDoorT(st, ai)) return 2;
    if (scanForContainer && CONTAINER_SHEETS.has(ash)) return 2;
    if (ash === 80 && at !== t) {                                 // cs:62445 仙人掌基座
      const n = Math.trunc(st.frameX[ai]! / 18);
      if (n === 0 || n === 1 || n === 4 || n === 5) return 2;
    }
    if (t === DOOR10 && isLockedDoorT(st, i)) return 1;
    if (isBoulderType(t) && checkBoulderChestT(st, x, y)) return 1; // cs:62455
  }
  return 0;
}

/** CheckBoulderChest（cs:48810）：巨石 2×2 锚上方两格 ∈ 容器/魔金矿/禁拆族 → true */
function checkBoulderChestT(st: TileStore, x: number, y: number): boolean {
  const i = st.idx(x, y);
  let num = -Math.trunc(st.frameX[i]! / 18);
  if (num < -1) num += 2;
  num += x;
  const num2 = y - Math.trunc((st.frameY[i]! % 36) / 18);
  const t = st.type[i]!;
  for (const cx of [num, num + 1]) {
    if (!st.inBounds(cx, num2 - 1)) continue;
    const ci = st.idx(cx, num2 - 1);
    if (!st.flags[ci]) continue;
    const ct = st.type[ci]!, csh = sheetOf(ct);
    if (sheetOf(t) !== csh && (csh === 77 || PREVENTS_REMOVAL.has(csh))) return true;
    if (isLockedDoorT(st, ci)) return true;
    if (CONTAINER_SHEETS.has(csh)) return true;
  }
  return false;
}

/** AttemptFossilShattering（cs:63526）1:1：杀化石时 3×3 邻化石掷 Next(maxValue)==0
 *  连锁杀。maxValue：邻下格非实心=4；正上格（!fail）=4；余 15。★掷流敏感 */
function attemptFossilShatterT(st: TileStore, x: number, y: number, rng: RNG, fail: boolean): void {
  if (fossilBreakT) return;
  fossilBreakT = true;
  for (let k = x - 1; k <= x + 1; k++) {
    for (let l = y - 1; l <= y + 1; l++) {
      let maxValue = 15;
      if (!solidTileV(st, k, l + 1)) maxValue = 4;
      else if (k === x && l === y - 1 && !fail) maxValue = 4;
      if ((k !== x || l !== y) && st.inBounds(k, l)) {
        const ki = st.idx(k, l);
        if (st.flags[ki] && sheetOf(st.type[ki]!) === 404 && rng.int(0, maxValue - 1) === 0) {
          killTileWholeCore(st, k, l, rng);
        }
      }
    }
  }
  fossilBreakT = false;
}

/** KillTile fail 支类型转化（cs:64193-64246）：草族→土/丛林草→泥/苔→石/苔砖→石砖。
 *  转化后原格存活（cs:64246 SquareTileFrame 后 return，生成期该重置帧链对
 *  合并族零掷——GGGGGGGG2-D 备裁：TileFrameCosmetic 被 cs:82659
 *  `!generatingWorld` 门跳过）。 */
function failConvertT(st: TileStore, x: number, y: number): void {
  const i = st.idx(x, y);
  const sh = sheetOf(st.type[i]!);
  const conv: Record<number, number> = { 2: 0, 23: 0, 109: 0, 199: 0, 477: 0, 492: 0, 633: 57, 60: 59, 661: 59, 662: 59, 70: 59 };
  if (sh in conv) {
    st.type[i] = sheetId(conv[sh]!);
    return;
  }
  if (TILE_MOSS.has(sh)) st.type[i] = STONE1;
  else if (TILE_MOSS_BRICK.has(sh)) st.type[i] = sheetId(38);
}

/** Check1x1 分派族（TileFrameImportant cs:86300-86308：36/135/141/210/239/428/
 *  593/624/650/656/700/701 → Check1x1）——1×1 落地物 */
const CHECK1X1_SHEETS = new Set([36, 135, 141, 210, 239, 428, 593, 624, 650, 656, 700, 701]);
const GEM178 = sheetId(178);
/** Check2x2 分派族（cs:86402 {335,411,490,564,565,594} + cs:86672-86688
 *  {132,138,142,143,288-295,484,664,665,711,712}）。★713-716（熔岩/蜘蛛/地牢
 *  巨石）在 cs:86410 break 列表=零分派，不在本族 */
const CHECK2X2_SHEETS = new Set([132, 138, 142, 143, 288, 289, 290, 291, 292, 293, 294, 295, 335, 411, 484, 490, 564, 565, 594, 664, 665, 711, 712]);
/** ★IIII162 树族分派表（TileFrameImportant cs:87421+ case 5/323/583-589/596/616/634
 *  → CheckTree/CheckPalmTree/CheckTreeWithSettings）——邻格树帧检真分派（见
 *  cascade3x3T 树族支）。fw/fh=1（无 MULTI_DEFS 成员），与 CHECK1X1/2X2/CHEST 无交。 */
const TREE_DISPATCH_SHEETS = new Set([5, 323, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
/** ★IIIII221：Sign 家族（TileFrameImportant case 55/85/395/425/510/511/573 → CheckSign） */
const SIGN_DISPATCH_SHEETS = new Set([55, 85, 395, 425, 510, 511, 573]);
/** BasicChest{21,467}（TileID.cs:315）→ CheckChest（cs:81400+） */
const CHEST_SHEETS = new Set([21, 467]);
/** Main.tileTable（Main.cs:6828+ 全 75 项，= tileSolidTop ∖ {16,134,239}） */
const TILE_TABLE = new Set([14, 18, 19, 87, 88, 101, 114, 275, 276, 277, 278, 279, 280, 281, 285, 286, 296, 297, 298, 299,
  309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394, 405, 413, 414, 427, 469, 532, 533, 538,
  542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610,
  611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** vanilla destroyObject（WorldGen 静态位）本 pass 语境镜像：Check2x2/CheckChest
 *  杀除期置真，期间再入两者头门早退（cs:48407/CheckChest 头），杀除毕复位 */
let destroyObjectT = false;
/** Chest.CanDestroyChest 语境（cs:590）：有物箱不可毁（锚键 y*w+x）。
 *  runTrapsPass 由 world.chests 灌入；杀箱时同步注销（Chest.DestroyChest） */
let chestItemAnchors: Set<number> | null = null;
let chestList: SparseChestSink | null = null;   // ★IIII102c：稀疏槽模型(洞=null,禁 splice)
export function __setTrapsChestAnchors(s: Set<number> | null): void { chestItemAnchors = s; }


// ---- ★IIII10 批（2026-08-28）：TileFrameImportant 墙挂/吊挂族真分派 ----
// cascade3x3T 的 MULTI_DEFS 兜底支是「地板支撑近似」（陶罐/雕像族金标实证），
// 但墙面挂件族（画/旗）与天花吊挂族（枝形吊灯）的原版真实判定走
// TileFrameImportant→CheckXxxWall / CheckBanner / CheckChand——旗挂看**上邻实心
// 支柱**、画挂看 **wall>0**、吊灯看天花板——地板近似必然误杀（notraps 链实证：
// T91×9/T240×9/T34×9 被 J 多杀 → g3805 等站点九格受理门分叉 → 主循环断点漂移；
// x86 klog K11756/242938 同点双杀 + dump076 该族存活交叉印证）。本节按 1457
// 反编译逐行转录；毁除经 killTileWholeCore（画/旗尘掷 default=10 的隐藏掷流同构）。
/** TileID.Sets.NotReallySolid（Terraria.ID/TileID.cs:359） */
const NOT_REALLY_SOLID = new Set([387, 388, 10]);
/** nactive()＝active 且非致动隐身位（Tile.cs:591-618，与 placeTrap 九格门同式） */
function nactiveT(st: TileStore, i: number): boolean {
  return st.flags[i] !== 0 && ((st.wire[i] >>> 5) & 1) === 0;
}
/** 毁除矩形内 type 匹配活性格（destroyObject 期=阻断再入分派，各 Check fn 原样）。 */
function destroyMatchingRectT(st: TileStore, x0: number, y0: number, w: number, h: number, t: number, rng?: RNG): void {
  destroyObjectT = true;
  for (let k = x0; k < x0 + w; k++) {
    for (let l = y0; l < y0 + h; l++) {
      if (!st.inBounds(k, l)) continue;
      const ki = st.idx(k, l);
      if (st.type[ki] === t && st.flags[ki]) killTileWholeCore(st, k, l, rng);
    }
  }
  destroyObjectT = false;
}
/** CheckBanner（cs:46493-46560）1:1：1×3 三格完整性 + 上格支柱门，破则整列 KillTile。 */
function checkBannerT(st: TileStore, x: number, y: number, rng?: RNG): void {
  if (destroyObjectT) return;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  const rowInObj = ((Math.trunc(st.frameY[i]! / 18) % 3) + 3) % 3;     // fy≥0 恒等；防负模
  const styleRowBand = Math.floor((st.frameY[i]! | 0) / 54);
  const ay = y - rowInObj;
  const fxSelf = st.frameX[i]!;
  let flag = false;
  for (let k = 0; k < 3; k++) {
    const ki = ay + k >= 0 && ay + k < st.h ? st.idx(x, ay + k) : -1;
    if (ki < 0 || !st.flags[ki] || st.type[ki] !== t || st.frameY[ki] !== k * 18 + styleRowBand * 54 || st.frameX[ki] !== fxSelf) { flag = true; break; }
  }
  if (!flag) {
    const ai = st.inBounds(x, ay - 1) ? st.idx(x, ay - 1) : -1;
    if (ai >= 0 && !nactiveT(st, ai)) flag = true;
    else if (ai < 0) flag = true;
    else {
      const at = st.type[ai]!, ash = sheetOf(at);
      const num3 = st.slope[ai] === 1 || st.slope[ai] === 2 || st.half[ai] !== 0 || vanGenSolidType(at);
      const flag2 = !SOLID_TOP.has(ash) || (PLATFORM_SHEETS.has(ash) && (st.half[ai] !== 0 || st.slope[ai] === 1 || st.slope[ai] === 2));
      let flag3 = (num3 && flag2) && !NOT_REALLY_SOLID.has(ash) && !(st.slope[ai] === 3 || st.slope[ai] === 4);
      if (PLATFORM_SHEETS.has(ash) || ash === 380) flag3 = true;
      if (!flag3) flag = true;
    }
  }
  if (!flag) return;
  destroyMatchingRectT(st, x, ay, 1, 3, t, rng);
}
/** 墙画族：锚反解+带步进逐 fn 转录 → 完整性 ∪ wall<=0 判定 → 整幅毁除。
 *  Check3x3Wall cs:44690（240/440）/ Check2x3Wall cs:44997（245）/ Check3x2Wall cs:45154（246）
 *  / Check4x3Wall cs:45284（241）/ Check6x4Wall cs:45377（242）。 */
function checkWallArtT(st: TileStore, x: number, y: number, rng?: RNG): boolean {
  if (destroyObjectT) return false;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  const sh = sheetOf(t);
  const fx = st.frameX[i]!, fy = st.frameY[i]!;
  let ax = x, ay = y, baseX = 0, baseY = 0, w = 0, h = 0;
  if (sh === 240 || sh === 440) {              // 3×3：fx/fy 双向 54 步进条带
    ax = x - (((Math.trunc(fx / 18) % 3) + 3) % 3); baseX = Math.floor(Math.abs(fx / 18) / 3) * 54 * (fx < 0 ? -1 : 1);
    ay = y - (((Math.trunc(fy / 18) % 3) + 3) % 3); baseY = Math.floor(Math.abs(fy / 18) / 3) * 54 * (fy < 0 ? -1 : 1);
    w = 3; h = 3;
  } else if (sh === 245) {                     // 2 宽 × 3 高：fx 带 36 步进、fy 直解
    ax = x - (((Math.trunc(fx / 18) % 2) + 2) % 2); baseX = Math.floor(Math.abs(fx) / 36) * 36 * (fx < 0 ? -1 : 1);
    ay = y - Math.trunc(fy / 18); baseY = 0;
    w = 2; h = 3;
  } else if (sh === 246) {                     // 3 宽 × 2 高：fx 直解、fy 带 36 步进
    ax = x - Math.trunc(fx / 18); baseX = 0;
    ay = y - (((Math.trunc(fy / 18) % 2) + 2) % 2); baseY = Math.floor(Math.abs(fy) / 36) * 36 * (fy < 0 ? -1 : 1);
    w = 3; h = 2;
  } else if (sh === 241) {                     // 4 宽 × 3 高：fy 条带 54 步进、fx 直解
    ax = x - Math.trunc(fx / 18); baseX = 0;
    ay = y - (((Math.trunc(fy / 18) % 3) + 3) % 3); baseY = Math.floor(Math.abs(fy / 18) / 3) * 54 * (fy < 0 ? -1 : 1);
    w = 4; h = 3;
  } else if (sh === 242) {                     // 6×4 大画：27/72/108 复合 stride
    const cols = Math.trunc(fx / 18), rows = Math.trunc(fy / 18);
    const n = 27 * Math.floor(cols / 6) + Math.floor(rows / 4);
    ax = x - (((cols % 6) + 6) % 6); baseX = Math.floor(n / 27) * 108;
    ay = y - (((rows % 4) + 4) % 4); baseY = ((((n % 27) + 27) % 27)) * 72;
    w = 6; h = 4;
  } else return false;
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      const k = ax + dx, l = ay + dy;
      if (!st.inBounds(k, l)) continue;        // vanilla Main.tile[k,l]==null 跳过（flag 不置）
      const ki = st.idx(k, l);
      if (!st.flags[ki] || st.type[ki] !== t || st.wall[ki] <= 0
        || st.frameX[ki] !== baseX + dx * 18 || st.frameY[ki] !== baseY + dy * 18) {
        destroyMatchingRectT(st, ax, ay, w, h, t, rng);
        return true;
      }
    }
  }
  return false;
}
/** CheckChand（cs:53254-53346）1:1：枝形吊灯（34 宽 3 / 454 宽 4），中心上格实心柱门。 */
function checkChandT(st: TileStore, x: number, y: number, rng?: RNG): void {
  if (destroyObjectT) return;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  const sh = sheetOf(t);
  const W = sh === 454 ? 4 : 3;
  const fxc = Math.trunc(st.frameX[i]! / 18);
  const num4 = Math.floor(fxc / W);
  const cellX = fxc % W;
  const ax = x - cellX;
  const num6 = 18 * W * num4;
  const fyc = Math.trunc(st.frameY[i]! / 18);
  let num7 = Math.floor(fyc / 3);
  const cellY = fyc % 3;
  if (num6 >= 108) num7 += 37 * Math.floor(num6 / 108);
  let num8 = 54 * num7;
  if (num6 >= 108) num8 -= 54 * Math.floor(num6 / 108) * 37;
  const ay = y - cellY;
  let flag = false;
  for (let dx = 0; dx < W; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      const k = ax + dx, l = ay + dy;
      if (!st.inBounds(k, l)) { flag = true; break; }
      const ki = st.idx(k, l);
      if (!st.flags[ki] || st.type[ki] !== t || st.frameX[ki] !== (k - ax) * 18 + num6 || st.frameY[ki] !== (l - ay) * 18 + num8) { flag = true; break; }
    }
    if (flag) break;
  }
  // 中央上格支柱门（vanilla 中心=锚+1 列，不分宽窄恒 +1）
  const ai = st.inBounds(ax + 1, ay - 1) ? st.idx(ax + 1, ay - 1) : -1;
  if (ai < 0 || !nactiveT(st, ai) || !vanGenSolidType(st.type[ai]!) || SOLID_TOP.has(sheetOf(st.type[ai]!))) flag = true;
  if (!flag) return;
  destroyMatchingRectT(st, ax, ay, W, 3, t, rng);
}
/** IIII10 分派入口：命中真分派族返回 true（已消费本次邻格分派）。
 *  ★III13：并入 CheckSuper 族 {376,443,444,485}（TileFrameImportant cs:86977 真分派
 *  ——notraps #76 定罪 T0>485×2×(1597..1598,367/368)：x86 plate 尾级联经 CheckSuper
 *  杀除（boxlog rc=123110952 K×3 连环），J 曾漏派本族 → 残留。 */
function wallArtDispatchT(st: TileStore, x: number, y: number, rng?: RNG): boolean {
  const sh = sheetOf(st.type[st.idx(x, y)]!);
  if (sh === 91) { checkBannerT(st, x, y, rng); return true; }
  if (sh === 34 || sh === 454) { checkChandT(st, x, y, rng); return true; }
  if (sh === 240 || sh === 440 || sh === 245 || sh === 246 || sh === 241 || sh === 242) { checkWallArtT(st, x, y, rng); return true; }
  if (!i13Legacy() && CHECK_SUPER_DEFS[sh]) { checkSuperT(st, x, y); return true; }
  return false;
}

// ---- ★III13 批：CheckSuper 族（cs:48523-48700 / 分派表 cs:86971-86980） ----
/** Terraria.ObjectData 数据面（sheet 空间）：376=Style2x2+StyleHorizontal(
 *  CoordinateHeights{16,18})、443=Style2x1、444=Style2x2、485=Style2x2+H。
 *  strideX/Y=CoordinateWidth(16)+padding(2)=18；fullW/fullH=边长×18=36。 */
const CHECK_SUPER_DEFS: Record<number, { w: number; h: number; horiz: boolean }> = {
  376: { w: 2, h: 2, horiz: true },
  // ★III24b：443（Style2x1 基，TileObjectData.cs:2799-2808）StyleHorizontal=true、
  //   CoordFullW=36；同基含 吊挂 alternate(addAlternate(2/3)，AnchorTop=SolidBottom)。
  //   曾误标 horiz:false ⇒ 完整性等式把 fx≥36 的正当喷泉判残缺整块杀（notraps
  //   #76 (1734..1735,840) 双证＋CS443 流 x/j 首分歧）。
  443: { w: 2, h: 1, horiz: true },
  444: { w: 2, h: 2, horiz: false },
  485: { w: 2, h: 2, horiz: true },
};
/** Main.tileNoAttach（Main.cs:7450-7458）＝{568,569,570} */
const NO_ATTACH_SHEETS = new Set([568, 569, 570]);

// ★IIII29：TileFrameImportant 空 case 族（cs:86947-86975 default: 支逐枚转录，
//   sheet 空间）——FrameImportant 但零完整性检查的类型（TNT 桶 654 为首祸）。
const TILEFRAME_NO_CHECK = new Set([172, 360, 505, 521, 522, 523, 524, 525, 526, 527,
  543, 568, 569, 570, 580, 598, 620, 652, 654, 713, 714, 715, 716, 751, 752]);

/** AnchorValid（cs:52294）子集转录（Traps 域仅用 solid/solidBottom 三旗面）。 */
function anchorValidT(st: TileStore, x: number, y: number, kind: 'solid' | 'bottom' | 'top' | 'side'): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!nactiveT(st, i)) return false;
  const t = st.type[i]!, sh = sheetOf(t);
  const blockType0 = st.half[i] === 0 && st.slope[i] === 0;
  const topSlope = st.slope[i] === 1 || st.slope[i] === 2;
  const bottomSlope = st.slope[i] === 3 || st.slope[i] === 4;
  if (kind === 'solid') {
    // AnchorType.SolidTile：tileSolid && !tileSolidTop && !noAttach && blockType()==0
    return vanGenSolidType(t) && !SOLID_TOP.has(sh) && !NO_ATTACH_SHEETS.has(sh) && blockType0;
  }
  if (kind === 'side') {
    // SolidSide：tileSolid && !tileSolidTop && blockType∈{4,5}（bottomSlope 族）
    return vanGenSolidType(t) && !SOLID_TOP.has(sh) && (st.slope[i] === 3 || st.slope[i] === 4);
  }
  if (kind === 'top') {
    // SolidWithTop：平台 proper-top 或 solidTop 实心
    if (PLATFORM_SHEETS.has(sh)) {
      const num = Math.floor(st.frameX[i]! / 18);
      return (!st.half[i] && num >= 0 && num <= 7) || (num >= 12 && num <= 16) || (num >= 25 && num <= 26);
    }
    return vanGenSolidType(t) && SOLID_TOP.has(sh);
  }
  // bottom：SolidBottom
  const solidOk = vanGenSolidType(t)
    && (!SOLID_TOP.has(sh) || (PLATFORM_SHEETS.has(sh) && (st.half[i] === 1 || topSlope)));
  return (solidOk || topSlope || st.half[i] === 1) && !NOT_REALLY_SOLID.has(sh) && !bottomSlope;
}

/** CheckSuper（cs:48523）：FrameImportant 超族完整性 + 各自锚门 → 整块毁除。
 *  443 的双支锚（落地列/吊挂行）通过即翻转 frameX 变体（cs:48616-48631，无掷）
 *  ——帧位不进 mile8 通道，略去重写保留杀除判定等价。 */
function checkSuperT(st: TileStore, x: number, y: number): void {
  if (destroyObjectT) return;                                   // cs:48526
  const i = st.idx(x, y);
  const t = st.type[i]!;
  const sh = sheetOf(t);
  const def = CHECK_SUPER_DEFS[sh];
  if (!def) return;
  const fx = st.frameX[i] | 0, fy = st.frameY[i] | 0;
  const wrapW = ((Math.trunc(fx / 18) % def.w) + def.w) % def.w;
  const wrapH = ((Math.trunc(fy / 18) % def.h) + def.h) % def.h;
  const ax = x - wrapW, ay = y - wrapH;
  const styleFullX = def.horiz ? Math.floor(fx / 36) : 0;       // C# 正值 int 除
  const styleFullY = !def.horiz ? Math.floor(fy / 36) : 0;
  let bad = false;
  for (let dx = 0; dx < def.w && !bad; dx++) {
    for (let dy = 0; dy < def.h && !bad; dy++) {
      const k = ax + dx, l = ay + dy;
      if (!st.inBounds(k, l)) { bad = true; break; }
      const ki = st.idx(k, l);
      if (!st.flags[ki] || st.type[ki] !== t
        || st.frameX[ki] !== styleFullX * 36 + dx * 18
        || st.frameY[ki] !== styleFullY * 36 + dy * 18) bad = true;
    }
  }
  if (sh === 376) {
    for (let k = ax; k < ax + def.w && !bad; k++) {             // 底行支撑门（实心|桌 且非半砖）
      const ki = st.inBounds(k, ay + def.h) ? st.idx(k, ay + def.h) : -1;
      if (ki < 0 || !st.flags[ki] || (!vanGenSolidType(st.type[ki]!) && !TILE_TABLE.has(sheetOf(st.type[ki]!))) || st.half[ki]) bad = true;
    }
  }
  if (sh === 443) {
    let floorOk = true, hangOk = true;
    for (let k = ax; k < ax + def.w; k++) {
      if (!anchorValidT(st, k, ay + def.h, 'solid') && !anchorValidT(st, k, ay + def.h, 'top') && !anchorValidT(st, k, ay + def.h, 'side')) floorOk = false;
      if (!anchorValidT(st, k, ay - 1, 'bottom')) hangOk = false;
    }
    if (!hangOk && !floorOk) bad = true;
    // ★III24b 补 vanilla 存活分支的【重排帧】面（cs:48605-48625）：floor 锚存 ⇒
    //   fx=m*18+(num/2)*36；仅吊挂锚存 ⇒ fx=n*18+((num-2)/2)*36+72。num=入口格
    //   frameX/36（C# 正值整除）。J 曾缺此支 ⇒ 存活喷泉帧不被改写，后续完整性
    //   等式与重进级联全部错位。
    if (!bad) {
      const num36 = Math.trunc(fx / 36);
      for (let m = 0; m < def.w; m++) {
        st.frameX[ax + m] = (m * 18 + (floorOk ? Math.trunc(num36 / 2) * 36 : Math.trunc((num36 - 2) / 2) * 36 + 72)) as never;
      }
    }
  }
  if (sh === 444) {
    for (let k = ax; k < ax + def.w && !bad; k++) {             // 顶行锚（上格 SolidTile）
      if (!anchorValidT(st, k, ay - 1, 'solid')) bad = true;
    }
    for (let dx = 0; dx < def.w && !bad; dx++) {                // 物体内带液体 → 毁除
      for (let dy = 0; dy < def.h && !bad; dy++) {
        if (st.liquid[st.idx(ax + dx, ay + dy)] > 0) bad = true;
      }
    }
  }
  if (sh === 485) {
    for (let k = ax; k < ax + def.w && !bad; k++) {             // 底行锚（上格 SolidTile）
      if (!anchorValidT(st, k, ay + def.h, 'solid')) bad = true;
    }
  }
  if (!bad) return;
  destroyObjectT = true;
  for (let dx = 0; dx < def.w; dx++) {
    for (let dy = 0; dy < def.h; dy++) {
      if (!st.inBounds(ax + dx, ay + dy)) continue;
      const ki = st.idx(ax + dx, ay + dy);
      if (st.type[ki] === t && st.flags[ki]) killTileWholeCore(st, ax + dx, ay + dy);
    }
  }
  destroyObjectT = false;
}


/** Check1x1（cs:45226-45244）1:1：地基 SolidTileAllowBottomSlope 失效或巨石地基
 *  → KillTile。★SSSSS 补（12345 #76 根因①：镖锚杀地基后上方压板须碎——
 *  (2956,523) golden 实证）。624 Abigail 花专属门非生成期产物不移植。 */
function check1x1Gen(st: TileStore, x: number, y: number, rng?: RNG): void {
  if (!solidTileAllowBottomSlope(st, x, y + 1)) { killTileWholeCore(st, x, y, rng); return; }
  const gi = st.idx(x, y + 1);
  if (st.inBounds(x, y + 1) && st.type[gi]! >= 0 && isBoulderType(st.type[gi]!)) killTileWholeCore(st, x, y, rng);
}

// ---- ★NNN 批（2026-08-25）：case 178 宝石籽分派（12345 #76 首差 T0>178×1 定罪）----
// KillTile 尾 SquareTileFrame 级联帧到僵尸宝石（四邻全失锚）→ CheckAndAdjustMulti-
// DirectionalTile 失败 → KillTile。实证站点 (2134,789)：巨石陷阱掏腔 KillTile(2135,789)
// 石→级联帧到左邻 178 残籽（#075 基线两侧同态、四邻全 air）→ vanilla 杀 JS 曾无派发
// 分支 → 存活。成功支 resetFrame=true 时 1×Next(3) 重掷 frameY 偏移（cs:86384，掷流敏感；
// FinalCleanupPass.frame178Sweep 同源镜像）。slope 助手语义：topSlope={1,2}/bottomSlope=
// {3,4}/leftSlope={2,4}/rightSlope={1,3}（Tile.cs:292-331）。
///** SolidTileAllowTopSlope（cs:70851）：active && (tileSolid‖380) && ((!platform&&!bottomSlope)‖(platform&&half)) && !inActive */
function solidTileAllowTopSlopeT(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;                       // null tile → true（cs try 语义）
  const i = st.idx(x, y);
  const t = st.type[i]!;
  const sh = sheetOf(t);
  if (st.flags[i] === 0) return false;
  const bottomSlope = st.slope[i] === 3 || st.slope[i] === 4;
  return (vanGenSolidType(t) || sh === 380)
    && ((!PLATFORM_SHEETS.has(sh) && !bottomSlope) || (PLATFORM_SHEETS.has(sh) && st.half[i] === 1))
    && ((st.wire[i] >>> 5) & 1) === 0;
}
/** SolidTileAllowLeftSlope（cs:70871）：active && tileSolid && !half && !rightSlope({1,3}) && !platform */
function solidTileAllowLeftSlopeT(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  if (st.flags[i] === 0) return false;
  const rightSlope = st.slope[i] === 1 || st.slope[i] === 3;
  return vanGenSolidType(t) && st.half[i] === 0 && !rightSlope
    && !PLATFORM_SHEETS.has(sheetOf(t)) && ((st.wire[i] >>> 5) & 1) === 0;
}
/** SolidTileAllowRightSlope（cs:70891）：active && tileSolid && !half && !leftSlope({2,4}) && !platform */
function solidTileAllowRightSlopeT(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  if (st.flags[i] === 0) return false;
  const leftSlope = st.slope[i] === 2 || st.slope[i] === 4;
  return vanGenSolidType(t) && st.half[i] === 0 && !leftSlope
    && !PLATFORM_SHEETS.has(sheetOf(t)) && ((st.wire[i] >>> 5) & 1) === 0;
}

/** ValidAnchorForMultiDirectionalTile（cs:60788）：邻格非空/非巨石/非门 且按方向过
 *  SolidTileAllow*Slope；CheckAndAdjustMultiDirectionalTile（cs:60805）锚优先序
 *  下(0)>左(2)>右(3)>上(1)，命中还须 tileSolid&&!tileSolidTop 复核（平台/桌族不锚）*/
function multiDirAnchor178(st: TileStore, x: number, y: number): number {
  if (!(x >= 2 && y >= 2 && x < st.w - 2 && y < st.h - 2)) return -1;   // InWorld(i,j,2)
  const anchorOk = (ax: number, ay: number, dir: number): boolean => {
    if (!st.inBounds(ax, ay)) return false;
    const k = st.idx(ax, ay);
    const t = st.type[k]!;
    if (t < 0 || isBoulderType(t) || t === DOOR10) return false;
    if (dir === 0) return solidTileAllowTopSlopeT(st, ax, ay);
    if (dir === 1) return solidTileAllowBottomSlope(st, ax, ay);
    if (dir === 2) return solidTileAllowLeftSlopeT(st, ax, ay);
    return solidTileAllowRightSlopeT(st, ax, ay);
  };
  // num=下锚 type / num3=左 / num4=右 / num2=上（ValidAnchor 过了才记 type）
  const probe = (ax: number, ay: number, dir: number): number => {
    if (!st.inBounds(ax, ay)) return -1;
    return anchorOk(ax, ay, dir) ? st.type[st.idx(ax, ay)]! : -1;
  };
  const below = probe(x, y + 1, 1), leftT = probe(x - 1, y, 2);
  const rightT = probe(x + 1, y, 3), up = probe(x, y - 1, 0);
  const solidNS = (t: number): boolean => vanGenSolidType(t) && !SOLID_TOP.has(sheetOf(t));
  if (below >= 0 && solidNS(below)) return 0;
  if (leftT >= 0 && solidNS(leftT)) return 2;
  if (rightT >= 0 && solidNS(rightT)) return 3;
  if (up >= 0 && solidNS(up)) return 1;
  return -1;
}

/** TileFrameImportant case 178（cs:86380-86420）：锚查失败杀；成功且 resetFrame=true 时
 *  Next(3)*18 重掷带基（无论是否越带——num22<0 也已掷），越带才重写 frameY。
 *  ★resetFrame 语义（cs:80924 SquareTileFrame 仅中心 true）：cascade3x3T 九格外环恒
 *  false（零掷）——中心=被杀格自身，杀后失活早退永不派发。故本语境 178 分派
 *  **从不耗掷**（首版误挂成功即掷 → 巨石变体掷流漂移 T138>713 实证后修正）。 */
function check178Gen(st: TileStore, x: number, y: number, rng?: RNG, reset = false): void {
  const i = st.idx(x, y);
  const frameY2 = st.frameY[i]!;
  const dir = multiDirAnchor178(st, x, y);
  if (dir < 0) { killTileWholeCore(st, x, y, rng); return; }
  const num21 = reset && rng ? rng.int(0, 2) * 18 : frameY2 % 54;   // bug-for-bug：C# 负模保号
  let num22 = -1;
  if (dir === 0 && (frameY2 < 0 || frameY2 > 36)) num22 = 0;
  else if (dir === 1 && (frameY2 < 54 || frameY2 > 90)) num22 = 54;
  else if (dir === 2 && (frameY2 < 108 || frameY2 > 144)) num22 = 108;
  else if (dir === 3 && (frameY2 < 162 || frameY2 > 198)) num22 = 162;
  if (num22 > -1) st.frameY[i] = (num22 + num21) as never;
}

/** CheckChest（cs:81400+）1:1：帧锚 2×2 + 完整性（列模 2/行 18 帧位）+ 逐列支撑门
 *  （!active||!tileSolid）——★支撑失败须 Chest.CanDestroyChest（有物箱 false）才
 *  置 flag（SSSSS 补：m20260811 #76 T21>0×8——生成期战利品箱永不塌）。杀除循环
 *  覆盖锚下 2×3 行（cs 原样）只杀 type 匹配格。 */
function checkChestGen(st: TileStore, x: number, y: number, rng?: RNG): void {
  if (destroyObjectT) return;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  let num = Math.trunc(st.frameX[i]! / 18);
  let num2 = y - Math.trunc(st.frameY[i]! / 18);
  while (num > 1) num -= 2;
  num = x - num;
  let flag = false;
  for (let k = num; k <= num + 1; k++) {
    for (let l = num2; l <= num2 + 1; l++) {
      let num3 = -1;
      if (st.inBounds(k, l)) num3 = Math.trunc(st.frameX[st.idx(k, l)]! / 18);
      while (num3 > 1) num3 -= 2;
      const ki = st.idx(k, l);
      if (!st.inBounds(k, l) || !st.flags[ki] || st.type[ki] !== t
        || num3 !== k - num || st.frameY[ki] !== (l - num2) * 18) flag = true;
    }
    const si = st.idx(k, num2 + 2);
    const supBad = !st.inBounds(k, num2 + 2) || !st.flags[si] || !vanGenSolidType(st.type[si]!);
    if (supBad && !(chestItemAnchors && chestItemAnchors.has(num2 * st.w + num))) flag = true;
  }
  if (!flag) return;
  destroyObjectT = true;
  for (let m = num; m <= num + 1; m++) {
    for (let n = num2; n <= num2 + 2; n++) {
      if (!st.inBounds(m, n)) continue;
      const mi = st.idx(m, n);
      if (st.type[mi] === t && st.flags[mi]) killTileWholeCore(st, m, n, rng);
    }
  }
  // Chest.DestroyChest（cs:575+）：注销箱注册表（锚在本块内）
  // ★IIII102c：splice → RemoveChest 置 null 留洞（Chest.cs:126——vanilla 不压缩数组,
  //  槽号即后续 GetPossibleChestsToTrapify 的枚举下标）。
  if (chestList) {
    for (let q = 0; q < chestList.length; q++) {
      const c = chestList[q];
      if (!c) continue;
      if (c.x >= num && c.x <= num + 1 && c.y >= num2 && c.y <= num2 + 2) {
        chestList[q] = null;
        chestItemAnchors?.delete(c.y * st.w + c.x);
      }
    }
  }
  destroyObjectT = false;
}

/** Check2x2（cs:48405-48588）1:1：帧锚（fx/18 wrap +2、fy%36/18）→ 2×2 完整性
 *  （active+type+帧位精确）→ 支撑门（非巨石族逐列 tileSolid||tileTable 且禁半砖；
 *  巨石族=顶格非箱族 且 双底列 !SolidTileAllowBottomSlope）→ flag 则 destroyObject
 *  期杀锚内 type 匹配格。★SSSSS 补（12345 #76 根因②：(1792-1793,617) 残缺滚地
 *  仙人掌 2×2 因 (1792,618) 被沙陷阱直杀 → 完整性破 → 顶行两格碎——旧近似对
 *  残块空转）。 */
function check2x2Gen(st: TileStore, x: number, y: number, rng?: RNG): void {
  if (destroyObjectT) return;                                   // cs:48407
  const i = st.idx(x, y);
  const t = st.type[i]!;
  const boulder = isBoulderType(t);
  let num = 0;
  let num2 = -Math.trunc(st.frameX[i]! / 18);
  if (num2 < -1) { num2 += 2; num = 36; }
  num2 += x;
  // ★IIIII110b 勘误：num3 帧行高按 vanilla ((type==172)?38:36)（cs:48832）——曾恒 36，
  //   172（灯笼）38px 带会被错锚（本批 NO_CHECK 族并入本分派后 172 进入可达面）。
  const num3 = sheetOf(t) === 172 ? 38 : 36;
  const num5 = Math.trunc(st.frameY[i]! / num3);
  const num6 = y - Math.trunc((st.frameY[i]! % num3) / 18);
  let flag = false;
  for (let k = num2; k <= num2 + 1; k++) {
    for (let l = num6; l <= num6 + 1; l++) {
      const ki = st.idx(k, l);
      if (!st.inBounds(k, l) || !st.flags[ki] || st.type[ki] !== t
        || st.frameX[ki] !== (k - num2) * 18 + num
        || st.frameY[ki] !== (l - num6) * 18 + num5 * num3) { flag = true; break; }
    }
    if (!boulder) {
      const si = st.idx(k, num6 + 2);
      const sh2 = st.inBounds(k, num6 + 2) ? sheetOf(st.type[si]!) : -1;
      if (!st.inBounds(k, num6 + 2) || !st.flags[si]
        || (!vanGenSolidType(st.type[si]!) && !TILE_TABLE.has(sh2)) || st.half[si]) flag = true;
    }
  }
  if (boulder) {
    const c1 = st.inBounds(num2, num6 - 1) ? sheetOf(st.type[st.idx(num2, num6 - 1)]!) : 0;
    const c2 = st.inBounds(num2 + 1, num6 - 1) ? sheetOf(st.type[st.idx(num2 + 1, num6 - 1)]!) : 0;
    const chestish = (c: number) => CHEST_SHEETS.has(c) || c === 88 || c === 441 || c === 468 || c === 470 || c === 475;
    if (!chestish(c1) && !chestish(c2)
      && !solidTileAllowBottomSlope(st, num2, num6 + 2) && !solidTileAllowBottomSlope(st, num2 + 1, num6 + 2)) flag = true;
  }
  if (!flag) return;
  // ★IIII111 取证钩（缺省零开销）：Check2x2 判负杀块
  (globalThis as { __swC2Kill?: (x: number, y: number, t: number) => void }).__swC2Kill?.(num2, num6, t);
  destroyObjectT = true;
  for (let k = num2; k <= num2 + 1; k++) {
    for (let l = num6; l <= num6 + 1; l++) {
      if (!st.inBounds(k, l)) continue;
      const ki = st.idx(k, l);
      // ★IIII111 取证钩（缺省零开销）：成员迭代分派记录
      (globalThis as { __swC2It?: (x: number, y: number, hit: boolean) => void }).__swC2It?.(k, l, !!(st.type[ki] === t && st.flags[ki]));
      if (st.type[ki] === t && st.flags[ki]) killTileWholeCore(st, k, l, rng);
    }
  }
  destroyObjectT = false;
  {
    // ★IIII111 取证钩（缺省零开销）：杀块后四格终态（列优先 origin 行序）
    const mem: Array<[number, number, number, number]> = [];
    for (let l = num6; l <= num6 + 1; l++) {
      for (let k = num2; k <= num2 + 1; k++) {
        const ki = st.inBounds(k, l) ? st.idx(k, l) : -1;
        mem.push(ki >= 0 ? [st.type[ki]!, st.flags[ki]!, st.frameX[ki]!, st.frameY[ki]!] : [-1, -1, -1, -1]);
      }
    }
    (globalThis as { __swC2M?: (x: number, y: number, t: number, m: Array<[number, number, number, number]>) => void }).__swC2M?.(num2, num6, t, mem);
  }
}

/** Snow/Ice 与 Sand 支撑族（CheckPile cs:46940-46947——与 Spread.ts 同表副本） */
const PILE_SNOW_OK = new Set([147, 161, 163, 164, 200, 162, 224]);
const PILE_SAND_OK = new Set([53, 112, 116, 234, 397, 398, 402, 399, 396, 400, 403, 401]);

/** CheckPile（cs:46891）type 185 语境（Spread.ts checkPileGen 同构副本，杀尾换
 *  本 pass 全分派级联）：fy==18 → Check2x1；无支撑杀；雪/沙堆支撑类型门。
 *  SSSS 补（m20260811 #76 T0>185 残堆）。杀=零掷（185 尘掷 0 + noItem） */
function checkPileTrap(st: TileStore, x: number, y: number): void {
  const i = st.idx(x, y);
  const fx = st.frameX[i] | 0, fy = st.frameY[i] | 0;
  if (fy === 18) { check2x1Trap(st, x, y); return; }
  if (!solidTileAllowBottomSlope(st, x, y + 1)) { killTileWholeCore(st, x, y); return; }
  const num = Math.trunc(fx / 18);
  if (!st.inBounds(x, y + 1)) return;
  const bi = st.idx(x, y + 1);
  if (!st.flags[bi]) return;
  const below = sheetOf(st.type[bi]!);
  if ((num >= 36 && num <= 47) || (num >= 54 && num <= 59) || (num >= 73 && num <= 76)) {
    const ok = (num >= 36 && num <= 47) ? PILE_SNOW_OK.has(below) : PILE_SAND_OK.has(below);
    if (!ok) killTileWholeCore(st, x, y);
  }
}

/** Check2x1（cs:46979-47371）type 185 语境（Spread.ts check2x1Gen 同构副本）：
 *  2 宽配对完整性 + 支撑双门 + 草地变体转化 + num5 组支撑门 → 失败杀两格。 */
let destroyObjectP2 = false;
function check2x1Trap(st: TileStore, x: number, y: number): void {
  if (destroyObjectP2) return;
  const ii = st.idx(x, y);
  const fx = st.frameX[ii] | 0, fy = st.frameY[ii] | 0;
  let num2 = Math.trunc(fx / 18);
  num2 %= 2;
  const num = x - num2;
  if (!st.inBounds(num, y) || !st.inBounds(num + 1, y)) return;
  let flag = true;
  const iL = st.idx(num, y), iR = st.idx(num + 1, y);
  const fxL = st.frameX[iL] | 0;
  if ((st.frameX[iR] | 0) === fxL + 18
    && sheetOf(st.type[iL]!) === 185 && sheetOf(st.type[iR]!) === 185
    && st.flags[iL] && st.flags[iR]) flag = false;
  if (!solidTileAllowBottomSlope(st, num, y + 1)) flag = true;
  if (!solidTileAllowBottomSlope(st, num + 1, y + 1)) flag = true;
  // 草地变体转化（cs:47058-47065）
  if (st.inBounds(num, y + 1) && st.inBounds(num + 1, y + 1)) {
    const bl = sheetOf(st.type[st.idx(num, y + 1)]!);
    const br = sheetOf(st.type[st.idx(num + 1, y + 1)]!);
    if (fxL >= 1368 && fxL <= 1458 && bl !== 2 && br !== 2 && bl !== 477 && br !== 477 && bl !== 492 && br !== 492) {
      st.frameX[iL] = (fxL - 1368) as never;
      st.frameX[iR] = ((st.frameX[iR] | 0) - 1368) as never;
    }
  }
  const num5 = Math.trunc((st.frameX[iL] | 0) / 36) + (Math.trunc(fy / 18) - 1) * 52;
  for (let j = num; j <= num + 1; j++) {
    if (!st.inBounds(j, y + 1)) continue;
    const bj = st.idx(j, y + 1);
    if (st.flags[bj] && BOULDER_SHEETS.has(sheetOf(st.type[bj]!))) { flag = true; break; }
    if (!st.flags[bj]) continue;
    const bt = sheetOf(st.type[bj]!);
    if (num5 >= 25 && num5 <= 30) {
      if (!PILE_SNOW_OK.has(bt)) flag = true;
    } else if ((num5 >= 41 && num5 <= 46) || (num5 >= 62 && num5 <= 64)) {
      if (!PILE_SAND_OK.has(bt)) flag = true;
    }
  }
  if (!flag) return;
  destroyObjectP2 = true;
  if (sheetOf(st.type[iL]!) === 185 && st.flags[iL]) killTileWholeCore(st, num, y);
  if (sheetOf(st.type[iR]!) === 185 && st.flags[iR]) killTileWholeCore(st, num + 1, y);
  destroyObjectP2 = false;
}
function killObjectAt(st: TileStore, x: number, y: number, rng?: RNG): void {
  const t = st.type[st.idx(x, y)];
  const m = MULTI_DEFS.get(t);
  // ★IIIII99c（jagged #76 定罪修复①）：巨石族（滚地仙人掌 484/石巨石 138 等）禁用
  //   「向后扫同型完整块→整块静默清除」。相邻两具残缺/完整体拼接可形成【chimera
  //   假锚】——golden 实证：L 体 (2419,487)TL 直杀后，成员 (2420,487)TR 自身被
  //   清时其扫描窗 {cols(2420..2421)×rows(487..488)} 覆盖 L-TR/L-BR+R-TL/R-BL 四格
  //   全同型 ⇒ 误判为完整块并连坐抹掉 R 体左列 (2421,487)/(2421,488)（x86 保留！）
  //   ——vanilla 无此盲扫：残缺判收全权在 TileFrame 尾环的 Check2x2（帧象限一致
  //   性内建），故此处退化为仅清自身、交给 cascade3x3T→check2x2Gen 精确分派。
  //   （掷流中性：全族 dustAmount=0 表 KDUST_AMT0_B，级联展开零额外掷。）
  // ★IIIII221（graveyard #76 定罪修复②）：Sign 家族（墓碑 85 等）禁用整块急杀——
  //   vanilla KillTile 只杀单格（尾 type=0），块内其余活格由尾环 TileFrame→CheckSign
  //   完整性组杀（destroyObject 循环）承担；急杀会令级联只见死格 → CheckSign 不触发
  //   → **case 85 尾幽灵掷 Next(8) 丢失**（x86 rc 2169→2170 +1 实证）→ 全 pass 掷流
  //   +1 错位。次序：单杀 setTileSilent(0)（≈vanilla type=0 尾）→ cascade3x3T 环内
  //   SIGN_DISPATCH_SHEETS → 引擎 checkSignSweep（尘掷 10×0 掷中性）。
  if (m && !isBoulderType(t) && !SIGN_DISPATCH_SHEETS.has(sheetOf(t))) {
    for (let ay = y; ay > y - m.h; ay--) {
      for (let ax = x; ax > x - m.w; ax--) {
        let full = true;
        for (let dy = 0; dy < m.h && full; dy++) {
          for (let dx = 0; dx < m.w; dx++) {
            if (!st.inBounds(ax + dx, ay + dy) || st.type[st.idx(ax + dx, ay + dy)] !== t) { full = false; break; }
          }
        }
        if (full) {
          // ★IIII162（sandy #76 巨石变体定罪修复）：vanilla 的整块死亡并非静默清除
          //   ——Check3x2(cs:50081-50092)/Check2x2 等 destroyObject 循环对块内其余
          //   活格【逐格 KillTile】（`type==type && active()` 门），递归格各自跑完整
          //   KillTile 头链，其中 dust 循环（cs:64213-64218 GetTileDustAmount ×
          //   MakeTileDust）是生成期唯一可达掷面（裂缝 481-483/蛛网 51/化石 404/
          //   湿尸 58·230 皆 1×1 专支多格族不可达；再入级联被 destroyObject 头门
          //   压制=零掷）。递归格序=rect 序（x 外 y 内）与 vanilla 一致。
          //   案证：sandy (433,429) 站井穿祭坛 26 锚格 (433,446)——x86 60 掷
          //   （6 格 × dustAmount 默认 10 × fx<54 每掷 1）vs JS 10 掷（仅锚格），
          //   Δ=50 ⇒ 变体五连掷流位错位 ⇒ Next(20) 取值翻转（664↔宠 716）。
          //   终态仍整块清除（陶罐/雕像族金标近似不变），仅补齐其余格 dust 掷账。
          if (rng) {
            for (let ddx = 0; ddx < m.w; ddx++) {
              for (let ddy = 0; ddy < m.h; ddy++) {
                const sx = ax + ddx, sy = ay + ddy;
                if (sx === x && sy === y) continue;      // 锚格 dust 已在 killTileWholeCore 头消费（vanilla 期锚已死被 active() 门跳过）
                if (!st.inBounds(sx, sy)) continue;
                const si = st.idx(sx, sy);
                if (!st.flags[si] || st.type[si] !== t) continue;
                const br = checkBreakabilityT(st, sx, sy);
                if (br === 2) continue;                  // cs:63584 num==2 拒杀（无尘无掷）
                const sh = sheetOf(t);
                const fx = st.frameX[si]!;
                const amt = dustAmount(br === 1, sh, fx);
                for (let k = 0; k < amt; k++) kdustRollsSh(sh, fx, rng);
              }
            }
          }
          for (let dy = 0; dy < m.h; dy++) {
            for (let dx = 0; dx < m.w; dx++) st.setTileSilent(ax + dx, ay + dy, 0);
          }
          return;
        }
      }
    }
  }
  st.setTileSilent(x, y, 0);
}

// ---- 原版实心谓词族（cs:70155/70178/70211；生成期 Main.tileSolid = vanGenSolidType） ----
/** SolidTile（cs:70155）：active && tileSolid && !tileSolidTop && !half && slope==0 && !inActive */
function solidTileV(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !SOLID_TOP.has(sheetOf(t))
    && !st.half[i] && st.slope[i] === 0 && ((st.wire[i] >>> 5) & 1) === 0;
}
/** SolidTile2（cs:70178）：active && tileSolid && slope==0 && !half && !inActive（无 solidTop 位） */
function solidTile2V(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !st.half[i] && st.slope[i] === 0
    && ((st.wire[i] >>> 5) & 1) === 0;
}
/** PlatformProperTopFrame（cs:70197）：帧列号 ∈[0,7]∪[12,16]∪[25,26] */
function platformProperTopFrame(fx: number): boolean {
  const num = Math.floor(fx / 18);
  if ((num < 0 || num > 7) && (num < 12 || num > 16)) {
    if (num >= 25) return num <= 26;
    return false;
  }
  return true;
}
/** SolidTileAllowBottomSlope（cs:70211）：底坡可作地基；越界返回 true（InWorld 门内语义） */
function solidTileAllowBottomSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  if (st.flags[i] === 0) return false;
  const sheet = sheetOf(t);
  const topSlope = st.slope[i] === 1 || st.slope[i] === 2;
  return (vanGenSolidType(t) || SOLID_TOP.has(sheet))
    && (!topSlope || (PLATFORM_SHEETS.has(sheet) && platformProperTopFrame(st.frameX[i]!)))
    && !st.half[i] && ((st.wire[i] >>> 5) & 1) === 0;
}

/** IsTileNearby（cs:8828）：±distance 盒内找 active 同型格（type≠235 时步长 1） */
function isTileNearby(st: TileStore, x: number, y: number, sheet: number, distance: number): boolean {
  const target = sheetId(sheet);
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      if (st.flags[ii] && st.type[ii] === target) return true;
    }
  }
  return false;
}
/** AreAnyTilesInSetNearby（cs:8753）：±distance 盒内找集合内 active 格 */
function anyBoulderNearby(st: TileStore, x: number, y: number, distance: number): boolean {
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      if (st.flags[ii] && isBoulderType(st.type[ii])) return true;
    }
  }
  return false;
}
/** closeEnoughToSpidersToSpawnSpiderBoulder（cs:8796）：±80 步 3 扫墙 62 */
function closeSpiders(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 80; i <= x + 80; i += 3) {
    for (let j = y - 80; j <= y + 80; j += 3) {
      if (st.inBounds(i, j) && st.wall[st.idx(i, j)] === 62) return true;
    }
  }
  return false;
}
/** closeEnoughToDungeonToSpawnGhoulder（cs:8772）：地牢侧门 + ±1000 步 10 扫地牢墙 */
function closeDungeon(st: TileStore, x: number, y: number, side: number): boolean {
  if (side <= -1 && x > st.w / 2) return false;
  if (side >= 1 && x < st.w / 2) return false;
  for (let i = x - 1000; i <= x + 1000; i += 10) {
    for (let j = y - 1000; j <= y + 1000; j += 10) {
      if (st.inBounds(i, j) && WALL_DUNGEON.has(st.wall[st.idx(i, j)])) return true;
    }
  }
  return false;
}
/** closeEnoughToLavaToSpawnLavaBoulder（cs:8812）：±60 步 3 扫岩浆 */
function closeLava(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 60; i <= x + 60; i += 3) {
    for (let j = y - 60; j <= y + 60; j += 3) {
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) return true;
    }
  }
  return false;
}

/** L 形布线（先 x 后 y；cs:9124-9147 同构） */
function lWire(st: TileStore, x0: number, y0: number, x1: number, y1: number): void {
  let wx = x0, wy = y0;
  while (wx !== x1 || wy !== y1) {
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
    if (wx > x1) wx--; else if (wx < x1) wx++;
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
    if (wy > y1) wy--; else if (wy < y1) wy++;
    st.wire[st.idx(wx, wy)] |= WIRE_RED;
  }
}

/** PlaceTile(i,j,135,style)（Place1x1 cs:45194：InWorld2 + 地基 SolidTile2 + 本格须空 +
 *  机关×巨石底座互斥门）。门不过=无板（无掷骰副作用——style 已由调用方掷）。
 *  ★SSSSSS：补 Place1x1 的 IsAMechanism×Boulders 底座拒（cs:45213）——trap 调用点
 *  前置 CanGeneratePressurePlateAt 已拒巨石底座（行为中性），FinishNoTraps (B) 的
 *  随机板支无前置门（巨石世界必需）。导出供 FinishNoTrapsPass 复用。
 *  ★IIII10（2026-08-28）notraps #76 定罪修复：case 135 尾 SquareTileFrame(i,j)
 *  （cs:60621-60622 分派表 `{36,135,141,...}` Place1x1 后缀——此前只做了
 *  「失活格清 half/slope」半个 TileFrame 头，**活性格帧分派整环缺失**。实证：
 *  notraps g2953 板(1653,604) 落板级联 TileFrame(1654,605) → Check2x2 锚反解
 *  (fx18 wrap 取 (1653,605)) 完整性破 → 残缺滚地仙人掌右列双格 destroyObject
 *  （x86 KLOG K2750659 两格帧 18,0/18,18 + dump075→076 该对翻实证）；缺失时残
 *  仙人掌 (1654,606) 存活 → g3002 attempt278 九格 nactive 门拒收 → 主循环断点
 *  位移 → 全带 TNT 桶/飞镖投影漂移。复用 killTileWholeCore 尾的同一张
 *  SquareTileFrame 分派器（SSSSS 批真分派家族），掷流语义与原版逐支同构；
 *  非 1457 特有语义、无版本门。 */
export function placePlate(st: TileStore, x: number, y: number, style: number, rng?: RNG): boolean {
  if (x < 2 || y < 2 || x > st.w - 3 || y > st.h - 3) return false;   // InWorld(x,y,2)
  placeHeadMirrorT(st, x, y, 135);                                    // ★III13 PlaceTile 头半砖双支（135 可覆盖门恒过）
  if (st.flags[st.idx(x, y)] !== 0) return false;                     // Place1x1 !tile.active()
  if (!solidTile2V(st, x, y + 1)) return false;
  if (isBoulderType(st.type[st.idx(x, y + 1)]!)) return false;        // cs:45213 机关×巨石底座
  st.setTileSilent(x, y, PLATE, 0, style * 18);
  const i = st.idx(x, y);
  st.half[i] = 0; st.slope[i] = 0;                                    // PlaceTile 前奏 Clear（cs:59497）
  // case 135 尾 SquareTileFrame(i,j)（cs:60162-60163）全环分派（含中心 Check1x1）
  //   ——失活格清 half/slope/块漆（TileFrame cs:82077-82082）；活性格按族转派
  //   （165 钟乳石/178 宝石籽/Check1x1/CheckChest/Check2x2/185 堆/MULTI_DEFS 兜底），
  //   与 KillTile 尾同构。PPPP 补（曾缺失活清 → (3952,861) 板邻失活残坡存活）+
  //   IIII10 补活性分派（如上注）。★rng 必传：分派体内的钟乳石样式掷/尘掷等
  //   在原版同样消耗 genRand（与 KillTile 尾全链同基准）。★multiFallback=false：
  //   MULTI_DEFS 兜底支是「任一格破坏=整块移除」的地基支撑近似（陶罐/雕像族金标
  //   实证），但墙面挂件（画 240-246/旗 91 等）的真实分派在原版走 CheckBanner/
  //   TileObjectData 锚系（墙面悬挂语义），地板支撑近似会误杀 → 板尾新开环先不
  //   走兜底支（IIII10 实证：notraps g3003+ 段 T240>0×9/T91>0×9 误杀漂移）。 */
  if (!i13Legacy()) cascade3x3T(st, x, y, rng, false);  // ★IIII10 case135 尾 SquareTileFrame（LEGACY=1 回退至 IIII10 前）
  return true;
}

/** placeTrap_CanContinue（1457 WorldGen.cs:8859 新增 helper）：wall 350（微光
 *  保护墙）拒 + dualDungeons 秘密种子的潜在地牢界拒。★1457 在 placeTrap 共
 *  9 处调用（入口/下落扫描/飞镖左右扫/巨石 6×6/炸药下落+5×5/热喷泉锚+底双列）
 *  ——1456 的 noTraps 巨石检查块在 1457 已不在本方法（本仓 noTraps 巨石支线
 *  未实装,无对应块可迁,备案）。 */
export function placeTrapCanContinue(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;   // 防御（原版各调用点已先 InWorld 短路）
  if (st.wall[st.idx(x, y)] === 350) return false;
  // ★dungeon-1457 批接线（WorldGen.cs:8865）：`SecretSeed.dualDungeons.Enabled &&
  //   !GenVars.DualDungeon_AllowTrapGenerationInDungeon && InAnyPotentialDungeonBounds`
  //   → 拒。界拒门三因子由 DungeonStyles1457.placeTrapDualDungeonReject 承载：
  //   普通世界 dualDungeons=false → 首因子假恒不拒（=1456 行为,零扰动）；
  //   双地牢世界 Dungeon pass 的 dgTraps 窗口开/关还原原版放行时序。
  if (placeTrapDualDungeonReject(x, y)) return false;
  return true;
}

/** placeTrap 主体（cs:8875-9460，普通种子路径）。type: 0 飞镖 / 1 巨石 / 2 炸药桶 / 3 热喷泉 */
export function placeTrap(st: TileStore, rng: RNG, gs: GenState, x2: number, y2: number, type = -1): boolean {
  trapEv('E', x2, y2, type);
  // ★R3-10（W57:8876-8879；1456 :8878-8881 同有——存量缺口非 1457 增量）：
  //  "moretrapsplease"（actuallyNoTrapsForRealIMeanIt）种子下陷阱全免,入口即
  //  return true（把"没放"当"放成功",防调用方重试）——先于 CanContinue
  if (gs.seedFlags.actuallyNoTraps) return true;
  // ★1457 入口门（cs:8880）：CanContinue 先于微光回避
  if (!placeTrapCanContinue(st, x2, y2)) return false;
  // 微光回避（cs:8884，用原始 y2 掷点）：距 shimmerPosition <100 拒（未生成时 (0,0)）
  const shx = gs.shimmerX >= 0 ? gs.shimmerX : 0, shy = gs.shimmerY >= 0 ? gs.shimmerY : 0;
  if (Math.hypot(x2 - shx, y2 - shy) < 100) return false;
  // ★noTraps 巨石非实心窗 #1（cs:8892-8894）：下扫前 SetBoulderSolidity(false)
  const nf = gs.seedFlags;
  if (nf.noTraps) setBoulderSolidity(false);
  // 下扫实心地面（cs:8894-8905）
  let py = y2;
  let deep = false;
  while (!solidTileV(st, x2, py)) {
    py++;
    if (py > st.h - 10) return false;
    // ★1457 下落扫描内同门（cs:8902）
    if (!placeTrapCanContinue(st, x2, py)) return false;
    if (py >= st.h - 300) deep = true;
  }
  // ★noTraps 巨石非实心窗 #2（cs:8908-8910）：下扫毕还原实心
  if (nf.noTraps) setBoulderSolidity(true);
  py--;                                                               // cs:8910 num--
  trapEv('D', 0, py, 0);
  // 邻蘑菇草 70 回避（cs:8911 IsTileNearby ±20；★noTraps 跳过）/ 蜥蜴墙 87（cs:8915）/ 微光墙 350（cs:8919）
  if (!nf.noTraps && isTileNearby(st, x2, py, 70, 20)) return false;
  const wi = st.idx(x2, py);
  if (st.wall[wi] === 87) return false;
  if (st.wall[wi] === 350) return false;
  const lava = st.liquid[wi] > 0 && st.liquidType[wi] === 2;          // cs:8923
  // type 随机（cs:8929-8940 remix 分支 / cs:8942-8957 普通（非 remix）分支）。
  // ★IIIII196（2026-09-03）REMIX #76 定罪修复：**remix 分支整缺**——1457/1458 cs:8929-8940
  //   （1456 cs:8927 同形）：Main.remixWorld 时热喷泉条件=(double)num < Main.rockLayer - 30.0
  //   且 Next(3)!=0（2/3 概率）；非 remix=num > GenVars.lavaLine + 30 且 Next(6)!=0（5/6）。
  //   JS 曾恒走非 remix 支 → remix 链 #76 陷阱 type 分布全异 → 掷流自首支起整体漂移
  //   （T0>443×208 JS 多放喷泉/T1>59×193+T25>1 巨石 6×6 转石域错位/T397>53…沙穴错位）。
  //   短路序照抄：rockLayer 条件假时 Next(3) 不耗（直落 Next(2)）。
  //   remix 分支**无** tenth+noTraps 强制巨石尾掷（cs:8957-8961 在 else 内）。
  if (nf.remix) {
    if (type === -1 && rng.int(0, 19) === 0) type = 2;
    else if (type === -1 && py < gs.rockLevel - 30 && rng.int(0, 2) !== 0) type = 3;
    else if (type === -1) type = rng.int(0, 1);
  } else {
    if (type === -1 && rng.int(0, 19) === 0) type = 2;
    else if (type === -1 && py > gs.lavaLine + 30 && rng.int(0, 5) !== 0) type = 3;
    else if (type === -1) type = rng.int(0, 1);
    // ★noTraps+tenth 强制巨石（cs:8957-8961）：Next(4)==0 → type=1（掷照耗；remix 分支无此掷）
    if (nf.noTraps && nf.tenthAnniversary && rng.int(0, 3) === 0) type = 1;
  }
  trapEv('T', 0, py, type);
  // 共同守卫（cs:8961-8985）
  if (x2 < 3 || py < 3 || x2 > st.w - 4 || py > st.h - 4) return false;   // InWorld(x2,num,3)
  if (lava && type !== 3) return false;
  if (deep && type !== 3) return false;
  for (const [ax, ay] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]] as const) {
    // ★FFFFFFF 批：nactive()==(sTileHeader&0x60)==32 = active 且【非致动隐身位】
    //   （Tile.cs:242-249/591-618）——旧实现只看 flags 漏 inActive 维度，与
    //   solidTileAllowBottomSlope(:647-656) 已有的同位判定不一致。
    const ni = st.idx(x2 + ax, py + ay);
    if (st.flags[ni] && ((st.wire[ni] >>> 5) & 1) === 0) return false;  // cs:8973 nactive 九格  // cs:8973 nactive 九格
  }
  {
    const below = st.idx(x2, py + 1);
    if (st.flags[below] && (st.type[below] === SPIKE48 || st.type[below] === WSPIKE232)) return false;  // cs:8977
  }
  // CanGeneratePressurePlateAt（cs:11044-11064）
  {
    const gi = st.idx(x2, py + 1);
    if (!solidTileAllowBottomSlope(st, x2, py + 1)) return false;
    if (st.type[gi] >= 0 && isBoulderType(st.type[gi])) return false;
    if (st.wall[gi] === 350) return false;
  }
  // 冰雪退化（cs:8986-8998）：type1 压板 ±3 内有雪 147/冰 161 → 降级飞镖
  if (type === 1) {
    for (let i = x2 - 3; i <= x2 + 3; i++) {
      for (let j = py - 3; j <= py + 3; j++) {
        if (!st.inBounds(i, j)) continue;
        const ii = st.idx(i, j);
        if (st.flags[ii] && (st.type[ii] === SNOW147 || st.type[ii] === ICE161)) { type = 0; }
      }
    }
  }
  // ★noTraps 巨石非实心窗 #3（cs:9005-9007）：switch 前再翻非实心（case 0/3 的
  //   各 return false/true 路径保持非实心逸出；case 1 头部/尾门翻回实心）
  if (nf.noTraps) setBoulderSolidity(false);

  if (type === 1) {
    trapEv('K', 1, 0, 0);
    // ---- 巨石陷阱（cs:9151-9345）----
    // ★noTraps（cs:9159-9162）：宠物巨石上限 ×2 + SetBoulderSolidity(true)
    //   （6×6 扫描期巨石算实心——SolidTile 判定进 allSolid/石壳统计）
    const petBase = st.w >= 8400 ? 6 : st.w >= 6400 ? 4 : 2;          // GetWorldSize 三档（cs:9153）
    const petCap = nf.noTraps ? petBase * 2 : petBase;
    if (nf.noTraps) setBoulderSolidity(true);
    let colX = x2 + rng.int(-1, 1);                                   // num4（cs:9166 Next(-1,2)）
    let top = py - 8;                                                 // num5（cs:9165）
    trapEv('BXC', colX, top, 0);
    // ★MMMMMMM（2026-08-25）#76 定罪修复（双态门）：巨石支受理门两版真分叉——
    //   1456（cs:9171-9183）= 邻巨石检查**前置**（初始 top=num-8 位,noTraps 半径6/普通10）
    //   + 扫描逐格拒 wall350、无 actuator/巨石拒;
    //   1457（cs:9181-9237）= 无前置门 + 扫描逐格拒 **actuator∪Boulders**（wall350 移入
    //   CanContinue）+ 邻巨石检查后置到 chest IsTileNearby 之后。JS 曾按 1456 形恒跑
    //   → SW_MB_1457=1 下扫窗内有巨石/致动器时 vanilla 拒而 JS 受理,g/s22222 两链
    //   #76 沙穴带级联位移（g 链掷流对拍 @41741 实锤:JS 多走进变体四连掷）。
    const dg1457 = hfIs1457();
    if (!dg1457 && anyBoulderNearby(st, colX, top, nf.noTraps ? 6 : 10)) return false;   // 1456 前置门
    for (;;) {
      let allSolid = true, n2 = 0;
      for (let m = colX - 2; m <= colX + 3; m++) {
        for (let n = top; n <= top + 3; n++) {
          if (!solidTileV(st, m, n)) allSolid = false;
          // ★1457 cs:9187 巨石 6×6 扫描逐格同门（先 SolidTile 后 CanContinue 短路序同原版）
          if (!placeTrapCanContinue(st, m, n)) return false;
          const ii = st.idx(m, n);
          if (st.flags[ii]) {
            const sh = sheetOf(st.type[ii]!);
            if (sh === 226 || TILE_DUNGEON.has(sh)) return false;     // cs(两版同): 神庙砖/地牢砖
            if (dg1457) {
              // 1457 cs:9196-9198：actuator ∪ Boulders 逐格拒（wall350 已由 CanContinue 承载）
              if ((st.wire[ii] & TileStore.WIRE_ACTUATOR) !== 0 || isBoulderType(st.type[ii]!)) return false;
            } else {
              if (st.wall[ii] === 350) return false;                  // 1456 cs:9200 原位 wall350 拒
            }
            if (sh === 0 || sh === 1 || sh === 59) n2++;              // cs:9204 泥/石/泥块
          }
        }
      }
      top--;
      if (top < gs.worldSurface) return false;                        // cs:9212
      if (allSolid && n2 > 2) break;
    }
    if (py - top <= 5 || py - top >= 40) return false;                // cs:9222
    if (isTileNearby(st, colX, top, 21, 4) || isTileNearby(st, colX, top, 467, 4)) return false;  // cs:9227
    // 1457 后置邻巨石门（cs:9229-9237）：收敛后的 top 位判定；半径 noTraps?6:10 保持
    if (dg1457 && anyBoulderNearby(st, colX, top, nf.noTraps ? 6 : 10)) return false;
    // 掏 2 宽竖井 top..py（cs:9232-9240；379 免杀）。★PPPP 定罪修正：井杀对巨石
    //   **照杀**（vanilla type!=379 门无巨石豁免）——巨石的存活语义在 KillTile 尾
    //   SquareTileFrame→TileFrame→Check2x2(48405) 的 2×2 完整性级联：井杀先杀巨石
    //   一格 → 邻格帧检完整性破 → 整块 KillTile。site(2021/2024,613) 双陷阱实证
    //   （golden 序=B(x2=2024,colX=2023) 先置石 → A(x2=2021,colX=2022) 后井穿杀 B 石
    //   → A 石落 (2022-2023,581-582)=终态金标）：曾按"EE 免杀"误豁免 → B 石错存、
    //   A 被占位 → 接受序假象。killTileWhole 直接命中=整块移除同构该级联终态。
    trapEv('BS', 0, top, 0);                                          // ★IIII162 井杀前相标（x86 BSCAN 同位）
    for (let xx = colX; xx <= colX + 1; xx++) {
      for (let yy = top; yy <= py; yy++) {
        const ii = st.idx(xx, yy);
        if (st.type[ii] !== SHEET379) { trapEv('BKI', xx, yy, sheetOf(st.type[ii])); killTileWhole(st, xx, yy, rng); }
      }
    }
    trapEv('BK', 0, 0, 0);                                            // ★IIII162 井杀后（x86 BKILL 同位）
    // 6×6 实心转石头（cs:9242-9250 直写 .type=1：保半砖/坡/帧，无巨石豁免——
    //   被井杀后的巨石格已非实心自然跳过）
    for (let xx = colX - 2; xx <= colX + 3; xx++) {
      for (let yy = top - 2; yy <= top + 3; yy++) {
        if (solidTileV(st, xx, yy)) {
          const ii = st.idx(xx, yy);
          st.type[ii] = STONE1; st.flags[ii] = 1;
        }
      }
    }
    trapEv('BSt', 0, 0, 0);                                           // ★IIII162 转石后（x86 BSTONE 同位）
    placePlate(st, x2, py, 7);                                        // cs:9252 style7
    trapEv('BP', 0, 0, 0);                                            // ★IIII162 板后（x86 BPLATE 同位）
    // cs:9253-9254 两块石头（PlaceTile forced=false：EmptyTile 门，非空格不写）。
    // ★GGGGGGGG2-D 实证备裁：PlaceTile 尾 SquareTileFrame→TileFrame 的合并族帧号
    //   Next(0,3)（cs:82985）在 generatingWorld 下被整段跳过（cs:82659
    //   `!generatingWorld` 门包住 TileFrameCosmetic）——生成期零掷，勿补掷。
    if (!st.flags[st.idx(colX, top + 2)]) st.setTileSilent(colX, top + 2, STONE1);
    if (!st.flags[st.idx(colX + 1, top + 2)]) st.setTileSilent(colX + 1, top + 2, STONE1);
    trapEv('B2', 0, 0, 0);                                            // ★IIII162 双石后（x86 BST2 同位）
    // 巨石变体掷（cs:9255-9306）。★SSSSSS-NOTRAPS：maxValue2/3/4（蛛/岩浆/地牢
    //   巨石分母）noTraps 时 1/2/4（普通 2/6/3）；maxValue（tenth 彩虹分母）
    //   noTraps&&!remix 时 5（普通 7）；新增 712 便便支（ntb||noTraps||poo 1/5）与
    //   664 支（(tenth||noTraps) 1/3）——掷序逐支照抄（分母命中后才判 close*）。
    let boulderId = BOULDER138;
    const maxValue2 = nf.noTraps ? 1 : 2;
    const maxValue3 = nf.noTraps ? 2 : 3;
    const maxValue4 = nf.noTraps ? 4 : 6;
    const maxValue = nf.noTraps && !nf.remix ? 5 : 7;
    // ★IIII162（sandy #76 定罪仪）：变体八支逐掷旁路记账（vroll 与 rng.int 同参调用，
    //   消费序不变；__swTrapEv 未注册时 trapEv 零开销）。
    const vroll = (k: number, max: number): number => { const r = rng.int(0, max - 1); trapEv(`V${k}`, r, max, 0); return r; };
    if (vroll(1, maxValue2) === 0 && closeSpiders(st, colX, top)) boulderId = BOULDER714;
    else if (vroll(2, maxValue4) === 0 && closeDungeon(st, colX, top, gs.dungeonSide)) boulderId = BOULDER715;
    else if (vroll(3, maxValue3) === 0 && closeLava(st, colX, top)) boulderId = BOULDER713;
    else if ((nf.notTheBees || nf.noTraps || nf.pooEverywhere) && vroll(4, 5) === 0) boulderId = BOULDER712;
    else if (nf.tenthAnniversary && vroll(5, maxValue) === 0) boulderId = BOULDER711;
    else if ((nf.tenthAnniversary || nf.noTraps) && vroll(6, 3) === 0) boulderId = BOULDER664;
    else if (vroll(7, 25) === 0) boulderId = BOULDER711;
    else if (vroll(8, 20) === 0) boulderId = BOULDER664;
    if (boulderId === BOULDER138 && boulderPetsPlaced < petCap) { boulderPetsPlaced++; boulderId = BOULDER716; }
    trapEv('PET', boulderPetsPlaced, petCap, 0);
    trapEv('VID', sheetOf(boulderId), top, colX);
    {
      // ★cs:9307 反编译印 PlaceTile(num4+1, num5+1)，x86 金标实证锚=(num4, num5)
      //   （site 对账：(533,603) 板/num4=532/num5=579 → 巨石 532-533×579-580；
      //   井/壳/栅行界全按 num5 直读对齐，仅此锚差 (-1,-1)）。
      //   ★空置门：巨石 2×2 目标格任一 active 即整写放弃（保留井/栅/板/线，仍
      //   return true）——golden 双站点实证：site(878..882,729..734) A/B 双陷阱各自
      //   落石（无重叠）；site(2022..2024,581) B 陷阱 2×2 与先置 A 石重叠 → 只留
      //   板(2024,613)+井杀列。反编译 Place2x2 的 (x-1..x)×(y-1..y) 门与两站均
      //   矛盾（门格恒活却仍落石），以金标为准取目标格判定。
      const bx = colX, by = top;
      let blocked = false;
      for (let gx = bx; gx <= bx + 1; gx++) {
        for (let gy = by; gy <= by + 1; gy++) {
          if (st.inBounds(gx, gy) && st.flags[st.idx(gx, gy)]) blocked = true;
        }
      }
      if (!blocked) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) st.setTileSilent(bx + dx, by + dy, boulderId, dx * 18, dy * 18);
        }
      }
    }
    // 2×3 致动石栅（cs:9308-9319：石头+红线+致动器）
    top += 2;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const gx = colX + dx, gy = top + dy;
        // PlaceTile(1, forced=false) EmptyTile 门：巨石占格不覆盖石头（线/致动仍写）
        if (!st.flags[st.idx(gx, gy)]) st.setTileSilent(gx, gy, STONE1);
        st.wire[st.idx(gx, gy)] |= WIRE_RED | WIRE_ACTUATOR;
      }
    }
    lWire(st, x2, py, colX, top);                                     // cs:9320-9343
    return true;
  }

  if (type === 2) {
    trapEv('K', 2, 0, 0);
    // ---- 炸药桶（cs:9347-9413）——★原版 case2 落穿 switch 尾 return false（放置成功
    //   也返回 false→内层 1150 循环不 break，bug-for-bug 保留）----
    const drop = rng.int(4, 6);
    const bx = x2 + rng.int(-1, 1);
    let by = py;
    for (let k = 0; k < drop; k++) {
      by++;
      // ★1457 cs:9368：InWorld(5)+SolidTile+CanContinue 三联（原版序短路）
      if (!st.inBounds(bx, by) || !solidTileV(st, bx, by) || !placeTrapCanContinue(st, bx, by)) return false;
    }
    for (let xx = bx - 2; xx <= bx + 2; xx++) {
      for (let yy = by - 2; yy <= by + 2; yy++) {
        // ★1457 cs:9378：`!InWorld || !SolidTile || !CanContinue` 三联——界外格
        //   从 1456 的「跳过」改为「整处拒」（wall350 检查并入 CanContinue）
        if (!st.inBounds(xx, yy) || !solidTileV(st, xx, yy) || !placeTrapCanContinue(st, xx, yy)) return false;
      }
    }
    killTileWhole(st, bx, by, rng);                                        // KillTile（cs:9382，清半砖/坡）
    placeHeadMirrorT(st, bx, by, 141);                               // ★III13 炸药桶写位头变异（141）
    st.setTileSilent(bx, by, EXPLOSIVES, 0, rng.int(0, 1) * 18);      // cs:9383-9386
    placePlate(st, x2, py, rng.int(2, 3));                            // cs:9387
    lWire(st, x2, py, bx, by);
    // ★noTraps（cs:9457-9460）：switch 尾门（case2 break 落此处）——还原巨石实心
    if (nf.noTraps) setBoulderSolidity(true);
    return false;                                                     // cs:9413 break → 9459 return false
  }

  if (type === 3) {
    trapEv('K', 3, 0, 0);
    // ---- 热喷泉（cs:9415-9452）：2×1，frameX = 18*k + 36*Next(2)；直写保半砖/坡 ----
    if (st.flags[st.idx(x2 + 1, py)]) return false;
    if (st.liquid[st.idx(x2, py)] > 0 && st.liquidType[st.idx(x2, py)] !== 2) return false;   // cs:9421 非岩浆液体拒
    // ★noTraps+(tenth||ntb)（cs:9425-9433）：1/3 概率拒 + 邻热喷泉 443 ±30 回避
    if (nf.noTraps && (nf.tenthAnniversary || nf.notTheBees)) {
      if (rng.int(0, 2) !== 0) return false;
      if (isTileNearby(st, x2, py, 443, 30)) return false;
    }
    // ★1457 cs:9428 锚格同门
    if (!placeTrapCanContinue(st, x2, py)) return false;
    for (let xx = x2; xx <= x2 + 1; xx++) {
      // ★1457 cs:9446 底双列 InWorld(5)+SolidTile+CanContinue 三联
      if (!st.inBounds(xx, py + 1) || !solidTileV(st, xx, py + 1) || !placeTrapCanContinue(st, xx, py + 1)) return false;
    }
    const fx = rng.int(0, 1);
    for (let k = 0; k < 2; k++) {
      placeHeadMirrorT(st, x2 + k, py, 443);                         // ★III13 喷泉写位头变异（443）
      st.setTileSilent(x2 + k, py, GEYSER, 18 * k + 36 * fx, 0);
    }
    return true;
  }

  // ---- type 0 飞镖（cs:9009-9150）----
  trapEv('K', 0, 0, 0);
  const j2 = py - rng.int(0, 2);                                      // num27（cs:9013）
  const solidFor = (x: number, y: number) => solidTileV(st, x, y)
    || (st.inBounds(x, y) && st.flags[st.idx(x, y)] && isCracked(st.type[st.idx(x, y)]));
  let i1 = x2;
  while (!solidFor(i1, j2)) { i1--; if (i1 < 0 || !placeTrapCanContinue(st, i1, j2)) return false; }   // ★1457 cs:9022 同门
  const i2 = i1;
  let i3 = x2;
  // ★1457 cs:9033：`num10 >= maxTilesX`（1456 是 `>`）+ 同门——右扫恰达世界右缘也拒
  while (!solidFor(i3, j2)) { i3++; if (i3 >= st.w || !placeTrapCanContinue(st, i3, j2)) return false; }
  const i4 = i3;
  let f3 = x2 - i2 > 5 && x2 - i2 < 50;
  let f4 = i4 - x2 > 5 && i4 - x2 < 50;
  if (f3 && !solidTileV(st, i2, j2 + 1)) f3 = false;
  if (f4 && !solidTileV(st, i4, j2 + 1)) f4 = false;
  const badAnchor = (t: number) => t === DOOR10 || t === SPIKE48;
  if (f3 && (badAnchor(st.type[st.idx(i2, j2)]) || badAnchor(st.type[st.idx(i2, j2 + 1)]))) f3 = false;
  if (f4 && (badAnchor(st.type[st.idx(i4, j2)]) || badAnchor(st.type[st.idx(i4, j2 + 1)]))) f4 = false;
  let i5: number, dir: number;
  if (f3 && f4) {
    dir = 1; i5 = i2;
    if (rng.int(0, 1) === 0) { i5 = i4; dir = -1; }
  } else if (f4) { i5 = i4; dir = -1; }
  else if (f3) { i5 = i2; dir = 1; }
  else return false;
  if (st.type[st.idx(i5, j2)] === GLOW190) return false;              // cs:9087
  if (st.wall[st.idx(i5, j2)] === 350) return false;                  // cs:9092
  placePlate(st, x2, py, st.wall[st.idx(x2, py)] > 0 ? 2 : rng.int(2, 3));   // cs:9097-9104
  killTileWhole(st, i5, j2, rng);                                          // KillTile（cs:9105，整块语义）
  // ★ntb+noTraps（cs:9106-9114）：蜂蜜飞镖变体 num33（掷照耗，液体邻格强制 1；
  //   dontStarve 染 27 未建模——旗标不叠加场景）。style→frameY=18*num33。
  let num33 = 0;
  if (nf.notTheBees && nf.noTraps && !nf.remix) {
    num33 = rng.int(1, 2);                                              // Next(1,3)
    const wet = (x: number) => st.liquid[st.idx(x, j2)] > 0;
    if (wet(i5) || wet(i5 - 1) || wet(i5 + 1)) num33 = 1;
  }
  placeHeadMirrorT(st, i5, j2, 137);                                 // ★III13 镖身写位头变异（137 非实心）
  st.setTileSilent(i5, j2, TRAP137, dir === 1 ? 18 : 0, 18 * num33);  // cs:9115（frameY=18*style）
  // ★IIII162（sandy #76 定罪修复③）：vanilla PlaceTile 对一切成功放置尾调
  //   SquareTileFrame(i, j)（cs:60992 `if (tile.active()) { ...; SquareTileFrame(i, j); }`
  //   ——137 落 default 臂无 per-type 级联但走本通用尾）⇒ 飞镖写格尾环 3×3
  //   TileFrame 触邻树帧检 → CheckTree 断基整树坍塌（sandy (3636,440) 井穿案：
  //   dart 格=树基丛林草 60（KillTile 被 IsATreeTrunk 帧门拒杀）→ 镖写格后树
  //   440..446+3637,446 八格经尾环坍塌，x86 KLOG ln26661 全录）。JS setTileSilent
  //   漏尾环 ⇒ 树 8 格存活（mile8 #76 唯一残差）。树族尘掷全零档 ⇒ 掷流中性。
  cascade3x3T(st, i5, j2, rng);
  trapEv('DTW', num33, dir, 0);
  lWire(st, x2, py, i5, j2);
  return true;
}

/** ★III13 批（C 项定罪落地）：PlaceTile 头半砖双支镜像（cs:60111-60122）。
 *  vanilla 的 PlaceTile 对一切非实心/可覆盖 num 在门后先做锚格头变异：
 *  ①ghost 锚（!active）→ tile.Clear(Tile|TilePaint|Slope)=half/slope/paint 清零；
 *  ②active 非 frameImportant 锚 → ResetsHalfBrickPlacementAttempt[num] 分支
 *    （SetFactory.CreateBoolSet(**defaultState:true**,豁免表)＝**除豁免表外恒真**，
 *    TileID.cs:181）→ halfBrick(false)+frameX/Y=0。
 *  rig HalfEv 实证：traps 窗内 PTreset_n654×7374 / n105×23500 / n349 / n137 /
 *  n656——即桶/镖/雕像等一切放置尝试均会清锚半砖（含后续放置被拒的场合）；
 *  残差 H0>1×43 全部由此族在 X 侧落清位写、J 端无对应行为 ⇒ 补本镜像。
 *  触点=TrapsPass 内 vanilla 经 WorldGen.PlaceTile 放置的每个非实心写位：
 *  plate(135)/dart(137)/explosive(141)/geyser(443)/barrel(654)。石头(type1)
 *  直填走 EmptyTile 门恒 ghost ⇒ 不触此支，勿挂。 */
const RESETS_HALF_EXEMPT_SHEETS = new Set([2, 23, 661, 60, 70, 199, 662, 109, 477, 492, 179, 512,
  180, 513, 181, 514, 182, 515, 183, 516, 381, 517, 534, 535, 536, 537, 539, 540, 625, 626, 627, 628, 633]);
function placeHeadMirrorT(st: TileStore, x: number, y: number, tag?: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) {
    tntProbe(`P${tag ?? 0} ${x} ${y} ghost h${st.half[i]} s${st.slope[i]} f${st.frameX[i]},${st.frameY[i]} c`);
    // ★IIIII212：补全 Clear(Tile|TilePaint|Slope) 全语义（Tile.cs:746-760）——
    //   Tile 分支除 active=false 外还清 **type=0 + frameX=0 + frameY=0**（残值 type
    //   归零），TilePaint 分支 = ClearBlockPaintAndCoating（块漆+涂层双清）。曾只清
    //   half/slope/paint ⇒ ghost 锚残值 type 存活，下游 rawSheetAt（cs:18989 等
    //   不查 active 的直读族）命中判定与 vanilla 分叉（Piles 域写面债源之一）。
    st.type[i] = 0; st.frameX[i] = 0 as never; st.frameY[i] = 0 as never;
    st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0; st.coat[i] = 0;    // Clear(Tile|TilePaint|Slope)
    return;
  }
  // ★IIII29 定罪修复③（notraps #76 Hf10 家族 / 半砖清除债）：vanilla 头重排支
  //   cs:60113-60121 = `ResetsHalfBrickPlacementAttempt[num]（num=放置类型！）
  //   && (!tile.active() || !Main.tileFrameImportant[tile.type（既有类型！）])`。
  //   即对 active 锚：只看【既有类型是否 frameImportant】，放置类型仅查
  //   Reseta 表本身（CreateBoolSet(default=true, 列表=false，SetFactory.cs 实证)
  //   ——列表成员（草/苔藓族）是【作为放置类型时】不触发重排，不是【既有类型】
  //   豁免）。J 曾拿既有类型查豁免表 → 苔藓(625/60/381/182/183)等非 framed 活锚
  //   被跳过清半砖；x86 halfEv 十格全为 PTreset_n654@placeTNTBarrel 实证。
  //   RE_RESETS 放置类型侧表：本域放置族 {135,137,141,443,654} 全不在
  //   CreateBoolSet(false-list) 内 ⇒ 恒触发；tag 未传按可触发处理。
  {
    const placedSh = tag ?? -1;
    const resets = placedSh < 0 || !RESETS_HALF_EXEMPT_SHEETS.has(placedSh);
    if (resets && !TILE_DEFS[st.type[i]!]?.framed) {
      tntProbe(`P${tag ?? 0} ${x} ${y} reset h${st.half[i]} s${st.slope[i]} f${st.frameX[i]},${st.frameY[i]}->f0,0`);
      st.half[i] = 0;                                                   // halfBrick(false)
      st.frameX[i] = 0 as never; st.frameY[i] = 0 as never;
    }
  }
}

function isCracked(t: number): boolean {
  const s = sheetOf(t);
  return s === 481 || s === 482 || s === 483;                          // Main.tileCracked（Main.cs:7139）
}

/** ★III13 批：PlaceSandTrap 门序仪（与 x86 rig JJHook.SandEv 同名同位；未注册零开销）。
 *  B 项（sand-g2 Δln=−2 早退深度）取证专用：逐门记 S0/G1..G9/OK/R1/R2，x86 权威件
 *  /tmp/iii13-out/x-sandC.txt 与 JS 件逐行对拍锁首个门分叉。 */
function sandEv(kind: string, a: number, b: number, v: number): void {
  (globalThis as { __swSandEv?: (kind: string, a: number, b: number, v: number) => void }).__swSandEv?.(kind, a, b, v);
}

/** ★III13+#28 回归仲裁开关：SW_I13_LEGACY=1 时关闭本批新增（CheckSuper 分派/
 *  桶尾级联）并回退 IIII10 两刀行为面（plate 尾级联、墙挂真分派），供 A/B 反演。
 *  运行时可切（__i13SetLegacy，隔离重放探针同进程双跑对照）；浏览器无 process 守卫。 */
let I13_LEGACY = typeof process !== 'undefined' && (__swProcessEnv ?? {})?.SW_I13_LEGACY === '1';
export function __i13SetLegacy(v: boolean): void { I13_LEGACY = v; }
function i13Legacy(): boolean { return I13_LEGACY; }

/** PlaceSandTrap（cs:35505-35781）：地下沙漠蜂窝墙内的塌沙陷阱（1456 全尾段） */
/** PlaceSandTrap（cs:35505-35781）——导出仅供探针对账 */
export function placeSandTrap(st: TileStore, rng: RNG, i: number, j: number): boolean {
  sandEv('S0', i, j, 0);
  const num2 = 4, num3 = 25;
  let k = j;
  while (k < st.h - 200 && !st.flags[st.idx(i, k)]) k++;              // cs:35515 UnderworldLayer
  if (k >= st.h - 200) { sandEv('G1', i, j, k); return false; }
  {
    const gi = st.idx(i, k);
    const t = st.type[gi]!;
    if (!vanGenSolidType(t) || st.half[gi] || st.slope[gi] === 1 || st.slope[gi] === 2) { sandEv('G2', i, j, k); return false; }  // cs:35522
    const s = sheetOf(t);
    if ((s !== 53 && s !== 397 && s !== 396) || (st.wall[gi] !== 216 && st.wall[gi] !== 187)) { sandEv('G3', i, j, k); return false; }  // cs:35526
  }
  k--;                                                                // cs:35530
  sandEv('K', i, j, k);
  const pocketW = rng.int(6, 11);                                     // num5（cs:35532 ★掷在 ±25 扫前）
  sandEv('R1', pocketW, 0, 0);
  const pocketH = rng.int(6, 13);                                     // num6（cs:35533）
  sandEv('R2', pocketH, 0, 0);
  // ±25 无线/箱/画/门/平台/牌/提取机/矿轨（cs:35534-35571）
  for (let dx = -num3; dx <= num3; dx++) {
    for (let dy = -num3; dy < num3; dy++) {
      const xx = i + dx, yy = k + dy;
      if (!st.inBounds(xx, yy)) continue;
      const ii = st.idx(xx, yy);
      if (st.wire[ii]) { sandEv('G4w', xx, yy, 0); return false; }
      if (SAND_FORBID.has(sheetOf(st.type[ii]!))) {                   // 无 active 门（cs:35542 原样读 type）
        sandEv('G4', xx, yy, sheetOf(st.type[ii]!));
        return false;
      }
    }
  }
  // ±2 下 3 格实心（cs:35572-35581：active && tileSolid）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      const ii = st.idx(i + dx, k + dy);
      if (!st.flags[ii] || !vanGenSolidType(st.type[ii]!)) { sandEv('G5', i + dx, k + dy, 0); return false; }
    }
  }
  if (sheetOf(st.type[st.idx(i, k + 1)]!) === 162) { sandEv('G6', i, k + 1, 162); return false; }   // cs:35582 BreakableIce
  // 上扫砂岩顶（cs:35586-35605）
  let sandTop = -1;
  for (let yy = k; yy > k - 30; yy--) {
    const ii = st.idx(i, yy);
    if (st.flags[ii]) {
      if (sheetOf(st.type[ii]!) !== 396) { sandEv('G7a', i, yy, sheetOf(st.type[ii]!)); return false; }
      sandTop = yy;
      break;
    }
  }
  if (sandTop <= -1) { sandEv('G7b', i, j, 0); return false; }
  if (k - sandTop < pocketH + num2) { sandEv('G8', i, k, sandTop); return false; }
  // 腰线全空 + 下方实心率 75%（cs:35606-35633：ore 检查对任意 active 格）
  const mid = Math.floor((k + sandTop) / 2);
  let solidN = 0;
  for (let dx = -pocketW; dx <= pocketW; dx++) {
    const ii = st.idx(i + dx, mid);
    if (st.flags[ii] && vanGenSolidType(st.type[ii]!)) { sandEv('G9m', i + dx, mid, 0); return false; }
    for (let dy = sandTop - pocketH; dy <= sandTop; dy++) {
      const jj = st.idx(i + dx, dy);
      if (st.flags[jj]) {
        const s = sheetOf(st.type[jj]!);
        if (ORE_SHEETS.has(s) || s === 404) { sandEv('G9o', i + dx, dy, s); return false; }   // cs:35618 Ore ∪ DesertFossil 404
        if (vanGenSolidType(st.type[jj]!)) solidN++;
      }
    }
  }
  if (solidN < (pocketW * 2 + 1) * (pocketH + 1) * 0.75) { sandEv('G9r', i, k, solidN); return false; }
  // 掏沙穴 + 壳（cs:35634-35687）
  for (let dx = -pocketW - 1; dx <= pocketW + 1; dx++) {
    for (let dy = sandTop - pocketH; dy <= sandTop; dy++) {
      const xx = i + dx, yy = dy;
      if (!st.inBounds(xx, yy)) continue;
      const ii = st.idx(xx, yy);
      const flag = st.flags[ii] !== 0 && vanGenSolidType(st.type[ii]!);
      if (yy === sandTop) {                                           // 顶行：清坡/半砖；空则砂岩（保帧）
        st.slope[ii] = 0; st.half[ii] = 0;
        if (!flag) { st.type[ii] = SANDSTONE; st.flags[ii] = 1; }
      } else if (yy === sandTop - pocketH) {                          // 底行：ClearTile 后 397/396
        const above = st.idx(xx, yy - 1);
        const hard = flag && st.flags[above] !== 0 && vanGenSolidType(st.type[above]!);
        st.setTileSilent(xx, yy, hard ? HARDSAND : SANDSTONE);
        st.half[ii] = 0; st.slope[ii] = 0;
      } else if (dx === -pocketW - 1 || dx === pocketW + 1) {         // 侧列：空补砂岩；实心清坡/半砖
        if (!flag) {
          st.setTileSilent(xx, yy, SANDSTONE);
          st.half[ii] = 0; st.slope[ii] = 0;
        } else { st.slope[ii] = 0; st.half[ii] = 0; }
      } else {                                                        // 内部：纯沙
        st.setTileSilent(xx, yy, SAND);
        st.half[ii] = 0; st.slope[ii] = 0;
      }
    }
  }
  // 阶梯缘修整（cs:35688-35720：i±(pocketW+2) 支撑列非实心补砂岩）
  for (let y16 = Math.floor(sandTop - pocketH * 0.666); y16 <= sandTop - pocketH * 0.333; y16++) {
    const lx = i - pocketW - 2, rx = i + pocketW + 2;
    if (y16 < sandTop - pocketH * 0.4) {
      const li = st.idx(lx, y16);
      if (st.slope[li] === 3 || st.slope[li] === 4) st.slope[li] = 0; // bottomSlope
    } else if (y16 > sandTop - pocketH * 0.6) {
      const li = st.idx(lx, y16);
      if (st.slope[li] === 1 || st.slope[li] === 2) st.slope[li] = 0; // topSlope
      st.half[li] = 0;
    } else {
      const li = st.idx(lx, y16);
      st.half[li] = 0; st.slope[li] = 0;
    }
    for (const cx of [lx, rx]) {
      const ci = st.idx(cx, y16);
      if (!st.flags[ci] || !vanGenSolidType(st.type[ci]!)) { st.type[ci] = SANDSTONE; st.flags[ci] = 1; }
    }
  }
  // 壳侧四列清坡/半砖（cs:35721-35731）——★原版字面列 = **i-num5-2/-1/+1/+2**
  //   （四列全在左侧！i-num5+1/+2 落在穴内已被掏空段清过=空转；右侧两列
  //   **从不清坡**——vanilla 1.4.5.6 原样 bug，勿"修正"为对称 ±。golden 实证：
  //   (2668,817)s1/(2676,844)s4 右侧斜面存活至终态）。PPPP 修（曾对称 ± →
  //   #76 残 S1>0/S4>0 两格）。
  for (let y17 = sandTop - pocketH; y17 <= sandTop; y17++) {
    for (const dx of [-pocketW - 2, -pocketW - 1, -pocketW + 1, -pocketW + 2]) {
      const ii = st.idx(i + dx, y17);
      st.slope[ii] = 0; st.half[ii] = 0;
    }
  }
  // 穴底上一行清坡/半砖（cs:35732-35740）
  {
    const y19 = k - pocketH - 1;
    for (let x18 = i - pocketW - 1; x18 < i + pocketW + 1; x18++) {
      const ii = st.idx(x18, y19);
      if (st.slope[ii] === 3 || st.slope[ii] === 4) st.slope[ii] = 0;
      st.half[ii] = 0;
    }
  }
  // 压板两侧清空 + 压板 style7（cs:35741-35745）
  for (const dx of [-2, -1, 1, 2]) killTileWhole(st, i + dx, k, rng);
  placePlate(st, i, k, 7);
  // 致动沙栅 + 阶梯掏空 + 中心红线（cs:35746-35780）
  for (let x20 = i - pocketW; x20 <= i + pocketW; x20++) {
    let y21 = k;
    if (x20 < i - pocketW * 0.8 || x20 > i + pocketW * 0.8) y21 = k - 3;
    else if (x20 < i - pocketW * 0.6 || x20 > i + pocketW * 0.6) y21 = k - 2;
    else if (x20 < i - pocketW * 0.4 || x20 > i + pocketW * 0.4) y21 = k - 1;
    for (let y22 = sandTop; y22 <= k; y22++) {
      if (x20 === i) st.wire[st.idx(i, y22)] |= WIRE_RED;             // 中心列全线
      const ii = st.idx(x20, y22);
      if (st.flags[ii] && vanGenSolidType(st.type[ii]!)) {
        if (y22 < sandTop + 2) st.wire[ii] |= WIRE_ACTUATOR | WIRE_RED;
        else if (y22 < y21) killTileWhole(st, x20, y22, rng);
      }
    }
  }
  sandEv('OK', i, k, sandTop);
  return true;
}

/** pass 76 Traps 主体（cs:18769-18898）：w*0.05 次 placeTrap + w*0.003 次 PlaceSandTrap。
 *  两段计数均为裸 double 比较（cs:18800/18866 `for i < num`，不取整）。
 *  ★SSSSSS-NOTRAPS 批（cs:18778-18912 noTrapsWorldGen 全支）：
 *  ①次数 ×100（(tenth||ntb)&&remix ×5 / tenth||ntb ×2）；②采样域 x∈[50,W-50)
 *  y∈[50,H-50)（remix y≤H-210）且 `(y>worldSurface || wall>0)` 收（无 oceanDepths 重掷）；
 *  ③TNT 桶 W*3 次（tenth W/3；remix y∈[ws,(H-350+rock)/2] 否则 [rock,H-200]）；
 *  ④沙陷阱 ×5；⑤pass 尾 SetBoulderSolidity(true)。 */
export function runTrapsPass(st: TileStore, rng: RNG, gs: GenState, chests?: Array<{ x: number; y: number; items: unknown[] }>): void {
  // ★BBBBBBB（2026-08-24）NTB #76 定罪修复（SSSSS ⑤.3 备案清偿）：pass 头门
  //   （1457 cs:18789）`!denySome && !actuallyNoTraps && (!ntb || noTraps || remix)`
  //   ——**纯 NTB（ntb&&!noTraps&&!remix）整段跳过**：头尾 tileSolid[379] 翻转、
  //   boulderPetsPlaced 清零、全部掷骰都在门内。JS 曾恒跑 → NTB 链 #76 起
  //   T0>135×216（JS 多放的飞镖/巨石/ TNT）+T59>1×995（门内 379/巨石实心窗
  //   未开 → 后续 pass 读实心差异）级联。skyblock(denySome)/actuallyNoTraps 同门。
  const nf0 = gs.seedFlags;
  if (gs.seedFlags.skyblock || gs.seedFlags.actuallyNoTraps
    || (nf0.notTheBees && !nf0.noTraps && !nf0.remix)) return;
  // ★pass 头 tileSolid 翻转（cs:18773 `Main.tileSolid[379] = false`）：
  //   本仓生成期不放置 379,行为无差,存档时间线。pass 尾 cs:18897 还原 true。
  flipGenSolid([379], false);
  boulderPetsPlaced = 0;   // GenVars.boulderPetsPlaced 每局清零
  passRngT = rng;          // ★IIII29 环分派 genRand 单例镜像
  destroyObjectT = false; destroyObjectP2 = false; fossilBreakT = false;
  // CheckChest 语境：有物箱锚集（CanDestroyChest cs:590 有物=不可毁）
  chestList = chests ?? null;
  chestItemAnchors = new Set();
  if (chests) for (const c of chests) {
    if (!c) continue;   // ★IIII102c：跳洞
    if (c.items.some((it) => it && (it as { id: number; stack: number }).id > 0 && (it as { id: number; stack: number }).stack > 0)) {
      chestItemAnchors.add(c.y * st.w + c.x);
    }
  }
  const nf = gs.seedFlags;
  genGetGoodT = !!nf.getGoodWorld; genRemixT = !!nf.remix; genDrunkT = !!nf.drunkWorld;
  // ★RRRRRRR2 批：分段掷流标定钩（与 x86 rig JJHook.HashMark 同名同位；未注册零开销）
  const __hm = (label: string) => {
    (globalThis as { __swTrapHm?: (l: string) => void }).__swTrapHm?.(label);
  };
  __hm('traps-head');
  let trapTries = st.w * 0.05;
  if (nf.noTraps) {
    // cs:18781-18783：三元链逐层照抄（double 乘法次序保持）
    trapTries = ((nf.tenthAnniversary || nf.notTheBees) && nf.remix) ? trapTries * 5
      : (!nf.tenthAnniversary && !nf.notTheBees) ? trapTries * 100 : trapTries * 2;
  } else if (nf.getGoodWorld) {
    trapTries *= 1.5;
  }
  for (let n = 0; n < trapTries; n++) {
    // ★RRRRRRR2：与 rig 同款 att/pt/ptr 计数（pt=placeTrap 受理尝试数，ptr=其内部掷量）
    let mAtt = 0, mPt = 0;
    const __rn = () => (globalThis as { __swRollN?: number }).__swRollN ?? -1;
    const mRb = __rn();
    for (let k = 0; k < 1150; k++) {
      mAtt++;
      trapEv('A', n, k, 0);
      if (nf.noTraps) {
        // cs:18816-18827：全域采样（无 oceanDepths 重掷）
        const x = rng.int(50, st.w - 51);                             // Next(50, w-50)
        let y = rng.int(50, st.h - 51);                               // Next(50, h-50)
        if (nf.remix) y = rng.int(50, st.h - 211);                    // remix: Next(50, h-210)
        if ((y > gs.worldSurface || st.wall[st.idx(x, y)] > 0)) {
          mPt++;
          trapEv('C', x, y, 0);
          if (placeTrap(st, rng, gs, x, y, -1)) break;
        }
      } else {
        let x = rng.int(200, st.w - 201);                               // Next(200, w-200)
        let y = rng.int(gs.worldSurface, st.h - 211);                   // Next(surface, h-210)
        // oceanDepths（cs:10978：y≤(surface+rock)/2+40 且海滩带）重掷
        const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
        while (y <= oceanTop && (x < gs.beachDistance || x > st.w - gs.beachDistance)) {
          x = rng.int(200, st.w - 201);
          y = rng.int(gs.worldSurface, st.h - 211);
        }
        trapEv('AX', x, y, 0);   // ★IIII162 per-attempt 坐标记账（x86 rig ATT 同位,零开销钩）
        if (st.wall[st.idx(x, y)] === 0) {
          mPt++;
          trapEv('C', x, y, 0);
          if (placeTrap(st, rng, gs, x, y, -1)) break;
        }
      }
    }
    __hm(`traps-main-g${n}-att${mAtt}-pt${mPt}-ptr${__rn() - mRb}`);
  }
  __hm('traps-post-mainloop');
  if (nf.noTraps) {
    // ---- TNT 桶（cs:18829-18851）：W*3 次（tenth W/3）----
    let tntTries = st.w * 3;
    if (nf.tenthAnniversary) tntTries = st.w / 3;
    tntProbe(`MB ${gs.worldSurface},${gs.rockLevel} bs484=${vanGenSolidType(sheetId(484)) ? 1 : 0} tries=${tntTries}`);
    tntSeq = 0;
    for (let k = 0; k < tntTries; k++) {
      const x = rng.int(50, st.w - 51);                               // Next(50, w-50)
      // ★IIIII212（2026-09-03）GFB #76①②③ 定罪修复：remix y 上界整除序——vanilla
      //   `genRand.Next((int)worldSurface, (int)((double)(h-350)+rockLayer) / 2)` 的
      //   (int) cast 先于 /2（C# 整除 1685/2=842）＝Next(361,842) 值域 [361,841]；
      //   JS 曾把 842 当 rng.int 闭区间上界＝Next(361,843) 多采一格。半数 attempt
      //   采样 y 高 1：锚格 active 时 JS 锚=采样格−1（命中半砖活锚 → placeHeadMirrorT
      //   reset 清 H=②族 4 格）vs vanilla 锚=采样格−2（ghost 支不清 H）；vanilla 侧
      //   反向（锚=半砖格 → reset 清 H=③族 3 格）vs JS 锚=其上格（reset h0 无痕）。
      //   受理 barrel 位亦随锚移位（①族 2 桶 JS 多置）。放置/拒收两态掷数同（掷流
      //   中性：TNT 相位恒 2 掷/attempt），唯写面变——修后与金标 8 通道对齐。
      const y = nf.remix
        ? rng.int(Math.floor(gs.worldSurface), Math.floor((st.h - 350 + gs.rockLevel) / 2) - 1)
        : rng.int(Math.floor(gs.rockLevel), st.h - 201);              // Next(rock, h-200)
      placeTNTBarrel(st, x, y, rng);
    }
  }
  __hm('traps-post-tnt');
  let sandTries = st.w * 0.003;
  if (nf.noTraps) sandTries *= 5;                                     // cs:18857-18859
  else if (nf.getGoodWorld) sandTries *= 1.5;
  __hm('traps-sand-head');
  for (let n = 0; n < sandTries; n++) {
    // ★RRRRRRR2：与 rig 同款 att/hit/ok 计数（hit=wall187 命中数，ok=落成功）
    let sAtt = 0, sHit = 0, sOk = false;
    for (let k = 0; k < 20000; k++) {
      sAtt++;
      const x = rng.int(Math.floor(st.w * 0.15), Math.floor(st.w * 0.85) - 1);
      const y = rng.int(gs.worldSurface + 20, st.h - 211);
      if (st.wall[st.idx(x, y)] === 187) {
        sHit++;
        if (placeSandTrap(st, rng, x, y)) { sOk = true; break; }
      }
    }
    __hm(`traps-sand-g${n}-att${sAtt}-hit${sHit}${sOk ? '-ok1' : '-ok0'}`);
  }
  __hm('traps-post-sand');
  // ★pass 尾（cs:18893-18896）：noTraps → SetBoulderSolidity(true)（巨石族回实心）
  if (nf.noTraps) setBoulderSolidity(true);
  // ★pass 尾还原（cs:18897 `Main.tileSolid[379] = true`）
  flipGenSolid([379], true);
  chestList = null; chestItemAnchors = null;
  passRngT = null;         // ★IIII29 pass 外清兜底
}

/** placeTNTBarrel（cs:8836-8856）：下扫首个活性格上一格放 654（TNT 桶，2×2
 *  PlaceTile→Place2x2 族）。anyShimmer 拒。
 *  ★III13 批（A 项定罪修复）：vanilla PlaceTile 落成后经 **通用尾 SquareTileFrame(i,j)**
 *  （cs:60746-60752 `if (tile.active()) { …; SquareTileFrame(i,j); result=true }`——对
 *  一切走到通用尾的类型生效，含 case654 Place2x2 分支）。notraps #76 定罪：TNT 相位
 *  四段 KillTile 突发（窗口 ln 73637771/73652389/73655023/73655339 共 11 条）全部 =
 *  `KillTile←Check2x2|CheckStalactite←TileFrameImportant←TileFrame←SquareTileFrame←
 *  PlaceTile←placeTNTBarrel`（x86 rig KS 栈轨迹实证，/tmp/iii13-out/x-klog13.txt）：
 *  桶落点 ±1 邻域内残缺滚地仙人掌/钟乳石经帧完整性级联被清。J 曾无此尾 → T0>484×5
 *  与 T0>165×4 两簇存留。补：place2x2Traps 成功后跑与 KillTile 尾同款全环分派。
 *  ★掷流中性实证：四段杀除物属 484（尘掷 0 表）与 165（dustAmount=10 但 type165 无
 *  内部掷支 ⇒ 零耗），x86 TNT 窗总掷恒 25200 = 12600×2 整，两侧封闭相等。 */
const TNT_BARREL = sheetId(654);
export function placeTNTBarrel(st: TileStore, x: number, y: number, rng?: RNG): boolean {
  const k = tntSeq++;
  tntProbe(`A ${k} ${x} ${y}`);
  let py = y;
  while (!st.flags[st.idx(x, py)]) {
    py++;
    if (py > st.h - 350) { tntProbe(`X ${k} H350 anchor=${x},${py}`); return false; }
  }
  py--;
  tntProbe(`H ${k} ${x} ${py} hit=${st.flags[st.idx(x, py + 1)] ? sheetOf(st.type[st.idx(x, py + 1)]!) : -1}`);
  {
    const i = st.idx(x, py);
    if (st.liquid[i] > 0 && st.liquidType[i] === 4) { tntProbe(`X ${k} shimmer anchor=${x},${py}`); return false; }   // anyShimmer（LIQ_SHIMMER）
  }
  // PlaceTile(654) → Place2x2（cs:60229 分派；右下锚语义同 MicroBiomes place2x2Direct）
  placeHeadMirrorT(st, x, py, 654);                                // ★III13 桶锚头变异（654 非实心门恒过）
  const ok = place2x2Traps(st, x, py, TNT_BARREL);
  tntProbe(`D ${k} ${ok ? 'OK' : 'NO'} at=${x},${py} r=${(globalThis as { __swRollN?: number }).__swRollN ?? -1}`);
  // ★IIII29 定罪修复②（notraps #76 残差四簇 + const 残差同源）：vanilla PlaceTile
  //   的通用尾在【整条 else-if 链之后】以「if (tile.active())」判定（cs:60746-60752，
  //   大括号深度扫描实证：尾块是 60463 最终 else 分派的兄弟层）——与放置成败无关，
  //   只看**锚格此刻是否 active**：被拒路径若锚格本是活物（如扫描命中行上方的
  //   活蛛网），仍跑 SquareTileFrame(i,j) 全环分派并置 result=true。其尾环的
  //   CheckStalactite/Check2x2 会清邻格残缺钟乳石/滚地仙人掌。x86 klog13 实证：
  //   四簇 X-only kill（r73637771/73652389/73655023/73655339）与 J 的四次拒收尝试
  //   逐 roll 同位、栈顶均为 PlaceTile←placeTNTBarrel。J 曾仅在 ok 时跑环 → 残差。
  //   注：杀除全走零掷支（支撑缺失短路于 style 重掷之前），掷流中性（组账本已证）。
  if (!i13Legacy() && st.flags[st.idx(x, py)]) cascade3x3T(st, x, py, rng, true);   // cs:60752 通用尾（锚格 active 即触发）
  return ok || st.flags[st.idx(x, py)] !== 0;
}

/** WorldGen.PlaceTile→Place2x2（cs:59833 头 + cs:51780-51820）Traps 语境副本：
 *  右下锚 (x,y) 写 (x-1..x)×(y-1..y)，2×2 区须全空 + 逐列 (i,y+1)
 *  nactive&&(SolidTile2||tileTable)。★PlaceTile 头语义（SSSSSS 补）：654 非实心
 *  → 头门 `!tileSolid[num]` 恒过（forced=false 路不拒锚占位），inactive 锚格
 *  Clear(Tile|TilePaint|Slope)（ghost type/帧/坡/半砖/块漆清零——Place2x2 后续
 *  拒绝也保留此清）。与 MicroBiomesPass.place2x2Direct 同源（副本禁 import）。 */
const PLACE2X2_TABLE = new Set([14, 18, 19, 87, 88, 101, 114, 275, 276, 277, 278, 279, 280, 281, 285, 286, 296, 297, 298, 299,
  309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394, 405, 413, 414, 427, 469, 532, 533, 538,
  542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610,
  611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
function place2x2Traps(st: TileStore, x: number, y: number, type: number): boolean {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) { tntProbe(`R bounds ${x},${y}`); return false; }   // cs:51786
  // ★PlaceTile 头（cs:59500）：inactive 锚 Clear(Tile|TilePaint|Slope)（654 非实心
  //   → 头门恒过，先清后派发；active 锚不清——ResetsHalfBrick[654]=false）
  if (!st.flags[st.idx(x, y)]) st.setTileSilent(x, y, 0);
  for (let i = x - 1; i <= x; i++) {
    for (let j = y - 1; j <= y; j++) {
      const ci = st.idx(i, j);
      if (st.flags[ci]) {
        tntProbe(`C ${i} ${j} t${sheetOf(st.type[ci]!)} h${st.half[ci]} s${st.slope[ci]} w${(st.wire[ci] >>> 5) & 1}`);   // cs:51376 空置门
        return false;
      }
    }
    const gi = st.idx(i, y + 1);
    const gt = st.type[gi]!;
    const solid2 = st.flags[gi] !== 0 && vanGenSolidType(gt)
      && st.slope[gi] === 0 && st.half[gi] === 0
      && ((st.wire[gi] >>> 5) & 1) === 0;                             // SolidTile2（inActive 位）
    const table = PLACE2X2_TABLE.has(sheetOf(gt));
    tntProbe(`S ${i} ${y + 1} t${sheetOf(gt)} h${st.half[gi]} s${st.slope[gi]} ia${(st.wire[gi] >>> 5) & 1} sol${vanGenSolidType(gt) ? 1 : 0} tbl${table ? 1 : 0}`);
    if (!st.flags[gi]) {
      tntProbe(`G ${i} ${y + 1} INACTIVE`);
      return false;
    }
    if (!solid2 && !table) {
      tntProbe(`G ${i} ${y + 1} t${sheetOf(gt)} h${st.half[gi]} s${st.slope[gi]} ia${(st.wire[gi] >>> 5) & 1} sol${vanGenSolidType(gt) ? 1 : 0} tbl${table ? 1 : 0}`);
      return false;
    }
  }
  for (let k = x - 1; k <= x; k++) {
    for (let l = y - 1; l <= y; l++) {
      st.setTileSilent(k, l, type, (k - x + 1) * 18, (l - y + 1) * 18);
    }
  }
  tntProbe(`R ok ${x},${y}`);
  return true;
}
