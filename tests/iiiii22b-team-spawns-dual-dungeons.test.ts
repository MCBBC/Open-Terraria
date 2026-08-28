// ★IIIII22b（2026-08-28）：royale-with-cheese 队伍出生点系统 + 双地牢 NPC 出没区域扫描
// —— 审计矩阵 §2 行 #45（P0 全域）/#46（NPC 域 ✗）清偿回归。
// 合成世界两个"玩家"按原版分布规则断言 + 单机/旗关对照零漂移；无浏览器依赖。
import { describe, expect, it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import {
  ensureExtraSpawnPoints, tryGetExtraSpawnPointForTeam, teamSpawnPlacement,
  isAreaValidSpawnLite, PLAYER_TEAM_COUNT,
} from '../src/world/spawn/ExtraSpawnsRoyale';
import { scanChosenTileZones, canScanDualDungeonCell } from '../src/world/DungeonDualZones';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { scanScene } from '../src/world/SceneMetrics';

const __m = (k: string): void => { require('node:fs').appendFileSync('/tmp/marks.log', k + ' ' + Math.round(performance.now()) + '\n'); };


const W = 1200;
const SURFACE_Y = 520;      // world.groundLevel（≈Main.worldSurface 快照）
const ROCK_Y = 760;         // world.rockLevel

/** 合成世界：全域地表实心带 + 指定列的专题格块 */
function mkWorld(opts: { royale?: boolean; dd?: boolean; seed?: number; h?: number } = {}) {
  const H = opts.h ?? 900;
  const st = new TileStore(W, H);
  const w = new World(W, H, opts.seed ?? 77123, 't');
  w.store = st;
  w.groundLevel = SURFACE_Y;
  w.rockLevel = opts.h ? 520 : ROCK_Y;      // H=1300 场景把 rock 层上移使地下带存在
  w.spawnX = Math.floor(W / 2);
  w.spawnY = 560;                            // 地表板脚下
  w.spawnX0 = w.spawnX; w.spawnY0 = w.spawnY;
  const flags: Record<string, boolean> = {};
  if (opts.royale) flags.teamBasedSpawns = true;
  if (opts.dd) flags.dualDungeons = true;
  w.seedFlags = flags as typeof w.seedFlags;
  const dirt = TILE_BY_KEY['dirt'];
  expect(dirt).toBeGreaterThan(0);
  // 大气圈（0..549 空气）+ 全深实心地体（550 以下全实心）——镜像真实世界的
  // 「地表下方处处可落脚」分布，使探测循环按 vanilla 预期概率快速命中
  // （真空世界会让 500×250 暴力预算跑满——vanilla 同构但 C# 原生可承受）
  for (let x = 0; x < W; x++) {
    for (let y = 550; y < H - 5; y++) st.setTileSilent(x, y, dirt);
  }
  return { world: w, st };
}

function internalOfSheet(sheet: number): number {
  const t = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  return t >= 0 ? t : -1;
}

function col(st: TileStore, x: number, y0: number, y1: number, internalId: number, wallSheet?: number) {
  for (let y = y0; y <= y1; y++) {
    if (wallSheet !== undefined) st.wall[st.idx(x, y)] = wallSheet;
    else st.setTileSilent(x, y, internalId);
  }
}

describe('IIIII22b A: royale-with-cheese 队伍出生点（ExtraSpawnPointManager cs:91-113 移植）', () => {
  // 共享夹具：分布规则断言全部基于同一份确定性点表（重算幂等性由 A1 另行验证）
  const fx: { world?: World; st?: TileStore } = {};
  it('A1 点表确定性收敛——同种子双实例逐元素相等（跨客户端重放范式 R1）', () => {
    __m('A1 点-start');
    console.error('[T] A1 start');
    console.error('[A1] world-a-begin');
    const a = mkWorld({ royale: true, seed: 424242 });
    console.error('[A1] world-a-done');
    const b = mkWorld({ royale: true, seed: 424242 });
    console.error('[A1] world-b-done');
    const pa = ensureExtraSpawnPoints(a.world);
    console.error('[A1] ensure-a-done', pa[1]);
    const pb = ensureExtraSpawnPoints(b.world);
    console.error('[A1] ensure-b-done');
    expect(pa.length).toBe(PLAYER_TEAM_COUNT);           // PlayerTeamID.Count=6（PlayerTeamID.cs:17）
    expect(pb).toEqual(pa);
    expect(ensureExtraSpawnPoints(a.world)).toBe(pa);     // 幂等：重复 ensure 不重掷
    console.error('[T] A1 end');
    // 复用同 seed 世界作为后续断言夹具（已缓存表零成本）
    fx.world = a.world; fx.st = a.st;
  });

  it('A2 队 0 恒=世界出生点（cs:101）；队点互不挤进 250 双轴间隔盒（cs:281-290）', () => {
    __m('A2 队-start');
    const world = fx.world!;
    const pts = ensureExtraSpawnPoints(world);
    expect(pts[0]).toEqual({ x: world.spawnX, y: world.spawnY });
    for (let i = 1; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        // vanilla specializedConditions 拒的是「|dx|<sep && |dy|<sep」同置 ⇒ 断言无此对
        const separated = !(Math.abs(pts[i]!.x - pts[j]!.x) < 250
          && Math.abs(pts[i]!.y - pts[j]!.y) < 250);
        expect(separated, `team ${i} vs ${j} inside 250 box`).toBe(true);
      }
      expect(pts[i]!.x).toBeGreaterThanOrEqual(60);       // 60 边距（cs:118/:155）
      expect(pts[i]!.x).toBeLessThanOrEqual(W - 60);
    }
  });

  it('A3 落位扫位通过 Spawn_IsAreaValidSpawn 精简核且不嵌格', () => {
    __m('A3 落-start');
    const world = fx.world!;
    for (let team = 1; team < PLAYER_TEAM_COUNT; team++) {
      const fl = teamSpawnPlacement(world, team, false);
      expect(fl, `team ${team}`).not.toBeNull();
      // 接受条件内建于扫位核（Player.cs:38263-38281）——此处直接复验一致性
      expect(isAreaValidSpawnLite(world.store, fl!.tx, fl!.ty)).toBe(true);
    }
  });

  it('A4 双人合成场景：队 0 走世界出生点；队伍玩家取得各自互异队点', () => {
    __m('A4 双-start');
    const world = fx.world!;
    // 玩家甲未入队（team=0）⇒ 三分支走世界出生点（Place 与队点无关）
    expect(teamSpawnPlacement(world, 0, false)).toBeNull();
    // 玩家乙绿队（team=2）⇒ 取得队点，至少与甲不完全重合（甲恒在中央）
    const flB = teamSpawnPlacement(world, 2, false)!;
    expect(flB.tx !== world.spawnX || flB.ty !== world.spawnY).toBe(true);
    // 全体队伍玩家点位互异（洗牌分配保证队列互异，cs:107-112）
    const seen = new Set<string>();
    for (let team = 1; team < PLAYER_TEAM_COUNT; team++) {
      const p = tryGetExtraSpawnPointForTeam(world, team)!;
      const k = `${p.x},${p.y}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  });

  it('A5 单机对照零漂移：旗关零开销早退 + 床位优先门', () => {
    __m('A5 单-start');
    const { world } = mkWorld({});                        // 无 teamBasedSpawns
    expect(world.extraSpawnPoints).toBeUndefined();
    expect(ensureExtraSpawnPoints(world)).toEqual([]);
    expect(tryGetExtraSpawnPointForTeam(world, 1)).toBeNull();
    expect(teamSpawnPlacement(world, 3, false)).toBeNull();
    // 床位激活口径：world.spawn≠spawnX0 ⇒ 门直接回 null（Player.Spawn :37911 床优先）
    const rw = mkWorld({ royale: true }).world;
    rw.spawnX = rw.spawnX0 + 5;
    expect(teamSpawnPlacement(rw, 2, false)).toBeNull();
  });
});

// setFlagsForChosenTile 为 private —— any-cast 直调并注入可数 stub rng（确定性断言）
type SpawnerProbe = {
  surfaceSpawn: boolean; underGround: boolean; deeperThanRockLayer: boolean;
  ZoneDungeon: boolean; ZoneSnow: boolean; ZoneCorrupt: boolean; ZoneHallow: boolean;
  ZoneJungle: boolean; ZoneGlowshroom: boolean; ddLihzhardLatch: boolean | null;
};
function callSetFlags(sp: VanillaSpawner, x: number, y: number, type: number, stubInt: number): number {
  let intCalls = 0;
  const rngStub = {
    next: () => 0,
    int: (_a: number, _b: number) => { intCalls++; return stubInt; },
  } as never;
  (sp as unknown as {
    setFlagsForChosenTile: (a: number, b: number, c: number, r: never) => void;
  }).setFlagsForChosenTile(x, y, type, rngStub);
  return intCalls;
}
function probe(sp: VanillaSpawner): SpawnerProbe {
  return sp as unknown as SpawnerProbe;
}

describe('IIIII22b B: 双地牢 NPCSpawningFlags 区域扫描（NPC.cs:428-441 / SceneMetrics.cs:714-738）', () => {
    __m('B1 S-start');
  it('B1 ScanZonesFor 单臂对拍（sheet id 表 1:1）', () => {
    const { world, st } = mkWorld({ dd: true });
    const blueBrick = TILE_BY_KEY['v_41_blue_brick'];
    const snowBlk = TILE_BY_KEY['snow'];
    const ebonstone = TILE_BY_KEY['v_25_ebonstone_block'];
    const purpleIce = TILE_BY_KEY['v_163_purple_ice_block'];
    const templeBrick = TILE_BY_KEY['v_226_lihzahrd_brick'];
    const mud = TILE_BY_KEY['mud'];
    const sandstone = TILE_BY_KEY['sandstone'];
    for (const v of [blueBrick, snowBlk, ebonstone, purpleIce, templeBrick, mud, sandstone]) {
      expect(v).toBeGreaterThan(0);
    }
    col(st, 100, 820, 850, blueBrick);                    // 地牢主砖 41
    col(st, 200, 820, 850, snowBlk);                      // 雪块 147
    col(st, 300, 820, 850, ebonstone);                    // 黑檀石 25
    col(st, 400, 820, 850, purpleIce);                    // 紫冰 163：雪+腐化双置
    col(st, 500, 820, 850, templeBrick);                  // 神庙砖 226
    col(st, 600, 820, 850, mud, 204);                     // 泥土 59 × DualJungleWall 204
    col(st, 700, 820, 850, sandstone, 216);               // 沙岩 53 × HardenedSand 216
    const rock = world.rockLevel;
    let s = scanChosenTileZones(st, 100, 840, rock);
    expect(s.ZoneDungeon).toBe(true);
    s = scanChosenTileZones(st, 200, 840, rock);
    expect(s.ZoneSnow).toBe(true);
    s = scanChosenTileZones(st, 300, 840, rock);
    expect(s.ZoneCorrupt).toBe(true);
    s = scanChosenTileZones(st, 400, 840, rock);
    expect(s.ZoneSnow && s.ZoneCorrupt).toBe(true);       // case 163 double-set（cs:114-117）
    s = scanChosenTileZones(st, 500, 840, rock);
    expect(s.ZoneLihzhardTemple).toBe(true);
    s = scanChosenTileZones(st, 600, 840, rock);
    expect(s.ZoneJungle).toBe(true);                      // mud × JungleWall（cs:84-91）
    s = scanChosenTileZones(st, 700, 840, rock);
    expect(s.ZoneUndergroundDesert).toBe(true);           // 53 × Conversion.HardenedSand（cs:193-210）
    // 地牢主砖 rockLayer 门（cs:140）：岩石层以上同型列不清 dungeon 位
    col(st, 110, 100, 130, blueBrick);
    s = scanChosenTileZones(st, 110, 120, rock);
    expect(s.ZoneDungeon).toBe(false);
  });

  it('B2 CanScan 受理门（SolidTile3/巨石/232 排除）', () => {
    __m('B2 C-start');
    const { st } = mkWorld({ dd: true });
    const blueBrick = TILE_BY_KEY['v_41_blue_brick'];
    expect(canScanDualDungeonCell(st, 50, 50)).toBe(false);        // 空气不可判
    st.setTileSilent(60, 60, blueBrick);
    expect(canScanDualDungeonCell(st, 60, 60)).toBe(true);         // 实心地牢砖受理
    const boulder = internalOfSheet(138);                          // TileID.Sets.Boulders[138]
    expect(boulder).toBeGreaterThan(0);
    st.setTileSilent(70, 70, boulder);
    expect(canScanDualDungeonCell(st, 70, 70)).toBe(false);        // 巨石排除（cs:33-36）
    const spike = internalOfSheet(232);                            // 木刺 232（cs:37-40）
    expect(spike).toBeGreaterThan(0);
    st.setTileSilent(80, 80, spike);
    expect(canScanDualDungeonCell(st, 80, 80)).toBe(false);
  });

  it('B3 Spawner chosen-tile 尾部支：rand(7) 三层带重掷 + Zone 九位覆盖序（gated dualDungeons）', () => {
    __m('B3 S-start');
    const { world, st } = mkWorld({ dd: true });
    const blueBrick = TILE_BY_KEY['v_41_blue_brick'];
    const dirt = TILE_BY_KEY['dirt'];
    col(st, 150, 640, 700, blueBrick);

    // band∈{3..6} 臂（stubInt=3）：地表/地下收、深岩层开；地牢列 ⇒ ZoneDungeon &= true 保持真
    const sp = new VanillaSpawner(world);
    (sp as unknown as { ZoneDungeon: boolean }).ZoneDungeon = true;
    callSetFlags(sp, 150, 700, blueBrick, 3);
    const p1 = probe(sp);
    expect(p1.surfaceSpawn).toBe(false);
    expect(p1.deeperThanRockLayer).toBe(true);
    expect(p1.underGround).toBe(false);
    expect(p1.ZoneDungeon).toBe(true);
    expect(p1.ZoneSnow).toBe(false);
    expect(p1.ddLihzhardLatch).not.toBeNull();

    // 平地列：scan 全空 ⇒ ZoneDungeon 由真被 &= 成假（覆盖序 1:1，vanilla 同态）
    const sp2 = new VanillaSpawner(world);
    (sp2 as unknown as { ZoneDungeon: boolean }).ZoneDungeon = true;
    callSetFlags(sp2, 301, 700, dirt, 3);
    expect(probe(sp2).ZoneDungeon).toBe(false);

    // band∈{0,1} 臂（stubInt=1）：地下落脚强制地表化
    const sp3 = new VanillaSpawner(world);
    callSetFlags(sp3, 150, 700, blueBrick, 1);
    const p3 = probe(sp3);
    expect(p3.surfaceSpawn).toBe(true);
    expect(p3.underGround).toBe(false);
    expect(p3.deeperThanRockLayer).toBe(false);

    // band==2 臂（stubInt=2）：只开 underGround
    const sp4 = new VanillaSpawner(world);
    callSetFlags(sp4, 150, 700, blueBrick, 2);
    const p4 = probe(sp4);
    expect(p4.surfaceSpawn).toBe(false);
    expect(p4.underGround).toBe(true);
    expect(p4.deeperThanRockLayer).toBe(false);
  });

  it('B4 非双地牢世界零扰动（旗关零掷骰 + 三层带按基线语义求值）', () => {
    __m('B4 非-start');
    console.error('[B4] mkWorld-begin');
    const { world } = mkWorld({});
    console.error('[B4] mkWorld-done');
    const sp = new VanillaSpawner(world);
    console.error('[B4] spawner-ctor-done');
    const dirt = TILE_BY_KEY['dirt'];
    const consumed = callSetFlags(sp, 310, 700, dirt, 0);
    console.error('[B4] setFlags-done consumed=', consumed);
    expect(consumed).toBe(0);                              // rand(7) 未消耗 ⇒ 普通世界骰流不变
    const p = probe(sp);
    expect(p.surfaceSpawn).toBe(700 <= SURFACE_Y);         // 基线 L1046 语义
    expect(p.deeperThanRockLayer).toBe(700 >= ROCK_Y);
    expect(p.ddLihzhardLatch).toBeNull();                  // 闩未置（zoneLihzardTemple 原路径）
  });

  it('B5 SceneMetrics 玩家 Zone 重写（SceneMetrics.cs:714-738 接线：非 dual 阈值路径不动）', () => {
    __m('B5 S-start');
    // 高世界（H=1300）让地下带 [701..1099] 存在；单列 31 格地牢砖 < DUNGEON_THRESHOLD 250
    // ⇒ 对照世界窗口计数路径不可达 zoneDungeon。
    const buildTall = (ddFlag: boolean) => {
      const H2 = 1300;
      const st = new TileStore(W, H2);
      const w = new World(W, H2, 99, 't');
      w.store = st;
      w.groundLevel = 420;
      w.rockLevel = 620;
      w.seedFlags = (ddFlag ? { dualDungeons: true } : {}) as typeof w.seedFlags;
      const bb = TILE_BY_KEY['v_41_blue_brick'];
      for (let y = 700; y <= 730; y++) st.setTileSilent(600, y, bb);   // 单列 31 格
      // ★vanilla 收尾门（SceneMetrics.cs:722）：ZoneDungeon 覆写值还要 ∧ 玩家中心格
      // 墙 ∈ Main.wallDungeon——单列砖没有地牢墙时重写为假是正确语义；此处给中心格
      // 补一面地牢墙使覆盖生效。
      st.wall[st.idx(600, 720)] = 7;
      return { w, px: 600 * 16, py: 720 * 16 };
    };
    const plain = buildTall(false);
    const dd = buildTall(true);
    const scPlain = scanScene(plain.w, plain.px, plain.py, 0, false);
    const scDD = scanScene(dd.w, dd.px, dd.py, 0, false);
    expect(scPlain.zoneDungeon).toBe(false);               // 计数路径不可达（31<250）
    expect(scDD.zoneDungeon).toBe(true);                   // 下扫命中列 → Zone 重写为真
    expect(scDD.zoneTemple).toBe(scPlain.zoneTemple);      // 空集覆盖位与阈值路径同值（路径不同）
  });
});
