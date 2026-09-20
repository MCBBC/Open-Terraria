// 摇树子系统 1:1（WorldGen.ShakeTree WorldGen.cs:63169-63462 全支）。
//
// 触发链（唯一调用点，WorldGen.cs:63759）：
//   玩家斧挥命中 IsShakeable 树干格且本击未砍倒（KillTile(fail:true) 的 fail 分支）
//   → ShakeTree(i, j)。Player 侧入口 = ItemCheck_UseMiningTools 的 Main.tileAxe 分支
//   （Player.cs:45087-45134：hitTile.AddDamage < 100 → KillTile(x,y,fail:true)）。
//   ★弹幕不摇树：Projectile.CutTilesAt(:14205-14235) 只对 tileCut 族 / Axearang(1052)
//   调 KillTile(成功语义)，fail 分支不存在；抓钩落点 KillTile(fail,effectOnly) 在
//   KillTile 的 effectOnly 早退(:63746)之前于 ShakeTree(:63761) 之前 return——均不可达。
//
// 状态语义：treeShakeX/Y + numTreeShakes（WorldGen.cs:4353-4359，maxTreeShakes=500）
//   ——按【树底格】(bottomX, 地面行) 去重；ResetTreeShakes(:63164) 只在
//   UpdateTime_StartDay（Main.cs:64846 首行）与 clearWorld（WorldGen.cs:6896）调用
//   → 即"每树每日一摇"，非每击冷却。
//
// 关键顺序（勿调换）：注册进 shake 表【先于】叶顶/实心门（WorldGen.cs:63190 先于
//   :63199）——被封死/无叶顶的树同样消耗掉当日份额（原版行为）。
import { TILE_DEFS, IS_A_TREE_TRUNK_SHEETS, IS_SHAKEABLE_SHEETS } from '../data/tiles';
import { tileSolidLike } from './Housing';   // ★G1谓词批(2026-09-04)：Main.tileSolid 代理（棕榈寻底落门）
import type { TileStore } from './TileStore';
import type { RNG } from '../core/rng';
import { getTreeLeaf } from '../render/NatureParticles';

/** TileID.Sets.IsShakeable（TileID.cs:163）——注意与 tileAxe（Main.cs:7157-7172，
 *  含 80 仙人掌/488 倒木/704 假人）是两张表：仙人掌/倒木/假人可斧砍但【不摇】
 *  ——★BJ210 收编单源 data/tiles.ts:IS_SHAKEABLE_SHEETS（面二三名同值案,§6i） */
export const TREE_SHAKEABLE_SHEETS = IS_SHAKEABLE_SHEETS;
/** TileID.Sets.IsATreeTrunk（TileID.cs:161，无 323 棕榈——棕榈单格整树） */
// ★BJ182b 收编单源 data/tiles.ts:IS_A_TREE_TRUNK_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const TREE_TRUNK_SHEETS = IS_A_TREE_TRUNK_SHEETS;
/** TileID.Sets.GetsCheckedForLeaves（TileID.cs:167）= IsShakeable ∪ {323} 同集 */
const LEAF_CHECK_SHEETS = TREE_SHAKEABLE_SHEETS;
/** WorldGen.beachDistance（WorldGen.cs:4102）——棕榈绿洲判定内边界 */
const BEACH_DISTANCE = 380;
/** WorldGen.maxTreeShakes（WorldGen.cs:4353） */
const MAX_TREE_SHAKES = 500;
/** NPC.goldCritterChance（NPC.cs:5976） */
export const GOLD_CRITTER_CHANCE = 400;

/** Terraria.Enums.TreeTypes（TreeTypes.cs:3-17）——数值与原版枚举一致 */
export const enum TreeTypes {
  None = 0, Forest = 1, Corrupt = 2, Mushroom = 3, Crimson = 4, Jungle = 5,
  Snow = 6, Hallowed = 7, Palm = 8, PalmCrimson = 9, PalmCorrupt = 10,
  PalmHallowed = 11, Ash = 12,
}

/** WorldGen.GetTreeType(int tileType)（WorldGen.cs:63113-63147）——入参是树底
 *  【地面格】的 sheet。宝石树(583-589)长在石上、景观树(596/616)地面不在表内
 *  → None → ShakeTree 在 :63181 提前返回（这两族永远摇不出东西，1:1 保留） */
export function treeTypeOfGroundSheet(sheet: number): TreeTypes {
  switch (sheet) {
    case 2: case 477: return TreeTypes.Forest;
    case 23: case 661: return TreeTypes.Corrupt;
    case 70: return TreeTypes.Mushroom;
    case 199: case 662: return TreeTypes.Crimson;
    case 60: return TreeTypes.Jungle;
    case 147: return TreeTypes.Snow;
    case 109: case 492: return TreeTypes.Hallowed;
    case 53: return TreeTypes.Palm;
    case 112: return TreeTypes.PalmCorrupt;
    case 234: return TreeTypes.PalmCrimson;
    case 116: return TreeTypes.PalmHallowed;
    case 633: return TreeTypes.Ash;
    default: return TreeTypes.None;
  }
}

function sheetAt(st: TileStore, x: number, y: number): number {
  return TILE_DEFS[st.get(x, y)]?.vanilla?.sheet ?? -1;
}

/** WorldGen.GetTreeBottom（WorldGen.cs:63470-63513）——从命中格找树底（地面格）。
 *  棕榈(323)：单格整树，直接向下走到棕榈格之下的地面。
 *  其余：先按命中格 frame（22px 网格）把 x 归位到树干列（侧枝/根部帧偏移），
 *  再向下穿干身直到地面（!active || 树干 || 72） */
export function getTreeBottom(st: TileStore, x: number, y: number): { x: number; y: number } {
  let bx = x, by = y;
  const i0 = st.idx(x, y);
  if (st.type[i0] !== 0 && (TILE_DEFS[st.type[i0]]?.vanilla?.sheet ?? -1) === 323) {
    while (by < st.h - 1) {
      const i = st.idx(bx, by);
      const active = st.flags[i] !== 0;
      const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
      if (active && sheet !== 323) break;      // 停在棕榈格之下的第一个非棕榈活性格
      by++;
    }
    return { x: bx, y: by };
  }
  const num = Math.floor(st.frameX[i0] / 22);   // :63489 frameX/22
  const num2 = Math.floor(st.frameY[i0] / 22);  // :63490 frameY/22
  if (num === 3 && num2 <= 2) bx++;             // :63491-63492
  else if (num === 4 && num2 >= 3 && num2 <= 5) bx--;   // :63493-63494
  else if (num === 1 && num2 >= 6 && num2 <= 8) bx--;   // :63495-63496
  else if (num === 2 && num2 >= 6 && num2 <= 8) bx++;   // :63497-63498
  else if (num === 2 && num2 >= 9) bx++;                // :63499-63500
  else if (num === 3 && num2 >= 9) bx--;                // :63501-63502
  while (by < st.h - 1) {                        // :63505-63510
    const i = st.idx(bx, by);
    const active = st.flags[i] !== 0;
    const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
    if (active && !TREE_TRUNK_SHEETS.has(sheet) && sheet !== 72) break;
    by++;
  }
  return { x: bx, y: by };
}

/** WorldGen.GetTreeTypeAndTreeBottom（WorldGen.cs:63093-63105） */
export function getTreeTypeAndTreeBottom(st: TileStore, x: number, y: number): { type: TreeTypes; x: number; y: number } {
  const b = getTreeBottom(st, x, y);
  const gi = st.idx(b.x, b.y);
  if (st.flags[gi] === 0) return { type: TreeTypes.None, x: b.x, y: b.y };
  return { type: treeTypeOfGroundSheet(sheetAt(st, b.x, b.y)), x: b.x, y: b.y };
}

/** WorldGen.IsTileALeafyTreeTop（WorldGen.cs:29831-29850）：
 *  棕榈 frameX>=88；其余 frameX==22 且 frameY∈[198,242] 的冠顶标记帧 */
export function isTileALeafyTreeTop(st: TileStore, x: number, y: number): boolean {
  const i = st.idx(x, y);
  if (st.flags[i] === 0) return false;
  const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
  if (!LEAF_CHECK_SHEETS.has(sheet)) return false;
  if (sheet === 323) return st.frameX[i] >= 88;
  return st.frameX[i] === 22 && st.frameY[i] >= 198 && st.frameY[i] <= 242;
}

/** Collision.SolidTiles 近似（矩形内任一实心即 true；Housing.ts:124 同款）——
 *  ShakeTree :63199 的树顶 ±2 实心门 */
function solidTilesNear(st: TileStore, x0: number, x1: number, y0: number, y1: number): boolean {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (!st.inBounds(x, y)) continue;
      if (st.isSolid(x, y)) return true;
    }
  }
  return false;
}

/** WorldGen.IsPalmOasisTree（WorldGen.cs:27352-27360）——海滩 380 格内的棕榈
 *  是绿洲棕榈：不出海鸥/椰子香蕉（两处消费 :63363/:63426） */
export function isPalmOasisTree(st: TileStore, x: number): boolean {
  return x >= BEACH_DISTANCE && x <= st.w - BEACH_DISTANCE;
}

/** Luck.RollLuck（Luck.cs:12-21）——Player.GetClosestRollLuck（Player.cs:18089）
 *  == 0 判金动物。luck>0：|luck| 概率改掷 [range/2, range)（0 的概率约翻倍） */
export function rollLuck(luck: number, range: number, rng: RNG): number {
  if (luck > 0 && rng.next() < luck) return rng.int(Math.floor(range / 2), range - 1);
  if (luck < 0 && rng.next() < -luck) return rng.int(range, range * 2 - 1);
  return rng.int(0, range - 1);
}

/** 摇树 1/12 支的"砍树掉落物"（ShakeTree :63259 调 KillTile_GetItemDrops(i,j,命中格)）。
 *  因宝石树/景观树在 :63181 被 None 门拦下，实际可达族只有 5/596/616/634/72/323：
 *   - 5/596/616/634 → KillTile_GetTreeDrops（:66245-66315）：木 9 起步，冠/枝标记帧
 *     (frameX>=22 && frameY>=198) 50% 附橡实 27；再按树型换木种
 *     （Ash 5215/Corrupt 619/Crimson 911/Jungle 620/Hallowed 621/Mushroom 183/
 *     Snow 2503；bonusWood 只加 stack 不改物品，此处无消费）
 *   - 72 → :65283-65291：1/40 发光蘑菇 194，否则 1/2 蘑菇 183，否则 0（不掉）
 *   - 323 → :65269-65282：棕榈木 2504；frameX∈[88,132] 附橡实（secondary 不消费）；
 *     向下扫到地面，234→911 / 116→621 / 112→619 */
function killTileGetItemDrops_Tree(st: TileStore, i: number, j: number, genRand: RNG, mainRand: RNG): number {
  const sheet = sheetAt(st, i, j);
  if (sheet === 72) {                                       // :65283-65291
    if (mainRand.int(0, 39) === 0) return 194;
    if (mainRand.int(0, 1) === 0) return 183;
    return 0;
  }
  if (sheet === 323) {                                      // :65269-65282
    let drop = 2504;
    let y = j;
    while (y < st.h - 1) {
      const ii = st.idx(i, y);
      // ★G1谓词批(2026-09-04)：落门= 裸 active() && Main.tileSolid（WorldGen.cs
      //  :65744-65748 `for (j = y; !tile.active() || !tileSolid[tile.type]; j++)`）——
      //  isSolid 多排致动位与 solidTop 族豁免（平台 19 tileSolid=true）=棕榈寻底过严
      if (st.flags[ii] !== 0 && tileSolidLike(st.type[ii])) break;
      y++;
    }
    const gs = sheetAt(st, i, y);
    if (gs === 234) drop = 911;                             // :65285-65294
    else if (gs === 116) drop = 621;
    else if (gs === 112) drop = 619;
    return drop;
  }
  // 5 / 596 / 616 / 634 → KillTile_GetTreeDrops（:66245-66315）
  // :66247-66275 冠/枝标记帧（frameX>=22 && frameY>=198）50% 掷出 secondaryItem=27
  // 橡实——走 secondary 通道，而 ShakeTree :63263 只取 dropItem，故该掷对本消费点
  // 无可见效果（dropItem 两支都是 9），不再现掷骰
  let drop = 9;                                             // :66277-66292 缺省木
  const { type } = getTreeTypeAndTreeBottom(st, i, j);
  switch (type) {                                           // :66300-66313 按树型换木种
    case TreeTypes.Ash: drop = 5215; break;
    case TreeTypes.Corrupt: drop = 619; break;
    case TreeTypes.Crimson: drop = 911; break;
    case TreeTypes.Jungle: drop = 620; break;
    case TreeTypes.Hallowed: drop = 621; break;
    case TreeTypes.Mushroom: drop = genRand.int(0, 1) === 0 ? 183 : 0; break;  // :66305-66310
    case TreeTypes.Snow: drop = 2503; break;
    default: break;
  }
  return drop;
}

// ---------------------------------------------------------------------------
// 摇树宿主/落点接口（Game 注入；模块不反向依赖 Game，防环）
// ---------------------------------------------------------------------------

export interface TreeShakeHost {
  st: TileStore;
  /** Main.dayTime */
  isDay: boolean;
  /** Main.halloween（Clock.halloween / 月事件强制季的并集由调用方算好） */
  halloween: boolean;
  /** Main.raining */
  raining: boolean;
  /** NPC.TooWindyForButterflies（NPC.cs:6801：|windSpeedTarget|>=0.4） */
  windyForButterflies: boolean;
  tenthAnniversary: boolean;
  getGoodWorld: boolean;
  remixWorld: boolean;
  notTheBees: boolean;
  drunkWorld: boolean;
  /** 最近玩家 luck（单机 = 主角；Player.GetClosestRollLuck 的单机投影） */
  luck: number;
}

export interface TreeShakeNpcOpts {
  /** NewNPC 后直接覆写 velocity.Y（:63328/:63335 Owl/鹦鹉族 1f） */
  vy?: number;
  /** 圆周边缘随机速度（:63350 NextVector2CircularEdge(3,3)） */
  circularVel3?: boolean;
  /** obj.ai[1] = 65（:63361 蜂群） */
  ai1?: number;
}

export interface TreeShakeSinks {
  /** Item.NewItem —— px/py 为原版 16×16 掉落盒原点（bx*16, by*16）；盒内随机落点
   *  由实现侧近似（原版 NewItem 盒内均匀取点） */
  item(vanillaId: number, px: number, py: number, stack: number): void;
  /** NPC.NewNPC —— 像素坐标原样（bx*16 等）；beehive 弹 655 单列（引擎无该弹时实现侧跳过） */
  npc(vanillaId: number, px: number, py: number, o?: TreeShakeNpcOpts): void;
  /** 弹 28 炸弹 / 75 快乐炸弹（:63217：vx=Main.rand.Next(-100,101)*0.002, ai0=ai1=16） */
  bomb(vanillaId: number, px: number, py: number, vx: number): void;
  /** 弹 655 蜂巢（:63381 丛林 1/40，命中格上方一格） */
  beehive(px: number, py: number): void;
  /** TreeGrowFX 叶爆单叶（:29763-29787，hitTree → 3 直排 + 5 散布） */
  leaf(px: number, py: number, gore: number, paint?: number): void;
  /** TreeGrowFX_AshShake（:29796-29822，gore 1278 改尘爆） */
  ashDust(px: number, py: number): void;
}

// ---------------------------------------------------------------------------
// 每树状态（WorldGen.cs:4353-4359 数组语义 + ResetTreeShakes）
// ---------------------------------------------------------------------------

export interface TreeShakePulse {
  /** 距命中已过 tick */
  since: number;
  /** 命中方向（玩家在树的哪侧摇的：-1 左 / +1 右） */
  dir: number;
}

export class TreeShakeState {
  /** treeShakeX/Y + numTreeShakes（WorldGen.cs:4353-4359）——按树底格去重的"今日已摇"表 */
  private xs = new Int32Array(MAX_TREE_SHAKES);
  private ys = new Int32Array(MAX_TREE_SHAKES);
  private count = 0;
  /** 渲染查询用命中脉冲（非原版机制——原版无命中摆幅，见 getTreeShake 注释） */
  private pulses = new Map<number, { tick: number; dir: number }>();
  private st: TileStore | null = null;
  /** 命中方方向来源（Game 注入玩家朝向的相反侧） */
  private lastDir = 1;

  bind(st: TileStore): void { this.st = st; }

  /** ResetTreeShakes（WorldGen.cs:63164-63167）——Main.cs:64846 每黎明 / WorldGen.cs:6896 clearWorld */
  reset(): void {
    this.count = 0;
    this.pulses.clear();
  }

  get size(): number { return this.count; }

  /** 已在今日已摇表中？（ShakeTree :63183-63189 的去重扫描） */
  has(x: number, y: number): boolean {
    for (let k = 0; k < this.count; k++) {
      if (this.xs[k] === x && this.ys[k] === y) return true;
    }
    return false;
  }

  /** 登记（ShakeTree :63171 满 500 拒收 / :63190-63192 追加）。返回 false = 满 */
  register(x: number, y: number): boolean {
    if (this.count === MAX_TREE_SHAKES) return false;
    this.xs[this.count] = x;
    this.ys[this.count] = y;
    this.count++;
    return true;
  }

  /** 渲染查询喂点（非原版）：命中树底格 (x=树干列, y=地面行) */
  notePulse(x: number, y: number, tick: number, dir: number): void {
    this.lastDir = dir;
    this.pulses.set(y * 0x10000 + x, { tick, dir });
    if (this.pulses.size > 256) {
      // 上限回收：摇树频率天然低，超限丢最旧（Map 迭代序即插入序）
      const first = this.pulses.keys().next();
      if (!first.done) this.pulses.delete(first.value);
    }
  }

  /**
   * 渲染侧摇动查询（任务要求的导出）。⚠ 原版 1.4.5.6 **没有**命中摆幅：
   * TileDrawing 的树摆动全部来自风力（TileDrawing.cs:7802-7846 GetWindCycle +
   * WindGrid，WindGrid.ScanPlayers 只按玩家【移动】推格）——命中反馈只有
   * 叶爆（TreeGrowFX hitTree）+ 裂缝 + 音效。接线它会偏离原版，是否接由渲染侧定。
   * 入参 (x,y) = 任意该树的 tile 坐标（内部归位到树底）；返回 null = 本树无脉冲。
   */
  getTreeShake(x: number, y: number, nowTick: number): TreeShakePulse | null {
    const st = this.st;
    if (!st || !st.inBounds(x, y)) return null;
    const b = getTreeBottom(st, x, y);
    const p = this.pulses.get(b.y * 0x10000 + b.x);
    if (!p) return null;
    return { since: nowTick - p.tick, dir: p.dir || this.lastDir };
  }
}

// ---------------------------------------------------------------------------
// 主入口：WorldGen.ShakeTree（:63169-63462）全支 1:1
// ---------------------------------------------------------------------------

/** Main.rand.NextFromList（等概率挑一） */
function nextFromList<T>(rng: RNG, list: readonly T[]): T {
  return list[rng.nextInt(list.length)];
}

export interface TreeShakeResult {
  /** 是否走到掉落/FX 阶段（false = 满表/树型 None/今日已摇/无叶顶或被实心围死） */
  shook: boolean;
  treeType: TreeTypes;
  /** 树干列（getTreeBottom 归位后的 x） */
  bottomX: number;
  /** 树底【地面行】（注册键的 y 分量；GetTreeBottom 原值） */
  groundY: number;
  /** 树顶格行（掉落物出生行；climb 后的 bottomY） */
  topY: number;
}

/**
 * 摇一次树。i/j = 命中格。掷骰用 genRand（原版掉落表流）与 mainRand（原版
 * Main.rand 流：弹速/挑动物/蘑菇 1/40）双流注入，测试可分别定种。
 */
export function shakeTree(
  host: TreeShakeHost, sinks: TreeShakeSinks, state: TreeShakeState,
  genRand: RNG, mainRand: RNG, i: number, j: number,
): TreeShakeResult | null {
  const st = host.st;
  if (!st.inBounds(i, j)) return null;
  // :63171 满 500 拒收
  const tt = getTreeTypeAndTreeBottom(st, i, j);            // :63177
  const res: TreeShakeResult = { shook: false, treeType: tt.type, bottomX: tt.x, groundY: tt.y, topY: tt.y };
  if (tt.type === TreeTypes.None) return res;               // :63181（宝石树/景观树到此为止）
  if (state.has(tt.x, tt.y)) return res;                    // :63183-63189 今日已摇
  if (!state.register(tt.x, tt.y)) return res;              // :63190-63192（满表不消耗）

  let bottomX = tt.x;
  let bottomY = tt.y;
  const groundY = bottomY;                                  // num（GetTreeLeaf 的地面格行 :63449）
  bottomY--;                                                // :63193 回到干基
  while (bottomY > 10 && st.flags[st.idx(bottomX, bottomY)] !== 0
    && TREE_SHAKEABLE_SHEETS.has(sheetAt(st, bottomX, bottomY))) {
    bottomY--;                                              // :63194-63197 沿可摇族向上爬
  }
  bottomY++;                                                // :63198 回到最高可摇格 = 树顶
  res.topY = bottomY;
  // :63199 无叶顶（冠标记帧缺失）或树顶 ±2 有实心 → 本树今日份额已消耗但不掉落
  if (!isTileALeafyTreeTop(st, bottomX, bottomY)
    || solidTilesNear(st, bottomX - 2, bottomX + 2, bottomY - 2, bottomY + 2)) {
    return res;
  }
  res.shook = true;

  const t = tt.type;
  // ---- 掷骰参数（:63201-63207）：num2=17 / type=28；十周年（非 remix）翻倍且换 75 ----
  let num2 = 17;
  let bombType = 28;
  if (host.tenthAnniversary && !host.remixWorld) { num2 *= 2; bombType = 75; }

  // 掉落盒原点（原版 16×16 盒）
  const bx0 = bottomX * 16, by0 = bottomY * 16;
  const dropAt = (vid: number, stack: number) => sinks.item(vid, bx0, by0, stack);

  if (host.tenthAnniversary && host.notTheBees && !host.drunkWorld && genRand.int(0, 49) === 0) {
    // :63210-63213 蜂榴弹 1130 ×12-20（掉在【命中格】而非树顶）
    sinks.item(1130, i * 16, j * 16, genRand.int(12, 20));
  } else if (host.getGoodWorld && genRand.int(0, num2 - 1) === 0) {
    // :63215-63217 FTW 树掉炸弹/快乐炸弹：vx=Main.rand.Next(-100,101)*0.002
    sinks.bomb(bombType, bottomX * 16, bottomY * 16, mainRand.int(-100, 100) * 0.002);
  } else if (genRand.int(0, 299) === 0 && t === TreeTypes.Forest) {
    dropAt(832, 1);                                          // :63219 活木魔杖
  } else if (genRand.int(0, 299) === 0 && t === TreeTypes.Forest) {
    dropAt(933, 1);                                          // :63223 树叶魔杖
  } else if (genRand.int(0, 199) === 0 && t === TreeTypes.Jungle) {
    dropAt(3360, 1);                                         // :63227 活体红木魔杖
  } else if (genRand.int(0, 199) === 0 && t === TreeTypes.Jungle) {
    dropAt(3361, 1);                                         // :63231 活体红木叶魔杖
  } else if (genRand.int(0, 999) === 0 && t === TreeTypes.Forest) {
    dropAt(5517, 1);                                         // :63235 斧头仙灵宠物
  } else if (genRand.int(0, 999) === 0 && t === TreeTypes.Forest) {
    dropAt(4366, 1);                                         // :63239 桉树树液
  } else if (genRand.int(0, 99) === 0
    && (t === TreeTypes.Forest || t === TreeTypes.Snow || t === TreeTypes.Hallowed || t === TreeTypes.Ash)) {
    dropAt(5629, 1);                                         // :63243 橡实弹弓
  } else if (genRand.int(0, 6) === 0
    && (t === TreeTypes.Forest || t === TreeTypes.Snow || t === TreeTypes.Hallowed || t === TreeTypes.Ash)) {
    dropAt(27, genRand.int(1, 2));                           // :63247 橡实 ×1-2
  } else if (genRand.int(0, 7) === 0 && t === TreeTypes.Mushroom) {
    dropAt(194, genRand.int(1, 1));                          // :63251 发光蘑菇（Next(1,2) 恒 1）
  } else if (genRand.int(0, 34) === 0 && host.halloween) {
    dropAt(1809, genRand.int(1, 2));                         // :63255 臭蛋 ×1-2（万圣季）
  } else if (genRand.int(0, 11) === 0) {
    // :63259-63267 砍树掉落物 1/12 ×1-3（木族，见 killTileGetItemDrops_Tree）
    const dropItem = killTileGetItemDrops_Tree(st, i, j, genRand, mainRand);
    if (dropItem > 0) dropAt(dropItem, genRand.int(1, 3));
  } else if (genRand.int(0, 19) === 0) {
    // :63268-63297 钱币 1/20：铜 71 ×50-99；1/30 金 73 ×1(+1/5,+1/10)；否则 1/10 银 72
    let type2 = 71;
    let num3 = genRand.int(50, 99);
    if (genRand.int(0, 29) === 0) {
      type2 = 73;
      num3 = 1;
      if (genRand.int(0, 4) === 0) num3++;
      if (genRand.int(0, 9) === 0) num3++;
    } else if (genRand.int(0, 9) === 0) {
      type2 = 72;
      num3 = genRand.int(1, 20);
      if (genRand.int(0, 2) === 0) num3 += genRand.int(1, 20);
      if (genRand.int(0, 3) === 0) num3 += genRand.int(1, 20);
    }
    dropAt(type2, num3);
  } else if (genRand.int(0, 14) === 0 && (t === TreeTypes.Forest || t === TreeTypes.Hallowed)) {
    // :63300-63313 单只小动物 1/15（雀 74/蓝鸟 297/红鸟 298/松鼠 299/红松鼠 538）
    let type3 = [74, 297, 298, 299, 538][genRand.int(0, 4)];
    if (rollLuck(host.luck, GOLD_CRITTER_CHANCE, mainRand) === 0) {
      type3 = genRand.int(0, 1) !== 0 ? 539 : 442;           // :63309 金松鼠/金鸟
    }
    sinks.npc(type3, bx0, by0);
  } else if (genRand.int(0, 49) === 0 && t === TreeTypes.Hallowed && !host.isDay) {
    // :63316-63322 夜间神圣树仙灵 1/50
    let type4 = nextFromList(mainRand, [583, 584, 585] as const);
    if (host.tenthAnniversary && mainRand.int(0, 3) !== 0) type4 = 583;   // :63319-63321
    sinks.npc(type4, bx0, by0);
  } else if (genRand.int(0, 49) === 0 && t === TreeTypes.Forest && !host.isDay) {
    sinks.npc(611, bx0, by0, { vy: 1 });                     // :63325-63328 夜间森林猫头鹰
  } else if (genRand.int(0, 49) === 0 && t === TreeTypes.Jungle && host.isDay) {
    // :63331-63335 白天丛林金刚鹦鹉/凤头鹦鹉族
    sinks.npc(nextFromList(mainRand, [671, 672, 673, 674, 675] as const), bx0, by0, { vy: 1 });
  } else if (genRand.int(0, 39) === 0 && t === TreeTypes.Forest && !host.isDay && host.halloween) {
    sinks.npc(301, bx0, by0);                                // :63337-63340 万圣夜渡鸦
  } else if (genRand.int(0, 49) === 0 && (t === TreeTypes.Forest || t === TreeTypes.Hallowed)) {
    // :63341-63351 五连雀群 1/50（±2 格散布 + 圆周初速 3）
    for (let l = 0; l < 5; l++) {
      const px = bottomX + mainRand.int(-2, 1);              // Next(-2,2) = -2..1
      const py = bottomY - 1 + mainRand.int(-2, 1);
      const type5 = rollLuck(host.luck, GOLD_CRITTER_CHANCE, mainRand) !== 0
        ? nextFromList(mainRand, [74, 297, 298] as const) : 442;
      sinks.npc(type5, px * 16, py * 16, { circularVel3: true });
    }
  } else if (genRand.int(0, 39) === 0 && t === TreeTypes.Jungle) {
    // :63352-63362 五连蜂群 1/40（ai[1]=65 → 蜂巢内待命语义）
    for (let m = 0; m < 5; m++) {
      const px = bottomX + mainRand.int(-2, 1);
      const py = bottomY - 1 + mainRand.int(-2, 1);
      sinks.npc(nextFromList(mainRand, [210, 211] as const), px * 16, py * 16, { ai1: 65 });
    }
  } else if (genRand.int(0, 19) === 0
    && (t === TreeTypes.Palm || t === TreeTypes.PalmCorrupt || t === TreeTypes.PalmCrimson || t === TreeTypes.PalmHallowed)
    && !isPalmOasisTree(st, bottomX)) {
    sinks.npc(603, bx0, by0);                                // :63363-63368 非绿洲棕榈海鸥
  } else if (genRand.int(0, 29) === 0 && (t === TreeTypes.Crimson || t === TreeTypes.PalmCrimson)) {
    sinks.npc(173, bx0 + 8, (bottomY - 1) * 16);            // :63367-63370 -22 小 Crimson 飞虫
  } else if (genRand.int(0, 29) === 0 && (t === TreeTypes.Corrupt || t === TreeTypes.PalmCorrupt)) {
    sinks.npc(6, bx0 + 8, (bottomY - 1) * 16);              // :63371-63374 -11 小吞噬怪
  } else if (genRand.int(0, 29) === 0 && t === TreeTypes.Jungle && !host.isDay) {
    sinks.npc(51, bx0, by0);                                 // :63375-63378 夜间丛林蝙蝠
  } else if (genRand.int(0, 39) === 0 && t === TreeTypes.Jungle) {
    sinks.beehive(bottomX * 16 + 8, (bottomY - 1) * 16);     // :63379-63383 蜂巢弹 655
  } else if (genRand.int(0, 19) === 0
    && (t === TreeTypes.Forest || t === TreeTypes.Hallowed)
    && !host.raining && !host.windyForButterflies && host.isDay) {
    // :63383-63391 白天无雨无风蝴蝶 1/20（金蝶 444 走幸运门）
    sinks.npc(rollLuck(host.luck, GOLD_CRITTER_CHANCE, mainRand) === 0 ? 444 : 356, bx0, by0);
  } else if (genRand.int(0, 19) === 0 && t === TreeTypes.Ash && bottomY > st.h - 250) {
    // :63392-63401 地底 250 格内灰烬树 1/20：岩浆萤火 654/地狱蝶 653/岩浆蜗牛 655
    const num4 = genRand.int(0, 2);
    sinks.npc(num4 === 0 ? 654 : num4 === 1 ? 653 : 655, bx0, by0);
  } else if (host.remixWorld && genRand.int(0, 19) === 0 && t === TreeTypes.Ash && bottomY > st.h - 250) {
    dropAt(965, genRand.int(20, 40));                        // :63402-63405 remix 灰烬树绳索 ×20-40
  } else if (genRand.int(0, 11) === 0 && t === TreeTypes.Forest) {
    // :63406-63417 森林水果 1/12（苹果/桃/杏/葡萄柚/柠檬）
    dropAt([4009, 4293, 4282, 4290, 4291][genRand.int(0, 4)], 1);
  } else if (genRand.int(0, 11) === 0 && t === TreeTypes.Snow) {
    dropAt(genRand.int(0, 1) !== 0 ? 4295 : 4286, 1);        // :63418-63421 李/樱桃
  } else if (genRand.int(0, 11) === 0 && t === TreeTypes.Jungle) {
    dropAt(genRand.int(0, 1) !== 0 ? 4292 : 4294, 1);        // :63422-63425 芒果/菠萝
  } else if (genRand.int(0, 11) === 0
    && (t === TreeTypes.Palm || t === TreeTypes.PalmCorrupt || t === TreeTypes.PalmCrimson || t === TreeTypes.PalmHallowed)
    && !isPalmOasisTree(st, bottomX)) {
    dropAt(genRand.int(0, 1) !== 0 ? 4287 : 4283, 1);        // :63426-63429 椰子/香蕉
  } else if (genRand.int(0, 11) === 0 && (t === TreeTypes.Corrupt || t === TreeTypes.PalmCorrupt)) {
    dropAt(genRand.int(0, 1) !== 0 ? 4289 : 4284, 1);        // :63430-63433 接骨木莓/黑醋栗
  } else if (genRand.int(0, 11) === 0 && (t === TreeTypes.Hallowed || t === TreeTypes.PalmHallowed)) {
    dropAt(genRand.int(0, 1) !== 0 ? 4288 : 4297, 1);        // :63434-63437 火龙果/杨桃
  } else if (genRand.int(0, 11) === 0 && (t === TreeTypes.Crimson || t === TreeTypes.PalmCrimson)) {
    dropAt(genRand.int(0, 1) !== 0 ? 4285 : 4296, 1);        // :63438-63441 血橙/红毛丹
  } else if (genRand.int(0, 11) === 0 && t === TreeTypes.Ash) {
    dropAt(genRand.int(0, 1) !== 0 ? 5278 : 5277, 1);        // :63442-63445 石榴/辣椒
  }

  // ---- 叶爆 FX（:63446-63462 GetTreeLeaf → TreeGrowFX(height=1, hitTree=true)）----
  const passStyle = getTreeLeaf(bottomX, st.frameX[st.idx(bottomX, bottomY)],
    st.frameY[st.idx(bottomX, bottomY)], sheetAt(st, bottomX, bottomY), sheetAt(st, bottomX, groundY));
  if (passStyle !== -1) {
    if (passStyle === 1278) {
      // TreeGrowFX :29761 gore 1278 → TreeGrowFX_AshShake（:29796 尘爆而非叶）
      sinks.ashDust(bottomX * 16 + 8, bottomY * 16 + 8);
    } else {
      // :29763-29787 height=1：num=0 单行 3 叶（-16/0/+16 偏移 -5,-7）+ hitTree 尾爆 5 叶；
      // CurrentColumn = 树格油漆（:29889-29892 InWorld 门 + tile.color()）
      const paint = st.inBounds(bottomX, bottomY) ? st.paint[st.idx(bottomX, bottomY)] : 0;
      const cx = bottomX * 16 + 8, cy = bottomY * 16 + 8;
      sinks.leaf(cx - 16 - 5, cy - 7, passStyle, paint);
      sinks.leaf(cx - 5, cy - 7, passStyle, paint);
      sinks.leaf(cx + 16 - 5, cy - 7, passStyle, paint);
      for (let n = 0; n < 5; n++) {
        const dx = cx + (mainRand.next() * 80 - 40);
        const dy = cy - 40 + (mainRand.next() * 80 - 40) - 7;
        sinks.leaf(dx, dy, passStyle, paint);
      }
    }
  }
  return res;
}
