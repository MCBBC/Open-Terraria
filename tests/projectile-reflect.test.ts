// 弹幕反射管线回归（原版 Projectile.cs:12781-12791——★BJ665 勘正 伪锚 :12050-12060 + NPC.cs:67036-67059 + Projectile.cs:20216）：
//  419 旋刃怪冲刺（reflectsProjectiles 置标）命中可反射弹（CanBeReflected 白名单）→
//  弹体转 hostile 回打发射者、伤害 ÷4、穿透归一、敌怪不掉血；二次命中不重复反射；
//  非置标敌不反射；联机傀儡（netPuppet）不进命中链天然不反射。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { TrapShot } from '../src/entities/Dart';
import { projCanBeReflected, tryReflectProjectile } from '../src/entities/projTargets';
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
  } as unknown as GameHooks;
  return { game, player, dmgLog };
}

/** 带受击间谍的敌怪（hurt 计数——反射命中不应掉血） */
function makeEnemy(flag: boolean, hurtLog: number[]): Enemy {
  const e = new Enemy('zombie', 20 * 16, 10 * 16 - 8);
  e.hp = 1000;
  e.iframes = 0;
  e.reflectsProjectiles = flag;
  (e as unknown as { hurt: (d: number) => boolean }).hurt = (d: number) => {
    hurtLog.push(d);
    e.iframes = 10;   // Enemy.hurt :11554 通用档（命中置全局 immune 帧——弹侧 :11905 门依赖此帧）
    return true;
  };
  return e;
}

describe('CanBeReflected 白名单（Projectile.cs:20216-20230）', () => {
  it('aiStyle 白名单与 728/955 特例、hostile/零伤门禁', () => {
    // 1 木箭 aiStyle1 / 21 WaterBolt aiStyle2 可反射
    expect(projCanBeReflected(1, { hostile: false, damage: 10 })).toBe(true);
    expect(projCanBeReflected(21, { hostile: false, damage: 10 })).toBe(true);
    // 728/955 无条件（白名单外也放行）
    expect(projCanBeReflected(728, { hostile: false, damage: 10 })).toBe(true);
    expect(projCanBeReflected(955, { hostile: false, damage: 10 })).toBe(true);
    // 6 回旋镖 aiStyle3 / 288 金雨 aiStyle27 等不在白名单
    expect(projCanBeReflected(6, { hostile: false, damage: 10 })).toBe(false);
    // hostile / damage<=0 门禁（!hostile && damage>0）
    expect(projCanBeReflected(1, { hostile: true, damage: 10 })).toBe(false);
    expect(projCanBeReflected(1, { hostile: false, damage: 0 })).toBe(false);
  });
});

describe('反射管线（Arrow 命中 419 冲刺置标敌）', () => {
  it('反射：转向发射者 + hostile + 伤害÷4 + 穿透归一 + 敌怪不掉血', () => {
    const hurtLog: number[] = [];
    const e = makeEnemy(true, hurtLog);
    const { game, player } = makeCtx([e], 8 * 16); // 玩家在敌左侧
    const arrow = new Arrow(20 * 16 - 12, 10 * 16, 8, 0, 40, 0, 1, { grav: 0 });
    const hp0 = player.hp;
    for (let i = 0; i < 4 && !arrow.reflected; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.reflected).toBe(true);
    expect(arrow.hostile).toBe(true);
    expect(arrow.pierce).toBe(1);                 // penetrate=1（NPC.cs:67058）
    expect(arrow.damage).toBe(10);                // 40 ÷2÷2（int 连除）
    expect(arrow.vx).toBeLessThan(0);             // 朝发射者回打（随机散射被 ×20 偏置压倒）
    expect(Math.hypot(arrow.vx, arrow.vy)).toBeCloseTo(8, 5); // 原速保持
    expect(hurtLog.length).toBe(0);               // 反射不结算敌怪伤害
    expect(arrow.dead).toBe(false);               // 弹体存活（hostile 化回飞）
    expect(player.hp).toBe(hp0);                  // 尚未飞回，不伤玩家
  });

  it('二次命中不重复反射 + 不再伤敌怪（reflected/hostile 双门禁）', () => {
    const hurtLog: number[] = [];
    const e = makeEnemy(true, hurtLog);
    const { game } = makeCtx([e], 8 * 16);
    const arrow = new Arrow(20 * 16 - 12, 10 * 16, 8, 0, 40, 0, 1, { grav: 0 });
    for (let i = 0; i < 4 && !arrow.reflected; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.reflected).toBe(true);
    // 反射后 CanBeReflected 即失效（原版 friendly/hostile 翻转天然拦截）
    expect(projCanBeReflected(1, arrow)).toBe(false);
    expect(tryReflectProjectile(arrow, 1, e, game)).toBe(false);
    // 重新摁回敌怪判定盒内推进：不再反射、不掉血（reflected 门禁跳出敌怪循环）
    arrow.x = 20 * 16 - 6;
    arrow.y = 10 * 16;
    for (let i = 0; i < 3; i++) arrow.fixedUpdate(1 / 60, game);
    expect(hurtLog.length).toBe(0);
  });

  it('非置标敌不反射：照常结算伤害并消耗弹体', () => {
    const hurtLog: number[] = [];
    const e = makeEnemy(false, hurtLog);
    const { game } = makeCtx([e], 8 * 16);
    const arrow = new Arrow(20 * 16 - 12, 10 * 16, 8, 0, 40, 0, 1, { grav: 0 });
    for (let i = 0; i < 6 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.reflected).toBe(false);
    expect(arrow.hostile).toBe(false);
    expect(hurtLog.length).toBe(1);   // pierce 1 射中即停
    expect(arrow.dead).toBe(true);
  });

  it('回旋镖（aiStyle 3 不在白名单）不被反射', () => {
    const hurtLog: number[] = [];
    const e = makeEnemy(true, hurtLog);
    const { game } = makeCtx([e], 8 * 16);
    // projId 6 = 木回旋镖 aiStyle3 → CanBeReflected false
    const arrow = new Arrow(20 * 16 - 20, 10 * 16, 8, 0, 40, 0, 6, { grav: 0 });
    for (let i = 0; i < 6 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.reflected).toBe(false);
    expect(hurtLog.length).toBe(1);
  });

  it('联机傀儡（netPuppet）不进命中链：不反射', () => {
    const hurtLog: number[] = [];
    const e = makeEnemy(true, hurtLog);
    const { game } = makeCtx([e], 8 * 16);
    const arrow = new Arrow(20 * 16 - 12, 10 * 16, 8, 0, 40, 0, 1, { grav: 0 });
    arrow.netPuppet = true;
    for (let i = 0; i < 8; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.reflected).toBe(false);
    expect(hurtLog.length).toBe(0);
  });
});

describe('TrapShot 友方弹反射（炮弹 162 / 雪球 166，aiStyle2）', () => {
  it('cannonball 命中置标敌：转 hostile 回打 + 伤害÷4', () => {
    const hurtLog: number[] = [];
    const e = makeEnemy(true, hurtLog);
    const { game, player } = makeCtx([e], 8 * 16);
    const shot = new TrapShot(20 * 16 - 12, 10 * 16, 6, 0, 80, 'cannonball');
    expect(shot.hostile).toBe(false); // 友方炮弹
    const hp0 = player.hp;
    for (let i = 0; i < 4 && !shot.reflected; i++) shot.fixedUpdate(1 / 60, game);
    expect(shot.reflected).toBe(true);
    expect(shot.hostile).toBe(true);        // 转敌对后可伤玩家
    expect(shot.damage).toBe(20);           // 80 ÷2÷2
    expect(shot.vx).toBeLessThan(0);
    expect(hurtLog.length).toBe(0);
    expect(player.hp).toBe(hp0);            // 尚未飞回，不伤玩家
  });

  it('敌对陷阱弹（spiky 尖刺球，hostile）不反射', () => {
    const hurtLog: number[] = [];
    const e = makeEnemy(true, hurtLog);
    const { game } = makeCtx([e], 8 * 16);
    const shot = new TrapShot(20 * 16 - 12, 10 * 16, 6, 0, 80, 'spiky');
    expect(shot.hostile).toBe(true);
    for (let i = 0; i < 6; i++) shot.fixedUpdate(1 / 60, game);
    expect(shot.reflected).toBe(false);
  });
});
