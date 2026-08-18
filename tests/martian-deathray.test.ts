// 火星死光电报 447（Projectile.cs AI_079 :29714-29798）+ 弹 655 摇树蜂巢（:17856/:72110）
// + 日曜爆闪 608 参数化（:37707/:6275/:68941）——2026-08-18 A 批缺口补齐
import { describe, expect, it } from 'vitest';
import { MartianDeathray } from '../src/entities/bossAI_martian';
import { GrenadeProj } from '../src/entities/WeaponProj';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

function world(): World {
  const w = new World(80, 100, 11, 'ray');
  for (let x = 0; x < 80; x++) w.store.setTileSilent(x, 90, 1);   // 地板 y=90
  return w;
}
function hooks(w: World, p?: Player): GameHooks {
  return {
    world: w, player: p ?? new Player(40 * 16, 80 * 16, new Inventory()),
    enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {},
  } as never;
}

describe('火星死光电报 447（AI_079）', () => {
  it('束高扫到首个实心格：无实心=150 格帽', () => {
    const w = world();
    const p = new Player(40 * 16, 80 * 16, new Inventory());
    const h = hooks(w, p);
    const e = { id: 1, vanillaId: 392, cx: 40 * 16, cy: 40 * 16, ai3: 0, ai0: 0, dead: false } as never;
    (h.enemies as unknown as () => unknown[]) = () => [e];
    const ray = new MartianDeathray(e as never, 50);
    ray.fixedUpdate(1 / 60, h);
    // y=40*16+46=686 → 行 42；地板 90 → span≈48 → h≈49×16
    expect(ray.h).toBeGreaterThan(40 * 16);
    expect(ray.h).toBeLessThanOrEqual(151 * 16);   // ≤150 格帽
    expect(ray.dead).toBe(false);
  });
  it('锚不场/非电报者 → Kill', () => {
    const w = world();
    const h = hooks(w);
    const gone = { id: 9, vanillaId: 392, dead: true, cx: 0, cy: 0, ai3: 0, ai0: 0 } as never;
    (h.enemies as unknown as () => unknown[]) = () => [gone];
    const ray = new MartianDeathray(gone as never, 50);
    ray.fixedUpdate(1 / 60, h);
    expect(ray.dead).toBe(true);
  });
});

describe('弹 655 摇树蜂巢（AI_025 落地反弹/撞墙裂）', () => {
  it('GrenadeProj 655：落地 vy>5 反弹 ×0.2（非通用 -0.4）', () => {
    const w = world();
    const h = hooks(w);
    const g = new GrenadeProj(40 * 16, 86 * 16, 2, 6, 10, 600, 655, () => {});
    g.w = 31; g.h = 31;
    // 贴地板一步：y=86*16+31 已越地板 90*16 → 下一 tick onGround，lastVy>5 反弹
    for (let i = 0; i < 10 && !g.dead; i++) g.fixedUpdate(1 / 60, h);
    expect(g.dead).toBe(false);            // 落地反弹不杀（:17859 无 Kill 分支）
  });
  it('引信耗尽走 onExplode 不裂蜂（Kill 裂蜂仅撞墙路径）', () => {
    const w = world();
    const h = hooks(w);
    let boom = 0;
    const g = new GrenadeProj(40 * 16, 80 * 16, 0, 0, 10, 1, 655, () => { boom++; });
    g.fixedUpdate(1 / 60, h);
    expect(boom).toBe(1);                  // 引信 1 → 次 tick 爆
    expect(g.dead).toBe(true);
  });
});
