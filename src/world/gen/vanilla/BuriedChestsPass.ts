// 原版 "Buried Chests"(L7907)+ "Surface Chests"(L8019)+ "Water Chests"(L8058)移植。
// 样式语义(AddBuriedChest L21335+ / PlaceChestDirect L34112:frameX=36*style 横排):
//   -1 默认:y≥ws+25 → 金(1);冰系 tile(147/161/162)→ 冰箱(11)+冰系战利品;
//   地下沙漠 → tile467 style10+沙漠战利品;y>h-205 → 地狱箱(4)+地狱武器序;
//   Water Chests pass 固定 style17(水箱)+水中战利品;地表箱 style0 木箱(墙 244 → 12 天空箱)。
// 宝箱数量(Configuration.json):CaveChestCount 35-40 ScaleWith:WorldArea(÷5040000)、
//   UnderworldChestCount 10-15 ScaleWith:WorldWidth(÷4200)。
// 战利品 = AddBuriedChest(cs:35920-37560)1:1:按深度四分支(地表/金/洞穴/地狱),
//   主件 + 概率杂物表 + 主题旗标池(ice/desert/ivy/water/hell/sky 附加物)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';

const CHEST = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const THIN_ICE = TILE_BY_KEY['thin_ice']!;
const ALTAR = TILE_BY_KEY['v_26_altars']!;
const TALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;

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
}

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
  const item = items[gs.hellChestIdx % items.length];
  gs.hellChestIdx++;
  return item;
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
    if (mainVanillaId > 0) {
      push(mainVanillaId);
      if (flags.water) {
        if (rng.int(0, 1) === 0) push(4425);
        if (rng.int(0, 1) === 0) push(4460);
      }
      if (flags.ivy) {
        if (!gs.gennedMahoganyWands || rng.int(0, 4) === 0) {
          gs.gennedMahoganyWands = true;
          push(3360); push(3361); // 活桃花心木法杖/叶法杖
        }
        if (rng.int(0, 9) === 0) push(4426);
        if (rng.int(0, 9) === 0) push(5525);
      }
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
    if (rng.int(0, 1) === 0) push(flags.ice ? 974 : 8, rng.int(10, 19)); // 冰火把/火把
    if (rng.int(0, 1) === 0) push(72, rng.int(50, 89));
  } else if (gy < ctx.worldH - 250) {
    // ===== 洞穴箱(rockLayer ≤ gy < h-250,cs:36789-37163)=====
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
    } else {
      // 主件(cs:36913-36975):岩浆线以下 1/20 熔岩符 / 1/15 提炼机 / 默认池(含信号枪项)
      if (rng.int(0, 19) === 0 && gy > gs.lavaLine) push(906);
      else if (rng.int(0, 14) === 0) push(997);
      else {
        const m = rng.int(0, 6);
        if (m === 6) { push(930); push(931, rng.int(25, 50)); }
        else push([49, 50, 53, 54, 5011, 975][m]);
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
    // ===== 地狱箱(gy ≥ h-250,cs:37163-37360)=====
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
    if (rng.int(0, 1) === 0) push(227, rng.int(15, 29));      // 再生药水
    if (rng.int(0, 3) > 0) push(pick([296, 295, 293, 288, 294, 297, 304, 2323]), rng.int(1, 2));
    if (rng.int(0, 2) > 1) push(pick([305, 301, 302, 288, 300, 2351, 2348, 2345]), rng.int(1, 2));
    if (rng.int(0, 2) === 0) push(rng.int(0, 1) === 0 ? 2350 : 4870, rng.int(1, 2)); // 回城/回归药水
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

/** AddBuriedChest 近似:从 (i,j) 向下落,按上下文解析样式与战利品,2×2 放置。
 *  opts.loot: 原版物品 id(number)或物品 key(string,vi_ 反解主件/legacy 直入) */
export function placeBuriedChest(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  i: number, j: number, opts: { style?: number; tile?: number; loot?: number | string; flags?: ChestFlags } = {},
): boolean {
  // ±2 内不得有滚石/祭坛/其他宝箱(原版 num4=2 检查)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (!st.inBounds(i + dx, j + dy)) continue;
      const t = st.type[st.idx(i + dx, j + dy)];
      if (!st.flags[st.idx(i + dx, j + dy)]) continue;
      if (t === ALTAR || t === TALTAR || t === CHEST || t === CHEST2) return false;
    }
  }
  // 下落到地面
  let gy = j;
  let guard = 0;
  while (guard++ < 400 && st.inBounds(i, gy) && !st.flags[st.idx(i, gy)]) gy++;
  if (!st.inBounds(i, gy) || !st.flags[st.idx(i, gy)]) return false;
  if (!TILE_DEFS[st.type[st.idx(i, gy)]]?.solid) return false;

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
      const tBelow = st.type[st.idx(i, gy)];
      // 冰箱门禁(cs:36126:num7 ≥ ws+25 且 ≤ h-205)
      if (!mainId && gy >= gs.worldSurface + 25 && (tBelow === SNOW || tBelow === ICE || tBelow === THIN_ICE)) {
        style = 11;
        flags.ice = true;
        mainId = [670, 724, 950, 1319, 987, 1579][rng.int(0, 5)]; // cs:36121-36125
        if (rng.int(0, 19) === 0) mainId = 997; // 1/20 提炼机
        if (rng.int(0, 49) === 0) mainId = 669; // 1/50 鱼
      }
      const ud = gs.undergroundDesert;
      if (!mainId && ud && i >= ud.x0 && i <= ud.x1 && gy >= ud.y0 && gy <= ud.y1
        && gy >= gs.worldSurface + 25 && gy <= st.h - 205) {
        tile = CHEST2;
        style = 10;
        flags.desert = true;
        const deep = gy > (ud.y0 * 3 + ud.y1 * 4) / 7;
        mainId = deep
          ? [4061, 4062, 4276][rng.int(0, 2)]
          : [4056, 4055, 4262, 4263][rng.int(0, 3)];
      }
    }
  }

  // 2×2 放置:顶行 frameY=0、frameX = style*36 + dx*18(PlaceChestDirect 语义)
  const topY = gy - 2;
  if (topY < 1) return false;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      if (!st.inBounds(i + dx, topY + dy) || st.flags[st.idx(i + dx, topY + dy)]) return false;
    }
  }
  if (!st.inBounds(i + 1, gy) || !st.flags[st.idx(i + 1, gy)]
    || !TILE_DEFS[st.type[st.idx(i + 1, gy)]]?.solid) return false;
  const fw = TILE_DEFS[tile].vanilla?.fw ?? 2;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(i + dx, topY + dy, tile, style * fw * 18 + dx * 18, dy * 18);
    }
  }
  // 战利品:四深度分支完整表(此前仅主件+火把/药水,体感稀缺主因之一)
  const items = rollChestLoot({ rng, gs, gy, flags, mainKey, worldH: st.h }, mainId);
  chests.push({ x: i, y: topY, items });
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
    if (isDungeonWall(wl) || !placeBuriedChest(st, rng, gs, chests, x, y)) {
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
      // 原版 WorldGen.beachDistance 是常量 380(cs:4102),此处沿用 gs.beachDistance 比例值
      let x = rng.int(200, w - 201);
      let y = rng.int(Math.floor(gs.worldSurfaceLow), Math.floor(gs.worldSurface));
      const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      while (y <= oceanLevel && (x < gs.beachDistance || x > w - gs.beachDistance)) {
        x = rng.int(300, w - 301);
        y = rng.int(Math.floor(gs.worldSurfaceLow), Math.floor(gs.worldSurface));
      }
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      // 空格 + 泥土系自然墙(2/59/244)
      if (st.flags[i] || (st.wall[i] !== 2 && st.wall[i] !== 59 && st.wall[i] !== 244)) continue;
      const sky = st.wall[i] === 244;
      if (placeBuriedChest(st, rng, gs, chests, x, y, { style: sky ? 12 : 0, flags: sky ? { sky: true } : { wooden: true } })) ok = true;
    }
  }
}

/** Water Chests pass(L8058):9×w/4200 个,水中(liquid≥250 且为水)放置,style 17 */
export function runWaterChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w } = st;
  const count = Math.floor(9 * (w / 4200));
  let waterIdx = 0;
  for (let n = 0; n < count; n++) {
    // 战利品序(cs L8087-8112):1/10 鲨鱼饵/水上漂靴,否则循环 芦笛/游泳圈/三叉戟/脚蹼
    let main: number;
    if (rng.int(0, 9) === 0) main = 4425;
    else if (rng.int(0, 9) === 0) main = 863;
    else main = [186, 4404, 277, 187][waterIdx++ % 4];
    let ok = false;
    for (let tries = 0; tries < 10000 && !ok; tries++) {
      const x = rng.int(50, w - 51);
      const y = rng.int(1, st.h - 210);
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (st.liquid[i] < 250 || st.liquidType[i] === 2) continue;
      if (placeBuriedChest(st, rng, gs, chests, x, y, { style: 17, loot: main, flags: { water: true } })) ok = true;
    }
  }
}
