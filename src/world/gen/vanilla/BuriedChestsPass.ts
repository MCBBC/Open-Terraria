// 原版 "Buried Chests"(L7907)+ "Surface Chests"(L8019)+ "Water Chests"(L8058)移植。
// 样式语义(AddBuriedChest L21335+ / PlaceChestDirect L34112:frameX=36*style 横排):
//   -1 默认:y≥ws+25 → 金(1);冰系 tile(147/161/162)→ 冰箱(11)+冰系战利品;
//   地下沙漠 → tile467 style10+沙漠战利品;y>h-205 → 地狱箱(4)+地狱武器序;
//   Water Chests pass 固定 style17(水箱)+水中战利品;地表箱 style0 木箱(墙 244 → 12 天空箱)。
// 宝箱数量(Configuration.json):CaveChestCount 35-40 ScaleWith:WorldArea(÷5040000)、
//   UnderworldChestCount 10-15 ScaleWith:WorldWidth(÷4200)。
// 战利品 = AddBuriedChest(cs:35920-37560)1:1:按深度四分支(地表/金/洞穴/地狱),
//   主件 + 概率杂物表 + 主题旗标池(ice/desert/ivy/water/hell/sky 附加物)。
import { LIQUID_TYPE } from '../../TileStore';
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';
import { idsByVanillaSheet } from './TileRunner';
import { solidTile as solidTileHB } from './HalfBrickPass';

const CHEST = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const THIN_ICE = TILE_BY_KEY['thin_ice']!;
const ALTAR = TILE_BY_KEY['v_26_altars']!;
const TALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;
const LARVA = TILE_BY_KEY['v_231_larva']!;
/** TileID.Sets.Boulders（TileID.cs:195）：138/484/664/665/711-716 */
const BOULDER_TILES = idsByVanillaSheet(138, 484, 664, 665, 711, 712, 713, 714, 715, 716);

export type ChestSink = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }>;

/** 宝箱主题旗标(AddBuriedChest flag2/3/4/5/6/8) */
export interface ChestFlags {
  ice?: boolean;    // flag2 冰箱(style 11)
  desert?: boolean; // flag3 沙漠箱(tile467 style10)
  ivy?: boolean;    // flag4 常春藤箱(style 10)
  water?: boolean;  // flag5 水箱(style 17)
  sky?: boolean;    // flag6 天空箱(style 12)
  hell?: boolean;   // flag8 地狱箱(style 4)
  wooden?: boolean; // flag 木箱(style 0)——地表战利品分支门禁
  mushroom?: boolean; // flag7 蘑菇箱(style 32,cs:36201)
  dungeon?: boolean;  // flag9 地牢箱（位置 IsDungeon 或上锁生物群系箱,cs:36211/:36219）
  skyTheme?: boolean; // flag12 天空主题箱（style 13 或主件 159/65/158/2219,cs:36227）
  temple?: boolean;   // flag13 神庙箱（style 16,cs:36206）
  lockedBiome?: boolean; // flag10 上锁生物群系箱（IsLockedDungeonBiomeChest,cs:36219）
}

/** Main.wallDungeon（Main.cs:10507-10513）：7/8/9 + 94-99（不含神庙墙 87——
 *  cs:17109 的 `wallDungeon[wall] || wall == 87` 是两道独立门） */
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
function isDungeonWall(wl: number): boolean {
  return DUNGEON_WALLS.has(wl);
}

// ---------- 战利品辅助 ----------
/** 原版物品 id → 本仓库物品 id;未注册返回 -1。
 *  VANILLA_ITEM_KEY_BY_ID 全量映射（vi_ 表覆盖 6146 件）——旧 vanillaItemKey
 *  只认 snake_case 显式注册（少数），宝箱战利品曾整条静默丢失 */
function vid(id: number): number {
  const k = VANILLA_ITEM_KEY_BY_ID[id];
  return k ? (ITEM_BY_KEY[k] ?? -1) : -1;
}

/** vi_N_… 键反解原版 id;legacy 键返回 null(主件直接用物品 id 入箱) */
function vanillaIdOfKey(key: string): number | null {
  const m = /^vi_(\d+)_/.exec(key);
  return m ? parseInt(m[1], 10) : null;
}

/** 锭 id(GenVars.copperBar 等语义:按本世界替代矿档位) */
function barIds(gs: GenState): { copper: number; iron: number; silver: number; gold: number } {
  const keyOf = (t: number) => TILE_DEFS[t]?.key ?? '';
  return {
    copper: keyOf(gs.oreTiers.copper).includes('tin') ? 703 : 20,
    iron: keyOf(gs.oreTiers.iron).includes('lead') ? 704 : 22,
    silver: keyOf(gs.oreTiers.silver).includes('tungsten') ? 705 : 21,
    gold: keyOf(gs.oreTiers.gold).includes('platinum') ? 706 : 19,
  };
}

/** 地狱箱主件序：Reset 已按原版位置洗牌（WorldGen.ts vanillaTerrain ④，
 *  cs:11262-11274——种子等价要求该洗牌发生在 pass 循环前，此处只轮换取用） */
function nextHellItem(gs: GenState): number {
  const items = gs.hellChestItems ?? [274, 220, 112, 218, 3019]; // 兜底（探针直调）
  return items[gs.hellChestIdx % items.length]; // 自增移到放置成功后（cs:36257-36264）
}

/** Chest.NearOtherChests（Terraria/Chest.cs:524-538）1:1：[x-25,x+25) × [y-8,y+8)
 *  内已有 BasicChest{21,467} → true。本仓"已有箱"按 chest/dresser 键族近似
 *  （与 MicroBiomesPass isContainer/TileID.Sets.IsAContainer 同口径，含 467/88） */
function nearOtherChests(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 25; i < x + 25; i++) {
    for (let j = y - 8; j < y + 8; j++) {
      if (!st.inBounds(i, j)) continue;   // Framing.GetTileSafely 界外 = 空格
      const k = st.idx(i, j);
      if (!st.flags[k]) continue;
      const key = TILE_DEFS[st.type[k]]?.key ?? '';
      if (key.includes('chest') || key.includes('dresser')) return true;
    }
  }
  return false;
}

/** 常春藤箱主件序(GetNextJungleChestItem cs:10130:循环 211/212/213/964 + 稀有替换) */
export function nextJungleItem(gs: GenState, rng: RNG): number {
  let result = [211, 212, 213, 964][gs.jungleItemIdx % 4];
  if (rng.int(0, 49) === 0) result = 753;       // 1/50 海草
  else if (rng.int(0, 14) === 0) result = 2292; // 1/15 玻璃钢鱼竿
  else if (rng.int(0, 19) === 0) result = 3017; // 1/20 花之靴
  gs.jungleItemIdx++;
  return result;
}

interface LootCtx { rng: RNG; gs: GenState; gy: number; flags: ChestFlags; mainKey: string | null; worldH: number }

/**
 * AddBuriedChest 战利品主体(cs:36283-37360)1:1:按深度四分支。
 * mainVanillaId>0 → 主题主件(冰箱/沙箱/常春藤/水箱/地狱/金字塔等),
 * 否则按分支掷默认主件;各分支再按原版顺序逐项掷概率杂物表。
 */
export function rollChestLoot(ctx: LootCtx, mainVanillaId: number): Array<{ id: number; stack: number } | null> {
  const { rng, gs, gy, flags } = ctx;
  const bars = barIds(gs);
  const out: Array<{ id: number; stack: number }> = [];
  const push = (v: number, stack = 1) => {
    const id = vid(v);
    if (id >= 0 && out.length < 40) out.push({ id, stack });
  };
  const pick = (arr: number[]) => arr[rng.int(0, arr.length - 1)];

  // ---- 分支判定(cs:36283 flag23 / 36563 / 36789 / 37163)----
  // 地表分支仅木箱(style0 flag)/天空箱(style12 flag6)(cs:36283 `flag23 && (flag || flag6)`)
  const isSurface = gy < gs.worldSurface + 25 && !!(flags.wooden || flags.sky);
  const isGold = gy < gs.rockLevel;

  if (isSurface) {
    // ===== 地表木箱/天空箱(cs:36283-36468)=====
    if (mainVanillaId > 0) {
      push(mainVanillaId);
      if (mainVanillaId === 832) push(933); // cs:36287-36291 世界树主件后插叶法杖
      if (mainVanillaId === 848) push(866); // cs:36283-36286 金字塔主件附赠法老袍
      if (flags.sky) {
        if (rng.int(0, 2) === 0) push(5629);
        if (rng.int(0, 5) === 0) push(rng.int(0, 1) === 0 ? 4429 : 4427);
        if (rng.int(0, 2) !== 0) push(5528);
      }
    } else {
      push(pick([280, 281, 284, 285, 953, 946, 3068, 3069, 3084, 4341]));
    }
    if (rng.int(0, 5) === 0) push(282, rng.int(40, 75));   // 1/6 荧光棒
    if (rng.int(0, 5) === 0) push(279, rng.int(150, 300)); // 1/6 飞刀
    if (rng.int(0, 5) === 0) {                             // 1/6 草药袋(附赠叠层)
      let n = 1;
      if (rng.int(0, 4) === 0) n += rng.int(0, 1);
      if (rng.int(0, 9) === 0) n += rng.int(0, 2);
      push(3093, n);
    }
    if (rng.int(0, 5) === 0) {                             // 1/6 虫罐
      let n = 1;
      if (rng.int(0, 4) === 0) n += rng.int(0, 1);
      if (rng.int(0, 9) === 0) n += rng.int(0, 2);
      push(4345, n);
    }
    if (rng.int(0, 2) === 0) push(168, rng.int(3, 5));     // 1/3 手雷
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? bars.copper : bars.iron, rng.int(3, 10));
    if (rng.int(0, 1) === 0) push(965, rng.int(50, 100));  // 绳
    if (rng.int(0, 2) !== 0) push(rng.int(0, 1) === 0 ? 40 : 42, rng.int(25, 50)); // 木箭/手里剑
    if (rng.int(0, 1) === 0) push(28, rng.int(3, 5));      // 弱效治疗药水
    if (rng.int(0, 2) !== 0) push(2350, rng.int(3, 5));    // 回城药水
    if (rng.int(0, 2) > 0) push(pick([292, 298, 299, 290, 2322, 2325]), rng.int(1, 2));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 8 : 31, rng.int(10, 20));  // 火把/瓶子
    if (rng.int(0, 1) === 0) push(72, rng.int(10, 29));    // 银币
    if (rng.int(0, 1) === 0) push(9, rng.int(50, 99));     // 木材
  } else if (isGold) {
    // ===== 地下金箱(ws+25 ≤ gy < rockLevel,cs:36563-36789)=====
    // flag12 派生（cs:36227）：主件 159 气球/65 抓钩/158 瓶中云/2219 星磁铁 或 style13
    const flag12 = !!flags.skyTheme || mainVanillaId === 159 || mainVanillaId === 65
      || mainVanillaId === 158 || mainVanillaId === 2219;
    if (mainVanillaId > 0) {
      if (mainVanillaId === 832) push(933); // cs:36549-36553 主件前插叶法杖
      push(mainVanillaId);
      if (flags.water) {
        if (rng.int(0, 1) === 0) push(4425);
        if (rng.int(0, 1) === 0) push(4460);
      }
      if (flag12 && rng.int(0, 39) === 0) push(4978); // cs:36568 1/40 幼翼
      // 蘑菇箱 flag7（cs:36689-36702）：1/2 蘑菇矿车；1/3 三件套
      if (flags.mushroom) {
        if (rng.int(0, 1) === 0) push(4450);
        if (rng.int(0, 2) === 0) { push(4779); push(4780); push(4781); }
      }
      // 地牢箱 flag9 门（cs:36597-36611，flag10 上锁箱不给钥匙）：
      // 首只暗影钥匙必给（无则 1/3）、Ram Rune 1/8
      if (flags.dungeon && !flags.lockedBiome) {
        if (!gs.generatedShadowKey || rng.int(0, 2) === 0) {
          gs.generatedShadowKey = true;
          push(329);
        }
        if (!gs.generatedRamRune || rng.int(0, 7) === 0) {
          gs.generatedRamRune = true;
          push(5465);
        }
      }
      // ★ivy(3360/3361/4426/5525) 附赠原版只在洞穴分支（cs:36864-36880）——
      // 金箱分支无 flag4 段（cs:36545-36703），曾误带致常春藤箱落金箱深度多整套附赠
    } else {
      push(pick([49, 50, 53, 54, 5011, 975]));
      if (rng.int(0, 19) === 0) push(997);                    // 1/20 提炼机
      else if (rng.int(0, 19) === 0) { push(930); push(931, rng.int(25, 50)); } // 1/20 信号枪+闪光弹
    }
    if (flags.desert) { if (rng.int(0, 2) === 0) push(4423, rng.int(10, 19)); }
    else if (rng.int(0, 2) === 0) push(166, rng.int(10, 19)); // 炸弹
    if (rng.int(0, 4) === 0) push(52);                        // 1/5 天使雕像
    if (rng.int(0, 2) === 0) push(965, rng.int(50, 100));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? bars.iron : bars.silver, rng.int(5, 14));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 40 : 42, rng.int(25, 49));
    if (rng.int(0, 1) === 0) push(28, rng.int(3, 5));
    if (rng.int(0, 2) > 0) push(pick([289, 298, 299, 290, 303, 291, 304, 2322, 2329]), rng.int(1, 2));
    if (rng.int(0, 2) !== 0) push(2350, rng.int(2, 4));
    if (rng.int(0, 1) === 0) push(flags.ice ? 974 : 8, rng.int(10, 20)); // 冰火把/火把 cs:36820 Next(11)+10=[10,20]（曾 10,19 漏 20）
    if (rng.int(0, 1) === 0) push(72, rng.int(50, 89));
  } else if (gy <= ctx.worldH - 250) {
    // ===== 洞穴箱(rockLevel ≤ gy ≤ h-250,cs:36789-37163)=====
    // ★门勘误：洞穴/地狱【战利品】分界是 h-250（cs:36839）；h-205 是【样式】门
    // （cs:36162 style4）。[h-250,h-205) 带 = 金箱样式 + 地狱战利品（原版如此）——
    // 曾误并一道门带出地狱战利品装洞穴箱
    if (mainVanillaId > 0) {
      push(mainVanillaId);
      if (flags.ice && rng.int(0, 4) === 0) push(3199);       // 1/5 冰镜
      if (flags.desert) {
        if (rng.int(0, 6) === 0) push(4346);                  // 1/7 沙漠矿车
        if (rng.int(0, 14) === 0) push(4066);                 // 1/15 沙漠矿车(副)
      }
      if (flags.ivy) {
        if (!gs.gennedMahoganyWands || rng.int(0, 4) === 0) {
          gs.gennedMahoganyWands = true;
          push(3360); push(3361);
        }
        if (rng.int(0, 9) === 0) push(4426);
        if (rng.int(0, 9) === 0) push(5525);
      }
      if (flags.water) {
        if (rng.int(0, 1) === 0) push(4425);
        if (rng.int(0, 1) === 0) push(4460);
      }
      // 蘑菇箱 flag7（cs:37007-37021：1/2 矿车 否则三件套）
      if (flags.mushroom) {
        if (rng.int(0, 1) === 0) push(4450);
        else { push(4779); push(4780); push(4781); }
      }
      // 地牢箱 flag9 门（cs:36892-36906，flag10 上锁箱不给钥匙）
      if (flags.dungeon && !flags.lockedBiome) {
        if (!gs.generatedShadowKey || rng.int(0, 2) === 0) {
          gs.generatedShadowKey = true;
          push(329);
        }
        if (!gs.generatedRamRune || rng.int(0, 7) === 0) {
          gs.generatedRamRune = true;
          push(5465);
        }
      }
    } else {
      // 主件(cs:36911-36975)：num25=Next(7) 先掷恒消耗（种子对齐），再掷 906/997 门
      const num25 = rng.int(0, 6);
      if (rng.int(0, 19) === 0 && gy > gs.lavaLine) push(906);
      else if (rng.int(0, 14) === 0) push(997);
      else {
        if (num25 === 6) { push(930); push(931, rng.int(25, 50)); }
        else push([49, 50, 53, 54, 5011, 975][num25]);
      }
    }
    if (rng.int(0, 4) === 0) push(flags.ice ? 5120 : 43);     // 1/5(冰箱特殊项/可疑眼球)
    if (rng.int(0, 2) === 0) push(167);                       // 1/3 炸药
    if (rng.int(0, 3) === 0) push(51, rng.int(25, 50));       // 1/4 小丑箭
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? bars.gold : bars.silver, rng.int(3, 10));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 41 : 279, rng.int(25, 50)); // 烈焰箭/飞刀
    if (rng.int(0, 1) === 0) push(188, rng.int(3, 5));        // 治疗药水
    if (rng.int(0, 2) > 0) push(pick([296, 295, 299, 302, 303, 305]), rng.int(1, 2));
    if (rng.int(0, 2) > 1) push(pick([301, 297, 304, 2329, 2351, 2326]), rng.int(1, 2));
    if (rng.int(0, 1) === 0) push(2350, rng.int(2, 4));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? (flags.ice ? 974 : 8) : 282, rng.int(15, 30)); // 火把/荧光棒
    if (rng.int(0, 1) === 0) push(73, rng.int(1, 2));         // 金币
  } else {
    // ===== 地狱箱(gy > h-205,cs:37163-37360;与 style 4 同门)=====
    if (mainVanillaId > 0) {
      push(mainVanillaId);
      if (rng.int(0, 4) === 0) push(5010);                    // 1/5 宝藏磁铁
      if (rng.int(0, 9) === 0) push(4443);
      if (rng.int(0, 9) === 0) push(4737);
      if (rng.int(0, 9) === 0) push(4551);
    } else {
      push([49, 50, 53, 54][rng.int(0, 3)]);
    }
    if (rng.int(0, 2) === 0) push(167);                       // 1/3 炸药
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 117 : bars.gold, rng.int(15, 29)); // 陨铁锭/金锭
    if (rng.int(0, 1) === 0) {
      // 地狱火箭矢 或 银弹(银矿为钨时换钨弹 4915,cs:37242)
      const silverIsTungsten = (TILE_DEFS[gs.oreTiers.silver]?.key ?? '').includes('tungsten');
      push(rng.int(0, 1) === 0 ? 265 : (silverIsTungsten ? 4915 : 278), rng.int(50, 74));
    }
    if (rng.int(0, 1) === 0) push(227, rng.int(15, 20));      // 再生药水 cs:37290 Next(6)+15=[15,20]（曾 15,29）
    if (rng.int(0, 3) > 0) push(pick([296, 295, 293, 288, 294, 297, 304, 2323]), rng.int(1, 2));
    if (rng.int(0, 2) > 1) push(pick([305, 301, 302, 288, 300, 2351, 2348, 2345]), rng.int(1, 2));
    { // cs:37375-37376：先掷 stack27=Next(1,3) 再 Next(2) 选物（顺序对齐种子流）
      const stack27 = rng.int(1, 2);
      push(rng.int(0, 1) === 0 ? 2350 : 4870, stack27); // 回城/回归药水
    }
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 8 : 282, rng.int(15, 29));    // 火把/荧光棒
    if (rng.int(0, 1) === 0) push(73, rng.int(2, 4));         // 金币
  }

  // ---- 尾段(theme 附加,cs:37361-37560;tile 21 箱)----
  const items: Array<{ id: number; stack: number } | null> = out.map((it) => ({ ...it }));
  // 主题尾件
  if (flags.ivy && rng.int(0, 3) === 0) {
    const id = vid(2204);
    if (id >= 0 && items.length < 40) items.push({ id, stack: 1 });
  }
  if (flags.ice && rng.int(0, 6) === 0) {
    const id = vid(2198);
    if (id >= 0 && items.length < 40) items.push({ id, stack: 1 });
  }
  // flag12 天空主题（cs:37424-37474）：1/3 天空磨坊；Next(6) 五选一装饰画；
  // 751 云 [50,100]（cs:37469）
  {
    const f12 = !!flags.skyTheme || mainVanillaId === 159 || mainVanillaId === 65
      || mainVanillaId === 158 || mainVanillaId === 2219;
    if (f12 && rng.int(0, 2) === 0) push(2197);
    if (flags.temple) push(2195); // flag13（cs:37428）：蜥蜴炉恒给
    if (flags.dungeon && rng.int(0, 7) === 0) push(2192); // flag9（cs:37432）1/8 血腥砍刀
    if (f12) {
      const n38 = rng.int(0, 5);
      push([5258, 5226, 5254, 5238, 5255, 5388][n38]); // cs:37440-37468
      push(751, rng.int(50, 100));
    }
    // 上锁生物群系箱 1/2 → 5234 虔诚残片（cs:37494-37498）
    if (flags.lockedBiome && rng.int(0, 1) === 0) push(5234);
    if (flags.temple) { // flag13 尾（cs:37479-37491）：1/5 日耀碑 否则碎片 [3,7]
      if (rng.int(0, 4) === 0) push(2767);
      else push(2766, rng.int(3, 7));
    }
    // voice 门（cs:37557：恒消耗 1 掷）——1/12 命中由调用方后处理（此处保流对齐）
    rng.int(0, 11);
  }
  // 键主件(如金字塔/蛛网/世界树的特殊掉落直接给 key)置首。
  // 同一原版物品可能有两个注册键:调用方显式键(如 vi_832_living_wood_wand)与
  // vid() 的规范驼峰键(items.ts 自动注册循环 vi_832_LivingWoodWand)。mainKey 与
  // mainVanillaId 同源(placeBuriedChest 由键反解)时,先剔除 push(mainVanillaId)
  // 经 vid() 入箱的那份,再按调用方指定键入箱——否则世界树宝箱会出现两根活木魔棒。
  if (ctx.mainKey) {
    const keyId = ITEM_BY_KEY[ctx.mainKey];
    if (keyId !== undefined) {
      if (vanillaIdOfKey(ctx.mainKey) !== null && vanillaIdOfKey(ctx.mainKey) === mainVanillaId) {
        const viaVid = vid(mainVanillaId);
        const idx = items.findIndex((it) => it && it.id === viaVid);
        if (idx >= 0) items.splice(idx, 1);
      }
      if (!items.some((it) => it && it.id === keyId)) items.unshift({ id: keyId, stack: 1 });
    }
  }
  return items;
}

/** AddBuriedChest（1456 cs:35920）下落/门禁段 1:1：
 *  自 j 向下扫至 k < maxTilesY-10，逐行检查 anyShimmer / 幼虫 231 → 整体失败；
 *  首个 SolidTile（半砖/坡面不算，WorldGen.SolidTile）落定。
 *  ±2 邻域（InWorld 100 边距）有 Boulders{138,484,664,665,711-716}/祭坛 26/蜥蜴祭坛 237 → 失败
 *  ——该检查在扫描循环内**逐行**执行（锚=当前行 k，cs:35992-36002），非仅起始行。
 *  notNearOtherChests:true 时经 Chest.NearOtherChests（±25×±8 已有箱）拒绝（cs:36253 透传）。
 *  样式/战利品解析与 2×2 放置沿用本仓库 rollChestLoot 管线。 */
export function placeBuriedChest(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  i: number, j: number, opts: { style?: number; tile?: number; loot?: number | string; flags?: ChestFlags; trySlope?: boolean; notNearOtherChests?: boolean } = {},
): boolean {
  // 下落到地面（cs:35931 `for k=j; k<maxTilesY-10; k++`）
  let gy = j;
  let slopeL = -1, slopeR = -1;   // trySlope 压平的坡度（失败时回填，cs:37567-37575）
  for (; gy < st.h - 10; gy++) {
    const k = st.idx(i, gy);
    if (st.liquid[k] > 0 && st.liquidType[k] === 4) return false;              // anyShimmer → 整体失败
    if (st.flags[k] && st.type[k] === LARVA) return false;                      // 幼虫 231 → 整体失败
    // ★±2 巨石/祭坛拒绝在扫描循环内**逐行**执行（cs:35992-36002，锚=当前行 k：
    //   InWorld(n,num6,100) && Boulders{138,484,664,665,711-716} || 26 || 237）。
    //   曾在进循环前以起始行 j 只查一次——起始行下方 2 格内的滚石/祭坛全部漏检
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const xx = i + dx, yy = gy + dy;
        if (xx < 100 || yy < 100 || xx >= st.w - 100 || yy >= st.h - 100) continue;
        const kk = st.idx(xx, yy);
        if (!st.flags[kk]) continue;
        const tt = st.type[kk];
        if (BOULDER_TILES.has(tt) || tt === ALTAR || tt === TALTAR) return false;
      }
    }
    if (solidTileHB(st, i, gy)) {
      // trySlope 门（cs:35951-35968）：style 17 时 ±30 盒内不得有箱/越界；
      // 压平 (i-1,gy)/(i,gy) 的顶坡供放置（失败时回填）
      if (opts.trySlope && opts.style === 17) {
        for (let l = i - 30; l <= i + 30; l++) {
          for (let m = gy - 30; m <= gy + 30; m++) {
            if (l < 5 || m < 5 || l >= st.w - 5 || m >= st.h - 5) return false;  // InWorld(l,m,5)
            const nk = st.idx(l, m);
            if (st.flags[nk] && (st.type[nk] === CHEST || st.type[nk] === CHEST2)) return false;
          }
        }
      }
      if (opts.trySlope) {
        if (st.slope[st.idx(i - 1, gy)] >= 1 && st.slope[st.idx(i - 1, gy)] <= 2) {
          slopeL = st.slope[st.idx(i - 1, gy)];
          st.slope[st.idx(i - 1, gy)] = 0;
        }
        if (st.slope[k] >= 1 && st.slope[k] <= 2) {
          slopeR = st.slope[k];
          st.slope[k] = 0;
        }
      }
      break;
    }
  }
  if (gy >= st.h - 10) return false;
  if (!solidTileHB(st, i, gy)) return false;
  // trySlope 失败回填（cs:37567-37575：仅压平过的格才恢复）
  const restoreSlopes = (): void => {
    if (slopeL > -1) st.slope[st.idx(i - 1, gy)] = slopeL;
    if (slopeR > -1) st.slope[st.idx(i, gy)] = slopeR;
  };

  let tile = opts.tile ?? CHEST;
  let style = opts.style;
  const flags: ChestFlags = { ...(opts.flags ?? {}) };
  let mainId = 0;
  let mainKey: string | null = null;
  if (typeof opts.loot === 'string') {
    mainKey = opts.loot;
    mainId = vanillaIdOfKey(opts.loot) ?? 0;
    if (mainId === 0 && ITEM_BY_KEY[opts.loot] === undefined) mainKey = null; // 无效键丢弃
  } else if (opts.loot !== undefined) {
    mainId = opts.loot;
  }
  if (style === undefined) {
    if (gy > st.h - 205) {
      // 地狱箱:style 4 + 地狱武器序(cs:36158-36171)
      style = 4;
      flags.hell = true;
      if (!mainId) mainId = nextHellItem(gs);
    } else {
      style = gy >= gs.worldSurface + 25 ? 1 : 0;
      if (style === 0) flags.wooden = true;
    }
  }
  // ---- 冰箱门（cs:36107-36130 1:1）：三析取——(tile21&&style11) ||
  // (tile467&&style24) || (无主件 && 位置 && 脚下冰系)。★原版显式传 style 11
  // 也进本池（HouseBuilder 冰屋正是此路径）——旧实现 style===undefined 单门漏此
  const tBelow = st.type[st.idx(i, gy)];
  if ((tile === CHEST && style === 11) || (tile === CHEST2 && style === 24)
    || (!mainId && gy >= gs.worldSurface + 25 && gy <= st.h - 205
      && (tBelow === SNOW || tBelow === ICE || tBelow === THIN_ICE))) {
    flags.ice = true;
    if (!mainId) {
      mainId = [670, 724, 950, 1319, 987, 1579][rng.int(0, 5)]; // cs:36121-36125
      if (rng.int(0, 19) === 0) mainId = 997; // 1/20 提炼机
      if (rng.int(0, 49) === 0) mainId = 669; // 1/50 鱼
    }
  }
  // ---- 沙漠箱门（cs:36066-36091 1:1）：三析取——(tile467&&style10) ||
  // (tile21&&style42&&flag16) || (无主件 && ≤h-205 && IsUndergroundDesert)
  const ud = gs.undergroundDesert;
  const inUd = !mainId && ud && i >= ud.x0 && i <= ud.x1 && gy >= ud.y0 && gy <= ud.y1 && gy <= st.h - 205;
  if ((tile === CHEST2 && style === 10) || inUd) {
    tile = CHEST2;
    style = 10;
    flags.desert = true;
    // cs:36084：分位点用蜂巢**实际雕刻范围**（desertHiveHigh/Low，PlaceClustersArea
    // 逐点收缩），非静态矩形 ±10（曾用 ud.y0/y1 → 分层界偏移）
    const deep = gy > (gs.desertHiveHigh * 3 + gs.desertHiveLow * 4) / 7;
    if (!mainId) {
      mainId = deep
        ? [4061, 4062, 4276][rng.int(0, 2)]
        : [4056, 4055, 4262, 4263][rng.int(0, 3)];
    }
  }

  // ---- notNearOtherChests 通道（cs:36253 透传 → PlaceChest cs:57838-57840）：
  // 原版 `notNearOtherChests && Chest.NearOtherChests(x-1, y-1)` → 拒。PlaceChest 收到
  // (i-1, num7-1)（num7=落定行 gy），故 NearOtherChests 实扫锚 = (i-2, gy-2)。
  // 本仓消费点：蜘蛛巢/神庙宝箱应传 true（HiveSpiderPass/TemplePass 两处调用点
  // 由并行代理接线，此处先开通道；缺省 false = 与原版 notNearOtherChests:false 同义）
  if (opts.notNearOtherChests && nearOtherChests(st, i - 2, gy - 2)) { restoreSlopes(); return false; }

  // 2×2 放置:顶行 frameY=0、frameX = style*36 + dx*18(PlaceChestDirect 语义)
  const topY = gy - 2;
  if (topY < 1) { restoreSlopes(); return false; }
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      if (!st.inBounds(i + dx, topY + dy) || st.flags[st.idx(i + dx, topY + dy)]) { restoreSlopes(); return false; }
    }
  }
  // 样式派生 flag 族（cs:36201-36229）：32 蘑菇 / 16 神庙 / 13 天空主题
  if (style === 32) flags.mushroom = true;
  if (style === 16) flags.temple = true;
  if (style === 13) flags.skyTheme = true;
  if (!st.inBounds(i + 1, gy) || !st.flags[st.idx(i + 1, gy)]
    || !TILE_DEFS[st.type[st.idx(i + 1, gy)]]?.solid) { restoreSlopes(); return false; }
  const fw = TILE_DEFS[tile].vanilla?.fw ?? 2;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(i + dx, topY + dy, tile, style * fw * 18 + dx * 18, dy * 18);
    }
  }
  // 战利品:四深度分支完整表(此前仅主件+火把/药水,体感稀缺主因之一)
  const items = rollChestLoot({ rng, gs, gy, flags, mainKey, worldH: st.h }, mainId);
  chests.push({ x: i, y: topY, items });
  if (flags.hell) gs.hellChestIdx++; // cs:36257-36264 放置成功才前进（失败重试取同一件）
  return true;
}

/** Buried Chests pass:L7907 洞穴段(CaveChestCount 35-40 × WorldArea/5040000)。
 *  ★地狱段拆出 runUnderworldChestsPass:本函数曾在 hellPass 之前执行,
 *  地狱箱被后续地狱地形重写 100% 抹除(实际 0 个) */
export function runBuriedChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w, h } = st;
  const yMin = Math.floor((gs.worldSurfaceHigh + 20 + gs.rockLevel) / 2);
  // 洞穴箱:35-40 × 面积缩放(Configuration.json CaveChestCount ScaleWith:WorldArea;
  // 小世界(4200×1200=5040000)= 1.0 → 35-40;中 ×2.29;大 ×4.0)
  const target = Math.round(rng.int(35, 40) * (w * h) / 5040000);
  let fail = 10000;
  for (let n = 0; n < target && fail > 0; ) {
    const x = rng.int(20, w - 21);
    const y = rng.int(yMin, h - 231);
    const wl = st.inBounds(x, y) ? st.wall[st.idx(x, y)] : -1;
    // cs:17109：wallDungeon[wall] || wall == 87（神庙墙 87 独立门）→ 整体重掷
    if (isDungeonWall(wl) || wl === 87 || !placeBuriedChest(st, rng, gs, chests, x, y)) {
      fail--; continue;
    }
    n++;
  }
}

/** 地狱箱(UnderworldChestCount 10-15 × WorldWidth/4200)。
 *  必须在 hellPass + 地狱屋之后调用(原版 Underworld(cs:13697) < Buried Chests(cs:17066)) */
export function runUnderworldChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w, h } = st;
  const target = Math.round(rng.int(10, 15) * (w / 4200));
  let fail = 10000;
  for (let n = 0; n < target && fail > 0; ) {
    const x = rng.int(20, w - 21);
    const y = rng.int(h - 200, h - 51);
    if (!placeBuriedChest(st, rng, gs, chests, x, y)) {
      fail--; continue;
    }
    n++;
  }
}

/** Surface Chests pass(L8019):w*0.005 个地表木箱(style 0;墙 244 → 天空箱 style 12) */
export function runSurfaceChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w } = st;
  const count = Math.floor(w * 0.005);
  for (let n = 0; n < count; n++) {
    let ok = false;
    for (let tries = 0; tries < 2000 && !ok; tries++) {
      // cs:17244 首掷 Next(200, w-200);仅落点命中 oceanDepths(cs:17246-17254:
      // y ≤ oceanLevel=(ws+rl)/2+40 且 x 在海滩带内)才改掷 Next(300, w-300)——
      // 原版 WorldGen.beachDistance 是常量 380(cs:4102)
      let x = rng.int(200, w - 201);
      let y = rng.int(Math.floor(gs.worldSurfaceLow), Math.floor(gs.worldSurface) - 1);
      const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      while (y <= oceanLevel && (x < gs.beachDistance || x > w - gs.beachDistance)) {
        x = rng.int(300, w - 301);
        y = rng.int(Math.floor(gs.worldSurfaceLow), Math.floor(gs.worldSurface) - 1);
      }
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      // cs:17260-17284 两分支：空格走墙门（2/59/244，墙 244 → 天空箱）；
      // 落点活性格走 101×101（步 2）蓄水池采样找墙 244 空格（Next(num8) 命中即换点）
      let sky = false;
      let cx = x, cy = y;
      if (!st.flags[i]) {
        if (st.wall[i] === 2 || st.wall[i] === 59 || st.wall[i] === 244) {
          if (st.wall[i] === 244) sky = true;
        } else {
          continue;   // flag3=false → 本轮作废
        }
      } else {
        let num8 = 1;
        let hit = false;
        for (let j = cx - 50; j <= cx + 50; j += 2) {
          for (let k = cy - 50; k <= cy + 50; k += 2) {
            if (k >= gs.worldSurface) continue;
            if (!st.inBounds(j, k) || st.flags[st.idx(j, k)]) continue;
            if (st.wall[st.idx(j, k)] !== 244) continue;
            if (rng.int(0, num8 - 1) !== 0) continue;                    // Next(num8)==0
            sky = true;
            num8++;
            hit = true;
            cx = j; cy = k;
          }
        }
        if (!hit) continue;   // 蓄水池无墙 244 空格 → 本轮作废
      }
      const flags: ChestFlags = sky ? { sky: true } : { wooden: true };
      if (placeBuriedChest(st, rng, gs, chests, cx, cy, { style: sky ? 12 : 0, flags })) ok = true;
    }
  }
}

/** UnderwaterChests 的 9×w/4200 段（cs:17381-17453）：每下标两趟 while 各 1 箱——
 *  ① y∈[1, UnderworldLayer)（内层液体重掷域 [50, UnderworldLayer)）
 *  ② y∈[worldSurface, UnderworldLayer)。主件序：单次 Next(10)==0 → 863，
 *  否则计数器 186→4404→277→187（num4 每迭代无条件 ++，命中 863 也前进）。 */
export function runWaterChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w } = st;
  const num5 = w / 4200;
  const count = 9 * num5;
  let num4 = 0;
  for (let n = 0; n < count; n++) {
    num4++;
    let main: number;
    if (rng.int(0, 9) === 0) {                                          // Next(10)
      main = 863;
    } else {
      switch (num4) {
        case 1: main = 186; break;
        case 2: main = 4404; break;
        case 3: main = 277; break;
        default: main = 187; num4 = 0; break;
      }
    }
    // 第一趟（cs:17424-17431）：y 首掷 [1, h-200)，重掷 [50, h-200)
    for (let loop = 0; loop < 2; loop++) {
      const yLo = loop === 0 ? 1 : Math.floor(gs.worldSurface);
      let ok = false;
      for (let tries = 0; tries < 10000 && !ok; tries++) {
        let x = rng.int(50, w - 51);                                    // Next(50, w-50)
        let y = rng.int(yLo, st.h - 201);                               // Next(?, h-200)
        // cs:17425-17428：液体不足或非水 → 重掷（重掷 y 域换 [50, h-200)）。
        // liquidType 修 2026-08-12：本仓库 +1 编码(水=LIQUID_TYPE.WATER=1)——照抄原版
        // !==0(原版 Water=0) 会让水格恒不命中,拒绝采样死循环(世界生成卡"生物群系"根因)。
        // 守卫:100 万掷未命中 → 大声报错降级继续(防同类移植错位再变静默死循环)
        let __guard = 0;
        while (st.liquid[st.idx(x, y)] < 250 || st.liquidType[st.idx(x, y)] !== LIQUID_TYPE.WATER) {
          x = rng.int(50, w - 51);
          y = rng.int(50, st.h - 201);
          if (++__guard >= 1_000_000) {
            console.error('[worldgen] runWaterChestsPass 拒绝采样 100 万掷未命中水中格——疑似 liquidType/liquid 编码错位或本世界无合格水体,降级跳过本箱');
            break;
          }
        }
        if (__guard >= 1_000_000) continue;
        // cs:17427：trySlope 门 = 落点在海滩带内（x < 380 || x > w-380）
        if (placeBuriedChest(st, rng, gs, chests, x, y, {
          style: 17, loot: main, flags: { water: true },
          trySlope: x < gs.beachDistance || x > w - gs.beachDistance,
        })) ok = true;
      }
    }
  }
}
