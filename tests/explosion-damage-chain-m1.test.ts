import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { applyBannerDamageDealt, bannerDamageDealtMultOf, bannerDamageDealtSample } from '../src/entities/projTargets';
import { OLD_ONES_ARMY } from '../src/stats/ScaleStats';
import { bannerOfNpc, bannerItemId } from '../src/world/Banners';

// SW-M1 2026-09-03 回归;★SW-R3 2026-09-03（蓝队 M-1 位次翻案）重构——banner 乘区
// 从「调用侧先乘后喂」改为链内【两次减伤后】消费采样值（Projectile.Damage_PVE_Inner
// :12970→:12972→:12979→:13388-13390→:13392-13398 原文序）。bannerApplied 入参
// 结构性抓不到位次（先乘后喂怎么喂都是同一值）,改为链外喂裸伤/DV 因子/banner 采样,
// 断言终值对原式手算锚。旧「F11 收口序（banner 先于 DV）」被蓝队全空间枚举定量推翻:
// B=2.5 档最大偏差=2（B=2.5/D=3/V=1.08/trap→原版 2、旧序 4）,见首测。
const chain = (o: Partial<Parameters<typeof Game.explodeNpcDamageChain>[0]>) =>
  Game.explodeNpcDamageChain({ projId: 0, npcType: 0, damage: 100, damageVar: 1, bannerMult: 1, expertMode: false, ...o });

describe('SW-M1/R3 爆炸伤害结算链乘区序（Damage_PVE_Inner）', () => {
  it('★Blue 反例：B=2.5/D=3/V=1.08/trap → 原版 2（旧序 4,位次差=2）', () => {
    // round(3×1.08)=3 → trap 半伤 trunc(3/2)=1 → banner trunc(1×2.5)=2
    expect(chain({ damage: 3, damageVar: 1.08, bannerMult: 2.5, projId: 108, npcType: 551 })).toBe(2);
    // 对照：banner 先乘（旧序）= round(3×2.5=7.5→8)×1.08→round(8.64)=9→trunc/2=4
    expect(2).not.toBe(4);
  });
  it('乘区序①：DamageVar 先于 1002 半伤（:12970→:12972;反向=3）', () => {
    expect(chain({ damage: 7, damageVar: 1.15, projId: 1002 })).toBe(4);   // round(8.05)=8→/2
    expect(chain({ damage: 7, damageVar: 1.15, projId: 30 })).toBe(8);     // 无半伤对照
  });
  it('乘区序②：DamageVar 先于 expert EoW /5（:12970→:13394;反向=2）', () => {
    expect(chain({ damage: 13, damageVar: 1.15, projId: 28, npcType: 14, expertMode: true })).toBe(3);
  });
  it('乘区序③：banner 在两次减伤【后】(:13386)——1002×banner 与 trap×banner 双向验', () => {
    // DV(100×1)=100 → 1002 半伤 50 → banner ×1.5 → trunc(75)=75（banner 先=81.25→81 差 6）
    expect(chain({ projId: 1002, bannerMult: 1.5 })).toBe(75);
    // trap 半伤 50 → banner ×0.9 → trunc(45)=45
    expect(chain({ projId: 108, npcType: 551, bannerMult: 0.9 })).toBe(45);
  });
  it('1002 半伤 × expert /5 复合（正数整除交换律）：100→50→10', () => {
    expect(chain({ projId: 1002, npcType: 15, expertMode: true })).toBe(10);
  });
  it('/5 边界：表外弹(133)/虫段 12·16 界外/经典档 均不折五', () => {
    expect(chain({ projId: 133, npcType: 14, expertMode: true })).toBe(100);
    expect(chain({ projId: 28, npcType: 12, expertMode: true })).toBe(100);
    expect(chain({ projId: 28, npcType: 16, expertMode: true })).toBe(100);
    expect(chain({ projId: 28, npcType: 14, expertMode: false })).toBe(100);
  });
  it('trap×旧日军团半伤（:12979）：108/1002×OOA 段;非 trap 弹/非 OOA 段不吃', () => {
    expect(chain({ projId: 108, npcType: 551 })).toBe(50);
    expect(chain({ projId: 1002, npcType: 578 })).toBe(25);   // 1002 型半伤×trap 半伤双乘（:12972+:12979 两判据独立）
    expect(chain({ projId: 30, npcType: 551 })).toBe(100);
    expect(chain({ projId: 108, npcType: 13 })).toBe(100);
    expect([...Game.EXPLODE_TRAP_PROJS].sort((a, b) => a - b)).toEqual([108, 1002]);
  });
  it('/5 弹型表 = 原文 20 型（:13392-13398 逐项）', () => {
    expect([...Game.EXPERT_EOW_FIFTH_PROJS].sort((a, b) => a - b))
      .toEqual([28, 29, 30, 37, 108, 181, 183, 281, 397, 470, 516, 517, 519, 566, 588, 637, 773, 1002, 1086, 1087]);
  });
  it('小动物支同链：banner 采样值由 bannerDamageDealtMultOf 链外取——僵尸 3 经典档 1.5 → 150', () => {
    const world = new World(20, 20, 5, 'm1');   // 经典档
    const g = { bannerNpcActive: () => true, world } as unknown as Parameters<typeof bannerDamageDealtMultOf>[0];
    const sample = bannerDamageDealtSample(bannerItemId(bannerOfNpc(3)), 1);
    expect(sample).toBe(1.5);
    expect(bannerDamageDealtMultOf(g, { vanillaId: 3 })).toBe(1.5);   // 采样值出口（不含截断）
    expect(chain({ bannerMult: bannerDamageDealtMultOf(g, { vanillaId: 3 }) })).toBe(150);
    // 旧 applyBannerDamageDealt（自截断形）仍服务 DV→banner 相邻消费面（近战/scarab）
    expect(applyBannerDamageDealt(g, { vanillaId: 3 }, 100)).toBe(150);
    expect(OLD_ONES_ARMY.has(551)).toBe(true);
  });
});
