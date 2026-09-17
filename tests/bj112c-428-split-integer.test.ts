// BJ112-c 428 分裂乘数整数化闸门（src/entities/Enemy.ts 426 死亡分裂链）。
// 原版 NPC.cs:83992：velocity = -Vector2.UnitY.RotatedByRandom(2π) × Main.rand.Next(3,6)
//   − Vector2.UnitY×2f —— Next(3,6)=【整数】{3,4,5}。旧仓 3+Math.random()*3=连续
//   浮点 [3,6)（域外偏差,BJ112-④ 三角分布收编批的登记债）→ 本刀整数化
//   3+Math.floor(Math.random()*3)（与同文件 Next 习语同构,Enemy.ts 14302 先例）。
//   405 侧 3f+Main.rand.NextFloat()*4f（NPC.cs:84399）原版本就浮点,不动（判据:两式
//   原版异型）。
// 判别量：s = hypot(vx, vy+2) —— (rx,ry)=unitYRotatedByRandom 单位向量（sin²+cos²=1）
//   ⇒ larva.v = -(rx,ry)·s - (0,1)·2 ⇒ hypot(vx, vy+2) ≡ s（fp 误差 ~1e-15）。
// ★变异判别：回退 3+Math.random()*3 → 非整数占比≈100% → 三断言全红。
// 统计口径：Math.random 实体面 6 种子判例 → 120 后王 × 3 幼虫 = 360 样本
// （{3,4,5} 均匀缺档概率 ≈ 3×(2/3)^360 ≈ 0）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 140, FLOOR = 120;

function makeHooks() {
  const world = new World(W, H, 7, 'bj112c-428');
  const st = world.store;
  world.groundLevel = 60;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  const enemies: Enemy[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
    },
  };
  const player = {
    x: 130 * TILE, y: (FLOOR - 3) * TILE, w: 20, h: 42,
    cx: 130 * TILE + 10, cy: (FLOOR - 3) * TILE + 21,
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
  return { hooks, enemies, em };
}

function killQueenForSplit(h: ReturnType<typeof makeHooks>): Enemy[] {
  const queen = Enemy.fromVanilla(426, 70 * TILE, (FLOOR - 6) * TILE)!;
  queen.id = h.em.nextId++;
  h.enemies.push(queen);
  queen.hurt(9999, 0, 0, h.hooks);
  const larvae = h.enemies.filter((e) => !e.dead && e.vanillaId === 428);
  // 量测后移除（门条件 428+427+426×3<20 须常开;原地 splice,em.add 闭包持有同数组）
  for (const l of larvae) l.dead = true;
  for (let i = h.enemies.length - 1; i >= 0; i--) {
    if (h.enemies[i].vanillaId === 428) h.enemies.splice(i, 1);
  }
  return larvae;
}

describe('BJ112-c 426→428 分裂乘数整数化（Next(3,6)=整数{3,4,5},NPC.cs:83992）', () => {
  it('360 样本:乘数 s=hypot(vx,vy+2) ∈ {3,4,5} 整数域,零非整数（旧连续浮点=红）', () => {
    const h = makeHooks();
    const seen = new Set<number>();
    let nonInteger = 0;
    let total = 0;
    for (let i = 0; i < 120; i++) {
      const larvae = killQueenForSplit(h);
      expect(larvae.length, '分裂链仍通（3 幼虫/后）').toBe(3);
      for (const l of larvae) {
        const s = Math.hypot(l.vx, l.vy + 2);
        total++;
        if (Math.abs(s - Math.round(s)) > 1e-6) nonInteger++;
        else seen.add(Math.round(s));
      }
    }
    expect(total).toBe(360);
    expect(nonInteger, `非整数乘数 ${nonInteger}/360（旧 3+rand×3≈全部非整数=红）`).toBe(0);
    expect([...seen].sort(), '值域恰 {3,4,5}（Next(3,6) 语义）').toEqual([3, 4, 5]);
  });
});
