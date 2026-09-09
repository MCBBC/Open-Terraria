// ★IIIII228 运行时债 A 组并批清偿——七域清偿断言（2026-09-09）。
// 域：①重生表 remix 臂 ②ScaleStats remix SetDefaults 块 ③钓鱼 remix ④msg7 seedFlags
// （协议面,线上探针覆盖）⑤商店 remix 抑制/DST 画作/晶塔（探针覆盖）⑥StatusFromNPC
// 全表 type 臂 ⑦ewAdjust 多秘计数/FillTheTop。锚行号=1458 cs。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import {
  applyRemixSetDefaults, netIdSpawnScale, bindScaleStatsWorld, scaleStatsWorldOf,
  type SeedAdjustStats,
} from '../src/stats/ScaleStats';
import { Enemy } from '../src/entities/Enemy';
import { BuffState, BuffType, BUFF_DEFS } from '../src/stats/Buffs';
import { heightLevelOf, prepareFishingContext } from '../src/data/vanillaFishing';
import { activeSecretSeedCountOf, errorWorldAdjustmentOf } from '../src/world/gen/SeedEasterEggs';
import { runNoSurfaceFillTheTop } from '../src/world/gen/vanilla/CleanupPass';
import { TILE_BY_KEY } from '../src/data/tiles';

const TILE = 16;

// ---------------------------------------------------------------- ① 重生表 remix
describe('IIIII228 ① getSpawnRate remix 臂（NPC.cs:489-778）', () => {
  function mk(remix: boolean, hard = false) {
    const w = new World(400, 600, 42, 'i228');
    w.groundLevel = 180; w.rockLevel = 252;   // 裸 World 层线为 0——按 4200×1200 比例置
    if (remix) (w.seedFlags as { remix?: boolean }).remix = true;
    w.flags.hardMode = hard;
    const sp = new VanillaSpawner(w);
    return { w, sp: sp as unknown as { getSpawnRate: Function } };
  }

  it('深岩层：remix hard?0.45/1.8:0.5/1.7；经典 0.4/1.9（:489-508）', () => {
    const y = 340 * TILE + 800;   // rock*16+s 之下、UnderworldLayer 之上
    const { sp } = mk(true, false);
    const { sp: spc } = mk(false);
    const r = (sp.getSpawnRate(y, 800, false, 800) as { spawnRate: number; maxSpawns: number });
    const c = (spc.getSpawnRate(y, 800, false, 800) as { spawnRate: number; maxSpawns: number });
    expect(r.spawnRate).toBe(300);            // 600×0.5
    expect(r.maxSpawns).toBe(8);              // ⌊5×1.7⌋
    expect(c.spawnRate).toBe(240);            // 600×0.4
    expect(c.maxSpawns).toBe(9);              // ⌊5×1.9⌋
  });

  it('地下层经典 hardMode 支修正（:510-525）+ remix 0.4/1.9', () => {
    const y = 270 * TILE + 500;   // 4820 ∈ (ws*16+s=3680, rock*16+s=4832]
    const { sp: sph } = mk(false, true);
    const hard = sph.getSpawnRate(y, 800, false, 800) as { spawnRate: number; maxSpawns: number };
    expect(hard.spawnRate).toBe(243);     // 600×0.9(hardMode 头臂)×0.45——旧实现漏=×0.5
    expect(hard.maxSpawns).toBe(10);      // 6×1.8
    const { sp: spn } = mk(false);
    const soft = spn.getSpawnRate(y, 800, false, 800) as { spawnRate: number; maxSpawns: number };
    expect(soft.spawnRate).toBe(300);     // 600×0.5
    expect(soft.maxSpawns).toBe(8);       // ⌊5×1.7⌋
    const { sp } = mk(true);
    const r = sp.getSpawnRate(y, 800, false, 800) as { spawnRate: number; maxSpawns: number };
    expect(r.spawnRate).toBe(240);        // 600×0.4
    expect(r.maxSpawns).toBe(9);          // ⌊5×1.9⌋
  });

  it('remix 血月深岩软化 0.6（:559-563）；经典无（零扰动）', () => {
    const y = 340 * TILE + 800;   // 6240 ∈ (rock*16+s=4832, Underworld 6400)
    const { sp, w } = mk(true);
    w.clock.bloodMoon = true;
    w.clock.timeOfDay = 0;        // 夜（isDay getter——以 timeOfDay 置夜）
    const r = sp.getSpawnRate(y, 800, false, 800) as { spawnRate: number; maxSpawns: number };
    // 链深岩 0.5/1.7 → 300/8；后置块血月 0.3/1.8 → 90/14；深岩带 rate 再 0.6 → 54
    // → ★clamp(:750 spawnRate<60 → 60)回夹 = 60（54 被钳回下限,原版同）
    expect(r.spawnRate).toBe(60);
    expect(r.maxSpawns).toBe(14);
    // 经典深岩带：昼夜/血月臂在 else-if 链上,深岩命中即无血月修正（零扰动）
    const { sp: spc, w: wc } = mk(false);
    wc.clock.bloodMoon = true;
    wc.clock.timeOfDay = 0;
    const c = spc.getSpawnRate(y, 800, false, 800) as { spawnRate: number; maxSpawns: number };
    expect(c.spawnRate).toBe(240);          // 经典深岩 ×0.4,无血月臂
    expect(c.maxSpawns).toBe(9);
  });

  it('remix 恶地地表双臂（:651 ×0.5/×2 与 :698 ×0.8/×2）', () => {
    const { sp } = mk(true);
    const anySp = sp as unknown as { zoneCounts: Record<string, number> };
    sp.getSpawnRate(100 * TILE, 800, false, 800);          // 先掷一次预热 500ms zone 缓存
    anySp.zoneCounts = { evil: 300, blood: 0, snow: 0, holy: 0, jungle: 0, meteor: 0, mushroom: 0, graveyard: 0 };
    const r = sp.getSpawnRate(100 * TILE, 800, false, 800) as { spawnRate: number; maxSpawns: number };
    // 全链：恶地 else-if ×0.65/×1.3 → :651 ×0.5/×2 → :698 ×0.8/×2 → clamp max 15
    expect(r.spawnRate).toBe(Math.floor(Math.floor(Math.floor(600 * 0.65) * 0.5) * 0.8));  // 156
    expect(r.maxSpawns).toBe(15);
  });

  it('月事件覆盖赋值化+remix Y 门旁路（:772）', () => {
    const { sp, w } = mk(true);
    (sp as unknown as { moonEvent: unknown }).moonEvent = { kind: 1, wave: 1, counts: new Map(), bossSlotSum: 0 };
    w.clock.timeOfDay = 0;
    // 地牢深处（经典门会拒）remix 仍 20/11
    const deep = sp.getSpawnRate(500 * TILE + 500, 800, false, 800) as { spawnRate: number; maxSpawns: number };
    expect(deep.spawnRate).toBe(20);
    expect(deep.maxSpawns).toBe(11);
    // 经典世界深处不覆盖
    const { sp: spc } = mk(false);
    (spc as unknown as { moonEvent: unknown }).moonEvent = { kind: 1, wave: 1, counts: new Map(), bossSlotSum: 0 };
    const cd = spc.getSpawnRate(500 * TILE + 500, 800, false, 800) as { spawnRate: number; maxSpawns: number };
    expect(cd.spawnRate).not.toBe(20);
  });
});

describe('IIIII228 ① chosen-tile remix（NPC.cs:1145-1291）', () => {
  function mk(remix: boolean) {
    const w = new World(400, 600, 42, 'i228b');
    w.groundLevel = 180; w.rockLevel = 252;
    if (remix) (w.seedFlags as { remix?: boolean }).remix = true;
    const sp = new VanillaSpawner(w);
    return { w, sp: sp as unknown as { setFlagsForChosenTile: Function; underGround: boolean; deeperThanRockLayer: boolean; ctxRaining: boolean; dayTime: boolean; spawnMaxValue?: number } };
  }

  it('underGround 重定义（:1145）+ 血月中带支收进 remix 门（:1240）+ 雨昼伪造', () => {
    const any = (o: unknown) => o as { setFlagsForChosenTile: Function; underGround: boolean; deeperThanRockLayer: boolean; surfaceSpawn: boolean; dayTime: boolean; ctxRaining: boolean };
    // 经典：血月中带支不再无条件地表化（漂移修正）+ underGround = Y<=rock
    const { sp: spc, w: wc } = mk(false);
    const c = any(spc);
    wc.clock.timeOfDay = 0;                                 // 夜
    c.setFlagsForChosenTile(220, 400, 2, new RNG(7));       // X∈(0.38w+50,0.62w)=（202,248)
    expect(c.underGround).toBe(false);                      // 经典 = Y<=rock（400>252）
    expect(c.deeperThanRockLayer).toBe(true);               // 经典 = Y>=rock
    expect(c.surfaceSpawn).toBe(false);                     // ★血月中带支已收进 remix 门
    // remix：underGround 重定义 / deeperThanRockLayer (ws,rock) 开区间
    const { sp, w } = mk(true);
    const r = any(sp);
    w.clock.timeOfDay = 0;
    r.setFlagsForChosenTile(220, 400, 2, new RNG(7));
    expect(r.underGround).toBe(true);                       // Y>rock && Y<=h-190
    expect(r.deeperThanRockLayer).toBe(false);              // (ws,rock) 开区间外
    expect(r.ctxRaining).toBe(false);                       // Y>h-200=400? 400≤400 不伪造——雨旗仍真?
    // ②雨/昼伪造：Y<ws+5（地表上空）→ 假夜假雨
    const { sp: sp2, w: w2 } = mk(true);
    const r2 = any(sp2);
    w2.clock.timeOfDay = 0.5;                               // 白天
    r2.setFlagsForChosenTile(220, 100, 2, new RNG(7));      // Y=100 < ws+5=185
    expect(r2.dayTime).toBe(false);                         // 伪造夜
    expect(r2.ctxRaining).toBe(false);                      // 伪造无雨
  });
});

// ---------------------------------------------------------------- ② ScaleStats remix
describe('IIIII228 ② ScaleStats remix SetDefaults 块（NPC.cs:8775-11332）', () => {
  const ctx = { remixWorld: true };

  it('6 噬魂怪 ×1.3 全乘 + scale（:8775）', () => {
    const s: SeedAdjustStats = { type: 6, scale: 1, lifeMax: 40, defense: 8, damage: 22, value: 90 };
    expect(applyRemixSetDefaults(s, ctx)).toBe(true);
    expect(s.scale).toBeCloseTo(1.3);
    expect(s.lifeMax).toBe(52);
    expect(s.damage).toBe(28);
    expect(s.defense).toBe(10);
    expect(s.value).toBe(116);   // f32(90×1.3f)=116.99999…（float 域截断,原版 (int) 同值）
  });

  it('59 岩浆史莱姆定值覆写（:9558）', () => {
    const s: SeedAdjustStats = { type: 59, scale: 1.1, lifeMax: 50, defense: 10, damage: 15, value: 120 };
    applyRemixSetDefaults(s, ctx);
    expect(s.damage).toBe(7); expect(s.defense).toBe(2);
    expect(s.lifeMax).toBe(25); expect(s.value).toBe(25);
    expect(s.scale).toBeCloseTo(1.1);   // 无 scale 乘
  });

  it('82 幽灵 ×1.2 / 181 血肉之脸 ×1.1+×1.2 二段截断（:9895/:11332）', () => {
    const s: SeedAdjustStats = { type: 82, scale: 1, lifeMax: 160, defense: 16, damage: 65, value: 500 };
    applyRemixSetDefaults(s, ctx);
    expect(s.scale).toBeCloseTo(1.2);
    expect(s.lifeMax).toBe(192);
    const t: SeedAdjustStats = { type: 181, scale: 1, lifeMax: 70, defense: 10, damage: 25, value: 200 };
    applyRemixSetDefaults(t, ctx);
    expect(t.scale).toBeCloseTo(1.1);
    expect(t.lifeMax).toBe(92);   // f32(70×1.1f)=77.0000017 → ×1.2 → 92
    expect(t.damage).toBe(33);    // f32(25×1.1f)=27.5 → ×1.2 → 33
    expect(t.defense).toBe(13);
    expect(t.value).toBe(264);
  });

  it('非 remix 零扰动 / 图鉴假人免 scale 不免统计乘', () => {
    const s0: SeedAdjustStats = { type: 6, scale: 1, lifeMax: 40, defense: 8, damage: 22 };
    expect(applyRemixSetDefaults(s0, { remixWorld: false })).toBe(false);
    expect(s0.lifeMax).toBe(40);
    const d: SeedAdjustStats = { type: 6, scale: 1, lifeMax: 40, defense: 8, damage: 22, isBestiaryIconDummy: true };
    applyRemixSetDefaults(d, ctx);
    expect(d.scale).toBe(1);          // 假人免 scale
    expect(d.lifeMax).toBe(40);       // scale=1 时统计乘恒等（原版乘在 if(!dummy) 外）
  });

  it('fromVanilla remix 盒 (int) 截断（22×1.3=28.6→28）', () => {
    const w = new World(400, 600, 42, 'i228c');
    (w.seedFlags as { remix?: boolean }).remix = true;
    bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
    const e = Enemy.fromVanilla(6, 0, 0);
    expect(e).not.toBeNull();
    expect(e!.w).toBe(39);            // trunc(f32(30×1.3f))=39——round 域会给 39 同值,
                                      //   但 seedBox 域（113/114 族）差 1px 的判据已由 (int) 链锁
    bindScaleStatsWorld(null);
  });

  it('netId -11/-12 remix ×1.3 oScale 乘区（:7787/:7804）', () => {
    const w = new World(400, 600, 42, 'i228d');
    (w.seedFlags as { remix?: boolean }).remix = true;
    bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
    const sp = new VanillaSpawner(w);
    const e = (sp as unknown as { spawnNPC: Function }).spawnNPC(8, 8, -11, new RNG(3));
    expect(e).not.toBeNull();
    // 0.85×1.3=1.105（float）——vanillaScale 相对 v.scale=1
    expect(e!.vanillaScale).toBeCloseTo(Math.fround(0.85 * 1.3), 4);
    bindScaleStatsWorld(null);
  });
});

// ---------------------------------------------------------------- ③ 钓鱼 remix
describe('IIIII228 ③ 钓鱼 remix（Projectile.cs:20808-21032）', () => {
  it('heightLevelOf remix 重映射（:20808-20833）', () => {
    const ws = 300, rock = 700, maxY = 1200;
    expect(heightLevelOf(100, ws, rock, maxY, true)).toBe(0);
    expect(heightLevelOf(200, ws, rock, maxY, true)).toBe(1);      // [.5ws, ws)
    expect(heightLevelOf(400, ws, rock, maxY, true)).toBe(3);      // [ws, rock) → 3
    expect(heightLevelOf(800, ws, rock, maxY, true, false)).toBe(2);   // [rock, max-300)
    expect(heightLevelOf(800, ws, rock, maxY, true, true)).toBe(1);    // 带 2 的 1/2 下沉
    expect(heightLevelOf(1000, ws, rock, maxY, true)).toBe(4);         // ≥ max-300
    // 经典映射不受影响（零扰动）
    expect(heightLevelOf(400, ws, rock, maxY)).toBe(2);
    expect(heightLevelOf(800, ws, rock, maxY)).toBe(3);
  });

  it('prepareFishingContext remix 腐猩清旗免仲裁掷（:20995）', () => {
    let rolls = 0;
    const rng = { next: (n?: number) => { rolls++; return 0.9; } };  // next(2)=1（不命中）
    const zones = { corrupt: true, crimson: true, jungle: false, snow: false, dungeon: false, desert: false, hallow: false };
    const a = prepareFishingContext(zones, 0, 100, 900, rng as never, false, true);
    expect(a.corruption).toBe(false); expect(a.crimson).toBe(false);
    expect(rolls).toBe(0);   // 清旗 else-if 首支 → 免腐∩猩仲裁掷（经典会掷 1 次）
    const b = prepareFishingContext(zones, 2, 100, 900, rng as never, false, false);
    expect(rolls).toBe(1);   // 经典仲裁掷消费
    expect(b.corruption === false || b.crimson === false).toBe(true);
  });

  it('rolledRemixOcean（:21020）掷骰', () => {
    const rngHit = { next: () => 0 };    // Rng.next(n)=Next(n) 整数域
    const zones = { corrupt: false, crimson: false, jungle: false, snow: false, dungeon: false, desert: false, hallow: false };
    const hit = prepareFishingContext(zones, 1, 1000, 900, rngHit as never, false, true);
    expect(hit.remixOcean).toBe(true);   // heightLevel 1（下沉带）+ Y>=rock + 1/3
    const rngMiss = { next: () => 2 };
    const miss = prepareFishingContext(zones, 1, 1000, 900, rngMiss as never, false, true);
    expect(miss.remixOcean).toBe(false);
  });
});

// ---------------------------------------------------------------- ⑥ StatusFromNPC 全表
describe('IIIII228 ⑥ StatusFromNPC 全表 type 臂（Player.cs:22513-22771）', () => {
  function mk(vid: number, expertWorld = false) {
    const e = Enemy.fromVanilla(vid, 0, 0)!;
    expect(e).not.toBeNull();
    const buffs = new BuffState();
    const player = { buffs } as unknown as PlayerLike;
    const game = { world: { difficulty: expertWorld ? 1 : 0, seedFlags: {}, flags: {} } };
    return { e, buffs, player, game };
  }
  interface PlayerLike { buffs: BuffState }

  it('184 丛林爬行者：Chilled 1200t=20s 无条件（:22766）', () => {
    const { e, buffs, player, game } = mk(184);
    (e as unknown as { statusFromNpcTypeArms: Function }).statusFromNpcTypeArms(game, player, false);
    expect(buffs.active.get(BuffType.Chilled)).toBe(20);
  });

  it('78 木乃伊 Slow 900t=15s（:22713 1/8）', () => {
    const { e, buffs, player, game } = mk(78);
    for (let k = 0; k < 400; k++) {
      (e as unknown as { statusFromNpcTypeArms: Function }).statusFromNpcTypeArms(game, player, false);
      if (buffs.active.get(BuffType.Slow) === 15) return;
    }
    expect.fail('mummy bleeding→Slow 900t 未命中（1/8×400 次全空概率≈0）');
  });

  it('141 毒泥：Poisoned 600t=10s 1/2（:22735）', () => {
    const { e, buffs, player, game } = mk(141);
    for (let k = 0; k < 100; k++) {
      (e as unknown as { statusFromNpcTypeArms: Function }).statusFromNpcTypeArms(game, player, false);
      if (buffs.active.get(BuffType.Poisoned) === 10) return;
    }
    expect.fail('141 Poisoned 1/2×100 全空概率≈0');
  });

  it('Rabies(148) 蝙蝠族臂 + BUFF_DEFS 表目（:22650 expert）', () => {
    expect(BUFF_DEFS[BuffType.Rabies]?.vanillaBuff).toBe(148);
    const w = new World(400, 600, 42, 'i228e');
    w.flags.difficulty = 1;
    const e = Enemy.fromVanilla(93, 0, 0)!;
    const buffs = new BuffState();
    const game = { world: { difficulty: 1, seedFlags: {}, flags: {} } };
    for (let k = 0; k < 600; k++) {
      (e as unknown as { statusFromNpcTypeArms: Function }).statusFromNpcTypeArms(game, { buffs }, false);
      const got = buffs.active.get(BuffType.Rabies);
      if (got !== undefined) { expect(got).toBeGreaterThanOrEqual(30); expect(got).toBeLessThanOrEqual(89); return; }
    }
    expect.fail('Rabies 未命中（1/10×600 全空概率≈0）');
  });

  it('371 潮湿臂不重施（Game 受击汇入点单点承担）', () => {
    const { e, buffs, player, game } = mk(371);
    (e as unknown as { statusFromNpcTypeArms: Function }).statusFromNpcTypeArms(game, player, false);
    expect(buffs.active.get(BuffType.Wet)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- ⑦ ewAdjust / FillTheTop
describe('IIIII228 ⑦ ewAdjust 多秘计数因子（WorldGen.cs:330-336）', () => {
  it('count 因子表：1..4→×1、5..8→×2、9..12→×3、0→4（int 除）', () => {
    expect(errorWorldAdjustmentOf(5, 1)).toBe(5);
    expect(errorWorldAdjustmentOf(5, 4)).toBe(5);
    expect(errorWorldAdjustmentOf(5, 5)).toBe(10);
    expect(errorWorldAdjustmentOf(5, 8)).toBe(10);
    expect(errorWorldAdjustmentOf(5, 9)).toBe(15);
    expect(errorWorldAdjustmentOf(1.0, 1)).toBe(1);
    expect(errorWorldAdjustmentOf(0, 0)).toBe(4);
  });

  it('activeSecretSeedCountOf 只计 37 枚 Register 位（zenith 不计入）', () => {
    expect(activeSecretSeedCountOf({ errorWorld: true })).toBe(1);
    expect(activeSecretSeedCountOf({ errorWorld: true, extraLiquid: true, digExtraHoles: true, roundLandmasses: true, rainbowStuff: true, pooEverywhere: true, portalGunInChests: true, worldIsFrozen: true, halloweenGen: true })).toBe(9);
    expect(activeSecretSeedCountOf({ everything: true, remix: true, drunkWorld: true } as never)).toBe(0);   // 特殊种子位均非 Register 实例
  });
});

describe('IIIII228 ⑦ DoNoSurfaceFillTheTop（WorldGen.cs:1056-1080）', () => {
  it('幽灵格落地 + 丛林/蘑菇草→泥 + 地牢墙豁免（:15324 DirtWallCleanup 头）', () => {
    const w = new World(200, 200, 42, 'i228f');
    const st = w.store;
    const JG = TILE_BY_KEY['v_60_jungle_grass_block']!, MG = TILE_BY_KEY['v_70_mushroom_grass_block']!;
    const MUD = TILE_BY_KEY['mud']!, DB = TILE_BY_KEY['v_41_blue_brick']!;
    // ① 丛林草幽灵格（inactive+type≠0）
    st.setTileSilent(10, 5, JG);
    st.deactivateTile(10, 5);
    // ② 蘑菇草活性格
    st.setTileSilent(12, 7, MG);
    // ③ 地牢墙内的幽灵草（豁免）
    st.setTileSilent(14, 9, JG);
    st.deactivateTile(14, 9);
    st.wall[st.idx(14, 9)] = 7;
    const gs = { seedFlags: { noSurface: true }, worldSurface: 100, rockLevel: 84 } as never;
    runNoSurfaceFillTheTop(st, new RNG(11), gs);
    expect(st.hasTile(10, 5)).toBe(true);               // 落地
    expect(st.type[st.idx(10, 5)]).toBe(MUD);           // 草→泥
    expect(st.type[st.idx(12, 7)]).toBe(MUD);
    expect(st.hasTile(14, 9)).toBe(false);              // 地牢墙格不动
  });
});
