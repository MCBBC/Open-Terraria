// BJ164 登记债 1/2（2026-09-18 清偿）两件:
// ① Prime 激光臂同根寿命债——bossAI.ts 两发射口（style36 激光臂 131:attached/detached）。
//   原版发射点 NewProjectile 【无】 timeLeft 参（NPC.cs:29088 attached / :29167 detached,
//   1458 同址亲读）→ SetDefaults timeLeft=2700（Projectile.cs:1884,1458 同值）应承载;
//   曾吃 shoot 缺省 life=300 = 射程 1/9（EU=2 → 3 子步/t 各 −1:2700 子步=900t,
//   300 子步=100t 即亡）。同根债已清面:双子雷眼两口（tests/bossAI-twins-flame-range.test.ts 序言）。
// ② 弹 101 α 渲染面——SetDefaults alpha=255（Projectile.cs:1893）+ GetAlpha
//   :80595-81530 无 101 支（亲读）→ 缺省路径 num14=(255−α)/255=0 → 弹体贴图【恒隐】,
//   视觉 = d75 火流拖尾（aiStyle23 AI :26213-26262 → Arrow.ts subStepAI 101 尘站+
//   寿命帽 60 子步）。曾缺 PROJ_ALPHA0[101] 键 → α≡0 → draw 通用兜底 (255−0)/255=1
//   全亮本体穿帮（渲染面,与射程无关）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { primePartAI } from '../src/entities/bossAI';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

// ---------------------------------------------------------------------------
// ① Prime 激光臂 harness（仿 tests/prime-ae1-phase-counter.test.ts mk(),
//   entities.add 捕获 Arrow 实例以断言出生 life）
// ---------------------------------------------------------------------------
interface PrimeHarness {
  hooks: GameHooks;
  head: Enemy;
  arm: Enemy;
  player: Player;
  shots: Arrow[];
}

function mkPrime(playerCx: number, playerCy: number, worldW = 2400): PrimeHarness {
  const g = { world: new World(worldW, 120, 30, 'open'), player: null, critters: () => [],
    enemies: () => [] as unknown[], entities: { nextId: 1, add: () => {} },
    spawnDust: () => null, spawnParticles: () => {} } as unknown as GameHooks;
  const head = Enemy.fromVanilla(127, 640, 300)!; head.id = 7;   // Prime 本体
  const arm = Enemy.fromVanilla(131, 640, 300)!;                 // Prime 激光臂
  arm.id = 8; arm.ai1 = 7; arm.ai0 = 1; arm.ai2 = 0; arm.ai3 = 0;
  (g as { enemies: () => unknown[] }).enemies = () => [head];
  const shots: Arrow[] = [];
  (g as unknown as { entities: { add: (en: unknown, b: string) => void } }).entities.add =
    (en: unknown, bucket: string) => { if (bucket === 'projectiles') shots.push(en as Arrow); };
  const player = { x: playerCx - 10, y: playerCy - 21, w: 20, h: 42, cx: playerCx, cy: playerCy,
    vx: 0, vy: 0, dead: false } as unknown as Player;
  return { hooks: g, head, arm, player, shots };
}

describe('① Prime 激光臂寿命债:两发射口 life=2700 承载（NPC.cs:29088/:29167 无 timeLeft 参）', () => {
  it('attached 口:bossAI :1952 lai0>200 crossing 喷 1 发——projId 100/伤 25/life 2700', () => {
    const h = mkPrime(700, 700);
    for (let t = 0; t < 200; t++) {
      primePartAI(h.arm, h.hooks, h.player);
      expect(h.shots.length).toBe(0);              // crossing 前零发射
    }
    primePartAI(h.arm, h.hooks, h.player);
    expect(h.shots.length).toBe(1);
    const p = h.shots[0];
    expect(p.projId).toBe(100);                    // num577=100（雷眼二阶段同款激光）
    expect(p.damage).toBe(25);                     // num576=25
    expect(p.life).toBe(2700);                     // ★主断言:SetDefaults 终值承载
  });

  it('detached 口:bossAI :1980 ai2=1 lai0>80 crossing（第 81 拍）喷 1 发——life 同 2700', () => {
    const h = mkPrime(700, 700);
    h.arm.ai2 = 1;
    for (let t = 0; t < 80; t++) {
      primePartAI(h.arm, h.hooks, h.player);
      expect(h.shots.length).toBe(0);
    }
    primePartAI(h.arm, h.hooks, h.player);
    expect(h.shots.length).toBe(1);
    expect(h.shots[0].projId).toBe(100);
    expect(h.shots[0].life).toBe(2700);            // ★主断言（detached 口同承）
  });

  it('EU=2 → 3 子步/t 各 −1:1 tick 后 life=2697（900t 语义与双子雷眼同拍）', () => {
    const h = mkPrime(700, 700);
    for (let t = 0; t < 201; t++) primePartAI(h.arm, h.hooks, h.player);
    const p = h.shots[0];
    p.fixedUpdate(1 / 60, h.hooks);
    expect(p.life).toBe(2697);                     // 2700−3×1
  });

  it('射程判别:旧缺省 300（EU2=100t）亡拍后仍存活;恰 900t（2700 子步）寿终', () => {
    // 直飞判别面（复刻 shoot() 出生参数,bossAI-twins-flame-range 同式）:水平弹道
    // 8px/子步×2700=21600px<2400 格,空世界无碰撞/无出界——ticksAlive 即纯寿命读数。
    // （AI 口出生 life 已由上两例钉死;本例免 Prime 悬停几何把弹带出世界顶的干扰）
    const hooks = dustHooks([], 2400, 120);        // 宽世界:21600px 飞行不出界
    const p = new Arrow(32 * 16, 30 * 16, 8, 0, 25, 0, 100,
      { grav: 0, life: 2700, pierce: 1, hostile: true });
    let ticks = 0;
    while (!p.dead && ticks < 1200) { p.fixedUpdate(1 / 60, hooks); ticks++; }
    expect(ticks).toBe(900);                       // ★变异红线:摘 2700 → 100t 即亡
  });
});

// ---------------------------------------------------------------------------
// ② 弹 101 α 渲染面（PROJ_ALPHA0[101]=255 → 弹体恒隐,视觉 = d75 拖尾）
// ---------------------------------------------------------------------------
interface DustRec {
  type: number; alpha: number; scale: number; noGravity: boolean;
  x: number; y: number; vx: number; vy: number;
}

function dustHooks(dusts: DustRec[], worldW = 80, worldH = 80): GameHooks {
  const hooks = {
    world: new World(worldW, worldH, 42, 'open'),
    player: { x: -9999, y: -9999, w: 20, h: 42, cx: -9989, cy: -9978, dead: true, vx: 0, vy: 0 },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    cutTile: () => {}, damagePlayer: (): number => 0, addLightAt: () => {},
    candidatePlayers: () => [], enemies: () => [], hitTilesFx: () => {},
    entities: { add: () => {} },
    spawnDust: (bx: number, by: number, _bw: number, _bh: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c: unknown = null, scale = 1, ng = false) => {
      const d: DustRec = { type, alpha, scale, noGravity: !!ng,
        x: bx, y: by, vx: sx, vy: sy };
      dusts.push(d);
      return d;
    },
  };
  return hooks as unknown as GameHooks;
}

describe('② 弹 101 α=255 渲染面:弹体恒隐 + d75 火流拖尾（Projectile.cs:1893）', () => {
  it('α 面:PROJ_ALPHA0[101]=255 注入 → 构造器 alpha=255;无专属 GA 档 → 通用兜底 (255−α)/255=0', () => {
    const a = new Arrow(320, 480, 6, 0, 30, 0, 101,
      { hostile: true, grav: 0, life: 600, pierce: 1 });
    expect(a.alpha).toBe(255);                     // ★α 断言:缺键=0 → 兜底 ×1 全亮穿帮
    const ga = (a as unknown as { drawGlobalAlpha(): number | null }).drawGlobalAlpha();
    expect(ga).toBeNull();                         // GetAlpha :80595-81530 无 101 支 → 落通用兜底
    expect((255 - a.alpha) / 255).toBe(0);         // draw 主链兜底式（Arrow.ts :2923）→ 弹体恒隐
  });

  it('视觉补偿:d75 火流拖尾在——ai[0]>7 门（2 tick 零尘）后 1/2 掷/子步,α=100（:26213-26262）', () => {
    const dusts: DustRec[] = [];
    const hooks = dustHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 30, 0, 101,
      { hostile: true, grav: 0, life: 600, pierce: 1 });
    for (let t = 0; t < 2; t++) if (!p.dead) p.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(0);                  // ai[0]=0..7（×4 子步/tick）无尘
    for (let t = 0; t < 20 && !p.dead; t++) p.fixedUpdate(1 / 60, hooks);
    const d75 = dusts.filter((d) => d.type === 75);
    expect(d75.length).toBeGreaterThan(0);         // ★拖尾尘断言:缺块 → 视觉=零(纯隐身)
    expect(d75.every((d) => d.alpha === 100)).toBe(true);   // NewDust α100（:26219）
  });

  it('回归:弹 100 渐显面不受 ② 补键波及——α=255 起,LASER_FADE15 −15/子步（EU2 → 1 tick −45）', () => {
    const a = new Arrow(320, 480, 8, 0, 25, 0, 100,
      { hostile: true, grav: 0, life: 2700, pierce: 1 });
    expect(a.alpha).toBe(255);                     // PROJ_ALPHA0[100]=255（账本既有键）
    a.fixedUpdate(1 / 60, dustHooks([]));
    expect(a.alpha).toBe(210);                     // −15×3 子步 → 渐显拉亮（弹道可视面回归门）
  });
});
