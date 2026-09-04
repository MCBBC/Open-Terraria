// ★演化域相邻批（2026-09-04 蓝队，红队 RD 演化域 10 项非幽灵相邻偏差）回归钉：
//   ① 主链门 nactive 化（已致动格原地停摆）—— cs:72793/:73114/:73123
//   ② SpreadGrass 向日葵守卫补 109（神圣草）—— cs:75793-75798 三段并列
//   ③ MossConversion 补 179↔512 对 —— cs:72009-72010
//   ④ GrowSpike 首段过密早退（4 邻计数 num4>=3,方向骰前）—— cs:45898-45914
//   ⑤ SpreadGrass 3×3 岩浆扫描双层循环+内层 break（后列洞可放行）—— cs:75786-75799
//   ⑥ journey 感染门（地下邪恶族四支内联 + 地表荆棘归一门 + flag8 外层过滤）
//      —— cs:74888/:74900/:74913/:74926/:75195-75202/:75227-75229
//   ⑦ 缺支族：SlowlyDiesInWater 水淹杀（cs:72761-72768）/ 海草 549（cs:73908-73916）
//      / 竹 571（cs:72728-72734/:58875-58933）/ 万圣南瓜窗（cs:75122-75142）
//      / 绿洲植物 530 维护（cs:72873-72882）/ 墓碑 85→Abigail 花（cs:72631-72634）
//   ⑧ 生命果 236 走 PlaceJunglePlant（styleX=Next(3) 掷 + 允许族覆写面）—— cs:75061-75077
//   ⑨ seed-variant：GrowCactus 密度 Next(11,20)（drunk,cs:57181-57187）/ 水量门地表豁免
//      （remix,cs:57075）/ CheckAlch case5 岩浆 83⇄84 翻面（cs:46451-46468）
//   ⑩ CheckLilyPad 杀支=liquidType()!=0 含微光 —— cs:59699-59706
// 掷位敏感用例走 spreadRng.next 脚本化（确定性驱动,顺带断言掷数）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

// ---- sheet id → 内部 tile id（同 ghost-evolution-rd10.test.ts 约定） ----
const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;
// store 液体类型（原版 +1 编码）：1=水 2=岩浆 4=微光（TileStore.LIQUID_TYPE）
const L_WATER = 1, L_LAVA = 2, L_SHIMMER = 4;

function makeEvo(st: TileStore, over: Partial<EvolutionHost> = {}): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed: 20260904,
    worldSurface: 50,       // 缺省抬到采样行之上 → 地表带判定可控（各用例覆写）
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
  spreadGrass(i: number, j: number, dirt: number, grass: number): void;
  growSpike(i: number, j: number, spike: number, land: number): void;
  mossConversion(a: number, b: number): number;
  overgroundTile(i: number, j: number, wallDist: number): void;
  undergroundTile(i: number, j: number, wallDist: number): void;
  grassGrowth(i: number, j: number, a: number, b: number, c: number, d: number, under: boolean): void;
  alchCheckAt(x: number, y: number): boolean;
  checkLilyPad(x: number, y: number): boolean;
  growCactus(i: number, j: number): void;
  placeJunglePlant(x: number, y: number, sheet: number, sx: number, sy: number): boolean;
};
/** 直调桥；hardMode/allowedToSpread 直置私有域（update() 才从 host 装载,直调面须手开
 *  ——镜像 update() 头两行装载语义） */
const priv = (evo: WorldEvolution, hardMode = false): Priv => {
  const p = evo as unknown as { hardMode: boolean; allowedToSpread: boolean; host: EvolutionHost };
  p.hardMode = hardMode || !!p.host.flags.hardMode;
  p.allowedToSpread = !p.host.journeyStopBiomeSpread;
  return evo as unknown as Priv;
};

/** spreadRng.next 脚本化：逐掷返回 script 值,末尾兜底 0.9（落空多数概率门）；
 *  @returns 掷数计数器（掷位断言用） */
function scriptRng(evo: unknown, script: number[]): { calls: () => number } {
  const rngAny = evo as unknown as { spreadRng: { next(): number } };
  let k = 0;
  rngAny.spreadRng.next = () => (k < script.length ? script[k++] : 0.9);
  return { calls: () => k };
}

/** 蔓延流观察（core/rng.ts __swOnRoll 观察钩：观测不消费;接受直调桥句柄） */
function captureRolls(evo: WorldEvolution | Priv, fn: () => void): number[] {
  const stream = (evo as unknown as { spreadRng: RNG }).spreadRng.vanilla;
  const out: number[] = [];
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const prev = g.__swOnRoll;
  g.__swOnRoll = (v, inst) => { if (inst === stream) out.push(v); };
  try { fn(); } finally { g.__swOnRoll = prev; }
  return out;
}

afterEach(() => {
  const g = globalThis as { __swOnRoll?: unknown };
  delete g.__swOnRoll;
  vi.restoreAllMocks();
});

/** 3×3 实体环（跳过中心;holes=相对偏移留洞）——spreadGrass 封死/岩浆扫描用 */
function solidRing(st: TileStore, cx: number, cy: number, sheet = 1, holes: Array<[number, number]> = []): void {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (holes.some(([hx, hy]) => hx === dx && hy === dy)) continue;
      st.setTileSilent(cx + dx, cy + dy, S(sheet));
    }
  }
}

describe('② SpreadGrass 向日葵守卫含神圣草 109（cs:75793-75798）', () => {
  it('109 转普通草：上方向日葵挡 / 无向日葵放行', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(2));                        // 目标=普通草
    solidRing(st, 40, 40, 2, [[1, 1]]);                    // 环留洞防封死
    st.setTileSilent(40, 39, S(27));                       // 向日葵
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.spreadGrass(40, 40, 2, 109);
    expect(st.type[st.idx(40, 40)]).toBe(S(2));            // 神圣草被向日葵挡（旧码只挡邪恶族）
    st.setTileSilent(40, 39, 0);                           // 摘向日葵
    evo.spreadGrass(40, 40, 2, 109);
    expect(st.type[st.idx(40, 40)]).toBe(S(109));          // 放行
  });

  it('23 邪恶草仍被向日葵挡（回归不破）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(2));
    solidRing(st, 40, 40, 2, [[1, 1]]);
    st.setTileSilent(40, 39, S(27));
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.spreadGrass(40, 40, 2, 23);
    expect(st.type[st.idx(40, 40)]).toBe(S(2));
  });
});

describe('⑤ SpreadGrass 3×3 岩浆扫描=双层循环+内层 break（cs:75786-75799）', () => {
  it('岩浆在前列+洞在后列 → flag 打回 false → 放行（旧码外层恒拒）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(0));                        // 目标=泥土
    solidRing(st, 40, 40, 1, [[-1, -1], [1, 1]]);
    st.setLiquid(39, 39, 255, L_LAVA);                     // 岩浆（dx=-1 列,先扫）
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.spreadGrass(40, 40, 0, 2);
    expect(st.type[st.idx(40, 40)]).toBe(S(2));            // 后列洞放行=原版相
  });

  it('洞在前列+岩浆在末列 → flag=true 收尾 → 恒拒', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(0));
    solidRing(st, 40, 40, 1, [[-1, -1], [1, 1]]);
    st.setLiquid(41, 41, 255, L_LAVA);                     // 岩浆（dx=+1 列,最后扫）
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.spreadGrass(40, 40, 0, 2);
    expect(st.type[st.idx(40, 40)]).toBe(S(0));            // 拒
  });

  it('全环实体无洞 → 封死恒拒（回归）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(0));
    solidRing(st, 40, 40, 1);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.spreadGrass(40, 40, 0, 2);
    expect(st.type[st.idx(40, 40)]).toBe(S(0));
  });
});

describe('④ GrowSpike 首段过密早退（cs:45898-45914）', () => {
  /** 荆棘/草源 + n 个 32 四邻（第 4 槽位放对角,不影响 4 邻计数） */
  function thornWithNeighbors(n: number, sourceSheet = 32): TileStore {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(sourceSheet));
    st.setTileSilent(40, 41, S(23));                       // 底承腐化草
    const slots: Array<[number, number]> = [[39, 40], [41, 40], [40, 39], [38, 38]];
    for (let k = 0; k < n; k++) st.setTileSilent(slots[k][0], slots[k][1], S(32));
    return st;
  }

  it('3 邻同类荆棘+源非草 → 方向骰前早退（零掷/零生长）', () => {
    const st = thornWithNeighbors(3);
    const evo = priv(makeEvo(st));
    const rolls = captureRolls(evo, () => evo.growSpike(40, 40, 32, 23));
    expect(rolls.length).toBe(0);                          // 早退在 genRand.Next(4) 之前
    expect(st.flags[st.idx(38, 38)]).toBe(0);              // 对角空位无新荆棘
  });

  it('源=landType(23) 时豁免早退（cs:45907 type!=landType 条件）→ 照掷', () => {
    const st = thornWithNeighbors(3, 23);
    const evo = priv(makeEvo(st));
    const rolls = captureRolls(evo, () => evo.growSpike(40, 40, 32, 23));
    expect(rolls.length).toBe(1);                          // 方向骰照掷（四邻全占→掷后即返）
  });

  it('≤2 邻 → 不早退,方向骰照掷', () => {
    const st = thornWithNeighbors(2);
    const evo = priv(makeEvo(st));
    const rolls = captureRolls(evo, () => evo.growSpike(40, 40, 32, 23));
    expect(rolls.length).toBe(1);
  });
});

describe('③ MossConversion 补 179↔512（cs:72009-72010）', () => {
  // 语义（cs:72000-72008 首两支优先）：苔(sample)邻石(1) → 苔自身蔓延;苔砖邻石砖(38) → 自身;
  // switch 对=苔↔苔砖经"异类邻"翻面——苔 179 邻石砖 38 → 石砖转苔砖 512;苔砖 512 邻石 1 → 石转苔 179
  it('179↔512 双向对（异类邻翻面）+首两支优先回归', () => {
    const evo = priv(makeEvo(new TileStore(80, 80)));
    expect(evo.mossConversion(179, 38)).toBe(512);         // ★新对:苔→苔砖（旧表缺=返回 0 不转）
    expect(evo.mossConversion(512, 1)).toBe(179);          // ★新对:苔砖→苔
    expect(evo.mossConversion(179, 1)).toBe(179);          // 苔邻石 → 苔自蔓延（首两支优先）
    expect(evo.mossConversion(512, 38)).toBe(512);         // 苔砖邻石砖 → 自身
    expect(evo.mossConversion(182, 38)).toBe(515);         // 既有对回归
  });
});

describe('① 主链门 nactive 化（cs:72793/:73114/:73123）', () => {
  it('已致动森林草不走主链：零掷 + 邻泥不转', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(2));
    st.setTileSilent(41, 40, S(0));                        // 泥邻（worldSurface 之上可转）
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    st.wire[st.idx(40, 40)] |= TileStore.WIRE_ACTUATED;    // inActive()
    const rolls = captureRolls(evo, () => evo.overgroundTile(40, 40, 3));
    expect(rolls.length).toBe(0);                          // else 支（蛛网门不满足）零掷=主链整跳
    expect(st.type[st.idx(41, 40)]).toBe(S(0));            // 泥不转
  });

  it('未致动森林草照常演化：泥邻转草', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(2));
    st.setTileSilent(41, 40, S(0));
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.overgroundTile(40, 40, 3);
    expect(st.type[st.idx(41, 40)]).toBe(S(2));
  });
});

describe('⑥ journey 感染门（cs:74888+/:75195-75202/:75227-75229）', () => {
  it('地下邪恶草 23：stop-spread 开 → 泥不转（四支内联 return）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(23));
    st.setTileSilent(41, 40, S(0));
    const evo = priv(makeEvo(st, { worldSurface: 50, journeyStopBiomeSpread: true }));
    evo.grassGrowth(40, 40, 39, 42, 39, 42, true);
    expect(st.type[st.idx(41, 40)]).toBe(S(0));
  });

  it('地下邪恶草 23：stop-spread 关 → 泥转邪恶草（回归）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(23));
    st.setTileSilent(41, 40, S(0));
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.grassGrowth(40, 40, 39, 42, 39, 42, true);
    expect(st.type[st.idx(41, 40)]).toBe(S(23));
  });

  it('地表荆棘 32：stop-spread 开 → 归一门 return（泥不转）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(32));
    st.setTileSilent(41, 40, S(0));
    const evo = priv(makeEvo(st, { worldSurface: 50, journeyStopBiomeSpread: true }));
    evo.grassGrowth(40, 40, 39, 42, 39, 42, false);
    expect(st.type[st.idx(41, 40)]).toBe(S(0));
  });

  it('地表神圣草 109：stop-spread 开 → 普通草 2 不被吞（flag8 外层过滤 B 段）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(109));
    st.setTileSilent(41, 40, S(2));
    const evo = priv(makeEvo(st, { worldSurface: 50, journeyStopBiomeSpread: true }));
    evo.grassGrowth(40, 40, 39, 42, 39, 42, false);
    expect(st.type[st.idx(41, 40)]).toBe(S(2));            // 旧码未过 flag8 门=会被吞
  });

  it('地表邪恶草 23：stop-spread 开 → 普通草 2 不被吞（flag8 滤 A 段三支）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(23));
    st.setTileSilent(41, 40, S(2));
    const evo = priv(makeEvo(st, { worldSurface: 50, journeyStopBiomeSpread: true }));
    evo.grassGrowth(40, 40, 39, 42, 39, 42, false);
    expect(st.type[st.idx(41, 40)]).toBe(S(2));
  });

  it('地表神圣草 109：stop-spread 关 → 普通草 2 照常被吞（回归）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(109));
    st.setTileSilent(41, 40, S(2));
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.grassGrowth(40, 40, 39, 42, 39, 42, false);
    expect(st.type[st.idx(41, 40)]).toBe(S(109));
  });
});

describe('⑦ SlowlyDiesInWater 水淹杀（cs:72761-72768）', () => {
  it('浸水向日葵 27 采样 → KillTile', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(27));
    st.setLiquid(40, 40, 255, L_WATER);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.overgroundTile(40, 40, 3);
    expect(st.flags[st.idx(40, 40)]).toBe(0);              // 泡水植物死亡
  });

  it('浸水石块 1 不在表 → 不杀（支位不误伤）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(1));
    st.setLiquid(40, 40, 255, L_WATER);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.overgroundTile(40, 40, 3);
    expect(st.flags[st.idx(40, 40)]).toBe(1);
  });

  it('浸水丛林草 60 走水淹 GrassGrowth（else-if 互斥内联支,泥邻转 60）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(60));
    st.setTileSilent(41, 40, S(59));                       // 泥邻
    st.setLiquid(40, 40, 255, L_WATER);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.overgroundTile(40, 40, 3);
    expect(st.type[st.idx(41, 40)]).toBe(S(60));
  });
});

describe('⑦ 海草 549（cs:73908-73916 GrowCheckSeaweed）', () => {
  it('沙 53 + 上方深水 → 播种 549', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(53));                       // 沙
    st.setTileSilent(41, 40, S(53));
    for (let y = 37; y <= 39; y++) st.setLiquid(40, y, 255, L_WATER);   // 满水三格
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    let placed = false;
    for (let n = 0; n < 6000 && !placed; n++) {
      evo.undergroundTile(40, 40, 3);
      placed = st.flags[st.idx(40, 39)] === 1 && st.type[st.idx(40, 39)] === S(549);
    }
    expect(placed).toBe(true);                             // 深水播种面活（1/20×Next(1)×17/20）
  });

  it('浅水（上格 liquid<200）不播种', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(53));
    st.setLiquid(40, 39, 100, L_WATER);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    for (let n = 0; n < 3000; n++) evo.undergroundTile(40, 40, 3);
    expect(st.flags[st.idx(40, 39)]).toBe(0);
  });
});

describe('⑦ 竹 571（cs:72728-72734 + PlaceBamboo cs:58875-58933）', () => {
  it('水下巴竹采样 1/5 → 水深 2-5+密度门过 → 上方落新竹', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 41, S(571));                      // 采样竹（水淹）
    st.setTileSilent(40, 42, S(571));
    st.setTileSilent(40, 43, S(53));                       // 底=沙（水深探测底）
    for (let y = 38; y <= 42; y++) st.setLiquid(40, y, 255, L_WATER);   // 水深=5
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    const cnt = scriptRng(evo, [0.1, 0.99, 0.5, 0.5]);     // 1/5 过;Next(1,21)=20;除骰;Next(40,61)=50
    evo.overgroundTile(40, 41, 3);
    expect(cnt.calls()).toBe(4);                           // 派发 1 掷 + PlaceBamboo 3 掷
    expect(st.type[st.idx(40, 40)]).toBe(S(571));          // 新竹落位
  });
});

describe('⑦ 万圣南瓜窗（cs:75122-75142 PlacePumpkin）', () => {
  function pumpkinStage(): { st: TileStore; evo: Priv } {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 41, S(2));                        // 采样草
    st.setTileSilent(39, 41, S(2));                        // 底承另一列
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    return { st, evo };
  }
  it('halloween 开窗 → 2/109 档 1/75 落 2×2 南瓜株 254（style 落 frameY 轴）', () => {
    const { st, evo } = pumpkinStage();
    (evo as unknown as { host: EvolutionHost }).host.halloween = true;
    scriptRng(evo, [0.9, 0.0001, 0.0, 0.9]);               // plantDye 落空;1/75 过;Next(6)=0;顶植物 1/12 落空
    evo.overgroundTile(40, 41, 3);
    expect(st.type[st.idx(40, 40)]).toBe(S(254));
    expect(st.type[st.idx(39, 39)]).toBe(S(254));          // 2×2 整件
    expect(st.frameY[st.idx(40, 40)]).toBe(18);            // fy=num(0)+18 下行
    expect(st.frameX[st.idx(40, 40)]).toBe(18);            // 右列
  });

  it('关窗（缺省）→ 1/75 不消费（原版短路=流位对齐）且不落南瓜', () => {
    const { st, evo } = pumpkinStage();
    const cnt = scriptRng(evo, [0.9]);                     // 仅顶植物 1/12 掷（落空）
    evo.overgroundTile(40, 41, 3);
    expect(cnt.calls()).toBe(1);                           // 若误消费 1/75 会是 2
    expect(st.type[st.idx(40, 40)]).toBe(0);
  });
});

describe('⑦ 绿洲植物 530 维护（cs:72873-72882）+ 海燕麦 529 生长（cs:72800-72805）', () => {
  it('530 窗内无水 → OasisPlantWaterCheck 失败 → KillTile', () => {
    const st = new TileStore(200, 80);
    st.setTileSilent(100, 40, S(530));
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.overgroundTile(100, 40, 3);
    expect(st.flags[st.idx(100, 40)]).toBe(0);
  });

  it('529 beach 带（无水态）1/20 → frameX += 90', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(529), 0, 0);                // x=40 < beachDistance=380 → beach 带
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    scriptRng(evo, [0.9, 0.01]);                           // plantDye 1/3000 落空;1/20 过
    evo.overgroundTile(40, 40, 3);
    expect(st.frameX[st.idx(40, 40)]).toBe(90);
  });
});

describe('⑦ 墓碑 85 → Abigail 花 624（cs:72631-72634/:73639-73661）', () => {
  it('Main.rand 1/30 门 → ±10 掷点落 624（草基行谱）', () => {
    const st = new TileStore(300, 300);
    st.setTileSilent(150, 150, S(85));                     // 采样墓碑
    for (let x = 135; x <= 165; x++) {
      for (let y = 141; y <= 161; y += 2) st.setTileSilent(x, y, S(2));  // 奇行草基
    }
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    // 掷点 (140,150)：x=140+floor(0.02*20),y=140+floor(0.5*20) → 空格+草基
    scriptRng(evo, [0.0001, 0.02, 0.5, 0.9]);
    evo.overgroundTile(150, 150, 3);
    expect(st.type[st.idx(140, 150)]).toBe(S(624));        // 帧写入（0/0）
    expect(st.frameX[st.idx(140, 150)]).toBe(0);
  });
});

describe('⑧ 生命果 236 走 PlaceJunglePlant（cs:75061-75077）', () => {
  function jungleStage(): { st: TileStore; evo: Priv } {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(60));                       // 底承右列（minJ+1=40 行）
    st.setTileSilent(39, 40, S(60));                       // 底承左列
    const evo = priv(makeEvo(st, {
      worldSurface: 50, flags: { hardMode: true, downed_125: true },   // mechAny
    }), true);                                             // 直调面手开 hardMode 私有域
    return { st, evo };
  }
  it('mechAny + 1/25×1/40 门（脚本化）→ 236 落位且 styleX=Next(3) 掷（fx=36×sx）', () => {
    const { st, evo } = jungleStage();
    const cnt = scriptRng(evo, [0.9, 0.0001, 0.0001, 0.7]); // 1/10 落空;1/25 过;1/40 过;Next(3)=2
    evo.grassGrowth(40, 40, 39, 42, 39, 42, true);
    expect(cnt.calls()).toBe(4);                           // ★Next(3) 掷位在场（旧码 3 掷）
    expect(st.type[st.idx(40, 39)]).toBe(S(236));
    expect(st.frameX[st.idx(40, 39)]).toBe(72 + 18);       // 36×styleX(2)+18（X2 右列）
    expect(st.frameX[st.idx(39, 39)]).toBe(72);            // 36×styleX(2)（X2-1 左列）
    expect(st.frameY[st.idx(40, 39)]).toBe(18);            // 2×2 下行
  });

  it('无 mech 旗 → 233 兜底链（Next(8) style0 落 3×2 株）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(60));
    st.setTileSilent(39, 40, S(60));
    st.setTileSilent(41, 40, S(60));                       // 3×2 档底承第三列
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    scriptRng(evo, [0.9, 0.0001, 0.0]);                    // 1/10 落空;1/25 过;Next(8)=0
    evo.grassGrowth(40, 40, 39, 42, 39, 42, true);
    expect(st.type[st.idx(40, 39)]).toBe(S(233));          // 3×2 整件（fx=54×0）
    expect(st.type[st.idx(41, 39)]).toBe(S(233));
    expect(st.frameY[st.idx(40, 39)]).toBe(18);
  });

  it('PlaceJunglePlant 允许族覆写面：61 矮草被 KillTile 后落 236', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(60));
    st.setTileSilent(39, 40, S(60));
    st.setTileSilent(40, 39, S(61));                       // 允许族（覆写面）
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    const ok = evo.placeJunglePlant(40, 39, 236, 1, 0);
    expect(ok).toBe(true);
    expect(st.type[st.idx(40, 39)]).toBe(S(236));
    expect(st.frameX[st.idx(40, 39)]).toBe(36 + 18);       // 36*styleX(1)+18
  });

  it('阻断族（石块）即拒：整件不落', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(60));
    st.setTileSilent(39, 40, S(60));
    st.setTileSilent(39, 38, S(1));                        // 石块=非允许族
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    expect(evo.placeJunglePlant(40, 39, 236, 0, 0)).toBe(false);
    expect(st.flags[st.idx(39, 38)]).toBe(1);
    expect(st.type[st.idx(40, 39)]).not.toBe(S(236));
  });
});

describe('⑨a GrowCactus 密度 Next(11,20)（drunkWorld,cs:57181-57187）', () => {
  /** 单株仙人掌 + 窗内补株（避开 40 列与 (39|41,>=39) 防顶扫偏航） */
  function cactusStage(cnt: number): TileStore {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(80));
    const cells: Array<[number, number]> = [];
    for (let x = 38; x <= 42; x++) for (let y = 29; y <= 40; y++) {
      if (x === 40 || ((x === 39 || x === 41) && y >= 39)) continue;
      cells.push([x, y]);
    }
    for (let k = 0; k < cnt - 1 && k < cells.length; k++) st.setTileSilent(cells[k][0], cells[k][1], S(80));
    return st;
  }
  it('非 drunk：cnt=15 恒拒（cap=11+Next(2)∈{11,12}）', () => {
    const st = cactusStage(15);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    for (let n = 0; n < 300; n++) evo.growCactus(40, 40);
    expect(st.flags[st.idx(40, 39)]).toBe(0);
  });
  it('drunk：cnt=15 可长（cap=11+Next(9)∈[11,19],cap>15 放行）', () => {
    let grew = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const st = cactusStage(15);
      const evo = priv(makeEvo(st, { worldSurface: 50, drunkWorld: true, seed }));
      for (let n = 0; n < 60; n++) evo.growCactus(40, 40);
      if (st.flags[st.idx(40, 39)] === 1) grew++;
    }
    expect(grew).toBeGreaterThan(0);                       // 值域扩到 19 → 部分种子放行
  });
});

describe('⑨b GrowCactus 水量门地表豁免（remix,cs:57075）', () => {
  function floodedCactus(): TileStore {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(80));
    for (let x = 10; x <= 29; x++) for (let y = 20; y <= 30; y++) st.setLiquid(x, y, 255, L_WATER);
    return st;
  }
  it('非 remix：水量门恒拒', () => {
    const st = floodedCactus();
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    for (let n = 0; n < 200; n++) evo.growCactus(40, 40);
    expect(st.flags[st.idx(40, 39)]).toBe(0);
  });
  it('remix + j>worldSurface：豁免放行', () => {
    const st = floodedCactus();
    const evo = priv(makeEvo(st, { worldSurface: 10, remixWorld: true }));
    let grew = false;
    for (let n = 0; n < 400 && !grew; n++) { evo.growCactus(40, 40); grew = st.flags[st.idx(40, 39)] === 1; }
    expect(grew).toBe(true);
  });
  it('remix 但 j<=worldSurface：门仍生效', () => {
    const st = floodedCactus();
    const evo = priv(makeEvo(st, { worldSurface: 50, remixWorld: true }));
    for (let n = 0; n < 200; n++) evo.growCactus(40, 40);
    expect(st.flags[st.idx(40, 39)]).toBe(0);
  });
});

describe('⑨c CheckAlch case5 火冠花岩浆 83⇄84 翻面（cs:46451-46468）', () => {
  function fireblossom(sheet: number, liquid: number): { st: TileStore; evo: Priv } {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 41, S(57));                       // 灰烬块（style5 地基）
    st.setTileSilent(40, 40, S(sheet), 5 * 18, 0);         // style5 药草
    if (liquid > 0) st.setLiquid(40, 40, liquid, L_LAVA);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    return { st, evo };
  }
  it('成熟 83 浸岩浆 liquid>16 → 翻 84（帧原样,非杀支）', () => {
    const { st, evo } = fireblossom(83, 100);
    evo.alchCheckAt(40, 40);
    expect(st.type[st.idx(40, 40)]).toBe(S(84));
    expect(st.flags[st.idx(40, 40)]).toBe(1);              // 存活
    expect(st.frameX[st.idx(40, 40)]).toBe(90);            // 帧原样
  });
  it('开花 84 浸岩浆 liquid<=16 → 翻回 83', () => {
    const { st, evo } = fireblossom(84, 10);
    evo.alchCheckAt(40, 40);
    expect(st.type[st.idx(40, 40)]).toBe(S(83));
    expect(st.flags[st.idx(40, 40)]).toBe(1);
  });
  it('芽 82 豁免（cs:46453 type==82 break）', () => {
    const { st, evo } = fireblossom(82, 100);
    evo.alchCheckAt(40, 40);
    expect(st.type[st.idx(40, 40)]).toBe(S(82));
  });
});

describe('⑩ CheckLilyPad 杀支含微光（cs:59699-59706 liquidType()!=0）', () => {
  it('微光塘睡莲 → 拆除（旧码只杀岩浆/蜂蜜）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(518));
    st.setLiquid(40, 40, 255, L_SHIMMER);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.checkLilyPad(40, 40);
    expect(st.flags[st.idx(40, 40)]).toBe(0);
  });
  it('水塘睡莲 → 存活（water 不杀,回归）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 20, S(518));                      // 塘底探测界 num<h-50 → 用 y<30 行
    st.setTileSilent(40, 21, S(2));                        // 塘底草
    st.setLiquid(40, 20, 255, L_WATER);
    const evo = priv(makeEvo(st, { worldSurface: 50 }));
    evo.checkLilyPad(40, 20);
    expect(st.flags[st.idx(40, 20)]).toBe(1);
  });
});
