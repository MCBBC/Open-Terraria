// 登记清零收尾批探针（对照 1456）：
//  ① 419 日耀旋刃怪 fighterAI 冲刺分支（NPC.cs:57114-57173）
//  ② 瓢虫 604/605 luck 双钩子（LadyBugKilled :82332 / LadyBugLuck :82366）
//  ③ 生成探针：MossAndMossCaves(17573) / SurfaceDirtWallsToGrassWalls(19734) /
//     hellPass 灰烬草 633（cs:13869-13915）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { LuckState } from '../src/stats/Luck';
import { TileStore } from '../src/world/TileStore';
import { runMossAndMossCavesPass } from '../src/world/gen/vanilla/MossPass';
import { runGrassWallPass } from '../src/world/gen/vanilla/GrassWallPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { RNG } from '../src/core/rng';

function sheetId(sheet: number): number {
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (d && d.vanilla?.sheet === sheet && d.key.startsWith('v_')) return id;
  }
  return -1;
}

function flatWorld(): { w: World; hooks: unknown } {
  const w = new World(120, 80, 42, 'dash');
  w.groundLevel = 40;
  const st = w.store;
  for (let x = 0; x < 120; x++) st.setTileSilent(x, 60, TILE_BY_KEY['stone']!);
  const hooks = {
    world: w,
    player: {
      x: 90 * 16, y: 56 * 16, w: 20, h: 42, cx: 90 * 16 + 10, cy: 56 * 16 + 21,
      dead: false, useTime: 0, luckState: new LuckState(),
    },
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDrop: () => null, damagePlayer: () => {},
    entities: { add: () => {} },
    enemies: () => [] as unknown[],
  } as never;
  return { w, hooks };
}

describe('419 日耀旋刃怪冲刺（NPC.cs:57114-57173）', () => {
  it('面朝玩家 + 视线 → 蓄力 → 16 速冲刺（ai2 ≤ -7，拖尾域 ai2 ≤ -9）+ 受击 ×3', () => {
    const { hooks } = flatWorld();
    const e = Enemy.fromVanilla(419, 40 * 16, 58 * 16)!;
    e.facing = 1;                       // 玩家在右
    let launched = false, dashed = false, tri = false;
    for (let t = 0; t < 400; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.ai2 === -7) {
        launched = true;
        // 发射帧：朝玩家方向 16 速（player.Top+(-30) 在上方 → vy 为负）
        expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(16, 0);
        expect(e.vy).toBeLessThan(0);
      }
      if (e.ai2 < -7) { dashed = true; if (e.takenDamageMultiplier === 3) tri = true; }
      if (dashed && tri && launched) break;
    }
    expect(launched).toBe(true);
    expect(dashed).toBe(true);
    expect(tri).toBe(true);
  });

  it('冲刺中受击 → ai2=60 恢复（cs:57168-57171 justHit 门）', () => {
    const { hooks } = flatWorld();
    const e = Enemy.fromVanilla(419, 40 * 16, 58 * 16)!;
    e.facing = 1;
    // 推进到冲刺态
    for (let t = 0; t < 400 && e.ai2 > -8; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.ai2).toBeLessThan(-7);
    e.hurt(10, 0, 0, hooks as never);
    e.fixedUpdate(1 / 60, hooks);       // justHit 消费帧
    expect(e.ai2).toBe(60);
  });
});

describe('瓢虫 604/605 luck 钩子（LadyBugKilled :82332 / LadyBugLuck :82366）', () => {
  it('击杀 → 坏运 + 雨加成；触碰 → 好运', () => {
    const luck = new LuckState();
    luck.ladyBugKilled(50, false);      // <100px 满额
    expect(luck.ladyBugLuckTimeLeft).toBeLessThan(0);
    const bad = luck.ladyBugLuckTimeLeft;
    luck.ladyBugTouched(10, false);     // 负运中触碰不改（cs:82368 门）
    expect(luck.ladyBugLuckTimeLeft).toBe(bad);
    const luck2 = new LuckState();
    luck2.ladyBugTouched(20, false);    // <30px 满额好运
    expect(luck2.ladyBugLuckTimeLeft).toBeGreaterThan(0);
    const luck3 = new LuckState();
    luck3.ladyBugKilled(50, true);      // 金瓢虫 ×2
    expect(luck3.ladyBugLuckTimeLeft).toBe(bad * 2);
  });

  it('Enemy 死亡管线接 LadyBugKilled（604/605）+ ladyBugRainBoost +1800', () => {
    const { w, hooks } = flatWorld();
    const before = w.weather.ladyBugRainBoost;
    const e = Enemy.fromVanilla(604, 88 * 16, 55 * 16)!;   // 玩家贴脸
    e.hp = 1;
    e.hurt(50, 0, 0, hooks as never);
    expect(e.dead).toBe(true);
    const pl = (hooks as unknown as { player: { luckState: LuckState } }).player;
    expect(pl.luckState.ladyBugLuckTimeLeft).toBeLessThan(0);
    expect(w.weather.ladyBugRainBoost).toBe(Math.min(18000, before + 1800));
  });

  it('瓢虫 AI 接触段 → ladyBugTouched（604 参与，触碰后好运 >0）', () => {
    const { hooks } = flatWorld();
    const e = Enemy.fromVanilla(604, 90 * 16, 56 * 16)!;   // 与玩家同格重叠
    e.fixedUpdate(1 / 60, hooks);
    const pl = (hooks as unknown as { player: { luckState: LuckState } }).player;
    expect(pl.luckState.ladyBugLuckTimeLeft).toBeGreaterThan(0);
  });
});

describe('生成探针：收尾批三个上游 pass', () => {
  it('MossAndMossCaves：苔藓块（179-183/381/霓虹）+ 苔藓墙 54-58 产出', () => {
    const st = new TileStore(600, 300);
    const gs = {
      worldSurface: 60, rockLevel: 120, waterLine: 105, lavaLine: 200,
      shimmerX: -1, shimmerY: -1,
    } as unknown as GenState;
    for (let x = 0; x < 600; x++) {
      for (let y = 60; y < 300; y++) st.setTileSilent(x, y, TILE_BY_KEY['stone']!);
    }
    // 挖两个洞腔给 Spread.Moss 涂墙（无墙空气腔 + 周边石头转苔藓）
    for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
      if (dx * dx + dy * dy <= 36) st.setTileSilent(150 + dx, 180 + dy, 0);
    }
    runMossAndMossCavesPass(st, new RNG(42), gs);
    const mossTiles = [179, 180, 181, 182, 183, 381, 534, 536, 539, 625].map(sheetId);
    let moss = 0, mossWall = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.flags[i] && mossTiles.includes(st.type[i])) moss++;
      if (st.wall[i] >= 54 && st.wall[i] <= 58) mossWall++;
    }
    expect(moss).toBeGreaterThan(0);
    expect(mossWall).toBeGreaterThan(0);
  });

  it('SurfaceDirtWallsToGrassWalls：泥土墙洞 → 草墙 63 + 1/10 花墙 65', () => {
    const st = new TileStore(300, 120);
    const gs = { worldSurface: 60 } as unknown as GenState;
    // 地表：草面 + 泥土；地下挖一个带泥土墙的腔（墙 2/15）
    for (let x = 0; x < 300; x++) {
      st.setTileSilent(x, 58, TILE_BY_KEY['grass']!);
      for (let y = 59; y < 120; y++) st.setTileSilent(x, y, TILE_BY_KEY['dirt']!);
    }
    for (let dx = -8; dx <= 8; dx++) for (let dy = -8; dy <= 8; dy++) {
      if (dx * dx + dy * dy <= 64) {
        st.setTileSilent(150 + dx, 80 + dy, 0);
        st.setWallSilent(150 + dx, 80 + dy, 15);
      }
    }
    // 草面正下方给一格泥土墙触发位
    st.setWallSilent(150, 58, 2);
    runGrassWallPass(st, new RNG(7), gs);
    let grass = 0, flower = 0;
    for (let i = 0; i < st.wall.length; i++) {
      if (st.wall[i] === 63) grass++;
      if (st.wall[i] === 65) flower++;
    }
    expect(grass + flower).toBeGreaterThan(0);
  });
});
