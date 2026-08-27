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
// ★dungeon-1457 批：placeTrap 双地牢界拒门（WorldGen.cs:8865）三因子承载
import { placeTrapDualDungeonReject } from './DungeonStyles1457';

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

/** WorldGen.SetBoulderSolidity（cs:11036）＝tileSolid 九巨石族整体翻转。
 *  ★集合不含 665（生命水晶巨石在 Boulders 集但不在本翻转列——1456/1457 逐行同）。
 *  SSSSSS-NOTRAPS 批接线（原 GenSolid.ts「特殊种子专属翻转备案」三处之一）。 */
const BOULDER_FLIP_SHEETS = [138, 484, 664, 711, 712, 713, 714, 715, 716];
export function setBoulderSolidity(solid: boolean): void {
  flipGenSolid(BOULDER_FLIP_SHEETS, solid);
}

/** GenVars.boulderPetsPlaced（cs:9302 宠物巨石计数，每局生成清零） */
let boulderPetsPlaced = 0;

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
function killTileWholeCore(st: TileStore, x: number, y: number, rng?: RNG): void {
  // ★KillTile 1:1 头链（cs:63559-63990）。SSSSS 批（2026-08-20）补三件：
  //   ①CheckTileBreakability 门（cs:62403——容器上格保护/魔金矿/仙人掌基座/
  //     巨石骑箱 fail + 含 loot 箱拒杀）——m20260811 #76 双站点实证
  //     ((3073-3074,688-691) 井穿箱+箱下木与丛林草全存)；
  //   ②AttemptFossilShattering（cs:63526——杀化石 404 时 3×3 邻化石掷
  //     Next(15|4)==0 连锁杀，★掷流）——m20260811 (3703,483) 实证；
  //   ③fail 支类型转化（cs:63787-63810 草→土/丛林草→泥/苔→石…）。
  //   12345 #76 双根因（Check1x1 压板支撑杀 + Check2x2 残缺巨石帧锚杀）见
  //   cascade3x3T 分派注释。陶罐/雕像族仍走旧近似（9293480 golden 四站点实证）。
  if (!st.inBounds(x, y)) return;
  const ci = st.idx(x, y);
  if (!st.flags[ci]) return;                          // cs:63573 !active()
  const br = checkBreakabilityT(st, x, y);
  if (br === 2) return;                               // cs:63584 num==2 拒杀
  // cs:63756 化石碎裂在杀除本格**之前**（邻化石支撑判读本格仍活性）
  if (rng && sheetOf(st.type[ci]!) === 404) attemptFossilShatterT(st, x, y, rng, br === 1);
  if (br === 1) { failConvertT(st, x, y); cascade3x3T(st, x, y, rng); return; }
  killObjectAt(st, x, y);
  cascade3x3T(st, x, y, rng);
}

/** KillTile 尾 SquareTileFrame（cs:63983→80924）3×3 TileFrame 分派级联。
 *  SSSSS 批按 vanilla TileFrame 真分派重构（12345 #76 双根因：①镖锚杀地基 →
 *  上方压板 Check1x1 支撑杀缺失（cs:45226→86307）；②残缺巨石块帧锚 Check2x2
 *  完整性杀缺失（cs:48405）——旧"整块搜索+支撑列"近似对残块必空转）。 */
function cascade3x3T(st: TileStore, x: number, y: number, rng?: RNG): void {
  // SquareTileFrame 调用序（cs:80925-80933）列优先
  for (const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]] as const) {
    const ux = x + dx, uy = y + dy;
    // TileFrame 头界（cs:82069）：5 格 padding
    if (ux <= 5 || uy <= 5 || ux >= st.w - 5 || uy >= st.h - 5) continue;
    const ui = st.idx(ux, uy);
    const ut = st.type[ui];
    // TileFrame 失活格清 half/slope/块漆（cs:82077-82082，零掷零杀）
    if (!st.flags[ui]) { st.half[ui] = 0; st.slope[ui] = 0; st.paint[ui] = 0; continue; }
    const sh = sheetOf(ut);
    if (sh === 165 && rng) { checkStalactite(st, rng, ux, uy); continue; }
    if (ut === GEM178) { check178Gen(st, ux, uy, rng); continue; }
    if (CHECK1X1_SHEETS.has(sh)) { check1x1Gen(st, ux, uy, rng); continue; }
    if (CHEST_SHEETS.has(sh)) { checkChestGen(st, ux, uy, rng); continue; }
    if (CHECK2X2_SHEETS.has(sh)) { check2x2Gen(st, ux, uy, rng); continue; }
    if (sh === 185) { checkPileTrap(st, ux, uy); continue; }
    if (!MULTI_DEFS.has(ut)) continue;
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
    if (sh !== ash && (ash === 77 || PREVENTS_REMOVAL.has(ash))) return 2;
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

/** KillTile fail 支类型转化（cs:63787-63810）：草族→土/丛林草→泥/苔→石/苔砖→石砖。
 *  转化后原格存活（cs:63812 SquareTileFrame 后 return）。 */
function failConvertT(st: TileStore, x: number, y: number): void {
  const i = st.idx(x, y);
  const sh = sheetOf(st.type[i]!);
  const conv: Record<number, number> = { 2: 0, 23: 0, 109: 0, 199: 0, 477: 0, 492: 0, 633: 57, 60: 59, 661: 59, 662: 59, 70: 59 };
  if (sh in conv) {
    const to = conv[sh]!;
    st.type[i] = sheetId(to);
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
let chestList: Array<{ x: number; y: number; items: unknown[] }> | null = null;
export function __setTrapsChestAnchors(s: Set<number> | null): void { chestItemAnchors = s; }

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
  if (chestList) {
    for (let q = chestList.length - 1; q >= 0; q--) {
      const c = chestList[q]!;
      if (c.x >= num && c.x <= num + 1 && c.y >= num2 && c.y <= num2 + 2) {
        chestList.splice(q, 1);
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
  const num5 = Math.trunc(st.frameY[i]! / 36);
  const num6 = y - Math.trunc((st.frameY[i]! % 36) / 18);
  let flag = false;
  for (let k = num2; k <= num2 + 1; k++) {
    for (let l = num6; l <= num6 + 1; l++) {
      const ki = st.idx(k, l);
      if (!st.inBounds(k, l) || !st.flags[ki] || st.type[ki] !== t
        || st.frameX[ki] !== (k - num2) * 18 + num
        || st.frameY[ki] !== (l - num6) * 18 + num5 * 36) { flag = true; break; }
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
  destroyObjectT = true;
  for (let k = num2; k <= num2 + 1; k++) {
    for (let l = num6; l <= num6 + 1; l++) {
      if (!st.inBounds(k, l)) continue;
      const ki = st.idx(k, l);
      if (st.type[ki] === t && st.flags[ki]) killTileWholeCore(st, k, l, rng);
    }
  }
  destroyObjectT = false;
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
function killObjectAt(st: TileStore, x: number, y: number): void {
  const t = st.type[st.idx(x, y)];
  const m = MULTI_DEFS.get(t);
  if (m) {
    for (let ay = y; ay > y - m.h; ay--) {
      for (let ax = x; ax > x - m.w; ax--) {
        let full = true;
        for (let dy = 0; dy < m.h && full; dy++) {
          for (let dx = 0; dx < m.w; dx++) {
            if (!st.inBounds(ax + dx, ay + dy) || st.type[st.idx(ax + dx, ay + dy)] !== t) { full = false; break; }
          }
        }
        if (full) {
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
 *  随机板支无前置门（巨石世界必需）。导出供 FinishNoTrapsPass 复用。 */
export function placePlate(st: TileStore, x: number, y: number, style: number): boolean {
  if (x < 2 || y < 2 || x > st.w - 3 || y > st.h - 3) return false;   // InWorld(x,y,2)
  if (st.flags[st.idx(x, y)] !== 0) return false;                     // Place1x1 !tile.active()
  if (!solidTile2V(st, x, y + 1)) return false;
  if (isBoulderType(st.type[st.idx(x, y + 1)]!)) return false;        // cs:45213 机关×巨石底座
  st.setTileSilent(x, y, PLATE, 0, style * 18);
  const i = st.idx(x, y);
  st.half[i] = 0; st.slope[i] = 0;                                    // PlaceTile 前奏 Clear（cs:59497）
  // case 135 尾 SquareTileFrame(i,j)（cs:60162-60163）——失活格清 half/slope 支
  //   （TileFrame cs:82078-82082，零掷零杀；活性格帧派发本种子零命中）。PPPP 补
  //   （曾缺 → (3952,861) 板 (3953,860) 邻帧本应清的失活残坡 s2 存活）
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!st.inBounds(x + dx, y + dy)) continue;
      const ni = st.idx(x + dx, y + dy);
      if (!st.flags[ni]) { st.half[ni] = 0; st.slope[ni] = 0; }
    }
  }
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
  // type 随机（cs:8942-8955 普通（非 remix）分支）
  if (type === -1 && rng.int(0, 19) === 0) type = 2;
  else if (type === -1 && py > gs.lavaLine + 30 && rng.int(0, 5) !== 0) type = 3;
  else if (type === -1) type = rng.int(0, 1);
  // ★noTraps+tenth 强制巨石（cs:8957-8961）：Next(4)==0 → type=1（掷照耗）
  if (nf.noTraps && nf.tenthAnniversary && rng.int(0, 3) === 0) type = 1;
  trapEv('T', 0, py, type);
  // 共同守卫（cs:8961-8985）
  if (x2 < 3 || py < 3 || x2 > st.w - 4 || py > st.h - 4) return false;   // InWorld(x2,num,3)
  if (lava && type !== 3) return false;
  if (deep && type !== 3) return false;
  for (const [ax, ay] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]] as const) {
    if (st.flags[st.idx(x2 + ax, py + ay)]) return false;             // cs:8973 nactive 九格
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
    for (let xx = colX; xx <= colX + 1; xx++) {
      for (let yy = top; yy <= py; yy++) {
        const ii = st.idx(xx, yy);
        if (st.type[ii] !== SHEET379) killTileWhole(st, xx, yy, rng);
      }
    }
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
    placePlate(st, x2, py, 7);                                        // cs:9252 style7
    // cs:9253-9254 两块石头（PlaceTile forced=false：EmptyTile 门，非空格不写）
    if (!st.flags[st.idx(colX, top + 2)]) st.setTileSilent(colX, top + 2, STONE1);
    if (!st.flags[st.idx(colX + 1, top + 2)]) st.setTileSilent(colX + 1, top + 2, STONE1);
    // 巨石变体掷（cs:9255-9306）。★SSSSSS-NOTRAPS：maxValue2/3/4（蛛/岩浆/地牢
    //   巨石分母）noTraps 时 1/2/4（普通 2/6/3）；maxValue（tenth 彩虹分母）
    //   noTraps&&!remix 时 5（普通 7）；新增 712 便便支（ntb||noTraps||poo 1/5）与
    //   664 支（(tenth||noTraps) 1/3）——掷序逐支照抄（分母命中后才判 close*）。
    let boulderId = BOULDER138;
    const maxValue2 = nf.noTraps ? 1 : 2;
    const maxValue3 = nf.noTraps ? 2 : 3;
    const maxValue4 = nf.noTraps ? 4 : 6;
    const maxValue = nf.noTraps && !nf.remix ? 5 : 7;
    if (rng.int(0, maxValue2 - 1) === 0 && closeSpiders(st, colX, top)) boulderId = BOULDER714;
    else if (rng.int(0, maxValue4 - 1) === 0 && closeDungeon(st, colX, top, gs.dungeonSide)) boulderId = BOULDER715;
    else if (rng.int(0, maxValue3 - 1) === 0 && closeLava(st, colX, top)) boulderId = BOULDER713;
    else if ((nf.notTheBees || nf.noTraps || nf.pooEverywhere) && rng.int(0, 4) === 0) boulderId = BOULDER712;
    else if (nf.tenthAnniversary && rng.int(0, maxValue - 1) === 0) boulderId = BOULDER711;
    else if ((nf.tenthAnniversary || nf.noTraps) && rng.int(0, 2) === 0) boulderId = BOULDER664;
    else if (rng.int(0, 24) === 0) boulderId = BOULDER711;
    else if (rng.int(0, 19) === 0) boulderId = BOULDER664;
    if (boulderId === BOULDER138 && boulderPetsPlaced < petCap) { boulderPetsPlaced++; boulderId = BOULDER716; }
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
  st.setTileSilent(i5, j2, TRAP137, dir === 1 ? 18 : 0, 18 * num33);  // cs:9115（frameY=18*style）
  trapEv('DTW', num33, dir, 0);
  lWire(st, x2, py, i5, j2);
  return true;
}

function isCracked(t: number): boolean {
  const s = sheetOf(t);
  return s === 481 || s === 482 || s === 483;                          // Main.tileCracked（Main.cs:7139）
}

/** PlaceSandTrap（cs:35505-35781）：地下沙漠蜂窝墙内的塌沙陷阱（1456 全尾段） */
/** PlaceSandTrap（cs:35505-35781）——导出仅供探针对账 */
export function placeSandTrap(st: TileStore, rng: RNG, i: number, j: number): boolean {
  const num2 = 4, num3 = 25;
  let k = j;
  while (k < st.h - 200 && !st.flags[st.idx(i, k)]) k++;              // cs:35515 UnderworldLayer
  if (k >= st.h - 200) return false;
  {
    const gi = st.idx(i, k);
    const t = st.type[gi]!;
    if (!vanGenSolidType(t) || st.half[gi] || st.slope[gi] === 1 || st.slope[gi] === 2) return false;  // cs:35522
    const s = sheetOf(t);
    if ((s !== 53 && s !== 397 && s !== 396) || (st.wall[gi] !== 216 && st.wall[gi] !== 187)) return false;  // cs:35526
  }
  k--;                                                                // cs:35530
  const pocketW = rng.int(6, 11);                                     // num5（cs:35532 ★掷在 ±25 扫前）
  const pocketH = rng.int(6, 13);                                     // num6（cs:35533）
  // ±25 无线/箱/画/门/平台/牌/提取机/矿轨（cs:35534-35571）
  for (let dx = -num3; dx <= num3; dx++) {
    for (let dy = -num3; dy < num3; dy++) {
      const xx = i + dx, yy = k + dy;
      if (!st.inBounds(xx, yy)) continue;
      const ii = st.idx(xx, yy);
      if (st.wire[ii]) return false;
      if (SAND_FORBID.has(sheetOf(st.type[ii]!))) return false;       // 无 active 门（cs:35542 原样读 type）
    }
  }
  // ±2 下 3 格实心（cs:35572-35581：active && tileSolid）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      const ii = st.idx(i + dx, k + dy);
      if (!st.flags[ii] || !vanGenSolidType(st.type[ii]!)) return false;
    }
  }
  if (sheetOf(st.type[st.idx(i, k + 1)]!) === 162) return false;      // cs:35582 BreakableIce
  // 上扫砂岩顶（cs:35586-35605）
  let sandTop = -1;
  for (let yy = k; yy > k - 30; yy--) {
    const ii = st.idx(i, yy);
    if (st.flags[ii]) {
      if (sheetOf(st.type[ii]!) !== 396) return false;
      sandTop = yy;
      break;
    }
  }
  if (sandTop <= -1) return false;
  if (k - sandTop < pocketH + num2) return false;
  // 腰线全空 + 下方实心率 75%（cs:35606-35633：ore 检查对任意 active 格）
  const mid = Math.floor((k + sandTop) / 2);
  let solidN = 0;
  for (let dx = -pocketW; dx <= pocketW; dx++) {
    const ii = st.idx(i + dx, mid);
    if (st.flags[ii] && vanGenSolidType(st.type[ii]!)) return false;
    for (let dy = sandTop - pocketH; dy <= sandTop; dy++) {
      const jj = st.idx(i + dx, dy);
      if (st.flags[jj]) {
        const s = sheetOf(st.type[jj]!);
        if (ORE_SHEETS.has(s) || s === 404) return false;             // cs:35618 Ore ∪ DesertFossil 404
        if (vanGenSolidType(st.type[jj]!)) solidN++;
      }
    }
  }
  if (solidN < (pocketW * 2 + 1) * (pocketH + 1) * 0.75) return false;
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
  destroyObjectT = false; destroyObjectP2 = false; fossilBreakT = false;
  // CheckChest 语境：有物箱锚集（CanDestroyChest cs:590 有物=不可毁）
  chestList = chests ?? null;
  chestItemAnchors = new Set();
  if (chests) for (const c of chests) {
    if (c.items.some((it) => it && (it as { id: number; stack: number }).id > 0 && (it as { id: number; stack: number }).stack > 0)) {
      chestItemAnchors.add(c.y * st.w + c.x);
    }
  }
  const nf = gs.seedFlags;
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
    for (let k = 0; k < tntTries; k++) {
      const x = rng.int(50, st.w - 51);                               // Next(50, w-50)
      const y = nf.remix
        ? rng.int(Math.floor(gs.worldSurface), Math.floor((st.h - 350 + gs.rockLevel) / 2))
        : rng.int(Math.floor(gs.rockLevel), st.h - 201);              // Next(rock, h-200)
      placeTNTBarrel(st, x, y);
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
}

/** placeTNTBarrel（cs:8836-8856）：下扫首个活性格上一格放 654（TNT 桶，2×2
 *  PlaceTile→Place2x2 族）。anyShimmer 拒。零掷（Place2x2 门内读写均不耗）。 */
const TNT_BARREL = sheetId(654);
export function placeTNTBarrel(st: TileStore, x: number, y: number): boolean {
  let py = y;
  while (!st.flags[st.idx(x, py)]) {
    py++;
    if (py > st.h - 350) return false;
  }
  py--;
  {
    const i = st.idx(x, py);
    if (st.liquid[i] > 0 && st.liquidType[i] === 4) return false;     // anyShimmer（LIQ_SHIMMER）
  }
  // PlaceTile(654) → Place2x2（cs:60229 分派；右下锚语义同 MicroBiomes place2x2Direct）
  return place2x2Traps(st, x, py, TNT_BARREL);
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
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;   // cs:51786
  // ★PlaceTile 头（cs:59500）：inactive 锚 Clear(Tile|TilePaint|Slope)（654 非实心
  //   → 头门恒过，先清后派发；active 锚不清——ResetsHalfBrick[654]=false）
  if (!st.flags[st.idx(x, y)]) st.setTileSilent(x, y, 0);
  for (let i = x - 1; i <= x; i++) {
    for (let j = y - 1; j <= y; j++) {
      if (st.flags[st.idx(i, j)]) return false;                       // cs:51376 空置门
    }
    const gi = st.idx(i, y + 1);
    const gt = st.type[gi]!;
    const solid2 = st.flags[gi] !== 0 && vanGenSolidType(gt)
      && st.slope[gi] === 0 && st.half[gi] === 0
      && ((st.wire[gi] >>> 5) & 1) === 0;                             // SolidTile2（inActive 位）
    if (!st.flags[gi] || (!solid2 && !PLACE2X2_TABLE.has(sheetOf(gt)))) return false;
  }
  for (let k = x - 1; k <= x; k++) {
    for (let l = y - 1; l <= y; l++) {
      st.setTileSilent(k, l, type, (k - x + 1) * 18, (l - y + 1) * 18);
    }
  }
  return true;
}
