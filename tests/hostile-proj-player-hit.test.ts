// 敌弹命中玩家回归（原版 Projectile.Damage_EVP，Projectile.cs:13706-13830）：
// 此前全仓投射物 fixedUpdate 只判敌人/小动物,Boss 弹幕对玩家无伤害——战斗核心缺口。
// 覆盖：
//  1. hostile 弹命中玩家 → damagePlayer 调用 + 掉血；iframes 内不重复结算；
//  2. hostile 弹命中不消耗弹体（原版 :13811-13829 仅特判型递减）；
//  3. 玩家自己的弹（hostile=false 默认）不伤玩家；
//  4. 348 FrostWave 命中 → Chilled/Frozen 授予（Projectile.StatusPlayer :11554-11567）。
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Arrow } from '../src/entities/Arrow';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

function makeGame(p: Player, log: { dmg: number[] }): GameHooks {
  const world = new World(64, 32, 42, '测试');
  return {
    world,
    player: p,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (dmg: number, sx: number, sy: number) => {
      log.dmg.push(dmg);
      p.damage(dmg, sx, sy); // 真 Game.damagePlayer 同链:Player.damage 落地即置 iframes
    },
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
  } as unknown as GameHooks;
}

describe('敌弹命中玩家（Damage_EVP）', () => {
  it('hostile 弹命中:掉血 + damagePlayer 调用 + 弹体存活（穿透不消耗）', () => {
    const p = new Player(30 * 16, 10 * 16, new Inventory());
    const hp0 = p.hp;
    const log = { dmg: [] as number[] };
    const game = makeGame(p, log);
    // hostile 弹从左向右穿过玩家（双子激光 100 同语义,grav 0 直飞）
    const arrow = new Arrow(30 * 16 - 40, 10 * 16 + 8, 8, 0, 25, 0, 100, null,
      { grav: 0, life: 300, pierce: 1, hostile: true });
    for (let i = 0; i < 6; i++) arrow.fixedUpdate(1 / 60, game);
    expect(log.dmg.length).toBe(1);
    // Damage_EVP（Projectile.cs:13776-13778）：难度缩放（经典 1）后全局 ×2 → 25×2=50
    expect(log.dmg[0]).toBe(50);
    expect(p.hp).toBeLessThan(hp0);
    expect(arrow.dead).toBe(false); // 命中不销毁弹体
    expect(p.iframes).toBeGreaterThan(0);
  });

  it('iframes 去重:无敌帧内再命中不重复结算', () => {
    const p = new Player(30 * 16, 10 * 16, new Inventory());
    const log = { dmg: [] as number[] };
    const game = makeGame(p, log);
    const a1 = new Arrow(30 * 16 - 40, 10 * 16 + 8, 8, 0, 25, 0, 100, null,
      { grav: 0, life: 300, pierce: 1, hostile: true });
    for (let i = 0; i < 6; i++) a1.fixedUpdate(1 / 60, game);
    const hp1 = p.hp;
    // 第二发同帧穿身:iframes 内不结算
    const a2 = new Arrow(30 * 16 - 40, 10 * 16 + 8, 8, 0, 25, 0, 100, null,
      { grav: 0, life: 300, pierce: 1, hostile: true });
    for (let i = 0; i < 6; i++) a2.fixedUpdate(1 / 60, game);
    expect(log.dmg.length).toBe(1);
    expect(p.hp).toBe(hp1);
  });

  it('玩家自己的弹（默认非 hostile）不伤玩家', () => {
    const p = new Player(30 * 16, 10 * 16, new Inventory());
    const hp0 = p.hp;
    const log = { dmg: [] as number[] };
    const game = makeGame(p, log);
    const arrow = new Arrow(30 * 16 - 40, 10 * 16 + 8, 8, 0, 9, 1, 1, VANILLA_ITEM_KEY_BY_ID[40]);
    for (let i = 0; i < 8; i++) arrow.fixedUpdate(1 / 60, game);
    expect(log.dmg.length).toBe(0);
    expect(p.hp).toBe(hp0);
  });

  it('348 FrostWave 命中 → Chilled 授予（StatusPlayer :11554）', () => {
    const p = new Player(30 * 16, 10 * 16, new Inventory());
    const game = makeGame(p, { dmg: [] });
    expect(p.buffs.has(BuffType.Chilled)).toBe(false);
    // 多次射击摊平概率（原版 1/2→600t、否则 300t,必中其一）
    for (let k = 0; k < 24 && !p.buffs.has(BuffType.Chilled); k++) {
      p.iframes = 0; // 清无敌帧让每发都结算
      const arrow = new Arrow(30 * 16 - 40, 10 * 16 + 8, 8, 0, 40, 0, 348, null,
        { grav: 0, life: 300, pierce: 1, hostile: true });
      for (let i = 0; i < 6; i++) arrow.fixedUpdate(1 / 60, game);
    }
    expect(p.buffs.has(BuffType.Chilled)).toBe(true);
    // 1457: Chilled 移速减速移出 moveSpeedMult 乘法链,折入
    // strongestMoveSpeedDebuff 取最强（Player.cs:26150-26152）——moveSpeedMult 恒 1
    expect(p.buffs.moveSpeedMult).toBe(1);
    expect(p.buffs.strongestMoveSpeedDebuff).toBeCloseTo(0.75, 5);
  });

  it('aiStyle 14 弹跳弹（希腊火 326）:落地反弹不消亡', () => {
    const p = new Player(30 * 16, 10 * 16, new Inventory());
    const game = makeGame(p, { dmg: [] });
    // 世界 FLOOR=20 行无地面,这里落到世界底边（store 底行实心边界外用 isSolid 判定,
    // 直接把弹体射向 y=20*16 以下的实心底——World 边界外 isSolid=false,故自建地面:
    // 使用 makeGame 的 world 在底部两行放实心块）
    const w = game.world.store;
    for (let x = 0; x < w.w; x++) { w.setTile(x, 20, 1); w.setTile(x, 21, 1); }
    const arrow = new Arrow(30 * 16, 14 * 16, 2, 3, 30, 0, 326, null,
      { grav: 0.2, life: 300, pierce: 1, hostile: true, bounce: true });
    let bounces = 0;
    let prevVy = arrow.vy;
    for (let i = 0; i < 200 && !arrow.dead; i++) {
      arrow.fixedUpdate(1 / 60, game);
      if (arrow.vy < 0 && prevVy > 0) bounces++; // 触地反弹（vy 翻负）
      prevVy = arrow.vy;
    }
    expect(bounces).toBeGreaterThan(0); // 弹跳发生
    expect(arrow.dead).toBe(false);      // 反弹不消耗弹体（寿命未尽不消亡）
  });
});