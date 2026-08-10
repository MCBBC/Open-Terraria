// 原版 1.4.5.6 NPC.Spawner 内嵌类 1:1 移植（Terarria1456/Terraria/NPC.cs:39-5952）。
// 结构：SetSpawnFlags(L276) → GetSpawnRate(L383-640) → FindSpawnTile(L879) →
//       SetSpawnFlagsForChosenTile(L950) → SpawnAnNPC(L1186-5144 巨型 if-else 链)。
// 权重语义：Main.rand.Next(N)==0（1/N 命中）；越靠前优先级越高。
// 困难模式分支保留并挂在 world.flags.hardMode（当前默认 false → 只走肉前）。
// 净 ID（负数）= SetDefaultsFromNetId(L7633)：基底类型 × scale + 属性/颜色覆盖。
// 原版 spawnTileType = NPC 落脚处上方格（GetProperGroundSpawnTileTypeAndWallType L5789）；
// 我们的等价 = 落脚格下方第一个实心格的 tile type。
import { TILE } from '../../core/constants';
import { RNG } from '../../core/rng';
import type { World } from '../World';
import { TILE_DEFS, TILE_BY_KEY } from '../../data/tiles';
import { Enemy } from '../../entities/Enemy';
import { debugPoolOverride } from '../../data/vanillaNpcs';

// ---- 原版 tile type 常量（TileID），我们通过 TILE_BY_KEY 反查内部 id ----
const T = (() => {
  const get = (k: string) => TILE_BY_KEY[k] ?? 0;
  return {
    DIRT: get('dirt'), GRASS: get('grass'), STONE: get('stone'),
    SAND: get('sand'), SNOW: get('snow'), ICE: get('ice'), MUD: get('mud'),
    JUNGLE_GRASS: get('v_60_jungle_grass_block'), CORRUPT_GRASS: get('v_23_corrupt_grass_block'),
    CRIMSON_GRASS: get('v_199_crimson_grass_block'), MUSHROOM_GRASS: get('v_70_mushroom_grass_block'),
    EBONSAND: get('v_112_ebonsand_block'), CRIMSAND: get('v_234_crimsand_block'),
    PEARLSAND: get('v_116_pearlsand_block'), HARDENED_SAND: get('hardened_sand'),
    SANDSTONE: get('sandstone'), MARBLE: get('v_367_marble_block'), GRANITE: get('v_368_granite_block'),
    CACTUS: get('v_80_cactus'), SNOW_BRICK: get('snow_brick'),
    CORRUPT_ICE: get('v_163_purple_ice_block'), CRIMSON_ICE: get('v_200_red_ice_block'),
    // 164 粉冰(神圣冰)引擎未注册 → 0(ZoneHallow 冰分支暂不触发,与已知缺口一致)
    HOLLOW_ICE: get('v_164_hallowed_ice'), DUNGEON_BLUE: get('v_41_blue_brick'),
    DUNGEON_GREEN: get('v_43_green_brick'), DUNGEON_PINK: get('v_44_pink_brick'),
    // 恶土系计数(SceneMetrics.cs:613-615 的 _tileCounts 公式)
    EBONSTONE: get('v_25_ebonstone_block'), CORRUPT_PLANT: get('v_24_corruption_short_plants'),
    CORRUPT_THORN: get('v_32_corruption_thorns'), CORRUPT_HARDSAND: get('v_398_corrupt_hardened_sand_block'),
    CRIMSTONE: get('v_203_crimstone_block'), CRIMSON_PLANT: get('v_201_crimson_short_plants'),
    CRIMSAND_THORN: get('v_352_crimtane_thorns'), CRIMSON_HARDSAND: get('v_399_crimson_hardened_sand_block'),
    SUNFLOWER: get('v_27_sunflower'),
  };
})();
/** EvilTileCount 计数表(SceneMetrics.cs:613):23/661/24/25/32/112/163/400/398 计 1,27 向日葵 −10。
 *  661/400 等引擎无 def 的按 0 计 */
const EVIL_LOOKUP = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (const id of [T.CORRUPT_GRASS, T.EBONSTONE, T.CORRUPT_PLANT, T.CORRUPT_THORN,
    T.EBONSAND, T.CORRUPT_ICE, T.CORRUPT_HARDSAND]) if (id) t[id] = 1;
  return t;
})();
/** BloodTileCount 计数表(SceneMetrics.cs:615):199/662/201/203/200/401/399/234/352 计 1 */
const BLOOD_LOOKUP = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (const id of [T.CRIMSON_GRASS, T.CRIMSTONE, T.CRIMSON_PLANT, T.CRIMSON_ICE,
    T.CRIMSAND, T.CRIMSAND_THORN, T.CRIMSON_HARDSAND]) if (id) t[id] = 1;
  return t;
})();

// ---- 洞穴主池 cavernMonsterType 表（NPC.cs:6498 + 世界生成时 18058-18064 填充） ----
export let cavernMonsterType: number[][] = [[49, 49, 49], [49, 49, 49]];
export function rollCavernMonsterType(rng: RNG): void {
  for (let i = 0; i < 2; i++) {
    cavernMonsterType[i][0] = rng.int(494, 496); // v_494/v_495（洞穴蝾螈族）
    cavernMonsterType[i][1] = rng.int(496, 498);
    cavernMonsterType[i][2] = rng.int(498, 507);
  }
}

// ---- 原版 netID（负数）→ SetDefaultsFromNetId（L7633-7820）：基底 id + scale + 属性覆盖 ----
// scale/color/alpha 一律取源数据（public/sprites/vanilla-npcnetid.json，extract-npccolors.mjs 提取）
import vanillaNetIdJson from '../../data/vanilla-npcnetid.json';
const NET_ID_OVERRIDE: Record<string, { scale?: number; color?: number[]; alpha?: number }> = vanillaNetIdJson;

const NET_ID_MAP: Record<number, { base: number; scale: number; hp?: number; dmg?: number; def?: number }> = {
  '-1': { base: 16, scale: 0.6, hp: 90, dmg: 45, def: 10 },   // 母史莱姆
  '-2': { base: 16, scale: 0.9, hp: 90, dmg: 45, def: 20 },
  '-3': { base: 1, scale: 0.9, hp: 14, dmg: 6, def: 0 },   // 绿史莱姆
  '-4': { base: 1, scale: 0.6, hp: 150, dmg: 5, def: 5 },
  '-5': { base: 1, scale: 0.9, hp: 30, dmg: 13, def: 4 },  // 黑史莱姆
  '-6': { base: 1, scale: 1.05, hp: 45, dmg: 15, def: 4 },
  '-7': { base: 1, scale: 1.2, hp: 40, dmg: 12, def: 6 },
  '-8': { base: 1, scale: 1.025, hp: 35, dmg: 12, def: 4 }, // 红（母史莱姆子代）
  '-9': { base: 1, scale: 1.2, hp: 45, dmg: 15, def: 7 },   // 黄
  '-10': { base: 1, scale: 1.1, hp: 60, dmg: 18, def: 6 },  // 丛林
  '-11': { base: 6, scale: 0.85 },   // 小噬魂怪
  '-12': { base: 6, scale: 1.15 },   // 大噬魂怪
  // 黄蜂族大小变体（FromNetId NetIdMap[55..64]：两两一族 231-235；scale 取 netid 表）
  '-16': { base: 42, scale: 0.85 }, '-17': { base: 42, scale: 1.2 },    // Little/Big Stinger
  '-56': { base: 231, scale: 0.85 }, '-57': { base: 231, scale: 1.25 },
  '-58': { base: 232, scale: 0.8 }, '-59': { base: 232, scale: 1.17 },
  '-60': { base: 233, scale: 0.83 }, '-61': { base: 233, scale: 1.21 },
  '-62': { base: 234, scale: 0.78 }, '-63': { base: 234, scale: 1.16 },
  '-64': { base: 235, scale: 0.87 }, '-65': { base: 235, scale: 1.21 },
  // 地牢骷髅变体（SetDefaultsFromNetId L7770-7788：scale 后再乘 stat）
  '-13': { base: 31, scale: 0.9, hp: 72, dmg: 23, def: 7 },    // Short Bones(80/26/8 ×0.9)
  '-14': { base: 31, scale: 1.15, hp: 101, dmg: 33, def: 10 }, // Big Boned(×1.15 再 ×1.1)
  '-15': { base: 1, scale: 1.15 },   // 史莱姆王子
  '-22': { base: 223, scale: 1.0 }, '-23': { base: 223, scale: 1.0 },
  '-24': { base: 223, scale: 1.0 }, '-25': { base: 223, scale: 1.0 },
  // 僵尸/骷髅/眼变种 = 基底 + scale（贴图同基底，属性缩放）
  '-38': { base: 3, scale: 0.85 }, '-39': { base: 3, scale: 0.85 }, '-40': { base: 3, scale: 0.85 },
  '-41': { base: 3, scale: 0.85 }, '-42': { base: 3, scale: 0.85 },
  '-43': { base: 2, scale: 0.85 },  // 小恶魔眼
  '-46': { base: 21, scale: 0.9 }, '-47': { base: 21, scale: 0.9 },
  '-48': { base: 201, scale: 0.9 }, '-49': { base: 201, scale: 0.9 },
  '-50': { base: 202, scale: 0.9 }, '-51': { base: 202, scale: 0.9 },
  '-52': { base: 203, scale: 0.9 }, '-53': { base: 203, scale: 0.9 },
  '-54': { base: 223, scale: 0.9 }, '-55': { base: 223, scale: 0.9 },
};

export class VanillaSpawner {
  // ---- SpawnFlags（Spawner 字段 L39-137） ----
  private pX = 0; private pY = 0;
  private dayTime = true;
  private hardMode = false;
  private waterTile = false;
  private noWorms = false;         // 原版 wallHouse（房屋内不出蠕虫）
  private skyMob = false;
  private surfaceSpawn = false;
  private underGround = false;      // 原 underGround = worldSurface < y < rockLayer
  private deeperThanRockLayer = false;
  private isOcean = false;
  private isBeach = false;
  private nearMarble = false;
  private nearGranite = false;
  private spawnUndergroundDesert = false;
  /** 蜘蛛巢旗标（L1066/L1074）：落点邻域 ±5..15 格内有墙 62（1/3 概率扫描），
   *  或玩家所站格墙 62（2/3 概率查玩家位）——蜘蛛巢内/附近必出蜘蛛的真正触发器 */
  private spawnSpider = false;
  private ZoneSnow = false; private ZoneCorrupt = false; private ZoneCrimson = false;
  private ZoneHallow = false; private ZoneJungle = false; private ZoneGlowshroom = false;
  private ZoneDungeon = false; private ZoneGraveyard = false; private ZoneBeach = false;
  /** 原版 downedBoss3（杀过骷髅王）：地牢分支切换 守卫→常规怪池 */
  private downedBoss3 = false;
  private spawnTileX = 0; private spawnTileY = 0;
  /** FindSpawnTile 的 xRange 输出（L911：落脚点横向在 safeArea 内，传给 SpawnAnNPC） */
  private xRange = false;
  private spawnTileType = 0;
  /** 落脚点（Game 放置用） */
  currentSpawnX = 0;
  currentSpawnY = 0;

  constructor(private world: World) {}

  /** 玩家级 Zone 旗标（原版 Spawner.SetSpawnFlags L300：ZoneDungeon = player.ZoneDungeon——
   *  SceneMetrics 按玩家中心窗口判定，与落脚点无关）。Game 每帧刷怪前调用 */
  setPlayerFlags(zoneDungeon: boolean, downedSkeletron: boolean): void {
    this.ZoneDungeon = zoneDungeon;
    this.downedBoss3 = downedSkeletron;
  }

  /** 造怪入口：netId 可为负（SetDefaultsFromNetId 映射）；
   *  ai0/ai1 = 原版 SpawnNPC 第 6/7 参（如攀爬者 101 的锚点格，NPC.cs:4040） */
  private spawnNPC(x: number, y: number, netId: number, rng: RNG, ai0?: number, ai1?: number): Enemy | null {
    const map = NET_ID_MAP[netId];
    const baseId = map?.base ?? netId;
    const e = Enemy.fromVanilla(baseId, x, y);
    if (!e) return null;
    // 原版 NewNPC 锚点(NPC.cs:46596-46597):X-width/2, Y-height(底部贴格顶)。
    // 此前 fromVanilla 中心锚(y-h/2)把怪埋进落脚实心格半格高——飞行怪沿地面内沿
    // 漂移穿过侧壁,看起来像穿墙(噬魂怪等 ai5 族)
    e.y = y - e.h;
    const ov = NET_ID_OVERRIDE[String(netId)];
    e.vanillaNetId = netId;
    if (map) {
      e.vanillaScale = ov?.scale ?? map.scale;   // scale 优先源数据（SetDefaults_ForNetId 第 3 参）
      if (map.hp != null) e.hp = e.maxHp = map.hp;
      if (map.dmg != null) e.def.damage = map.dmg;
      if (map.def != null) e.def.defense = map.def;
    } else if (ov?.scale != null) {
      e.vanillaScale = ov.scale;
    }
    // SetDefaultsFromNetId 覆盖 color/alpha（L7633+：color = new Color(...) / alpha = N）
    if (ov?.color) e.colorRGBA = [ov.color[0], ov.color[1], ov.color[2], ov.color[3] ?? 255];
    if (ov?.alpha != null) e.spawnAlpha = ov.alpha;
    // 植物族锚点（aiStyle 13：锚点格存 ai0/ai1）
    if (ai0 !== undefined && ai1 !== undefined) { e.ai0 = ai0; e.ai1 = ai1; }
    e.id = this.world.store.w; // 占位，Game 侧会重编
    return e;
  }

  // ---- SetSpawnFlagsForChosenTile（L950-1185） ----
  private setFlagsForChosenTile(spawnTileX: number, spawnTileY: number, spawnTileType: number, rng: RNG): void {
    const st = this.world.store;
    this.spawnTileX = spawnTileX; this.spawnTileY = spawnTileY; this.spawnTileType = spawnTileType;
    // waterTile（L957）：落脚格上方两格都是液体且为水
    const above1 = st.idx(spawnTileX, spawnTileY - 1), above2 = st.idx(spawnTileX, spawnTileY - 2);
    this.waterTile = st.liquid[above1] > 0 && st.liquid[above2] > 0 && st.liquidType[above1] === 1;
    // nearMarble/nearGranite（L960-1046）：落点 tile → 玩家 tile → 两轮邻近扫描
    // (落点 ±Next(20,30) 步长 Next(1,4) + 玩家 ±Next(30,60) 步长 Next(3,7) 抽样)。
    // 只查落点/玩家两格会让小体量大理石/花岗岩洞几乎永远探测不到
    if (spawnTileType === T.MARBLE) this.nearMarble = true;
    else if (spawnTileType === T.GRANITE) this.nearGranite = true;
    else if (st.type[st.idx(this.pX, this.pY)] === T.MARBLE) this.nearMarble = true;
    else if (st.type[st.idx(this.pX, this.pY)] === T.GRANITE) this.nearGranite = true;
    else {
      const scanType = (cx0: number, cy0: number, r: number, stepI: number, stepJ: number) => {
        const x0 = Math.max(0, cx0 - r), x1 = Math.min(st.w - 1, cx0 + r);
        const y0 = Math.max(0, cy0 - r), y1 = Math.min(st.h - 1, cy0 + r);
        for (let i = x0; i <= x1; i += stepI) {
          for (let j = y0; j <= y1; j += stepJ) {
            const tt = st.type[st.idx(i, j)];
            if (tt === T.MARBLE) this.nearMarble = true;
            else if (tt === T.GRANITE) this.nearGranite = true;
          }
        }
      };
      scanType(spawnTileX, spawnTileY, rng.int(20, 30), rng.int(1, 3), 1 + (rng.next() * 3 | 0));
      scanType(this.pX, this.pY, rng.int(30, 60), rng.int(3, 6), 3 + (rng.next() * 4 | 0));
    }
    // 地下沙漠（L1078-1100）：同蜘蛛巢的双路触发——1/3 扫落点 ±Next(5,15) 墙集
    // {216,217,187};2/3 查玩家所站格墙。此前只查落点一格(巢腔墙多在空气格,地板格常是天然墙)
    const DESERT_WALL = (w: number) => w === 216 || w === 217 || w === 187;
    if (spawnTileY < this.world.rockLevel && spawnTileY > 200 && !this.ZoneDungeon) {
      if (rng.next() < 1 / 3) {
        const r = rng.int(5, 14);
        const x0 = Math.max(0, spawnTileX - r), x1 = Math.min(st.w - 1, spawnTileX + r - 1);
        const y0 = Math.max(0, spawnTileY - r), y1 = Math.min(st.h - 1, spawnTileY + r - 1);
        for (let sx = x0; sx <= x1 && !this.spawnUndergroundDesert; sx++) {
          for (let sy = y0; sy <= y1; sy++) {
            if (DESERT_WALL(st.wall[st.idx(sx, sy)])) { this.spawnUndergroundDesert = true; break; }
          }
        }
      } else if (DESERT_WALL(st.wall[st.idx(this.pX, this.pY)])) {
        this.spawnUndergroundDesert = true;
      }
    }
    this.surfaceSpawn = spawnTileY <= this.world.groundLevel;
    this.deeperThanRockLayer = spawnTileY >= this.world.rockLevel;
    this.underGround = spawnTileY > this.world.groundLevel && spawnTileY < this.world.rockLevel;
    // isOcean（L1104）：边缘 + 沙 tile + 岩石层上
    this.isOcean = (spawnTileX < 250 || spawnTileX > st.w - 250) && spawnTileType === T.SAND && spawnTileY < this.world.rockLevel;
    this.isBeach = spawnTileY <= this.world.groundLevel && (spawnTileX < 340 || spawnTileX > st.w - 340);
    // Zone 判定（SceneMetrics.cs:16/613-615/678）：以玩家为中心 169×123 窗口计数 ≥300。
    // 旧实现只看落脚格类型且漏黑檀石 25——腐化地表大量铺黑檀石导致噬魂怪永不触发
    this.ZoneSnow = spawnTileType === T.SNOW || spawnTileType === T.ICE || spawnTileType === T.SNOW_BRICK;
    this.ZoneCorrupt = this.countTiles(EVIL_LOOKUP, this.pX, this.pY) >= 300;
    this.ZoneCrimson = this.countTiles(BLOOD_LOOKUP, this.pX, this.pY) >= 300;
    this.ZoneHallow = spawnTileType === T.PEARLSAND || spawnTileType === T.HOLLOW_ICE;
    this.ZoneJungle = spawnTileType === T.MUD || spawnTileType === T.JUNGLE_GRASS;
    this.ZoneGlowshroom = spawnTileType === T.MUSHROOM_GRASS;
    // ZoneDungeon 不在此设置：原版取玩家 SceneMetrics（SetSpawnFlags L300），见 setPlayerFlags
    // ---- 蜘蛛巢旗标（L1045-1079）:岩石层~地狱层 && 非地牢时 ----
    // 1/3 概率扫落点 ±Next(5,15) 立方盒内任意墙 62;否则查玩家所站格墙 62。
    // 此前只查落点一格,玩家站巢里时屏幕外环带点几乎全在巢外 → 蜘蛛永不触发
    if (spawnTileY > this.world.rockLevel && spawnTileY < st.h - 200 && !this.ZoneDungeon) {
      if (rng.next() < 1 / 3) {
        const r = rng.int(5, 14);
        const x0 = Math.max(0, spawnTileX - r), x1 = Math.min(st.w - 1, spawnTileX + r - 1);
        const y0 = Math.max(0, spawnTileY - r), y1 = Math.min(st.h - 1, spawnTileY + r - 1);
        for (let sx = x0; sx <= x1 && !this.spawnSpider; sx++) {
          for (let sy = y0; sy <= y1; sy++) {
            if (st.wall[st.idx(sx, sy)] === 62) { this.spawnSpider = true; break; }
          }
        }
      } else if (st.wall[st.idx(this.pX, this.pY)] === 62) {
        this.spawnSpider = true;
      }
    }
  }

  /** tileDungeon 集（Main.cs:7941-7946）：41/43/44 主砖（677-679 安全变体未注册缺席=0）。
   *  PostCheckChosenSpawnTile L924：ZoneDungeon 时落脚点必须踩地牢砖且头顶有墙 */
  private isDungeonTile(t: number): boolean {
    return t === T.DUNGEON_BLUE || t === T.DUNGEON_GREEN || t === T.DUNGEON_PINK;
  }

  /** SceneMetrics.ScanTiles 近似:中心 169×123 窗口(zoneScanSize=120×75+padding 25×2−1)计数 */
  private countTiles(lookup: Uint8Array, cx: number, cy: number): number {
    const st = this.world.store;
    const x0 = Math.max(2, cx - 84), x1 = Math.min(st.w - 3, cx + 84);
    const y0 = Math.max(2, cy - 61), y1 = Math.min(st.h - 3, cy + 61);
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const row = y * st.w;
      for (let x = x0; x <= x1; x++) {
        const t = st.type[row + x];
        if (lookup[t]) n++;
        else if (t === T.SUNFLOWER) n -= 10; // 向日葵每株 −10(SceneMetrics.cs:588 num=-10)
      }
    }
    return n;
  }

  // ---- FindSpawnTile（L879-920）----
  /** GetSpawnRate（L383-668，单机非 remix 分支）：
   *  defaultSpawnRate=600 / defaultMaxSpawns=5（L6108/6110）。
   *  深度带/昼夜/附近怪分层/水蜡烛修正 + clamp（L655-662）。
   *  血月/日食/南瓜月/和平蜡烛/向日葵/calmed/隐身/仙女未实现（无对应系统）
   *  UnderworldLayer 暂用 h-200 近似（待接世界生成精确值） */
  getSpawnRate(playerYpx: number, nearbySlots: number, waterCandle: boolean, sHeightPx: number): { spawnRate: number; maxSpawns: number } {
    let spawnRate = 600;
    let maxSpawns = 5;
    const w = this.world;
    const underworldY = (w.store.h - 200) * 16;
    if (playerYpx > underworldY) {
      // L389-392：地狱 maxSpawns×2
      maxSpawns = Math.floor(maxSpawns * 2);
    } else if (playerYpx > w.rockLevel * 16 + sHeightPx) {
      // L402-407：洞穴层 spawnRate×0.4 / max×1.9
      spawnRate = Math.floor(spawnRate * 0.4);
      maxSpawns = Math.floor(maxSpawns * 1.9);
    } else if (playerYpx > w.groundLevel * 16 + sHeightPx) {
      // L418-422：地下层 spawnRate×0.5 / max×1.7
      spawnRate = Math.floor(spawnRate * 0.5);
      maxSpawns = Math.floor(maxSpawns * 1.7);
    } else if (!this.dayTime) {
      // L455-459：夜晚 spawnRate×0.6 / max×1.3（血月 ×0.3/×1.8 未实现）
      spawnRate = Math.floor(spawnRate * 0.6);
      maxSpawns = Math.floor(maxSpawns * 1.3);
    }
    // L583-591（无条件）：附近怪 <20%/40%/60%/80% 上限时 ×0.6/×0.7/×0.8/×0.9
    if (nearbySlots < maxSpawns * 0.2) spawnRate = Math.floor(spawnRate * 0.6);
    else if (nearbySlots < maxSpawns * 0.4) spawnRate = Math.floor(spawnRate * 0.7);
    else if (nearbySlots < maxSpawns * 0.6) spawnRate = Math.floor(spawnRate * 0.8);
    else if (nearbySlots < maxSpawns * 0.8) spawnRate = Math.floor(spawnRate * 0.9);
    // L592-604：地下中点以下/腐化/猩红再叠加（Zone flags 为上次生成残留，同原版）
    if (playerYpx / TILE > (w.groundLevel + w.rockLevel) / 2 || this.ZoneCorrupt || this.ZoneCrimson) {
      if (nearbySlots < maxSpawns * 0.2) spawnRate = Math.floor(spawnRate * 0.7);
      else if (nearbySlots < maxSpawns * 0.4) spawnRate = Math.floor(spawnRate * 0.9);
    }
    // L640-646：水蜡烛 spawnRate×0.75 / max×1.5；天空层再 ×0.5
    if (waterCandle) {
      spawnRate = Math.floor(spawnRate * 0.75);
      maxSpawns = Math.floor(maxSpawns * 1.5);
      if (playerYpx / TILE < w.groundLevel * 0.35) spawnRate = Math.floor(spawnRate * 0.5);
    }
    // L655-662：下限 spawnRate≥60，上限 maxSpawns≤15
    if (spawnRate < 60) spawnRate = 60;
    if (maxSpawns > 15) maxSpawns = 15;
    // 地牢（L502-506）：spawnRate×0.3 / max×1.8；未杀骷髅王再压到 10（L696，
    // 在 clamp 之后赋值故不受 ≥60 下限影响——守卫快速轮换）
    if (this.ZoneDungeon) {
      spawnRate = Math.floor(spawnRate * 0.3);
      maxSpawns = Math.floor(maxSpawns * 1.8);
      if (!this.downedBoss3) spawnRate = 10;
    }
    return { spawnRate, maxSpawns };
  }

  /** FindSpawnTile（L879-927）+ GetSpawnArea（L841-877）1:1：
   *  spawnArea = 玩家 ±(0.7×全屏格)（均匀取点，不是环带外扩！），
   *  safeArea = 玩家 ±(0.52×全屏格)——生成点必须落在画面外（!safeArea.Contains）。
   *  viewHalfW/H = 半屏格数 → 0.7×全屏 = ×1.4 半屏；0.52×全屏 = ×1.04 半屏 */
  private findSpawnTile(rng: RNG, viewHalfW: number, viewHalfH: number): boolean {
    const st = this.world.store;
    const px = this.pX, py = this.pY;
    const rangeX = Math.max(1, Math.floor(viewHalfW * 1.4));
    const rangeY = Math.max(1, Math.floor(viewHalfH * 1.4));
    const safeX = Math.max(1, Math.floor(viewHalfW * 1.04));
    const safeY = Math.max(1, Math.floor(viewHalfH * 1.04));
    // WorldUtils.ClampToWorld
    const areaL = Math.max(2, px - rangeX), areaR = Math.min(st.w - 3, px + rangeX);
    const areaT = Math.max(2, py - rangeY), areaB = Math.min(st.h - 3, py + rangeY);
    for (let attempt = 0; attempt < 50; attempt++) {
      const tx = rng.int(areaL, areaR);
      let ty = rng.int(areaT, areaB);
      // L886-888：点在实心格 → 重试（wallHouse 房屋墙检查我们无房屋墙数据，略）
      if (st.isSolid(tx, ty)) continue;
      this.skyMob = false;
      // L890-897：天空怪——高于 worldSurface×0.35 且在世界两侧 45% 之外（肉前非 hardMode 分支）
      if (ty < this.world.groundLevel * 0.35 && (tx < st.w * 0.45 || tx > st.w * 0.55)) {
        this.skyMob = true;
      } else {
        // L900-906：向下找第一个实心格 = 落脚面（扫描上限 = spawnArea.Bottom，非世界底）
        let j = ty;
        while (j < areaB && !st.isSolid(tx, j)) j++;
        if (j >= areaB) continue;
        ty = j;
      }
      // L910：safeArea 内（画面内）一律拒绝 + HasTileSpawnSpace 落点空间校验
      if (Math.abs(tx - px) < safeX && Math.abs(ty - py) < safeY) continue;
      if (!this.hasTileSpawnSpace(tx, ty)) continue;
      // L911：xRange = 落脚点在 safeArea 横向范围内（原版传给 SpawnAnNPC 的水生成判定）
      this.xRange = tx >= px - safeX && tx < px + safeX;
      this.spawnTileX = tx; this.spawnTileY = ty;
      // 落脚处 tile type（原版 GetProperGroundSpawnTileTypeAndWallType）
      const groundType = this.skyMob ? 0 : st.type[st.idx(tx, ty)];
      // PostCheckChosenSpawnTile L924：地牢内刷怪点必须踩地牢砖且上方格有墙，否则换点重试
      if (this.ZoneDungeon &&
        (!this.isDungeonTile(groundType) || st.wall[st.idx(tx, ty)] === 0)) continue;
      this.setFlagsForChosenTile(tx, ty, groundType, rng);
      return true;
    }
    return false;
  }

  /** HasTileSpawnSpace（L5306+5330）：落脚格上方 spawnSpaceX=2 × spawnSpaceY=3 区域
   *  逐格 CanSpawnInTile——非实心且非岩浆（防刷进实心/岩浆里） */
  private hasTileSpawnSpace(tx: number, ty: number): boolean {
    const st = this.world.store;
    for (let dx = -1; dx <= 0; dx++) {
      for (let dy = -3; dy <= -1; dy++) {
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
        const i = st.idx(x, y);
        if (st.isSolid(x, y)) return false;
        if (st.liquid[i] > 0 && st.liquidType[i] === 2) return false;
      }
    }
    return true;
  }

  /** CheckNotSpawningOnScreen（L5344-5366）像素级双保险：
   *  落脚格 16×16 与"玩家屏幕 ±safeRange"矩形相交 → 拒绝。
   *  注意原版单位混用（L5354）：safeRangeX/Y 是格数但直接当像素偏移加——实际外扩仅 ~2 格 */
  private checkNotSpawningOnScreen(px: number, py: number, viewHalfW: number, viewHalfH: number): boolean {
    const sW = viewHalfW * 2 * TILE, sH = viewHalfH * 2 * TILE;
    const safePxX = viewHalfW * 1.04, safePxY = viewHalfH * 1.04; // 格数直接当像素（原版 L5354 原样）
    const rectX = px - sW / 2 - safePxX, rectY = py - sH / 2 - safePxY;
    const rectW = sW + safePxX * 2, rectH = sH + safePxY * 2;
    const tX = this.spawnTileX * TILE, tY = this.spawnTileY * TILE;
    return !(tX < rectX + rectW && tX + TILE > rectX && tY < rectY + rectH && tY + TILE > rectY);
  }

  /** SpawnHornet（NPC.cs:5189-5255 1:1）：Next(8) 选族——
   *  case0-4 黄蜂族 231-235（各 1/4 小 -2k/大 -2k+1 变体）；default(case5-7) 蜂刺族 42 */
  private spawnHornet(x: number, y: number, rng: RNG): Enemy | null {
    const v = rng.int(0, 8);
    const table: Array<[number, number, number]> = [
      [-56, -57, 231], [-58, -59, 232], [-60, -61, 233],
      [-62, -63, 234], [-64, -65, 235],
      [-16, -17, 42],
    ];
    const row = table[Math.min(v, 5)];
    if (rng.next() < 0.25) return this.spawnNPC(x, y, row[0], rng);
    if (rng.next() < 0.25) return this.spawnNPC(x, y, row[1], rng);
    return this.spawnNPC(x, y, row[2], rng);
  }

  // ---- SpawnAnNPC（L1186-5144）——肉前分支 1:1，hardMode 分支保留 ----
  private spawnAnNPC(rng: RNG): Enemy | null {
    const st = this.world.store;
    const x = this.spawnTileX * TILE + 8;
    const y = this.spawnTileY * TILE;
    const N = (n: number) => rng.next() < 1 / n;  // Main.rand.Next(n)==0
    const hardMode = this.hardMode;
    const t = this.spawnTileType;
    const D = (id: number) => this.spawnNPC(x, y, id, rng);

    // ---- 蜘蛛巢（L1569-1587）：落点墙 62 或 spawnSpider 旗标 ----
    const wall = st.wall[st.idx(this.spawnTileX, this.spawnTileY)];
    if (wall === 62 || this.spawnSpider) {
      // 造型师 354（1/8,岩石层深处+场内无 354）：解绑城镇 NPC 救援链路,注释保留
      if (this.hardMode && !N(10)) return D(163);  // hardMode 9/10 黑寡妇(L1577)
      return D(164);                               // 爬墙者
    }
    // ---- 地下沙漠（L1589-1672）----
    if (this.spawnUndergroundDesert) {
      if (N(15)) return D(537);
      const r = rng.next();
      if (r < 0.5) return D(580);
      if (r < 0.9) return D(581);
      return D(69);
    }
    // ---- 海洋（L1705-1834）----
    if (this.waterTile && this.isOcean) {
      // 海鸥 602（L1767：水面上方有干格时 1/10；落点由 Game 的 critter 放置抬到水面线）
      if (N(10)) return D(602);
      if (N(10)) return D(220);
      if (N(18)) return D(221);
      if (N(3)) return D(67);   // 螃蟹
      return D(64);             // 默认粉水母
    }
    // ---- 水池段（L1839-1905）----
    if (this.waterTile && !this.isOcean) {
      // 原版水池在地下也是这些
      if (N(6)) return D(63);   // 蓝水母
      return D(63);
    }
    // ---- 小动物（spawnFriendly 段 L2006-2535，白天 + 草/土 tile + Next(15) 门）----
    if (this.dayTime && !this.waterTile && this.surfaceSpawn &&
      (t === T.GRASS || t === T.DIRT || t === T.SNOW || t === T.SNOW_BRICK || t === 477)) {
      if (N(15)) {
        if (t === T.SNOW || t === T.SNOW_BRICK) {
          // 雪原小动物（L148→148|149 Next(2)）
          if (N(2)) return D(148);
          return D(149);
        }
        // 森林小动物概率表（原版 butterflyChance/stinkBugChance 动态值，取代表值）
        const r = rng.next();
        if (r < 0.2) return D(357);       // 蚯蚓
        if (r < 0.45) return D(377);      // 蚱蜢
        if (r < 0.65) return D(46);       // 兔子
        if (r < 0.8) return D(299);       // 松鼠
        if (r < 0.9) return D(300);       // 老鼠
        return D(74);                     // 鸟
      }
    }
    // ---- 地牢（L2536-2706：CheckToSpawnDungeonEnemies = ZoneDungeon 且玩家在 dungeonY+40 以下）----
    {
      const dungeonY = this.world.dungeonY || Math.floor(this.world.groundLevel);
      if (this.ZoneDungeon && !(this.pY < dungeonY + 40)) {
        // 墙变体（L2540-2552）：94/96/98→1、95/97/99→2；RollLuck(7) 重掷（0.9 尺度下 1/7≈1/7）
        const wallA = st.wall[st.idx(this.spawnTileX, this.spawnTileY)];
        const wallB = st.wall[st.idx(this.spawnTileX, this.spawnTileY - 1)];
        let variant = 0;
        if (wallA === 94 || wallA === 96 || wallA === 98 || wallB === 94 || wallB === 96 || wallB === 98) variant = 1;
        if (wallA === 95 || wallA === 97 || wallA === 99 || wallB === 95 || wallB === 97 || wallB === 99) variant = 2;
        if (N(7)) variant = rng.int(0, 3);
        // 未杀骷髅王（flag12）→ 地牢守卫 68（9999 伤，1:1 原版劝退机制）
        if (!this.downedBoss3) return D(68);
        // L2559 机械师(124)：savedMech/AnyNPCs 未实现，暂缺
        // hardDungeon(hardMode && downedPlantBoss) 分支省略（无此旗标系统）
        if (N(35)) return D(71);   // 地牢史莱姆
        if (variant === 1 && N(3)) return D(70);   // 火轮
        if (variant === 2 && N(5)) return D(72);   // 刺球
        if (variant === 0 && N(7)) return D(34);   // 诅咒头骨
        if (N(7)) return D(32);    // 黑魔法师
        // 书架书怪 693/694（AI_FindNearbyBook）：书架实体系统未实现，暂缺
        const av = rng.int(0, 5);
        if (av === 0) return D(294);
        if (av === 1) return D(295);
        if (av === 2) return D(296);
        if (N(4)) return D(-14);   // Big Boned
        if (N(5)) return D(-13);   // Short Bones
        return D(31);              // 愤怒骨怪
      }
    }
    // ---- 蘑菇地（L3540-3610，tile 70）----
    if (t === T.MUSHROOM_GRASS) {
      if (this.surfaceSpawn) {
        if (N(3)) {
          if (N(4)) return D(259);
          return D(257);
        }
        return D(254);
      }
      if (N(8)) return D(360);
      if (N(4)) return D(259);
      return D(257);
    }
    // ---- 蜂巢墙 86（NPC.cs:3833-3835）：7/8 SpawnHornet ----
    if (wall === 86 && !N(8)) return this.spawnHornet(x, y, rng);
    // ---- 丛林草 tile 60（NPC.cs:3839-3856；旧实现误在肉前出 158 巨型蝙蝠，原版无此分支）----
    if (t === T.JUNGLE_GRASS) {
      const midY = (this.world.groundLevel + this.world.rockLevel) / 2;
      if (this.spawnTileY > midY) {
        // 深层丛林（原版 remix 分支省略）：1/4 棘刺丛林史莱姆 / 1/4 食人怪(锚点) / else 黄蜂族
        if (N(4)) return D(204);
        if (N(4)) return this.spawnNPC(x, y, 43, rng, this.spawnTileX, this.spawnTileY);
        return this.spawnHornet(x, y, rng);
      }
      // 浅层：1/4 丛林蝙蝠 / 1/8 魔腾怪(锚点)
      if (N(4)) return D(51);
      if (N(8)) return this.spawnNPC(x, y, 56, rng, this.spawnTileX, this.spawnTileY);
    }
    // ---- 沙漠地表（L3859-3928，沙尘暴外简化为沙漠 tile 段）----
    if (t === T.SAND || t === T.HARDENED_SAND || t === T.SANDSTONE) {
      if (!hardMode) {
        if (N(6)) return D(69);   // 蚁狮
        return D(61);             // 秃鹫（地表沙）
      }
    }
    // ---- 猩红（L3973-4031）----
    if (this.ZoneCrimson) {
      if (N(5)) return D(182);
      if (N(2)) return D(268);
      if (N(2)) return D(181);
      return D(173);  // 默认 Crimera
    }
    // ---- 腐化(NPC.cs:4032-4074 一比一)----
    // 门禁 = 落脚面 tile:腐化草 23 / 黑檀石 25 / 黑沙 112 / 腐化冰 163 / 腐化丛林草 661,
    // 或(黄沙 22 && ZoneCorrupt)。攀爬者 101 仅困难模式+岩石层下 1/3,锚点格随 spawn 传入
    const corruptFloor = t === T.CORRUPT_GRASS || t === T.EBONSTONE || t === T.EBONSAND
      || t === T.CORRUPT_ICE || ((t === T.SAND) && this.ZoneCorrupt);
    const ugRock = this.spawnTileY >= this.world.rockLevel; // flag16
    if (corruptFloor) {
      if (hardMode && ugRock && N(40)) return D(83);       // World Feeder(蠕虫,1/40)
      if (hardMode && ugRock && N(3)) {
        return this.spawnNPC(x, y, 101, rng, this.spawnTileX, this.spawnTileY); // 攀爬者(锚点格)
      }
      if (hardMode && N(3)) return D(N(3) ? 121 : 81);     // 史莱姆法师/腐化史莱姆
      if (hardMode && (N(2) || ugRock)) return D(94);      // 腐化史莱姆
      if (N(3)) return D(-11);   // 小噬魂怪
      if (N(3)) return D(-12);   // 大噬魂怪
      return D(6);               // 默认 Eater of Souls
    }
    // ---- 地表（L4075-4717）----
    if (this.surfaceSpawn) {
      if (this.ZoneSnow) {
        // 雪原地表（L4560+）
        if (hardMode && N(3)) return D(155);
        if (N(6)) return D(147);   // 冰史莱姆
        return D(161);             // 雪原狼
      }
      if (this.dayTime) {
        // 白天地表小动物门已过 → 池底
        if (!this.waterTile) {
          return D(this.getBasicSlimeToSpawn(true, t, rng));  // L4402
        }
        return null;
      }
      // 夜晚（L4454-4716）：Next(6) 门
      if (N(6) || (this.world.clock.dayCount >= 0 && N(2) && false)) {  // moonPhase 暂无
        if (N(2)) {
          if (N(4)) return D(-43);  // 小恶魔眼
          return D(2);              // 恶魔眼
        }
        // switch(Next(5)) 僵尸系
        const zv = rng.int(0, 5);
        const zm = [190, 191, 192, 193, 194][zv] ?? 3;
        if (N(3)) {
          // 各配 1/3 概率小变种
          const small = [-38, -39, -40, -41, -42][zv] ?? -38;
          return D(small);
        }
        return D(zm);
      }
      // 夜间池底（L4561+ torch zombie 等）
      if (!this.ZoneSnow && !this.ZoneJungle && !this.waterTile) {
        return D(3);  // 普通僵尸兜底
      }
      return null;
    }
    // ---- 地下层（L4718-4770，worldSurface < y < rockLayer）----
    if (this.underGround) {
      if (!this.noWorms && N(50) && !this.ZoneSnow) {
        return D(10);   // Giant Worm
      }
      if (this.ZoneSnow) return D(147);
      return D(this.getBasicSlimeToSpawn(false, t, rng));
    }
    // ---- 地狱（L4771-4820，y > maxTilesY-190）----
    if (this.spawnTileY > st.h - 190) {
      if (N(40)) return D(39);   // Bone Serpent
      if (N(14)) return D(24);   // Fire Imp
      if (N(7)) {
        if (N(10)) return D(66);  // Voodoo Demon
        return D(62);             // Demon
      }
      if (N(3)) return D(59);    // Lava Slime
      return D(60);              // Hellbat
    }
    // ---- 洞穴通用池（L4825-5142）----
    if (N(60)) {
      if (this.ZoneSnow) return D(218);
      return D(217);
    }
    if (!this.noWorms && N(100) && !this.ZoneHallow) {
      if (!hardMode) {
        if (this.ZoneSnow) return D(185);
        return D(10);
      }
    }
    if (this.ZoneSnow && N(20)) return D(185);
    if ((!hardMode && N(10)) || (hardMode && N(20))) {
      if (this.ZoneSnow) return D(184);
      if (N(3)) return D(-6);  // 黑史莱姆
      return D(16);            // 母史莱姆
    }
    if ((!hardMode) && N(4)) {
      if (this.ZoneSnow) return D(184);
      if (N(3)) return D(-6);
      return D(184);
    }
    if (N(2)) {
      // 洞穴主池（L4896+）
      if (N(35) && !this.waterTile) return D(453);  // Creeper Egg
      if (N(80)) return D(195);                     // Tim（罕）
      if (N(200)) return D(45);                     // Bound Goblin
      if (this.nearMarble && !N(4)) {
        if (hardMode && N(6)) return D(480);
        return D(481);
      }
      if (this.nearGranite && !N(5)) {
        if (N(6)) return D(483);
        return D(482);
      }
      if (N(20)) return D(44);   // 附魔剑
      // switch(Next(4)) 骷髅系
      const sv = rng.int(0, 4);
      const sm = [21, 201, 202, 203][sv] ?? 21;
      if (N(3)) {
        const small = [[-46, -47], [-48, -49], [-50, -51], [-52, -53]][sv] ?? [-46, -47];
        return D(rng.next() < 0.5 ? small[0] : small[1]);
      }
      return D(sm);
    }
    // 洞穴兜底（L5101-5142）
    if (this.ZoneJungle) return D(51);
    if (this.ZoneSnow) return D(150);
    return D(49);  // Cave Bat

    return null;
  }

  /** GetBasicSlimeToSpawn（L5537-5580） */
  private getBasicSlimeToSpawn(surface: boolean, tileType: number, rng: RNG): number {
    if (!surface) {
      // 地下：Next(5)==0→-9（黄），否则 Next(2)==0→1（蓝）/-8（红）
      if (rng.next() < 0.2) return -9;
      return rng.next() < 0.5 ? 1 : -8;
    }
    switch (tileType) {
      case T.MUD: return -10;     // 丛林
      case T.SNOW: case T.SNOW_BRICK: return 147;  // 冰
      default:
        if (rng.next() < 1 / 3) return -3;         // 绿
        if (rng.next() < 0.1) return -7;           // 紫
        return 1;                                   // 蓝
    }
  }

  /** 主入口：Game.trySpawnEnemy 调用 */
  spawn(playerX: number, playerY: number, rng: RNG, viewHalfW: number, viewHalfH: number): Enemy | null {
    this.pX = Math.floor(playerX / TILE);
    this.pY = Math.floor(playerY / TILE);
    this.dayTime = this.world.clock.isDay;
    this.hardMode = !!this.world.flags.hardMode;
    this.noWorms = false;
    this.skyMob = false;
    this.spawnSpider = false;
    // 邻近旗标每尝试复位(原版每次 TrySpawnAnNPC 全新置旗;
    // 泄漏会导致碰过大理石后全图永远出蛇发女妖)
    this.nearMarble = false;
    this.nearGranite = false;
    this.spawnUndergroundDesert = false;
    if (!this.findSpawnTile(rng, viewHalfW, viewHalfH)) return null;
    // TrySpawnAnNPC L220：CheckNotSpawningOnScreen 像素级二次校验（画面内/贴屏拒绝）
    if (!this.checkNotSpawningOnScreen(playerX, playerY, viewHalfW, viewHalfH)) return null;
    this.currentSpawnX = this.spawnTileX;
    this.currentSpawnY = this.spawnTileY;
    // 探针调试覆盖：debugPoolOverride 非空时绕过原版链直接从池选（确定性验证）
    if (debugPoolOverride && debugPoolOverride.length) {
      return this.spawnNPC(this.spawnTileX * 16 + 8, this.spawnTileY * 16,
        debugPoolOverride[rng.int(0, debugPoolOverride.length - 1)], rng);
    }
    return this.spawnAnNPC(rng);
  }
}
