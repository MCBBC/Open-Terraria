// 丛林草 tile 60 出怪池（原版 SpawnAnNPC L3839-3856 1:1）：
// 深层(y>(surface+rock)/2)：204 棘刺丛林史莱姆 / 43 食人怪(锚点) / 黄蜂族(231-235,42)
// 浅层：1/4→51 丛林蝙蝠 / 1/8→56 魔腾怪；158(巨型蝙蝠)绝不在肉前出现
import { describe, it, expect } from 'vitest';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

describe('丛林草出怪池（SpawnAnNPC L3839-3856）', () => {
  const JG = TILE_BY_KEY['v_60_jungle_grass_block']!;
  const HORNETS = new Set([231, 232, 233, 234, 235, 42]);

  /** 直接驱动 spawnAnNPC：把落脚点钉在丛林草格（绕过 FindSpawnTile 随机） */
  function rollPool(world: World, tileY: number, n: number): Map<number, number> {
    const spawner = new VanillaSpawner(world);
    const s = spawner as unknown as {
      spawnTileX: number; spawnTileY: number; spawnTileType: number;
      spawnAnNPC: (rng: RNG) => ReturnType<VanillaSpawner['spawn']>;
    };
    s.spawnTileX = 100; s.spawnTileY = tileY; s.spawnTileType = JG;
    const ids = new Map<number, number>();
    for (let k = 0; k < n; k++) {
      const e = s.spawnAnNPC(new RNG(k * 7919 + 13));
      if (e && e.vanillaId != null) ids.set(e.vanillaId, (ids.get(e.vanillaId) ?? 0) + 1);
    }
    return ids;
  }

  it('深层：只出 204/43/黄蜂族，无 158', () => {
    const w = new World(400, 400, 42, 'jungle');
    w.groundLevel = 120; w.rockLevel = 200;   // midY=160；深层取 250
    const ids = rollPool(w, 250, 400);
    const keys = [...ids.keys()];
    expect(keys).toEqual(expect.arrayContaining([204, 43]));       // 两扇门都命中
    for (const id of keys) {
      expect(id === 204 || id === 43 || HORNETS.has(id)).toBe(true);
    }
    expect(ids.has(158)).toBe(false);                               // 巨型蝙蝠绝不在肉前丛林
    expect(ids.has(51)).toBe(false);                                // 深层无丛林蝙蝠
  });

  it('浅层：出 51/56，落穿部分走通用地表池（原版 else-if 链语义）', () => {
    const w = new World(400, 400, 42, 'jungle');
    w.groundLevel = 120; w.rockLevel = 200;   // midY=160；浅层取 100
    const ids = rollPool(w, 100, 400);
    const keys = [...ids.keys()];
    console.log('shallow keys:', keys);
    expect(keys).toContain(51);                                     // 1/4 丛林蝙蝠
    expect(keys).toContain(56);                                     // 1/8 魔腾怪
    expect(ids.has(158)).toBe(false);                               // 巨型蝙蝠绝不在肉前丛林
    // 深层专属池绝不泄漏到浅层
    expect(ids.has(204)).toBe(false);
    expect(ids.has(43)).toBe(false);
    for (const id of keys) expect(HORNETS.has(id)).toBe(false);
  });

  it('黄蜂族变体：-56..-65 基底映射正确', () => {    const w = new World(400, 400, 42, 'jungle');
    const spawner = new VanillaSpawner(w);
    const map = (spawner as unknown as { NET_ID_MAP?: never });
    void map;
    // spawnNPC(-56) 应产出 base 231 的实体
    const s = spawner as unknown as { spawnNPC: (x: number, y: number, id: number, rng: RNG) => { vanillaId: number } | null };
    const e56 = s.spawnNPC(100, 100, -56, new RNG(1));
    const e64 = s.spawnNPC(100, 100, -64, new RNG(2));
    expect(e56?.vanillaId).toBe(231);
    expect(e64?.vanillaId).toBe(235);
  });

  it('端到端：真实世界深层丛林 FindSpawnTile 全链路出 204/43/56/黄蜂', async () => {
    const w = await generateWorld({ width: 4200, height: 1200, seedText: 'jungle-spawn-e2e' });
    // 深层丛林落脚点：丛林草实心格 + 上方 3 格净空，jungleX 附近
    const st = w.store;
    let spot: { x: number; y: number } | null = null;
    const y0 = Math.floor((w.groundLevel + w.rockLevel) / 2) + 10;
    for (let r = 0; r < 600 && !spot; r++) {
      for (const sd of [1, -1]) {
        const x = w.jungleX + sd * r;
        if (x < 50 || x > st.w - 50) continue;
        for (let y = y0; y < Math.min(st.h - 60, y0 + 400) && !spot; y++) {
          const i = st.idx(x, y);
          if (st.type[i] !== JG || !st.flags[i]) continue;
          if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || st.isSolid(x, y - 3)) continue;
          spot = { x, y };
        }
      }
    }
    expect(spot).not.toBeNull();
    const spawner = new VanillaSpawner(w);
    spawner.setPlayerFlags(false, false);
    const playerX = (spot!.x + 0.5) * 16;
    const playerY = (spot!.y - 3) * 16;
    const tally = new Map<number, number>();
    let spawned = 0;
    for (let k = 0; k < 3000; k++) {
      const e = spawner.spawn(playerX, playerY, new RNG(k * 104729 + 7), 60, 35);
      if (e) {
        spawned++;
        const id = e.vanillaId ?? -1;
        tally.set(id, (tally.get(id) ?? 0) + 1);
      }
    }
    console.log('e2e tally:', [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
    expect(spawned).toBeGreaterThan(30);
    expect((tally.get(204) ?? 0) + (tally.get(43) ?? 0) + (tally.get(56) ?? 0)
      + [231, 232, 233, 234, 235, 42].reduce((s, id) => s + (tally.get(id) ?? 0), 0)).toBeGreaterThan(0);
  }, 120000);
});
