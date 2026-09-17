// BJ112-a 光女（636）生成链判别力批（原版权威=1457，1458 两段逐字同文对拍通过）：
//  ① 661 帝皇蝶刷怪条件门 2×2（夜/昼 × 神圣/非神圣）——NPC.cs:4039-4043：
//    (hard && underGround〔L1144 = spawnTileY<=rockLayer，含地表〕|| remix·1/2)
//    && !waterTile && 神圣 tile{116 珍珠沙/117 珍珠岩/109 神圣草/164 粉冰}
//    && downedPlantBoss && (remix || (!dayTime && Main.time<16200 = 夜前半 19:30-24:00))
//    && surfaceSpawn && RollLuck(10) && !AnyNPCs(661)
//  ② 661 死亡 → 636 原位生成链（DoDeathEvents case 661，NPC.cs:80309-80319）：
//    GetWereThereAnyInteractions（:80640 playerInteraction 位——玩家曾碰过即算,
//    死因不限直接击杀）+ !AnyNPCs(636) + 出生点 = 蝶 Center+(0,−200)+
//    NextVector2Circular(50,50)（Utils.cs:1301-1303 = 均匀角×线性半径,非方抖）
//    → SpawnBoss → NewNPC Bottom 脚底锚（NPC.cs:81594 Bottom=(X,Y) →
//    position=(X−w/2, Y−h)）——★BJ112-a 半盒勘误：曾走 ctor 盒心式 y=py−h/2,
//    光女比原版低 50px（半盒）出场；同族先例 spawnMoonLordOnPlayer（BJ110-a）。
//    timeLeft = activeTime×20（SpawnBoss :81485→本仓 despawnTimer 15000 家族口径）。
//  ③ 昼杀语义：死亡链原文【无昼夜门】——白天杀照样生成 636（暴怒由 AI_120 侧
//    latch :46471-46472 ai3+=2 承担,bossAI_lategame empressOfLightAI 已有覆盖）。
//  ④ 671/672 勘误钉：1457 NPCID.cs 671=ScarletMacaw/672=BlueMacaw（1.4.4 金刚鹦鹉族）,
//    召唤蝶=661 EmpressButterfly（1.4.4 起由 Prismatic Lacewing 改名换位）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { Enemy } from '../src/entities/Enemy';
import { Game } from '../src/core/Game';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY } from '../src/data/tiles';
import { NPC_NAME_BY_ID as NPCID } from '../src/i18n/idNames.generated';
import { Achievements } from '../src/core/Achievements';

afterEach(() => vi.restoreAllMocks());

const HALLOW_GRASS = TILE_BY_KEY['v_109_hallowed_grass_block'];
const GRASS = TILE_BY_KEY['grass'] ?? TILE_BY_KEY['dirt'];

function chainWorld(remix = false): World {
  const w = new World(1300, 600, 42, 'bj112a');
  w.groundLevel = 100;
  w.rockLevel = 200;
  w.flags.hardMode = true;
  w.flags['downed_262'] = true;      // downedPlantBoss（世纪之花）
  if (remix) w.seedFlags = { remix: true } as typeof w.seedFlags;
  const st = w.store;
  // 地表 y=100：普通草平台 [400,600) ∪ 空档 [600,700) ∪ 神圣草平台 [700,900)。
  // ★平台间距 > 2×扫描半径（findSpawnTile 实测 ±62 tile > viewHalfW 48）——
  //  曾共带布置,草测扫描窗吸入神圣列=假红
  for (let x = 400; x < 600; x++) st.setTileSilent(x, 100, GRASS);
  for (let x = 700; x < 900; x++) st.setTileSilent(x, 100, HALLOW_GRASS);
  return w;
}

function rollMany(w: World, tileX: number, night: boolean, n: number): Record<number, number> {
  const sp = new VanillaSpawner(w);
  sp.setPlayerFlags(false, false);
  // 昼夜经 clock（spawn() 内以 clock.isDay 覆写 dayTime）:0.95=22:48 夜前半,0.5=正午
  w.clock.timeOfDay = night ? 0.95 : 0.5;
  const counts: Record<number, number> = {};
  for (let k = 0; k < n; k++) {
    const rng = new RNG(k * 7919 + 13);
    const r = sp.spawn(tileX * 16 + 8, 96 * 16, rng, 48, 27);
    if (r) {
      const v = (r as unknown as { vanillaId: number }).vanillaId;
      counts[v] = (counts[v] ?? 0) + 1;
    }
  }
  return counts;
}

function killGame(): { g: Game; enemies: unknown[]; chats: string[] } {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const w = new World(120, 120, 6, 'bj112a-kill');
  // onEnemyKilled 消费面：bestiary（registerKill/completion）/ bannerKills（World 自带）
  (w as unknown as Record<string, unknown>).bestiary = {
    registerKill: () => 1,
    completion: () => ({ percent: 0 }),
  };
  g.world = w;
  const enemies: unknown[] = [];
  g.entities = {
    enemies,
    npcs: [],
    projectiles: [],
    nextId: 1,
    add: (e: unknown) => enemies.push(e),
  };
  g.achievements = new Achievements(null);
  g.player = { lastCreatureHit: -1, maxHp: 100, maxMana: 20 };
  g.boss = null;
  g.net = null;
  const chats: string[] = [];
  g.cb = { onChat: (t: string) => chats.push(t), onToast: (t: string) => chats.push(t) };
  return { g: g as unknown as Game, enemies, chats };
}

const kill = (g: Game, e: Enemy) =>
  (g as unknown as { onEnemyKilled(key: string, enemy: Enemy): void }).onEnemyKilled(
    `v_${e.vanillaId}`, e,
  );

describe('BJ112-a ① 661 刷怪条件门 2×2（NPC.cs:4039-4043）', () => {
  it('夜 × 神圣草落脚 → 帝皇蝶 661 出（RollLuck(10)≈9.5%/掷）', () => {
    const w = chainWorld();
    const c = rollMany(w, 800, true, 700);
    expect(c[661] ?? 0).toBeGreaterThan(15);
  });

  it('昼 × 神圣 → 0（夜前半门;remix 豁免支另一测）', () => {
    const w = chainWorld();
    const c = rollMany(w, 800, false, 700);
    expect(c[661] ?? 0).toBe(0);
  });

  it('夜 × 非神圣（普通草）→ 0（神圣 tile 门）', () => {
    const w = chainWorld();
    const c = rollMany(w, 500, true, 700);
    expect(c[661] ?? 0).toBe(0);
  });

  it('昼 × 非神圣 → 0（2×2 补全）', () => {
    const w = chainWorld();
    const c = rollMany(w, 500, false, 400);
    expect(c[661] ?? 0).toBe(0);
  });

  it('remix 世界昼 × 神圣 → 仍可出（:4041 remix 豁免夜门或支,+外层 1/2 掷）', () => {
    const w = chainWorld(true);
    const c = rollMany(w, 800, false, 900);
    expect(c[661] ?? 0).toBeGreaterThan(8);
  });

  it('唯一门：场上已有 661 → 不再出（!AnyNPCs(661)）', () => {
    const w = chainWorld();
    const sp = new VanillaSpawner(w);
    sp.setPlayerFlags(false, false, false, new Set([661]));
    w.clock.timeOfDay = 0.95;
    let n = 0;
    for (let k = 0; k < 400; k++) {
      const r = sp.spawn(800 * 16 + 8, 96 * 16, new RNG(k * 31 + 7), 48, 27);
      if ((r as unknown as { vanillaId: number } | null)?.vanillaId === 661) n++;
    }
    expect(n).toBe(0);
  });
});

describe('BJ112-a ② 661 死亡 → 636 生成链（NPC.cs:80309-80319）', () => {
  it('玩家交互致死 → 原位上方生成 636（Bottom 锚:脚底=蝶Center−200±圆抖50）', () => {
    const { g, enemies } = killGame();
    const bfly = Enemy.fromVanilla(661, 100 * 16, 80 * 16)!;
    bfly.playerInteracted = true;
    // 常值 0.5 stub：ja=π、jr=0.5 → 抖动=(−25,≈0)；任何前置随机消费不位移本块两掷
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    kill(g, bfly);
    rnd.mockRestore();
    const spawned = enemies.filter(
      (e) => (e as Enemy).vanillaId === 636,
    ) as Enemy[];
    expect(spawned).toHaveLength(1);
    const eol = spawned[0];
    // Bottom 锚（NPC.cs:81594）：position=(X−w/2, Y−h) → 底边=py、盒心 x=px
    expect(eol.y + eol.h).toBeCloseTo(bfly.cy - 200, 6);   // ★旧盒心式=cy−150（变异红）
    expect(eol.x + eol.w / 2).toBeCloseTo(bfly.cx - 25, 6);
    expect(eol.despawnTimer).toBe(18740);                   // SpawnBoss:timeLeft=(int)(750×1.25)=937 ×20（NPC.cs:81596+:81485,2026-09-17 清债⑤）
    expect((g as unknown as { boss: Enemy | null }).boss?.vanillaId).toBe(636);
  });

  it('昼杀语义：死亡链无昼夜门——白天杀照样生成（暴怒归 AI_120 latch 承担）', () => {
    const { g, enemies } = killGame();
    (g.world as World).clock.timeOfDay = 0.5;   // 正午
    const bfly = Enemy.fromVanilla(661, 100 * 16, 80 * 16)!;
    bfly.playerInteracted = true;
    kill(g, bfly);
    expect(enemies.some((e) => (e as Enemy).vanillaId === 636)).toBe(true);
  });

  it('无玩家交互死亡 → 不生成（GetWereThereAnyInteractions 门）', () => {
    const { g, enemies } = killGame();
    const bfly = Enemy.fromVanilla(661, 100 * 16, 80 * 16)!;
    bfly.playerInteracted = false;
    kill(g, bfly);
    expect(enemies.some((e) => (e as Enemy).vanillaId === 636)).toBe(false);
  });

  it('场上已有 636 → 不再生成（!AnyNPCs(636) 独占门）', () => {
    const { g, enemies } = killGame();
    const existing = Enemy.fromVanilla(636, 50 * 16, 40 * 16)!;
    enemies.push(existing);
    const bfly = Enemy.fromVanilla(661, 100 * 16, 80 * 16)!;
    bfly.playerInteracted = true;
    kill(g, bfly);
    expect(enemies.filter((e) => (e as Enemy).vanillaId === 636)).toHaveLength(1);
  });

  it('抖动分布 = 圆盘（均匀角×线性半径）非方抖：多次击杀抖动半径恒 ≤50', () => {
    const bflyCy = 80 * 16 + 5;
    for (let k = 0; k < 40; k++) {
      const { g, enemies } = killGame();
      const bfly = Enemy.fromVanilla(661, 100 * 16, bflyCy)!;
      bfly.playerInteracted = true;
      kill(g, bfly);
      const eol = enemies.find((e) => (e as Enemy).vanillaId === 636) as Enemy;
      const jx = eol.x + eol.w / 2 - bfly.cx;
      const jy = eol.y + eol.h - (bfly.cy - 200);
      expect(Math.hypot(jx, jy)).toBeLessThanOrEqual(50 + 1e-6); // 方抖 21.5% 掷越界→变异红
      enemies.length = 0;   // 清场让 !AnyNPCs(636) 门重开
    }
  });
});

describe('BJ112-a ④ 671/672 勘误钉（1457 NPCID.cs:12409-12413）', () => {
  it('671=ScarletMacaw / 672=BlueMacaw——虹光蛾(帝皇蝶)=661,非 672', () => {
    expect(NPCID[671]).toBe('ScarletMacaw');
    expect(NPCID[672]).toBe('BlueMacaw');
    expect(NPCID[661]).toBe('EmpressButterfly');
    expect(NPCID[636]).toBe('HallowBoss');
  });
});
