// EmergencyStacking MP 语义单测：
// ① mpOwned 门——傀儡堆绝不参与搬运（src/dst 双向出局）
// ② 返回值触达清单——被搬运改动且存活的堆入 touched（升面含 itemId 变化的 dst）
import { describe, expect, it } from 'vitest';
import { ItemDrop } from '../src/entities/ItemDrop';
import { emergencyStackItemsToMakeSpace } from '../src/world/EmergencyStacking';

/** 失真探针：vid 走自定义标记（不依赖物品键表），maxStack 钳 100 */
function mkCtx(opts?: {
  vid?: (d: ItemDrop) => number;
  owned?: (d: ItemDrop) => boolean;
}) {
  const promoted: ItemDrop[] = [];
  return {
    promoted,
    ctx: {
      vidOf: opts?.vid ?? ((d: ItemDrop) => (d as unknown as { probeVid: number }).probeVid),
      maxStackOf: () => 100,
      onlyNeedOne: () => false,
      viewCenters: [{ x: 0, y: 0 }],
      mpOwned: opts?.owned,
      promoteCoin: (d: ItemDrop) => {
        (d as unknown as { probeVid: number }).probeVid += 1;   // 原版 SetDefaults(下一级)
        d.stack = 1;
        promoted.push(d);
      },
    },
  };
}

function drop(stack: number, probeVid = 5, netPuppet = false): ItemDrop {
  const d = new ItemDrop(0, 0, 1, stack);
  (d as unknown as { probeVid: number }).probeVid = probeVid;
  d.netPuppet = netPuppet;
  return d;
}

describe('EmergencyStacking MP', () => {
  it('mpOwned 门把傀儡双端出局（有傀儡对也绝不合并）', () => {
    const own = drop(30);
    own.x = -50_000_000;   // 远离视野中心，若违规参与即最近距离对
    const pupA = drop(10, 5, true);
    const pupB = drop(20, 5, true);
    const { ctx } = mkCtx({ owned: (d) => !d.netPuppet });
    const res = emergencyStackItemsToMakeSpace([own, pupA, pupB], ctx);
    expect(res.freed).toBe(false);
    expect(pupA.dead || pupB.dead || pupA.stack !== 10 || pupB.stack !== 20).toBe(false);
    expect(res.touched.length).toBe(0);
  });

  it('自有对正常合并；touched = 存活的 dst 与半搬走的 src（死亡 src 不入）', () => {
    // 位置 30px 内（distanceOrder 同档），a 年轻 src、b 老 dst（IsPreferredDestination 反向门
    // 要求 src 不优于 dst——用 age 拉开：老堆做 dst）
    const dst = drop(90);
    dst.age = 500;
    const src = drop(40);
    src.age = 600;
    dst.x = 10;
    src.x = 40;
    const { ctx } = mkCtx();
    const res = emergencyStackItemsToMakeSpace([dst, src], ctx);
    // 搬 min(src40, dst余10)=10 → src 剩 30 存活（未搬空 → 不释放槽位）；
    // dst 满 100 触发 OnReachingMaxStack 探针钩子（probeVid 5→6、stack 重置 1）
    expect(res.freed).toBe(false);
    expect(src.dead).toBe(false);
    expect(src.stack).toBe(30);
    expect((dst as unknown as { probeVid: number }).probeVid).toBe(6);
    expect(dst.stack).toBe(1);
    expect(res.touched.includes(dst)).toBe(true);
    expect(res.touched.includes(src)).toBe(true);
  });

  it('满面升面钩子触发且 dst 入 touched（钱币换物场景）', () => {
    const dst = drop(95, 71);   // 铜
    dst.age = 500;
    const src = drop(20, 71);
    src.age = 600;
    dst.x = 10;
    src.x = 40;
    const { ctx, promoted } = mkCtx();
    const res = emergencyStackItemsToMakeSpace([dst, src], ctx);
    // 搬 min(20,5)=5 → dst 满 100 升面 → probeVid 72、stack=1
    expect(promoted).toEqual([dst]);
    expect((dst as unknown as { probeVid: number }).probeVid).toBe(72);
    expect(dst.stack).toBe(1);
    expect(src.stack).toBe(15);
    expect(res.touched.includes(dst)).toBe(true);
    expect(res.touched.includes(src)).toBe(true);
    expect(res.freed).toBe(false);   // src 未搬空，无槽位释放
  });
});
