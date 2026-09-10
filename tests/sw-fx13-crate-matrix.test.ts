// SW-FX13（2026-09-10）渔获匣 26 型三面定谳矩阵。
// 任务口径：**匣物品 def / 开箱 loot 表 / 匣掉落来源（钓鱼 rules 表）三面**逐型对账，
// 与既有 fishing-crates.test.ts（roll 序逐支脚本）互补——本文件钉「全族闭环」面：
//   ① 匣物品 def 面：26 vid ∈ vanilla.json atlas（贴图可达）∪ VANILLA_ITEM_KEY_BY_ID
//      （运行时注册表，items.ts 自动注册循环产出）∪ ITEM_BY_KEY 可解。
//   ② 开箱 loot 面：openBagItem 全 26 放行（UI ItemSlot.cs:1790-1793 门同源集合）+
//      开箱必有产出 + 地牢/熔岩匣的锁匣面（3085 金锁盒/4879 暗影锁盒）随匣产出。
//   ③ 掉落来源面：vanilla-fishing.json 规则表含全部 26 匣（crate 条件 + 普通双档），
//      逐型用满足条件的 FishingRollCtx 驱动 tryGetItemDrop（FishDropRuleList.cs:10-21
//      的首中即返）实证「钓得到」——规则表序敏感（first-match wins），ctx 按各匣
//      条件最小闭包构造（不触发更早规则）。
//   ④ 1457 特有值锚：1456→1457 变更面（木匣饰品池 6 支含 6165 / 冰冻匣 7 支含
//      6153 / 金匣日晷 1/30↔1/15 双门掷数恒消费）逐支脚本钉（队列耗尽即抛 +
//      掷数计数断言,多掷/漏掷双向暴露）。
// 锚：Player.cs:8052-9336（1457 OpenFishingCrate 全域；1456=旧 :7667-8921）、
//     ItemID.cs:1086/:1088、Projectile.cs:20959-20977（FishingCheck_RollItemDrop 现役
//     走 FishDropsDB 规则表,:21032 起 RollItemDropOld 为死码——匣选择以规则表为准）。
import { describe, it, expect } from 'vitest';
import vanillaAtlas from '../public/sprites/vanilla.json';
import { OPENABLE_BAG_VIDS, openBagItem, type BagRand } from '../src/data/vanillaOpenBags';
import {
  FISHING_CRATE_VIDS, FISHING_CRATE_HARDMODE_VIDS, openFishingCrate,
} from '../src/data/vanillaFishingCrates';
import { FISH_DROP_RULES, tryGetItemDrop, type FishingRollCtx } from '../src/data/vanillaFishing';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const ATLAS_ITEMS = (vanillaAtlas as unknown as { items: Record<string, unknown> }).items;
const CRATES = [...FISHING_CRATE_VIDS].sort((a, b) => a - b);

/** 真随机 BagRand（大样本面） */
const real: BagRand = {
  next: (a, b) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a))),
};

/** 带掷数计数与值域校验的定序源：队列耗尽即抛（漏掷立刻暴露）+ 脚本值越界即抛
 *  （next(6) 掷出 5 之类域外值=脚本本身漂移;变异 A 实验 Next(6)→Next(5) 的
 *  掷域收缩也由此暴露——哑 rng 直返脚本值对掷域变异失明,须值域断言补盲） */
function seqCounted(vals: number[]): BagRand & { calls: number } {
  const q = [...vals];
  const state = { calls: 0 };
  return {
    next(a: number, b?: number) {
      state.calls++;
      if (q.length === 0) throw new Error(`RNG 队列耗尽（第 ${state.calls} 掷 next(${a}${b === undefined ? '' : `, ${b}`})）`);
      const v = q.shift() as number;
      const lo = b === undefined ? 0 : a;
      const hi = b === undefined ? a : b;
      if (v < lo || v >= hi) {
        throw new Error(`掷域越界：第 ${state.calls} 掷 next(${a}${b === undefined ? '' : `, ${b}`}) 脚本值 ${v} ∉ [${lo},${hi})——被测代码掷域漂移或脚本错位`);
      }
      return v;
    },
    get calls() { return state.calls; },
  } as BagRand & { calls: number };
}

/** 钓鱼规则表求值 ctx（最小闭包构造：全 false 缺省 + 逐匣覆写）。
 *  rng 注入恒 0 掷：Next(den)=0 过一切 chance 门（1/6 熔岩匣等）+ 池取 items[0]
 *  ——单物品匣池,确定性命中,免 Math.random 间歇红 */
function fishCtx(over: Partial<FishingRollCtx>): FishingRollCtx {
  return {
    rng: { next: () => 0, range: (a) => a, double: () => 0 },
    inLava: false, inHoney: false, junk: false, crate: true,
    common: false, uncommon: false, rare: false, veryrare: false, legendary: false,
    anyEnemies: false, canFishInLava: false,
    x: 400, y: 200, waterTilesCount: 300, rockLayer: 500, maxTilesX: 8400,
    heightLevel: 0, questFish: -1,
    hardMode: false, bloodMoon: false, combatBookWasUsed: false, remix: false,
    zones: { corrupt: false, crimson: false, jungle: false, snow: false, dungeon: false, desert: false, hallow: false },
    rolled: { corruption: false, crimson: false, jungle: false, snow: false, desert: false, infectedDesert: false, remixOcean: false },
    ...over,
  };
}

/** 匣 vid → 能让规则表命中它的 ctx 候选序列（首中即返语义,取第一组成功者） */
function ctxsForCrate(vid: number): FishingRollCtx[] {
  const hard = FISHING_CRATE_HARDMODE_VIDS.has(vid);
  // 生物群系匣规则档位 = Rare（AFishDropRulePopulator Rarity 表）；木/铁匣亦走 Rare
  // 兜底前档——稀有档旗随 ctx 最小闭包供给（金匣 legendary 例外单覆写）
  const base = { hardMode: hard, rare: true };
  const zone = (z: Partial<FishingRollCtx['zones']>) => fishCtx({ ...base, zones: { ...fishCtx({}).zones, ...z } });
  const rolled = (r: Partial<FishingRollCtx['rolled']>) => fishCtx({ ...base, rolled: { ...fishCtx({}).rolled, ...r } });
  switch (vid) {
    case 4877: case 4878:
      return [fishCtx({ ...base, inLava: true, canFishInLava: true })];
    case 3205: case 3984:   // 地牢：ZoneDungeon && downedBoss3（调用方折入门）
      return [zone({ dungeon: true })];
    case 5002: case 5003:   // 海洋主条件 = ZoneBeach（remix 地下海支序在其后）
      return [zone({ beach: true })];
    case 3203: case 3982:
      return [rolled({ corruption: true })];
    case 3204: case 3983:
      return [rolled({ crimson: true })];
    case 3207: case 3986:   // 神圣：ZoneHallow（无 rolled 门）
      return [zone({ hallow: true })];
    case 3208: case 3987:
      return [rolled({ jungle: true })];
    case 4405: case 4406:
      return [rolled({ snow: true })];
    case 4407: case 4408:   // 沙漠 = trueDesert（ZoneDesert；地牢 flag 为真时被折假）
      return [zone({ desert: true })];
    case 3206: case 3985:   // 空岛：heightLevel == 0
      return [fishCtx({ ...base, heightLevel: 0 })];
    case 2336: case 3981:   // 金匣 = Legendary（VeryRare 支次序在后）
      return [fishCtx({ hardMode: hard, legendary: true }), fishCtx({ hardMode: hard, veryrare: true })];
    case 2335: case 3980:   // 铁匣 = Rare ∪ Uncommon
      return [fishCtx({ ...base, rare: true }), fishCtx({ hardMode: hard, uncommon: true })];
    case 2334: case 3979:   // 木匣 = Any 兜底
      return [fishCtx({ hardMode: hard })];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
describe('SW-FX13 渔获匣 26 型三面定谳矩阵', () => {
  it('① def 面：26 匣在 vanilla.json atlas + 运行时注册表 + ITEM_BY_KEY 三处齐全', () => {
    for (const vid of CRATES) {
      expect(ATLAS_ITEMS[String(vid)], `匣 ${vid} 缺 atlas 贴图`).toBeDefined();
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `匣 ${vid} 缺 VANILLA_ITEM_KEY_BY_ID 注册`).toBeDefined();
      const iid = ITEM_BY_KEY[key];
      expect(iid, `匣 ${vid} 键 ${key} 缺 ITEM_BY_KEY 映射`).toBeDefined();
      expect(ITEM_DEFS[iid]?.key, `匣 ${vid} def 悬空`).toBe(key);
    }
  });

  it('② 开箱面：26 匣 UI 门集合内 + openBagItem 放行 + 每开必有产出（锁匣面随匣）', () => {
    for (const vid of CRATES) {
      expect(OPENABLE_BAG_VIDS.has(vid), `匣 ${vid} 不在 OPENABLE_BAG_VIDS（UI 右键门吞）`).toBe(true);
      for (let k = 0; k < 6; k++) {
        const out: Array<[number, number]> = [];
        const ok = openBagItem(vid, (id, n) => out.push([id, n ?? 1]), { hardMode: false }, real);
        expect(ok, `匣 ${vid} 开箱被拒`).toBe(true);
        expect(out.length, `匣 ${vid} 第 ${k} 开零产出`).toBeGreaterThan(0);
        // 锁匣面：地牢匣恒出金锁盒 3085（:8685）、熔岩匣恒出暗影锁盒 4879（:8814 无条件）
        if (vid === 3205 || vid === 3984) expect(out.some(([id]) => id === 3085), `匣 ${vid} 缺金锁盒`).toBe(true);
        if (vid === 4877 || vid === 4878) expect(out.some(([id]) => id === 4879), `匣 ${vid} 缺暗影锁盒`).toBe(true);
      }
    }
  });

  it('③ 掉落来源面：规则表 26 匣逐型可产出（crate 门 + 双档 + first-match 不被更早规则截胡）', () => {
    // 静态面：26 匣全部在表（带 crate 条件的条目）
    for (const vid of CRATES) {
      const rules = FISH_DROP_RULES.filter((r) => r.items.includes(vid)
        && r.conditions.some((c) => c.t === 'crate'));
      expect(rules.length, `匣 ${vid} 无钓鱼规则`).toBeGreaterThan(0);
    }
    // 动态面：逐型驱动 tryGetItemDrop 命中
    for (const vid of CRATES) {
      const ctxs = ctxsForCrate(vid);
      expect(ctxs.length, `匣 ${vid} 未构造 ctx`).toBeGreaterThan(0);
      const got = ctxs.find((ctx) => tryGetItemDrop(ctx) === vid);
      expect(got, `匣 ${vid} 规则表未产出（被更早规则截胡或条件缺口）`).toBeDefined();
    }
  });

  it('③补 规则表双档对：13 组普通/困难匣条件只差 hardMode 位（1457 档位语义）', () => {
    const PAIRS: Array<[number, number]> = [
      [2334, 3979], [2335, 3980], [2336, 3981], [3203, 3982], [3204, 3983],
      [3205, 3984], [3206, 3985], [3207, 3986], [3208, 3987], [4405, 4406],
      [4407, 4408], [4877, 4878], [5002, 5003],
    ];
    for (const [normal, hard] of PAIRS) {
      const ruleOf = (vid: number, hm: boolean) => FISH_DROP_RULES.find((r) => r.items.includes(vid)
        && r.conditions.some((c) => c.t === 'crate')
        && r.conditions.some((c) => c.t === 'hardMode' && c.v === hm));
      const normalRule = ruleOf(normal, false);
      expect(normalRule, `普通匣 ${normal} 缺普通档规则`).toBeDefined();
      expect(ruleOf(hard, true), `困难匣 ${hard} 缺困难档规则`).toBeDefined();
      expect(normalRule!.conditions.some((c) => c.t === 'hardMode' && c.v === false), `${normal} 档位门缺`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
describe('SW-FX13 1457 特有值锚（roll 序逐支脚本 + 掷数计数）', () => {
  it('木匣饰品池 1457 六支（:8084-8110）：Next(6)=5 → PoisonBarb 6165,全链 10 掷', () => {
    // 序（hard=false 短路掷不消费）：40 miss/40 miss/20 中→6池=5/50 吞（f=false
    // 不掷）/7 miss/7 miss/8 miss/7 miss/后置锭 3 miss/后置锭2 3 miss
    const rnd = seqCounted([1, 1, 0, 5, 1, 1, 1, 1, 1, 1]);
    const out: Array<[number, number]> = [];
    openFishingCrate(2334, (id, n) => out.push([id, n ?? 1]), rnd);
    expect(out).toEqual([[6165, 1]]);
    expect(rnd.calls).toBe(10);
  });

  it('冰冻匣 1457 七支（:8736-8745）：i=6 → GlacierFang 6153（1456 六支表无此件）', () => {
    const rnd = seqCounted([0, 6, 1, 1, 1, 1, 1, 1, 1]);
    const out: Array<[number, number]> = [];
    openFishingCrate(4405, (id, n) => out.push([id, n ?? 1]), rnd);
    expect(out).toEqual([[6153, 1]]);
  });

  it('冰冻匣 remix 支（:8739-8742）：i=3 的 1319 在 remix 世界替换为 725（掷数不变）', () => {
    const rnd = seqCounted([0, 3, 1, 1, 1, 1, 1, 1, 1]);
    const out: Array<[number, number]> = [];
    openFishingCrate(4405, (id, n) => out.push([id, n ?? 1]), rnd, { remixWorld: true });
    expect(out).toEqual([[725, 1]]);
    expect(out).not.toContainEqual([1319, 1]);
  });

  it('金匣日晷双门（:8630-8637）：普通档走 Next(30)、困难档走 Next(15),两掷恒消费', () => {
    // 公共段：8 miss/10 miss/3 中→73×Next(8,21)=9/5 miss（锭落空→else 内 Next(3)=1
    // →continue 回卷）后置：药水 3 miss/矿 2 miss/金锭 3 中→2676×Next(3,8)=6
    // 普通档尾：Next(30)=0 → 989；Next(15)=2 照掷（值≠0）
    const rndN = seqCounted([1, 1, 0, 9, 1, 1, 1, 1, 1, 6, 0, 2]);
    const outN: Array<[number, number]> = [];
    openFishingCrate(2336, (id, n) => outN.push([id, n ?? 1]), rndN);
    expect(outN).toEqual([[73, 9], [2676, 6], [989, 1]]);
    expect(rndN.calls).toBe(12);
    // 困难档尾：Next(30)=1 落空 → Next(15)=0 && hard → 989（两掷都消费,证非短路省掷）。
    // hard 首支 (flag&flag3)&&Next(200) 参与掷流（:8485）→ 序首多一掷 200=1 落空
    const rndH = seqCounted([1, 1, 1, 0, 9, 1, 1, 1, 1, 1, 6, 1, 0]);
    const outH: Array<[number, number]> = [];
    openFishingCrate(3981, (id, n) => outH.push([id, n ?? 1]), rndH);
    expect(outH).toEqual([[73, 9], [2676, 6], [989, 1]]);
    expect(rndH.calls).toBe(13);
  });

  it('空岛匣专属+后置全链（:8703-8713/:9194-9238）：1/40 4978 + 天空岛 2197', () => {
    // 专属四选一 i=2→159；钱币 4 中→73×7；锭 7 miss→矿 4 miss→continue；
    // 后置药水 4/矿 2/锭 2 全 miss；后置天空 2 中→六选一 2→5238、2 中→751×77、
    // 40 中→4978、skyblock 3 中→2197
    const rnd = seqCounted([0, 2, 0, 7, 1, 1, 1, 1, 1, 0, 2, 0, 77, 0, 0]);
    const out: Array<[number, number]> = [];
    openFishingCrate(3206, (id, n) => out.push([id, n ?? 1]), rnd, { skyblockLowTiles: true });
    expect(out).toEqual([[159, 1], [73, 7], [5238, 1], [751, 77], [4978, 1], [2197, 1]]);
  });

  it('海洋匣专属+后置全链（:8645-8657/:9018-9041）：四件后置逐支脚本', () => {
    // 专属：maxValue 中→Next(4)=0→Next(10)=1≠0→[186,4404,277,187][0]=186；
    // 钱币 4 中→73×7；锭 7 miss→矿门 4 miss→continue；后置 4/2/2 miss；
    // 海洋后置：5 中→5527、3 中→4090×30、10 中→4460、10 中→4425
    const rnd = seqCounted([0, 0, 1, 0, 7, 1, 1, 1, 1, 1, 0, 0, 30, 0, 0]);
    const out: Array<[number, number]> = [];
    openFishingCrate(5002, (id, n) => out.push([id, n ?? 1]), rnd);
    expect(out).toEqual([[186, 1], [73, 7], [5527, 1], [4090, 30], [4460, 1], [4425, 1]]);
  });

  it('熔岩匣专属+后置全链（:8783-8847/:9239-9305）：无条件锁盒 + 四支 1/20', () => {
    // 专属：maxValue 中→Next(20)=1（剑鱼落空）→五选一 0→4822；4858 4 miss；
    // 无条件 4879；4824 3 miss；盔甲 2 miss。钱币 4 中→73×7；锭 7 miss→矿 4 miss；
    // 后置 4/2/2 miss；熔岩后置：2 中→十二选一 5→1538、20/20/20/20 中→221/4443/4737/4551
    const rnd = seqCounted([0, 1, 0, 1, 1, 1, 0, 7, 1, 1, 1, 1, 1, 0, 5, 0, 0, 0, 0]);
    const out: Array<[number, number]> = [];
    openFishingCrate(4877, (id, n) => out.push([id, n ?? 1]), rnd);
    expect(out).toEqual([[4822, 1], [4879, 1], [73, 7], [1538, 1], [221, 1], [4443, 1], [4737, 1], [4551, 1]]);
  });
});
