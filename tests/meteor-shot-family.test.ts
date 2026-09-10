// 流星法杖 2750 → 流星弹 424/425/426 出生面锁(R3 登记项核修,2026-09-03):
//  Player.cs:48121-48153(2750 支)+ AI_001 type≥424&&≤426 支(Projectile.cs:58009-58040,
//  1458 同值 :58010)。
//  ★R3 翻案钉:台账「2750 施法尾参 ai2=0.5+rand×0.3 → 随机 PhoenixQuivered 位」系
//  参数位误读——Player.cs:48153 =【11 参调用】,NewProjectile(:10864) 第 10/11 参 =
//  ai0=0f、ai1=0.5+rand×0.3,ai2 缺省 0;AI_001_Features(:241-289) 只解 ai[2]
//  (bit0 HarpyCharmed/bit1 Consumed/bit2 PhoenixQuivered/bit3 Seraph) → 位标全 0,
//  StatusNPC 323 300t(:11179-11182)/凤凰尘(:54961-54969)/GetAlpha 白(:80607-80613)
//  对 424-426 恒不可达。原版消费该随机值的实面 = scale = ai[1](:58019)。
//  本仓修面:ctor drawScale 掷定由 424 扩到族三型(曾 425/426 恒 1,视觉偏大 25-100%)。
import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

describe('流星法杖 2750 → 流星弹 424-426 出生面(R3)', () => {
  it('①scale=ai[1] 同分布掷定:三型 drawScale ∈ [0.5,0.8)(曾只 424,425/426 恒 1)', () => {
    for (let i = 0; i < 200; i++) {
      for (const pid of [424, 425, 426]) {
        const a = new Arrow(1000, 1600, 6, 0, 10, 1, pid, {});
        expect(a.drawScale, `pid ${pid}`).toBeGreaterThanOrEqual(0.5);
        expect(a.drawScale, `pid ${pid}`).toBeLessThan(0.8);
      }
    }
  });

  it('②PhoenixQuivered 位不可达:ai[2]=0 → 三位标全 false(StatusNPC :11179 门死,翻案钉)',
    () => {
      for (const pid of [424, 425, 426]) {
        const a = new Arrow(1000, 1600, 6, 0, 10, 1, pid, {});
        expect(a.phoenixQuivered, `pid ${pid}`).toBe(false);
        expect(a.harpyCharmed, `pid ${pid}`).toBe(false);
        expect(a.seraphNecklaced, `pid ${pid}`).toBe(false);
      }
    });

  it('③tileCollide 动态门三型同修(:58011-58017):y 低于玩家-300 → noTileCollide 复位'
    + '(曾只 424,425/426 全寿穿墙活弹)', () => {
    const w = new World(120, 160, 30, 'ms');
    const game = {
      world: w, player: { y: 30 * 16 }, enemies: () => [], critters: () => [],
      projectiles: () => [],
      entities: { nextId: 1, add: () => {} },
      playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
      spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
      damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
      addLightAt: () => {}, onProjectileDeath: () => {},
      broadcastParticleOrchestra: () => {}, spawnDust: () => null,
    } as unknown as GameHooks;
    for (const pid of [424, 425, 426]) {
      const a = new Arrow(40 * 16, 40 * 16, 6, 0, 10, 1, pid, {});
      expect(a.noTileCollide, `pid ${pid} init`).toBe(true);    // SetDefaults tileCollide=false
      a.fixedUpdate(1 / 60, game);
      expect(a.noTileCollide, `pid ${pid} reset`).toBe(false);  // y(640) > player.y-300(180)
    }
  });
});
