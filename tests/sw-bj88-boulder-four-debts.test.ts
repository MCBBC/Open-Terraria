// ★SW-BJ88（2026-09-15）弹幕域四债守卫（全部 1457 锚 1:1;1458 同域逐字对拍
//  2026-09-15 diff 零差：1013 支 1458 :19130 / FindClosest :4934 / CutTilesAt
//  :15355 / TreatedAsABoss :6869 / NPCID 集 :4873 / localAI0++ :26366）。
//
// 四债与金标锚：
//   债1 1013 专属分段弹支  P.cs:19129-19191（分段弹回系数表 + flag16 钟摆门
//                          :19159 localAI[0]>=500 + HitTiles/PlaySound(0) :19177-
//                          19182 + 静止杀 :19183-19186 + >20 弹 Kill :19187-19190;
//                          拍龄钟 :26365-26368 1013/1048 每 tick localAI[0]++）
//   债2 boss 命中即碎      P.cs:14336-14340（Damage_PVE_Inner,StrikeNPC :13702 后;
//                          TreatedAsABoss=NPC.cs:6868-6878 boss ∨ NPCID.cs:4873
//                          38 元素集;keepIterating=false → 停止遍历后续敌怪）
//   债3 GetAreas 曼哈顿    Player.cs:4933-4957 Player.FindClosest（|Δx|+|Δy|;
//                          首候选 num==-1f 哨兵收编 + 严格 < 替换）
//   债4① rotation 时序     P.cs:26679-26682 AI 段内=本拍加速/重力/碰撞之前
//   债4② cutTilesBox 边界  P.cs:15356-15359+:15377/:15379 +1=循环排除界
//
// 变异证红（每债至少一线）：1013 支摘除（落回家族①②）→ 债1-R1/R2 红 / >20 门
// 摘除 → 债1-5 红 / flag16 摘除 → 债1-3 红 / 静止杀摘除 → 债1-4 红 / boss 接线
// 摘除 → 债2-1 红 / 曼哈顿回退欧氏 → 债3-1 红 / cutTilesBox 回退 <= → 债4-1 红 /
// rotation 回移碰撞后 → 债4-5/6 红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RollingBoulder, treatedAsABossForRainbowBoulders, RAINBOW_BOULDER_BOSS_IDS }
  from '../src/entities/RollingBoulder';
import { cutTilesBox } from '../src/entities/ProjCutTiles';
import { TILE_DEFS } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

// ================= 夹具（BJ67 fakeStore/fakeGame 同构 + 候选玩家/受击账扩展） =================

const SOLID_ID = TILE_DEFS.findIndex((d) => d && d.solid && !d.platform);

function fakeStore(w = 64, h = 64, placed?: Map<number, number>) {
  const cells = placed ?? new Map<number, number>();
  return {
    w, h,
    type: new Uint8Array(w * h),
    flags: new Uint8Array(w * h),
    slope: new Uint8Array(w * h),
    half: new Uint8Array(w * h),
    liquid: new Float32Array(w * h),
    liquidType: new Float32Array(w * h),
    idx: (x: number, y: number) => y * w + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    isSolid: (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const id = cells.get(y * w + x);
      return !!id && !!TILE_DEFS[id]?.solid && !TILE_DEFS[id]?.platform;
    },
    isPlatform: () => false,
    isActive: (x: number, y: number) => cells.has(y * w + x),
    hasTile: (x: number, y: number) => cells.has(y * w + x),
    isActuated: () => false,
    get: (x: number, y: number) => cells.get(y * w + x) ?? 0,
  };
}
type Store = ReturnType<typeof fakeStore>;

interface EnemyStub {
  id: number; dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
  vanillaId?: number | null; boss?: boolean; def?: { boss?: boolean };
  x: number; y: number; w: number; h: number; cx: number; cy: number;
  hurt?: (dmg: number, kbx: number, kby: number, game: unknown) => boolean | void;
}

function fakeGame(store: Store, opts?: {
  player?: Record<string, unknown>;
  enemies?: EnemyStub[];
  projectiles?: unknown[];
  candidates?: Array<Record<string, unknown>>;
}) {
  const dusts: Array<{ x: number; y: number; type: number; alpha: number; scale: number; color: unknown; dust: Record<string, unknown> }> = [];
  const particles: Array<{ x: number; y: number; color: string; count: number }> = [];
  const sfx: Array<{ name: string; x?: number; y?: number }> = [];
  const cutCalls: Array<{ x: number; y: number; vid?: number }> = [];
  const broadcasts: Array<{ type: number; x: number; y: number }> = [];
  const clones: number[] = [];
  const player = opts?.player ?? { dead: true, x: 99999, y: 99999, w: 20, h: 42, cx: 100009, cy: 100020, vx: 0, vy: 0, facing: 1 };
  const g = {
    world: { store, w: store.w, h: store.h },
    player,
    candidatePlayers: () => opts?.candidates ?? [player],
    enemies: () => opts?.enemies ?? [],
    critters: () => [],
    npcs: () => [],
    projectiles: () => opts?.projectiles ?? [],
    spawnParticles: (x: number, y: number, color: string, count: number) => {
      particles.push({ x, y, color, count });
    },
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      _sx = 0, _sy = 0, alpha = 0, color: unknown = null, scale = 1, noGravity = false) => {
      const dust: Record<string, unknown> = { x: x + 2, y: y + 3, vx: 0.7, vy: -0.2, scale, fadeIn: 0, noGravity, color: null };
      dusts.push({ x, y, type, alpha, scale, color, dust });
      return dust;
    },
    vanillaDust: {
      clone: (d: Record<string, unknown>) => {
        clones.push(d.type as number);
        return { ...d };
      },
    },
    playSfx: (name: string) => { sfx.push({ name }); },
    playSfxWav: (name: string, _vol?: number, x?: number, y?: number) => { sfx.push({ name, x, y }); },
    damagePlayer: () => 0,
    addLightAt: () => {},
    cutTile: (x: number, y: number, vid?: number) => { cutCalls.push({ x, y, vid }); },
    broadcastParticleOrchestra: (type: number, x: number, y: number) => {
      broadcasts.push({ type, x, y });
    },
    dusts, particles, sfx, cutCalls, broadcasts, clones,
  };
  return g as unknown as GameHooks & typeof g;
}

const mkBoulder = (sheet = 711): RollingBoulder => new RollingBoulder(104, 104, sheet);   // 711 → 1047;664 → 1013

/** 竖墙：tile 列 col、行 rows..rows+n（债1/债4① 撞墙夹具——墙高于弹盒高,无 StepUp 支） */
function wallCells(w: number, col: number, rows: number, n: number): Map<number, number> {
  const cells = new Map<number, number>();
  for (let r = rows; r < rows + n; r++) cells.set(r * w + col, SOLID_ID);
  return cells;
}

// ================= 债1：1013 专属分段弹支（P.cs:19129-19191） =================
describe('SW-BJ88 债1 1013 分段弹支（P.cs:19129-19191）', () => {
  it('债1-1 弹回系数分段直译（:19133-19158）：<0.5→0.1 / <0.75→0.25 / <1→0.5 / ≥1→0.95', () => {
    const cases: Array<[number, number]> = [
      [0.3, 0.1], [0.6, 0.25], [0.8, 0.5], [2, 0.95],
    ];
    for (const [lastVX, factor] of cases) {
      const game = fakeGame(fakeStore());
      const b = mkBoulder(664);                    // sheet 664 → projId 1013
      b.vy = 0;
      (b as unknown as { rb1013Bounce: (lx: number, ly: number, g: GameHooks) => void })
        .rb1013Bounce(lastVX, 0, game);
      expect(b.vx).toBeCloseTo(-lastVX * factor, 6);
      expect(b.dead).toBe(false);                  // 撞墙不碎（家族② Kill=债病灶）
      expect(b.localAI1).toBe(0);                  // 低速（<5）且拍龄<500 → flag17=false
    }
  });

  it('债1-2 高速弹 flag17 门（:19163/:19171）：|lastV|>5 → localAI1++ + HitTiles 近似尘 + dig 声', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(664);
    (b as unknown as { rb1013Bounce: (lx: number, ly: number, g: GameHooks) => void })
      .rb1013Bounce(7, 0, game);
    expect(b.vx).toBeCloseTo(-6.65, 6);            // -7 × 0.95
    expect(b.localAI1).toBe(1);                    // :19179
    expect(game.sfx.some((s) => s.name === 'dig')).toBe(true);   // PlaySound(0) 近似
    expect(game.particles.length).toBeGreaterThan(0);            // HitTiles 近似
  });

  it('债1-3 flag16 钟摆门（:19159 localAI[0]>=500）：500t 后低速碰撞也计硬弹（摘除变异体红）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(664);
    (b as unknown as { localAI0: number }).localAI0 = 500;
    (b as unknown as { rb1013Bounce: (lx: number, ly: number, g: GameHooks) => void })
      .rb1013Bounce(0.3, 0, game);
    expect(b.localAI1).toBe(1);                    // flag16 → flag17（虽 |0.3|<5）
    expect(game.sfx.some((s) => s.name === 'dig')).toBe(true);
    // 反例：499t 低速不计
    const game2 = fakeGame(fakeStore());
    const b2 = mkBoulder(664);
    (b2 as unknown as { localAI0: number }).localAI0 = 499;
    (b2 as unknown as { rb1013Bounce: (lx: number, ly: number, g: GameHooks) => void })
      .rb1013Bounce(0.3, 0, game2);
    expect(b2.localAI1).toBe(0);
    expect(game2.sfx.length).toBe(0);
  });

  it('债1-4 静止杀（:19183-19186 Length<0.1 ∧ localAI[0]>50）：51 杀 / 50 不杀（摘除变异体红）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(664);
    b.vx = 0; b.vy = 0.05;
    (b as unknown as { localAI0: number }).localAI0 = 51;
    (b as unknown as { rb1013Bounce: (lx: number, ly: number, g: GameHooks) => void })
      .rb1013Bounce(0, 0, game);                   // 落定态：碰撞把 vy 清 0
    expect(b.dead).toBe(true);
    const game2 = fakeGame(fakeStore());
    const b2 = mkBoulder(664);
    b2.vx = 0; b2.vy = 0.05;
    (b2 as unknown as { localAI0: number }).localAI0 = 50;
    (b2 as unknown as { rb1013Bounce: (lx: number, ly: number, g: GameHooks) => void })
      .rb1013Bounce(0, 0, game2);
    expect(b2.dead).toBe(false);                  // 边界 >50 恰不触发
  });

  it('债1-5 >20 弹 Kill 门（:19187-19190）：21 杀 / 20 不杀（摘除变异体红）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(664);
    b.vx = 0.5; b.vy = 0;                          // 非静止（0.5>0.1）→ 仅弹满门可达
    (b as unknown as { localAI1: number }).localAI1 = 21;
    (b as unknown as { rb1013Bounce: (lx: number, ly: number, g: GameHooks) => void })
      .rb1013Bounce(0.5, 0, game);
    expect(b.dead).toBe(true);
    const game2 = fakeGame(fakeStore());
    const b2 = mkBoulder(664);
    b2.vx = 0.5; b2.vy = 0;
    (b2 as unknown as { localAI1: number }).localAI1 = 20;
    (b2 as unknown as { rb1013Bounce: (lx: number, ly: number, g: GameHooks) => void })
      .rb1013Bounce(0.5, 0, game2);
    expect(b2.dead).toBe(false);                  // 边界 >20 恰不触发
  });

  it('债1-6 路由·落地弹 0.95 非 0.2（fixedUpdate 全链;家族①0.2 档对 1013 不适用）', () => {
    // 地板 row 9（[144,160)）,弹盒 104..135 → 落 10.3px 触地
    const cells = new Map<number, number>();
    for (let cx2 = 6; cx2 <= 8; cx2++) cells.set(9 * 64 + cx2, SOLID_ID);
    const game = fakeGame(fakeStore(64, 64, cells));
    const b = mkBoulder(664);
    b.vy = 10;
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(false);                    // 家族②在此不适用（落地非碎面）
    expect(b.vy).toBeCloseTo(-10.3 * 0.95, 6);     // -9.785（家族①会给 -2.06=变异红）
    expect(b.localAI1).toBe(1);                    // |lastVy|>5 → flag17
    expect(game.sfx.some((s) => s.name === 'dig')).toBe(true);
  });

  it('债1-7 路由·撞墙不碎（fixedUpdate 全链;旧家族②支此处 dead=true=债本体）', () => {
    const game = fakeGame(fakeStore(64, 64, wallCells(64, 9, 4, 7)));
    const b = new RollingBoulder(112, 104, 664);   // 盒 112..143,墙列 9=[144,160)
    b.vx = 7; b.vy = 0;
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(false);
    expect(b.vx).toBeCloseTo(-6.65, 6);            // 0.95 弹回（非 Kill）
    expect(b.localAI1).toBe(1);
  });

  it('债1-8 拍龄钟（:26365-26368 逐字）：1013/1048 每 tick ++,1047 不 increment', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(664);
    for (let t = 0; t < 3; t++) b.fixedUpdate(1 / 60, game);
    expect((b as unknown as { localAI0: number }).localAI0).toBe(3);
    const b48 = mkBoulder(712);                    // sheet 712 → 1048（只写面）
    for (let t = 0; t < 3; t++) b48.fixedUpdate(1 / 60, game);
    expect((b48 as unknown as { localAI0: number }).localAI0).toBe(3);
    const b47 = mkBoulder();
    for (let t = 0; t < 3; t++) b47.fixedUpdate(1 / 60, game);
    expect((b47 as unknown as { localAI0: number }).localAI0).toBe(0);
  });

  it('债1-9 结构锁：1013 分支在家族 else 之前 + localAI0 增量门 + 双 Kill 门表达式', () => {
    const src = readFileSync(join(__dirname, '../src/entities/RollingBoulder.ts'), 'utf8');
    const i1013 = src.indexOf('} else if (this.projId === 1013) {');
    const iFamily = src.indexOf('if (this.vx !== lastVX) {\n        if (this.projId !== 1055)');
    expect(i1013).toBeGreaterThan(0);
    expect(iFamily).toBeGreaterThan(i1013);        // 1013 支截在家族 ② 支之前
    expect(src).toMatch(/if \(this\.projId === 1013 \|\| this\.projId === 1048\) this\.localAI0\+\+/);
    expect(src).toMatch(/Math\.hypot\(this\.vx, this\.vy\) < 0\.1 && this\.localAI0 > 50/);
    expect(src).toMatch(/if \(this\.localAI1 > 20\) this\.rbKill\(game\);/);
    expect(src).toMatch(/const flag16 = this\.localAI0 >= 500;/);
  });
});

// ================= 债2：boss 命中即碎（P.cs:14336-14340） =================
describe('SW-BJ88 债2 TreatedAsABossForRainbowBoulders 接线（P.cs:14336-14340）', () => {
  const mkEnemy = (over: Partial<EnemyStub>): EnemyStub => ({
    id: 1, dead: false, x: 100, y: 100, w: 40, h: 40, cx: 120, cy: 120, ...over,
  });

  it('债2-1 1047 命中 boss → 先结算伤害再 Kill+彩虹爆,且停止遍历（keepIterating=false）', () => {
    const hurts: number[] = [];
    const boss = mkEnemy({
      vanillaId: 50, boss: true,                   // 史莱姆王（SetDefaults boss=true）
      hurt: () => { hurts.push(1); },
    });
    const minion = mkEnemy({                       // 与弹盒交叠的第二敌怪（槽序在后）
      id: 2, vanillaId: 3, hurt: () => { hurts.push(2); },
    });
    const game = fakeGame(fakeStore(), { enemies: [boss, minion] });
    const b = mkBoulder();                         // 1047 盒 104..135,敌盒 100..140 交叠
    b.fixedUpdate(1 / 60, game);
    expect(hurts).toEqual([1]);                    // StrikeNPC 先行（:13702）+ 不再遍历
    expect(b.dead).toBe(true);                     // :14338 Kill()
    expect(game.dusts.filter((d) => d.type === 66).length).toBe(14);   // Kill→D2 爆段
    expect(game.sfx.some((s) => s.name === 'rainbow_boulder')).toBe(true);
  });

  it('债2-2 非 boss 非集合敌怪：只伤不杀（接线摘除变异体红）', () => {
    const hurts: number[] = [];
    const zombie = mkEnemy({ id: 5, vanillaId: 3, hurt: () => { hurts.push(5); } });
    const game = fakeGame(fakeStore(), { enemies: [zombie] });
    const b = mkBoulder();
    b.fixedUpdate(1 / 60, game);
    expect(hurts).toEqual([5]);
    expect(b.dead).toBe(false);
    expect(game.dusts.filter((d) => d.type === 66).length).toBe(0);
  });

  it('债2-3 集合成员（无 boss 位）计入：毁灭者体节 135 / 哀木 325 → Kill', () => {
    for (const vid of [135, 325]) {
      const game = fakeGame(fakeStore(), {
        enemies: [mkEnemy({ vanillaId: vid })],
      });
      const b = mkBoulder();
      b.fixedUpdate(1 / 60, game);
      expect(b.dead).toBe(true);
    }
  });

  it('债2-4 boss 位双落点：实例 boss / def.boss 任一为真即计入（MinionProj.ts:4653 同口径）', () => {
    const game = fakeGame(fakeStore(), { enemies: [mkEnemy({ boss: true })] });
    const b = mkBoulder();
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(true);
    const game2 = fakeGame(fakeStore(), { enemies: [mkEnemy({ def: { boss: true } })] });
    const b2 = mkBoulder();
    b2.fixedUpdate(1 / 60, game2);
    expect(b2.dead).toBe(true);
  });

  it('债2-5 谓词直译（NPC.cs:6868-6878）：boss 短路优先;集合 38 元素;null 型不入', () => {
    expect(treatedAsABossForRainbowBoulders(3, true)).toBe(true);      // boss 短路
    expect(treatedAsABossForRainbowBoulders(null, false)).toBe(false);
    expect(treatedAsABossForRainbowBoulders(undefined, false)).toBe(false);
    expect(treatedAsABossForRainbowBoulders(3, false)).toBe(false);
    expect(treatedAsABossForRainbowBoulders(517, false)).toBe(true);   // 集合首元
    expect(treatedAsABossForRainbowBoulders(346, false)).toBe(true);   // 集合尾元
    expect(treatedAsABossForRainbowBoulders(13, false)).toBe(true);    // 世吞三段
    expect(RAINBOW_BOULDER_BOSS_IDS.size).toBe(38);
    // 集合直抄面：与 1457 NPCID.cs:4873 字面逐值（变异=增删元素即红）
    const vanilla = [517, 422, 507, 493, 13, 14, 15, 267, 36, 114, 664, 134, 135, 136,
      128, 129, 130, 131, 245, 247, 248, 246, 491, 492, 392, 395, 394, 393, 564, 565,
      576, 577, 551, 325, 327, 344, 345, 346];
    for (const id of vanilla) expect(RAINBOW_BOULDER_BOSS_IDS.has(id)).toBe(true);
  });

  it('债2-6 结构锁：敌怪环内 hurt 后接线 + break（P.cs:14336 锚注）', () => {
    const src = readFileSync(join(__dirname, '../src/entities/RollingBoulder.ts'), 'utf8');
    expect(src).toMatch(/1047 命中 TreatedAsABossForRainbowBoulders →/);
    expect(src).toMatch(/&& treatedAsABossForRainbowBoulders\(e\.vanillaId,/);
    expect(src).toMatch(/this\.rbKill\(game\);\s*\n\s*break;/);
  });
});

// ================= 债3：GetAreas 曼哈顿（Player.cs:4933-4957） =================
describe('SW-BJ88 债3 rbGetAreas 曼哈顿对齐（Player.cs:4933-4957）', () => {
  // 弹心 (119.5,119.5)。A=(269.5,269.5)：曼哈顿 300 / 欧氏 212.1;
  // B=(409.5,119.5)：曼哈顿 290 / 欧氏 290 —— 两度量选人相反,判别面。
  const A = { dead: false, x: 259.5, y: 248.5, w: 20, h: 42, cx: 269.5, cy: 269.5 };
  const B = { dead: false, x: 399.5, y: 98.5, w: 20, h: 42, cx: 409.5, cy: 119.5 };

  it('债3-1 最近玩家按曼哈顿选 B（欧氏会选 A=变异体红）', () => {
    const game = fakeGame(fakeStore(), { candidates: [A, B] });
    const b = mkBoulder();
    const areas = (b as unknown as { rbGetAreas: (g: GameHooks) => { closest: unknown; playArea: { x: number; y: number; w: number; h: number } } })
      .rbGetAreas(game);
    expect(areas.closest).toBe(B);                 // |290| < |300|（曼哈顿）
    expect(areas.playArea.x).toBe(Math.trunc(B.cx - 960));   // playArea 随选中者
    expect(areas.playArea.y).toBe(Math.trunc(B.cy - 600));
    expect(areas.playArea.w).toBe(1920);
    expect(areas.playArea.h).toBe(1200);
  });

  it('债3-2 首-candidate 哨兵 + 严格 < 替换（:4949 `num==-1f || num2<num` 序）', () => {
    // 同曼哈顿平局 → 首候选保持（严格小于才替换）
    const P1 = { dead: false, x: 0, y: 0, w: 20, h: 42, cx: 219.5, cy: 219.5 };   // M=200
    const P2 = { dead: false, x: 0, y: 0, w: 20, h: 42, cx: 319.5, cy: 119.5 };   // M=200
    const game = fakeGame(fakeStore(), { candidates: [P1, P2] });
    const b = mkBoulder();
    const areas = (b as unknown as { rbGetAreas: (g: GameHooks) => { closest: unknown } })
      .rbGetAreas(game);
    expect(areas.closest).toBe(P1);
    // 单候选零距 → 哨兵首拍收编
    const game2 = fakeGame(fakeStore(), { candidates: [P1] });
    const areas2 = (b as unknown as { rbGetAreas: (g: GameHooks) => { closest: unknown } })
      .rbGetAreas(game2);
    expect(areas2.closest).toBe(P1);
  });

  it('债3-3 结构锁：曼哈顿度量 + 哨兵序在源；邻域欧氏两处未被顺手改', () => {
    const src = readFileSync(join(__dirname, '../src/entities/RollingBoulder.ts'), 'utf8');
    expect(src).toMatch(/const d = Math\.abs\(p\.cx - this\.cx\) \+ Math\.abs\(p\.cy - this\.cy\);/);
    expect(src).toMatch(/if \(bd < 0 \|\| d < bd\)/);
    // PerformSmartBounce 敌怪扫描 :20241 与 JumpToPlayer <3000 门 :20278=欧氏（勿扩散）
    expect(src).toMatch(/const num3 = Math\.hypot\(closest\.cx - e\.cx, closest\.cy - e\.cy\);/);
    expect(src).toMatch(/const dist = Math\.hypot\(closest\.cx - this\.cx, closest\.cy - this\.cy\);/);
  });
});

// ================= 债4①：rotation 时序（P.cs:26679-26682） =================
describe('SW-BJ88 债4① rotation += vx×0.06 在加速/碰撞之前（P.cs:26679-26682）', () => {
  it('债4-5 加速帧读前拍速度：vx=6.98 → rotation=6.98×0.06（旧碰撞后位=7.03×0.06 红）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder();
    b.vx = 6.98; b.vy = 0; b.rotation = 0;
    b.fixedUpdate(1 / 60, game);
    expect(b.vx).toBeCloseTo(7.03, 6);             // accel +0.05 已生效（vy<=6 支）
    expect(b.rotation).toBeCloseTo(6.98 * 0.06, 9);   // 原版用加速【前】速度
  });

  it('债4-6 弹跳帧读前拍速度：撞墙拍 rotation += 撞前 vx（旧位=弹回负速,方向反转红）', () => {
    const game = fakeGame(fakeStore(64, 64, wallCells(64, 9, 4, 7)));
    const b = new RollingBoulder(112, 104, 711);   // 1047 盒 112..143,墙列 9=[144,160)
    b.vx = 7; b.vy = 0; b.rotation = 0;
    b.fixedUpdate(1 / 60, game);
    expect(b.vx).toBeCloseTo(-6.65, 6);            // CheckBounce 0.95 弹回
    expect(b.dead).toBe(false);
    expect(b.rotation).toBeCloseTo(7 * 0.06, 9);   // 撞前 vx=7（旧位给 -6.65×0.06）
  });

  it('债4-7 结构锁：rotation 行唯一且位于横向加速块之前', () => {
    const src = readFileSync(join(__dirname, '../src/entities/RollingBoulder.ts'), 'utf8');
    const iRot = src.indexOf('this.rotation += this.vx * 0.06;');
    const iAccel = src.indexOf('if (this.vy <= 6) {');
    expect(iRot).toBeGreaterThan(0);
    expect(iAccel).toBeGreaterThan(iRot);
    expect(src.split('this.rotation += this.vx * 0.06;').length - 1).toBe(1);
  });
});

// ================= 债4②：cutTilesBox 边界（P.cs:15356-15377） =================
describe('SW-BJ88 债4② cutTilesBox 右/下排除界（P.cs:15356-15377）', () => {
  it('债4-1 非对齐盒恰覆盖半格尾格：31 宽盒 (32,32) → 列/行 2..3 恰 4 格（回退 <= 变异红）', () => {
    const game = fakeGame(fakeStore());
    cutTilesBox(game, 32, 32, 31, 31, 99);
    const keys = game.cutCalls.map((c) => `${c.x},${c.y}`).sort();
    expect(keys).toEqual(['2,2', '2,3', '3,2', '3,3']);   // 旧 <= 版会多出 '2,4','3,4','4,*'
    expect(game.cutCalls.every((c) => c.vid === 99)).toBe(true);
  });

  it('债4-2 盒缘恰落格界：32 宽盒 (32,32) → 含界上格 2..4 恰 9 格（:15357 原版字面）', () => {
    const game = fakeGame(fakeStore());
    cutTilesBox(game, 32, 32, 32, 32);
    const keys = game.cutCalls.map((c) => `${c.x},${c.y}`).sort();
    expect(keys.length).toBe(9);
    expect(keys).toContain('4,4');                 // 右/下界上格仍含（+1 排除界语义）
    expect(keys).not.toContain('5,5');
  });

  it('债4-3 滚石实盒（104,104,31,31）→ 列/行 6..8,不再多割第 9 列/行', () => {
    const game = fakeGame(fakeStore());
    cutTilesBox(game, 104, 104, 31, 31);
    const xs = new Set(game.cutCalls.map((c) => c.x));
    const ys = new Set(game.cutCalls.map((c) => c.y));
    expect([...xs].sort()).toEqual([6, 7, 8]);
    expect([...ys].sort()).toEqual([6, 7, 8]);
    expect(game.cutCalls.length).toBe(9);
  });

  it('债4-4 结构锁：ix/iy 循环为排除界（< x1 / < y1）', () => {
    const src = readFileSync(join(__dirname, '../src/entities/ProjCutTiles.ts'), 'utf8');
    expect(src).toMatch(/for \(let ix = x0; ix < x1; ix\+\+\)/);
    expect(src).toMatch(/for \(let iy = y0; iy < y1; iy\+\+\) game\.cutTile/);
    expect(src).not.toMatch(/ix <= x1/);
  });
});
