// 敌弹命中玩家回归（原版 Projectile.Damage_EVP，Projectile.cs:13706-13830）：
// 此前全仓投射物 fixedUpdate 只判敌人/小动物,Boss 弹幕对玩家无伤害——战斗核心缺口。
// 覆盖：
//  1. hostile 弹命中玩家 → damagePlayer 调用 + 掉血；iframes 内不重复结算；
//  2. hostile 弹命中不消耗弹体（原版 :13811-13829 仅特判型递减）；
//  3. 玩家自己的弹（hostile=false 默认）不伤玩家；
//  4. 348 FrostWave 命中 → Chilled/Frozen 授予（Projectile.StatusPlayer :11554-11567）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/stats/Inventory';
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
    damagePlayer: (dmg: number) => { log.dmg.push(dmg); },
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
    expect(log.dmg[0]).toBe(25);
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
    const arrow = new Arrow(30 * 16 - 40, 10 * 16 + 8, 8, 0, 9, 1, 1, 'wooden_arrow');
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
    // Chilled 移速 ×0.75（Player.cs:25659-25661）
    expect(p.buffs.moveSpeedMult).toBeCloseTo(0.75, 5);
  });
});
