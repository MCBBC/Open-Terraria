// ★IIIII22b（2026-08-28）：双地牢（"double daring dangers" / SecretSeed.dualDungeons）
// NPC 出没区域扫描 1:1 移植。本模块零依赖世界生成域（DungeonStyles1457 只在 gen 侧），
// 全部风格/墙表内嵌转录并标注 cs 行号，供运行时两类消费点接线：
//   ① NPC.Spawner.SetSpawnFlagsForChosenTile 尾部支（NPC.cs:1256-1281 → :428-441）：
//      dual 世界地下落脚点 rand(7) 重掷地表带 + 按落脚格重写 Zone* —— → 出生表选择
//      （src/world/spawn/VanillaSpawner.ts setFlagsForChosenTile 尾部接线）；
//   ② SceneMetrics.CalculateZones 尾部支（SceneMetrics.cs:714-738）：玩家中心向下 ≤300 格
//      扫描到首个可判格，重写玩家 Zone*（HUD 群系旗/群系音乐/pylon 等消费面）。
//      本仓映射 = scanScene 尾部（src/world/SceneMetrics.ts）。
// 审计锚：docs/worldgen/secret-seed-audit-matrix-2026-08-28.md §2 行 #46「NPC 域 6 处
// ✗ NPCSpawningFlagsForDualDungeons 区域扫描→出生表」+ §4 E 车道。
// ★门纪律：所有入口都要求 world.seedFlags?.dualDungeons 为真；非双地牢世界调用即早退，
//   零扫描零掷骰——普通世界与现有金标完全无感。
import { TILE_DEFS, BOULDERS_SHEETS, WALL_DUNGEON_SHEETS as WALL_DUNGEON_SHEETS_AUTH, DUNGEON_UNION_CRACKED_SHEETS } from '../data/tiles';
import { TileStore } from './TileStore';

/** Terraria/NPCSpawningFlagsForDualDungeons.cs:6-24（九 Zone 位逐字对照） */
export interface DualDungeonZoneScan {
  ZoneDungeon: boolean;
  ZoneSnow: boolean;
  ZoneGlowshroom: boolean;
  ZoneCorrupt: boolean;
  ZoneCrimson: boolean;
  ZoneJungle: boolean;
  ZoneHallow: boolean;
  ZoneLihzhardTemple: boolean;
  ZoneUndergroundDesert: boolean;
}

export const emptyDualZoneScan = (): DualDungeonZoneScan => ({
  ZoneDungeon: false, ZoneSnow: false, ZoneGlowshroom: false, ZoneCorrupt: false,
  ZoneCrimson: false, ZoneJungle: false, ZoneHallow: false,
  ZoneLihzhardTemple: false, ZoneUndergroundDesert: false,
});

// ── 静态表（id 全部为原版 sheet id；内部 tile id 经 SHEET_LUT 换算到 sheet 域比较） ──

/** WallID.cs:38 DualDungeonsJungleBiomeWalls = {64,204,205,206,207,15} */
const DUAL_DUNGEONS_JUNGLE_WALLS_SHEETS = new Set([64, 204, 205, 206, 207, 15]);

/** DungeonGenerationStyles.cs:186-192 Cavern（Style=1）BrickWallType=349；
 *  WallIsInStyle 缺省 includeWindows/includeExtras=false ⇒ 只比 BrickWallType
 *  （DungeonGenerationStyleData.cs:131-147）。ScanZonesFor case 1/38 与 case 123 第一臂引用 */
const CAVERN_BRICK_WALL = 349;
/** DungeonGenerationStyles Temple（Style=10）BrickWallType=87（JS 对拍表
 *  src/world/gen/vanilla/DungeonStyles1457.ts:159 同值）；ScanZonesFor case 123 第三臂引用 */
const TEMPLE_BRICK_WALL = 87;

/** WallID.cs:21 Sets.Conversion.Sandstone = {187,220,222,221,275,308,310,309} */
const SANDSTONE_CONV_WALLS = new Set([187, 220, 222, 221, 275, 308, 310, 309]);
/** WallID.cs:23 Sets.Conversion.HardenedSand = {216,217,219,218,304,305,307,306} */
const HARDENED_SAND_CONV_WALLS = new Set([216, 217, 219, 218, 304, 305, 307, 306]);
/** wall 223：SceneMetrics.cs:736 ZoneUndergroundDesert 收尾第三项 */
const EXTRA_UGDESERT_WALL = 223;

/** Main.wallDungeon（Main.cs:10734-10745 全表）：{7,8,9} ∪ [94..99]（地牢砖墙组）。
 *  SceneMetrics.cs:722 ZoneDungeon 收尾并墙门 + Player.Spawn 门共用语义。
 *  ★BJ187 收编 data/tiles.ts:WALL_DUNGEON_SHEETS 单源（9 项逐值全等）——
 *  转出口保持旧 API（Game/CleanupPass 等既有导入面不动） */
export const WALL_DUNGEON_SHEETS = WALL_DUNGEON_SHEETS_AUTH;

/** TileID.cs:195 TileID.Sets.Boulders = CreateBoolSet(138,484,664,665,711..716) */
// ★BJ182b 收编单源 data/tiles.ts:BOULDERS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const BOULDER_SHEETS = BOULDERS_SHEETS;

/** 内部 tile id → vanilla sheet id（TILE_DEFS.vanilla.sheet；缺席 = -1） */
const SHEET_LUT: Int16Array = (() => {
  const lut = new Int16Array(TILE_DEFS.length);
  for (let t = 0; t < TILE_DEFS.length; t++) lut[t] = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  return lut;
})();

const sheetOf = (internalId: number): number => SHEET_LUT[internalId] ?? -1;

/** 运行时巨石判定（内部 id 集，惰性构建一次；TILE_DEFS 构建后不变所以缓存安全） */
let _boulderInternal: Set<number> | null = null;
function isBoulderInternal(internalId: number): boolean {
  if (!_boulderInternal) {
    const s = new Set<number>();
    for (let t = 0; t < SHEET_LUT.length; t++) {
      if (BOULDER_SHEETS.has(SHEET_LUT[t])) s.add(t);
    }
    _boulderInternal = s;
  }
  return _boulderInternal.has(internalId);
}

/**
 * WorldGen.SolidTile3（WorldGen.cs SolidTile3(Tile) 1:1）：
 * nactive() && main.tileSolid[type] && !main.tileSolidTop[type]。
 * 本仓等价：isActive(含致动位排除=原版 nactive) && SOLID_LUT==1 && 非 platform。
 * 平台族在 vanilla 是 tileSolid∧tileSolidTop，被此处尾项排除——tiles.ts 里
 * platform:true 的 def 均不进 SOLID_LUT（solid=false），双保险再查 def.platform。 */
export function solidTile3DD(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const tid = st.type[i];
  // ★幽灵保域（2026-09-03）：nactive() 首支 active() 补 flags bit0（原版
  //  WorldGen.cs SolidTile3(Tile) `t.nactive() && …`）——幽灵格不可站不受理扫描
  if (tid === 0 || (st.flags[i] & 1) === 0) return false;
  if ((st.wire[i] & TileStore.WIRE_ACTUATED) !== 0) return false;   // inActive 位
  return TileStore.SOLID_LUT[tid] === 1 && !TILE_DEFS[tid]?.platform;
}

/** 落脚格上方一格墙（vanilla Framing.GetTileSafely(x,y-1).wall，越界=0） */
function wallAbove(st: TileStore, x: number, y: number): number {
  if (!st.inBounds(x, y - 1)) return 0;
  return st.wall[st.idx(x, y - 1)];
}

// ── ScanZonesFor（NPCSpawningFlagsForDualDungeons.cs:44-213 1:1） ─────────────

/**
 * 单格扫描：tile type（sheet 域 switch）+ 上方一格墙的次级臂。命中任一臂返回 true
 * （作为 CanScan 下扫循环的中止条件）。case 数字全部为原版 sheet id。
 * @param rockLayer world.rockLevel（case 41/43/44/481-483 的 `(double)y > Main.rockLayer` 门；
 *                  原版此处读 Main.rockLayer 静态值——运行时取读档快照 rockLevel 同义） */
export function scanZonesForDualDungeon(
  st: TileStore, x: number, groundY: number, rockLayer: number,
  out: DualDungeonZoneScan,
): boolean {
  if (!st.inBounds(x, groundY)) return false;
  const type = sheetOf(st.type[st.idx(x, groundY)]);
  const wall = wallAbove(st, x, groundY);
  let result = false;

  // ---- 主 switch（cs:49-157） ----
  // 神圣族 :51-64
  if ([109, 110, 113, 116, 117, 118, 164, 385, 402, 403, 492].includes(type)) {
    out.ZoneHallow = true; result = true;
  }
  // 雪族 :65-73
  else if ([147, 148, 161, 162, 206, 224].includes(type)) {
    out.ZoneSnow = true; result = true;
  }
  // 丛林草/泥沙族 :74-83
  else if ([60, 61, 62, 74, 225, 383, 384].includes(type)) {
    out.ZoneJungle = true; result = true;
  }
  // 泥土 59/冻土 120 × 丛林墙集 :84-91
  else if (type === 59 || type === 120) {
    if (wall > 0 && DUAL_DUNGEONS_JUNGLE_WALLS_SHEETS.has(wall)) { out.ZoneJungle = true; result = true; }
  }
  // 地牢石砖 1 / 38(Cavern BrickTileType) × 地牢风格墙 :92-98
  else if (type === 1 || type === 38) {
    if (wall > 0 && wall === CAVERN_BRICK_WALL) result = true;
  }
  // 191 活木砖（LivingWood）:99-101 —— 仅作下扫中止位，不置任何 Zone
  else if (type === 191) {
    result = true;
  }
  // 腐化族 :102-113
  else if ([23, 24, 25, 32, 112, 398, 400, 474, 661].includes(type)) {
    out.ZoneCorrupt = true; result = true;
  }
  // 163 紫冰 = 雪+腐化双置 :114-117
  else if (type === 163) {
    out.ZoneSnow = true; out.ZoneCorrupt = true; result = true;
  }
  // 200 红冰 = 雪+猩红双置 :118-121
  else if (type === 200) {
    out.ZoneSnow = true; out.ZoneCrimson = true; result = true;
  }
  // 猩红族 :122-133
  else if ([195, 199, 201, 203, 234, 352, 399, 401, 662].includes(type)) {
    out.ZoneCrimson = true; result = true;
  }
  // 地牢主砖族 :134-145（岩石层以下才置 ZoneDungeon）——★BJ218 并集单源（§6j）
  else if (DUNGEON_UNION_CRACKED_SHEETS.has(type)) {
    if (groundY > rockLayer) out.ZoneDungeon = true;
    result = true;
  }
  // 神庙砖 226 :146-149
  else if (type === 226) {
    out.ZoneLihzhardTemple = true; result = true;
  }
  // 蘑菇族 :150-156
  else if ([70, 71, 72, 528].includes(type)) {
    out.ZoneGlowshroom = true; result = true;
  }

  // ---- 123 三臂链 :158-174 ----
  if (type === 123 && wall > 0) {
    if (wall === CAVERN_BRICK_WALL) result = true;
    else if (DUAL_DUNGEONS_JUNGLE_WALLS_SHEETS.has(wall)) { out.ZoneJungle = true; result = true; }
    else if (wall === TEMPLE_BRICK_WALL) { out.ZoneLihzhardTemple = true; result = true; }
  }

  // ---- 第二 switch（泥土/冻冰×Conversion 墙族→Zone 置位，cs:175-211） ----
  // 与主 switch 相互独立（vanilla 即两个连续 switch），同格可双臂命中
  if (type === 22 || type === 140) {
    if (wall === 69 || wall === 217 || wall === 220 || wall === 3 || wall === 233) {
      out.ZoneCorrupt = true; result = true;
    }
  } else if (type === 204 || type === 347) {
    if (wall === 81 || wall === 218 || wall === 221 || wall === 83 || wall === 77) {
      out.ZoneCrimson = true; result = true;
    }
  } else if ([53, 112, 116, 234, 396, 397, 398, 399, 400, 401, 402, 403].includes(type)) {
    if (HARDENED_SAND_CONV_WALLS.has(wall) || SANDSTONE_CONV_WALLS.has(wall) || wall === 223) {
      out.ZoneUndergroundDesert = true; result = true;
    }
  }
  return result;
}

// ── CanScan（NPCSpawningFlagsForDualDungeons.cs:26-42 1:1） ─────────────────

/** 扫描受理门：实心可站格 + 排除巨石/48(不安全泥沙)/137(蛛网墙层)/232(木刺) */
export function canScanDualDungeonCell(st: TileStore, x: number, y: number): boolean {
  if (!solidTile3DD(st, x, y)) return false;
  const tid = st.type[st.idx(x, y)];
  if (isBoulderInternal(tid)) return false;
  const t = sheetOf(tid);
  if (t === 48 || t === 137 || t === 232) return false;
  return true;
}

// ── 消费点①：chosen-tile 扫描（NPC.cs:431 ScanZonesFor(spawnTileX,groundTileY)） ──

/** Spawner 落脚格九位快照。覆盖序由调用方执行（NPC.cs:432-440）：
 *   ZoneDungeon &= scan.ZoneDungeon；Snow/Glowshroom/Corrupt/Crimson/Jungle/Hallow/
 *   LihzhardTemple = scan 同名位；spawnUndergroundDesert &= scan.ZoneUndergroundDesert。 */
export function scanChosenTileZones(
  st: TileStore, spawnTileX: number, groundTileY: number, rockLayer: number,
): DualDungeonZoneScan {
  const scan = emptyDualZoneScan();
  scanZonesForDualDungeon(st, spawnTileX, groundTileY, rockLayer, scan);
  return scan;
}

// ── 消费点②：SceneMetrics 尾部支整段封装（SceneMetrics.cs:714-738） ─────────

/**
 * 门 = dualDungeonsSeed && BelowSurface(y > worldSurface) && !ZoneUnderworldHeight(y ≤ h-200)
 * ；下扫 = `for(i<300 && !(CanScan(c,c+i) && ScanZonesFor(c,c+i)));`——300 格内从玩家所在行
 * 向下找首个可判格起效（vanilla 循环体为空）。落空时九位全 false 且覆盖仍无条件执行
 * （vanilla 就是把 Zone* 整段重写成 scan 值）——返回的非空对象必须无条件采用，
 * null 仅表示门未开（调用方走默认分支零改动）。
 * 收尾两门在此并入（:722/:736）：
 *   ZoneDungeon = scan.ZoneDungeon && wallDungeon(centerWall)；
 *   ZoneUndergroundDesert = scan.ZoneUndergroundDesert
 *     && (Conversion.Sandstone|HardenedSand|223)(centerWall) && !wallHouse(centerWall)。 */
export function sceneMetricDualOverride(
  st: TileStore, tileX: number, tileY: number, worldSurface: number,
  underworldLayer: number, rockLayer: number, centerWallSheet: number,
  isWallHouse: (sheet: number) => boolean,
): DualDungeonZoneScan | null {
  if (!(tileY > worldSurface) || tileY > underworldLayer) return null;
  const scan = emptyDualZoneScan();
  for (let i = 0; i < 300; i++) {
    if (canScanDualDungeonCell(st, tileX, tileY + i)
      && scanZonesForDualDungeon(st, tileX, tileY + i, rockLayer, scan)) break;
  }
  scan.ZoneDungeon = scan.ZoneDungeon && WALL_DUNGEON_SHEETS.has(centerWallSheet);
  scan.ZoneUndergroundDesert = scan.ZoneUndergroundDesert
    && (SANDSTONE_CONV_WALLS.has(centerWallSheet) || HARDENED_SAND_CONV_WALLS.has(centerWallSheet)
      || centerWallSheet === EXTRA_UGDESERT_WALL)
    && !isWallHouse(centerWallSheet);
  return scan;
}
