// 世纪之花 262 全链专项（2026-08-13 1:1 对齐批验收）：
//   AI_051 相位常数/激怒界（UnderworldLayer=h-200,勿用 lavaLine）/despawn 4800px
//   语义/弹幕物理（275/276 延迟重力+专家追踪、277 荆棘弹跳）/276 命中上毒
//   （BuffType.Poisoned）/保底花苞爆发（GeneratePlanteraBulbOnAllMechsDefeated）
//   /钩蔓 263 dontTakeDamage。
// 参照：NPC.cs:31873-32237 / Projectile.cs:54318-54345,18306-18314,11527-11535
//      WorldGen.cs:74180-74329 / NPC.cs:12328-12340。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { WorldEvolution } from '../src/world/evolution/WorldEvolution';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { BuffState, BuffType } from '../src/stats/Buffs';
import { statusPlayer } from '../src/entities/projTargets';
import { planteraAI } from '../src/entities/bossAI_queenbee_plantera';
import type { GameHooks } from '../src/entities/types';

// h 必须 >200（UnderworldLayer = h-200,Main.cs:2863）
const W = 200, H = 260, GRASS_TOP = 55;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const BULB = TILE_BY_KEY['v_238_plantera_s_bulb']!;

function makeWorld(jungleGrass = false): World {
  const w = new World(W, H, 7, 'plantera-test');
  w.groundLevel = 50;
  if (jungleGrass) {
    for (let x = 30; x < 70; x++) for (let y = GRASS_TOP; y < 60; y++) w.store.setTile(x, y, JUNGLE_GRASS);
  }
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }, zoneJungle = true) {
  const enemies: Enemy[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: new BuffState(),
  };
  const hooks = {
    world, player,
    scene: { zoneJungle },
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  (hooks as unknown as { entities: typeof em }).entities = em;
  return { hooks, enemies, projectiles, player };
}

/** 逐 tick 驱动 planteraAI（内部 localAI 不可达,靠真实节拍推进） */
function tick(e: Enemy, hooks: GameHooks, n: number): void {
  for (let i = 0; i < n; i++) planteraAI(e, hooks, (hooks as unknown as { player: typeof hooks.player }).player);
}

describe('世纪之花 AI_051', () => {
  it('入场三钩蔓 + 一相位 36/50', () => {
    const w = makeWorld();
    const { hooks, enemies } = makeHooks(w, { x: 100, y: 55 });
    const e = Enemy.fromVanilla(262, 100 * TILE, 50 * TILE)!;
    (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'enemies');
    tick(e, hooks, 2);
    expect(enemies.filter((n) => n.vanillaId === 263).length).toBe(3);
    expect(e.def.defense).toBe(36);
    expect(e.def.damage).toBe(50);
  });

  it('激怒下界 = UnderworldLayer(h-200) 而非 lavaLine：y=h-201 格玩家不激怒', () => {
    const w = makeWorld();
    w.lavaLine = 100;                      // 陷阱回归：曾用 lavaLine → 此处会误激怒
    // 玩家 y=58 格：worldSurface(50) 之下、UnderworldLayer(h-200=60) 之上 → 不激怒
    const { hooks } = makeHooks(w, { x: 100, y: 58 });
    const e = Enemy.fromVanilla(262, 100 * TILE, 52 * TILE)!;
    (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'enemies');
    tick(e, hooks, 2);
    expect(e.def.defense).toBe(36);        // 激怒会 ×2 → 72
  });

  it('脱离丛林/地表激怒：防 72/伤 100、500px 外提速', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w, { x: 100, y: 40 }, false);   // 地表 + 非丛林
    const e = Enemy.fromVanilla(262, 100 * TILE, 52 * TILE)!;
    (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'enemies');
    tick(e, hooks, 2);
    expect(e.def.defense).toBe(72);
    expect(e.def.damage).toBe(100);
  });

  it('二相位（≤50% 血）：防 10/伤 70 + 触须×8', () => {
    const w = makeWorld();
    const { hooks, enemies } = makeHooks(w, { x: 100, y: 55 });
    const e = Enemy.fromVanilla(262, 100 * TILE, 50 * TILE)!;
    (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'enemies');
    e.hp = e.maxHp / 2;
    tick(e, hooks, 2);
    expect(e.def.defense).toBe(10);
    expect(e.def.damage).toBe(70);
    expect(enemies.filter((n) => n.vanillaId === 264).length).toBe(8);
  });

  it('despawn 语义：4800px 内每 tick 刷新 750；超界 → encouraged', () => {
    const w = makeWorld();
    // 近距（同格）
    {
      const { hooks } = makeHooks(w, { x: 100, y: 55 });
      const e = Enemy.fromVanilla(262, 100 * TILE, 50 * TILE)!;
      (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'enemies');
      tick(e, hooks, 3);
      expect(e.despawnTimer).toBe(750);
      expect(e.despawnEncouraged).toBe(false);
    }
    // 远距：对角 >4800px（=300 格）——小世界里只有对角够远
    {
      const { hooks } = makeHooks(w, { x: 195, y: 5 });
      const e = Enemy.fromVanilla(262, 5 * TILE, 255 * TILE)!;
      (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'enemies');
      tick(e, hooks, 3);
      expect(e.despawnEncouraged).toBe(true);
      expect(e.despawnTimer).toBeLessThanOrEqual(15000);
    }
  });

  it('弹幕物理：275/276 延迟重力 35t、277 荆棘弹跳', () => {
    const w = makeWorld();
    const { hooks, projectiles } = makeHooks(w, { x: 100, y: 55 });
    const e = Enemy.fromVanilla(262, 100 * TILE, 50 * TILE)!;
    (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'enemies');
    e.hp = Math.floor(e.maxHp * 0.79);     // <80% 解锁毒种/刺球骰
    let guard = 0;
    while (projectiles.length === 0 && guard++ < 400) tick(e, hooks, 1);
    expect(projectiles.length).toBeGreaterThan(0);
    const p = projectiles[0] as Arrow;
    expect([275, 276, 277]).toContain(p.projId);
    if (p.projId === 277) {
      expect(p.thornBounce).toBe(true);
      expect(p.grav).toBe(0.2);            // 277 = aiStyle14 档 0.2（P.cs:23498 `ai[0] > 5` 后
                                           //  vy+=0.2；SetDefaults :3362-3369 无重力覆写）
    } else {
      expect(p.grav).toBe(0.025);          // Projectile.cs:54318-54329
      expect(p.gravDelay).toBe(35);
    }
  });
});

describe('世纪之花弹幕与状态', () => {
  it('Arrow 延迟重力：35t 内不下坠、之后下坠', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w, { x: 100, y: 94 });
    const a = new Arrow(100 * TILE, 90 * TILE, 8, 0, 22, 0, 275, null,
      { grav: 0.025, gravDelay: 35, hostile: true });
    for (let i = 0; i < 30; i++) a.fixedUpdate(1, hooks);
    expect(a.vy).toBe(0);
    for (let i = 0; i < 20; i++) a.fixedUpdate(1, hooks);
    expect(a.vy).toBeGreaterThan(0);
  });

  it('专家追踪：速度向玩家侧偏转并受 floor 约束', () => {
    const w = makeWorld();
    w.difficulty = 1;
    const { hooks } = makeHooks(w, { x: 110, y: 94 });
    const a = new Arrow(100 * TILE, 90 * TILE, 0, -14, 22, 0, 275, null,
      { grav: 0, hostile: true, homing: { speed: 18, weight: 70, floor: 14 } });
    const v0 = Math.hypot(a.vx, a.vy);
    for (let i = 0; i < 40; i++) a.fixedUpdate(1, hooks);
    expect(Math.hypot(a.vx, a.vy)).toBeGreaterThanOrEqual(v0 - 0.01);
    expect(a.vx).toBeGreaterThan(0);       // 朝 +x 玩家偏转
  });

  it('荆棘球撞墙反弹 ×-0.9 不消亡', () => {
    const w = makeWorld();
    for (let y = 0; y < H; y++) w.store.setTile(120, y, TILE_DEFS.findIndex((d) => d.key === 'stone'));
    const { hooks } = makeHooks(w, { x: 100, y: 94 });
    const a = new Arrow(115 * TILE, 94 * TILE, 8, 2, 31, 0, 277, null,
      { grav: 0, thornBounce: true, hostile: true, life: 600 });
    let bounced = false;
    for (let i = 0; i < 40 && !a.dead; i++) {
      a.fixedUpdate(1, hooks);
      if (a.vx < 0) { bounced = true; break; }
    }
    expect(bounced).toBe(true);
    expect(a.dead).toBe(false);
  });

  it('276 命中上毒：专家必中；经典 50% 概率', () => {
    const we = makeWorld(); we.difficulty = 1;   // 专家
    const he = makeHooks(we, { x: 100, y: 94 });
    statusPlayer(he.hooks, 276);
    expect(he.player.buffs.has(BuffType.Poisoned)).toBe(true);
    const wc = makeWorld();                      // 经典
    const hc = makeHooks(wc, { x: 100, y: 94 });
    let any = false;
    for (let i = 0; i < 60; i++) {
      statusPlayer(hc.hooks, 276);
      if (hc.player.buffs.has(BuffType.Poisoned)) { any = true; break; }
    }
    expect(any).toBe(true);
    // Poisoned DoT 表项存在（ENV_DOTS -2 HP/s 由 Buffs.tick 消费）
    hc.player.buffs.remove(BuffType.Poisoned);
  });
});

describe('保底花苞爆发（WorldGen.cs:74180-74329）', () => {
  it('丛林侧草床 → 恰好生成一个 2×2 花苞', () => {
    const w = makeWorld(true);
    const evo = new WorldEvolution({
      store: w.store, worldSurface: 50, rockLevel: 120,
      dungeonX: 150, difficulty: 0,                       // >0.5W → 丛林在左侧 [0.15W,0.35W)=[30,70)
      flags: { hardMode: true }, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    });
    const ok = evo.planteraBulbBurst();
    expect(ok).toBe(true);
    let bulbs = 0;
    for (let x = 30; x < 70; x++) for (let y = 50; y < 60; y++) {
      if (w.store.get(x, y) === BULB) bulbs++;
    }
    expect(bulbs).toBe(4);                 // 恰好一个 2×2
  });

  it('无丛林草 → false 不放置', () => {
    const w = makeWorld(false);
    const evo = new WorldEvolution({
      store: w.store, worldSurface: 50, rockLevel: 120, dungeonX: 150, difficulty: 0,
      flags: {}, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    });
    expect(evo.planteraBulbBurst()).toBe(false);
    let bulbs = 0;
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (w.store.get(x, y) === BULB) bulbs++;
    expect(bulbs).toBe(0);
  });

  // PlaceJunglePlant 裸数组直写语义（cs:48191-48256）：非实体植物可与带水格共存
  // （不清液）；写入不得走普通 setTile——本仓液体监听器会按"保水"语义把新块
  // kill 成 L 形残件（2026-08-30 用户存档实测定罪，曾 10/10 次 burst 只剩 3 格）。
  it('写入走静默口：水共存 + 监听器不见花苞写', () => {
    const w = makeWorld(true);
    const st = w.store;
    const idx = (x: number, y: number) => y * st.w + x;
    // 花苞可落区（锚点向上搜索带）全部灌水——任何命中锚的 2×2 必在水中
    for (let x = 30; x < 70; x++) for (let y = 50; y < GRASS_TOP; y++) st.liquid[idx(x, y)] = 200;
    let plainWriteOfBulb = 0;
    st.onTileChanged((x, y) => { if (st.type[idx(x, y)] === BULB) plainWriteOfBulb++; });
    const evo = new WorldEvolution({
      store: st, worldSurface: 50, rockLevel: 120,
      dungeonX: 150, difficulty: 0,
      flags: { hardMode: true }, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    });
    expect(evo.planteraBulbBurst()).toBe(true);
    let bulbs: Array<[number, number]> = [];
    for (let x = 30; x < 70; x++) for (let y = 50; y < 60; y++) {
      if (st.type[idx(x, y)] === BULB) bulbs.push([x, y]);
    }
    expect(bulbs.length).toBe(4);   // 完整 2×2
    bulbs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    // 四格连体
    expect(bulbs[1][0]).toBe(bulbs[0][0] + 1);
    expect(bulbs[3][0]).toBe(bulbs[2][0] + 1);
    expect(bulbs[2][1]).toBe(bulbs[0][1] + 1);
    // 水保留在原格（原版不清液）且未触发普通 setTile 的花苞写（静默口）
    for (const [x, y] of bulbs) expect(st.liquid[idx(x, y)]).toBe(200);
    expect(plainWriteOfBulb).toBe(0);
  });
});

describe('钩蔓 263', () => {
  it('SetDefaults dontTakeDamage=true（NPC.cs:12331-12332）', () => {
    const hook = Enemy.fromVanilla(263, 0, 0)!;
    expect(hook.dontTakeDamage).toBe(true);
  });
});
