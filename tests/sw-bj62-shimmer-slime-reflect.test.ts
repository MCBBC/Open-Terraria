// ★SW-BJ62 微光史莱姆 676 命中后反射（原版 Damage_PVE_Inner 尾部 Projectile.cs:13721-13725,
//  1456 :12830-12834 / 1458 :13722-13726 三基线同值；NPC.ReflectProjectile NPC.cs:67189-67213）：
//  原版语义 = 676 吃弹掉血【同时】把可反射弹打回发射者（伤 ÷4、hostile 翻转、速度=|原速|
//  向玩家偏置、penetrate++ 补偿穿透消耗）。676 全 SetDefaults/AI 零置 reflectsProjectiles
//  （1457 NPC.cs 全量核），故 :12050 事前支（tryReflectProjectile）对 676 恒不触发——
//  此前整支缺 = 射微光史莱姆（叶绿弹 207 等）无反射直死（用户实报 2026-09-06）。
//  变异证红：摘除 Arrow.ts「★SW-BJ62 微光史莱姆 676 命中后反射」支 → 本文件
//  「实机管线」组 3 例全红（反射不发生/弹被消耗）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { projCanBeReflected, tryReflectShimmerSlimeHit } from '../src/entities/projTargets';
import type { GameHooks } from '../src/entities/types';

interface Ctx { game: GameHooks; player: Player; dmgLog: number[] }

function makeCtx(enemies: unknown[] = [], playerX = 8 * 16): Ctx {
  const world = new World(64, 32, 42, '测试');
  const player = new Player(playerX, 10 * 16, new Inventory());
  const dmgLog: number[] = [];
  const game = {
    world,
    player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (dmg: number, sx: number, sy: number): number => {
      dmgLog.push(dmg);
      player.damage(dmg, sx, sy);
      return dmg;
    },
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxFile: () => true,
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
  return { game, player, dmgLog };
}

/** 真实微光史莱姆 676（vanilla 数据面 lifeMax 80/damage 20/defense 5/aiStyle 1） */
function makeSlime(x = 20 * 16, y = 10 * 16 - 9): Enemy {
  const e = Enemy.fromVanilla(676, x, y);
  if (!e) throw new Error('vanillaNpc(676) 缺失——vanilla-npcs.json 数据面被破坏');
  expect(e.maxHp).toBe(80);          // SetDefaults lifeMax=80（NPC.cs:17603 / 1457 金标）
  expect(e.vanillaId).toBe(676);
  expect(e.def.friendly).toBe(false);   // SetDefaults 无 friendly（:17598-17608）
  expect((e as unknown as { reflectsProjectiles?: boolean }).reflectsProjectiles).toBeFalsy();
  return e;
}

/** ★弹道几何：676 盒心 y = (10*16-9)+9 = 160-9=151——箭盒(4px)须与史莱姆盒
 *  (151±9) 重叠,直飞弹（无追踪）须对准盒心发射 */
const SLIME_CY = 10 * 16 - 9;

describe('CanBeReflected 弹型矩阵（Projectile.cs:21744-21761，1456 :20216）', () => {
  it('叶绿弹 207（aiStyle1）/箭 1 在白名单；728/955 特例；回旋镖 6（aiStyle3）不在', () => {
    expect(projCanBeReflected(207, { hostile: false, damage: 10 })).toBe(true);   // 用户实报弹型
    expect(projCanBeReflected(1, { hostile: false, damage: 10 })).toBe(true);
    expect(projCanBeReflected(728, { hostile: false, damage: 10 })).toBe(true);
    expect(projCanBeReflected(955, { hostile: false, damage: 10 })).toBe(true);
    expect(projCanBeReflected(6, { hostile: false, damage: 10 })).toBe(false);
    expect(projCanBeReflected(207, { hostile: true, damage: 10 })).toBe(false);   // hostile 门
    expect(projCanBeReflected(207, { hostile: false, damage: 0 })).toBe(false);   // 零伤门
  });
});

describe('实机管线（Arrow 叶绿弹 207 命中 676：吃弹掉血同时弹回）', () => {
  it('伤害照常落账 + 反射（hostile/伤÷4/速度保持/穿透补偿存续）', () => {
    const e = makeSlime();
    const { game, player, dmgLog } = makeCtx([e], 8 * 16);   // 玩家在左侧——反射偏向左回
    // 叶绿弹 207：damage 40 → 反射后 40÷2÷2=10（NPC.cs:67210-67211 int 连除）
    const arrow = new Arrow(20 * 16 - 12, SLIME_CY, 8, 0, 40, 0, 207, { grav: 0 });
    const speed0 = Math.hypot(arrow.vx, arrow.vy);
    const hp0 = player.hp;
    let hitFrame = -1;
    for (let i = 0; i < 6 && hitFrame < 0; i++) {
      arrow.fixedUpdate(1 / 60, game);
      if (arrow.reflected) hitFrame = i;
    }
    expect(hitFrame).toBeGreaterThanOrEqual(0);       // 反射发生
    expect(e.hp).toBeLessThan(e.maxHp);               // ★吃弹掉血（StrikeNPC :13706 先于反射）
    expect(arrow.hostile).toBe(true);                 // hostile 翻转（NPC.cs:67196）
    expect(arrow.damage).toBe(10);                    // 伤 ÷2÷2（:67210-67211）
    const speed1 = Math.hypot(arrow.vx, arrow.vy);
    expect(Math.abs(speed1 - speed0)).toBeLessThan(0.01);  // 速度=|原速|（:67047-67055 终乘）
    expect(arrow.vx).toBeLessThan(0);                 // 偏置 20 权重 → 必向玩家侧回飞
    expect(arrow.dead).toBe(false);                   // penetrate++ 补偿 → 弹存活（:13724）
    expect(arrow.pierce).toBe(1);                     // penetrate=1+:1 后外层递减 → 剩 1（原版同拍）
    // 反射弹向玩家侧回飞已由 vx<0 断言（原版反射向量含随机散射 :67047-67055——
    // 原版【不保证】反射弹必中发射者,落账判定用确定性面：弹瞬移玩家盒内泵帧,
    // 同 _bj62.mjs 实机②腿；不泵飞行段——回飞走廊对种子地形 RNG 敏感）
    // 落账（Damage_EVP 面——hostile 弹伤玩家；原版 :14912-14917 敌弹落账恒 ×2
    // （经典 hostileDamageScaling=1）+ DamageVar ±15% ⇒ 10 → ~17-23，
    // 玩家侧缩放域非反射域,此处只断落账发生与下界）
    const php0 = player.hp;
    arrow.x = player.cx - arrow.w / 2;                // 置玩家盒心（绕几何彩票）
    arrow.y = player.cy - arrow.h / 2;
    for (let i = 0; i < 4 && dmgLog.length === 0; i++) arrow.fixedUpdate(1 / 60, game);
    expect(dmgLog.length).toBeGreaterThan(0);
    expect(dmgLog[0]).toBeGreaterThanOrEqual(16);
    expect(player.hp).toBeLessThan(php0);
  });

  it('杀死击仍反射（原版 StrikeNPC 不立即失活——targetNPC.active 语义）', () => {
    const e = makeSlime();
    e.hp = 5;
    const { game } = makeCtx([e], 8 * 16);
    const arrow = new Arrow(20 * 16 - 12, SLIME_CY, 8, 0, 40, 0, 207, { grav: 0 });
    for (let i = 0; i < 6 && !arrow.reflected; i++) arrow.fixedUpdate(1 / 60, game);
    expect(e.hp).toBeLessThanOrEqual(0);              // 击杀成立
    expect(arrow.reflected).toBe(true);               // killing blow 照样弹回（:13721 无 dead 门）
    expect(arrow.hostile).toBe(true);
  });

  it('非 676 敌（普通敌怪）不反射：照常结算并消耗弹体（对照例）', () => {
    const z = new Enemy('zombie', 20 * 16, 10 * 16 - 8);
    z.hp = 1000;
    const { game } = makeCtx([z], 8 * 16);
    const arrow = new Arrow(20 * 16 - 12, SLIME_CY, 8, 0, 40, 0, 207, { grav: 0 });
    for (let i = 0; i < 8 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.reflected).toBe(false);
    expect(arrow.hostile).toBe(false);
    expect(z.hp).toBeLessThan(1000);                  // 照常掉血
    expect(arrow.dead).toBe(true);                    // 穿透 1 射中即停（无补偿）
  });

  it('回旋镖弹型（6，aiStyle3 不在白名单）命中 676 不反射', () => {
    const e = makeSlime();
    const { game } = makeCtx([e], 8 * 16);
    const arrow = new Arrow(20 * 16 - 12, SLIME_CY, 8, 0, 40, 0, 6, { grav: 0 });
    for (let i = 0; i < 8 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.reflected).toBe(false);
    expect(e.hp).toBeLessThan(e.maxHp);               // 伤害照常（676 对非白名单弹无反射面）
  });
});

describe('tryReflectShimmerSlimeHit 门禁矩阵（Projectile.cs:13721 逐值）', () => {
  const proj = (): { x: number; y: number; w: number; h: number; vx: number; vy: number;
    damage: number; hostile: boolean; reflected?: boolean } =>
    ({ x: 0, y: 0, w: 4, h: 4, vx: 8, vy: 0, damage: 40, hostile: false });

  it('vanillaId 门：676 之外（677 微光飞蛾/未登记）恒 false', () => {
    const { game } = makeCtx([], 8 * 16);
    expect(tryReflectShimmerSlimeHit(proj(), 207, { vanillaId: 677 }, game, 300)).toBe(false);
    expect(tryReflectShimmerSlimeHit(proj(), 207, {}, game, 300)).toBe(false);
  });

  it('flag8 门：immortal 676 不反射（flag8 = !targetNPC.immortal）', () => {
    const { game } = makeCtx([], 8 * 16);
    expect(tryReflectShimmerSlimeHit(proj(), 207, { vanillaId: 676, immortal: true }, game, 300)).toBe(false);
  });

  it('timeLeft 门：>10 放行、<=10 不救将到期弹（:13721 timeLeft>10）', () => {
    const { game } = makeCtx([], 8 * 16);
    const e = { vanillaId: 676 };
    expect(tryReflectShimmerSlimeHit(proj(), 207, e, game, 11)).toBe(true);
    expect(tryReflectShimmerSlimeHit(proj(), 207, e, game, 10)).toBe(false);
    expect(tryReflectShimmerSlimeHit(proj(), 207, e, game, 0)).toBe(false);
  });

  it('已反射弹不二反（hostile 翻转天然拦截的本仓显式位）', () => {
    const { game } = makeCtx([], 8 * 16);
    const e = { vanillaId: 676 };
    const p = { ...proj(), reflected: true };
    expect(tryReflectShimmerSlimeHit(p, 207, e, game, 300)).toBe(false);
  });

  it('白名单外弹型不反射（回旋镖 6）', () => {
    const { game } = makeCtx([], 8 * 16);
    expect(tryReflectShimmerSlimeHit(proj(), 6, { vanillaId: 676 }, game, 300)).toBe(false);
  });

  it('反射执行面：hostile 翻转 + 伤÷4 + 速度幅值保持', () => {
    const world = new World(64, 32, 42, '测试');
    const player = new Player(8 * 16, 10 * 16, new Inventory());
    const game = { world, player, spawnParticles: () => {}, playSfx: () => {} } as unknown as GameHooks;
    const p: { x: number; y: number; w: number; h: number; vx: number; vy: number;
      damage: number; hostile: boolean; reflected?: boolean } =
      { x: 320, y: 160, w: 4, h: 4, vx: 6, vy: -5, damage: 40, hostile: false };
    const sp0 = Math.hypot(p.vx, p.vy);
    expect(tryReflectShimmerSlimeHit(p, 207, { vanillaId: 676 }, game, 300)).toBe(true);
    expect(p.hostile).toBe(true);
    expect(p.reflected).toBe(true);
    expect(p.damage).toBe(10);
    const sp1 = Math.hypot(p.vx, p.vy);
    expect(Math.abs(sp1 - sp0)).toBeLessThan(0.01);
  });
});
