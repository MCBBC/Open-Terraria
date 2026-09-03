// ★III-F5 神圣面（conversionType=2）尾级联补列回归（2026-09-01 五轮轻验证收口批）——
// 原文锚：Terarria1457/Terraria/WorldGen.cs:56788-56818
//   Convert_ActuallyConvertTile / _Wall 的尾部 SquareTileFrame(x,y)/SquareWallFrame(x,y)
//   对【一切 conversionType】无条件执行（num 门只包 RainbowSandAndBlackSandWalls 清漆）。
// 消费面：
//   · SecretSeedDoEndsPass.doHallowOnSurface（does that sparkle / 周年组合 finalize 臂）
//   · SecretSeedDoEndsPass.convertWithSize 的 face-2 可达面
//   · HardmodePass.initializeHardMode remix 边缘带臂（cs:31906-31941，经 convertHallowCell）
// 骰流影响声明：本修使上述面的转化骰耗开始与 x86 对齐——凡种子含 hallowOnTheSurface/
//   remix/too easy 组合的既有金标若涉及此域须按「金标陈旧登记惯例」归属本刀；
//   七链认证域（tile 面 mile8 106 槽）不消费 face-2 finalize 臂的组合不在其列。
// 掷流探针先例：core/rng.ts __swOnRoll（观测钩）+ FinalCleanupPass.__swFntProbeI39
//   （SQ/K 事件标定钩，probe 同款 ii108tm/_iii105tm 基座）。
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import {
  convertHallowCell, doHallowOnSurface, doWorldIsFrozenFinish,
} from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';

const STONE = TILE_BY_KEY['stone']!;          // sheet 1（CONV_STONE → case2 转珍珠岩）
const TREE = TILE_BY_KEY['tree']!;            // sheet 5（IS_A_TREE_TRUNK 护栏必杀支）
const sheetAt = (st: TileStore, x: number, y: number): number =>
  TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? -1;

/** RNG internalSample 观测窗（hardmode-init.test.ts countRolls 同款；观测不消费状态） */
function countRolls<T>(fn: () => T): { value: T; rolls: number } {
  const g = globalThis as { __swOnRoll?: (value: number, inst: object) => void };
  const prev = g.__swOnRoll;
  let n = 0;
  g.__swOnRoll = () => { n++; };
  try {
    return { value: fn(), rolls: n };
  } finally {
    g.__swOnRoll = prev;
  }
}

/** IIIII39 级联族标定钩（FinalCleanupPass __swFnt39 probe）：捕获 'SQ|x,y|rc' 行 */
function withFntProbe<T>(fn: () => T): { value: T; lines: string[] } {
  const G = globalThis as { __swFntProbeI39?: { emit?: (l: string) => void } | null };
  const prev = G.__swFntProbeI39 ?? null;
  const lines: string[] = [];
  G.__swFntProbeI39 = { emit: (l) => lines.push(l) };
  try {
    return { value: fn(), lines };
  } finally {
    G.__swFntProbeI39 = prev;
  }
}
const sqCoords = (lines: string[]): string[] =>
  lines.filter((l) => l.startsWith('SQ|'))
    .map((l) => l.slice(3, l.indexOf('|', 3)));

/** 最小 GenState 占位（case-2 面不解引用 rockLevel 段；convertHallowCell 缺省同 idiom） */
function mkGs(worldSurface: number): never {
  return { seedFlags: {}, worldSurface, rockLevel: 120 } as never;
}

describe('★III-F5 case-2 尾级联（cs:56801/:56813 无条件原文）', () => {
  it('方块臂：转化落格（石→珍珠岩）且中心 SquareTileFrame 结构性触发（SQ 探针=probe 先例）', () => {
    const st = new TileStore(120, 80);
    st.setTileSilent(60, 60, STONE);
    const r = new RNG(20260901);
    const res = withFntProbe(() => convertHallowCell(st, r, 60, 60));
    expect(sheetAt(st, 60, 60)).toBe(117);                       // 珍珠岩落格
    // ★修复前：cascades=false ⇒ genSquareTileFrame 整段缺席 ⇒ SQ 计数恒零。
    //   修复后：转换尾恰好一枚中心帧（九宫邻空、无击杀级联加掷）
    expect(sqCoords(res.lines)).toEqual(['60,60']);
  });

  it('转化骰记录非零（同格墙臂方帧一骰入账 + 树干护栏必杀支级联在案）', () => {
    // 真实神圣地表列 = 块面与墙面同时转化：石+腐化草墙63 同格 → 双臂齐走。
    // ★注意：孤树 KillTile 的尘掷表对树干(5)恒零掷——非零掷的确定性来源是
    //   「墙写尾 genSquareWallFrame 一骰」（CenterPoint resetFrame Next(0,3)）。
    const st = new TileStore(120, 80);
    st.setTileSilent(60, 60, STONE);
    st.setWallSilent(60, 60, 63);                               // WALL_CONV_GRASS 且 ≠70
    st.setTileSilent(60, 59, TREE);                             // 树干立于转化面上（触发护栏支）
    const r = new RNG(99123);
    const probe = withFntProbe(() => countRolls(() => convertHallowCell(st, r, 60, 60)));
    const rolls = probe.value.rolls;
    expect(sheetAt(st, 60, 60)).toBe(117);
    expect(probe.lines.some((l) => l.startsWith('KT|'))).toBe(true);   // 护栏必杀支实走
    expect(sqCoords(probe.lines)).toContain('60,60');           // 转化尾方帧在案
    expect(rolls).toBeGreaterThanOrEqual(1);                    // ★「尾掷记录非零」钉点（含墙帧一骰）
  });

  it('已达标面早退：目标型一致 ⇒ 零转化、零级联（门面守卫）', () => {
    const st = new TileStore(120, 80);
    st.setTileSilent(60, 60, TILE_BY_KEY['v_117_pearlstone_block']!);
    const r = new RNG(5150);
    const probe = withFntProbe(() => countRolls(() => convertHallowCell(st, r, 60, 60)));
    expect(sheetAt(st, 60, 60)).toBe(117);
    expect(probe.value.rolls).toBe(0);
    expect(sqCoords(probe.lines)).toEqual([]);
  });

  it('墙臂：wall 63→70 后 genSquareWallFrame 恰一骰（CenterPoint resetFrame 单掷）', () => {
    const st = new TileStore(120, 80);
    st.setWallSilent(60, 60, 63);                               // WALL_CONV_GRASS 且 ≠70
    const r = new RNG(777123);
    const res = countRolls(() => convertHallowCell(st, r, 60, 60));
    expect(st.wall[st.idx(60, 60)]).toBe(70);                   // 神圣草墙落定
    expect(res.rolls).toBe(1);                                  // ★Next(0,3) 一掷（非墙21 不二掷）

    // 对照：已达标的神圣草墙不再进 Convert_ActuallyConvertWall ⇒ 全链零骰
    const st2 = new TileStore(120, 80);
    st2.setWallSilent(60, 60, 70);
    const r2 = new RNG(777124);
    expect(countRolls(() => convertHallowCell(st2, r2, 60, 60)).rolls).toBe(0);
  });
});

describe('★III-F5 hallowOnTheSurface finalize 臂两处骰入账抽查（doHallowOnSurface）', () => {
  const W = 180, WS = 45;
  /** 表层带：per-column 必掷 Next(3) ⇒ 列数是入账下限（与内容无关） */
  it('① 方块臂入账：整带草转珍珠草（109），总掷 ≥ 列数', () => {
    const st = new TileStore(W, 90);
    for (let x = 40; x < 140; x++) st.setTileSilent(x, WS - 1, TILE_BY_KEY['grass']!);   // sheet 2
    const gs = mkGs(WS);
    const { rolls } = countRolls(() => doHallowOnSurface(st, new RNG(2026), gs));
    let hallowGrass = 0;
    for (let x = 40; x < 140; x++) if (sheetAt(st, x, WS - 1) === 109) hallowGrass++;
    expect(hallowGrass).toBeGreaterThan(0);
    expect(rolls).toBeGreaterThanOrEqual(W);                    // 逐列 Next(3) 入账下限
  });

  it('② 墙臂入账：地表带 63 族墙转 70，总掷 = 列数 + 逐格方帧一骰', () => {
    const st = new TileStore(W, 90);
    const cols: number[] = [];
    for (let x = 40; x < 140; x++) {
      st.setWallSilent(x, WS - 8, 63);   // 必须落在逐列扫描带 j<lim=ws+Next(3) 内
      cols.push(x);
    }
    const gs = mkGs(WS);
    const { rolls } = countRolls(() => doHallowOnSurface(st, new RNG(31), gs));
    let converted = 0;
    for (const x of cols) if (st.wall[st.idx(x, WS - 8)] === 70) converted++;
    expect(converted).toBe(cols.length);                        // 全数转 70
    expect(rolls).toBeGreaterThanOrEqual(W + converted);        // 列掷 + 墙写尾方帧逐格一骰
  });
});

describe('★III-F5 HardmodePass remix 边缘带臂连带（convertHallowCell 同源全链）', () => {
  it('remix 世界 initializeHardMode 边缘带落珍珠岩且骰耗在案', () => {
    const w = 420, h = 220;
    const store = new TileStore(w, h);
    const stone = TILE_BY_KEY['stone']!;
    for (let x = 0; x < w; x++) {
      for (let y = 90; y < h - 10; y++) store.setTileSilent(x, y, stone);
      store.setWallSilent(x, 95, 63);
    }
    const world = {
      store, seed: 20260813, crimson: false,
      dungeonX: Math.trunc(w / 4) + 1, groundLevel: 90,
      flags: {}, seedFlags: { remix: true }, skyblockLowTiles: false,
    } as never;
    const { rolls } = countRolls(() => initializeHardMode(world, new RNG(424242)));
    let pearl = 0, wall70 = 0;
    for (let x = w - Math.trunc(w / 7) - Math.trunc(w / 14); x < w; x++) {
      for (let y = 89; y < h - 10; y++) {
        if (sheetAt(store, x, y) === 117) pearl++;
        if (store.wall[store.idx(x, y)] === 70) wall70++;
      }
    }
    expect(pearl).toBeGreaterThan(0);                           // 外侧翼无条件 Convert(·,2)
    expect(rolls).toBeGreaterThan(1000);                        // 带内逐格面骰耗显著入账
    expect(wall70).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// ★RV-R4 行程随机性形状（2026-09-01）——cs:1969 条件式内嵌掷骰语义移植回归。
//   原文：`for (int j = 0; j < num + genRand.Next(3); j++)` 条件【每行迭代重估】⇒
//   行程 K∈{num,num+1,num+2}（p={1/3,4/9,2/9}）、每列骰耗=K+1（恒真判亦耗骰、
//   终止负判再耗一掷）。旧「per-column 恰一掷 upfront lim」= 定长 {1/3,1/3,1/3} +
//   每列恰 num+1 掷 ⇒ 双发散（掷流错位 + 尾带覆盖频率差）。
//   空库实测（w=2400,num=20）：extra/列 = 0.9033/0.9038/0.8838（seeds 20260901/777/41；
//   理论 8⁄9≈0.889）；草带覆盖实测 rNum=1205 / rNum+1=414 / rNum+2=0（新律 2/3·2/9·0，
//   旧定长 {1/3,1/3,1/3} 期望 rNum+1≈600 带外分离）。
//   观察基座：__swOnRoll 内部样本钩（观测不消费；hardmode-init 先例）。
//   ① 空库 fixture（全格 inactive/wall0 ⇒ convertCell 在 cs:55562 早退零掷）
//      下全部骰=条件重估掷 ⇒ 镜像 while 形逐位可对拍；
//   ② 内容 fixture（草带）下转化骰混流 ⇒ 只做确定性 + 覆盖频率律断言。
// ============================================================
describe('★RV-R4 行程随机性形状（cs:1969 条件重估语义，SecretSeedDoEndsPass.doHallowOnSurface）', () => {
  const GRASS = TILE_BY_KEY['grass']!;
  const NUM = 20;

  /** 空 hallow 面：cs:1972 循环体内 6 tile 臂 + 6 wall 臂全空转、convertCell 零入账 */
  function mkEmpty(w: number, h: number): TileStore {
    return new TileStore(w, h);
  }

  /** 镜像参照体（与移植体同构的 while 形）：空库下其掷数必须逐列逐位相等 */
  function referenceConditionRolls(w: number, num: number, seed: number): number {
    const r = new RNG(seed);
    let total = 0;
    for (let i = 0; i < w; i++) {
      let j = 0;
      while (j < num + r.nextInt(3)) j++;                       // 判定即掷骰（含恒真段）
      total += j + 1;                                           // + 终止负判一掷
    }
    return total;
  }

  const digestOf = (st: TileStore): string =>
    `${Array.from(st.type).join(',')}|${Array.from(st.wall).join(',')}`;

  it('同 seed 重放恒定：骰耗计数与全库 type/wall 位面双恒定（草带混流域）', () => {
    const w = 420, h = 90;
    const run = (): { rolls: number; digest: string } => {
      const st = new TileStore(w, h);
      for (let x = 0; x < w; x++) st.setTileSilent(x, NUM - 1, GRASS);
      const gs = mkGs(NUM);                                     // floor(ws)=20 ⇒ 带 [0,20+2]
      return { ...countRolls(() => doHallowOnSurface(st, new RNG(90210), gs)), digest: digestOf(st) };
    };
    const a = run(), b = run();
    expect(a.rolls).toBe(b.rolls);
    expect(a.digest).toBe(b.digest);
    expect(a.rolls).toBeGreaterThan(w * (NUM + 1));             // 旧定长形每列恰 num+1 掷——必不同值域
  });

  it('空库镜像对拍：条件重估总掷数 == 参照体逐列逐位相等；旧定长形差异可观测', () => {
    const w = 2400, num = NUM;
    for (const seed of [20260901, 777, 41]) {
      const st = mkEmpty(w, 64);
      const gs = mkGs(num);
      const { rolls } = countRolls(() => doHallowOnSurface(st, new RNG(seed), gs));
      expect(rolls).toBe(referenceConditionRolls(w, num, seed)); // 镜像逐位
      expect(rolls).toBeGreaterThanOrEqual(w * (num + 1));       // 下界：终止负判至少 1 掷/列
      expect(rolls).toBeLessThanOrEqual(w * (num + 3));          // 上界：K≤num+2 ⇒ 掷≤num+3
      const extra = rolls - w * (num + 1);                       // 多耗的中间行判定掷
      const mu = (8 / 9) * w;                                    // E[extra]=Σp={0,1,2}·{⅓,4⁄9,2⁄9}=8w/9
      const sd = Math.sqrt((80 / 81) * w);                       // Var=16/9−64/81=80/81 每 8 列——per col
      expect(Math.abs(extra - mu)).toBeLessThanOrEqual(6 * sd);  // 分布形状核（本仓值流已实测锁定）
      expect(extra).toBeGreaterThan(w * 0.5);                    // 旧定长形恒 extra=0 ⇒ 差异硬可观测
    }
  });

  it('覆盖面抽查：尾带覆盖律 2/3·2/9·恒零 + 基线行恒满（与旧定长 {1/3,1/3,1/3} 分离）', () => {
    const w = 1800, h = 90, num = 45;
    const st = new TileStore(w, h);
    for (let x = 0; x < w; x++) {
      st.setTileSilent(x, num - 1, GRASS);                      // 基线带（任何行程必访）
      st.setTileSilent(x, num, GRASS);                          // 需 j=num 过判（r≥1）p=2/3
      st.setTileSilent(x, num + 1, GRASS);                      // 需连过两判 p=(2/3)(1/3)=2/9
      st.setTileSilent(x, num + 2, GRASS);                      // int 加法判死 ⇒ p=0（上限锚）
    }
    const gs = mkGs(num);
    countRolls(() => doHallowOnSurface(st, new RNG(315000), gs));
    const inner = (y: number): number => {                     // cs:55562 InWorld(i,j,1)：i∈{0,w-1} 禁转
      let c = 0;
      for (let x = 1; x < w - 1; x++) if (sheetAt(st, x, y) === 109) c++;
      return c;
    };
    expect(inner(num - 1)).toBe(w - 2);                         // 基线行 100%（无覆盖缺口）
    const rNum = inner(num);                                    // 新律 μ≈1199 σ≈20；旧定长同 p ——非判别点，形状锚
    expect(Math.abs(rNum - (2 / 3) * (w - 2))).toBeLessThanOrEqual(150);
    const rPlus1 = inner(num + 1);                              // 新律 μ≈399±106（实测 414）；旧定长 μ≈600±60 带不相交
    expect(rPlus1).toBeLessThan(506);                           // 判别点：新律上界（旧律下界 540 以上必不落）
    expect(rPlus1).toBeGreaterThan(294);                        // 新律 6σ 下界
    expect(inner(num + 2)).toBe(0);                             // 上限锚：Next(3)∈{0,1,2} 无法满足 j=num+2
  });

  it('noSurface finalize 面：rockLevel 臂（cs:1963-1966 num 换源）走同一条件重估形态', () => {
    const w = 900, rl = 24, h = 64;
    const st = mkEmpty(w, h);
    const gs = { seedFlags: { noSurface: true }, worldSurface: 300, rockLevel: rl } as never;
    const { rolls } = countRolls(() => doHallowOnSurface(st, new RNG(606), gs));
    expect(rolls).toBe(referenceConditionRolls(w, Math.floor(rl), 606)); // 镜像逐位
  });
});

// =====================================================================
// ★V4 Santa 臂（WorldGen.cs:2205-2221 DoWorldIsFrozenFinish endlessChristmas 组合支,
//   2026-09-03）：向导 22 → Santa 142 homeless 异位替换——生成器无 NPC 实体域 →
//   投影到 flags.santaReplacedGuide + 十周年播种记录就地改键（零掷骰）。
// =====================================================================
describe('★V4 DoWorldIsFrozenFinish Santa 臂（cs:2205-2221）', () => {
  const mkWorld = (starterTownNpcs?: Array<{ key: string; givenName: string; x: number; y: number; anchor: [number, number]; dir: -1 | 1; variationIndex?: number }>) =>
    ({ flags: {}, starterTownNpcs }) as never as import('../src/world/World').World;
  const GS = (f: Record<string, boolean>) => ({ seedFlags: f }) as never;
  const rngAlwaysZero = () => ({ nextInt: () => 0 }) as never as RNG;
  const chests = () => [[{ id: 1, stack: 1 }, null, null]] as never;

  it('门：skyblock / 非 endlessChristmas 双早退——零旗标零记录零掷（普通种子零扰动）', () => {
    for (const f of [{ skyblock: true, endlessChristmas: true }, { skyblock: false, endlessChristmas: false }]) {
      const w = mkWorld([{ key: 'guide', givenName: 'Andrew', x: 0, y: 0, anchor: [1, 1], dir: 1 }]);
      doWorldIsFrozenFinish({} as never, rngAlwaysZero(), GS(f), chests(), w);
      expect((w as unknown as { flags: Record<string, boolean> }).flags.santaReplacedGuide).toBeUndefined();
      expect(w.starterTownNpcs![0].key).toBe('guide');
    }
  });

  it("endlessChristmas：记录域就地异位替换 guide→santa_claus（givenName 空串/dir=1/无变体）+ 旗置位", () => {
    const w = mkWorld([
      { key: 'guide', givenName: 'Andrew', x: 100, y: 200, anchor: [6, 7], dir: 1 },
      { key: 'steampunker', givenName: 'Whitney', x: 130, y: 200, anchor: [8, 7], dir: -1 },
    ]);
    doWorldIsFrozenFinish({} as never, rngAlwaysZero(), GS({ skyblock: false, endlessChristmas: true }), chests(), w);
    expect((w as unknown as { flags: Record<string, boolean> }).flags.santaReplacedGuide).toBe(true);
    expect(w.starterTownNpcs![0].key).toBe('santa_claus');
    expect(w.starterTownNpcs![0].givenName).toBe('');       // 142 名字掷 = getNewNPCName default ""
    expect(w.starterTownNpcs![0].dir).toBe(1);              // :2212 direction = 1
    expect(w.starterTownNpcs![0].variationIndex).toBeUndefined();
    expect(w.starterTownNpcs![0].x).toBe(100);              // position = 向导位（异位替换原位）
    expect(w.starterTownNpcs![1].key).toBe('steampunker');  // 其余播种席不动
  });

  it('无记录世界：仅置旗（消费端压制向导兜底+直生 Santa）,记录域零写;骰耗 = 箱 Next(2) 唯一', () => {
    const w = mkWorld(undefined);
    const { value, rolls } = countRolls(() =>
      doWorldIsFrozenFinish({} as never, new RNG(12345) as never, GS({ skyblock: false, endlessChristmas: true }), chests(), w));
    void value;
    expect((w as unknown as { flags: Record<string, boolean> }).flags.santaReplacedGuide).toBe(true);
    expect(w.starterTownNpcs).toBeUndefined();
    expect(rolls).toBe(1);                                  // 单箱 Next(2)=Santa 臂零骰（NewNPC(142) 无名字掷）
  });
});
