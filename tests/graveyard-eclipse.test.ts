// 墓园（Graveyard）系统 + 日食怪战士族 8 条行为分支回归。
// 反编译源 = 仓库外 Terarria1457/ 树（★树基准 1457;墓园/日食链数值 1456/1457 同值）。
//
// 墓园：
//  - 判定口径（tile 计数，非生成 pass）   SceneMetrics.cs:622-635（GraveyardTileCount =
//    tile85 − 向日葵/2，钳 ≥0）+ :686 阈值 28 + HasSunflower 压制门 :626-631
//  - 生成 pass（秘密种子专属）            WorldGen.cs:18110-18120 门 +
//    SpawnGraveyardBiomesEverywhere :25074-25096 + SpawnGraveyardBiome :25098-25165
//  - 墓志铭唯一消费端                     WorldGen.cs:25161（Sign.TextSign ← Epitaph 分节）
//  - 玩家墓碑碑文（非墓志铭）             Projectile.cs:23715（miscText = 死亡文本+日期）
//
// 日食怪（AI_003_Fighters 内 type 段）：
//  1. Psycho 466 潜伏突袭        NPC.cs:56290-56326
//  2. Psycho 466 逆向余速刹车    NPC.cs:58102-58105 / :58118-58121
//  3. Nailhead 463 受击散射      NPC.cs:57547-57613（proj 498 ×3-5）
//  4. Eyezor 251 死光            NPC.cs:59335-59378（proj 83）
//  5. Butcher 460 空中免击退     NPC.cs:57615-57624
//  6. Possessed 469 爬墙冲刺     NPC.cs:57626-57677
//  7. Fritz 462 跳扑             NPC.cs:57678-57710
//  8. Dr Man Fly 468 射击族入表  NPC.cs:59464/:59662-59665/:59815-59818/:59861-59864/
//    :60072-60075（速 7.5 / 伤 50 / 弹 501 / 射程 400）
//  附：:57468 flag8=false 表（不攻门 :60383）；日食豁免白天驱散 :60694
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { scanScene } from '../src/world/SceneMetrics';
import { randomEpitaph } from '../src/i18n/RandomText';
import { languageManager } from '../src/i18n/LanguageManager';
import { parseSeed } from '../src/world/gen/SeedEasterEggs';
import { graveyardSeedGate, spawnGraveyardBiome, spawnGraveyardBiomesEverywhere } from '../src/world/gen/WorldGen';
import { newGenState } from '../src/world/gen/vanilla/GenState';
import { RNG } from '../src/core/rng';
import { Enemy } from '../src/entities/Enemy';
import {
  psychoStealthStep, nailheadHitScatter, butcherKbStep, possessedStep, fritzPounceStep,
  FIGHTER_NO_DOOR,
} from '../src/entities/fighterFamilies';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';
import { BuffType } from '../src/stats/Buffs';

beforeAll(() => {
  // 真实 zh-Hans 包注入（node 无 fetch，同 eclipse-lunar.test 模式）——墓志铭断言用
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 测试桩
// ---------------------------------------------------------------------------
type DartLike = { x: number; y: number; vx: number; vy: number; damage: number; projId: number; w: number; h: number };

/** 开阔世界：y=FLOOR_ROW 一整行地板；玩家立于 (px,py) tile 中心 */
function flatWorld(px = 45, py = 57, w = 80, h = 80, floorRow = 60) {
  const world = new World(w, h, 42, 'open');
  const st = world.store;
  for (let x = 10; x <= w - 10; x++) st.setTileSilent(x, floorRow, 2); // 草地板
  const shots: DartLike[] = [];
  const player = {
    x: px * 16, y: py * 16, w: 20, h: 42,
    cx: px * 16, cy: py * 16 + 21,
    dead: false, useTime: 0,
    buffs: { has: () => false },
  } as never;
  const hooks = {
    world,
    player,
    enemies: () => [],
    critters: () => [],
    playSfx: () => {},
    playSfxFiles: () => {},
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    entities: { add: (e: unknown) => { shots.push(e as DartLike); } },
  } as never;
  return { world, st, shots, player: player as unknown as Player, hooks };
}

/** 跑 N tick（敌怪落地稳定用） */
function run(e: Enemy, hooks: GameHooks, ticks: number): void {
  for (let t = 0; t < ticks; t++) e.fixedUpdate(1 / 60, hooks);
}

// ===========================================================================
// 墓园：判定口径（SceneMetrics.cs:622-635/:686）
// ===========================================================================
describe('墓园判定（SceneMetrics.cs:622-635 + 阈值 :686）', () => {
  const TOMB = TILE_BY_KEY['tombstone_v']!;
  /** 向日葵内部 tile id（TILE_DEFS 下标即内部 id） */
  const SUNFLOWER = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 27);

  /** 在玩家窗口内铺 n 座 2×2 墓碑（每座 4 格——计数口径是【每格】tile85，:622） */
  function placeTombs(st: World['store'], n: number): void {
    for (let i = 0; i < n; i++) {
      const x = 30 + (i % 20) * 2, y = 55 - Math.floor(i / 20) * 3;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) st.setTileSilent(x + dx, y + dy, TOMB, dx * 18, dy * 18);
      }
    }
  }

  it('计数口径：7 座墓碑 = 28 格 → zoneGraveyard；6 座 = 24 格 → 否（阈值 28，:686）', () => {
    const a = new World(200, 200, 7, 'a');
    placeTombs(a.store, 7);                 // 7×4 = 28 格，恰达阈值（>= 28）
    const sa = scanScene(a, 100 * 16, 100 * 16, 0);
    expect(sa.graveyardTileCount).toBe(28);
    expect(sa.zoneGraveyard).toBe(true);
    const b = new World(200, 200, 8, 'b');
    placeTombs(b.store, 6);                 // 24 格 < 28
    const sb = scanScene(b, 100 * 16, 100 * 16, 0);
    expect(sb.graveyardTileCount).toBe(24);
    expect(sb.zoneGraveyard).toBe(false);
  });

  it('向日葵压制：GraveyardTileCount = tile85 − 向日葵/2（下取整，:623）', () => {
    const w = new World(200, 200, 9, 'c');
    placeTombs(w.store, 8);                 // 32 格
    for (let i = 0; i < 10; i++) w.store.setTileSilent(20 + i * 2, 40, SUNFLOWER, 0, 0);
    const s = scanScene(w, 100 * 16, 100 * 16, 0);
    // 32 − floor(10/2)=5 → 27（<28 → 非墓园）；HasSunflower 门（计数>16 → false，:628-631）
    expect(s.graveyardTileCount).toBe(27);
    expect(s.zoneGraveyard).toBe(false);
    expect(s.hasSunflower).toBe(false);
  });

  it('向日葵少量时快乐 buff 不被压制（计数 ≤ GraveyardTileMin 16，:626-631）', () => {
    const w = new World(200, 200, 10, 'd');
    placeTombs(w.store, 4);                 // 16 格，恰达压制下界
    w.store.setTileSilent(20, 40, SUNFLOWER, 0, 0);
    const s = scanScene(w, 100 * 16, 100 * 16, 0);
    expect(s.graveyardTileCount).toBe(16);
    expect(s.hasSunflower).toBe(true);
  });

  it('墓志铭生成链：randomEpitaph 命中 zh-Hans Epitaph 分节（WorldGen.cs:25161 唯一消费端）', () => {
    const packRaw = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')) as Record<string, Record<string, string>>;
    const pool = Object.values(packRaw['Epitaph']);
    for (let i = 0; i < 12; i++) expect(pool).toContain(randomEpitaph());
    expect(pool.length).toBeGreaterThanOrEqual(40);   // 47 条（1.4.5.6）
  });
});

// ===========================================================================
// 墓园：生成 pass（秘密种子专属）
// ===========================================================================
describe('墓园生成 pass（WorldGen.cs:18110-18120 / :25074-25165）', () => {
  it('触发门：普通种子 / getfixedboi / skyblock 全否；Constant+drunk 组合与哈希种子是', () => {
    expect(graveyardSeedGate(parseSeed('12345').flags)).toBe(false);
    expect(graveyardSeedGate(parseSeed('theconstant').flags)).toBe(false);
    // 1.4.5.6 getfixedboi 全依赖含 Anniversary（WorldSeedOption_Everything.cs:29）→ 被
    // !tenthAnniversary 否决；本表 getfixedboi 不置 theConstant/tenthAnniversary，同结论
    expect(graveyardSeedGate(parseSeed('getfixedboi').flags)).toBe(false);
    expect(graveyardSeedGate({ ...parseSeed('theconstant').flags, drunkWorld: true })).toBe(true);
    expect(graveyardSeedGate({ ...parseSeed('theconstant').flags, getGoodWorld: true })).toBe(true);
    // 十周年否决（cs:18117 第三合取项）
    expect(graveyardSeedGate({ ...parseSeed('theconstant').flags, drunkWorld: true, tenthAnniversary: true })).toBe(false);
    // 哈希注册秘密种子（WorldGen.cs:356，无文本映射——预留位）
    expect(graveyardSeedGate({ graveyardBloodmoonStart: true })).toBe(true);
    // skyblock pass 整体跳过（cs:18110 !Skyblock.denySomeGeneration）
    expect(graveyardSeedGate({ graveyardBloodmoonStart: true, skyblock: true })).toBe(false);
  });

  it('SpawnGraveyardBiome：平地锚点落 2×2 墓碑并写墓志铭碑文（:25156-25162）', () => {
    // 世界高度须给足 UnderworldLayer-100（h-300）余量——锚点下坠归位门 :25115 用该界
    const w = new World(300, 1200, 11, 'gy');
    const st = w.store;
    for (let x = 120; x <= 180; x++) st.setTileSilent(x, 400, 2);   // 锚点下方地板
    spawnGraveyardBiome(st, new RNG(1234), w, 150, 390);
    const TOMB = TILE_BY_KEY['tombstone_v']!;
    let tombs = 0, firstX = -1, firstY = -1;
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        if (st.type[st.idx(x, y)] === TOMB) { tombs++; if (firstX < 0) { firstX = x; firstY = y; } }
      }
    }
    expect(tombs).toBeGreaterThan(0);
    expect(tombs % 4).toBe(0);                      // 2×2 整块
    // 墓碑须落在实心支撑上（:25148-25151 下方双列 tileSolid 门）
    expect(st.isSolid(firstX, firstY + 2)).toBe(true);
    // 每座墓碑一条 Epitaph 碑文（:25161 Sign.TextSign）——非空且命中分节池
    expect(w.signs.length).toBe(tombs / 4);
    const packRaw = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')) as Record<string, Record<string, string>>;
    const pool = Object.values(packRaw['Epitaph']);
    for (const s of w.signs) {
      expect(s.text.length).toBeGreaterThan(0);
      expect(pool).toContain(s.text);
    }
    expect(w.signs.some((s) => s.x === firstX && s.y === firstY)).toBe(true);
  });

  it('SpawnGraveyardBiome：排斥族 tile（沙 53/蜥蜴砖 226 等 :25124）→ 整处放弃零墓碑', () => {
    const w = new World(300, 1200, 12, 'no');
    const st = w.store;
    for (let x = 120; x <= 180; x++) st.setTileSilent(x, 400, 2);
    const SAND = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 53);
    st.setTileSilent(150, 395, SAND, 0, 0);          // 81×81 扫描窗内命中排斥族
    spawnGraveyardBiome(st, new RNG(1234), w, 150, 390);
    const TOMB = TILE_BY_KEY['tombstone_v']!;
    let tombs = 0;
    for (let i = 0; i < st.type.length; i++) if (st.type[i] === TOMB) tombs++;
    expect(tombs).toBe(0);
    expect(w.signs.length).toBe(0);
  });

  it('SpawnGraveyardBiomesEverywhere：全空气世界各锚点下坠归位门 return（:25115-25118），不越界', () => {
    const w = new World(4200, 1200, 13, 'every');
    const gs = newGenState(4200, 1200);
    gs.worldSurface = 400;
    gs.beachDistance = 380;
    spawnGraveyardBiomesEverywhere(w.store, new RNG(99), w, gs);   // w=4200 → num=1：地表 10 + 地下 30 锚
    // 全空气世界：锚点向下走到 UnderworldLayer-100 仍无实心 → return（零墓碑零碑文）
    expect(w.signs.length).toBe(0);
    let tombs = 0;
    for (let i = 0; i < w.store.type.length; i++) if (w.store.type[i] === TILE_BY_KEY['tombstone_v']) tombs++;
    expect(tombs).toBe(0);
  });
});

// ===========================================================================
// 日食怪 8 条行为分支
// ===========================================================================
describe('日食怪战士族行为分支（NPC.cs AI_003_Fighters）', () => {
  // ---- 1+2. Psycho 466 潜伏突袭（:56290-56326）+ 逆向刹车（:58102-58121）----
  it('Psycho 466：潜伏 alpha=200（:56295）；玩家 <170px → ai2=-16（:56299）', () => {
    const { world, hooks } = flatWorld(45, 57);
    world.clock.eclipse = true;
    const e = Enemy.fromVanilla(466, 40 * 16, 57 * 16)!;
    run(e, hooks, 1);                       // 首帧潜伏分支（该帧不动倒数）
    expect(e.spawnAlpha).toBe(200);         // :56295 潜伏全隐
    expect(e.ai2).toBe(-16);                // :56297-56300 距离门触发
  });

  it('Psycho 466：玩家超 170px 保持潜伏 ai2=0（:56297 门）', () => {
    const { hooks } = flatWorld(80, 57);    // 水平 ~40 tile 远超 170px
    const e = Enemy.fromVanilla(466, 40 * 16, 57 * 16)!;
    run(e, hooks, 3);
    expect(e.spawnAlpha).toBe(200);
    expect(e.ai2).toBe(0);
  });

  it('Psycho 466：显形倒数 16t（alpha −12.5/t :56309-56316）→ ai2=1 且 vx=direction×2（:56318-56322）', () => {
    const { world, hooks } = flatWorld(45, 57);
    world.clock.eclipse = true;
    const e = Enemy.fromVanilla(466, 40 * 16, 57 * 16)!;
    run(e, hooks, 10);                      // 1 帧潜伏 + 9 帧倒数
    expect(e.ai2).toBe(-7);                 // -16 + 9
    expect(e.spawnAlpha).toBeCloseTo(200 - 9 * 12.5, 5);   // :56311
    run(e, hooks, 7);                       // 走完倒数（共 16 帧 +1）
    expect(e.ai2).toBe(1);                  // :56320
    expect(e.spawnAlpha).toBe(0);           // 200 − 16×12.5 = 0
    expect(e.vx).toBeCloseTo(2, 5);         // :56321 direction=+1（玩家在右）
  });

  it('Psycho 466：direction=+1 而 vx<-2 → 加速前先 ×0.9 刹车（:58102-58105）', () => {
    const { hooks } = flatWorld(45, 57);
    const e = Enemy.fromVanilla(466, 40 * 16, 57 * 16)!;
    e.ai2 = 1;                              // 已显形（走通用移动段）
    e.facing = 1;
    e.vx = -3;
    e.fixedUpdate(1 / 60, hooks);           // fighterMoveStep 内 ×0.9 后 +0.07（:58110）
    expect(e.vx).toBeCloseTo(-3 * 0.9 + 0.07, 5);
  });

  // ---- 3. Nailhead 463 受击散射（:57547-57613）----
  it('Nailhead 463：受击 1/3 触发 → 散射 3-5 枚 Nail（proj 498，伤 = damage×0.15）+ 30t 冷却', () => {
    const { hooks, shots, player } = flatWorld(45, 57);
    const e = Enemy.fromVanilla(463, 40 * 16, 57 * 16)!;
    e.lai3 = 0;
    e.justHitT = 2;                         // hurt() 置位（NPC.justHit）
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);   // 1/3 必中；Next(3,6)=3 发
    nailheadHitScatter(e, hooks, player);
    spy.mockRestore();
    expect(shots.length).toBe(3);                                    // :57556 Next(3,6) 下界
    expect(e.lai3).toBe(30);                                         // :57555 冷却
    for (const s of shots) {
      expect(s.projId).toBe(498);                                    // :57611 Nail
      expect(s.damage).toBe(Math.trunc(e.def.damage * 0.15));        // :57611 (int)(damage*0.15)
      expect(Math.hypot(s.vx, s.vy)).toBeGreaterThanOrEqual(8);      // :57595 Next(8,13)
      expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(12);
    }
    // 冷却期内再受击不散射（:57549-57553）
    const before = shots.length;
    e.justHitT = 2;
    nailheadHitScatter(e, hooks, player);
    expect(shots.length).toBe(before);
  });

  // ---- 5. Butcher 460 空中免击退（:57615-57624）----
  it('Butcher 460：|vy|>重力步 → 击退免疫；落地 → 0.25 难度曲线', () => {
    const e = Enemy.fromVanilla(460, 40 * 16, 57 * 16)!;
    e.vy = 1;                               // > GRAVITY(0.4)：正被击飞
    butcherKbStep(e);
    expect(e.kbResistOverride).toBe(0);     // :57619
    e.vy = 0;
    butcherKbStep(e);
    expect(e.kbResistOverride).toBeCloseTo(0.25, 6);   // :57623（经典难度曲线 1×0.25）
  });

  // ---- 6. Possessed 469 爬墙冲刺（:57626-57677）----
  it('Possessed 469：身边有背景墙 + 下坠 → 爬墙态 ai2=1 → 朝玩家冲刺', () => {
    const { world, st, hooks, player } = flatWorld(45, 57);
    world.clock.eclipse = true;
    const e = Enemy.fromVanilla(469, 40 * 16, 57 * 16)!;
    run(e, hooks, 5);                       // 下坠中（vy>0，:57659 门）
    // 中心 3×3 任一格墙>0（:57634-57650 flag11）——按实际中心格落墙
    st.wall[st.idx(Math.floor(e.cx / 16), Math.floor(e.cy / 16))] = 1;
    const x0 = e.x, y0 = e.y;
    expect(possessedStep(e, hooks, player)).toBe(true);   // 冲刺分支 return true（:57673）
    expect(e.ai2).toBe(1);                  // :57661 下坠转爬墙态（同 tick 即冲刺）
    // ★kb 求值在段首（:57628-57632）取的是本 tick 起点的 ai[2]——转移帧仍 0.45（原版同）；
    // 次帧起以 ai2=1 进入 → 免疫
    expect(e.kbResistOverride).toBeCloseTo(0.45, 5);
    expect(Math.abs(e.x - x0) + Math.abs(e.y - y0)).toBeGreaterThan(0);   // 29/30 平滑首步已积分
    expect(possessedStep(e, hooks, player)).toBe(true);
    expect(e.kbResistOverride).toBe(0);     // :57631 爬墙态击退免疫
  });

  it('Possessed 469：无背景墙 → ai2 归零回通用段 + 0.45 难度曲线（:57628/:57675-57676）', () => {
    const { hooks } = flatWorld(45, 57);
    const e = Enemy.fromVanilla(469, 40 * 16, 57 * 16)!;
    e.ai2 = 1;
    expect(possessedStep(e, hooks, null)).toBe(false);
    expect(e.ai2).toBe(0);
    expect(e.kbResistOverride).toBe(0);     // 段首 ai2==1 → 免疫（:57631，原版求值时点）
    expect(possessedStep(e, hooks, null)).toBe(false);
    expect(e.kbResistOverride).toBeCloseTo(0.45, 6);   // :57628 经典难度曲线 ×1
  });

  // ---- 7. Fritz 462 跳扑（:57678-57710）----
  it('Fritz 462：落地 + <150px + |vx|>3 + 朝玩家 → vx×1.75 / vy−4.5（钳 7）', () => {
    const { player } = flatWorld(45, 57);
    const e = Enemy.fromVanilla(462, 42 * 16, 57 * 16)!;   // 水平距 ~48px <150
    e.vx = 3.2;
    e.vy = 0;
    fritzPounceStep(e, player);
    expect(e.vx).toBeCloseTo(3.2 * 1.75, 5);   // :57681
    expect(e.vy).toBeCloseTo(-4.5, 5);         // :57682（同高无追加档）
    // |vx| 超 7 钳 7（:57699-57709）——须先回落地态（vy!==0 门）
    e.vx = 5;
    e.vy = 0;
    fritzPounceStep(e, player);
    expect(e.vx).toBe(7);
  });

  it('Fritz 462：目标在上方 ~100px → 四档追加 −0.5/−1/−1.5/−1.5 共 −4.5（:57683-57698）', () => {
    const { player } = flatWorld(45, 49);      // 玩家中心 805：自身中心 912 低 107px（>100）
    const e = Enemy.fromVanilla(462, 42 * 16, 57 * 16)!;
    e.vx = 3.2;
    e.vy = 0;
    fritzPounceStep(e, player);
    expect(e.vy).toBeCloseTo(-4.5 - 0.5 - 1 - 1.5 - 1.5, 4);
  });

  it('Fritz 462：距 ≥150px 或 |vx|≤3 不扑（:57678 门）', () => {
    const { player } = flatWorld(70, 57);      // 水平距 ~28 tile >150px
    const e = Enemy.fromVanilla(462, 42 * 16, 57 * 16)!;
    e.vx = 3.2; e.vy = 0;
    fritzPounceStep(e, player);
    expect(e.vx).toBe(3.2);
    expect(e.vy).toBe(0);
    e.vx = 2.5;                                // |vx|≤3
    fritzPounceStep(e, player);
    expect(e.vx).toBe(2.5);
  });

  // ---- 4. Eyezor 251 死光（:59335-59378）----
  it('Eyezor 251：计时达标 + 落地 + 朝向玩家 + 视线 + <700px → EyeLaser 83（速 15 伤 30）', () => {
    const { world, hooks, shots } = flatWorld(45, 57);
    world.clock.eclipse = true;
    const e = Enemy.fromVanilla(251, 40 * 16, 57 * 16)!;
    run(e, hooks, 20);                      // 落地（中心锚出生，需 ~16t 落到地板）+ facing 朝玩家
    shots.length = 0;
    e.ai2 = 2000;                           // 超过任意阈值 rand(60..1799)×1+15
    run(e, hooks, 1);
    expect(shots.length).toBe(1);
    expect(shots[0].projId).toBe(83);                         // :59373
    expect(shots[0].damage).toBe(30);                         // :59369 num148
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeCloseTo(15, 1);  // :59355 num143
    expect(e.ai2).toBe(0);                                   // :59374 发射后清零
    // 枪口 (Center.X + 6×direction, position.Y + 12) + 出生前移 vel×3（:59356-59357/:59371）
    expect(shots[0].x).toBeGreaterThan(e.cx);
  });

  it('Eyezor 251：玩家冰冻（vanilla buff 47）不发射（:59353 !frozen 门）', () => {
    const { world, hooks, shots, player } = flatWorld(45, 57);
    world.clock.eclipse = true;
    (player as unknown as { buffs: { has: (b: number) => boolean } }).buffs
      = { has: (b) => b === BuffType.Frozen };
    const e = Enemy.fromVanilla(251, 40 * 16, 57 * 16)!;
    run(e, hooks, 20);
    shots.length = 0;
    e.ai2 = 2000;
    run(e, hooks, 1);
    expect(shots.length).toBe(0);
  });

  // ---- 8. Dr Man Fly 468 射击族（:59464/:59662-59665 等）----
  it('Dr Man Fly 468：入射击族表，弹 501 / 速 7.5 / 伤 50 / 射程 400', () => {
    const { world, hooks, shots, player } = flatWorld(45, 57);
    world.clock.eclipse = true;
    player.useTime = 1;                     // cs:60037 idle 门：目标待机不开瞄
    const e = Enemy.fromVanilla(468, 40 * 16, 57 * 16)!;
    run(e, hooks, 5);
    shots.length = 0;
    // 开瞄 → 蓄力 70t，半程 35t 发射（:59493 num163=70 / :59580 num165=35）
    run(e, hooks, 120);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    expect(shots[0].projId).toBe(501);                        // :59863 num172
    expect(shots[0].damage).toBe(50);                         // :59815-59818 num171
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeCloseTo(7.5, 1);  // :59662-59665 num166
  });

  it('Dr Man Fly 468：超射程 400 不开瞄（:60072-60075 num181=400）', () => {
    const { world, hooks, shots, player } = flatWorld(110, 57, 140, 80, 60);   // 水平 ~70 tile 远超 400px
    world.clock.eclipse = true;
    player.useTime = 1;
    const e = Enemy.fromVanilla(468, 40 * 16, 57 * 16)!;
    run(e, hooks, 120);
    expect(shots.length).toBe(0);
  });

  // ---- 附 1：:57468 flag8=false 表（不攻门 :60383）----
  it('flag8 表（:57468）：251/466/468/469 与 166/480/471 在表内不攻门；460/462/463 不在会攻门', () => {
    for (const id of [251, 466, 468, 469]) expect(FIGHTER_NO_DOOR.has(id)).toBe(true);
    // 沼泽怪 166 / 美杜莎 480 / 哥布林术士 471 / 眼球怪 470 / 血兔 464 / 混沌元素 120 / 地精 624
    for (const id of [166, 480, 471, 470, 464, 120, 624]) expect(FIGHTER_NO_DOOR.has(id)).toBe(true);
    // Butcher 460 / Fritz 462 / Nailhead 463 原版不在 :57468 表 → 会攻门
    expect(FIGHTER_NO_DOOR.has(460)).toBe(false);
    expect(FIGHTER_NO_DOOR.has(462)).toBe(false);
    expect(FIGHTER_NO_DOOR.has(463)).toBe(false);
    expect(FIGHTER_NO_DOOR.has(3)).toBe(false);     // 僵尸攻门
  });

  // ---- 附 2：日食豁免白天驱散（:60694 首条件 !Main.eclipse）----
  it('日食期间战士族不被白天驱散（:60694）；日食外白天地表驱散（CheckActive 屏外可见旗标）', () => {
    // 屏内每 tick 重置鼓励旗（Enemy.ts CheckActive 屏内重置语义）→ 玩家须离怪 >62 格
    const a = flatWorld(10, 57, 160, 80, 60);
    a.world.clock.eclipse = true;
    a.world.groundLevel = 70;               // 让敌怪处于"地表"带（cy < groundLevel×16）
    const ez = Enemy.fromVanilla(166, 90 * 16, 57 * 16)!;  // 沼泽怪（日食兜底怪，走 fighterAI）
    run(ez, a.hooks, 3);
    expect(ez.despawnEncouraged).toBe(false);
    const b = flatWorld(10, 57, 160, 80, 60);
    b.world.clock.eclipse = false;
    b.world.groundLevel = 70;
    const z2 = Enemy.fromVanilla(166, 90 * 16, 57 * 16)!;
    run(z2, b.hooks, 3);
    expect(z2.despawnEncouraged).toBe(true);
  });
});
