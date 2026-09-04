// ★演化域顺带批（2026-09-04 蓝队,上批 RD11 移交 4 项顺带观测）回归钉：
//   ① 地表 evil-sapling 清除支 + 655 荆棘清除支 —— cs:72721-72729 / cs:72630-72636
//      （655=PlanteraThorns 非蛾蛋;门=NPC.AnyNPCs(262),NPCID.cs:11595 Plantera=262;
//        底承集=腐化草 23 ∨ 猩红草 199,TileID.cs:483/:835）
//   ② growCactus 头门 nactive 化 —— cs:57059 原版字面 `!tile.nactive()`
//   ③ 地表 233 兜底 3×2 化（PlaceJunglePlant + Next(12) 重试）—— cs:75375-75390
//      （★F7 勘误,曾误锚 cs:75295-75308=猩红 SpreadGrass flag7 段）
//   ④ remix 花藤掷（cs:73108-73111）+ 藤块 Next(1) 掷位归位（cs:73087-73090,
//      UnifiedRandom.Next(maxValue) 恒走 Sample()）+ 水晶碎块/叶绿 remix 深度带
//      （cs:70137/:70180）
// 掷位敏感用例走 spreadRng.next 脚本化（确定性驱动,顺带断言掷数）。
import { describe, it, expect } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

// ---- sheet id → 内部 tile id（同 rd11 约定） ----
const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;
const L_WATER = 1;

function makeEvo(st: TileStore, over: Partial<EvolutionHost> = {}): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed: 20260904,
    worldSurface: 50,       // 采样行之上 → 地表带判定可控
    rockLevel: 500,
    dungeonX: 600, difficulty: 0,
    flags: {},
    crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    ...over,
  };
  return new WorldEvolution(host);
}

type Priv = {
  overgroundTile(i: number, j: number, wallDist: number): void;
  undergroundTile(i: number, j: number, wallDist: number): void;
  grassGrowth(i: number, j: number, a: number, b: number, c: number, d: number, under: boolean): void;
  growCactus(i: number, j: number): void;
  hardUpdateWorld(i: number, j: number): void;
  placeJunglePlant(x: number, y: number, sheet: number, sx: number, sy: number): boolean;
};
/** 直调桥;hardMode/allowedToSpread 直置私有域（镜像 update() 头两行装载语义,同 rd11） */
const priv = (evo: WorldEvolution, hardMode = false): Priv => {
  const p = evo as unknown as { hardMode: boolean; allowedToSpread: boolean; host: EvolutionHost };
  p.hardMode = hardMode || !!p.host.flags.hardMode;
  p.allowedToSpread = !p.host.journeyStopBiomeSpread;
  return evo as unknown as Priv;
};

/** spreadRng.next 脚本化：逐掷返回 script 值,末尾兜底 0.9（落空多数概率门） */
function scriptRng(evo: unknown, script: number[]): { calls: () => number } {
  const rngAny = evo as unknown as { spreadRng: { next(): number } };
  let k = 0;
  rngAny.spreadRng.next = () => (k < script.length ? script[k++] : 0.9);
  return { calls: () => k };
}

// 800 宽：采样 x=400 不落 beach 带（beachDistance=380）→ 贝壳支恒短路,掷位可断言
function wideWorld(): TileStore {
  return new TileStore(800, 80);
}

describe('①a 655 世纪之花荆棘清除（cs:72630-72636,AnyNPCs(262) 门）', () => {
  it('场上无世纪之花 → 采样即清除（零掷,KillTile 后原地停摆）', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(655));
    const evo = priv(makeEvo(st));
    const cnt = scriptRng(evo, [0.9, 0.9]);            // 槽位哨兵:有掷即计数
    evo.overgroundTile(400, 40, 3);
    expect(cnt.calls()).toBe(0);                       // 清除无掷骰,且后链 !nactive 早退
    expect(st.flags[st.idx(400, 40)]).toBe(0);         // ★荆棘被收走
  });

  it('anyPlantera()=true（花在野）→ 荆棘保留', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(655));
    const evo = priv(makeEvo(st, { anyPlantera: () => true }));
    evo.overgroundTile(400, 40, 3);
    expect(st.flags[st.idx(400, 40)]).toBe(1);
    expect(st.type[st.idx(400, 40)]).toBe(S(655));
  });

  it('幽灵 655 残型：杀面掷而不落（KillTile 头门=原版字面,type 保留）', () => {
    const st = wideWorld();
    st.type[st.idx(400, 40)] = S(655);                 // flags=0 残型
    const evo = priv(makeEvo(st));
    const cnt = scriptRng(evo, [0.9, 0.9]);
    evo.overgroundTile(400, 40, 3);
    expect(cnt.calls()).toBe(0);
    expect(st.type[st.idx(400, 40)]).toBe(S(655));     // 残型不被硬清（原版相）
    expect(st.flags[st.idx(400, 40)]).toBe(0);
  });
});

describe('①b 邪恶地树苗清除（cs:72721-72729,底承 腐化草23/猩红草199 → KillTile）', () => {
  it('596 树苗底承猩红草 199 → 清除（零掷）;底承普通草 2 → 保留', () => {
    const stKill = wideWorld();
    stKill.setTileSilent(400, 40, S(596));
    stKill.setTileSilent(400, 41, S(199));
    const evoKill = priv(makeEvo(stKill));
    const cntKill = scriptRng(evoKill, [0.9, 0.9]);
    evoKill.overgroundTile(400, 40, 3);
    expect(cntKill.calls()).toBe(0);
    expect(stKill.flags[stKill.idx(400, 40)]).toBe(0); // ★树苗被杀

    const stKeep = wideWorld();
    stKeep.setTileSilent(400, 40, S(596));
    stKeep.setTileSilent(400, 41, S(2));               // 普通草底承 → 不杀
    const evoKeep = priv(makeEvo(stKeep));
    const cntKeep = scriptRng(evoKeep, [0.9, 0.9]);
    evoKeep.overgroundTile(400, 40, 3);
    expect(stKeep.flags[stKeep.idx(400, 40)]).toBe(1);
    expect(cntKeep.calls()).toBe(1);                   // 杀支跳过（1 掷=plantDye 1/3000）
  });

  it('615 树苗底承腐化草 23 → 清除（底承集含 23）', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(615));
    st.setTileSilent(400, 41, S(23));
    const evo = priv(makeEvo(st));
    evo.overgroundTile(400, 40, 3);
    expect(st.flags[st.idx(400, 40)]).toBe(0);
  });

  it('底承 type 裸读（无 active 门=原版字面）：幽灵 199 底承照样命中', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(596));
    st.type[st.idx(400, 41)] = S(199);                 // 幽灵残型底承（flags=0）
    const evo = priv(makeEvo(st));
    const cnt = scriptRng(evo, [0.9, 0.9]);
    evo.overgroundTile(400, 40, 3);
    expect(cnt.calls()).toBe(0);
    expect(st.flags[st.idx(400, 40)]).toBe(0);         // ★裸读命中 → 杀（勿加 active 门）
  });
});

// ★F1（2026-09-04 蓝队 M24 补遗）：UndergroundTile 首个独立 if（cs:73830-73837,
// 位次在药草支 cs:73838-73839 之前）——地表支（cs:72630-72636,①a 已钉）的孪生。
describe('①c 地下 655 荆棘清除（cs:73830-73837,AnyNPCs(262) 门,alch 链之前）', () => {
  it('地下荆棘 + 无世花 → 采样即清除（零掷,同地表支）', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(655));
    const evo = priv(makeEvo(st));
    const cnt = scriptRng(evo, [0.9, 0.9]);            // 槽位哨兵:有掷即计数
    evo.undergroundTile(400, 40, 3);
    expect(cnt.calls()).toBe(0);                       // 清除无掷骰,后链 !isActive 早退
    expect(st.flags[st.idx(400, 40)]).toBe(0);         // ★地下荆棘被收走
  });

  it('anyPlantera()=true（花在野）→ 地下荆棘保留', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(655));
    const evo = priv(makeEvo(st, { anyPlantera: () => true }));
    scriptRng(evo, [0.9]);                             // 哨兵:1/2500 染料掷落空,全链确定性
    evo.undergroundTile(400, 40, 3);
    expect(st.flags[st.idx(400, 40)]).toBe(1);
    expect(st.type[st.idx(400, 40)]).toBe(S(655));
  });
});

describe('② growCactus 头门 nactive 化（cs:57059）', () => {
  it('已致动仙人掌：头门早退,零掷不长', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(80));
    st.wire[st.idx(400, 40)] |= TileStore.WIRE_ACTUATED;
    const evo = priv(makeEvo(st));
    const cnt = scriptRng(evo, [0.9]);
    evo.growCactus(400, 40);
    expect(cnt.calls()).toBe(0);                       // 头门在水量窗/密度骰之前
    expect(st.flags[st.idx(400, 39)]).toBe(0);
  });

  it('未致动仙人掌照常长（回归;height0 直上）', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(80));
    const evo = priv(makeEvo(st));
    evo.growCactus(400, 40);
    expect(st.type[st.idx(400, 39)]).toBe(S(80));      // 顶上接一节
  });
});

describe('③ 地表 233 兜底 3×2 化（cs:75375-75390,PlaceJunglePlant+Next(12) 重试）', () => {
  function jungleSurface(thirdCol: number): TileStore {
    const st = wideWorld();
    st.setTileSilent(400, 41, S(60));                  // 采样丛林草（minJ=40）
    st.setTileSilent(399, 41, S(60));                  // 3×2 底承三列
    st.setTileSilent(401, 41, S(thirdCol));
    return st;
  }
  it('3×2 株整件落位（三列 fx=0/18/36,两行 fy=0/18）', () => {
    const st = jungleSurface(60);
    const evo = priv(makeEvo(st));
    const cnt = scriptRng(evo, [0.9, 0.9, 0.0001, 0.0]); // 1/7 落空;1/500 落空;1/25 过;Next(8)=0
    evo.grassGrowth(400, 41, 399, 402, 40, 43, false);
    expect(cnt.calls()).toBe(4);
    expect(st.type[st.idx(399, 39)]).toBe(S(233));     // ★三列整件（旧 1×1 只落一格）
    expect(st.type[st.idx(400, 39)]).toBe(S(233));
    expect(st.type[st.idx(401, 39)]).toBe(S(233));
    expect(st.frameX[st.idx(399, 39)]).toBe(0);
    expect(st.frameX[st.idx(400, 39)]).toBe(18);
    expect(st.frameX[st.idx(401, 39)]).toBe(36);
    expect(st.frameY[st.idx(400, 40)]).toBe(18);       // 第二行
  });

  it('3×2 失手（第三列底承非丛林草）→ Next(12) styleY=1 的 2×2 档重试', () => {
    const st = jungleSurface(1);                       // 石块断第三列底承
    const evo = priv(makeEvo(st));
    const cnt = scriptRng(evo, [0.9, 0.9, 0.0001, 0.9, 0.0]); // …Next(8) 落空;Next(12)=0 重试
    evo.grassGrowth(400, 41, 399, 402, 40, 43, false);
    expect(cnt.calls()).toBe(5);                       // ★重试掷位在场
    expect(st.type[st.idx(399, 39)]).toBe(S(233));     // 2×2 档
    expect(st.type[st.idx(400, 40)]).toBe(S(233));
    expect(st.type[st.idx(401, 39)]).toBe(0);          // ★无第三列（=2×2 非 3×2）
    expect(st.frameY[st.idx(399, 39)]).toBe(36);       // 2×2 num3=36（3×2 档为 dy*18）
    expect(st.frameY[st.idx(399, 40)]).toBe(54);
  });
});

describe('④a remix 花藤掷（cs:73108-73111）+ 藤块 Next(1) 掷位归位（cs:73087-73090）', () => {
  // overgroundTile 直调链（草 2 样本）：plantDye 1/3000 → SPREAD_OVERGROUND 支
  //  grassGrowth 地表 2 档顶植物 1/12 → 藤尾 Next(1) →（remix）Next(5)
  function vineStage(sample: number): TileStore {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(sample));
    return st;
  }
  it('remix + Next(5)==0 → 新藤=花藤 382（掷数 4：dye+1/12+Next(1)+Next(5)）', () => {
    const st = vineStage(2);
    const evo = priv(makeEvo(st, { remixWorld: true }));
    const cnt = scriptRng(evo, [0.9, 0.9, 0.5, 0.0]);  // dye 落空;1/12 落空;Next(1) 过;Next(5)=0
    evo.overgroundTile(400, 40, 3);
    expect(cnt.calls()).toBe(4);                       // ★Next(1) 消费在场（旧码漏掷=3 掷）
    expect(st.type[st.idx(400, 41)]).toBe(S(382));     // ★花藤
  });

  it('非 remix → 普通藤 52（三掷,无 Next(5)）', () => {
    const st = vineStage(2);
    const evo = priv(makeEvo(st));
    const cnt = scriptRng(evo, [0.9, 0.9, 0.5]);
    evo.overgroundTile(400, 40, 3);
    expect(cnt.calls()).toBe(3);
    expect(st.type[st.idx(400, 41)]).toBe(S(52));
  });

  it('remix 但 Next(5)!=0 → 普通藤 52（四掷照消费）', () => {
    const st = vineStage(2);
    const evo = priv(makeEvo(st, { remixWorld: true }));
    const cnt = scriptRng(evo, [0.9, 0.9, 0.5, 0.9]);
    evo.overgroundTile(400, 40, 3);
    expect(cnt.calls()).toBe(4);
    expect(st.type[st.idx(400, 41)]).toBe(S(52));
  });

  it('顶格=52：不在 Next(5) 域（else-if 域外,无 Next(5) 掷）', () => {
    const st = wideWorld();
    st.setTileSilent(400, 38, S(2));                   // 藤柱锚（草 2）
    st.setTileSilent(400, 39, S(52));
    st.setTileSilent(400, 40, S(52));                  // 采样藤（悬浮藤会被级联 CheckVines 收走
    const evo = priv(makeEvo(st, { remixWorld: true })); //  ——故用真藤柱夹具,与原版相一致）
    const cnt = scriptRng(evo, [0.9, 0.5]);
    evo.overgroundTile(400, 40, 3);
    expect(cnt.calls()).toBe(2);                       // 域外不掷（dye+Next(1)）
    expect(st.type[st.idx(400, 41)]).toBe(S(52));      // 藤柱延长
    expect(st.flags[st.idx(400, 40)]).toBe(1);         // 采样藤自身不被级联误收
  });
});

describe('④b 水晶碎块 remix 深度带放宽（cs:70137）', () => {
  it('remix：岩层之上珍珠石 117 也长碎块 129（非 remix 带内拒=零掷）', () => {
    const stR = wideWorld();
    stR.setTileSilent(400, 40, S(117));
    const evoR = priv(makeEvo(stR, {
      rockLevel: 500, remixWorld: true, flags: { hardMode: true },
      journeyStopBiomeSpread: true,                    // 隔离邪恶蔓延臂的掷骰
    }), true);
    // ★F4 掷序（cs:70160-63）：Next(18) 在 Next(50) 之前——脚本 0.5 落在 Next(18)
    //  （style 9 → fx 162）,0.9 落在 Next(50)（落空）。旧序下同脚本会得 fx=16*18。
    const cntR = scriptRng(evoR, [0.0, 0.0, 0.5, 0.9]); // 1/5 过;Next(4)=向左;Next(18)=9;rare 1/50 落空
    evoR.hardUpdateWorld(400, 40);
    expect(cntR.calls()).toBe(4);
    expect(stR.type[stR.idx(399, 40)]).toBe(S(129));   // ★岩层之上落碎块
    expect(stR.frameX[stR.idx(399, 40)]).toBe(9 * 18);

    const stN = wideWorld();
    stN.setTileSilent(400, 40, S(117));
    const evoN = priv(makeEvo(stN, {
      rockLevel: 500, flags: { hardMode: true }, journeyStopBiomeSpread: true,
    }), true);
    const cntN = scriptRng(evoN, []);
    evoN.hardUpdateWorld(400, 40);
    expect(cntN.calls()).toBe(0);                      // 非 remix：带先拒,Next(5) 不消费
    expect(stN.type[stN.idx(399, 40)]).toBe(0);
  });
});

// ★F4（2026-09-04 蓝队 M24 补遗）水晶 style 掷序（cs:70160-63）：先 Next(18),后
//  Next(50)==0 条件才掷 Next(6)——稀有 3 掷/普通 2 掷不变,序变（旧码先 50 后 18）。
describe('④d 水晶 style 掷序（cs:70160-63,先 18 后 50 条件 6）', () => {
  const mkShardEvo = (st: TileStore) => priv(makeEvo(st, {
    rockLevel: 500, remixWorld: true, flags: { hardMode: true }, journeyStopBiomeSpread: true,
  }), true);
  it('rare 档：Next(18)+Next(50)+Next(6) 三掷 → style=18+Next(6)（fx≥324）', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(117));
    const evo = mkShardEvo(st);
    const cnt = scriptRng(evo, [0.0, 0.0, 0.0, 0.0, 0.0]); // 1/5 过;Next(4)=左;18=0;50=0(rare);6=0
    evo.hardUpdateWorld(400, 40);
    expect(cnt.calls()).toBe(5);                       // ★rare 三掷在 1/5+方向之后
    expect(st.type[st.idx(399, 40)]).toBe(S(129));
    expect(st.frameX[st.idx(399, 40)]).toBe(18 * 18);  // ★style 18 → fx=324（18..23 rare 档）
  });

  it('普通档：Next(18)+Next(50) 两掷,Next(6) 不消费', () => {
    const st = wideWorld();
    st.setTileSilent(400, 40, S(117));
    const evo = mkShardEvo(st);
    const cnt = scriptRng(evo, [0.0, 0.0, 0.5, 0.9]);  // 1/5 过;Next(4)=左;Next(18)=9;Next(50) 落空
    evo.hardUpdateWorld(400, 40);
    expect(cnt.calls()).toBe(4);
    expect(st.frameX[st.idx(399, 40)]).toBe(9 * 18);
  });
});

// ★F3（2026-09-04 蓝队 M24 补遗）方向表 vanilla 化（cs:70141-51 default 支
//  `num3=(num!=0)?1:-1`——num∈{2,3} 恒 ≠0 → dy 恒 +1,原版永不向上）。
describe('④e 水晶碎块方向表（cs:70141-51,L/R/D/D,无向上支）', () => {
  const cases: Array<[number, number, number]> = [
    [0, 399, 40],   // 左
    [1, 401, 40],   // 右
    [2, 400, 41],   // 下（default 支 num=2≠0 → dy=+1）
    [3, 400, 41],   // 下（default 支 num=3≠0 → dy=+1）
  ];
  for (const [d, ex, ey] of cases) {
    it(`Next(4)=${d} → (${ex},${ey})`, () => {
      const st = wideWorld();
      st.setTileSilent(400, 40, S(117));
      const evo = priv(makeEvo(st, {
        rockLevel: 500, remixWorld: true, flags: { hardMode: true }, journeyStopBiomeSpread: true,
      }), true);
      const cnt = scriptRng(evo, [0.0, d / 4, 0.5, 0.9]); // 1/5 过;Next(4)=d;Next(18)=9;1/50 落空
      evo.hardUpdateWorld(400, 40);
      expect(cnt.calls()).toBe(4);
      expect(st.type[st.idx(ex, ey)]).toBe(S(129));      // d=2/3 皆向下=原版（旧表 d=2 会向上）
    });
  }
});

describe('④c 叶绿 remix 深度带放宽（cs:70180,中带上移含两臂）', () => {
  it('remix：中带之上 211 自增殖入泥 59（非 remix 停=零掷）', () => {
    const stR = wideWorld();
    stR.setTileSilent(400, 40, S(211));
    stR.setTileSilent(401, 40, S(59));                 // 泥邻（自增殖目标）
    const evoR = priv(makeEvo(stR, {
      worldSurface: 50, rockLevel: 500, remixWorld: true,
      flags: { hardMode: true }, journeyStopBiomeSpread: true,
    }), true);
    const cntR = scriptRng(evoR, [0.9, 0.0, 0.5, 0.5]); // Next(3)!=0 过;Next(4)=右;退化 x/y
    evoR.hardUpdateWorld(400, 40);
    expect(cntR.calls()).toBe(4);
    expect(stR.type[stR.idx(401, 40)]).toBe(S(211));   // ★中带之上照扩散
    expect(stR.type[stR.idx(400, 40)]).toBe(S(211));   // 源格无恙（convert 9 对 211 无操作）

    const stN = wideWorld();
    stN.setTileSilent(400, 40, S(211));
    stN.setTileSilent(401, 40, S(59));
    const evoN = priv(makeEvo(stN, {
      worldSurface: 50, rockLevel: 500, flags: { hardMode: true },
      journeyStopBiomeSpread: true,
    }), true);
    const cntN = scriptRng(evoN, []);
    evoN.hardUpdateWorld(400, 40);
    expect(cntN.calls()).toBe(0);                      // 非 remix：j=40 < 中带 275 → 整臂跳过
    expect(stN.type[stN.idx(401, 40)]).toBe(S(59));
  });
});
