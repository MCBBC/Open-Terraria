// 掉落扫描帧上下文回归锁（2026-08-31 腐化地掉落潮性能修复配套）。
// 病灶与收益见 src/entities/dropScanCtx.ts 头注；本文件锁四件事：
//  ① 快照值 == 直读 getter（等价性基础）
//  ② 帧内恒定契约：begin 后中途改磁石输入不冲刷快照（drops 桶写面不可达该域，
//     故这是【设计内】的一帧陈旧窗——重复 begin 才刷新）
//  ③ Entities.update 进入 drops 桶恰建一次快照，多掉落共享同一引用；下一 tick 换新
//  ④ 无快照（不经 Entities.update 的直调路径）→ getDropScanCtx 为 null = 消费端走旧逐次计算
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { EntityManager, Entity } from '../src/entities/Entity';
import type { GameHooks } from '../src/entities/types';
import { beginDropScanCtx, getDropScanCtx } from '../src/entities/dropScanCtx';

function mk(): Player {
  return new Player(60 * 16, 90 * 16, new Inventory());
}

describe('dropScanCtx 帧快照', () => {
  it('①快照 == 直读 getter（grab/heart/star/preventAll 四项）', () => {
    const p = mk();
    beginDropScanCtx(p);
    const c = getDropScanCtx(p)!;
    expect(c).not.toBeNull();
    expect(c.grab).toBe(p.grabRangeBonus);
    expect(c.heart).toBe(p.heartGrabBonus);
    expect(c.star).toBe(p.manaMagnetBonus);
    expect(c.preventAll).toBe(!!p.equipStats.preventAllItemPickups);
  });

  it('②帧内恒定契约：begin 后 buff 变化不冲刷快照，重复 begin 才刷新', () => {
    const p = mk();
    expect(p.buffs.has(BuffType.Heartreach)).toBe(false);
    beginDropScanCtx(p);
    const before = getDropScanCtx(p)!;
    expect(before.heart).toBe(0);
    // 帧中途的写面变化（此例=测试直写；真实帧序里 buffs 衰减在玩家段、拾取写面
    // 触不到 magnet 输入域——见模块头注恒定性论证）
    p.buffs.apply(BuffType.Heartreach, 10);
    expect(getDropScanCtx(p)!.heart).toBe(0);          // 帧内冻结
    beginDropScanCtx(p);                               // 下一帧重建
    expect(getDropScanCtx(p)!.heart).toBe(p.heartGrabBonus);
  });

  it('③Entities.update 进 drops 桶建一次快照：多掉落同引用、跨 tick 换新', () => {
    const p = mk();
    beginDropScanCtx(p);                                // 预置旧代快照(验证每 tick 重建)
    const ents = new EntityManager();
    let seen1: unknown | null = null;
    let seen2: unknown | null = null;
    const mkFake = (slot: 'a' | 'b') =>
      ({
        id: 0, x: 0, y: 0, w: 12, h: 12, vx: 0, vy: 0,
        dead: false, onGround: false, hitWall: false, hitHead: false,
        collideY: false, dropThrough: false, liqFactor: 1, netPuppet: false, netId: 0,
        fixedUpdate() {
          if (slot === 'a') seen1 = getDropScanCtx(p);
          else seen2 = getDropScanCtx(p);
        },
      }) as unknown as Entity;
    ents.add(mkFake('a'), 'drops');
    ents.add(mkFake('b'), 'drops');
    const game = { player: p } as unknown as GameHooks;
    ents.update(1 / 60, game);
    expect(seen1).not.toBeNull();
    expect(seen2).toBe(seen1);                          // 同帧多掉落共享同一快照
    const first = seen1;
    ents.update(1 / 60, game);
    expect((getDropScanCtx(p)! as unknown) !== (first as unknown)).toBe(true);  // 每 tick 重建
  });

  it('④未 begin（直调路径）→ ctx 为 null ⇒ 消费端回退旧逐次计算', () => {
    const p = mk();
    expect(getDropScanCtx(p)).toBeNull();
  });

  it('⑤数量级护栏：帧快照路由下 equipStatsKey 全量重建恒 ≤4 次/帧（旧路径=N掉落×2）', () => {
    // 计数器挂原型——每次访问 get equipStats 都先全量重建内容键(equipStatsKey)
    // 再做相等比较(trace 定罪的就是这个"命中也要先建键"的 O(全身装备+背包) 成本)
    const p = mk();
    const proto = Object.getPrototypeOf(p) as Record<string, unknown>;
    const orig = proto.equipStatsKey as () => string;
    let n = 0;
    proto.equipStatsKey = function (this: Player) { n++; return orig.call(this); };
    try {
      p.equipStats;                                    // 预热基线
      const base = n;
      // 旧路径等价回放：50 个掉落物 × 每物两次访问(grabRange/canAccept)
      for (let i = 0; i < 50; i++) {
        p.getItemGrabRangeBonus(-1);
        p.canAcceptItemIntoInventory(71);              // IsACoin 成员(金戒指门达)
      }
      const legacyDelta = n - base;
      // 快照路由：begin 内的触点 = grab(内部两次读,getItemGrabRangeBonus 里
      // treasureMagnet 行+eq 别名行各一)+star(1)+preventAll(1) = 恒 4 次键构造/帧,
      // 与掉落物数量完全解耦
      n = 0;
      beginDropScanCtx(p);
      const ctxDelta = n;
      expect(legacyDelta).toBeGreaterThanOrEqual(50);   // 每"掉落物"至少 1 次重建
      expect(ctxDelta).toBeLessThanOrEqual(4);          // ★本修复的上限契约(N 解耦)
      // 同帧二次 begin：断言不随 begin 次数线性增长(仍受单键缓存托底)
      beginDropScanCtx(p);
      expect(n).toBeLessThanOrEqual(8);
    } finally {
      delete proto.equipStatsKey;                       // 还原原型(guard 不泄漏给后续套件)
      void orig;
    }
  });
});
