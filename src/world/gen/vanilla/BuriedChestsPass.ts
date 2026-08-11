// 原版 "Buried Chests"(L7907)+ "Surface Chests"(L8019)+ "Water Chests"(L8058)移植。
// 样式语义(AddBuriedChest L21335+ / PlaceChestDirect L34112:frameX=36*style 横排):
//   -1 默认:y≥ws+25 → 金(1);冰系 tile(147/161/162)→ 冰箱(11)+冰系战利品;
//   地下沙漠 → tile467 style10+沙漠战利品;y>h-205 → 地狱箱(4)+地狱武器序;
//   Water Chests pass 固定 style17(水箱)+水中战利品;地表箱 style0 木箱。
// 宝箱数量(Configuration.json):CaveChestCount 35-40 ScaleWith:WorldArea(÷5040000)、
//   UnderworldChestCount 10-15 ScaleWith:WorldWidth(÷4200)。金/木箱主件战利品池
//   = cs:21500+ 大 switch 的常用主件子集(id 经 id-maps 核对)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { ITEM_BY_KEY } from '../../../data/items';
import { vanillaItemKey } from '../../../data/vanillaNpcs';

const CHEST = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const THIN_ICE = TILE_BY_KEY['thin_ice']!;
const ALTAR = TILE_BY_KEY['v_26_altars']!;
const TALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;

export type ChestSink = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }>;

const iceLoot = [
  'vi_670_ice_boomerang', 'vi_724_ice_blade', 'vi_950_ice_skates',
  'vi_1319_snowball_cannon', 'vi_987_blizzard_in_a_bottle', 'vi_1579_flurry_boots',
];
const desertShallowLoot = ['vi_4056_ancient_chisel', 'vi_4055_dunerider_boots', 'vi_4262_snake_charmer_s_flute', 'vi_4263_magic_conch'];
const desertDeepLoot = ['vi_4061_storm_spear', 'vi_4062_thunder_zapper', 'vi_4276_bast_statue'];
const hellLoot = ['vi_274_dark_lance', 'vi_112_flower_of_fire', 'vi_218_flamelash', 'vi_3019_hellwing_bow', 'vi_5010_treasure_magnet'];
const waterLoot = ['vi_186_breathing_reed', 'vi_4404_inner_tube', 'vi_277_trident', 'vi_187_flipper'];

/** 地牢墙集合(DungeonPass roomWall:L850 type 7/8/9 + 94-99 变体)。
 *  原版只排除 wallDungeon[](AddBuriedChest L17086)——曾用 wl∈[7,99] 一刀切,
 *  连带拒掉大量自然洞穴墙(泥墙/大理石墙),额外压低洞穴箱成功率 */
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
function isDungeonWall(wl: number): boolean {
  return DUNGEON_WALLS.has(wl);
}

/** 金箱主件池(cs:21500+ 常用主件子集,原版 id) */
const goldMainIds = [285, 953, 53, 54, 158, 50, 5011, 42, 280, 279, 3069, 49];
/** 木箱主件池(地表箱) */
const woodMainIds = [281, 3069, 280, 953, 285, 946];

/** 主件 + 概率杂物(火把/药水)。cs:21500+ 的 switch 只取主件语义子集 */
function rollCommonLoot(rng: RNG, mainIds: number[]): Array<{ id: number; stack: number } | null> {
  const key = vanillaItemKey(mainIds[rng.int(0, mainIds.length - 1)]);
  const out: Array<{ id: number; stack: number } | null> = Array(10).fill(null);
  if (key && ITEM_BY_KEY[key] !== undefined) out[0] = { id: ITEM_BY_KEY[key], stack: 1 };
  const roll = rng.int(0, 2);
  if (roll === 0) out[1] = { id: ITEM_BY_KEY['torch'] ?? out[0]?.id ?? -1, stack: rng.int(3, 9) };
  else if (roll === 1) out[1] = { id: ITEM_BY_KEY['lesser_healing_potion'] ?? -1, stack: rng.int(1, 3) };
  return out;
}

/** AddBuriedChest 近似:从 (i,j) 向下落,按上下文解析样式与战利品,2×2 放置 */
export function placeBuriedChest(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  i: number, j: number, opts: { style?: number; tile?: number; loot?: string } = {},
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
  let lootKey = opts.loot;
  if (style === undefined) {
    if (gy > st.h - 205) {
      // 地狱箱:style 4 + 地狱武器序(每个世界乱序取用)
      style = 4;
      if (!lootKey) lootKey = hellLoot[rng.int(0, hellLoot.length - 1)];
    } else {
      style = gy >= gs.worldSurface + 25 ? 1 : 0;
      const tBelow = st.type[st.idx(i, gy)];
      if (!lootKey && (tBelow === SNOW || tBelow === ICE || tBelow === THIN_ICE)) {
        style = 11;
        lootKey = iceLoot[rng.int(0, iceLoot.length - 1)];
        if (rng.int(0, 19) === 0) lootKey = 'vi_997_extractinator';
      }
      const ud = gs.undergroundDesert;
      if (!lootKey && ud && i >= ud.x0 && i <= ud.x1 && gy >= ud.y0 && gy <= ud.y1
        && gy >= gs.worldSurface + 25 && gy <= st.h - 205) {
        tile = CHEST2;
        style = 10;
        const deep = gy > (ud.y0 * 3 + ud.y1 * 4) / 7;
        const pool = deep ? desertDeepLoot : desertShallowLoot;
        lootKey = pool[rng.int(0, pool.length - 1)];
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
  // 战利品:特殊池优先;金(1)/木(0)箱走主件+杂物池(此前是空箱,体感稀缺主因之一)
  let items: Array<{ id: number; stack: number } | null>;
  const lootId = lootKey ? ITEM_BY_KEY[lootKey] : undefined;
  if (lootId !== undefined) {
    items = [{ id: lootId, stack: 1 }, ...Array(9).fill(null)];
  } else if (style === 1) {
    items = rollCommonLoot(rng, goldMainIds);
  } else if (style === 0) {
    items = rollCommonLoot(rng, woodMainIds);
  } else {
    items = Array(10).fill(null);
  }
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

/** Surface Chests pass(L8019):w*0.005 个地表木箱(style 0) */
export function runSurfaceChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w } = st;
  const count = Math.floor(w * 0.005);
  for (let n = 0; n < count; n++) {
    let ok = false;
    for (let tries = 0; tries < 2000 && !ok; tries++) {
      const x = rng.int(300, w - 301);
      const y = rng.int(Math.floor(gs.worldSurfaceLow), Math.floor(gs.worldSurface));
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      // 空格 + 泥土系自然墙(2/59/244)
      if (st.flags[i] || (st.wall[i] !== 2 && st.wall[i] !== 59 && st.wall[i] !== 244)) continue;
      if (placeBuriedChest(st, rng, gs, chests, x, y, { style: 0 })) ok = true;
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
    let loot: string;
    if (rng.int(0, 9) === 0) loot = 'vi_4425_shark_bait';
    else if (rng.int(0, 9) === 0) loot = 'vi_863_water_walking_boots';
    else {
      loot = waterLoot[waterIdx % waterLoot.length];
      waterIdx++;
    }
    let ok = false;
    for (let tries = 0; tries < 10000 && !ok; tries++) {
      const x = rng.int(50, w - 51);
      const y = rng.int(1, st.h - 210);
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (st.liquid[i] < 250 || st.liquidType[i] === 2) continue;
      if (placeBuriedChest(st, rng, gs, chests, x, y, { style: 17, loot })) ok = true;
    }
  }
}
