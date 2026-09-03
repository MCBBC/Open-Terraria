import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { applyBannerDamageDealt, bannerDamageDealtSample } from '../src/entities/projTargets';
import { OLD_ONES_ARMY } from '../src/stats/ScaleStats';
import { bannerOfNpc, bannerItemId } from '../src/world/Banners';

// SW-M1 2026-09-03 回归：爆炸对 NPC/小动物伤害结算链乘区序（Game.explodeNpcDamageChain
// ← Projectile.Damage_PVE_Inner :12970-12981/:13388-13398 逐式;explodeAt 敌怪/小动物支共用）。
const chain = (o: Partial<Parameters<typeof Game.explodeNpcDamageChain>[0]>) =>
  Game.explodeNpcDamageChain({ projId: 0, npcType: 0, bannerApplied: 100, damageVar: 1, expertMode: false, ...o });

describe('SW-M1 爆炸伤害结算链乘区序（Damage_PVE_Inner）', () => {
  it('乘区序①：DamageVar 先于 1002 半伤（:12970→:12971;反向=3）', () => {
    expect(chain({ bannerApplied: 7, damageVar: 1.15, projId: 1002 })).toBe(4);   // round(8.05)=8→/2
    expect(chain({ bannerApplied: 7, damageVar: 1.15, projId: 30 })).toBe(8);     // 无半伤对照
  });
  it('乘区序②：DamageVar 先于 expert EoW /5（:12970→:13394;反向=2）', () => {
    expect(chain({ bannerApplied: 13, damageVar: 1.15, projId: 28, npcType: 14, expertMode: true })).toBe(3);
  });
  it('1002 半伤 × expert /5 复合（正数整除交换律）：100→50→10', () => {
    expect(chain({ bannerApplied: 100, projId: 1002, npcType: 15, expertMode: true })).toBe(10);
  });
  it('/5 边界：表外弹(133)/虫段 12·16 界外/经典档 均不折五', () => {
    expect(chain({ projId: 133, npcType: 14, expertMode: true })).toBe(100);
    expect(chain({ projId: 28, npcType: 12, expertMode: true })).toBe(100);
    expect(chain({ projId: 28, npcType: 16, expertMode: true })).toBe(100);
    expect(chain({ projId: 28, npcType: 14, expertMode: false })).toBe(100);
  });
  it('trap×旧日军团半伤（:12975）：108/1002×OOA 段;非 trap 弹/非 OOA 段不吃', () => {
    expect(chain({ projId: 108, npcType: 551 })).toBe(50);
    expect(chain({ projId: 1002, npcType: 578 })).toBe(25);   // 1002 型半伤×trap 半伤双乘（:12971+:12975 两判据独立）
    expect(chain({ projId: 30, npcType: 551 })).toBe(100);
    expect(chain({ projId: 108, npcType: 13 })).toBe(100);
    expect([...Game.EXPLODE_TRAP_PROJS].sort((a, b) => a - b)).toEqual([108, 1002]);
  });
  it('/5 弹型表 = 原文 20 型（:13389-13392 逐项）', () => {
    expect([...Game.EXPERT_EOW_FIFTH_PROJS].sort((a, b) => a - b))
      .toEqual([28, 29, 30, 37, 108, 181, 183, 281, 397, 470, 516, 517, 519, 566, 588, 637, 773, 1002, 1086, 1087]);
  });
  it('小动物支同链：旗乘区先于链（F11 收口序）——僵尸 3 经典档采样 1.5 → 150', () => {
    const world = new World(20, 20, 5, 'm1');   // 经典档
    const g = { bannerNpcActive: () => true, world } as unknown as Parameters<typeof applyBannerDamageDealt>[0];
    const sample = bannerDamageDealtSample(bannerItemId(bannerOfNpc(3)), 1);
    expect(sample).toBe(1.5);
    const b = applyBannerDamageDealt(g, { vanillaId: 3 }, 100);
    expect(b).toBe(150);
    expect(chain({ bannerApplied: b, projId: 30 })).toBe(150);   // 续链无衰减
    expect(OLD_ONES_ARMY.has(551)).toBe(true);
  });
});
