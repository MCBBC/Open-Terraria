// BJ587（2026-10-09）墓碑玩家面 Next 半开界 + aiStyle17 FTW 慢速清伤（BJ562 收刀登记两小债）
//
// 债1 玩家死亡墓碑面出膛掷两处 Next 整数半开界 off-by-one：
//   原版 Player.DropTombstone（Player.cs:39437）——
//     vx = Next(10, 30) * 0.1 * hitDirection + num   → 整数部 10..29（20 值）
//     vy = Next(-40, -20) * 0.1                      → 整数部 -40..-21（20 值）
//     （FTW 支同行三目：整式 ×1.5，Next 界不变）
//   本仓旧 *21 乘式溢出 30 / -20 两端点（城镇面 NPC.cs:79105 同界 *20 正确式已由
//   BJ562 落，玩家面 BJ562 未触）。游走（:39415 Next(-35,36)/Next(-30,31)）与
//   款式掷（:39418 Next(6) / :39425 Next(5)+527）逐值核对原界在守（回归锚）。
//
// 债2 aiStyle17 FTW 慢速清伤（Projectile.cs:25644-25648）：
//   getGoodWorld && |vx|+|vy| < 1 → damage = 0 / knockBack = 0——清弹自身字段，
//   恒久生效无恢复支；位次 = 重力/翻滚后、owner 门与安放判定前。FTW 专属支：
//   非 FTW 世界门恒假零行为差；城镇面出射墓碑 damage 恒 0（:79105 第 6/8 参直写 0）
//   → 纯 no-op 零改动。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { Tombstone } from '../src/entities/Tombstone';
import { TownNPC } from '../src/entities/TownNPC';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

/** 定序 RNG 桩：按调用序消费 seeds（穷尽后复用末值）——Tombstone 构造链
 *  （Entity 基类/longDate 均零随机消费，掷序稳定） */
function withRng(seeds: number[], fn: () => void): void {
  const orig = Math.random;
  let i = 0;
  Math.random = () => seeds[Math.min(i++, seeds.length - 1)];
  try { fn(); } finally { Math.random = orig; }
}

/** 定序构造玩家面墓碑。seeds = [游走init, 游走步, 款式Next(6), (高币Next(5)), vx, vy]。
 *  基准游走序列 [0.5, 0.82] → init=0（floor(0.5*71)-35）、步 +2.0（floor(0.82*61)-30
 *  = 20 → ×0.1 = 2.0）恰出环 → num = 2.0，款式种子 0 → roll 0 → 43（style 0） */
const NUM = 2.0;
function mkPlayer(seeds: number[], getGood = false, coinsOwned = 0, hitDirection = 1): Tombstone {
  let t!: Tombstone;
  withRng(seeds, () => {
    t = new Tombstone(100, 100, coinsOwned, 'x', hitDirection, getGood);
  });
  return t;
}

/** vx 整数部还原（vx = int*0.1*hd + num；hd=1 时 int = round((vx-num)*10)） */
function vxInt(t: Tombstone): number {
  return Math.round((t.vx - NUM) * 10);
}
/** vy 整数部还原（vy = int*0.1 → int = round(vy*10)；负域 Math.round 向 +∞ 不越档） */
function vyInt(t: Tombstone): number {
  return Math.round(t.vy * 10);
}

function mkFtwGame(getGood: boolean) {
  const w = new World(200, 200, 100, 'grave');
  w.seedFlags.getGoodWorld = getGood;
  const p = new Player(3000, 3000, new Inventory());     // 玩家远置（EVP 面不接）
  const npc = new TownNPC('nurse', 100 * 16, 99 * 16, new Inventory());
  const damagePlayer = vi.fn(() => 40);
  const hooks = {
    world: w,
    player: p,
    npcs: () => [npc],
    enemies: () => [],
    critters: () => [],
    achievements: { notifyProgressionEvent: () => {} },
    damagePlayer,
    addDamageNumber: () => {}, spawnParticles: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
  return { w, hooks, npc, damagePlayer };
}

describe('BJ587 债1：玩家面出膛 Next 半开界（Player.cs:39437）', () => {
  it('上界锁定：vx 整数部 29 在现 / 30 不现；vy 整数部 -21 在现 / -20 不现', () => {
    const t = mkPlayer([0.5, 0.82, 0, 0.99999, 0.99999]);
    expect(vxInt(t)).toBe(29);                       // 旧 *21 式此处出 30
    expect(vyInt(t)).toBe(-21);                      // 旧 *21 式此处出 -20
    expect(t.vx).toBeCloseTo(2.9 + NUM, 10);
    expect(t.vy).toBeCloseTo(-2.1, 10);
  });

  it('下界锁定：vx 整数部 10 在现；vy 整数部 -40 在现', () => {
    const t = mkPlayer([0.5, 0.82, 0, 0, 0]);
    expect(vxInt(t)).toBe(10);
    expect(vyInt(t)).toBe(-40);
    expect(t.vx).toBeCloseTo(1.0 + NUM, 10);
    expect(t.vy).toBeCloseTo(-4.0, 10);
  });

  it('全种子扫描（1000 点）：vx 恒 ⊆ 10..29、vy 恒 ⊆ -40..-21——30/-20 永不出现，', () => {
    const vxSet = new Set<number>();
    const vySet = new Set<number>();
    for (let s = 0; s < 1; s += 0.001) {
      const t = mkPlayer([0.5, 0.82, 0, s, s]);
      vxSet.add(vxInt(t));
      vySet.add(vyInt(t));
    }
    expect([...vxSet].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => 10 + i));
    expect([...vySet].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => -40 + i));
  });

  it('FTW ×1.5 分支同界（同行三目）：vy 上界 -21×0.1×1.5 = -3.15（-20 端点 -3.0 不现）', () => {
    const t = mkPlayer([0.5, 0.82, 0, 0.99999, 0.99999], true);
    expect(t.vy).toBeCloseTo(-3.15, 10);
    expect(Math.abs(t.vy + 3.0)).toBeGreaterThan(0.01);
    expect(t.vx).toBeCloseTo((2.9 + NUM) * 1.5, 10);
  });

  it('hitDirection 乘位：int×0.1×hd 先乘后加游走（原版式序）', () => {
    const t = mkPlayer([0.5, 0.82, 0, 0.99999, 0.99999], false, 0, -1);
    expect(t.vx).toBeCloseTo(-2.9 + NUM, 10);
  });

  it('游走界回归锚（:39415 Next(-35,36)/Next(-30,31)）：init ±3.5 / 步 ±3.0 原界在守', () => {
    // init 上界 35×0.1=3.5 → |init|≥2 出环不步进（步掷不消费 → 4 掷：init/款式/vx/vy）
    expect(mkPlayer([0.99999, 0, 0.99999, 0.99999]).vx).toBeCloseTo(2.9 + 3.5, 10);
    // init 下界 -35×0.1=-3.5 → 出环（同 4 掷）
    expect(mkPlayer([0, 0, 0.99999, 0.99999]).vx).toBeCloseTo(2.9 - 3.5, 10);
    // 步上界 +30×0.1=+3.0 / 下界 -3.0（init 0 必入环）
    expect(mkPlayer([0.5, 0.99999, 0, 0.99999, 0.99999]).vx).toBeCloseTo(2.9 + 3.0, 10);
    expect(mkPlayer([0.5, 0, 0, 0.99999, 0.99999]).vx).toBeCloseTo(2.9 - 3.0, 10);
  });

  it('款式掷回归锚（:39418 Next(6) / :39425 Next(5)+527）：roll 5 → 205(style 5)；高币 roll 4 → 531(style 10)', () => {
    expect(mkPlayer([0.5, 0.82, 0.99999, 0, 0]).style).toBe(5);
    // 高币支多一掷 Next(5)（:39425）——掷序 init/步/Next(6)/Next(5)/vx/vy
    const gold = mkPlayer([0.5, 0.82, 0.99999, 0.99999, 0, 0], false, 100001);
    expect(gold.style).toBe(10);
  });
});

describe('BJ587 债2：aiStyle17 FTW 慢速清伤（Projectile.cs:25644-25648）', () => {
  it('FTW 慢速（重力后 |vx|+|vy|<1）→ 当拍清伤 damage=0/knockBack=0，重叠镇民/玩家零结算', () => {
    const { hooks, npc, damagePlayer } = mkFtwGame(true);
    const t = new Tombstone(npc.cx - 7, npc.cy - 7, 0, 'x', 1, true);
    expect(t.dmg).toBe(70);                          // 出膛 FTW 70/10（:39431-39435）
    t.vx = 0.3; t.vy = -0.5;                         // 重力后 0.3 + 0.3 = 0.6 < 1
    const hpBefore = npc.hp;
    t.fixedUpdate(1 / 60, hooks);
    expect(t.dmg).toBe(0);
    expect(t.knockBack).toBe(0);
    expect(npc.hp).toBe(hpBefore);                   // dmg=0 → Damage 首门早退
    expect(damagePlayer).not.toHaveBeenCalled();     // EVP 面同门
  });

  it('FTW 快速（重力后 |vx|+|vy|≥1）→ 保留 70/10（阈上不清，飞行中恒伤）', () => {
    const { hooks } = mkFtwGame(true);
    const t = new Tombstone(1600, 800, 0, 'x', 1, true);
    t.vx = 0.9; t.vy = -0.5;                         // 重力后 0.9 + 0.3 = 1.2 ≥ 1
    t.fixedUpdate(1 / 60, hooks);
    expect(t.dmg).toBe(70);
    expect(t.knockBack).toBe(10);
  });

  it('清伤恒久无恢复支：清后再提速不回 70（原版只写不清，字段覆写语义）', () => {
    const { hooks } = mkFtwGame(true);
    const t = new Tombstone(1600, 800, 0, 'x', 1, true);
    t.vx = 0.3; t.vy = -0.5;
    t.fixedUpdate(1 / 60, hooks);
    expect(t.dmg).toBe(0);
    t.vx = 4; t.vy = -3;                             // 再度高速
    t.fixedUpdate(1 / 60, hooks);
    expect(t.dmg).toBe(0);
    expect(t.knockBack).toBe(0);
  });

  it('落地摩擦衰减入阈（vy==0 支 ×0.98/帧，原版 :25638-25640 → 清伤支同帧链）', () => {
    const { hooks } = mkFtwGame(true);
    const t = new Tombstone(1600, 800, 0, 'x', 1, true);
    t.vx = 0.9; t.vy = 0;                            // 贴地态（vy=0 走摩擦支）
    let frames = 0;
    while (t.dmg > 0 && frames++ < 60) {
      t.vy = 0;                                      // 逐拍重置贴地（碰撞归零等价）
      t.fixedUpdate(1 / 60, hooks);
    }
    expect(t.dmg).toBe(0);
    expect(frames).toBeLessThanOrEqual(12);          // 0.9×0.98^6 < 0.8 → ~6 拍入阈
  });

  it('门读 world.seedFlags（原版逐拍读 Main.getGoodWorld）：非 FTW 世界不清构造期 70', () => {
    const { hooks } = mkFtwGame(false);
    const t = new Tombstone(1600, 800, 0, 'x', 1, true);   // 构造期 FTW 70
    t.vx = 0.3; t.vy = -0.5;                         // 慢速档
    t.fixedUpdate(1 / 60, hooks);
    expect(t.dmg).toBe(70);                          // 门假 → 清伤支不进
  });

  it('城镇面零回归：FTW 世界慢速城镇墓碑 dmg/kb 恒 0（清伤支 no-op，不复活伤害面）', () => {
    const { hooks, npc, damagePlayer } = mkFtwGame(true);
    const t = new Tombstone(npc.cx - 7, npc.cy - 7, 0, 'x', 0, false, 17);   // 商人→金墓碑
    expect(t.dmg).toBe(0);                           // DropTombstoneTownNPC :79105 直写 0
    t.vx = 0.1; t.vy = -0.2;                         // 慢速档（若误接伤害面即现形）
    const hpBefore = npc.hp;
    t.fixedUpdate(1 / 60, hooks);
    expect(t.dmg).toBe(0);
    expect(t.knockBack).toBe(0);
    expect(npc.hp).toBe(hpBefore);
    expect(damagePlayer).not.toHaveBeenCalled();
  });

  it('BJ562 城镇面出膛界零回归：Next(10,30)/Next(-40,-20) 整数半开界（*20 式原样）', () => {
    let t!: Tombstone;
    // 城镇掷序（BJ562 钉）：游走init/游走步/抛币 Next(2)/款式 Next(6)/vx/vy
    withRng([0.5, 0.82, 0, 0.99999, 0.99999, 0.99999], () => {
      t = new Tombstone(0, 0, 0, 'x', 0, false, 22);
    });
    expect(t.style).toBe(5);                         // roll 5 → 205
    expect(t.vx).toBeCloseTo(29 * -0.1 + NUM, 10);   // 29 上界在现（30 不现）
    expect(t.vy).toBeCloseTo(-2.1, 10);              // -21 上界在现（-20 不现）
  });
});
