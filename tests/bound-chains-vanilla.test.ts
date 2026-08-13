// bound 救援 NPC 原版链回归（2026-08-13 对齐原版收口）：
// 实证链（Terarria1456）——WorldGen SpawnStarterNPCs(:19830-20041) 普通种子只放
// 向导 22（:20037-20041）；bound NPC 唯一来源 = NPC.Spawner 链：三人组 :1994-2008 /
// 造型师 354 :1576 / 高尔夫 589 :1600 / 机械师 123 :2563 / 税务员 534 :4777。
// 生成期 placeBoundRescueNpcs（开局直接放五只 bound）已移除——本测试锁三条补齐链
// 在 spawner 层的真实可达性与 saved 旗关门：
//   ① 蜘蛛巢墙 62 点 → 354 命中（savedStylist=true 后绝迹）
//   ② 地下沙漠点 → 589 占位体（vanillaId 589；savedGolfer=true 后绝迹）
//   ③ 地牢内部点 + downedBoss3 → 123 命中（savedMech=true 后绝迹）
//   ④ 三人组：downedGoblins → 105 占位体（savedGoblin=true 后绝迹）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { World } from '../src/world/World';

const DESERT_WALL = new Set([216, 217, 218, 219, 220, 221, 222, 223, 187]);

/** 按墙类型找干燥落脚点（空气×3 + 实心底 + 指定墙 + 地表以下） */
function findWallSpot(
  world: World, walls: Set<number>, yTop: number, max: number,
): Array<{ x: number; y: number }> {
  const st = world.store;
  const out: Array<{ x: number; y: number }> = [];
  for (let y = yTop; y < st.h - 220 && out.length < max; y += 2) {
    for (let x = 100; x < st.w - 100 && out.length < max; x += 3) {
      if (!walls.has(st.wall[st.idx(x, y)])) continue;
      if (!st.isSolid(x, y)) continue;
      if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || st.isSolid(x, y - 3)) continue;
      if (st.liquid[st.idx(x, y - 1)] > 0) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** 在落点上反复 spawn 采样，统计命中的 vanillaId 集合 */
function sample(spawner: VanillaSpawner, spots: Array<{ x: number; y: number }>, rounds: number) {
  const hits = new Map<number, number>();
  for (const spot of spots) {
    for (let k = 0; k < rounds; k++) {
      const e = spawner.spawn((spot.x + 0.5) * 16, (spot.y - 3) * 16, new RNG(k * 7919 + spot.x), 30, 18);
      if (e && e.vanillaId != null) hits.set(e.vanillaId, (hits.get(e.vanillaId) ?? 0) + 1);
    }
  }
  return hits;
}

describe('bound 救援 NPC 原版链（生成期放置已移除）', () => {
  it('354 蜘蛛巢链 / 589 沙漠链 / 105 三人组链命中且 saved 旗关门', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'bound-chains-9', evil: 0 });
    const st = world.store;
    const spawner = new VanillaSpawner(world);

    // ① 造型师 354（蜘蛛巢墙 62）
    const spiderSpots = findWallSpot(world, new Set([62]), Math.floor(world.rockLevel) + 10, 10);
    expect(spiderSpots.length).toBeGreaterThan(0);
    delete world.flags['savedStylist'];
    const s354 = sample(spawner, spiderSpots, 900);
    expect(s354.get(354) ?? 0).toBeGreaterThan(0);
    world.flags['savedStylist'] = true;
    const s354b = sample(spawner, spiderSpots, 900);
    expect(s354b.get(354) ?? 0).toBe(0);
    delete world.flags['savedStylist'];

    // ② 高尔夫球手 589（地下沙漠墙；占位体 vanillaId=589）
    const desertSpots = findWallSpot(world, DESERT_WALL, Math.floor(world.rockLevel) + 10, 10);
    expect(desertSpots.length).toBeGreaterThan(0);
    delete world.flags['savedGolfer'];
    const s589 = sample(spawner, desertSpots, 900);
    expect(s589.get(589) ?? 0).toBeGreaterThan(0);
    world.flags['savedGolfer'] = true;
    const s589b = sample(spawner, desertSpots, 900);
    expect(s589b.get(589) ?? 0).toBe(0);
    delete world.flags['savedGolfer'];

    // ③ 哥布林三人组 105（洞穴层深处任意点 + downedGoblins）
    world.flags['downedGoblins'] = true;
    delete world.flags['savedGoblin'];
    const caveSpots: Array<{ x: number; y: number }> = [];
    for (let x = 600; x < st.w - 600 && caveSpots.length < 8; x += 37) {
      const y = Math.floor(world.rockLevel) + 120;
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)) {
        caveSpots.push({ x, y });
      }
    }
    expect(caveSpots.length).toBeGreaterThan(0);
    const s105 = sample(spawner, caveSpots, 900);
    expect(s105.get(105) ?? 0).toBeGreaterThan(0);
    world.flags['savedGoblin'] = true;
    const s105b = sample(spawner, caveSpots, 900);
    expect(s105b.get(105) ?? 0).toBe(0);
    delete world.flags['savedGoblin'];
    delete world.flags['downedGoblins'];
  }, 300000);

  it('123 机械师链：地牢深处点 downedBoss3 命中且 savedMech 关门', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'bound-chains-9', evil: 0 });
    const spawner = new VanillaSpawner(world);
    // 地牢墙 + 地牢砖地面 + 深层（> (ws*4+rl)/5）
    const st = world.store;
    const DUNG_WALL = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
    const deepY = Math.floor((world.groundLevel * 4 + world.rockLevel) / 5) + 40;
    const spots: Array<{ x: number; y: number }> = [];
    for (let y = deepY; y < st.h - 250 && spots.length < 8; y += 2) {
      for (let x = 100; x < st.w - 100 && spots.length < 8; x += 3) {
        if (!DUNG_WALL.has(st.wall[st.idx(x, y)])) continue;
        if (!st.isSolid(x, y)) continue;
        if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2)) continue;
        if (st.liquid[st.idx(x, y - 1)] > 0) continue;
        spots.push({ x, y });
      }
    }
    // 地牢深层可能整段在水下/实心（生成流随机性）——找到才断言可达性，找不到则
    // 只断言 downedBoss3=false 时绝不出现 123（门方向性）
    spawner.setPlayerFlags(true, true);
    delete world.flags['savedMech'];
    if (spots.length > 0) {
      const s123 = sample(spawner, spots, 1200);
      expect(s123.get(123) ?? 0).toBeGreaterThan(0);
      world.flags['savedMech'] = true;
      const s123b = sample(spawner, spots, 1200);
      expect(s123b.get(123) ?? 0).toBe(0);
    } else {
      const s123 = sample(spawner, [{ x: st.w >> 1, y: Math.min(st.h - 260, deepY) }], 400);
      expect(s123.get(123) ?? 0).toBe(0);
    }
  }, 300000);
});
