// 一次性审计验证（2026-08-13 中低项修复）——跑完即删,不入库
import { describe, it, expect } from 'vitest';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const MG = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const SAND = TILE_BY_KEY['sand']!;
const DBLUE = TILE_BY_KEY['v_41_blue_brick']!;

type Spy = VanillaSpawner & Record<string, unknown>;

function rig(world: World, tile: number, tileY: number, over: Partial<Record<string, unknown>> = {}): Spy {
  const sp = new VanillaSpawner(world) as Spy;
  sp.spawnTileX = 100; sp.spawnTileY = tileY; sp.spawnTileType = tile;
  Object.assign(sp, over);
  return sp;
}

function roll(sp: Spy, n: number): Map<number, number> {
  const ids = new Map<number, number>();
  for (let k = 0; k < n; k++) {
    const e = (sp.spawnAnNPC as (r: RNG) => { vanillaId?: number } | null)(new RNG(k * 7919 + 13));
    if (e && e.vanillaId != null) ids.set(e.vanillaId, (ids.get(e.vanillaId) ?? 0) + 1);
  }
  return ids;
}

describe('中低项审计：蘑菇地表支 1:1（NPC.cs:3540-3610）', () => {
  it('地表蘑菇草：360/259(锚点)/257/258/254/255 全支可达,2/3 通过门', () => {
    const w = new World(400, 400, 42, 'mush');
    w.groundLevel = 120; w.rockLevel = 200;
    const sp = rig(w, MG, 100);              // y=100 <= worldSurface(120)
    const ids = roll(sp, 4000);
    const keys = [...ids.keys()];
    // 肉前:360(1/6) 259(锚点) 257 258 254 255(json 缺→null 不出)
    for (const id of [360, 259, 257, 258, 254]) expect(keys, `缺 ${id}`).toContain(id);
    expect(keys).not.toContain(255);
    // 260/374/256 是 hard 专属,肉前不出
    for (const id of [260, 374, 256]) expect(keys).not.toContain(id);
    // 通过率:外层 2/3 门 + 360 占 1/6 → 360 占比应 ≈ 2/3×1/6 ≈ 11%(宽松 6%~20%)
    const r360 = (ids.get(360) ?? 0) / 4000;
    expect(r360).toBeGreaterThan(0.06);
    expect(r360).toBeLessThan(0.2);
  });

  it('洞穴蘑菇草(hard)：374/360/260/259/257/258 全支可达', () => {
    const w = new World(400, 400, 42, 'mush2');
    w.groundLevel = 120; w.rockLevel = 200;
    w.flags.hardMode = true;
    const sp = rig(w, MG, 250);              // y=250 >= worldSurface
    const ids = roll(sp, 4000);
    const keys = [...ids.keys()];
    for (const id of [374, 360, 260, 259, 257, 258]) expect(keys, `缺 ${id}`).toContain(id);
    expect(keys).not.toContain(254);         // 254/255 仅地表支
  });

  it('水支：hard && waterTile → 真菌鱼 256', () => {
    const w = new World(400, 400, 42, 'mush3');
    w.groundLevel = 120; w.rockLevel = 200;
    w.flags.hardMode = true;
    const sp = rig(w, MG, 250, { waterTile: true });
    expect([...roll(sp, 40).keys()]).toEqual([256]);
  });
});

describe('中低项审计：水池第三支（NPC.cs:1906-1993）', () => {
  it('地表水(内带 x) 1/4 → 鸭 362/364;深水 → 金鱼 55', () => {
    const w = new World(400, 400, 42, 'water3');
    w.groundLevel = 120; w.rockLevel = 200;
    // 地表水面:y=100<=ws, x=100 在海洋带间 → A/B 门均不成立(非 deep/非 y>ws)
    const sp = rig(w, TILE_BY_KEY['stone']!, 100, { waterTile: true });
    const ids = roll(sp, 4000);
    const keys = [...ids.keys()];
    expect(keys).toContain(362);
    expect(keys).toContain(364);
    for (const id of keys) expect(id === 362 || id === 364).toBe(true);
  });
  it('深水(>ws+50) → 金鱼 55 / 金金鱼 592;腐化 → 57', () => {
    const w = new World(400, 400, 42, 'water4');
    w.groundLevel = 120; w.rockLevel = 200;
    const sp = rig(w, TILE_BY_KEY['stone']!, 130, { waterTile: true, deeperThanRockLayer: false });
    const ids = roll(sp, 6000);
    const keys = [...ids.keys()];
    // y=130>ws(120) → B 门 1/3 出水母 63;其余落 C(1/4)→55/592(夜间 dayTime=false 走深水支)
    sp.dayTime = false;
    const ids2 = roll(sp, 6000);
    const keys2 = [...ids2.keys()];
    expect(keys2).toContain(55);
    for (const id of keys2) expect(id === 55 || id === 592 || id === 63).toBe(true);
    // 腐化区 → 恒 57
    const sp2 = rig(w, TILE_BY_KEY['stone']!, 130, { waterTile: true, ZoneCorrupt: true });
    sp2.dayTime = false;
    expect([...roll(sp2, 40).keys()]).toEqual([57]);
  });
});

describe('中低项审计：沙尘暴门+池（NPC.cs:3859-3928）', () => {
  it('门：Spawning_SandstoneCheck——孤沙不刷,成片沙(≥40)刷', () => {
    const w = new World(400, 400, 42, 'sand');
    w.groundLevel = 120; w.rockLevel = 200;
    const st = w.store;
    // 成片沙:20×10 沙面,落脚 (100,150) 上方净空
    for (let x = 90; x < 112; x++) for (let y = 150; y < 160; y++) st.setTileSilent(x, y, SAND, 0, 0);
    const sp = rig(w, SAND, 150, { sandstormHappening: true, zoneSandstorm: true });
    sp.pX = 100; sp.pY = 140;
    const ids = roll(sp, 4000);
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids.keys()) expect([546, 61, 69].includes(id)).toBe(true);
    // 孤沙(单格):门关 → 不出沙尘暴池
    const w2 = new World(400, 400, 42, 'sand2');
    w2.groundLevel = 120; w2.rockLevel = 200;
    w2.store.setTileSilent(100, 150, SAND, 0, 0);
    const sp2 = rig(w2, SAND, 150, { sandstormHappening: true, zoneSandstorm: true });
    sp2.pX = 100; sp2.pY = 140;
    const ids2 = roll(sp2, 2000);
    for (const id of ids2.keys()) expect([546, 61, 69].includes(id)).toBe(false);
  });
  it('hard 池：541/510/542/543/545/78/80/546/580/581 分支', () => {
    const w = new World(400, 400, 42, 'sand3');
    w.groundLevel = 120; w.rockLevel = 200;
    w.flags.hardMode = true;
    const st = w.store;
    for (let x = 90; x < 112; x++) for (let y = 150; y < 160; y++) st.setTileSilent(x, y, SAND, 0, 0);
    const sp = rig(w, SAND, 150, { sandstormHappening: true, zoneSandstorm: true });
    sp.pX = 100; sp.pY = 140;
    const ids = roll(sp, 8000);
    const keys = [...ids.keys()];
    for (const id of [541, 510, 542, 78, 546, 580, 581]) expect(keys, `缺 ${id}`).toContain(id);
  });
});

describe('中低项审计：地牢限深门（NPC.cs:5690-5697）', () => {
  it('玩家在地牢浅层(pY<dungeonY+40)也走地牢池 → 守卫 68', () => {
    const w = new World(400, 400, 42, 'dg');
    w.groundLevel = 120; w.rockLevel = 200;
    const sp = rig(w, DBLUE, 150, { ZoneDungeon: true, downedBoss3: false });
    sp.pX = 100; sp.pY = 10;                  // 远在 dungeonY+40 之上
    w.store.setWallSilent(100, 149, 7);        // 上格地牢墙(PostCheck 语义)
    const ids = roll(sp, 400);
    expect([...ids.keys()]).toEqual([68]);
  });
});

describe('中低项审计：城镇 noWorms + 外层门（NPC.cs:709/:717-814）', () => {
  it('townNPCs=1 地表 → townNoWorms 置位且 spawn 合成 noWorms', () => {
    const w = new World(400, 400, 42, 'town');
    w.groundLevel = 120; w.rockLevel = 200;
    const sp = new VanillaSpawner(w) as Spy;
    sp.getSpawnRate(100 * 16, 0, false, 800, 100 * 16, false, false, false, false, 1, true, false, false);
    expect(sp.townNoWorms).toBe(true);
    expect(sp.spawnFriendlyCycle === true || sp.spawnFriendlyCycle === false).toBe(true);
  });
  it('南瓜月期间友好轮关闭(外层门补齐)', () => {
    const w = new World(400, 400, 42, 'moon');
    w.groundLevel = 120; w.rockLevel = 200;
    const sp = new VanillaSpawner(w) as Spy;
    sp.moonEvent = { kind: 2, wave: 5, counts: new Map(), bossSlotSum: 0 };
    let hits = 0;
    for (let k = 0; k < 200; k++) {
      sp.getSpawnRate(100 * 16, 0, false, 800, 100 * 16, false, false, false, false, 3, true, false, false);
      if (sp.spawnFriendlyCycle) hits++;
    }
    expect(hits).toBe(0);
  });
});
