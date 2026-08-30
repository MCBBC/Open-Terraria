// 史莱姆枪 2610 使用链回归（2026-08-30 用户实报"使用零效果"）：
//   根因=combatWeapon 对无伤害类标志(useStyle5 玩具枪)返 null,'shot' 兜底不可达
//   → Game.updateUse 新增 2610 直发支(fireSlimeGun) + 弹体实体 SlimeGlob
//     （Projectile 406 AI_060:缩放寿命 ~67t / Slimed(137)180t 直投 / 蓝黏尘尾+爆）。
//   Slimed 消费链(Enemy.slimedT ×2 火伤翻倍)与 projStatus SUPPORTED 注册此前已建。
// 锚点：Item.cs case 2610 :25505-25518 / Projectile.cs :4866-4875(SetDefaults)/
//       :29430-29700(AI)/:75506-75515(Kill 尘爆)
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';            // 断活环加载序（同 chester-pet 先例）
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { SlimeGlob } from '../src/entities/SlimeGlob';

/** 最小 Game 桩（chesterGame 同法）：真实 Player + 记录面 */
function slimeGunGame(mouseAt: [number, number]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    sfxFiles: string[];
    synthFallbacks: string[];
    projectiles: unknown[];
    particleCount: number;
    swings: number;
  };
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  g.player = player;
  g.world = new World(200, 200, 30);
  g.camera = { screenToWorld: () => mouseAt };
  g.enemies = () => [] as unknown[];
  g.input = { mouseX: mouseAt[0] - player.cx, mouseY: mouseAt[1] - player.cy,
    mouseDown: false, rightDown: false, uiBlocking: false };
  g.entities = { add: (e: unknown) => { g.projectiles.push(e); } };
  g.projectiles = [];
  g.sfxFiles = [];
  g.synthFallbacks = [];
  g.particleCount = 0;
  g.swings = 0;
  g.playSfxFile = (f: string) => { g.sfxFiles.push(f); return true; };
  g.sfx = { play: (_n: string) => { g.synthFallbacks.push(_n); } };
  g.spawnParticles = () => { g.particleCount++; };
  g.useSwing = () => { g.swings++; };
  g.playUseSound.call(g as never, 2610, 'throw');
  return g;
}

const HELD = { key: 'vi_2610_SlimeGun', vid: 2610 };

describe('史莱姆枪 2610 使用链（Item.cs case 2610 :25505-25518）', () => {
  it('fireSlimeGun:朝鼠标 speed8 发一枚 SlimeGlob + Item_181 数据面音 + useTime12', () => {
    // 鼠标在玩家右侧 40px、下方 30px → 方向 (4,-3)? 取正交样本:(48,36) → 归一×8=(6.4,4.8)
    const g = slimeGunGame([50 * TILE + 64, 90 * TILE + 48]);
    (g.player.useTime as number) = 0;
    (g as unknown as { fireSlimeGun(d: unknown): void }).fireSlimeGun(HELD);
    expect(g.projectiles).toHaveLength(1);
    const blob = g.projectiles[0] as SlimeGlob;
    expect(blob).toBeInstanceOf(SlimeGlob);
    expect(Math.hypot(blob.vx, blob.vy)).toBeCloseTo(8, 5);          // shootSpeed=8(:25511)
    expect(blob.vx).toBeGreaterThan(0);
    expect((g.player as unknown as { facing: number }).facing).toBe(1);
    expect((g.player as unknown as { useTime: number }).useTime).toBe(12); // useAnimation=12
    expect(g.sfxFiles).toContain('Item_181');                        // UseSound(:25517)
    expect(g.swings).toBe(1);                                        // useStyle5 举持
  });

  it('Slimed 直投:重叠 NPC 得 slimedT=3s(137×180t→秒)；dontTakeDamage/lifeMax<=1 跳过', () => {
    const g = slimeGunGame([51 * TILE, 90 * TILE]);
    const glob = new SlimeGlob(g.player.cx + 10, g.player.cy, 8, 0);
    const e1 = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;        // 14×14 盒内重叠
    (e1 as unknown as { lifeMax: number }).lifeMax = 25;
    const ghost = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;
    (ghost as unknown as { dontTakeDamage?: boolean }).dontTakeDamage = true;
    const critterlike = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;
    (critterlike as unknown as { lifeMax: number }).lifeMax = 1;      // 原版 lifeMax<=1 门
    (g as unknown as { enemies(): unknown[] }).enemies = () => [e1, ghost, critterlike];
    void g;
    const spawnSpy = (() => { let n = 0; return { n: () => n, bump: () => n++ }; })();
    g.spawnParticles = () => { spawnSpy.bump(); };
    glob.fixedUpdate(1 / 60, g as never);
    expect(e1.slimedT).toBeCloseTo(3, 5);                            // 180t/60=3s,火系 DoT ×2 承接
    expect((ghost as unknown as { slimedT?: number }).slimedT ?? 0).toBe(0);
    expect((critterlike as unknown as { slimedT?: number }).slimedT ?? 0).toBe(0);
  });

  it('寿命:scale −0.015/t → ~67t 死亡 + 40 粒爆尘；直线无重力(vy 不变)', () => {
    const g = slimeGunGame([50 * TILE + 64, 90 * TILE]);
    const blob = new SlimeGlob(g.player.cx, g.player.cy, 8, 0);
    let sawParticles = false;
    let ticks = 0;
    while (!blob.dead && ticks < 120) {
      blob.fixedUpdate(1 / 60, g as never);
      if (g.particleCount >= 40) sawParticles = true;
      ticks++;
      expect(blob.vy).toBe(0);                                       // AI_060 无重力登记
    }
    expect(blob.dead).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(66);                        // 1/0.015≈66.7
    expect(sawParticles).toBe(true);                                 // Kill 尘爆(:75506)
  });
});
