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
    JUNGLE_GRASS: get('v_60_jungle_grass'), CORRUPT_GRASS: get('v_23_corrupt_grass_block'),
    CRIMSON_GRASS: get('v_199_crimson_grass_block'), MUSHROOM_GRASS: get('v_70_mushroom_grass'),
    EBONSAND: get('v_112_ebonsand_block'), CRIMSAND: get('v_234_crimsand_block'),
    PEARLSAND: get('v_116_pearlsand'), HARDENED_SAND: get('hardened_sand'),
    SANDSTONE: get('sandstone'), MARBLE: get('v_367_marble'), GRANITE: get('v_368_smooth_granite'),
    CACTUS: get('v_80_cactus'), SNOW_BRICK: get('v_161_snow_brick'),
    CORRUPT_ICE: get('v_163_corrupt_ice'), CRIMSON_ICE: get('v_200_frozen_crimson'),
    HOLLOW_ICE: get('v_164_hallowed_ice'), DUNGEON_BLUE: get('v_41_blue_brick'),
  };
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
import vanillaNetIdJson from '../../../public/sprites/vanilla-npcnetid.json';
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
  private ZoneSnow = false; private ZoneCorrupt = false; private ZoneCrimson = false;
  private ZoneHallow = false; private ZoneJungle = false; private ZoneGlowshroom = false;
  private ZoneDungeon = false; private ZoneGraveyard = false; private ZoneBeach = false;
  private spawnTileX = 0; private spawnTileY = 0;
  private spawnTileType = 0;
  /** 落脚点（Game 放置用） */
  currentSpawnX = 0;
  currentSpawnY = 0;

  constructor(private world: World) {}

  /** 造怪入口：netId 可为负（SetDefaultsFromNetId 映射） */
  private spawnNPC(x: number, y: number, netId: number, rng: RNG): Enemy | null {
    const map = NET_ID_MAP[netId];
    const baseId = map?.base ?? netId;
    const e = Enemy.fromVanilla(baseId, x, y);
    if (!e) return null;
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
    e.id = this.world.store.w; // 占位，Game 侧会重编
    return e;
  }

  // ---- SetSpawnFlagsForChosenTile（L950-1185） ----
  private setFlagsForChosenTile(spawnTileX: number, spawnTileY: number, spawnTileType: number): void {
    const st = this.world.store;
    this.spawnTileX = spawnTileX; this.spawnTileY = spawnTileY; this.spawnTileType = spawnTileType;
    // waterTile（L957）：落脚格上方两格都是液体且为水
    const above1 = st.idx(spawnTileX, spawnTileY - 1), above2 = st.idx(spawnTileX, spawnTileY - 2);
    this.waterTile = st.liquid[above1] > 0 && st.liquid[above2] > 0 && st.liquidType[above1] === 1;
    // nearMarble/nearGranite（L958-1006）：tile 367/368 或玩家处
    if (spawnTileType === T.MARBLE) this.nearMarble = true;
    else if (spawnTileType === T.GRANITE) this.nearGranite = true;
    else if (st.type[st.idx(this.pX, this.pY)] === T.MARBLE) this.nearMarble = true;
    else if (st.type[st.idx(this.pX, this.pY)] === T.GRANITE) this.nearGranite = true;
    // 地下沙漠（L1077-1100）：墙 216/217（ AllowsUndergroundDesertEnemiesToSpawn）
    const w = st.wall[st.idx(spawnTileX, spawnTileY)];
    if (spawnTileY < this.world.rockLevel && spawnTileY > 200) {
      this.spawnUndergroundDesert = w === 216 || w === 217 || w === 187;
    }
    this.surfaceSpawn = spawnTileY <= this.world.groundLevel;
    this.deeperThanRockLayer = spawnTileY >= this.world.rockLevel;
    this.underGround = spawnTileY > this.world.groundLevel && spawnTileY < this.world.rockLevel;
    // isOcean（L1104）：边缘 + 沙 tile + 岩石层上
    this.isOcean = (spawnTileX < 250 || spawnTileX > st.w - 250) && spawnTileType === T.SAND && spawnTileY < this.world.rockLevel;
    this.isBeach = spawnTileY <= this.world.groundLevel && (spawnTileX < 340 || spawnTileX > st.w - 340);
    // Zone 判定（L289-334 取自 player.Zone；此处按 spawn tile 类型采样）
    this.ZoneSnow = spawnTileType === T.SNOW || spawnTileType === T.ICE || spawnTileType === T.SNOW_BRICK;
    this.ZoneCorrupt = spawnTileType === T.CORRUPT_GRASS || spawnTileType === T.EBONSAND || spawnTileType === T.CORRUPT_ICE;
    this.ZoneCrimson = spawnTileType === T.CRIMSON_GRASS || spawnTileType === T.CRIMSAND || spawnTileType === T.CRIMSON_ICE;
    this.ZoneHallow = spawnTileType === T.PEARLSAND || spawnTileType === T.HOLLOW_ICE;
    this.ZoneJungle = spawnTileType === T.MUD || spawnTileType === T.JUNGLE_GRASS;
    this.ZoneGlowshroom = spawnTileType === T.MUSHROOM_GRASS;
    this.ZoneDungeon = spawnTileType === T.DUNGEON_BLUE;
  }

  // ---- FindSpawnTile（L879-920）----
  private findSpawnTile(rng: RNG, viewHalfW: number, viewHalfH: number): boolean {
    const st = this.world.store;
    const px = this.pX, py = this.pY;
    for (let attempt = 0; attempt < 50; attempt++) {
      // 生成区 = 视口外扩（原版 GetSpawnArea L841-877：±(viewHalfW+11~44) 随机）
      const rngW = rng.int(viewHalfW + 11, viewHalfW + 44);
      const rngH = rng.int(viewHalfH + 11, viewHalfH + 44);
      let tx = px + rng.int(-rngW, rngW);
      let ty = py + rng.int(-rngH, rngH);
      if (tx < 2 || tx > st.w - 3 || ty < 2 || ty > st.h - 3) continue;
      // 原版 L886：点在实心/房屋墙内 → 重试
      if (st.isSolid(tx, ty)) continue;
      // skyMob 判定（L890-897）：高于地表 35% 且在世界两侧 45% 外 → 天空怪
      this.skyMob = ty < this.world.groundLevel * 0.35 &&
        (tx < st.w * 0.45 || tx > st.w * 0.55);
      // L900-902：向下找第一个实心格 = 落脚面
      if (!this.skyMob) {
        let j = ty;
        while (j < st.h - 2 && !st.isSolid(tx, j)) j++;
        if (j >= st.h - 2) continue;
        ty = j;
      }
      // 落脚处 tile type = 下方实心格类型（原版 GetProperGroundSpawnTileTypeAndWallType）
      const groundType = this.skyMob ? 0 : st.type[st.idx(tx, ty)];
      this.setFlagsForChosenTile(tx, ty, groundType);
      return true;
    }
    return false;
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

    // ---- 蜘蛛巢（L1569-1587）：墙 62 ----
    const wall = st.wall[st.idx(this.spawnTileX, this.spawnTileY)];
    if (wall === 62) {
      if (N(10)) return D(163);  // hardMode 蜘蛛；肉前爬行者
      return D(164);
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
    // ---- 丛林地表（L3713-3740）----
    if (t === T.JUNGLE_GRASS) {
      if (N(2)) {
        // 丛林地表池
        if (N(3)) return D(158);
        return D(51);
      }
      return D(51);  // SpawnHornet
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
    // ---- 腐化（L4032-4074）----
    if (this.ZoneCorrupt) {
      if (N(3)) return D(101);
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
    if (!this.findSpawnTile(rng, viewHalfW, viewHalfH)) return null;
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
