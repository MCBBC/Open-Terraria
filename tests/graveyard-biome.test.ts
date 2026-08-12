// 墓地（Graveyard）生物群系回归（对照 Terarria1456）：
//  ① SceneMetrics.cs:60/62/64/622-634/686——阈值 28 / 视觉分级 16-36 / 向日葵减半计数
//    与 HasSunflower 压制门（>16 块墓碑时向日葵快乐 buff 失效）
//  ② NPC.cs SpawnAnNPC 墓地段——白天整体跳过昼池（!ZoneGraveyard && dayTime 门 :4109）
//    落入夜间怪池：僵尸/眼球族 + 乌鸦 301(:4439) / 幽灵 316(:4444) / HoppinJack 304(:4449)
//    / Groom·Bride(:4523/:4528) / MossZombie 691(:4612) / MaggotZombie 632(:4617)；
//    蛆 606/鼠 610 = 草面 1/10(:4082) 与友好轮整支(:2008)
//  ③ NPC.cs:770-822 墓地刷怪率——城镇 NPC 在场时 spawnRate ×1.66/×2.33/×3 且
//    友好掷骰骤降（1/9 / 1/6 / 1/3）
//  ④ Chest.SetupShop 复合门（extract-shops.mjs '&&' 连接）——军火商 4703、树妖 2171
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { scanScene } from '../src/world/SceneMetrics';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import shopstock from '../src/data/vanilla-shopstock.json';

const TOMB = TILE_BY_KEY['tombstone_v']!;          // 原版 tile 85（全部墓碑 style）
const SUN = TILE_BY_KEY['v_27_sunflower']!;        // tile 27
const GRASS = TILE_BY_KEY['grass']!;

function makeWorld(tombs: number, sunflowers = 0): World {
  const w = new World(400, 400, 42, 'graveyard');
  w.groundLevel = 120; w.rockLevel = 200;
  w.clock.timeOfDay = 0.5;                        // 正午（isDay getter 派生，勿直写）
  const st = w.store;
  for (let x = 80; x < 120; x++) st.setTileSilent(x, 100, GRASS, 0, 0); // 草地面
  for (let k = 0; k < tombs; k++) st.setTileSilent(80 + k, 99, TOMB, 0, 0);
  for (let k = 0; k < sunflowers; k++) st.setTileSilent(150 + k, 99, SUN, 0, 0);
  return w;
}

describe('SceneMetrics 墓地判定（阈值 28 / 向日葵减半 / HasSunflower）', () => {
  it('27 块不触发、28 块触发（GraveyardTileThreshold=28）', () => {
    expect(scanScene(makeWorld(27), 100 * 16, 100 * 16, 0).zoneGraveyard).toBe(false);
    expect(scanScene(makeWorld(28), 100 * 16, 100 * 16, 0).zoneGraveyard).toBe(true);
  });
  it('向日葵每 2 株抵 1 块墓碑（GraveyardTileCount -= count[27]/2）', () => {
    // 30 墓碑 − 4 向日葵/2 = 28 → 恰好触发；29 墓碑 − 4/2 = 27 → 不触发
    const a = scanScene(makeWorld(30, 4), 100 * 16, 100 * 16, 0);
    expect(a.graveyardTileCount).toBe(28);
    expect(a.zoneGraveyard).toBe(true);
    const b = scanScene(makeWorld(29, 4), 100 * 16, 100 * 16, 0);
    expect(b.graveyardTileCount).toBe(27);
    expect(b.zoneGraveyard).toBe(false);
  });
  it('HasSunflower：计数 ≤16 为真，>16 被压制（SceneMetrics.cs:626-631）', () => {
    expect(scanScene(makeWorld(0, 2), 100 * 16, 100 * 16, 0).hasSunflower).toBe(true);
    // 16 墓碑 − 2 向日葵/2 = 15 ≤ 16 → 真；18 − 1 = 17 > 16 → 假
    expect(scanScene(makeWorld(16, 2), 100 * 16, 100 * 16, 0).hasSunflower).toBe(true);
    expect(scanScene(makeWorld(18, 2), 100 * 16, 100 * 16, 0).hasSunflower).toBe(false);
    expect(scanScene(makeWorld(0, 0), 100 * 16, 100 * 16, 0).hasSunflower).toBe(false);
  });
});

describe('SpawnAnNPC 白天墓地带（昼池整体关闭 → 夜间怪池）', () => {
  /** 直接驱动 spawnAnNPC：钉死地表草面落点 + 墓地旗标 + 白天 */
  function rollDayGraveyard(n: number): Map<number, number> {
    const w = makeWorld(0);   // 旗标直接强置（tile 计数链由 SceneMetrics 用例覆盖）
    const spawner = new VanillaSpawner(w);
    const s = spawner as unknown as Record<string, unknown>;
    s.spawnTileX = 100; s.spawnTileY = 99; s.spawnTileType = GRASS;
    s.surfaceSpawn = true; s.waterTile = false; s.noWorms = false;
    s.dayTime = true; s.ZoneGraveyard = true;
    const ids = new Map<number, number>();
    for (let k = 0; k < n; k++) {
      const e = (spawner as unknown as {
        spawnAnNPC: (rng: RNG) => { vanillaId: number | null } | null;
      }).spawnAnNPC(new RNG(k * 7919 + 13));
      if (e && e.vanillaId != null) ids.set(e.vanillaId, (ids.get(e.vanillaId) ?? 0) + 1);
    }
    return ids;
  }

  it('白天墓地只出夜间怪池：无昼池小动物/基础史莱姆/哥布林侦察兵', () => {
    const ids = rollDayGraveyard(600);
    const keys = [...ids.keys()];
    expect(keys.length).toBeGreaterThan(0);
    // 墓地专属怪扇门全部命中（1/10 蛆鼠、1/12 乌鸦、1/30 幽灵、1/300 Groom/Bride）
    expect(keys).toEqual(expect.arrayContaining([606, 610]));   // 蛆/鼠 :4082
    expect(keys).toContain(301);                                 // 乌鸦 :4439
    expect(keys).toContain(316);                                 // 幽灵 :4444
    const CRITTERS = [357, 377, 46, 299, 300, 74, 148, 149, 355, 358, 669, 604, 605, 356];
    const ALLOWED = new Set([
      606, 610, 301, 316, 53, 536, 691, 632, 590, 2, 133,
      3, 132, 186, 187, 188, 189, 200, 190, 191, 192, 193, 194,
      -26, -27, -28, -29, -30, -31, -32, -33, -34, -35, -36, -37, -44, -45, -43, -38, -39, -40, -41, -42,
    ]);
    for (const id of keys) {
      expect(ALLOWED.has(id)).toBe(true);
      expect(CRITTERS).not.toContain(id);
    }
    // 昼池三标志物绝不出：兔子/鸟小动物、基础史莱姆（-1..-8 族）、哥布林侦察兵 73
    for (const id of [1, -1, -2, -3, -4, -5, -6, -7, -8, 73, 224, 225]) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it('夜间怪池本体可达（僵尸 style 表 + 恶魔眼）', () => {
    const ids = rollDayGraveyard(600);
    const keys = [...ids.keys()];
    expect(keys.some((id) => [3, 132, 186, 187, 188, 189, 200].includes(id))).toBe(true);
    expect(keys.some((id) => id === 2 || id === -43)).toBe(true);
  });
});

describe('墓地刷怪率（NPC.cs:770-822 城镇段）', () => {
  it('townNPCs=1 墓地：友好概率骤降（1/9 vs 非墓地 1/3）', () => {
    const w = makeWorld(0);
    const spawner = new VanillaSpawner(w);
    const s = spawner as unknown as Record<string, unknown>;
    const count = (graveyard: boolean): number => {
      s.ZoneGraveyard = graveyard;
      let hits = 0;
      for (let k = 0; k < 900; k++) {
        spawner.getSpawnRate(100 * 16, 0, false, 800, 100 * 16, false, false, false, false, 1, true, false, false);
        if (s.spawnFriendlyCycle) hits++;
      }
      return hits;
    };
    const gy = count(true), plain = count(false);
    // 期望 ~100（1/9）vs ~300（1/3）；宽松界限防掷骰抖动
    expect(gy).toBeLessThan(160);
    expect(plain).toBeGreaterThan(240);
  });
  it('townNPCs=3 墓地：spawnRate 放宽 ×3（vs 非墓地恒友好）', () => {
    const w = makeWorld(0);
    const spawner = new VanillaSpawner(w);
    const s = spawner as unknown as Record<string, unknown>;
    s.ZoneGraveyard = true;
    let friendly = 0;
    for (let k = 0; k < 300; k++) {
      spawner.getSpawnRate(100 * 16, 0, false, 800, 100 * 16, false, false, false, false, 3, true, false, false);
      if (s.spawnFriendlyCycle) friendly++;
    }
    // 非墓地带 town≥3 恒友好（300/300）；墓地只有 1/3 轮友好
    expect(friendly).toBeGreaterThan(40);
    expect(friendly).toBeLessThan(260);
  });
});

describe('Chest.SetupShop 墓地限定商品（复合门）', () => {
  it('军火商 4703 = downedBoss3 && zoneGraveyard（Chest.cs:1474）', () => {
    const stock = (shopstock as { shops: Record<string, Array<{ id: number; cond: string | null }>> }).shops['19'];
    const hit = stock.filter((e) => e.id === 4703);
    expect(hit).toHaveLength(1);
    expect(hit[0].cond).toBe('downedBoss3&&zoneGraveyard');
  });
  it('树妖 2171（非猩红世界）= hardMode && zoneGraveyard（Chest.cs:1575）', () => {
    const stock = (shopstock as { shops: Record<string, Array<{ id: number; cond: string | null }>> }).shops['20'];
    expect(stock.some((e) => e.id === 2171 && e.cond === 'hardMode&&zoneGraveyard')).toBe(true);
    // 猩红世界支 59 = hardMode && zoneGraveyard && crimson
    expect(stock.some((e) => e.id === 59 && e.cond === 'hardMode&&zoneGraveyard&&crimson')).toBe(true);
  });
});
