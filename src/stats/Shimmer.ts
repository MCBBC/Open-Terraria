// 微光（Shimmer）实体转化系统 1:1（1.4.5.7 反编译 = Terarria1457；2026-09-20 随
//   08-23 基准切换重锚——表经 tools/extract-shimmer.mjs 重产（源 1456→1457），
//   净 diff = +4 冰系武器环（670→1319→6153→724→670）+ CountsAs 6195→6190，
//   旧 1456 行号对照保留）：
//   - 物品转化 WorldItem.GetShimmered（WorldItem.cs:1781-1931）：
//       入微光 → Shimmering()(:806-840) shimmerTime +0.01/t，>0.9 → GetShimmered
//       ① 钱币（CommonCoin 71-74）→ 面额放大入 coinLuck（铜 1× / 银 ×100 /
//          金 ×10000 / 铂 stack 钳 1 后 ×1000000），AddCoinLuck(:17943-17955 距离<1000px)
//       ② ShimmerTransformToItem 有对应 → SetDefaults(target) 原堆叠保留
//       ③ decraft 反合成（GetDecraftingRecipeIndex + RecipeSets 骷髅王/石巨人双锁
//          + WorldItem.cs:1878-1946 返还计算/掉落）——已移植（见 decraft 段 + ItemDrop）
//       ④ 4986 闪耀史莱姆气球 → 解锁 681 彩虹史莱姆（:1816-1837，仅首次）——已移植
//       ⑤ 560 史莱姆王冠 → 触发史莱姆雨（:1838-1854，雨中不可再入）——已移植
//       ⑥ makeNPC 瓶中小动物 → ReleaseNPC 放生（:1855-1877，目标优先
//          ShimmerTransformToNPC[makeNPC]）——已移植
//       转化后 shimmered=true 上浮（gravity 0，vy -0.05/t 钳 -4，WorldItem.cs:486-511）
//   - 玩家 Player.cs：触微光 shimmerWet(:27420-27434，脚格 shimmer 且在地狱层之上
//       → AddBuff(353,60))；buff 353(:11381-11428) shimmering=true + frozen + fallStart
//       重置（免摔伤）+ Hurt 直接 0(:37591-37595 AllowShimmerDodge)；物理(:24115-24127)
//       非微光态 gravity 0.15 / jumpHeight 23 / jumpSpeed 5.51（比水 0.3 更轻更高）；
//       TryToShimmerUnstuck(:28378-28430) timeShimmering ≥3600 或 ≥1200 且有输入 →
//       传送至最近无微光落点（ShimmerHelper.FindSpotWithoutShimmer 螺旋 1..59 步 2）
//   - NPC NPC.cs：触微光(:94268-94274) → TryAddingRepeatedBuff(353,100) →
//       shimmerTransparency +0.01/t（:92468-92483）>0.9 → GetShimmered(:92502-92584)：
//       雕像产怪直接消散 / ShimmerTransformToNPC → Transform / ShimmerTransformToItem →
//       出微光化物品后消散 / ShimmerTownTransform → ai[0]=25（城镇变体传送）
//       小动物（aiStyle 67，:34586-34598）：中心格微光液面 >30 即刻触发 GetShimmered
//       （无 90t 浸入进度）——已移植（entities/Critter.ts tryShimmer）
//   - 转化表来源：tools/extract-shimmer.mjs 从 ItemID.cs/NPCID.cs Sets +
//       Item.cs DefaultToCapturedCritter 提取 → src/data/vanilla-shimmer.json
//       （316 物品对 + 114 NPC 对 + 15 NPC→物品 + 29 城镇变体 + 93 瓶中小动物 +
//       CommonCoin/PostMoonlord；1456 时代=312 物品对，1457 增冰环 4 对）
//   GAP 登记（已移植——原缺口逐项落地，保留条目作溯源）：
//     - decraft 反 craft：已移植（vanillaRecipes 索引 + 本文件 decraft 段 + ItemDrop 分支；
//       RecipeGroup 组代表并列错位已修：tools/extract-itemrare.mjs 工厂盲区
//       （buyPrice/SetShopValues/标签列/扫描越界）修复后重提，value 2344→4256 条）
//     - 3461 月相砖:已按 GetLunarBrickTransformFromMoonPhase(:113-125)接通(月相参)
//     - 微光化物品上浮白光（WorldItem.cs:488-497 dust 309 四色 1/30t + 渐亮
//       AddLight (1-shimmerTime)*0.8）——已移植（ItemDrop 浮游段 + Game 点光扫描）
//     - NPC 免微光名单（NPCID.Sets.ShimmerImmunity, NPCID.cs:4837 →
//       NPC.cs:17773 buffImmune[353]）——已移植（isNpcShimmerImmune）
//     - 联机同步（NetMessage 145/146 ShimmeredItem/ShimmerEffect）
import shimmerJson from '../data/vanilla-shimmer.json';
import { getDecraftingRecipeIndex, recipeAt, RECIPE_GROUP_ITEMS } from '../data/vanillaRecipes';
import itemValueJson from '../data/vanilla-itemvalue.json';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { viIdFromKey } from '../data/vanillaItemCombat';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { RNG } from '../core/rng';

type Json = typeof shimmerJson;
const ITEM_TRANSFORM = (shimmerJson as Json).itemTransformTo as Record<string, number>;
const ITEM_COUNTS_AS = (shimmerJson as Json).itemCountsAs as Record<string, number>;
const ITEM_COUNTS_AS_DECRAFT = (shimmerJson as Json).itemCountsAsDecraft as Record<string, number>;
const ITEM_POST_MOONLORD = new Set<number>((shimmerJson as Json).itemPostMoonlord as number[]);
const COMMON_COIN = new Set<number>((shimmerJson as Json).commonCoin as number[]);
const NPC_TRANSFORM = (shimmerJson as Json).npcTransformTo as Record<string, number>;
const NPC_TRANSFORM_ITEM = (shimmerJson as Json).npcTransformToItem as Record<string, number>;
const NPC_TOWN_TRANSFORM = new Set<number>((shimmerJson as Json).npcTownTransform as number[]);
/** NPCID.Sets.ShimmerImmunity（NPCID.cs:4837，131 id）：城镇宠物（637/638/656/670/
 *  678-684）、Boss 及部件（50 史莱姆王、245-249 石巨人、657-660 史莱姆皇后、115/116
 *  血肉墙之口、139 探针、5 克苏鲁之眼仆从）、事件军（325/344 树妖/常绿尖叫树、
 *  381-429 火星暴乱、516-523 日耀星团、548-578 撒旦军队）、微光原住民（676/677）、
 *  小动物（356 蝶）等——浸微光不挂 buff 353 → 不进 shimmering */
const NPC_SHIMMER_IMMUNITY = new Set<number>((shimmerJson as Json).npcShimmerImmunity as number[]);
const ITEM_MAKE_NPC = (shimmerJson as Json).itemMakeNPC as Record<string, number>;

// ============ 内部物品 id ↔ 原版物品 id ============

// 原生 key→原版 id 表(钱币/凝胶等本地键)已随本地物品退役移除:vi_ 键前缀解析全覆盖

/** 内部 item id → 原版 item id（无映射 -1） */
export function vanillaIdOfItem(itemId: number): number {
  const def = ITEM_DEFS[itemId];
  if (!def) return -1;
  if (def.vid !== undefined) return def.vid;
  return viIdFromKey(def.key);
}

/** 原版 item id → 内部 item id（未注册 -1；全量物品经 VANILLA_ITEM_KEY_BY_ID 占位注册） */
export function internalIdOfVanilla(vid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  if (key === undefined) return -1;
  return ITEM_BY_KEY[key] ?? -1;
}

// ============ 物品侧（Item.cs GetShimmerEquivalentType / ShimmerTransforms.cs） ============

/** Item.GetShimmerEquivalentType（Item.cs:49073-49086）：CountsAs 族等价计数 */
export function getShimmerEquivalentType(vid: number, forDecrafting = false): number {
  if (forDecrafting) {
    const d = ITEM_COUNTS_AS_DECRAFT[vid];
    if (d !== undefined && d !== -1) return d;
  }
  const c = ITEM_COUNTS_AS[vid];
  if (c !== undefined && c !== -1) return c;
  return vid;
}

/** 音乐盒动态分支（ShimmerTransforms.cs:95-105：createTile==139 按 placeStyle）：
 *  90→5538 / 89→5579 / 97→5638 / 96→5639 / 其余→576（钢琴） */
const MUSIC_BOX_TRANSFORM: Record<number, number> = { 90: 5538, 89: 5579, 97: 5638, 96: 5639 };

/** 月相砖动态分支（ShimmerTransforms.cs:108-110 + GetLunarBrickTransformFromMoonPhase
 *  :113-125;MoonPhase 枚举序 = Main.moonPhase 0-7:Terraaria.Enums/MoonPhase.cs）:
 *  Full→5408 / TQL→5401 / HL→5403 / QL→5402 / Empty→5406 / QR→5407 / HR→5405 / TQR→5404 */
const LUNAR_BRICK_TRANSFORM = [5408, 5401, 5403, 5402, 5406, 5407, 5405, 5404];

/** ShimmerTransforms.GetTransformToItem（:88-111）：表优先；音乐盒按 placeStyle；
 *  3461 月相砖按当前月相（运行时由调用方传 world.clock.moonPhase） */
export function getTransformToItem(vid: number, moonPhase?: number): number {
  const t = ITEM_TRANSFORM[vid];
  if (t !== undefined && t > 0) return t;
  if (vid === 3461 && moonPhase !== undefined) {
    return LUNAR_BRICK_TRANSFORM[moonPhase & 7];
  }
  const def = ITEM_DEFS[internalIdOfVanilla(vid)];
  if (def?.tile === 'v_139_musicboxes' && def.placeStyle !== undefined) {
    return MUSIC_BOX_TRANSFORM[def.placeStyle] ?? 576;
  }
  return 0;
}

/** ShimmerTransforms.IsItemTransformLocked（:33-40）：月后物品需已败月总 */
export function isItemTransformLocked(vid: number, downedMoonlord: boolean): boolean {
  return !downedMoonlord && ITEM_POST_MOONLORD.has(vid);
}

// ============ decraft（ShimmerTransforms.cs 2026-08-13 完整移植,替换 GAP） ============

/** 解锁门（ShimmerTransforms.UpdateRecipeSets :82-86：RecipeSets.PostSkeletron =
 *  配方含材料 154(骨头);PostGolem = 含 1101）+ IsRecipeIndexDecraftLocked(:47-62) */
export function isRecipeIndexDecraftLocked(
  recipeIndex: number,
  downedBoss3: boolean,     // NPC.downedBoss3(骷髅王;本仓 flags downed_35/downedSkeletron)
  downedGolemBoss: boolean, // NPC.downedGolemBoss(本仓 flags downed_245)
): boolean {
  if (recipeIndex < 0) return false;
  const r = recipeAt(recipeIndex);
  if (!r) return false;
  if (!downedBoss3 && r.items.some((it) => it.id === 154)) return true;
  if (!downedGolemBoss && r.items.some((it) => it.id === 1101)) return true;
  return false;
}

/** ShimmerTransforms.IsItemDecraftableAndIsDecraftUnlocked（:64-80）：
 *  等价物(forDecrafting)有配方 + 未锁 + stack ≥ createStack */
export function isItemDecraftableAndUnlocked(
  vid: number, stack: number,
  crimsonWorld: boolean, downedBoss3: boolean, downedGolemBoss: boolean,
): boolean {
  const eq = getShimmerEquivalentType(vid, true);
  const idx = getDecraftingRecipeIndex(eq, crimsonWorld);
  if (isRecipeIndexDecraftLocked(idx, downedBoss3, downedGolemBoss)) return false;
  if (idx < 0) return false;
  const r = recipeAt(idx)!;
  return Math.floor(stack / r.createStack) > 0;
}

/** Item.FindDecraftAmount（Item.cs:49063-49071）：stack / createStack(向下取整) */
export function findDecraftAmount(vid: number, stack: number, crimsonWorld: boolean): number {
  const idx = getDecraftingRecipeIndex(getShimmerEquivalentType(vid, true), crimsonWorld);
  if (idx < 0) return -1;
  return Math.floor(stack / recipeAt(idx)!.createStack);
}

/** RecipeGroup.DecraftItemId（RecipeGroup.cs:59）：组内**价值最低**物品代表
 *  （OrderBy(value).First()——等价取组注册序首个,稳定排序）。
 *  ⚠️ value 表语义:value JSON 只存 SetDefaults case 内显式赋值;**缺表 = 原版
 *  value 0**（Item.ResetStats :48596 的重置默认）,绝非"未知"。曾误用
 *  MAX_SAFE_INTEGER 回退 → Wood 组(9 无显式 value=0)被 5215(显式 value)抢位,
 *  与原版"木配方 decraft 返还普通木材"相悖 */
const GROUP_DECRAFT_ID = new Map<number, number>();
export function groupDecraftItemId(groupId: number): number {
  const hit = GROUP_DECRAFT_ID.get(groupId);
  if (hit !== undefined) return hit;
  const items = RECIPE_GROUP_ITEMS[String(groupId)] ?? [];
  let best = items[0] ?? 0;
  let bestV = Number.MAX_SAFE_INTEGER;
  for (const it of items) {
    const v = (itemValueJson as Record<string, number>)[String(it)] ?? 0; // 缺表=原版 0(ResetStats 默认)
    if (v < bestV) { bestV = v; best = it; }
  }
  GROUP_DECRAFT_ID.set(groupId, best);
  return best;
}

/** 材料 → decraft 返还物（WorldItem.cs:1895-1897 IsRecipeGroup ? DecraftItemId : id）：
 *  材料命中本配方任一 acceptedGroup → 返组代表（groupDecraftItemId） */
function decraftItemFor(r: NonNullable<ReturnType<typeof recipeAt>>, itemId: number): number {
  for (const gid of r.groups) {
    const items = RECIPE_GROUP_ITEMS[String(gid)];
    if (items && (items as number[]).includes(itemId)) return groupDecraftItemId(gid);
  }
  return itemId;
}

export interface DecraftPile { vid: number; stack: number }

export interface DecraftOutcome {
  /** 返还垛（配方材料序；单垛 ≤9999，超额拆垛 = 原版逐垛独立 Item.NewItem :1913-1921） */
  piles: DecraftPile[];
  /** 与 piles 等长的材料序号（1 基 = 原版 num7，:1900/1929-1936 逐材料递增）：
   *  拆垛共享同一序号、炼金全蒸发的材料序号不空缺——散射速度按【材料】而非按垛 */
  slots: number[];
  /** 原物品消耗量（次数 × createStack，:1927） */
  consumed: number;
  /** ≥2 材料 → 掉落物按序号抛撒（requiredItem[1].stack > 0，:1882） */
  spread: boolean;
}

// ---- NB-G 种子注入（2026-09-03）：炼金蒸发 rand3 专用世界种子流 ----

let decraftRng: RNG | null = null;
let decraftRngWorld: object | null = null;

/** 炼金蒸发 rand3 消费口（Main.rand.Next(3) 的仓内替位）。★WorldEvolution 同型
 *  （evolution/WorldEvolution.ts:161 `new RNG(host.seed ?? 0)` 专用实例、跨 tick 续流
 *  不重置）：以【世界实例身份 + 种子】为键的模块级专用流——世界加载/换档（World
 *  对象更换）即重建新流,同世界内逐次 decraft 续流不重置（原版 Main.rand 全局演进
 *  语义的种子化投影）。缺省 seed 0 = 离线测试兜底（同样确定性）。
 *  同 seed 两跑逐位相同（tests/decraft.test.ts「同种子两跑」锚）——曾缺注入落
 *  Math.random()（炼金蒸发不可复现,NB-G 唯一硬阻塞）。 */
export function decraftRand3(world?: { seed?: number } | null): () => number {
  if (!decraftRng || decraftRngWorld !== (world ?? null)) {
    decraftRngWorld = world ?? null;
    decraftRng = new RNG(world?.seed ?? 0);
  }
  const rng = decraftRng;
  return () => Math.floor(rng.next() * 3);
}

/** decraft 返还计算（WorldItem.GetShimmered :1879-1934 纯函数化）：
 *  无配方 / 次数 0 → null。rand3 语义 = Main.rand.Next(3)，仅 alchemy 配方消费
 *  （逐单位 1/3 概率蒸发，:1904-1911）；注入以便测试确定性断言 */
export function decraftOutcome(
  vid: number, stack: number,
  crimsonWorld: boolean,
  rand3: () => number = () => Math.floor(Math.random() * 3),
): DecraftOutcome | null {
  const idx = getDecraftingRecipeIndex(getShimmerEquivalentType(vid, true), crimsonWorld);
  if (idx < 0) return null;
  const r = recipeAt(idx)!;
  const times = Math.floor(stack / r.createStack);
  if (times <= 0) return null;
  // AddCustomShimmerResult 覆盖表（:1884-1891）替代材料表
  const entries: Array<{ id: number; stack: number }> = r.shimmer?.length
    ? r.shimmer.map(([id, st]) => ({ id, stack: st }))
    : r.items;
  const piles: DecraftPile[] = [];
  const slots: number[] = [];
  let num7 = 0;                                 // :1900 材料序号，逐材料 +1（1 基）
  for (const e of entries) {
    if (e.id <= 0 || e.stack <= 0) break;      // :1898-1901 requiredItem 空位终止
    num7++;
    let qty = times * e.stack;
    if (r.alchemy) {
      for (let u = qty; u > 0; u--) if (rand3() === 0) qty--;
    }
    const target = decraftItemFor(r, e.id);
    while (qty > 0) {
      const chunk = Math.min(qty, 9999);       // :1913-1916
      piles.push({ vid: target, stack: chunk });
      slots.push(num7);                        // 拆垛同序号（:1929-1936 同一 num7）
      qty -= chunk;
    }
  }
  return { piles, slots, consumed: times * r.createStack, spread: (r.items[1]?.stack ?? 0) > 0 };
}

/** Item.CanShimmer（Item.cs:49045-49061）全分支 1:1：
 *  ① 月后锁 → false（:49048）
 *  ② 560 史莱姆王冠且雨进行中 → false（:49052）
 *  ③ (:49056) 无转化目标 ∧ 不可分解 ∧ 非钱币 ∧ (非 4986 或已解锁彩虹史莱姆)
 *     → 只剩 makeNPC > 0 一条路（:49058）——4986 未解锁时特例放行（:49060）
 *  decraftCtx 缺省 = 不启用 decraft 判定（调用方旧签名兼容） */
export function canShimmerItem(
  vid: number, downedMoonlord = false, moonPhase?: number,
  decraftCtx?: { stack: number; crimsonWorld: boolean; downedBoss3: boolean; downedGolemBoss: boolean },
  shimmerCtx?: { slimeRain?: boolean; rainbowSlimeUnlocked?: boolean },
): boolean {
  if (isItemTransformLocked(vid, downedMoonlord)) return false;
  if (vid === 560 && shimmerCtx?.slimeRain) return false;
  const special4986 = vid === 4986 && !shimmerCtx?.rainbowSlimeUnlocked; // :49056 反例
  if (!special4986
    && getTransformToItem(vid, moonPhase) <= 0
    && !COMMON_COIN.has(vid)
    && !(decraftCtx && isItemDecraftableAndUnlocked(vid, decraftCtx.stack, decraftCtx.crimsonWorld, decraftCtx.downedBoss3, decraftCtx.downedGolemBoss))) {
    return makeNpcOfItem(vid) > 0;
  }
  return true;
}

/** Item.makeNPC（Item.cs:47613-47626 DefaultToCapturedCritter）：瓶中小动物物品 →
 *  放生 NPC id。tools/extract-shimmer.mjs 从 DefaultToCapturedCritter 调用点提取
 *  （含 (short)(type - 4334 + 595) 族工厂式逐标签求值），0 = 非放生物品 */
export function makeNpcOfItem(vid: number): number {
  return ITEM_MAKE_NPC[vid] ?? 0;
}

/** 钱币→微光化币面额放大（WorldItem.cs:1791-1810）：铜 ×1 / 银 ×100 / 金 ×10000 /
 *  铂 stack 钳 1 后 ×1000000。返回入 coinLuck 的铜币面额（stack 一并放大） */
export function coinLuckAmount(vid: number, stack: number): number {
  switch (vid) {
    case 72: return stack * 100;
    case 73: return stack * 10000;
    case 74: return Math.min(stack, 1) * 1000000;
    default: return stack; // 71 铜币 ×1
  }
}

// ============ NPC 侧（NPC.GetShimmered，NPC.cs:92502-92584） ============

/** NPCID.Sets.ShimmerTransformToNPC（→ NPC.Transform 保持实体） */
export function npcShimmerTransformTo(npcId: number): number {
  const t = NPC_TRANSFORM[npcId];
  return t !== undefined && t >= 0 ? t : -1;
}

/** NPCID.Sets.ShimmerTransformToItem（→ 掉微光化物品后消散） */
export function npcShimmerTransformToItem(npcId: number): number {
  const t = NPC_TRANSFORM_ITEM[npcId];
  return t !== undefined && t >= 0 ? t : -1;
}

/** NPCID.Sets.ShimmerTownTransform（城镇 NPC 微光变体，ai[0]=25） */
export function isNpcTownShimmerable(npcId: number): boolean {
  return NPC_TOWN_TRANSFORM.has(npcId);
}

/** NPCID.Sets.ShimmerImmunity（NPC.cs:17773 `buffImmune[353] = ShimmerImmunity[type]`；
 *  NPC.cs:93313-93321 buff 353 挂不上 → shimmering 恒 false → 永不触发 GetShimmered）。
 *  入口门语义：**免表只挡 buff 进场**，aiStyle 67 小动物的直通分支（:34586-34598
 *  中心格微光即刻 GetShimmered，不经 buff）不受本表约束 */
export function isNpcShimmerImmune(npcId: number): boolean {
  return NPC_SHIMMER_IMMUNITY.has(npcId);
}

// ============ 玩家脱困传送（ShimmerHelper.FindSpotWithoutShimmer 近似） ============

/** TryFindingShimmerFreeSpot（Player.cs:28414-28469）净效果版：以 (tx,ty) 为心，
 *  半径 r ∈ {1,3,…,59}（原版 num=60 循环步 2）找第一个满足 IsSpotShimmerFree
 *  （ShimmerHelper.cs:67-82 三判）的落点：
 *  ① 玩家盒 3 格高（y-2..y）无实心无微光（SolidCollision(landing, w, h)）
 *  ② 下方 100px（7 格）内有地面（SolidCollision(+height, 100, allowSolidTop)——
 *     非紧贴一格；旧实现过严致湖底斜坡/半砖旁找不到）
 *  ③ 玩家盒 + 下方 100px 全无微光（WetCollision(landing, w, h+100) && shimmer → 拒）——
 *     旧实现漏此判：湖面之上 3 格空气 + 湖面在 7 格内的列被当有效落点 → 传送后
 *     落回湖里（用户实测"传送完还在湖里"）
 *  **三层兜底**（原版 :28442-28469）：玩家周围失败 → 世界出生点周围 →
 *  主出生点（本仓二者同源 spawnX/Y，合并为一层）——保证必能脱困，不会永久卡住 */
export function findShimmerFreeSpot(
  st: TileStore, tx: number, ty: number,
  fallbackTx?: number, fallbackTy?: number,
): { x: number; y: number } | null {
  const clear = (x: number, y: number): boolean => {
    for (let j = y - 2; j <= y; j++) {
      if (!st.inBounds(x, j)) return false;
      const i = st.idx(x, j);
      if (st.isSolid(x, j) || (st.liquid[i] > 0 && st.liquidType[i] === 4)) return false;
    }
    return true;
  };
  // 原版第二判：落点下方 100px（约 7 格）内存在 solid 或 solidTop（allowSolidTop=true）
  const groundBelow = (x: number, y: number): boolean => {
    for (let j = y + 1; j <= y + 7; j++) {
      if (!st.inBounds(x, j)) return false;
      if (st.isSolid(x, j) || st.isPlatform(x, j)) return true;
    }
    return false;
  };
  // 原版第三判（ShimmerHelper.cs:80-81 WetCollision(landing, w, h+100)）：落点
  // 下方 100px 内不得有微光——微光列（如湖面正上方的空气）视为无效落点
  const shimmerBelow = (x: number, y: number): boolean => {
    for (let j = y + 1; j <= y + 7; j++) {
      if (!st.inBounds(x, j)) return false;
      const i = st.idx(x, j);
      if (st.liquid[i] > 0 && st.liquidType[i] === 4) return false;
    }
    return true;
  };
  const search = (cx: number, cy: number): { x: number; y: number } | null => {
    for (let r = 1; r < 60; r += 2) {
      // 切比雪夫半径逐圈外扩（原版 i 循环步 2 语义；原版仅扫环上 8 点/圈，
      // 此处全量整数扫描为其超集——命中的落点满足同一谓词，行为相容）
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < r - 1) continue; // 只扫外环
          const x = cx + dx, y = cy + dy;
          if (!st.inBounds(x, y) || !groundBelow(x, y) || !shimmerBelow(x, y)) continue;
          if (clear(x, y)) return { x, y };
        }
      }
    }
    return null;
  };
  return search(tx, ty)
    ?? (fallbackTx !== undefined && fallbackTy !== undefined ? search(fallbackTx, fallbackTy) : null);
}

/** 世界坐标落点 → 玩家传送位（左上角 px 锚，ShimmerHelper.cs:9 + Player.cs:28400-28402）。
 *  原版 FindSpotWithoutShimmer 返回 vector2 = (tile*16, tile*16) + (-width/2, -height)——
 *  即【玩家盒左上角】坐标（脚底正好贴 tile 底边）；ShimmerUnstuck 再 Teleport(vector+(0,-2))。
 *  旧实现 {x: tile*16, y: tile*16-2} 漏掉 -width/2/-height → 盒顶对齐格顶、脚部沉入
 *  下方实心 40px = 用户实测"半身在地里"。默认 20/42 = Player 构造尺寸（Player.cs:55083）。 */
export function shimmerTeleportPos(
  spot: { x: number; y: number }, w = 20, h = 42,
): { x: number; y: number } {
  return { x: spot.x * TILE - w / 2, y: spot.y * TILE - h - 2 };
}
