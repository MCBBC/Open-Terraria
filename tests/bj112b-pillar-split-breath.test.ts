// BJ112-②③④⑤ 四柱小怪域修刀批闸门：
//   ② 426 死 → 3×428 分裂 Bottom 锚（NPC.cs:83989 NewNPC(Center.X,Center.Y) →
//      :81594 nPC.Bottom=(X,Y)）——旧 cy−h/2 = 中心锚,半格偏低（★BJ111 月主勘误同族漏网）
//   ③ 415 justHit 重置臂（:57366-57370 ai[2]=120：打断喷吐/推迟触发）
//   ④ RotatedByRandom 三角分布单源（Utils.cs:1785-1788 (r−r)×max）——415 喷火尘 /
//      516 出膛角 / 428 分裂初速三处收编（旧 uniform）+ 掷序差分（角 2 掷/处）
//   ⑤ 415 尘三参（:57412-57415 position+=vector18×4 / scale=0.3+vector18.X×(−dir) /
//      fadeIn=0.7）
// 统计断言按 6 种子判例（Math.random 实体 A/B 必须 6×统计）跑大样本;
// 掷序断言用【同构双拍差分】（落拍 vs 不落拍同构驱动,Math.random 调用数差值）——
// 对无关路径的掷数稳健。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { rotSpreadAngle, solarFlareAI } from '../src/entities/bossAI_lunar_misc';
import { addEnemy, spawnVanillaEnemy } from '../src/entities/bossAI';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 140, FLOOR = 120;

function makeWorld(): World {
  const w = new World(W, H, 7, 'bj112b-test');
  const st = w.store;
  w.groundLevel = 60;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
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
    spawnDust: () => null,
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, em, player };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}
function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}
const aliveOf = (h: ReturnType<typeof makeHooks>, id: number): Enemy[] =>
  h.enemies.filter((e) => !e.dead && e.vanillaId === id);

const realRandom = Math.random.bind(Math);
/** 统计 Math.random 调用数地跑一段 thunk（掷序差分基建） */
function countDraws(thunk: () => void): number {
  let draws = 0;
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => { draws++; return realRandom(); });
  try { thunk(); } finally { spy.mockRestore(); }
  return draws;
}

afterEach(() => { vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------
describe('BJ112-② 426→428 分裂 Bottom 锚（NPC.cs:83989+:81594）', () => {
  it('幼虫左上 = (Center.X − w/2, Center.Y − h)：Bottom.Y == 后中心（旧 cy−h/2=中心锚=红）', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    const queen = spawn(h, 426, 70, FLOOR - 6);
    queen.hurt(9999, 0, 0, h.hooks);
    const larvae = aliveOf(h, 428);
    expect(larvae.length).toBe(3);                             // 分裂链仍通
    for (const l of larvae) {
      expect(l.x).toBe(queen.cx - l.w / 2);
      expect(l.y).toBe(queen.cy - l.h);                        // ★判别：中心锚 → cy − h/2
      expect(l.y + l.h).toBe(queen.cy);                        // Bottom 锚语义
    }
  });
});

// ---------------------------------------------------------------------------
describe('BJ112-③ 415 justHit 重置臂（NPC.cs:57366-57370）', () => {
  it('喷吐中受击：ai2=120→119 打断（不风停减速）;无臂=−11 继续+vx×0.8=红', () => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    const drako = spawn(h, 415, 80, FLOOR - 3);
    drako.ai2 = -10;                                           // 喷吐段（-42 < ai2 < 0）
    drako.vx = -4;
    drako.hurt(1, 0, 0, h.hooks);                              // justHitT=2（Enemy.ts:13929）
    tick(h, 1, [drako]);
    expect(drako.justHitT).toBeGreaterThan(0);
    expect(drako.ai2).toBe(119);                               // ★120 进臂 → −1 递减
    // 无臂 = 风停段 ×0.8 → −3.2；有臂 = return false 走行走链摩擦（−4 → ≈−3.9）
    expect(drako.vx).toBeLessThan(-3.5);                       // ★判别：无臂 → −3.2 > −3.5 = 红
  });

  it('待机中受击：触发被推迟（ai2=119≠−1）;无臂=进喷吐或冷却=红', () => {
    const h = makeHooks(makeWorld(), { x: 90, y: FLOOR - 3 });
    const d2 = spawn(h, 415, 80, FLOOR - 3);
    d2.ai2 = 0;
    d2.hurt(1, 0, 0, h.hooks);
    tick(h, 1, [d2]);
    expect(d2.ai2).toBe(119);                                  // ★判别：无臂 → −1/90/0
  });
});

// ---------------------------------------------------------------------------
describe('BJ112-④ RotatedByRandom 三角分布单源（Utils.cs:1785-1788）', () => {
  it('rotSpreadAngle：对称三角——P(|a|<max/2)≈3/4（uniform=1/2=红）、值域 |a|<max', () => {
    const m = Math.PI / 4;
    const N = 20000;
    let inRange = 0, hit = 0, neg = 0;
    for (let i = 0; i < N; i++) {
      const a = rotSpreadAngle(m);
      if (Math.abs(a) < m) inRange++;
      if (Math.abs(a) < m / 2) hit++;
      if (a < 0) neg++;
    }
    expect(inRange).toBe(N);                                   // (r−r)∈(−1,1) → |a|<max 恒成立
    const p = hit / N;
    expect(p).toBeGreaterThan(0.70);                           // 三角解析 0.75（σ≈0.003 → ±16σ）
    expect(p).toBeLessThan(0.80);
    expect(neg / N).toBeGreaterThan(0.45);                     // 对称性
    expect(neg / N).toBeLessThan(0.55);
    expect(0.5).toBeLessThan(p);                               // ★变异判别：uniform 恒 0.5
  });

  it('516 出膛角走三角源（同构重置单实体大样本）：E[vx]=0.9333·8·E[cos a]·cos(π/4)≈4.32（uniform≈3.36=红）', () => {
    // ★判别量选定：ang = a − π/4 的相移把全部偶数阶二阶矩变成分布盲区（sin2a 奇函数
    // 对称密度 E=0 → E[sin²]/E[cos²] 三角=uniform=0.5），可判别最低阶 = 一阶矩
    // E[cos a]（偶）：三角 2(1−cos m)/m²=0.8106 vs uniform sin(m)/m=0.6366。
    // 玩家正右方 + dx 严格 0 → 转向舵对 vx 纯乘 14/15（一阶矩解析闭式）。
    const h = makeHooks(makeWorld(), { x: 90, y: FLOOR - 3 });
    const f = spawn(h, 516, 80, FLOOR - 3);
    const N = 6000;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      f.ai0 = 0;                                               // 每拍重进出膛分支
      f.x = h.player.cx - f.w / 2;                             // f.cx == player.cx → dx=0
      f.y = h.player.cy - 300 - f.h / 2;
      f.dead = false; f.hp = f.maxHp;
      solarFlareAI(f, h.hooks, h.player as never);
      sum += f.vx;
    }
    const mean = sum / N;
    expect(mean).toBeGreaterThan(4.05);                        // 实测三角 4.323（σ≈0.041 → ±6.6σ）
    expect(mean).toBeLessThan(4.60);                           // ★变异判别：uniform 解析 3.361（16σ 外）→ 红
  });

  it('415 喷火尘掷序 3/尘（角 2 掷+NextFloat 1 掷）——同构差分;旧 uniform=2/尘=红', () => {
    const drive = (ai2: number): number => {
      const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
      const drako = spawn(h, 415, 80, FLOOR - 3);
      drako.ai2 = ai2; drako.vx = 2; drako.facing = 1;
      return countDraws(() => tick(h, 1, [drako]));
    };
    const h2 = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });   // 掷数探针：构造在 spy 外
    const d2 = spawn(h2, 415, 80, FLOOR - 3);
    const nSpawn = countDraws(() => spawnVanillaEnemy(h2.hooks, 516, d2.cx + 45, d2.cy + 8));
    const base = drive(-17.5);                                 // 同构不落拍（−18.5 ≠ −18）
    const beat = drive(-17);                                   // 落 −18 拍
    expect(beat - base).toBe(20 * 3 + nSpawn);                 // ★判别：旧 uniform → 20×2+nSpawn
  });

  it('428 分裂掷序 3/只（角 2 掷+乘数 1 掷）——门开/门关差分;旧 uniform=2/只=红', () => {
    const hp = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });   // 掷数探针：构造在 spy 外
    const nLarva = countDraws(() => {                          // fromVanilla+addEnemy 自身掷数
      const l = Enemy.fromVanilla(428, 70 * TILE, (FLOOR - 6) * TILE)!;
      addEnemy(hp.hooks, l);
    });
    const death = (gated: boolean): number => {
      const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
      if (gated) {
        for (let k = 0; k < 9; k++) spawn(h, 428, 30 + k, FLOOR - 4);
        for (let k = 0; k < 8; k++) spawn(h, 427, 45 + k, FLOOR - 4);   // 17+3=20 → 门关
      }
      const queen = spawn(h, 426, 70, FLOOR - 6);
      return countDraws(() => queen.hurt(9999, 0, 0, h.hooks));
    };
    const open = death(false);
    const gated = death(true);
    expect(open - gated).toBe(3 * (3 + nLarva));               // ★判别：旧 uniform → 3×(2+nLarva)
  });
});

// ---------------------------------------------------------------------------
describe('BJ112-⑤ 415 喷火尘三参（NPC.cs:57407-57417）', () => {
  interface DustRec { x: number; y: number; vx: number; vy: number; scale: number; fadeIn: number; noGravity: boolean }
  const beatOnce = (): { dusts: DustRec[]; ax: number; ay: number; dir: number } => {
    const h = makeHooks(makeWorld(), { x: 130, y: FLOOR - 3 });
    const drako = spawn(h, 415, 80, FLOOR - 3);
    drako.ai2 = -17; drako.vx = 2; drako.facing = 1;
    const dusts: DustRec[] = [];
    (h.hooks as unknown as { spawnDust: (...a: number[]) => unknown }).spawnDust =
      (...a: number[]) => {
        const d: DustRec = { x: a[0], y: a[1], vx: a[5], vy: a[6], scale: 1, fadeIn: 0, noGravity: true };
        dusts.push(d);
        return d;
      };
    tick(h, 1, [drako]);
    return { dusts, ax: drako.cx + drako.facing * 40, ay: drako.cy, dir: drako.facing };
  };

  it('fadeIn=0.7 + position+=vector18×4（旧码缺省 0/不覆写=红）', () => {
    const runs: DustRec[] = [];
    let ax = 0, ay = 0;
    for (let i = 0; i < 50; i++) {
      const r = beatOnce();
      expect(r.dusts.length).toBe(20);
      runs.push(...r.dusts);
      ax = r.ax; ay = r.ay;
    }
    expect(runs.every((d) => d.fadeIn === 0.7)).toBe(true);    // ★判别：旧码 fadeIn=0
    for (const d of runs) {
      expect(Math.abs(d.x - ax)).toBeLessThanOrEqual(4 + 1e-9);   // |vector18.X×4| ≤ 4
      expect(Math.abs(d.y - ay)).toBeLessThanOrEqual(4 + 1e-9);   // |vector18.Y×4| ≤ 4
    }
    const off = runs.filter((d) => Math.abs(d.x - ax) > 0.5).length;
    expect(off).toBeGreaterThan(runs.length * 0.5);            // ★判别：旧码不覆写=0%
  });

  it('scale = 0.3 + vector18.X×(−dir)：均值≈0.3（对称;旧码恒 1=红）、速度带 vector18×2+UnitX×3', () => {
    const runs: DustRec[] = [];
    for (let i = 0; i < 50; i++) runs.push(...beatOnce().dusts);
    const meanScale = runs.reduce((s, d) => s + d.scale, 0) / runs.length;
    expect(meanScale).toBeGreaterThan(0.23);                   // 三角对称 E=0.3（σ≈0.022 → ±6σ）
    expect(meanScale).toBeLessThan(0.37);
    for (const d of runs) {
      expect(Math.abs(d.vx)).toBeLessThanOrEqual(5 + 1e-9);    // |vector18×2|≤2 + |UnitX×3|≤3
      expect(Math.abs(d.vy)).toBeLessThanOrEqual(2 + 1e-9);    // |vector18.Y×2| ≤ 2
      expect(d.noGravity).toBe(true);
    }
  });
});
