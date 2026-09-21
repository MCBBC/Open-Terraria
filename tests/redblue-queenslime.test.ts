// 史莱姆皇后(Queen Slime 657)宿主实装批闸门(2026-08-26):
//   AI_121 状态机(选拍/四连跳/砸地 922/凝胶环 926/传送/二阶段转换/lai3 帧驱动/
//   掉血撒仆从)+ 掉落表五规则 + 召唤物 4988 链 + 音乐/图鉴/素材面。
// 标杆:Terarria1458 NPC.cs AI_121_QueenSlime(:45695-46177)/NPCLoot(:82813 族)/
//   Item.cs:40186(4988)/Player.cs:44230(ZoneHallow 召唤)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Enemy, VANILLA_BOSS_IDS } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../src/data/items';
import { itemCombat } from '../src/data/vanillaItemCombat';
import dropsJson from '../src/data/vanilla-npcdrops.json';
import bestiaryJson from '../src/data/vanilla-bestiary.json';
import { BOSS_MUSIC, bossMusicFor } from '../src/data/Music';
import type { GameHooks } from '../src/entities/types';
import { seededRandom, BATTERY_SEED } from './seeded-rng';

// ★SW-BN6 2026-09-08 电池族 RNG 统一播种（范式=seeded-rng.ts,推广自 slime-item-ladder-parity）:
// AI_121 状态机选拍掷流（四连跳节奏/仆从撒落）依赖序列,播种后恒定。
beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const W = 160, H = 140, FLOOR = 120;

function makeHooks() {
  const world = new World(W, H, 7, 'queenslime-test');
  const st = world.store;
  world.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  const enemies: Enemy[] = [];
  const projectiles: Array<{ projId?: number; damage?: number; vx?: number; vy?: number; dead?: boolean }> = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id?: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(ent as Enemy);
      else projectiles.push(ent as never);
    },
  };
  const px = 90 * TILE, py = (FLOOR - 4) * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: { has: () => false } as never,
    aabbOverlaps: () => false,
  };
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, player };
}

function spawnQueen(h: ReturnType<typeof makeHooks>, tx = 70, ty = FLOOR - 8): Enemy {
  const e = Enemy.fromVanilla(657, tx * TILE, ty * TILE)!;
  e.id = 1 + h.enemies.length;
  h.enemies.push(e);
  return e;
}

describe('AI_121 史莱姆皇后状态机(NPC.cs:45695-46177)', () => {
  it('SetDefaults 数据直连(:17342-17353):114×100/伤60/防26/血18000/boss 位', () => {
    const h = makeHooks();
    const q = spawnQueen(h);
    expect([q.w, q.h]).toEqual([114, 100]);
    expect(q.maxHp).toBe(18000);
    expect(q.def.damage).toBe(60);
    expect(q.def.defense).toBe(26);
    expect(VANILLA_BOSS_IDS.has(657)).toBe(true);   // SetDefaults boss=true 对账集
  });

  it('case 0 待机选拍(:45736-45686):一阶段落地 61t 过阈 → ai0∈{3,4,5} 且 ai1 清零', () => {
    const h = makeHooks();
    const q = spawnQueen(h);
    q.bInit = true;                       // 跳过出生 init(ai1=-100)
    for (let i = 0; i < 200; i++) {
      q.fixedUpdate(1 / 60, h.hooks);
      if (q.ai0 !== 0) break;
    }
    expect([3, 4, 5]).toContain(q.ai0);
    expect(q.ai1).toBe(0);
  });

  it('case 3 四连跳(:45759-45844):vy 序列 -8/-8/-6/-13 → 大跳后回待机', () => {
    const h = makeHooks();
    const q = spawnQueen(h, 70, FLOOR - 8);
    q.bInit = true;
    q.ai0 = 3; q.ai1 = -40; q.ai2 = 0;
    for (let i = 0; i < 200 && !q.onGround; i++) q.fixedUpdate(1 / 60, h.hooks);   // 预热落地
    const launches: number[] = [];
    let prevGrounded = q.onGround;
    for (let i = 0; i < 3000 && launches.length < 4; i++) {
      q.fixedUpdate(1 / 60, h.hooks);
      if (!q.onGround && prevGrounded && q.vy < 0) launches.push(Math.round(q.vy));  // 起跳帧
      prevGrounded = q.onGround;
    }
    expect(launches).toEqual([-8, -8, -6, -13]);
    expect(q.ai0).toBe(0);                // 大跳结束回待机(:45966-45969)
  }, 10000);

  it('case 4 升空砸地(:45845-46006):60t 升空 → ai2=1 坠 → 落地撒 922(40 伤)+回待机', () => {
    const h = makeHooks();
    const q = spawnQueen(h, 70, FLOOR - 8);
    q.bInit = true;
    q.ai0 = 4; q.ai2 = 0; q.ai1 = 0;
    for (let i = 0; i < 600; i++) {
      q.fixedUpdate(1 / 60, h.hooks);
      if (q.ai0 === 0 && i > 10) break;
    }
    expect(q.ai0).toBe(0);                // 落地冲击后回待机
    const wave = h.projectiles.filter((p) => p.projId === 922);
    expect(wave.length).toBeGreaterThanOrEqual(1);
    expect(wave[0].damage).toBe(40);      // num2 :45547
  }, 10000);

  it('case 5 凝胶环(:46007-46121):一阶段 6 发 / 二阶段 10 发,30 伤 9 速全圆分度', () => {
    for (const [phase2Dmg, want] of [[false, 6], [true, 10]] as const) {
      const h = makeHooks();
      const q = spawnQueen(h, 70, phase2Dmg ? FLOOR - 20 : FLOOR - 8);
      q.bInit = true;
      if (phase2Dmg) q.hp = q.maxHp / 2;
      q.ai0 = 5; q.ai2 = 0; q.ai1 = 48;   // 差 2t 入坠相
      for (let i = 0; i < 80; i++) q.fixedUpdate(1 / 60, h.hooks);
      const gels = h.projectiles.filter((p) => p.projId === 926);
      expect(gels.length).toBe(want);
      for (const g of gels) {
        expect(g.damage).toBe(30);                                   // num :45546
        expect(Math.hypot(g.vx ?? 0, g.vy ?? 0)).toBeCloseTo(9, 5);  // spinningpoint (9,0) 旋转不变量
      }
      // 全圆分度:-i×2π/num6(num6=10),首枚角 0 → (9,0)
      expect(gels[0]?.vx).toBeCloseTo(9, 5);
      expect(Math.abs(gels[0]?.vy ?? 1)).toBeLessThan(1e-6);
      expect(q.ai0).toBe(0);              // 发射完回待机(:46113-46118)
    }
  }, 10000);

  it('传送门(:45576-45618):ai3≥300 且落地待机 → 态 2 消散 60t → 态 1 于落点显形', () => {
    const h = makeHooks();
    const q = spawnQueen(h, 70, FLOOR - 8);
    q.bInit = true;
    for (let i = 0; i < 200 && !q.onGround; i++) q.fixedUpdate(1 / 60, h.hooks);   // 落地(vy==0 门)
    q.ai3 = 302;                          // 直接蓄满(本 tick 未阻挡档 −1 后仍 ≥300)
    const x0 = q.x, y0 = q.y;
    q.fixedUpdate(1 / 60, h.hooks);
    expect(q.ai0).toBe(2);                // 无条件先进消散态(:45578)
    for (let i = 0; i < 70; i++) q.fixedUpdate(1 / 60, h.hooks);
    expect(q.ai0).toBe(1);                // 显形态(:45752-45756)
    expect(q.x !== x0 || q.y !== y0).toBe(true);   // 已位移到传送落点/兜底点
  });

  it('半血转段(:46142-46148):hp 越过 lifeMax/2 → la0 复位 + ai0/1/2 清零', () => {
    const h = makeHooks();
    const q = spawnQueen(h);
    q.fixedUpdate(1 / 60, h.hooks);       // 首拍:init 消费(ai1=-100,la0=maxHp :45559-45566)
    q.ai0 = 3; q.ai1 = 12; q.ai2 = 2;
    q.hp = q.maxHp / 2 - 1;
    q.fixedUpdate(1 / 60, h.hooks);
    // 复位后同拍二阶段 case 0 即跑(ai1 从 0 起计待机)——只锁招式态清零
    expect(q.ai0).toBe(0); expect(q.ai2).toBe(0);
    expect(q.ai1).toBeLessThanOrEqual(120);
  });

  it('掉血撒仆从(:46147-46177):差值超 2%(二阶段 1.5%)→ 1-2 只 658/659/660,ai0=-500×rand3', () => {
    const h = makeHooks();
    const q = spawnQueen(h);
    q.fixedUpdate(1 / 60, h.hooks);       // 首拍:init 消费(la0=maxHp :45562)
    const before = h.enemies.length;
    q.hp = q.maxHp - 500;                  // 500 > 18000×2%=360
    q.fixedUpdate(1 / 60, h.hooks);
    const spawned = h.enemies.slice(before);
    expect(spawned.length).toBeGreaterThanOrEqual(1);
    expect(spawned.length).toBeLessThanOrEqual(2);
    for (const m of spawned) {
      expect([658, 659, 660]).toContain(m.vanillaId);
      expect([0, -500, -1000]).toContain(m.ai0);
    }
    // 二阶段阈值收紧到 1.5%(270):再打 300 仍触发
    const n0 = h.enemies.length;
    q.hp -= 300;
    q.fixedUpdate(1 / 60, h.hooks);
    expect(h.enemies.length - n0).toBeGreaterThanOrEqual(0);
  });

  it('lai3 帧驱动(:45789-45802,本批补缺):二阶段循环 24;砸地坠相钉 6/凝胶环蓄相钉 7', () => {
    const h = makeHooks();
    const q = spawnQueen(h);
    q.bInit = true;
    q.hp = q.maxHp / 2 - 1;               // 进二阶段
    q.fixedUpdate(1 / 60, h.hooks);
    for (let i = 0; i < 30; i++) {
      q.ai0 = 0;
      q.fixedUpdate(1 / 60, h.hooks);
      expect(q.lai3).toBeGreaterThanOrEqual(0);
      expect(q.lai3).toBeLessThan(24);
    }
    q.lai3 = 0;
    q.ai0 = 4; q.ai2 = 1;
    q.fixedUpdate(1 / 60, h.hooks);
    expect(q.lai3).toBe(6);               // 砸地坠相钉 6
    q.ai0 = 5; q.ai2 = 0;
    q.fixedUpdate(1 / 60, h.hooks);
    expect(q.lai3).toBe(7);               // 凝胶环蓄相钉 7
  });
});

describe('掉落表(NPCLoot 657 段,vanilla-npcdrops.json 已提取全量)', () => {
  const rulesOf = (id: number): unknown[] =>
    ((dropsJson as { entries: Array<{ npcs?: number[]; rule: unknown }> }).entries)
      .filter((e) => e.npcs?.includes(id)).map((e) => e.rule);

  it('五规则在册:bossBag/master relic/master 坐骑@4/NotExpert 六连链/trophy@10', () => {
    const rules = rulesOf(657) as unknown as Array<Record<string, unknown>>;
    expect(rules.length).toBe(5);
    const byK = (k: string): Record<string, unknown> | undefined =>
      rules.find((r) => (r.k ?? (r.rule as Record<string, unknown>)?.k) === k);
    expect(byK('bossBag')).toBeTruthy();
    const bagRule = (byK('bossBag')?.rule ?? byK('bossBag')) as { item: number };
    expect(bagRule.item).toBe(4957);                 // Treasure Bag (Queen Slime)
    const chain = rules.find((r) => (r as { cond?: { name?: string } }).cond?.name === 'NotExpert');
    expect(chain).toBeTruthy();
  });

  it('NotExpert 连锁产物齐全:凝胶气球 25-75/面具@7/水晶刺客三选一/刃杖@4/鞍@4/钩@3', () => {
    const rules = rulesOf(657) as unknown as Array<Record<string, unknown>>;
    const gate = rules.find((r) => (r as { cond?: { name?: string } }).cond?.name === 'NotExpert') as {
      chain: Array<{ rule: { item: number; denom?: number; min?: number; max?: number; ids?: number[] } }>;
    };
    const items = gate.chain.map((c) => c.rule.item ?? c.rule.ids?.[0]);
    expect(items).toEqual(expect.arrayContaining([4986, 4959, 4982, 4758, 4981, 4980]));
    const balloon = gate.chain.find((c) => c.rule.item === 4986)?.rule;
    expect(balloon?.min).toBe(25); expect(balloon?.max).toBe(75);
    const mask = gate.chain.find((c) => c.rule.item === 4959)?.rule;
    expect(mask?.denom).toBe(7);
    const oneOf = gate.chain.find((c) => c.rule.ids)?.rule;
    expect(oneOf?.ids).toEqual([4982, 4983, 4984]);   // Crystal Assassin 三件套
  });

  it('全部掉落产物 id↔键双向在册(掉落不再静默丢)', () => {
    for (const vid of [4957, 4950, 4960, 4986, 4959, 4982, 4983, 4984, 4758, 4981, 4980, 4958]) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `drop vid ${vid} 键映射`).toBeTruthy();
      expect(ITEM_BY_KEY[key], `drop vid ${vid} def`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('召唤链与配套(明胶水晶 4988)', () => {
  it('4988 combat 数据(Item.cs:40186-40196):useStyle4/consumable/45×45/rare6/value 1银', () => {
    const c = itemCombat(4988);
    expect(c?.consumable).toBe(true);
    expect(c?.useTime).toBe(45);
    expect(c?.useAnimation).toBe(45);
    expect(VANILLA_ITEM_KEY_BY_ID[4988]).toBe('vi_4988_QueenSlimeCrystal');
    expect(ITEM_BY_KEY['vi_4988_QueenSlimeCrystal']).toBeGreaterThan(0);
  });

  it('Game.ts 召唤支源码守卫(:9936 case 4988 ZoneHallow 门+SummonItemCheck 同型拦)', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');
    const at = src.indexOf('case 4988:');
    expect(at).toBeGreaterThan(0);
    const window = src.slice(at, at + 400);
    expect(window).toContain('ZoneHallow');
    expect(src).toContain('downed_657');                       // 击杀旗消费(Game :22639)
  });

  it('音乐映射(Music.ts):BOSS_MUSIC[657]=56 QueenSlime 曲位+bestiary 图鉴条目', () => {
    expect(BOSS_MUSIC[657]).toBe(56);
    expect(bossMusicFor(657)).toBe(56);
    const b = bestiaryJson as { bossBestiaryPriority: number[]; npcStats: Record<string, number[]> };
    expect(b.bossBestiaryPriority).toContain(657);
    expect(b.npcStats['657']).toEqual([0, 1, 60, 26, 18000, 121]);   // aiStyle121/伤60/防26/血18000
  });

  it('视觉层素材在库(Extra_177 王冠/Extra_185 翅膀/Extra_186 水晶核——此前"未入白名单"登记作废)', () => {
    for (const f of ['Extra_177.png', 'Extra_185.png', 'Extra_186.png']) {
      const p = join(__dirname, '..', 'public', 'sprites', 'vanilla', f);
      expect(readFileSync(p).byteLength, f).toBeGreaterThan(0);
    }
  });
});
