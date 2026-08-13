// 微光墙落脚小动物链 + 双地牢越界支（NPC.cs:1482-1560）回归探针：
//   微光墙（wall 244）落脚 → 地下水/地表两套小动物表（金小动物 RollLuck(400)、
//   侏儒 624 timeLeft×10、节日 303/337/540、299/538/46 兜底）；
//   tresspassingDualDungeon（getfixedboi 不可破墙越界）→ 82/316。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY } from '../src/data/tiles';

/** 微光墙落脚环境：落脚格上二格埋墙 244，表面草地日间（复用 a-batch4 掷夜法） */
function shimmerRolls(opts: {
  y?: number; water?: boolean; hardMode?: boolean; groundLevel?: number; trespass?: boolean;
}, n: number): Map<number, number> {
  const w = new World(200, 400, 42, 'open');
  w.groundLevel = opts.groundLevel ?? 60;
  if (opts.hardMode) w.flags.hardMode = true;
  w.clock.timeOfDay = 0.3;   // 白天
  const sp = new VanillaSpawner(w);
  const s = sp as unknown as Record<string, unknown>;
  const y = opts.y ?? 100;
  s.spawnTileX = 100; s.spawnTileY = y; s.spawnTileType = TILE_BY_KEY['grass']!;
  s.surfaceSpawn = y <= (opts.groundLevel ?? 60); s.waterTile = !!opts.water;
  s.noWorms = false; s.dayTime = true; s.ZoneGraveyard = false;
  w.store.setWall(100, y - 1, 244);
  w.store.setWall(100, y - 2, 244);
  sp.setPlayerFlags(false, false, false, new Set(), null, null, 100, 0, !!opts.trespass, false);
  const ids = new Map<number, number>();
  for (let k = 0; k < n; k++) {
    const e = (sp as unknown as { spawnAnNPC: (rng: RNG) => { vanillaId: number | null } | null })
      .spawnAnNPC(new RNG(k * 6151 + 17));
    if (e && e.vanillaId != null) ids.set(e.vanillaId, (ids.get(e.vanillaId) ?? 0) + 1);
  }
  return ids;
}

describe('微光墙落脚小动物链（NPC.cs:1495-1560）', () => {
  it('地下（y>worldSurface）：产出限定 {447,300,359,448,357}，无水面系 592/55 与地表兜底 46', () => {
    const ids = shimmerRolls({ y: 100, groundLevel: 60 }, 4000);
    const expected = new Set([447, 300, 359, 448, 357]);
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids.keys()) expect(expected.has(id)).toBe(true);
    expect(ids.get(300)).toBeGreaterThan(50);       // 金蛙否决支主体
    expect(ids.get(357)).toBeGreaterThan(50);       // 鼠兜底
    expect(ids.has(55)).toBe(false);
    expect(ids.has(46)).toBe(false);
  });
  it('waterTile：产出限定 {592 金金鱼, 55 金鱼}', () => {
    const ids = shimmerRolls({ y: 100, groundLevel: 60, water: true }, 2000);
    const expected = new Set([592, 55]);
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids.keys()) expect(expected.has(id)).toBe(true);
  });
  it('地表：兜底链 46 兔为主体；侏儒 624 出现且 despawnTimer=7500（timeLeft×10 :1533）', () => {
    const ids = shimmerRolls({ y: 40, groundLevel: 60 }, 4000);
    const expected = new Set([624, 443, 539, 303, 337, 540, 299, 538, 46]);
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids.keys()) expect(expected.has(id)).toBe(true);
    expect(ids.get(46)).toBeGreaterThan(100);       // 终段兜底主体
    // 侏儒档：RollLuck(2)==0 → 约半数地表轮在节日前命中 624
    expect(ids.get(624)).toBeGreaterThan(100);
    // despawnTimer×10 断言（spawnAnNPC 返回实体带 despawnTimer 7500）
    const w = new World(200, 400, 42, 'open');
    w.groundLevel = 60; w.clock.timeOfDay = 0.3;
    const sp = new VanillaSpawner(w);
    const s = sp as unknown as Record<string, unknown>;
    s.spawnTileX = 100; s.spawnTileY = 40; s.spawnTileType = TILE_BY_KEY['grass']!;
    s.surfaceSpawn = true; s.waterTile = false; s.noWorms = false; s.dayTime = true; s.ZoneGraveyard = false;
    w.store.setWall(100, 39, 244); w.store.setWall(100, 38, 244);
    sp.setPlayerFlags(false, false, false, new Set(), null, null, 100, 0, false, false);
    let gnomeSeen = 0;
    for (let k = 0; k < 2000 && gnomeSeen < 3; k++) {
      const e = (sp as unknown as { spawnAnNPC: (rng: RNG) => { vanillaId: number | null; despawnTimer?: number } | null })
        .spawnAnNPC(new RNG(k * 6151 + 17));
      if (e && e.vanillaId === 624) { expect(e.despawnTimer).toBe(7500); gnomeSeen++; }
    }
    expect(gnomeSeen).toBeGreaterThan(0);
  });
  it('双地牢越界（tresspassing && RollBadLuck(15)）：产出含 316（非困难档，:1487-1493）', () => {
    const ids = shimmerRolls({ y: 100, groundLevel: 60, trespass: true }, 6000);
    expect(ids.get(316)).toBeGreaterThan(10);       // 1/15 通道
    expect(ids.has(82)).toBe(false);                // 非困难档不出 82
  });
});
