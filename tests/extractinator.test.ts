// 提取机（tile 219 普通版 / 642 叶绿版）1:1 回归。
// 权威：ExtractinatorHelper.cs:5-525（RollExtractinatorDrop）/ ItemID.cs:1104
// （ExtractinatorMode）/ ItemTrader.cs:82-108（叶绿兑换）/ Player.cs:41008-41049
// （对准使用）/ Wiring.cs:2563-2622（通电触发）。
import { describe, it, expect } from 'vitest';
import {
  rollExtractinatorDrop, extractinatorMode, extractinatorUseTime,
  EXTRACTINATOR_MODE, CHLOROPHYTE_TRADES,
  findExtractinatorChest, extractinatorConsumeFromChest,
  type ExtractinatorRand, type ExtractChest,
} from '../src/world/Extractinator';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { deviceTable, type DeviceCtx } from '../src/world/wiring/devices';
import { Wiring } from '../src/world/Wiring';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';

// ---------- 确定性 RNG（mulberry32；Main.rand.Next 语义） ----------
function seededRand(seed: number): ExtractinatorRand {
  let s = seed >>> 0;
  const next = (n: number) => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % Math.max(1, n);
  };
  return { next, nextRange: (a, b) => a + next(b - a) };
}

// ---------- 产物分类（钱币大表/小表产物相同，归并为一类比对） ----------
type Cat = 'fossil' | 'coin' | 'mosquito' | 'junk' | 'mossCommon' | 'mossRare'
  | 'seeds' | 'dirt' | 'honey' | 'sand' | 'gem' | 'amber' | 'ore';

const CAT_OF: Readonly<Record<number, Cat>> = (() => {
  const m: Record<number, Cat> = {};
  m[3380] = 'fossil';
  for (const c of [71, 72, 73, 74]) m[c] = 'coin';
  m[1242] = 'mosquito';
  for (const j of [2674, 2006, 2002, 2675]) m[j] = 'junk';
  for (const c of [4349, 4350, 4351, 4352, 4353]) m[c] = 'mossCommon';
  for (const r of [4354, 4389, 4377, 5127, 4378]) m[r] = 'mossRare';
  for (const s of [62, 195, 194]) m[s] = 'seeds';
  m[2] = 'dirt'; m[1125] = 'honey'; m[169] = 'sand'; m[999] = 'amber';
  for (const g of [177, 178, 179, 180, 181, 182]) m[g] = 'gem';
  for (const o of [12, 11, 14, 13, 699, 700, 701, 702, 364, 1104, 365, 1105, 366, 1106]) m[o] = 'ore';
  return m;
})();

/** 顶层分支的解析概率（按 ExtractinatorHelper.cs:5-488 的 if/else-if 链逐段推得） */
function analyticCats(mode: number, block: number): Record<Cat, number> {
  const p: Record<Cat, number> = {
    fossil: 0, coin: 0, mosquito: 0, junk: 0, mossCommon: 0, mossRare: 0,
    seeds: 0, dirt: 0, honey: 0, sand: 0, gem: 0, amber: 0, ore: 0,
  };
  if (mode < 0) return p;
  // :7-17 初值 + :24-68 模式覆盖（mode1 num=5000/3 整除 = 1666）
  let num = 5000, num2 = 25, num3 = 50, num4 = -1, num5 = -1, num6 = -1, num7 = 1;
  let num8 = -1, num9 = -1, num10 = -1, num11 = -1;
  if (mode === 1) { num = 1666; num2 = 50; num3 = 20; num4 = 10; }
  if (mode === 2) { num = -1; num2 = -1; num3 = -1; num4 = -1; num5 = 1; num7 = -1; }
  if (mode === 3) { num = -1; num2 = -1; num3 = -1; num4 = -1; num5 = -1; num7 = -1; num6 = 1; }
  if (mode === 4) { num = -1; num2 = -1; num3 = -1; num7 = -1; num9 = 50; num8 = 1; }
  if (mode === 5) { num = -1; num2 = -1; num3 = -1; num7 = -1; num11 = 1; }
  if (mode === 6) { num = -1; num2 = -1; num3 = -1; num7 = -1; num10 = 1; }
  let rest = 1;
  const take = (prob: number, key: Cat) => { const v = rest * prob; rest -= v; p[key] += v; };
  if (num4 !== -1) take(1 / num4, 'fossil');        // :72
  if (num7 !== -1) take(1 / 2, 'coin');             // :88
  if (num !== -1) take(1 / num, 'mosquito');        // :171
  if (num5 !== -1) take(1, 'junk');                 // :175
  if (num6 !== -1) {                               // :194/:245
    if (block === 642) { take(1 / 10, 'mossRare'); take(1, 'mossCommon'); }
    else take(1, 'mossCommon');
  }
  if (num9 !== -1) take(1 / num9, 'seeds');         // :269
  if (num8 > 0) take(1, 'dirt');                    // :285
  if (num11 > 0) take(1, 'honey');                  // :289
  if (num10 > 0) take(1, 'sand');                   // :293
  if (num2 !== -1) take(1 / num2, 'gem');           // :297
  if (num3 !== -1) take(1 / num3, 'amber');         // :345
  take(1 / 3, 'coin');                              // :369
  p.ore = rest;                                     // :460
  return p;
}

const CONFIGS: Array<{ mode: number; block: number; hard: boolean }> = [
  { mode: 0, block: 219, hard: false },
  { mode: 1, block: 219, hard: false },
  { mode: 2, block: 219, hard: false },
  { mode: 3, block: 219, hard: false },
  { mode: 4, block: 219, hard: false },
  { mode: 5, block: 219, hard: false },
  { mode: 6, block: 219, hard: false },
  { mode: 0, block: 642, hard: false },
  { mode: 3, block: 642, hard: false },
  { mode: 0, block: 642, hard: true },
];

describe('输入→模式表（ItemID.cs:1104）', () => {
  it('16 种输入映射正确，未知输入 = -1', () => {
    expect(EXTRACTINATOR_MODE[424]).toBe(0);    // 泥沙
    expect(EXTRACTINATOR_MODE[1103]).toBe(0);   // 雪泥
    expect(EXTRACTINATOR_MODE[3347]).toBe(1);   // 沙漠化石
    expect(EXTRACTINATOR_MODE[2339]).toBe(2);   // 锡罐
    expect(EXTRACTINATOR_MODE[2338]).toBe(2);   // 海藻
    expect(EXTRACTINATOR_MODE[2337]).toBe(2);   // 旧鞋
    for (const m of [4354, 4389, 4377, 4378, 5127, 5128]) expect(EXTRACTINATOR_MODE[m]).toBe(3);
    expect(EXTRACTINATOR_MODE[5395]).toBe(4);   // 粪块
    expect(EXTRACTINATOR_MODE[1124]).toBe(5);   // 蜂巢块
    expect(EXTRACTINATOR_MODE[4090]).toBe(6);   // 贝壳堆
    expect(EXTRACTINATOR_MODE[173]).toBe(6);    // 黑曜石
    expect(extractinatorMode(-1)).toBe(-1);
    expect(extractinatorMode(999)).toBe(-1);    // 琥珀不是输入
    expect(extractinatorMode(0)).toBe(-1);
  });
});

describe('转化表健全性', () => {
  it('全配置分支概率和 = 100%（else-if 链穷尽，:72-487）', () => {
    for (const c of CONFIGS) {
      const p = analyticCats(c.mode, c.block);
      const sum = Object.values(p).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 12);
    }
  });

  it('mode -1（不可转化输入）恒返回 itemType -1', () => {
    const d = rollExtractinatorDrop(-1, 219, seededRand(1), false);
    expect(d.itemType).toBe(-1);
    expect(d.stack).toBe(1);
  });

  it('有效 mode 的 roll 永远产出已知产物且 stack ≥ 1', () => {
    for (const c of CONFIGS) {
      const rand = seededRand(c.mode * 100 + c.block + (c.hard ? 7 : 0));
      for (let k = 0; k < 4000; k++) {
        const d = rollExtractinatorDrop(c.mode, c.block, rand, c.hard);
        expect(d.itemType, `mode=${c.mode} block=${c.block}`).toBeGreaterThan(0);
        expect(CAT_OF[d.itemType], `未知产物 ${d.itemType}`).toBeDefined();
        expect(d.stack).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('经验分布与解析概率一致（mode0 泥沙：钱币≈1/2 起步 + 兜底矿石）', () => {
    const N = 60000;
    const rand = seededRand(20260811);
    const seen: Record<Cat, number> = analyticCats(0, 219);
    for (const k of Object.keys(seen) as Cat[]) seen[k] = 0;
    for (let k = 0; k < N; k++) {
      const d = rollExtractinatorDrop(0, 219, rand, false);
      seen[CAT_OF[d.itemType]!]!++;
    }
    const exp = analyticCats(0, 219);
    for (const k of Object.keys(exp) as Cat[]) {
      // 固定种子确定性采样；容差 0.012 ≈ 3.5σ（p=0.5, N=6e4）
      expect(seen[k]! / N, `类别 ${k}`).toBeCloseTo(exp[k]!, 1.5);
    }
    // 关键锚点（wiki 口径）：钱币约 66.7%*、矿石约 30.8%*——此处只锁原版链的结构值
    expect(exp.coin).toBeCloseTo(1 / 2 + (1 - 1 / 2) * (4999 / 5000) * (24 / 25) * (49 / 50) * (1 / 3), 9);
    expect(exp.ore).toBeGreaterThan(0.25);
    expect(exp.ore).toBeLessThan(0.35);
  });

  it('mode1 沙漠化石：坚固化石 1/10 + 琥珀蚊 1/1666（num/=3 整除，:25）', () => {
    const exp = analyticCats(1, 219);
    expect(exp.fossil).toBeCloseTo(0.1, 12);
    // 1/2 钱币先扣，剩余再 1/1666
    expect(exp.mosquito).toBeCloseTo((1 - 0.1) * 0.5 / 1666, 12);
    expect(exp.amber).toBeCloseTo(0.9 * 0.5 * (1665 / 1666) * (49 / 50) / 20, 12);
  });

  it('产出 id 全部已注册（含 coin 体系与困难矿石）', () => {
    const outputs = [3380, 71, 72, 73, 74, 1242, 2674, 2006, 2002, 2675,
      4349, 4350, 4351, 4352, 4353, 4354, 4389, 4377, 5127, 4378,
      62, 195, 194, 2, 1125, 169, 177, 178, 179, 180, 181, 182, 999,
      12, 11, 14, 13, 699, 700, 701, 702, 364, 1104, 365, 1105, 366, 1106];
    for (const vid of outputs) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `产物 ${vid} 无 key`).toBeTruthy();
      expect(ITEM_BY_KEY[key!], `产物 ${vid} 未注册`).toBeDefined();
    }
    // 输入也须已注册（手持/入箱才可能到达转化链）
    for (const vid of Object.keys(EXTRACTINATOR_MODE).map(Number)) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `输入 ${vid} 无 key`).toBeTruthy();
      expect(ITEM_BY_KEY[key!], `输入 ${vid} 未注册`).toBeDefined();
    }
  });
});

describe('叶绿版（642）差异', () => {
  it('使用间隔 ×0.33（Player.cs:41018-41020 + ApplyItemTime :4221-4233）', () => {
    expect(extractinatorUseTime(10, 219)).toBe(10);
    expect(extractinatorUseTime(10, 642)).toBe(3);   // (int)(10*0.33)=3
    expect(extractinatorUseTime(1, 642)).toBe(1);    // Math.Max(val,1)
    expect(extractinatorUseTime(2, 642)).toBe(1);    // (int)0.66=0 → 钳到 1
  });

  it('mode3 苔藓：普通版只出普通苔藓，叶绿版 1/10 改掷稀有池（:194-218）', () => {
    const N = 20000;
    const rare = new Set([4354, 4389, 4377, 5127, 4378]);
    const common = new Set([4349, 4350, 4351, 4352, 4353]);
    let rare642 = 0;
    const rand219 = seededRand(31), rand642 = seededRand(32);
    for (let k = 0; k < N; k++) {
      const a = rollExtractinatorDrop(3, 219, rand219, false).itemType;
      expect(common.has(a), `普通版出了稀有苔藓 ${a}`).toBe(true);
      const b = rollExtractinatorDrop(3, 642, rand642, false).itemType;
      if (rare.has(b)) rare642++;
      else expect(common.has(b)).toBe(true);
    }
    // moss 分支内 rare 占 1/10；分支本身概率 1 → 总体 ≈ 0.1
    expect(rare642 / N).toBeGreaterThan(0.09);
    expect(rare642 / N).toBeLessThan(0.11);
  });

  it('兜底矿石：仅 642+困难模式用 14 种困难池（:463-466 / RollOreHardmode :490-509）', () => {
    const prehmOnly = new Set([364, 1104, 365, 1105, 366, 1106]);
    const hmSeen = new Set<number>();
    const rand = seededRand(77);
    for (let k = 0; k < 30000; k++) {
      const a = rollExtractinatorDrop(0, 219, rand, true).itemType;   // 219 困难也走前困难池
      expect(prehmOnly.has(a), `219 出了困难矿石 ${a}`).toBe(false);
      const b = rollExtractinatorDrop(0, 642, rand, true).itemType;
      if (CAT_OF[b] === 'ore') hmSeen.add(b);
    }
    for (const o of prehmOnly) expect(hmSeen.has(o), `642 困难池缺 ${o}`).toBe(true);
  });

  it('矿物兑换表（ItemTrader.cs:82-108）', () => {
    expect(CHLOROPHYTE_TRADES[12]).toBe(699);   // 铜↔锡
    expect(CHLOROPHYTE_TRADES[699]).toBe(12);
    expect(CHLOROPHYTE_TRADES[364]).toBe(1104); // 钴↔钯
    expect(CHLOROPHYTE_TRADES[1106]).toBe(366); // 钛金↔精金
    expect(CHLOROPHYTE_TRADES[134]).toBe(137);  // 地牢砖循环 蓝→绿→粉→蓝
    expect(CHLOROPHYTE_TRADES[137]).toBe(139);
    expect(CHLOROPHYTE_TRADES[139]).toBe(134);
    expect(CHLOROPHYTE_TRADES[61]).toBe(3);     // 黑檀石→石头（FromAny）
    expect(CHLOROPHYTE_TRADES[370]).toBe(169);  // 黑檀沙→沙
    expect(CHLOROPHYTE_TRADES[833]).toBe(664);  // 紫冰→冰
    expect(CHLOROPHYTE_TRADES[3276]).toBe(3271);
    expect(CHLOROPHYTE_TRADES[999]).toBeUndefined(); // 非兑换物
  });
});

describe('通电触发（Wiring.cs:2563-2622）', () => {
  function freshWiring() {
    const world = new World(60, 60, 7, 'open');
    return new Wiring(world.store);
  }

  /** 放置 3×3 提取机（frameX/frameY = 列/行 × 18，style 0） */
  function placeExtractinator(w: Wiring, sheet: 219 | 642, ox: number, oy: number) {
    const key = sheet === 219 ? 'v_219_extractinator' : 'v_642_chlorophyte_extractinator';
    const t = TILE_BY_KEY[key]!;
    for (let cx = 0; cx < 3; cx++) {
      for (let cy = 0; cy < 3; cy++) {
        w.st.setTileSilent(ox + cx, oy + cy, t, cx * 18, cy * 18);
      }
    }
  }

  function makeCtx(chests: ExtractChest[] = []) {
    const pulls: Array<[number, number, number]> = [];
    const drops: Array<{ vid: number; stack: number; px: number; py: number }> = [];
    const ctx: DeviceCtx = {
      dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
      shootProjectile: () => {}, countProjectiles: () => 0,
      doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
      relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
      extractinatorPull: (ax, ay, blockType) => {
        pulls.push([ax, ay, blockType]);
        const chest = findExtractinatorChest(chests, ax, ay);
        if (!chest) return null;
        return extractinatorConsumeFromChest(chest, blockType, seededRand(5), false);
      },
      dropItemStack: (vid, stack, px, py) => drops.push({ vid, stack, px, py }),
      worldSurface: 30,
    };
    return { ctx, pulls, drops };
  }

  it('命中 3×3 任意格都回算到锚点（:2567-2568），且按 sheet 传机型', () => {
    const w = freshWiring();
    const { ctx, pulls } = makeCtx();
    placeExtractinator(w, 219, 10, 20);
    // 右下格 (12,22)：frameX=36 → 36%54/18=2 → 锚点 (10,20)
    expect(deviceTable(w, ctx, 219, 12, 22)).toBe(true);
    expect(pulls[0]).toEqual([10, 20, 219]);

    const w2 = freshWiring();
    const c2 = makeCtx();
    placeExtractinator(w2, 642, 10, 20);
    expect(deviceTable(w2, c2.ctx, 642, 10, 20)).toBe(true);
    expect(c2.pulls[0]).toEqual([10, 20, 642]);
  });

  it('checkMech 60t 冷却内不重复触发（:2569/:2571）', () => {
    const w = freshWiring();
    const { ctx, pulls } = makeCtx();
    placeExtractinator(w, 219, 10, 20);
    expect(deviceTable(w, ctx, 219, 11, 21)).toBe(true);
    expect(deviceTable(w, ctx, 219, 12, 22)).toBe(true); // 同一锚点被冷却拦截
    expect(deviceTable(w, ctx, 219, 10, 20)).toBe(true);
    expect(pulls).toHaveLength(1);
  });

  it('邻域箱子消耗 1 出 1 项：自后向前取首个可提取物（:2575-2592）', () => {
    const chests: ExtractChest[] = [{
      x: 10, y: 23, locked: false,   // 机器正下方（锚点 +3 行，扫描框内）
      items: [{ id: 424, stack: 2 }, null, { id: 3347, stack: 1 }],
    }];
    const w = freshWiring();
    const { ctx, pulls, drops } = makeCtx(chests);
    placeExtractinator(w, 219, 10, 20);
    expect(deviceTable(w, ctx, 219, 11, 21)).toBe(true);
    expect(pulls).toHaveLength(1);
    // 自后向前：首个非空是末格 3347（mode1），扣 1 后归零清格
    expect(chests[0]!.items[2]).toBeNull();
    expect(chests[0]!.items[0]).toEqual({ id: 424, stack: 2 });
    expect(drops).toHaveLength(1);
    expect(drops[0]!.vid).toBeGreaterThan(0);
    expect(drops[0]!.stack).toBeGreaterThanOrEqual(1);
    // 掉落位置 = 锚点 2×2 判定框中心（:2588 → ax*16+16, ay*16+16）
    expect(drops[0]!.px).toBe(10 * 16 + 16);
    expect(drops[0]!.py).toBe(20 * 16 + 16);
  });

  it('箱内无可转化物品 / 无箱 → 不掉落不消耗', () => {
    const chests: ExtractChest[] = [{
      x: 10, y: 23, locked: false,
      items: [null, { id: 999, stack: 5 }],  // 琥珀是产物不是输入
    }];
    const w = freshWiring();
    const { ctx, drops } = makeCtx(chests);
    placeExtractinator(w, 219, 10, 20);
    expect(deviceTable(w, ctx, 219, 11, 21)).toBe(true);
    expect(drops).toHaveLength(0);
    expect(chests[0]!.items[1]).toEqual({ id: 999, stack: 5 }); // 未消耗

    const w2 = freshWiring();
    const c2 = makeCtx(); // 无箱
    placeExtractinator(w2, 219, 10, 20);
    expect(deviceTable(w2, c2.ctx, 219, 11, 21)).toBe(true);
    expect(c2.drops).toHaveLength(0);
  });
});

describe('箱子查找（Wiring.cs:2596-2622 TryFindChestForExtractinator）', () => {
  const mk = (x: number, y: number, locked = false): ExtractChest =>
    ({ x, y, locked, items: [{ id: 424, stack: 9 }] });

  it('扫描框 = 锚点 -2..+5（含端点，2×2 占位判定）', () => {
    const ax = 20, ay = 20;
    expect(findExtractinatorChest([mk(ax, ay)], ax, ay)).toBeDefined();        // 锚点上
    expect(findExtractinatorChest([mk(ax + 5, ay + 5)], ax, ay)).toBeDefined(); // 远角含
    expect(findExtractinatorChest([mk(ax - 2, ay - 2)], ax, ay)).toBeDefined(); // 近角含
    expect(findExtractinatorChest([mk(ax + 7, ay)], ax, ay)).toBeUndefined();   // 越界（占位 ax+7/ax+8）
    expect(findExtractinatorChest([mk(ax - 4, ay)], ax, ay)).toBeUndefined();   // 越界（占位 ax-4/ax-3）
    // R14-D1：FindChest 只认左上角格——锚点在框外一格、占位伸进框内不命中
    // （原版 _chestsByCoords 只注册 (x,y) 左上角,占位延伸格查不到）
    expect(findExtractinatorChest([mk(ax - 3, ay)], ax, ay)).toBeUndefined();
    // 左上角格本身在框内 → 命中
    expect(findExtractinatorChest([mk(ax - 2, ay)], ax, ay)).toBeDefined();
  });

  it('上锁箱跳过；行扫描序（先小 y）优先', () => {
    const ax = 20, ay = 20;
    const locked = mk(ax, ay, true), open = mk(ax + 1, ay);
    expect(findExtractinatorChest([locked, open], ax, ay)).toBe(open);
    const below = mk(ax, ay + 1), right = mk(ax + 1, ay);
    expect(findExtractinatorChest([below, right], ax, ay)).toBe(right); // y 小者先扫到
  });
});

describe('消耗语义（Wiring.cs:2584-2587）', () => {
  it('自后向前、每格只 roll 一次、扣 1 清零归 null', () => {
    const chest: ExtractChest = {
      x: 0, y: 0, locked: false,
      items: [{ id: 424, stack: 1 }, null, { id: 1103, stack: 3 }],
    };
    // 末格 1103（mode0）消耗 1 → 3→2
    const d1 = extractinatorConsumeFromChest(chest, 219, seededRand(3), false);
    expect(d1!.itemType).toBeGreaterThan(0);
    expect(chest.items[2]).toEqual({ id: 1103, stack: 2 });
    // 再来两次：2→1→清 null，然后落到首格 424
    extractinatorConsumeFromChest(chest, 219, seededRand(4), false);
    expect(chest.items[2]).toEqual({ id: 1103, stack: 1 });
    extractinatorConsumeFromChest(chest, 219, seededRand(5), false);
    expect(chest.items[2]).toBeNull();
    const d4 = extractinatorConsumeFromChest(chest, 219, seededRand(6), false);
    expect(d4!.itemType).toBeGreaterThan(0);
    expect(chest.items[0]).toBeNull();
    // 全空 → null
    expect(extractinatorConsumeFromChest(chest, 219, seededRand(7), false)).toBeNull();
  });

  it('idToVanilla 映射下内部 id 也可消耗（Game 侧 slotVanillaId 桥接）', () => {
    const INTERNAL_SILT = 9999; // 假内部 id，映射到原版 424
    const chest: ExtractChest = { x: 0, y: 0, items: [{ id: INTERNAL_SILT, stack: 2 }] };
    const d = extractinatorConsumeFromChest(chest, 219, seededRand(8), false, (id) =>
      id === INTERNAL_SILT ? 424 : -1);
    expect(d!.itemType).toBeGreaterThan(0);
    expect(chest.items[0]).toEqual({ id: INTERNAL_SILT, stack: 1 });
  });
});
