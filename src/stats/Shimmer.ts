// 微光（Shimmer）实体转化系统 1:1（1.4.5.6 反编译 = Terarria1456）：
//   - 物品转化 WorldItem.GetShimmered（WorldItem.cs:1781-1931）：
//       入微光 → Shimmering()(:806-840) shimmerTime +0.01/t，>0.9 → GetShimmered
//       ① 钱币（CommonCoin 71-74）→ 面额放大入 coinLuck（铜 1× / 银 ×100 /
//          金 ×10000 / 铂 stack 钳 1 后 ×1000000），AddCoinLuck(:17943-17955 距离<1000px)
//       ② ShimmerTransformToItem 有对应 → SetDefaults(target) 原堆叠保留
//       ③ decraft（ShimmerTransforms.GetDecraftingRecipeIndex + RecipeSets 月后/
//          骷髅王/石巨人锁）——需运行时配方引擎，登记未移植（见文件尾 GAP 清单）
//       ④ makeNPC（小动物笼放生物品）→ NPC.ReleaseNPC，登记
//       ⑤ 特例 4986 彩虹史莱姆解锁 / 560 史莱姆雨，登记
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
//   - 转化表来源：tools/extract-shimmer.mjs 从 ItemID.cs/NPCID.cs Sets 提取 →
//       src/data/vanilla-shimmer.json（312 物品对 + 114 NPC 对 + 15 NPC→物品 +
//       29 城镇变体 + CommonCoin/PostMoonlord）
//   GAP 登记（未移植）：
//     - decraft 反 craft（需配方引擎运行时 + RecipeSets.PostSkeletron/PostGolem 锁）
//     - makeNPC 小动物放生、4986 彩虹史莱姆解锁、560 史莱素雨触发
//     - 3461 月相砖:已按 GetLunarBrickTransformFromMoonPhase(:113-125)接通(月相参)
//     - 微光视觉（shimmerTransparency 半透明 / 微光化物品上浮白光 dust 309）
//     - 小动物（Critter）入微光转化（aiStyle 67 族）、Boss 免微光名单
//     - 联机同步（NetMessage 145/146 ShimmeredItem/ShimmerEffect）
import shimmerJson from '../data/vanilla-shimmer.json';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { viIdFromKey } from '../data/vanillaItemCombat';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';

type Json = typeof shimmerJson;
const ITEM_TRANSFORM = (shimmerJson as Json).itemTransformTo as Record<string, number>;
const ITEM_COUNTS_AS = (shimmerJson as Json).itemCountsAs as Record<string, number>;
const ITEM_COUNTS_AS_DECRAFT = (shimmerJson as Json).itemCountsAsDecraft as Record<string, number>;
const ITEM_POST_MOONLORD = new Set<number>((shimmerJson as Json).itemPostMoonlord as number[]);
const COMMON_COIN = new Set<number>((shimmerJson as Json).commonCoin as number[]);
const NPC_TRANSFORM = (shimmerJson as Json).npcTransformTo as Record<string, number>;
const NPC_TRANSFORM_ITEM = (shimmerJson as Json).npcTransformToItem as Record<string, number>;
const NPC_TOWN_TRANSFORM = new Set<number>((shimmerJson as Json).npcTownTransform as number[]);

// ============ 内部物品 id ↔ 原版物品 id ============

/** 原生 key（钱币/凝胶等）→ 原版 id（Game.ts NATIVE_ITEM_VID 同表；vi_ 键走前缀解析） */
const NATIVE_ITEM_VID: Record<string, number> = {
  coin_copper: 71, coin_silver: 72, coin_gold: 73, coin_platinum: 74,
  gel: 23, torch: 8, lens: 236, stone_block: 3, dirt_block: 2, wood: 9,
  lesser_healing_potion: 28,
};

/** 内部 item id → 原版 item id（无映射 -1） */
export function vanillaIdOfItem(itemId: number): number {
  const def = ITEM_DEFS[itemId];
  if (!def) return -1;
  if (def.vid !== undefined) return def.vid;
  const vi = viIdFromKey(def.key);
  if (vi >= 0) return vi;
  return NATIVE_ITEM_VID[def.key] ?? -1;
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

/** Item.CanShimmer（Item.cs:49045-49068）本仓子集：
 *  可转 = 未锁 + (有转化目标 ∨ 钱币)。decraft/makeNPC/特例未移植（GAP） */
export function canShimmerItem(vid: number, downedMoonlord = false, moonPhase?: number): boolean {
  if (isItemTransformLocked(vid, downedMoonlord)) return false;
  return getTransformToItem(vid, moonPhase) > 0 || COMMON_COIN.has(vid);
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

// ============ 玩家脱困传送（ShimmerHelper.FindSpotWithoutShimmer 近似） ============

/** TryFindingShimmerFreeSpot（Player.cs:28414-28469）净效果版：以 (tx,ty) 为心，
 *  半径 r ∈ {1,3,…,59}（原版 num=60 循环步 2）找第一个「3 格高无实心无微光 +
 *  下方 100px（7 格）内有地面（IsSpotShimmerFree :28477 第二判——原版要求
 *  SolidCollision(+height, 100)，非紧贴一格；旧实现过严致湖底斜坡/半砖旁找不到）」
 *  的落点。**三层兜底**（原版 :28442-28469）：玩家周围失败 → 世界出生点周围 →
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
  const search = (cx: number, cy: number): { x: number; y: number } | null => {
    for (let r = 1; r < 60; r += 2) {
      // 切比雪夫半径逐圈外扩（原版 i 循环步 2 语义；原版仅扫环上 8 点/圈，
      // 此处全量整数扫描为其超集——命中的落点满足同一谓词，行为相容）
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < r - 1) continue; // 只扫外环
          const x = cx + dx, y = cy + dy;
          if (!st.inBounds(x, y) || !groundBelow(x, y)) continue;
          if (clear(x, y)) return { x, y };
        }
      }
    }
    return null;
  };
  return search(tx, ty)
    ?? (fallbackTx !== undefined && fallbackTy !== undefined ? search(fallbackTx, fallbackTy) : null);
}

/** 世界坐标落点 → 玩家传送位（ShimmerUnstuck :28400-28402：spot + (0,-2) 像素） */
export function shimmerTeleportPos(spot: { x: number; y: number }): { x: number; y: number } {
  return { x: spot.x * TILE, y: spot.y * TILE - 2 };
}
