// 渔获匣 26 型号 + S 级开箱小件族（锁盒/蠕虫罐/牡蛎/麒麟蛋/钱槽）对账
// （src/data/vanillaFishingCrates.ts + vanillaOpenBags.ts ← Player.cs
//   OpenFishingCrate :7667-8921 / OpenLockBox :9031 / OpenShadowLockbox :9011 /
//   OpenCanofWorms :9140 / OpenOyster :9154 / OpenChilletEgg :9188，
//   入口 ItemSlot.TryOpenContainer_GrantItems :1662-1721）。
// 双档语义：flag = IsFishingCrateHardmode[匣子物品 id]（ItemID.cs:1082）——
// 2334-2336/3203-3208/4405/4407/4877/5002 普通档，3979-3987/4406/4408/4878/5003
// 困难档，同支代码靠 flag 切表（非世界 hardMode 旗标）。
// 脚本化 BagRand 逐支断言（脚本值直接作为 Next 返回值，队列耗尽即抛错防静默漂移）；
// 分布抽查用 UnifiedRandom（与 Main.rand 位级同源）做种子桩。
import { describe, it, expect } from 'vitest';
import {
  openBagItem, MONEY_TROUGH_USE, OPENABLE_BAG_VIDS, type BagRand,
} from '../src/data/vanillaOpenBags';
import {
  FISHING_CRATE_VIDS, FISHING_CRATE_HARDMODE_VIDS,
} from '../src/data/vanillaFishingCrates';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { UnifiedRandom } from '../src/core/rng';

/** 定序源：队列耗尽抛错（漏掷一支立刻暴露，不静默吞掉）。
 *  ★SW-RB11c（2026-09-10）掷域校验补盲：脚本值必须 ∈ 被测调用声明的
 *  next(a)/next(a,b) 值域——哑 rng 直返脚本值对「next(3)→next(2)」一类
 *  掷域收缩变异失明（等额消费同序时脚本可自洽通过,变异实验实证）。
 *  参照 sw-fx13-crate-matrix.test.ts seqCounted 同款判别力。 */
function seq(vals: number[]): BagRand {
  return {
    next: (a, b) => {
      if (vals.length === 0) throw new Error(`RNG 队列耗尽（next(${a}${b === undefined ? '' : `, ${b}`})）`);
      const v = vals.shift() as number;
      const lo = b === undefined ? 0 : a;
      const hi = b === undefined ? a : b;
      if (v < lo || v >= hi) {
        throw new Error(`掷域越界：next(${a}${b === undefined ? '' : `, ${b}`}) 脚本值 ${v} ∉ [${lo},${hi})——被测代码掷域漂移或脚本错位`);
      }
      return v;
    },
  };
}

/** 收集 give 出口为 [id, stack] 列表 */
function run(
  vid: number,
  rnd: BagRand,
  opts: {
    hardMode?: boolean; remixWorld?: boolean; getGoodWorld?: boolean; skyblockLowTiles?: boolean;
    consumeItem?: (v: number) => boolean; hasItem?: (v: number) => boolean;
  } = {},
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const ok = openBagItem(vid, (id, n) => out.push([id, n ?? 1]), {
    hardMode: opts.hardMode ?? false,
    remixWorld: opts.remixWorld,
    getGoodWorld: opts.getGoodWorld,
    skyblockLowTiles: opts.skyblockLowTiles,
    consumeItem: opts.consumeItem,
    hasItem: opts.hasItem,
  }, rnd);
  expect(ok).toBe(true);
  return out;
}

/** UnifiedRandom → BagRand 适配（Main.rand 位级同源，种子桩） */
function seeded(seed: number): BagRand {
  const r = new UnifiedRandom(seed);
  return { next: (a, b) => (b === undefined ? r.nextInt(a) : r.nextIntRange(a, b)) };
}

/** 真随机源（注册完整性大样本用） */
const real: BagRand = {
  next: (a, b) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a))),
};

// ---------------------------------------------------------------------------
describe('渔获匣集合（ItemID.cs:1080/1082）', () => {
  it('IsFishingCrate 26 件逐项一致（含普通 14 + 困难 12 计数口径）', () => {
    expect([...FISHING_CRATE_VIDS].sort((a, b) => a - b)).toEqual([
      2334, 2335, 2336, 3203, 3204, 3205, 3206, 3207, 3208,
      3979, 3980, 3981, 3982, 3983, 3984, 3985, 3986, 3987,
      4405, 4406, 4407, 4408, 4877, 4878, 5002, 5003,
    ]);
    expect(FISHING_CRATE_VIDS.size).toBe(26);
  });
  it('IsFishingCrateHardmode 13 件 = 全部困难档匣（普通匣全 false）', () => {
    expect([...FISHING_CRATE_HARDMODE_VIDS].sort((a, b) => a - b)).toEqual([
      3979, 3980, 3981, 3982, 3983, 3984, 3985, 3986, 3987, 4406, 4408, 4878, 5003,
    ]);
    for (const v of [2334, 2335, 2336, 3203, 3204, 3205, 3206, 3207, 3208, 4405, 4407, 4877, 5002]) {
      expect(FISHING_CRATE_HARDMODE_VIDS.has(v), `普通匣 ${v}`).toBe(false);
    }
  });
  it('26 匣全部走本引擎（openBagItem true）且在 OPENABLE_BAG_VIDS UI 门内', () => {
    for (const v of FISHING_CRATE_VIDS) {
      expect(openBagItem(v, () => {}, { hardMode: false }), `匣 ${v}`).toBe(true);
      expect(OPENABLE_BAG_VIDS.has(v), `UI 门 ${v}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
describe('木匣 2334 / 珍珠木匣 3979（:7673-7905）双档', () => {
  it('普通档专属：1/50 灰色 Zapinator 997（困难档掷不出）', () => {
    // 40×2 miss → 20 miss → 50 命中 → 后续 7/7+8/7/3/3 全 miss
    expect(run(2334, seq([1, 1, 1, 0, 1, 1, 1, 1, 1, 1]))).toEqual([[997, 1]]);
  });
  it('困难档专属：1/200 3064（:7678，普通档该掷不存在）', () => {
    // 200 命中后 f=false：硬门三支短路不掷，5-way 20 / 钱币 7 / 锭 7 / 矿 8 / 药 7 / 后置 3×2
    expect(run(3979, seq([0, 1, 1, 1, 1, 1, 1, 1, 1]))).toEqual([[3064, 1]]);
  });
  it('困难档矿锭升级门：Next(2)==0 && hard → 钯锭 1104 栈 4-15', () => {
    expect(run(3979, seq([1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 10, 1, 1, 1]))).toEqual([[1104, 10]]);
  });
  it('后置锭：2/3 铜锭 2674 / 1/3 铁锭 2675 ×1-4', () => {
    // 40×2/20/50 miss → 钱币 7 命中(else 支金币 72×20-90 栈 90) → 锭 7/矿 8/药 7
    // miss(f=false 出循环) → 后置锭 1 门 miss → 锭 2 门命中 → Next(3)=1(≠0) → 2674 栈 4
    expect(run(2334, seq([1, 1, 1, 1, 0, 1, 90, 1, 1, 1, 1, 0, 1, 4])))
      .toEqual([[72, 90], [2674, 4]]);
  });
});

// ---------------------------------------------------------------------------
describe('铁匣 2335 / 秘银匣 3980（:7906-8122）双档', () => {
  it('普通档矿锭 6 支表：Next(6)=5 → 铂锭 701 栈 12-21', () => {
    expect(run(2335, seq([1, 1, 1, 1, 1, 1, 0, 5, 1, 15, 1, 1, 1]))).toEqual([[701, 15]]);
  });
  it('困难档专属：1/60 3064（普通档首掷是 1/25 灵魂切割者 2501）', () => {
    expect(run(3980, seq([0, 1, 1, 1, 1, 1, 1]))).toEqual([[3064, 1]]);
    // 普通档同一脚本位置是 25 门：命中 → 2501（其后钱 4/锭 6/矿 4/药 4/后置 2×2 全 miss）
    expect(run(2335, seq([0, 1, 1, 1, 1, 1, 1, 1, 1]))).toEqual([[2501, 1]]);
  });
  it('后置：1/2 铁矿/银矿 188-189 ×5-15 + 1/2 铁/银锭', () => {
    // 25/20/15/20/20 miss → 钱 4 命中(73×5-10 栈 7) → 锭 6/矿 4 miss → 药 4 命中(296×3)
    // → 后置 2 命中 → 矿 189 栈 10 → 后置 2 命中 → item8=2676(Next(3)==0) 栈 4
    expect(run(2335, seq([1, 1, 1, 1, 1, 0, 7, 1, 1, 0, 1, 3, 0, 189, 10, 0, 0, 4])))
      .toEqual([[73, 7], [296, 3], [189, 10], [2676, 4]]);
  });
});

// ---------------------------------------------------------------------------
describe('金匣 2336 / 山铜匣 3981（:8123-8251）双档', () => {
  it('普通档矿锭表 Next(4)=2 → 13 栈 25-34；后置 2/3 金锭 2676 ×3-7', () => {
    // 普通档 20 硬门不掷：8/10/3 miss → 5 命中 → 13；后置 3/2 miss → 3(≠0) → 2676 栈 5
    expect(run(2336, seq([1, 1, 1, 0, 2, 1, 30, 1, 1, 1, 5, 1, 1])))
      .toEqual([[13, 30], [2676, 5]]);
  });
  it('★else 分支 2/3 continue 回卷：矿石支不消费直到 Next(3)==0', () => {
    // 迭代1：8/10/3/5 miss → 3 掷 2(≠0)回卷；迭代2：8/10/3/5 miss → 3 掷 0 → 矿石
    // Next(4)=0→21；困难升级门 next(3) 消费(=2)但 hard=false 不换表；栈 8
    expect(run(2336, seq([1, 1, 1, 1, 2, 1, 1, 1, 1, 0, 0, 2, 8, 1, 1, 0, 1, 1])))
      .toEqual([[21, 8]]);
  });
  it('困难档 1/15 附魔日晷 989（:8228-8230；普通档走 1/30 门）', () => {
    // 20 miss → 8 生命水晶命中(f=false) → 10/3 短路不掷 → 钱 3 miss → 锭 5 miss →
    // else 3 掷 2 回卷出循环 → 后置 3/2 miss → 3(≠0) → 2676 栈 7 → 30 门掷 1(困难
    // !flag=false 不给) → 15 门命中 → 989
    expect(run(3981, seq([1, 0, 1, 1, 2, 1, 1, 1, 7, 1, 0])))
      .toEqual([[29, 1], [2676, 7], [989, 1]]);
  });
});

// ---------------------------------------------------------------------------
describe('生物群系匣通用循环（:8252-8592）+ 后置支（:8593-8921）', () => {
  it('地牢匣 3205：锁盒 3085 恒出 + 1/2 金钥匙 149 + 1/2 骨 134/137/139 + 后置 25 选 1', () => {
    // next(1) 恒真 → 3085；149 门命中栈 10；骨门命中 Next(3)=1→137 栈 30；通用段
    // 钱 4 miss / 锭 7 miss / 4 掷 2≠0 continue（flag5 已 false 出循环）；后置
    // 3/2/2 miss → 25 门命中 Next(25)=7 → 5234
    expect(run(3205, seq([0, 0, 10, 0, 1, 30, 1, 1, 2, 1, 1, 1, 0, 7])))
      .toEqual([[3085, 1], [149, 10], [137, 30], [5234, 1]]);
  });
  it('神圣匣 3207 无专属支：靠通用三掷（钱/锭/弹药）命中才出循环', () => {
    // 迭代1：4/7 miss → 4 掷 1≠0 回卷；迭代2：4/7 miss → 4 命中 → 弹药 6 掷 0→22
    // 栈 10；升级门 3 掷 2(消费)但 hard=false；后置药水门命中 296 栈 3；2/2 miss；
    // !hard → 尾段零消费
    expect(run(3207, seq([1, 1, 1, 1, 1, 0, 0, 10, 2, 0, 1, 3, 1, 1])))
      .toEqual([[22, 10], [296, 3]]);
  });
  it('熔岩匣 4877：专属五选一 + 【无条件】暗影锁盒 4879 + 矿石覆盖 174', () => {
    // next(1)→20 掷 1 miss → 5 掷 0→4822；4858(4)/4824(3)/盔甲(2) miss；
    // 4879 无条件；通用 钱 4 miss / 锭 7 命中 → 8 掷 6→13 → 4877 覆盖 174；
    // 升级门 2 掷 1 miss；栈 25；4 掷 1≠0 continue 出循环；后置段全 miss
    expect(run(4877, seq([0, 1, 0, 1, 1, 1, 1, 0, 6, 1, 25, 1, 1, 1, 1, 1, 1, 1, 1, 1])))
      .toEqual([[4822, 1], [4879, 1], [174, 25]]);
  });
  it('海洋匣 5002：1/10 海龟雕像 863 兜底 + 后置 1/5 5527', () => {
    expect(run(5002, seq([0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1])))
      .toEqual([[863, 1], [5527, 1]]);
  });
  it('困难档尾段（:8891-8921）仅 3982/3983/3986：3986 神圣 → 520 + 502 栈 4-10', () => {
    // 循环两轮（4/7/4 miss ×2 → 4 命中）：弹药 6 掷 1→21；栈 8；升级门 3 掷 1 →
    // 6 掷 5→1198 栈 8-1(next(2)=1)=7；后置 4/2/2 miss → 尾段 520 栈 5 + 502 栈 9
    expect(run(3986, seq([1, 1, 1, 1, 1, 0, 1, 8, 1, 5, 1, 1, 1, 1, 0, 5, 0, 3, 9])))
      .toEqual([[1198, 7], [520, 5], [502, 9]]);
  });
  it('普通档尾段不掷：3207 后置后直接 return（!flag 短路零消费）', () => {
    // 钱币 4 命中 → 73 栈 5（next(5,13)∈[5,13)——★SW-RB11c 掷域校验纠:旧脚本值 4
    // 为原版不可达栈值,哑 rng 下自洽假钉）;7/4 miss → continue 出循环；后置 4/2/2 全 miss → 尾段不掷
    expect(run(3207, seq([0, 5, 1, 1, 1, 1, 1, 1]))).toEqual([[73, 5]]);
  });
});

// ---------------------------------------------------------------------------
describe('锁盒两件（ItemSlot.cs:1693-1704 钥匙门）', () => {
  it('金锁盒 3085：无金钥匙 327 → 返回 false 不产不耗（原版盒子不消耗）', () => {
    let gave = 0;
    const ok = openBagItem(3085, () => { gave++; }, { hardMode: false, consumeItem: () => false }, seq([0, 0, 0]));
    expect(ok).toBe(false);
    expect(gave).toBe(0);
  });
  it('金锁盒：7 选 1（Next(7)=0→村正 164）+ 1/3 暗影钥匙 + 1/8 骨钥匙 5465 + 1/4 银护腕', () => {
    // 1457: 尾段新增 1/4 SilverBracer(6156)（OpenLockBox :9452-9454,FTW 支之后）
    expect(run(3085, seq([0, 0, 0, 1]), { consumeItem: () => true }))
      .toEqual([[164, 1], [329, 1], [5465, 1]]);          // 第 4 掷 1 → 6156 miss
    expect(run(3085, seq([0, 0, 0, 0]), { consumeItem: () => true }))
      .toEqual([[164, 1], [329, 1], [5465, 1], [6156, 1]]); // 第 4 掷 0 → 6156 出
  });
  it('金锁盒 remix 第 4 支 157→2623 / FTW 1/5 5515（:9432/:9449 门序）+ 1457 银护腕', () => {
    // Next(7)=4 → 157；329 门掷 1 miss；5465 门掷 1 miss；缺省 getGoodWorld=false →
    // Next(5) 不掷；1457 尾段恒掷 Next(4)（:9452-9454 SilverBracer 6156）
    expect(run(3085, seq([4, 1, 1, 1]), { consumeItem: () => true }))
      .toEqual([[157, 1]]);
    expect(run(3085, seq([4, 1, 1, 0, 1]), { consumeItem: () => true, getGoodWorld: true }))
      .toEqual([[157, 1], [5515, 1]]);
    expect(run(3085, seq([4, 1, 1, 0, 1]), { consumeItem: () => true, remixWorld: true, getGoodWorld: true }))
      .toEqual([[2623, 1], [5515, 1]]);
    // FTW 命中后仍掷银护腕门（1457 门序:FTW → 6156）
    expect(run(3085, seq([4, 1, 1, 0, 0]), { consumeItem: () => true, getGoodWorld: true }))
      .toEqual([[157, 1], [5515, 1], [6156, 1]]);
  });
  it('黑曜石锁盒 4879：无暗影钥匙 329 → false；持钥匙不消耗（consumeItem 永不被调）', () => {
    let consumed = 0;
    expect(openBagItem(4879, () => {}, {
      hardMode: false,
      hasItem: () => false,
      consumeItem: () => { consumed++; return true; },
    }, seq([0, 0]))).toBe(false);
    expect(consumed).toBe(0);   // 只验不耗（HasItemInInventoryOrOpenVoidBag :54963）
    expect(run(4879, seq([2, 0]), { hasItem: () => true, consumeItem: () => { consumed++; return true; } }))
      .toEqual([[112, 1], [5010, 1]]);
    expect(consumed).toBe(0);
  });
  it('缺省上下文（未注入回调）= 无钥匙：两锁盒均拒开', () => {
    expect(openBagItem(3085, () => {}, { hardMode: false }, seq([0]))).toBe(false);
    expect(openBagItem(4879, () => {}, { hardMode: false }, seq([0]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('蠕虫罐 4345 / 牡蛎 4410 / 麒麟蛋 6142', () => {
  it('蠕虫罐：2002×5-8 + 3/10 3191×1-2 + 1/20 金蠕虫 2895（:9140-9151）', () => {
    expect(run(4345, seq([6, 2, 1, 0]))).toEqual([[2002, 6], [3191, 1], [2895, 1]]);
    expect(run(4345, seq([8, 3, 1]))).toEqual([[2002, 8]]);   // 3/10 不中、1/20 不中
  });
  it('麒麟蛋：Next(2)==0 → 5666、否则 5665（:9188-9196 默认值 5665 掷 0 才覆写）', () => {
    expect(run(6142, seq([0]))).toEqual([[5666, 1]]);
    expect(run(6142, seq([1]))).toEqual([[5665, 1]]);
  });
  it('牡蛎珍珠四档脚本（:9154-9168）：无珍珠 / 黑 4414 / 白 4413 / 粉 4412 + 恒出 4411', () => {
    expect(run(4410, seq([1]))).toEqual([[4411, 1]]);
    expect(run(4410, seq([0, 0]))).toEqual([[4414, 1], [4411, 1]]);
    expect(run(4410, seq([0, 1, 0]))).toEqual([[4413, 1], [4411, 1]]);
    expect(run(4410, seq([0, 1, 1]))).toEqual([[4412, 1], [4411, 1]]);
  });
  it('牡蛎珍珠分布种子桩（UnifiedRandom=Main.rand 同源）：P(珍珠)=1/4，黑:白:粉=1:3:6', () => {
    let none = 0, black = 0, white = 0, pink = 0;
    const N = 8000;
    for (let k = 0; k < N; k++) {
      const out = run(4410, seeded(20260812 + k));
      if (out.length === 1) none++;
      else if (out[0][0] === 4414) black++;
      else if (out[0][0] === 4413) white++;
      else pink++;
      expect(out[out.length - 1]).toEqual([4411, 1]);   // 恒出去壳牡蛎
    }
    expect(black + white + pink).toBeGreaterThan(N * 0.22);   // ≈25%
    expect(black + white + pink).toBeLessThan(N * 0.28);
    // 档内比 ≈ 1:3:6（2000 次珍珠 → 黑≈200 白≈600 粉≈1200）
    expect(black).toBeGreaterThan(150); expect(black).toBeLessThan(260);
    expect(white).toBeGreaterThan(520); expect(white).toBeLessThan(690);
    expect(pink).toBeGreaterThan(1080); expect(pink).toBeLessThan(1320);
  });
});

// ---------------------------------------------------------------------------
describe('钱槽 3213（Item.cs:28953-28962 + Main.cs:37321-37333）', () => {
  it('持用契约：chest=-2 开 piggy(banks[0]) / useTime 28 / 双处同音 Item_59', () => {
    expect(MONEY_TROUGH_USE).toEqual({
      openChestX: -2, bankIndex: 0, cursorIconVid: 3213,
      useTime: 28, sound: 'Item_59',
    });
  });
  it('3213 非右键开包物（原版 OpenableBag 不含钱槽——走持用链）', () => {
    expect(OPENABLE_BAG_VIDS.has(3213)).toBe(false);
    expect(openBagItem(3213, () => {}, { hardMode: false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('分布抽查与注册完整性', () => {
  it('生物群系匣专属支 100% 命中（maxValue=1 门恒真）：每开必有专属物；神圣匣无专属', () => {
    const UNIQUE: Record<number, number[]> = {
      3203: [162, 111, 96, 115, 64], 3204: [800, 802, 1256, 1290, 3062],
      3205: [3085], 3206: [158, 65, 159, 2219],
      3208: [212, 964, 211, 213, 2292, 3017],
      4405: [670, 724, 950, 1319, 725, 987, 1579, 6153],
      4407: [4056, 4442, 4055, 4061, 4062, 4276, 4262, 4263, 4423, 3380, 857],
      4877: [4822, 4828, 4880, 4881, 4868, 906, 4858, 4879, 4824, 4902, 4903, 4904, 4905, 4906],
      5002: [186, 4404, 277, 187, 863],
    };
    for (const [vidStr, uniq] of Object.entries(UNIQUE)) {
      const vid = Number(vidStr);
      for (let k = 0; k < 60; k++) {
        const ids = run(vid, seeded(7000 + k * 31 + vid)).map(([id]) => id);
        expect(ids.some((id) => uniq.includes(id)), `匣 ${vid} 第 ${k} 开无专属物`).toBe(true);
      }
    }
    // 3207 神圣匣：无专属支，仅通用三掷 + 后置（钱币 73 最常见锚）
    for (let k = 0; k < 40; k++) {
      const out = run(3207, seeded(7100 + k));
      expect(out.length).toBeGreaterThan(0);
    }
  });
  it('木匣双档差分：997 只在普通档、2424/3064 只在困难档出现（大样本）', () => {
    const seenN = new Set<number>(), seenH = new Set<number>();
    for (let k = 0; k < 2500; k++) {
      for (const [id] of run(2334, seeded(30000 + k))) seenN.add(id);
      for (const [id] of run(3979, seeded(40000 + k))) seenH.add(id);
    }
    expect(seenN.has(997)).toBe(true);   expect(seenH.has(997)).toBe(false);
    expect(seenH.has(2424)).toBe(true);  expect(seenN.has(2424)).toBe(false);
    expect(seenH.has(3064)).toBe(true);  expect(seenN.has(3064)).toBe(false);
  });
  it('产出 id 注册完整性：26 匣 + 四小件全产出均在本仓物品表（防静默吞掉）', () => {
    const vids = [...FISHING_CRATE_VIDS, 4345, 4410, 6142];
    for (const vid of vids) {
      for (let k = 0; k < 300; k++) {
        for (const [id] of run(vid, real)) {
          expect(VANILLA_ITEM_KEY_BY_ID[id], `vid ${vid} 产出 ${id} 未注册`).toBeDefined();
        }
      }
    }
  });
  it('锁盒产出注册完整性（金钥匙开出的地牢武器族 + 附加件）', () => {
    for (let k = 0; k < 600; k++) {
      for (const [id] of run(3085, real, { consumeItem: () => true })) {
        expect(VANILLA_ITEM_KEY_BY_ID[id], `3085 产出 ${id} 未注册`).toBeDefined();
      }
      for (const [id] of run(4879, real, { hasItem: () => true })) {
        expect(VANILLA_ITEM_KEY_BY_ID[id], `4879 产出 ${id} 未注册`).toBeDefined();
      }
    }
  });
});
