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
//      /SlopeCollision 省略（同 WorldGen.ts vampireSeedFinishPass 判例，误差 <1 格）。
//      ★SW-BP1 2026-09-07：坡度臂已接——cs:248-251 halfBrick()/topSlope()×左右岩浆邻
//      在 specializedFloorOk 1:1（TileStore slope/half/liquidType 位全承载,原"不承载
//      ⇒恒不拒"备案失效）。
//   R2 remix 带（GenVars.remixSurfaceLayerLow/MushroomLayerHigh，cs:133-137/:262-276）
//      ★SW-BP1 2026-09-07 复核：维持 settings.remix=false 证据结案——本仓 GenState 已
//      建 remix 四带（TerrainPass.ts:202-205 = TerrainPass.cs:240-243 逐值同源），
//      remixMushroomLayerHigh=maxTilesY-200 运行时可由 h 派生，但 remixSurfaceLayerLow
//      =floor(rockLayerLow) 仅 GenState 持有（World/存档不持久,genRemixWater 先例=gen
//      期专用）；接通需①持久化 remixSurfaceLayerLow（存档面/World 字段）②消费位五处
//      一次接线（TryFindSpawnRandomly cs:136-139 带 / GetFallbackSpawn cs:355-359 均值
//      臂 / specializedConditions cs:267-277 带外拒+小世界 sep150 / TryFindSpawnAt
//      cs:208-213 remix+skyblock 直受（含一次 genRand 抽位）/ IterateDownToFloor
//      cs:403-405 195/474 排除）。掷流面在重放 RNG 内不触 worldgen 金标，动刀归
//      存档/世界字段车道。
//   R3 skyblock/roundLandmass/extraliquid 三支候选集依赖 GenVars.landmassData（cs:44-80）
//      ★SW-BP1 2026-09-07 复核：维持证据结案——gs.skyblockIslands（SkyblockPass.ts:665,
//      cs:23806-23816）已登记但仅 gen 期 GenState 持有（World/存档不持久）;运行期重放
//      取不到候选表 ⇒ 接通=候选集在「新生成世界 vs 读档世界」失同（重放确定性破缺）,
//      须先持久化（新存档面）;RoundLandmass（cs:2891/2939 推入）与 ExtraLiquidBubbleSquare
//      （SurfaceDecorPasses.ts:1180 备案跳过）本仓零登记。候选恒空走 fallback 百分位列
//      =vanilla 候选空时的既定行为（cs:168-186 while list.Count<=0 穿出）。GEN 侧
//      skyblock 按队 Style13 岛生成（cs:22789-22804）随双地牢/组合批另立车道。
//   R4 PrepareExtraSpawns 尾扫（:417-428 地下点周边 DoAdditionalChangesAroundSpawnIfNeeded）
//      ★SW-BP1 2026-09-07 复核：维持证据结案——vanilla 调用位=生成期尾（WorldGen.cs
//      :22683,FinalCleanup 内 FinalizeSecretSeeds 之后），本体=PlaceTorchesAroundSpawn
//      （:25258-25310,genRand 密集续掷：2000 轮×每轮 2-6 掷）+noTraps 分支
//      RemoveSpecificTilesUnderSpawn。接通须在 gen 流原位续掷（掷流位置敏感,动即
//      worldgen 金标零处置纪律）;以运行期盐重放替掷=与 R1 同范式（可行,但落点表本身
//      已非 vanilla 逐位对拍面,且会把火把写入读档世界=存档面变化）——归 worldgen
//      车道带金标处置,不在本批。
//   R5 Spawn_ForceClearArea 分支：★SW-BM1 2026-09-06 起随 resolveTeamSpawnFloor
//      升级走 SpawnPlacement 全链而可达（moved∧非法 → forceClear 回调注入,Game 侧
//      接 breakTile/setLiquid;纯查询调用方不注入=只扫不清,免 KillTile 掉落面误伤）。
import { UnifiedRandom } from '../../core/rng';
import { TileStore } from '../TileStore';
import type { World } from '../World';
import { TILE_DEFS, BOULDERS_SHEETS } from '../../data/tiles';
import { spawnGetPositionAtSpawn, spawnIsAreaValidSpawn } from './SpawnPlacement';

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
// ★BJ182b 收编单源 data/tiles.ts:BOULDERS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const BOULDER_SHEETS = BOULDERS_SHEETS;
/** tileDungeon ∪ 变体（∪ 变体单列,★BJ187 备案）：主三砖 {41,43,44}+裂纹砖 481-483
 *  （Main.cs:8131-8136 tileDungeon 全表含古砖 677-679 但【不含】481-483——本集语义=
 *  落点避让「地牢砖族+裂纹砖」字面 ∪ 脸,与 SceneMetrics.cs:619 DungeonTileCount 同构,
 *  勿并轨到 data/tiles.ts:TILE_DUNGEON_SHEETS） */
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

// ── Spawn_IsAreaValidSpawn：★SW-BM1 2026-09-06 起不再自持精简核——队点臂统一
//    消费 SpawnPlacement.ts 全链（spawnIsAreaValidSpawn,Player.cs:38222-38259）,
//    isAreaValidSpawnLite（:38263-38281 精简核 + HURT_TILE_SHEETS 宽表近似）随
//    resolveTeamSpawnFloor 升级退役（两套净空判据并存 = SW-BC1 债①） ────────────

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
  // ★SW-BP1 2026-09-07（R1 坡度臂清偿）：半砖/斜坡×左右岩浆邻臂（cs:248-251）
  // 1:1 接入——`(tile.halfBrick() || tile.topSlope()) && ((leftTile.liquid > 0 &&
  //  leftTile.lava()) || (rightTile.liquid > 0 && rightTile.lava())) → 拒`。原版
  //  两邻只读 liquid 量+lava() 型（无 active() 门）;本仓 slope/half/liquidType 位
  //  TileStore 全承载（此前 R1 备案"精简核不承载坡度位⇒恒不拒"已失效）。岩浆编码：
  //  原版 Tile.lava()=liquidType==1（0水/1岩浆/2蜜）≠ 本仓 TileStore 约定
  //  1=水/2=岩浆/3=蜜/4=微光 → 本仓 lava ⇔ liquidType===2。
  if (st.inBounds(x, y)) {
    const mi = st.idx(x, y);
    if (st.half[mi] === 1 || st.slope[mi] === 1 || st.slope[mi] === 2) {
      const li = st.inBounds(x - 1, y) ? st.idx(x - 1, y) : -1;
      const ri = st.inBounds(x + 1, y) ? st.idx(x + 1, y) : -1;
      const lavaAt = (q: number): boolean => q >= 0 && st.liquid[q] > 0 && st.liquidType[q] === 2;
      if (lavaAt(li) || lavaAt(ri)) return false;
    }
  }
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
 * @param forceClear 落点仍非法时的 3×3 兜底通道（Spawn_ForceClearArea :38199-38220,
 *   Game 侧注入 breakTile/setLiquid——纯查询调用方缺省不注入=只扫不清）
 */
export function teamSpawnPlacement(
  w: World, pTeam: number, bedActive: boolean,
  forceClear?: (floorX: number, floorY: number) => void,
): { tx: number; ty: number } | null {
  if (!w.seedFlags?.teamBasedSpawns) return null;
  if (bedActive) return null;                       // 床点优先(:37911)
  if (!(pTeam >= 1)) return null;                   // 队 0 ≡ extraSpawnPoints[0]=世界出生点(cs:101)
  ensureExtraSpawnPoints(w);
  return resolveTeamSpawnFloor(w, pTeam, forceClear);           // :38278-38290
}

/**
 * Player.Spawn"队伍点"臂完整落位（Spawn_SetPositionAtTeamSpawn :38278-38290）。
 * ★SW-BM1 2026-09-06（SW-BC1 债①清偿）：扫位升级走 SpawnPlacement.ts 全链——
 * Spawn_GetPositionAtSpawn（:38008-38089 上 30 行 X±1 三列 → 下 30 行同式,
 * InWorld(5) 边界档 + 命中位 DescendFromDefaultSpace 落板 :38103-38179）+
 * moved∧终点仍非法 → Spawn_ForceClearArea（:38199-38220,经 forceClear 注入;
 * 原精简核 30 行直扫 + isAreaValidSpawnLite 宽表近似退役,行为差异逐项：
 *  ① lite 首个净空行直接落位 vs 全链 Descend 落板（命中行下方 50 行内找
 *    ValidSpawnFloor 地板,singleBlockAllowed 重试）；
 *  ② lite 用 st.inBounds vs 全链 WorldGen.InWorld(5)（边距 5 格外按 continue 处理）；
 *  ③ lite 底邻伤害=HURT_TILE_SHEETS 宽表 vs 全链 Collision.CanTileHurt（TouchDamage）；
 *  ④ lite 无 ForceClear 兜底 vs 全链 moved∧非法 → 破块排水（回调注入）。
 * @returns 落脚格坐标（原版 Spawn_SetPosition floor*16 定位锚）；null=旗关/无表/越界队
 */
export function resolveTeamSpawnFloor(
  w: World, team: number,
  forceClear?: (floorX: number, floorY: number) => void,
): { tx: number; ty: number } | null {
  const pt = tryGetExtraSpawnPointForTeam(w, team);
  if (!pt) return null;
  const pos = spawnGetPositionAtSpawn(w.store, pt.x, pt.y);
  if (pos.moved && !spawnIsAreaValidSpawn(w.store, pos.floorX, pos.floorY)) {
    forceClear?.(pos.floorX, pos.floorY);           // :38288-38290（SetPosition 后判非法）
  }
  return { tx: pos.floorX, ty: pos.floorY };
}
