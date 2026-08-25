// 一次性审查探针（2026-08-19 渔夫四根因后续对抗审查；跑完可删）：
//  A. SwingArc 真刃旋斩弧（972 等）friendly 门——睡渔夫 376 不掉血
//  B. playerCanHitEnemy 门语义（projId 维度补测）
//  C. 雕像产 critter 分桶语义（critter 表分桶 + 网捕捉可见）
//  D. BOUND_NPC_SHEET 渲染表完备（含 tavernkeep:579）
import { describe, expect, it } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { SwingArc } from '../src/entities/SwingArc';
import { TownNPC } from '../src/entities/TownNPC';
import { playerCanHitEnemy } from '../src/entities/projTargets';
import { Renderer } from '../src/render/Renderer';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';

function setup() {
  const st = new TileStore(200, 200);
  const world = new World(200, 200, 1, 't');
  world.store = st;
  world.groundLevel = 60; world.rockLevel = 100; world.lavaLine = 150;
  for (let x = 0; x < 200; x++) for (let y = 90; y <= 92; y++) st.setTileSilent(x, y, 1);
  const enemies: Enemy[] = [];
  const critters: Enemy[] = [];
  const npcs: unknown[] = [];
  const owner = {
    cx: 100 * 16, cy: 80 * 16, x: 100 * 16 - 10, y: 80 * 16 - 21, w: 20, h: 42,
    facing: 1, dead: false, iframes: 0, hp: 400, maxHp: 400,
    buffs: { has: () => false }, addDPS: () => {},   // hurt(fromPlayer) 的 DPS 统计桩(12073 行引入晚于本审计 mock)
  };
  const game = {
    world,
    player: owner,
    enemies: () => enemies,
    critters: () => critters,
    npcs: () => npcs,
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    playSfxWav: () => {}, playSfxFile: () => false, spawnBurst: () => {},
    entities: {
      nextId: 10,
      add: (e: Enemy, b?: string) => {
        e.id = game.entities.nextId++;
        if (b === 'critters') critters.push(e);
        else if (b === 'npcs') npcs.push(e);
        else if (b === 'props') { /* gore 走 GorePiece 独立池，不入桶 */ }
        else enemies.push(e);
      },
    },
  } as never;
  return { game, enemies, critters, owner };
}

describe('A. SwingArc 真刃旋斩弧 friendly 门', () => {
  it('睡渔夫 376 被旋斩弧（972）扫过不掉血；对照僵尸 3 掉血', () => {
    const { game, enemies, owner } = setup();
    const angler = Enemy.fromVanilla(376, 100 * 16 + 40, 80 * 16)!;
    expect(!!angler.def.friendly).toBe(true);
    angler.id = 1; enemies.push(angler);
    const hp0 = angler.hp;
    const arc = new SwingArc(owner as never, 972, 30, 200, 1, 1);
    arc.x = angler.x; arc.y = angler.y;
    for (let t = 0; t < 32; t++) arc.fixedUpdate(1 / 60, game);
    expect(angler.hp).toBe(hp0);
    const z = Enemy.fromVanilla(3, 100 * 16 + 40, 80 * 16 + 60)!;
    z.id = 2; enemies.push(z);
    const zhp0 = z.hp;
    const arc2 = new SwingArc(owner as never, 972, 30, 200, 1, 1);
    arc2.x = z.x; arc2.y = z.y;
    for (let t = 0; t < 32; t++) {
      try {
        arc2.fixedUpdate(1 / 60, game);
      } catch (err) {
        console.log('THREW at t=', t, 'enemies:', enemies.map((e) => ({
          id: (e as { id?: number }).id,
          ctor: Object.getPrototypeOf(e)?.constructor?.name,
          hurt: typeof (e as unknown as { hurt?: unknown }).hurt,
          friendly: (e as unknown as { def?: { friendly?: boolean } }).def?.friendly,
        })));
        throw err;
      }
    }
    expect(z.hp).toBeLessThan(zhp0);
  });
});

describe('B. playerCanHitEnemy 门语义（projId 维度）', () => {
  it('376/548 friendly 挡；318 例外放行；普通敌怪放行', () => {
    const { game } = setup();
    const angler = Enemy.fromVanilla(376, 0, 0)!;
    expect(playerCanHitEnemy(angler, game)).toBe(false);
    expect(playerCanHitEnemy(angler, game, 318)).toBe(true);
    const crystal = Enemy.fromVanilla(548, 0, 0)!;
    expect(playerCanHitEnemy(crystal, game)).toBe(false);
    const z = Enemy.fromVanilla(3, 0, 0)!;
    expect(playerCanHitEnemy(z, game)).toBe(true);
  });
});

describe('C. 雕像产 critter 分桶语义', () => {
  it('松鼠 299 / 兔 46 / 金鱼 55 → critters 桶；骷髅 21 → enemies 桶', () => {
    const { game, critters, enemies } = setup();
    const spawnNpc = (vid: number): string => {
      const e = Enemy.fromVanilla(vid, 50 * 16, 80 * 16)!;
      e.spawnedFromStatue = true;
      const bucket = e.vanilla?.critter ? 'critters' : 'enemies';
      (game as unknown as { entities: { add: (e2: Enemy, b: string) => void } }).entities.add(e, bucket);
      return bucket;
    };
    expect(spawnNpc(299)).toBe('critters');
    expect(spawnNpc(46)).toBe('critters');
    expect(spawnNpc(55)).toBe('critters');
    expect(spawnNpc(21)).toBe('enemies');
    // 网捕捉（ItemCheck_CatchCritters）扫 critters 桶 → 雕像松鼠可捕
    expect(critters.some((c) => !c.dead && c.vanillaId === 299)).toBe(true);
    expect(enemies.some((e) => !e.dead && e.vanillaId === 299)).toBe(false);
  });
});

describe('D. BOUND_NPC_SHEET 渲染表完备', () => {
  it('十族 bound 键全有条目且与 BOUND_TOWN_NPC_ID 对齐', () => {
    const sheet = (Renderer as unknown as { BOUND_NPC_SHEET: Record<string, number> }).BOUND_NPC_SHEET;
    const expectMap: Record<string, number> = {
      goblin_tinkerer: 105, wizard: 106, mechanic: 123, stylist: 354, golfer: 589,
      tax_collector: 534, town_slime_old: 685, town_slime_clumsy: 686, angler: 376, tavernkeep: 579,
    };
    for (const [k, v] of Object.entries(expectMap)) {
      expect(sheet[k], `BOUND_NPC_SHEET.${k}`).toBe(v);
    }
    const boundIds = (Game as unknown as { BOUND_TOWN_NPC_ID: Record<string, number> }).BOUND_TOWN_NPC_ID;
    const missing = Object.keys(boundIds).filter((k) => sheet[k] === undefined);
    expect(missing).toEqual([]);
  });
  it('bound tavernkeep TownNPC 构造冒烟（vanillaId 550）', () => {
    const tn = new TownNPC('tavernkeep', 60 * 16, 80 * 16);
    expect(tn.vanillaId).toBe(550);
  });
});
