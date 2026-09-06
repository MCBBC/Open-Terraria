// ★IIIII22b（2026-08-28）：royale-with-cheese 多人队伍出生点系统（SecretSeed.teamBasedSpawns）
// —— 审计矩阵 §2 行 #45 全维 P0：JS 侧仅 WldParser 读位（WF57:2507），ExtraSpawnSettings/
// ExtraSpawnPointManager 运行时零实装。本文件为 1:1 移植与接线：
//
//   vanilla 链路考证（Terarria1457）：
//   · 触发面   WorldGen.cs:563-565 InitializeSecretSeeds → Main.teamBasedSpawnsSeed=true；
//              :673-685 FinalizeSecretSeeds 组装 ExtraSpawnSettings + GenerateExtraSpawns()
//              （cs:1707-1730 DoExtraLiquidAddBubbleBlocks 内另有 minRadius 10→20 的 GEN 面；
//              cs:22789-22804 SkyblockIsland 按队生成 Style13 岛——GEN 侧本批不接，见尾注）
//   · 分布语义 ExtraSpawnPointManager.cs:91-113 GenerateExtraSpawns：
//              extraSpawnPoints = new Point[PlayerTeamID.Count=6]
//              （PlayerTeamID.cs:17 None/Red/Green/Blue/Yellow/Purple）；队 0 恒=世界出生点，
//              队 1-5 先各搜一个候选（TryFindSpawnRandomly，500 外层×250 内层尝试、左右半图
//              交替、与已收候选保持 ≥250/150 格双向间隔），再随机洗牌分配到各队。
//   · 消费点   Player.Spawn :37911-37916 三分支——床点(SpawnX≥0) > 队伍点
//              (Main.teamBasedSpawnsSeed) > 世界出生点；Spawn_SetPositionAtTeamSpawn
//              :38278-38290 = TryGetExtraSpawnPointForTeam(team) → Spawn_GetPositionAtSpawn
//              扫位(:38008-38046 上±30/下±30 找有效位+DescendFromDefaultSpace 落地板)
//              → Spawn_ForceClearArea(:38199 清 3×3 净空，仅重定位落点仍非法时可达)
//   · 落格规则 Utils.CheckForGoodTeleportationSpot(:518-601) RandomTeleportationAttemptSettings
//              （20×42 盒/避液避岩浆避伤害块避墙/mostlySolidFloor/≤100 坠落/strictRange/
//              tilesToAvoid=GetTilesToAvoidForSpawn_TeamBasedSpawns(WorldGen.cs:8200-8267
//              37 项表,noTraps/notTheBees/errorWorld/worldIsFrozen/worldIsInfected 各减支)）
//   · 网络面   NetMessage.cs:379(b13[5])/MessageBuffer.cs:623(b19[5]) 世界旗广播 + msg157
//              ExtraSpawnPointManager.Write/Read(:437-457) 服务器权威下发点表——本仓协议层
//              D 批冻结不动 ⇒ 改用"同种子确定性重放"范式（同 [[SkyRenderer.spawnAmbientNet]]
//              同 seed 重放 / SimHost 确定性 LiquidSim 收敛先例）：每客户端以
//              UnifiedRandom(seed 哈希盐) 在加载态世界全量重算点表。世界 strip 同步保证
//              各端 tile 态一致 ⇒ 点表逐元素收敛；非协议改动、单机/联机同路径。
//
//   登记偏差（docs/worldgen/secret-seed-audit-matrix §E 行同步更新）：
//   R1 掷流源 = 独立种子盐重放，非世界生成 genRand 续掷（recompute 范式的必然代价；
//      分布形态 1:1，具体点位与原版同种子不可逐位对拍）。另：像素级 Collision 逃逸探针
//      /SlopeCollision 省略（同 WorldGen.ts vampireSeedFinishPass 判例，误差 <1 格）；坡度
//      位 halfBrick()/topSlope() 不承载 ⇒ cs:248-251 臂恒不拒。
//   R2 remix 带（GenVars.remixSurfaceLayerLow/MushroomLayerHigh，cs:133-137/:262-276）本仓
//      未移植 remix 层参数 ⇒ settings.remix 一律按 false 评估（getfixedboi 世界按地表带
//      语义取点，偏差登记）。
//   R3 skyblock/roundLandmass/extraliquid 三支候选集依赖 GenVars.landmassData（cs:44-80）
//      本仓未建模结构登记表 ⇒ 候选恒空走 fallback 百分位列（vanilla 候选空时的既定行为，
//      cs:168-186 while 循环 list 空 即穿出到 TryFindSpawnAt 失败追加 fallback）。GEN 侧
//      skyblock 按队 Style13 岛生成（cs:22789-22804）随双地牢/组合批另立车道。
//   R4 PrepareExtraSpawns 尾扫（:417-428 地下点周边 DoAdditionalChangesAroundSpawnIfNeeded）
//      未接（gen 期整链，登记 GAP）。
//   R5 Spawn_ForceClearArea 分支在本移植按构造不可达（见 resolveTeamSpawnFloor 注），
//      免 KillTile 掉落面误伤登入体验；若未来放宽扫位窗需先补静默清除通道。
import { UnifiedRandom } from '../../core/rng';
import { TileStore } from '../TileStore';
import type { World } from '../World';
import { TILE_DEFS } from '../../data/tiles';

/** PlayerTeamID.cs:17 Count=6（None+五色队） */
export const PLAYER_TEAM_COUNT = 6;

export interface ExtraSpawnPoint { x: number; y: number }

interface ExtraSpawnSettings {
  surface: boolean;
  remix: boolean;
  roundLandmass: boolean;
  skyblock: boolean;
  extraLiquid: boolean;
}

// ── sheet id 表（内部 id 换算，与 DungeonDualZones 同约定） ──────────────────

const SHEET_LUT: Int16Array = (() => {
  const lut = new Int16Array(TILE_DEFS.length);
  for (let t = 0; t < TILE_DEFS.length; t++) lut[t] = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  return lut;
})();
const sheetOf = (internalId: number): number => SHEET_LUT[internalId] ?? -1;

/** TileID.cs:195 TileID.Sets.Boulders 表 */
const BOULDER_SHEETS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
/** Main.tileDungeon 全表(Main.cs:7941)+1457 变体砖 481-483 */
const TILE_DUNGEON_SHEETS = new Set([41, 43, 44, 481, 482, 483]);

// ── Utils.Remap（Utilities.cs 标准 remap，含输入钳制） ───────────────────────

function remap(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = Math.min(1, Math.max(0, (v - inMin) / (inMax - inMin)));
  return outMin + (outMax - outMin) * t;
}

// ── settings 组装（WorldGen.cs:675-684 1:1 映射） ───────────────────────────

function deriveSettings(w: World): ExtraSpawnSettings {
  const sf = w.seedFlags ?? {};
  // GenVars.worldSpawnHasBeenRandomized（ResetGenerator :8270 归零；RandomizeWorldSpawn
  // :24114 首句置真，randomSpawn(:1898)/noSurface(:1048)/vampireSeed(:22659) 三臂共享
  // 互斥门）。★IIIII41-T3①：本仓生成期两宿主均已接——randomSpawn 臂（SecretSeedDoEnds
  // Pass.finalizeSecretSeedDoEnds 内 cs 原位）与 vampireSeed 臂（finalize 后同核），故
  // settings.surface = (!randomized && isThereAWorldSurface) 按旗标位等价照抄；errorWorld/
  // worldIsFrozen 不改出生点。
  const spawnRandomized = !!sf.vampireSeed || !!sf.randomSpawn;
  return {
    // surface = (!randomized && Main.isThereAWorldSurface)；isThereAWorldSurface =
    // worldSurface>50.0（Main.cs:2884）——world.groundLevel 即运行时 Main.worldSurface 快照
    surface: !spawnRandomized && w.groundLevel > 50,
    // remix 带 R2：本仓未移植 remix 层参数，恒 false（偏差 R2）
    remix: false,
    roundLandmass: !!sf.roundLandmasses,
    skyblock: !!sf.skyblock,
    extraLiquid: !!sf.extraLiquid,
  };
}

// ── GenerateExtraSpawns_Setup 候选集（cs:40-82；landmassData 未建模 ⇒ 结构性空集，R3） ──

function collectCandidates(_settings: ExtraSpawnSettings): never[] {
  // vanilla 按 settings 从 GenVars.landmassData 取三类候选（SkyblockIsland Style13 /
  // RoundLandmass / ExtraLiquidBubbleSquare，均剔除距世界出生 <300 格者）。
  // 本仓无 landmassData ⇒ 恒空数组（vanilla 候选空态=candidates 清空后逐支 break），
  // 后续 while 选岛循环 list.Count<=0 即穿出、所有队伍落到 fallback 百分位列。
  return [];
}

// ── IterateDownToFloor（cs:391-415 1:1） ────────────────────────────────────

function iterateDownToFloor(
  st: TileStore, x: number, yIn: number, maxY: number, extraLiquid: boolean,
): number {
  let y = yIn;
  if (y > st.h - 5) y = st.h - 5;
  else if (y < 5) y = 5;
  if (maxY <= y) return y;
  for (let i = y; i < maxY && i < st.h; i++) {
    if (!st.inBounds(x, i)) continue;
    const idx = st.idx(x, i);
    const tid = st.type[idx];
    // ★RD-F7（同域顺带）：首门=tile.active()（ExtraSpawnPointManager.cs:405）——幽灵
    //  残型（flags=0,type≠0）非地板。致动位跳过为既有口径（登记：原版 active() 含
    //  已致动格,此处致动格不承地板=非幽灵域偏差,另批处理,本批不动）
    if (!st.hasTile(x, i) || (st.wire[idx] & TileStore.WIRE_ACTUATED) !== 0) continue;
    // vanilla: active && (extraLiquid||liquid<=0) && tileSolid[type] && !remix 195/474 排除
    if ((extraLiquid || st.liquid[idx] <= 0) && TileStore.SOLID_LUT[tid] === 1) return i;
  }
  return y;
}

// ── fallback 百分位列（GetFallbackSpawn cs:319-375 + WorldPercentile cs:377-389） ──

function worldPercentileAvoidWorldSpawnIfNeeded(settings: ExtraSpawnSettings, pct: number): number {
  if (settings.surface || settings.remix) {
    const pad = 0.1;
    if (pct < 0.5) return remap(pct, 0, 0.5, 0, 0.5 - pad);
    return remap(pct, 0.5, 1, 0.5 + pad, 1);
  }
  return pct;
}

function fallbackSpawn(
  st: TileStore, w: World, settings: ExtraSpawnSettings, iteration: number,
): ExtraSpawnPoint {
  const underworldLayer = st.h - 200;                  // Main.UnderworldLayer(maxTilesY-200)
  // vanilla skyblock 按 iteration 回查 ExtraData==iteration 的队序岛（cs:321-330）——R3 无
  const pct = worldPercentileAvoidWorldSpawnIfNeeded(settings, iteration / PLAYER_TEAM_COUNT);
  const px = Math.trunc(st.w * pct);
  let py: number;
  let margin = 50;
  let maxY = Math.trunc(w.groundLevel);
  if (!settings.surface) {
    margin = Math.trunc(st.h * 0.5);
    maxY = underworldLayer - 50;
  }
  if (settings.roundLandmass) {
    if (settings.surface) { margin = 50; maxY = Math.trunc(w.groundLevel); }
    else { margin = Math.trunc(w.groundLevel) + 100; maxY = underworldLayer - 50; }
  }
  // settings.remix 中带均值臂（cs:355-359）随 R2 不可达
  py = margin;
  // 从起始行向上走到首个「非地牢非神庙」可站行（cs:361-372）
  while (py > 50) {
    const idx = st.idx(px, py);
    const tid = st.type[idx];
    const ok = tid === 0 || !(TILE_DUNGEON_SHEETS.has(sheetOf(tid)) || sheetOf(tid) === 226);
    if (ok) break;
    py--;
  }
  py = iterateDownToFloor(st, px, py, maxY, settings.extraLiquid);
  return { x: px, y: py };
}

// ── Spawn_IsAreaValidSpawn（Player.cs:38263-38281 精简核；generatingSpawn 双地牢墙门
//    在 vanilla 无 true 调用方 ⇒ 不涉。压板 135 与 CanTileHurt 近似保留） ────────

/** Collision.CanTileHurt 家族保守近似（TouchDamage 常见表；Editor 口径 hurtTiles 工具
 *  为权威盒查路径，此处为扫位快筛用途，宽表偏安全侧备案） */
const HURT_TILE_SHEETS = new Set([32, 48, 53, 59, 80, 130, 135, 137, 149, 160, 184, 232, 344, 351, 476, 512, 554, 562, 584]);

export function isAreaValidSpawnLite(st: TileStore, floorX: number, floorY: number): boolean {
  for (let i = floorX - 1; i < floorX + 2; i++) {
    for (let j = floorY - 3; j < floorY; j++) {
      if (!st.inBounds(i, j)) continue;
      const idx = st.idx(i, j);
      const tid = st.type[idx];
      if (j === floorY - 1) {
        // 底邻格伤害判定（Collision.CanTileHurt :38266）+ 135 门。
        // ★RD-F7：门=tile2.active()（Player.cs:38252）——曾以 get()≠0（type 裸读）
        //  代 active 位,幽灵残型底邻误拒
        const below = st.get(i, j + 1);
        const bs = sheetOf(below);
        if (st.hasTile(i, j + 1) && (bs === 135 || HURT_TILE_SHEETS.has(bs))) return false;
      }
      // ★RD-F7：主门=tile.nactive()（Player.cs:38247）——幽灵残型（flags=0,type≠0）
      //  与已致动格同跳 135/实心面（SolidCollision 语义=isActive 系）;曾以 tid≠0+
      //  致动位拆判,幽灵格 135/实心面直通误拒
      if (st.isActive(i, j)) {
        if (sheetOf(tid) === 135) return false;
        // SolidCollision 主门（tileSolid && !tileSolidTop ≈ SOLID_LUT 且非平台）
        if (TileStore.SOLID_LUT[tid] === 1 && !TILE_DEFS[tid]?.platform) return false;
      }
      if (st.liquid[idx] > 0) return false;
    }
  }
  return true;
}

// ── CheckForGoodTeleportationSpot 精简核（Utils.cs:518-601） ────────────────

const SPAWN_ANCHOR_MARGIN = 45;         // cs:549 num7 clamp 边距

/** CheckNoInvalidTiles(cs:484-516)：±50 盒内命中 tilesToAvoid 表任一即拒 */
function checkNoInvalidTilesNear(st: TileStore, cx: number, cy: number, avoidSheets: Set<number>): boolean {
  for (let dx = -50; dx <= 50; dx++) {
    for (let dy = -50; dy <= 50; dy++) {
      const x = cx + dx, y = cy + dy;
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      const tid = st.type[idx];
      if (tid === 0) continue;
      if (avoidSheets.has(sheetOf(tid))) return false;
    }
  }
  return true;
}

// tilesToAvoid 表组装（GetTilesToAvoidForSpawn_TeamBasedSpawns WorldGen.cs:8199-8267 减支 1:1）
const REMIX_SKYBLOCK_SUB = [23, 661, 25, 163, 112, 398, 400, 474, 199, 662, 203, 200, 234, 399, 401, 195, 57, 633];   // cs:8230-8234
const ERROR_WORLD_SUB = [57, 70, 161, 53, 397, 396, 163, 200, 135, 379, 37];                                          // cs:8236-8240

function buildAvoidTable(sf: Partial<Record<string, boolean>>): Set<number> {
  const raw = [
    70, 23, 199, 661, 662, 41, 43, 44, 226, 57,
    633, 397, 396, 25, 163, 112, 398, 400, 203, 200,
    234, 399, 401, 117, 164, 116, 402, 403, 379, 135,
    37, 189, 196, 460, 717, 718, 719,
  ];
  const infected = !!sf.infectedSeed;                  // worldIsInfected.Enabled 同位
  const set = new Set<number>();
  for (const s of raw) {
    if (!!sf.noTraps && s === 135) continue;                                    // cs:8208
    if (!!sf.extraLiquid && s === 379) continue;                                // cs:8211
    if (!!sf.skyblock && [189, 196, 460, 717, 718, 719].includes(s)) continue;  // cs:8215
    if (!!sf.skyblock && !!sf.remix && REMIX_SKYBLOCK_SUB.includes(s)) continue;// cs:8218
    if (!!sf.remix && s === 70) continue;                                       // cs:8237 世界侧? 非也——Main.remixWorld 直判(cs:8239)，此处以旗位等价
    if (!!sf.errorWorld && ERROR_WORLD_SUB.includes(s)) continue;               // cs:8241
    if (!!sf.worldIsFrozen) {
      if ([161, 147, 162].includes(s)) continue;                                // cs:8243-8244
      if (infected && (s === 163 || s === 200)) continue;                       // cs:8245-8246 冻结块内嵌 worldIsInfected 支
    }
    if (!!sf.notTheBees) {                                                      // Main.notTheBeesWorld(cs:8250)
      if (s === 60) continue;                                                   // cs:8251-8252
      if (infected && (s === 661 || s === 662)) continue;                       // cs:8253-8254 内嵌组合支
    }
    if (infected && [23, 199, 25, 203].includes(s)) continue;                   // cs:8256-8257 独立支
    set.add(s);
  }
  return set;
}

/** specializedConditions（cs:230-292）：落脚地板及其左右邻的定制拒绝集合。
 *  @param sep 候选间隔格数（250；roundLandmass×小世界收窄 150 由调用方预计算） */
function specializedFloorOk(
  st: TileStore, x: number, y: number, settings: ExtraSpawnSettings,
  acceptedPoints: readonly ExtraSpawnPoint[], sep: number,
): boolean {
  // ★RD-F7：左右邻门=leftTile.active()/rightTile.active()（ExtraSpawnPointManager.cs
  //  :236/:240 `if (leftTile.active() && (…bad 类型表…))` 带门式）——曾以 get()≠0
  //  （type 裸读）代 active 位,幽灵残型邻格误拒;中格 tile.type 仍裸读（原版无门）
  const leftActive = st.hasTile(x - 1, y), rightActive = st.hasTile(x + 1, y);
  const lt = sheetOf(st.get(x - 1, y)), rt = sheetOf(st.get(x + 1, y)), tt = sheetOf(st.get(x, y));
  const badFloor = (t: number): boolean =>
    t === 135 || t === 48 || t === 232 || t === 750 || BOULDER_SHEETS.has(t);
  if (badFloor(tt) || (leftActive && badFloor(lt)) || (rightActive && badFloor(rt))) return false;
  if (TILE_DUNGEON_SHEETS.has(tt) || tt === 226) return false;
  // 半砖/斜坡×左右岩浆臂（cs:248-251）：精简核不承载 frameX/frameY 坡度位（R1）⇒ 恒不拒；
  // 左右岩浆邻其余入口由下方避液盒兜底
  if (settings.extraLiquid && tt === 379) return false;
  if (settings.skyblock && tt !== 0) return false;
  for (let i = 0; i < acceptedPoints.length; i++) {
    if (Math.abs(acceptedPoints[i].x - x) < sep && Math.abs(acceptedPoints[i].y - y) < sep) return false;
  }
  return true;
}


// ── TryFindSpawnAt（cs:203-317 精简核） ────────────────────────────────────

interface SpawnProbe { x: number; y: number }

/** range = 外层循环定的 maxY（worldSurface 或 UnderworldLayer-50 带） */
function tryFindSpawnAt(
  st: TileStore, w: World, settings: ExtraSpawnSettings, rng: UnifiedRandom,
  acceptedPoints: readonly ExtraSpawnPoint[], probe: SpawnProbe, maxYBand: number,
): boolean {
  // IterateDownToFloor 先行收口（cs:205）——探测盒围绕下沉后的起点构建（cs:223-226）
  const baseY = iterateDownToFloor(st, probe.x, probe.y, maxYBand, settings.extraLiquid);
  const num = settings.skyblock ? 15 : settings.extraLiquid ? 30 : 50;   // cs:213-221
  const startCx = Math.max(0, probe.x - num);
  const startCy = Math.max(0, baseY - num);
  const avoidSheets = buildAvoidTable(w.seedFlags as Partial<Record<string, boolean>>);

  for (let a = 0; a < 250; a++) {                       // attemptsBeforeGivingUp=250(cs:305)
    // Box(start,(num+1,num+1)) 内均匀取点（strictRange 含端，cs:541-547）
    const ax = startCx + rng.nextIntRange(0, num + 1);
    const ay = startCy + rng.nextIntRange(0, num + 1);
    // clamp45（cs:549-551）
    const px = Math.min(st.w - 1 - SPAWN_ANCHOR_MARGIN, Math.max(SPAWN_ANCHOR_MARGIN, ax));
    const py = Math.min(st.h - 1 - SPAWN_ANCHOR_MARGIN, Math.max(SPAWN_ANCHOR_MARGIN, ay));
    // SolidCollision 20×42 盒（锚格上方带，半格水平偏置并入 R1 备案）
    if (boxClearFail(st, px, py)) continue;
    if (!checkNoInvalidTilesNear(st, px, py, avoidSheets)) continue;
    // 坠落扫描 ≤100（maximumFallDistanceFromOrignalPoint=100, cs:303; strictRange per-step :559-562）
    let fall = -1;
    for (let d = 0; d < 100; d++) {
      if (py + d > startCy + num) break;                // 出 strictRange 探测盒即弃（cs:560-562）
      if (isLandedFloor(st, px, py + d)) { fall = d; break; }
      if (py + d + 1 >= st.h) break;
    }
    if (fall < 0 || fall >= 99) continue;               // cs:597 num8>=max-1 拒
    const fcy = py + fall;
    const fcx = px;                                     // floorCenter≈锚列（R1 精简核口径）
    if (!specializedFloorOk(st, fcx, fcy, settings, acceptedPoints, sepFor(settings, st))) continue;
    // avoidAnyLiquid 地板格（cs:584）/mostlySolidFloor ±1 至少一侧实心非台面（cs:587-600）
    if (st.liquid[st.idx(fcx, fcy)] > 0) continue;
    const sideOk = (sx: number): boolean => {
      if (!st.inBounds(sx, fcy)) return false;
      const t2 = st.type[st.idx(sx, fcy)];
      return t2 !== 0 && TileStore.SOLID_LUT[t2] === 1 && !TILE_DEFS[t2]?.platform;
    };
    if (!sideOk(fcx - 1) && !sideOk(fcx + 1)) continue;
    if (hurtLiquidWallBad(st, px, py, settings)) continue;
    probe.x = px;
    probe.y = fcy;                                      // spawnY=(int)(vector.Y+H)/16 落脚面口径
    return true;
  }
  return false;
}

function sepFor(settings: ExtraSpawnSettings, st: TileStore): number {
  // cs:264-279：remix 小世界/roundLandmass 小世界 150，否则 250（remix 臂随 R2 不可达；
  // GetWorldSize()==0 即小世界档——World.size 语义由宽度派生，此处按 store 宽同构判断）
  const smallWorld = st.w < 6400;
  return (settings.roundLandmass && smallWorld) ? 150 : 250;
}

function boxClearFail(st: TileStore, px: number, py: number): boolean {
  for (let dx = -1; dx <= 0; dx++) {
    for (let dy = -3; dy <= 0; dy++) {
      const x = px + dx, yy = py + dy;
      if (x < 0 || yy < 0 || x >= st.w || yy >= st.h) continue;
      const idx = st.idx(x, yy);
      const tid = st.type[idx];
      // ★RD-F7：主门=Collision.SolidCollision（Utils.cs:548 调用;Collision.cs:2725
      //  `!inActive() && active() && tileSolid && !tileSolidTop`）——isActive 系语义,
      //  幽灵残型=空（曾以 tid≠0+致动位拆判,幽灵格直通挡盒）
      if (!st.isActive(x, yy)) continue;
      if (dy === 0) return true;                        // 底行即足底挡盒（含实心/台面）
      if (TILE_DEFS[tid]?.solid) return true;           // 盒身实心阻挡
    }
  }
  return false;
}
function isLandedFloor(st: TileStore, px: number, fy: number): boolean {
  if (!st.inBounds(px, fy)) return false;
  const idx = st.idx(px, fy);
  // ★RD-F7：落地锚=tile2.active() && !tile2.inActive() && tileSolid（Utils.cs:560）
  //  ——isActive 系语义,幽灵残型不承落地锚（曾以 tid≠0+致动位拆判,幽灵格误承）
  if (!st.isActive(px, fy)) return false;
  return TileStore.SOLID_LUT[st.type[idx]] === 1;
}
function hurtLiquidWallBad(st: TileStore, px: number, py: number, settings: ExtraSpawnSettings): boolean {
  for (let dx = -1; dx <= 0; dx++) {
    for (let dy = -3; dy <= 0; dy++) {
      const x = px + dx, yy = py + dy;
      if (!st.inBounds(x, yy)) continue;
      const idx = st.idx(x, yy);
      if (st.liquid[idx] > 0) {                         // avoidAnyLiquid 盒
        if (st.liquidType[idx] === 2) return true;      // avoidLava 子句
        if (!settings.extraLiquid) return true;         // extraliquid 带跨水盒豁免(R3 近似)
      }
      if (st.wall[st.idx(x, yy)] === 87) return true;   // cs:552 wall==87&&!downedPlantBoss 门
    }
  }
  return false;
}

// ── TryFindSpawnRandomly（cs:115-201） ─────────────────────────────────────

function tryFindSpawnRandomly(
  st: TileStore, w: World, settings: ExtraSpawnSettings, rng: UnifiedRandom,
  acceptedPoints: ExtraSpawnPoint[], origins: Array<'found' | 'fallback'>,
  fallbackPt: ExtraSpawnPoint,
): void {
  const OUTER_ATTEMPTS = 500;                           // cs:117 num=500
  let leftFirst = true;                                 // flag 初值 true = 先左(cs:120/:127)
  const hellBottom = st.h - 200 - 50;                   // UnderworldLayer-50（cs:130/:340）
  for (let i = 0; i < OUTER_ATTEMPTS; i++) {
    // 左右半图交替（cs:127）：左 Next(60, maxTilesX/2) / 右 Next(maxTilesX/2, maxTilesX-60)
    const nx = leftFirst
      ? rng.nextIntRange(60, Math.floor(st.w / 2))
      : rng.nextIntRange(Math.floor(st.w / 2), st.w - 60);
    let ny = 60;                                        // cs:118 num2=60
    let maxY = Math.max(70, Math.trunc(w.groundLevel)); // cs:126 num5=max(num2+10,worldSurface)
    if (!settings.surface) {                            // cs:128-131
      maxY = hellBottom;
      ny = rng.nextIntRange(Math.trunc(w.groundLevel) + 200, maxY);
    }
    // settings.skyblock / roundLandmass / extraLiquid 选岛 while 循环：R3 候选恒空 ⇒
    // 与 vanilla `list.Count<=0 → break` 同态，坐标维持默认值继续走 TryFindSpawnAt
    leftFirst = !leftFirst;                             // cs:188 每外层翻转
    const probe: SpawnProbe = { x: nx, y: ny };
    if (tryFindSpawnAt(st, w, settings, rng, acceptedPoints, probe, maxY)) {
      acceptedPoints.push({ x: probe.x, y: probe.y });
      origins.push('found');
      return;                                           // 命中摘候选岛（cs:192-195，R3 无操作）
    }
  }
  acceptedPoints.push(fallbackPt);                      // cs:199
  origins.push('fallback');
}

// ── 对外：生成/查询/落位 ──────────────────────────────────────────────────

/** 确定性种子盐（R1）：跨客户端按世界种子同源派生 */
function extraSpawnSeed(worldSeed: number): number {
  let acc = worldSeed | 0;
  const salt = 'SW.IIIIII22b.ExtraSpawnPoints';
  for (let i = 0; i < salt.length; i++) {
    acc = Math.imul(acc ^ salt.charCodeAt(i), 2654435761) | 0;
  }
  return acc;
}

/**
 * GenerateExtraSpawns（cs:91-113）整体：points[0]=世界出生点；队 1-5 候选搜索+洗牌分配。
 * 结果写 world.extraSpawnPoints（瞬态运行时位，不入档不入包）；幂等（已缓存直接返回）。
 * 来源标记随 w.extraSpawnMeta 落盘到运行时缓存——'found' 对满足构造性分离保证；
 * 'fallback' 为预算耗尽后的 fallback 点（vanilla 同样不保证其间隔，见头部 R1 注）。
 */
export function ensureExtraSpawnPoints(w: World): ExtraSpawnPoint[] {
  if (w.extraSpawnPoints) return w.extraSpawnPoints;
  // ★旗门：非 teamBasedSpawns 世界零开销早退（表保持 undefined ⇒ tryGet 恒 null）
  if (!w.seedFlags?.teamBasedSpawns) return [];
  const settings = deriveSettings(w);
  collectCandidates(settings);
  const rng = new UnifiedRandom(extraSpawnSeed(w.seed));
  const pts: ExtraSpawnPoint[] = new Array(PLAYER_TEAM_COUNT);
  pts[0] = { x: w.spawnX, y: w.spawnY };
  const meta: Array<'found' | 'fallback'> = ['found'];
  const list: ExtraSpawnPoint[] = [];
  const origins: Array<'found' | 'fallback'> = [];
  for (let i = 1; i < PLAYER_TEAM_COUNT; i++) {
    tryFindSpawnRandomly(w.store, w, settings, rng, list, origins,
      fallbackSpawn(w.store, w, settings, i));
  }
  for (let j = 1; j < PLAYER_TEAM_COUNT; j++) {
    const pick = rng.nextIntRange(0, list.length);
    pts[j] = list.splice(pick, 1)[0]!;
    meta.push(origins.splice(pick, 1)[0]!);
  }
  w.extraSpawnPoints = pts;
  w.extraSpawnMeta = meta;
  return pts;
}

/** TryGetExtraSpawnPointForTeam（cs:18-38）：缺表/越界回 null（等价 Point.Zero 分支） */
export function tryGetExtraSpawnPointForTeam(w: World, team: number): ExtraSpawnPoint | null {
  const pts = w.extraSpawnPoints;
  if (!pts) return null;
  if (team < 0 || team >= pts.length) return null;
  return pts[team] ?? null;
}

/**
 * Player.Spawn :37911-37916 三分支的纯函数形态（Game.spawnPlacementCoords 队点臂消费,SW-BC1 批更名）：
 * 床点优先 → 队伍 ≥1 时取队点扫位。旗关/床位/队号三道门任一命中即 null。
 * @param bedActive 本仓床点语义：world.spawn≠原始出生点即视为"有床"（per-world 共享位）
 */
export function teamSpawnPlacement(
  w: World, pTeam: number, bedActive: boolean,
): { tx: number; ty: number } | null {
  if (!w.seedFlags?.teamBasedSpawns) return null;
  if (bedActive) return null;                       // 床点优先(:37911)
  if (!(pTeam >= 1)) return null;                   // 队 0 ≡ extraSpawnPoints[0]=世界出生点(cs:101)
  ensureExtraSpawnPoints(w);
  return resolveTeamSpawnFloor(w, pTeam);           // :38278-38290
}

/**
 * Player.Spawn"队伍点"臂完整落位（Spawn_SetPositionAtTeamSpawn :38278-38290）：
 * 取点 → Spawn_GetPositionAtSpawn 扫位（:38008-38046 上 30 行 X±1 三列 → 下 30 行同式，
 * 各命中位必过 Spawn_IsAreaValidSpawn）→ DescendFromDefaultSpace 落板由 iterateDown 语义
 * 并入扫位校验。落点合法由接受条件自证 ⇒ ForceClearArea 分支按构造不可达（R5）。
 * @returns 落脚格坐标（原版 Spawn_SetPosition floor*16 定位锚）；null=旗关/无表/越界队
 */
export function resolveTeamSpawnFloor(w: World, team: number): { tx: number; ty: number } | null {
  const pt = tryGetExtraSpawnPointForTeam(w, team);
  if (!pt) return null;
  const st = w.store;
  for (let i = 0; i < 30; i++) {
    for (const dx of [0, -1, 1]) {
      const x = pt.x + dx, y = pt.y - i;
      if (st.inBounds(x, y) && isAreaValidSpawnLite(st, x, y)) return { tx: x, ty: y };
    }
  }
  for (let i = 0; i < 30; i++) {
    for (const dx of [0, -1, 1]) {
      const x = pt.x + dx, y = pt.y + i;
      if (st.inBounds(x, y) && isAreaValidSpawnLite(st, x, y)) return { tx: x, ty: y };
    }
  }
  return { tx: pt.x, ty: pt.y };
}
