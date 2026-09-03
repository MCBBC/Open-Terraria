// ② 1122 ArcSurge bolt 视觉余命 ×3 档闸门（Terarria1457 唯一标杆）：
// Kill 帧（Projectile.cs:71915）`MovementVector = new Vector2(num7, player.slowMagicUse.ToInt())`
// → 编排 Spawn_ArcLightning（ParticleOrchestrator.cs:1249-1256）：
//   `bool num = settings.MovementVector.Y == 1f; int num2 = 16; if (num) num2 *= 3;`
//   Prepare(…, num2, …) = StormLightningParticle.lifeTimeTotal = bolt 折线视觉寿命。
// slowMagicUse 置位端 = DoRunOutOfManaEffect（Player.cs:53258-53261,1457 ManaV2 空蓝
// 照施）；清位端 = CheckMana 入口 :53217（蓝够扣魔）。
// 仓内形态 = StormLightning.visualTotal（proj1457.ts）,Kill 帧实读 game.player。
import { describe, it, expect } from 'vitest';
import type { GameHooks } from '../src/entities/types';
import { StormLightning } from '../src/entities/proj1457';

function makeHooks(player?: Record<string, unknown>): GameHooks {
  const hooks = {
    world: { store: { inBounds: () => false, isSolid: () => false } } as never,
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false,
      facing: 1, vx: 0, vy: 0, slowMagicUse: false, mountedCenter: { x: 800, y: 1440 },
      ...player,
    } as never,
    enemies: () => [] as unknown[],
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    addLightAt: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
    whipTagShot: true,
  };
  return hooks as unknown as GameHooks;
}

function visualTicksToDead(b: StormLightning, g: GameHooks): number {
  let n = 0;
  while (!b.dead && n < 200) { b.fixedUpdate(1 / 60, g); n++; }
  return n;
}

describe('② StormLightning(1122) Spawn_ArcLightning num2 两档寿命', () => {
  it('常规蓝量（MovementVector.Y==0）→ num2=16：Kill 拍后 bolt 视觉余命 16 拍', () => {
    const g = makeHooks();
    const b = new StormLightning(1122, 800, 800, 180, 4);
    b.seed = 12345;
    b.fixedUpdate(1 / 60, g);                                    // 出生首拍即 Kill（timeLeft=1 :10447）
    expect((b as unknown as { visualT: number }).visualT).toBe(16);
    expect((b as unknown as { visualTotal: number }).visualTotal).toBe(16);
    expect(visualTicksToDead(b, g)).toBe(16);                    // 16 拍耗尽后 dead
  });

  it('空蓝慢施（slowMagicUse → MovementVector.Y==1）→ num2×3=48 档', () => {
    const g = makeHooks({ slowMagicUse: true });
    const b = new StormLightning(1122, 800, 800, 180, 4);
    b.seed = 12345;
    b.fixedUpdate(1 / 60, g);
    expect((b as unknown as { visualT: number }).visualT).toBe(48);
    expect(visualTicksToDead(b, g)).toBe(48);
  });

  it('档位在 Kill 拍实读（:71915 Kill 帧取 player.slowMagicUse）——构造后置位仍生效', () => {
    const g = makeHooks();
    const b = new StormLightning(1122, 800, 800, 180, 4);
    b.seed = 12345;
    (g.player as unknown as { slowMagicUse: boolean }).slowMagicUse = true;   // Kill 拍前置位
    b.fixedUpdate(1 / 60, g);
    expect((b as unknown as { visualT: number }).visualT).toBe(48);
    // 反向：慢施拍已过（蓝量恢复）→ 回 16 档（CheckMana :53217 入口清）
    const g2 = makeHooks({ slowMagicUse: true });
    const b2 = new StormLightning(1122, 800, 800, 180, 4);
    b2.seed = 12345;
    (g2.player as unknown as { slowMagicUse: boolean }).slowMagicUse = false; // Kill 拍前已清
    b2.fixedUpdate(1 / 60, g2);
    expect((b2 as unknown as { visualT: number }).visualT).toBe(16);
  });

  it('1117 天雷不受该档影响（恒 Spawn_StormLightning num=45）——slowMagic 置位仍 45', () => {
    const g = makeHooks({ slowMagicUse: true });
    const b = new StormLightning(1117, 800, 800, 150, 10);
    b.seed = 777;
    for (let i = 0; i < 30; i++) b.fixedUpdate(1 / 60, g);       // 1117 寿命 30t 风窗后才 Kill
    expect((b as unknown as { visualT: number }).visualT).toBe(45);
  });
});
