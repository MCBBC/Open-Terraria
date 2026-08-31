// 弹幕域 npc.immune[whoAmI] 写方桥回归（★GC1，2026-08-31 清零批二波；蓝队二轮
// F1/F5 裁决后重写：34 空参走补表 face 写 0——旧「末档 10t」金标为错误钉标已废）：
//   纯表 = data/vanillaProjImmuneTiers.ts（1457 Projectile.cs:14031-14183 命中尾
//   免疫梯逐支提取：显型定档/usesLocalNPCImmunity 写 0 清全局窗/末档 penetrate!=1→10/
//   旁路无写支 434·451·598·636·614 / 632 慢施放大档；判定序 idStatic→旁路→显型→
//   864/866/611/612→usesLocal 主支→末档，与原文链位一致）
//   三旗补表 = data/vanillaProjImmuneFaces.ts（F5：json 缺三布尔列的纯代码最小版）
//   桥接 = projTargets.noteVanillaProjImmune（统一出口 game.noteNpcPlayerImmune）
//   消费 = Game.meleeNpcImmuneGateOf（近战三重门 immune 分量,Player.cs:44598）与
//          noteNpcPlayerImmune ticks==0 显式清窗（Projectile.cs:14177 同拍出表）
import { describe, it, expect } from 'vitest';
import {
  projGlobalImmuneWriteTicks, PROJ_IMMUNE_NO_WRITE_TYPES, PROJ_IMMUNE_SLOW_MAGIC_TIER,
} from '../src/data/vanillaProjImmuneTiers';
import { noteVanillaProjImmune } from '../src/entities/projTargets';
import { Game } from '../src/core/Game';

describe('projGlobalImmuneWriteTicks 纯表（1457 Projectile.cs:14024-14186 逐支）', () => {
  it('显型定档：16→8（:14096-14098）/409→6/246·249·582·902→7/927·611·612→4', () => {
    expect(projGlobalImmuneWriteTicks(16)).toBe(8);
    expect(projGlobalImmuneWriteTicks(409)).toBe(6);
    for (const t of [246, 249, 582, 902]) expect(projGlobalImmuneWriteTicks(t)).toBe(7);
    for (const t of [927, 611, 612]) expect(projGlobalImmuneWriteTicks(t)).toBe(4);
  });

  it('显型定档二组：514→1；595·735·634·635·659·424..426→5；443·1110→8', () => {
    expect(projGlobalImmuneWriteTicks(514)).toBe(1);
    for (const t of [595, 735, 634, 635, 659, 424, 425, 426]) {
      expect(projGlobalImmuneWriteTicks(t)).toBe(5);
    }
    for (const t of [443, 1110]) expect(projGlobalImmuneWriteTicks(t)).toBe(8);
  });

  it('末档缺省：penetrate!=1 → 10；penetrate==1 且无单发旗标 → 无写(-1)', () => {
    expect(projGlobalImmuneWriteTicks(999999, { penetrate: 3 })).toBe(10);
    expect(projGlobalImmuneWriteTicks(999999, { penetrate: 2 })).toBe(10);
    expect(projGlobalImmuneWriteTicks(999999, { penetrate: 1 })).toBe(-1);
    expect(projGlobalImmuneWriteTicks(999999)).toBe(-1);   // 缺省=数据面 ??1
    expect(projGlobalImmuneWriteTicks(999999, { penetrate: 1, appliesSingleHit: true })).toBe(10);
  });

  it('局部面（usesLocalNPCImmunity）恒写 0＝显式清全局窗（:14176-14179）；idStatic 面 pen1 无写', () => {
    expect(projGlobalImmuneWriteTicks(34, { localFace: true })).toBe(0);
    expect(projGlobalImmuneWriteTicks(376, { idStaticFace: true, penetrate: 1 })).toBe(-1);
    expect(projGlobalImmuneWriteTicks(376, { idStaticFace: true, penetrate: 2 })).toBe(0);
  });

  it('旁路无写支：434/451/标枪上限族 598·636·614（顶层分派跳过整条梯子）', () => {
    for (const t of PROJ_IMMUNE_NO_WRITE_TYPES) {
      expect(projGlobalImmuneWriteTicks(t)).toBeLessThan(0);
      expect(projGlobalImmuneWriteTicks(t, { penetrate: -1 })).toBe(-1);
    }
  });

  it('632 慢施档哨兵值原样上抛（换算在桥层按 player.getSlowMagicUseTime 完成）', () => {
    expect(projGlobalImmuneWriteTicks(632)).toBe(PROJ_IMMUNE_SLOW_MAGIC_TIER);
  });
});

describe('noteVanillaProjImmune 桥层（game.noteNpcPlayerImmune 统一出口）', () => {
  function spyGame(slowMagic?: number) {
    const calls: Array<[number, number]> = [];
    return {
      calls,
      noteNpcPlayerImmune(npcId: number, ticks: number) { calls.push([npcId, ticks]); },
      player: slowMagic === undefined ? undefined : { getSlowMagicUseTime: () => slowMagic },
    };
  }

  it('正档写入；无写档不发；npcId 非法静默', () => {
    const g = spyGame();
    noteVanillaProjImmune(g, 16, 101);                 // 显型 8t（传值穿透缺省=数据面 1？——显型档不吃末档门）
    expect(g.calls).toEqual([[101, 8]]);
    g.calls.length = 0;
    noteVanillaProjImmune(g, 598, 102);                // 标枪族旁路 → 不发
    expect(g.calls).toEqual([]);
  });

  it('写 0 段透传（local face 清窗）；ticks===0 由 Game 侧删表实现覆盖于 Game 桩测', () => {
    const g = spyGame();
    noteVanillaProjImmune(g, 34, 103, { localFace: true, penetrate: 2 });
    expect(g.calls).toEqual([[103, 0]]);
  });

  it('632：经 player.getSlowMagicUseTime(5) 换算后落表（下限 5）', () => {
    const a = spyGame(12);
    noteVanillaProjImmune(a, 632, 104);
    expect(a.calls).toEqual([[104, 12]]);
    const b = spyGame(1.2);
    noteVanillaProjImmune(b, 632, 105);
    expect(b.calls).toEqual([[105, 5]]);
  });

  it('★F1 反向金标：34 空参走补表 local face → 写 0 清窗（旧"末档10t"钉标已废）', () => {
    const g = spyGame();
    noteVanillaProjImmune(g, 34, 106, {});
    expect(g.calls).toEqual([[106, 0]]);
    // 15 水矢类（无 penetrate 列/无三旗登记 → 1）→ flag3 族无写
    noteVanillaProjImmune(g, 15, 107, {});
    expect(g.calls.filter((c) => c[0] === 107)).toEqual([]);
  });

  it('★F1 悠悠球四型免疫档（SetDefaults :10530/:10599/:10638/:10655 亲读裁决）：全写 0 清窗', () => {
    const g = spyGame();
    noteVanillaProjImmune(g, 1125, 200);   // usesLocalNPCImmunity + cd=-1（:10541-10542）
    noteVanillaProjImmune(g, 1130, 201);   // usesLocalNPCImmunity + cd=-1、pen -1（:10610）
    noteVanillaProjImmune(g, 1134, 202);   // idStatic + appliesImmunityTimeOnSingleHits（:10645/:10652）
    noteVanillaProjImmune(g, 1135, 203);   // idStatic、pen -1（:10666）
    expect(g.calls).toEqual([[200, 0], [201, 0], [202, 0], [203, 0]]);
  });

  it('★梯序锁：显型定档压过局部 face（原版③④先于 :14175 主支；现役无双旗型为回归保险）', () => {
    expect(projGlobalImmuneWriteTicks(16, { localFace: true })).toBe(8);
    expect(projGlobalImmuneWriteTicks(611, { localFace: true })).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 共享时钟消费端集成（真实 Game 原型方法：noteNpcPlayerImmune↔meleeNpcImmuneGateOf）
// ---------------------------------------------------------------------------

describe('共享时钟：noteNpcPlayerImmune ↔ meleeNpcImmuneGateOf（近战三重门 :44598）', () => {
  function clockShell() {
    const g = Object.create(Game.prototype) as Record<string, any>;
    g.tickCount = 1000;
    return g;
  }

  it('命中窗内近战被拒；到期逐帧翻绿；ticks==0 即时清窗（弹幕局部面接管语义）', () => {
    const g = clockShell();
    g.noteNpcPlayerImmune(7, 30);                      // windows=[1000+30]
    expect(g.meleeNpcImmuneGateOf(7)).toBe(false);
    expect(g.meleeNpcImmuneGateOf(8)).toBe(true);      // 其它 NPC 无关
    g.tickCount = 1030;                                // :91564 减至 0 后出表的等价到期位
    expect(g.meleeNpcImmuneGateOf(7)).toBe(true);

    g.noteNpcPlayerImmune(9, 10);
    expect(g.meleeNpcImmuneGateOf(9)).toBe(false);
    g.noteNpcPlayerImmune(9, 0);                       // ★local/idstatic 面「写 0」清全局窗
    expect(g.meleeNpcImmuneGateOf(9)).toBe(true);
  });
});
