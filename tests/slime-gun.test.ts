// 史莱姆枪 2610 使用链回归（2026-08-30 用户实报"使用零效果"）：
//   根因=combatWeapon 对无伤害类标志(useStyle5 玩具枪)返 null,'shot' 兜底不可达
//   → Game.updateUse 新增 2610 直发支(fireSlimeGun) + 弹体实体 SlimeGlob
//     （Projectile 406 AI_060:缩放寿命 ~67t / Slimed(137)180t 单次施加后即爆 /
//      蓝黏尘尾+爆 / 入液即爆）。
//   Slimed 消费链(Enemy.slimedT ×2 火伤翻倍)与 projStatus SUPPORTED 注册此前已建。
// 2026-08-30 X-F2 修复批：AI_060 公共扫描语义对齐——①ai[0]>3 出生门(:29438,
// ai[1]=NewProjectile :10919-10920 Next(10,21)×0.1 掷定步进率)②重叠 NPC AddBuff
// 后立即 Kill 即爆(:29479→:29481,Kill !active 护栏 Projectile.cs:71756 ⇒ 只爆一次)
// ③液体触杀支(:29531-29555,Bottom.Y>水面线即 Kill)。本文件随之改写:直投测试
// 由单 tick 改为循环至死(gate 使首施加最早第 3 拍、最迟第 5 拍),新增入液即爆用例。
// 锚点：Item.cs case 2610 :25505-25518 / Projectile.cs :4866-4875(SetDefaults)/
//       :29430-29700(AI)/:75506-75515(Kill 尘爆)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';            // 断活环加载序（同 chester-pet 先例）
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { SlimeGlob } from '../src/entities/SlimeGlob';
import { seededRandom, BATTERY_SEED } from './seeded-rng';

// ★SW-BN6 2026-09-08 电池族 RNG 统一播种（范式=seeded-rng.ts,推广自 slime-item-ladder-parity）:
// 用例②③的 ai[0]>3 出生门掷流（Next(10,21)×0.1 步进率）依赖序列映射,播种后恒定。
beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

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

  it('Slimed 单次施加+即爆:重叠 NPC 得 slimedT=3s 且弹当拍死亡;出生门后不再追加;无效目标跳过', () => {
    const g = slimeGunGame([51 * TILE, 90 * TILE]);
    // vx=vy=0 让重叠全程保持——首施加拍数只取决于 ai[0]>3 门(3-5 拍掷定),与位移无关
    const glob = new SlimeGlob(g.player.cx + 10, g.player.cy, 0, 0);
    const e1 = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;        // 14×14 盒内重叠
    (e1 as unknown as { lifeMax: number }).lifeMax = 25;
    const ghost = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;
    (ghost as unknown as { dontTakeDamage?: boolean }).dontTakeDamage = true;
    const critterlike = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;
    (critterlike as unknown as { lifeMax: number }).lifeMax = 1;      // 原版 lifeMax<=1 门
    (g as unknown as { enemies(): unknown[] }).enemies = () => [e1, ghost, critterlike];
    void g;
    let burstThisTick = false;
    let firstHitTick = -1;
    let tick = 0;
    while (!glob.dead && tick < 12) {
      tick++;
      const before = g.particleCount;
      glob.fixedUpdate(1 / 60, g as never);
      if (e1.slimedT > 0 && firstHitTick < 0) firstHitTick = tick;   // 首施加拍
      if (g.particleCount - before >= 30) burstThisTick = true;       // 尘爆拍(trail 恒 6 粒/拍)
    }
    expect(glob.dead).toBe(true);                                    // 施加即 Kill(:29470-29480)
    expect(firstHitTick).toBe(tick);                                 // 同一拍:先 AddBuff 后 Kill——buff 必已落账再爆
    expect(firstHitTick).toBeGreaterThanOrEqual(3);                  // ai[0]>3 出生门(:29438),Next(10,21)×0.1 ⇒ 最早第 3 拍
    expect(firstHitTick).toBeLessThanOrEqual(5);                     // 步进率上限 2.0 ⇒ 最迟第 5 拍
    expect(burstThisTick).toBe(true);                                // 当拍 40 粒尘爆且仅此一次
    expect(e1.slimedT).toBeCloseTo(3, 5);                            // 137×180t 单次落账(旧光环实现会被逐拍续期吞掉即爆语义)
    expect((ghost as unknown as { slimedT?: number }).slimedT ?? 0).toBe(0);
    expect((critterlike as unknown as { slimedT?: number }).slimedT ?? 0).toBe(0);
  });

  it('入液即爆:覆盖格任一液面低于 Bottom → 触杀(:29531-29555 num452==137 支);门前不炸', () => {
    const g = slimeGunGame([50 * TILE + 64, 90 * TILE]);
    const st = (g.world as World).store;
    // 玩家行带(y≈1440px,row89-90 与弹盒重合)铺满量水列——水面线=ty*16,Bottom.Y>水面线恒真
    for (let i = 55; i <= 62; i++) {
      st.liquid[st.idx(i, 89)] = 255;
      st.liquid[st.idx(i, 90)] = 255;
    }
    const blob = new SlimeGlob(g.player.cx + 100, g.player.cy, 0, 0); // 静置在水面上方盒内,等门开即触杀
    let burstSeen = false;
    let tick = 0;
    while (!blob.dead && tick < 12) {
      tick++;
      const before = g.particleCount;
      blob.fixedUpdate(1 / 60, g as never);
      if (g.particleCount - before >= 30) burstSeen = true;
      if (tick <= 2) expect(blob.dead).toBe(false);                  // 出生头 2 拍不触杀(ai[0]>3 门)
    }
    expect(blob.dead).toBe(true);
    expect(tick).toBeGreaterThanOrEqual(3);
    expect(tick).toBeLessThanOrEqual(5);
    expect(burstSeen).toBe(true);                                    // 触杀走同一 killBurst 收口
  });

  it('寿命:scale −0.015/t → ~67t 死亡 + 40 粒爆尘;重力尾(:29604 ai[0]>30→vy+=0.1 先判后加)跨阈单调', () => {
    const g = slimeGunGame([50 * TILE + 64, 90 * TILE]);
    const blob = new SlimeGlob(g.player.cx, g.player.cy, 8, 0);
    let sawParticles = false;
    let ticks = 0;
    while (!blob.dead && ticks < 120) {
      const vyBefore = blob.vy;
      blob.fixedUpdate(1 / 60, g as never);
      if (g.particleCount >= 40) sawParticles = true;
      ticks++;
      // 重力尾只加不减(aiRate≥1 ⇒ 阈内恒不变);aiRate∈{1.0..2.0} 保证必然跨阈
      expect(blob.vy).toBeGreaterThanOrEqual(vyBefore);
    }
    expect(blob.dead).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(66);                        // 1/0.015≈66.7
    expect(sawParticles).toBe(true);                                 // Kill 尘爆(:75506)
    expect(blob.vy).toBeGreaterThan(0);                              // 尾程重力积累(:29604)
  });
});
