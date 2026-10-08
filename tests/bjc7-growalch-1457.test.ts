// ★BJ-C7（2026-10-08 R9-F1 判别测试,随刀重产）：GrowAlch 状态机 1457 重写回归。
// 权威锚：Terarria1457 WorldGen.cs:46176-46293 GrowAlch（1456 逐字全等,非版本差异）。
// 四处偏离的独立判别面（旧实现锁的是错行为,本文件全部按 vanilla 逐支重锁）：
//   ① 82 块全支终值=83,无 82→84 直跳（旧码 bloom&&1/50 → 84）；雪草支1 内 1/2 门
//     （cs:46200-46210,旧码无门）；
//   ② 83 块无 bloom→84 路径——成熟日耀(0)/月光(18)/水叶(72) 永驻 83（旧码有）；
//   ③ bloom 条件按 frameX 锚定+门（0 昼/18 夜/72 雨/36 闪根·地下 y>worldSurface/
//     90 火冠花·地狱 y>maxTilesY-200）——且是 82 芽【加熟窗】（else-if 链,终值 83）,
//     旧码按 style 无门直跳 84；
//   ④ 闪根 84→83 回落率 2/3（cs:46267 Next(3)!=0 在回落臂之前,旧码 1/2）。
// 掷序判别：scriptRng 脚本化 spreadRng.next,逐支掷数+状态双断言（位置敏感）。
import { describe, it, expect } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;
const L_WATER = 1, L_LAVA = 2;

// H=300：st.h-200=100 = 地狱门（UnderworldLayer,Main.cs:2886）；worldSurface=50。
const W = 120, H = 300, WS = 50;

function mkWorld(): TileStore {
  return new TileStore(W, H);
}
function makeEvo(st: TileStore, over: Partial<EvolutionHost> = {}): WorldEvolution {
  const host: EvolutionHost = {
    store: st, seed: 20261008,
    worldSurface: WS, rockLevel: 500, dungeonX: 600, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    ...over,
  };
  return new WorldEvolution(host);
}
type Priv = { growAlch(x: number, y: number): void };
const priv = (evo: WorldEvolution): Priv => evo as unknown as Priv;

/** spreadRng.next 脚本化：逐掷返回 script 值,末尾兜底 0.9（落空多数概率门） */
function scriptRng(evo: unknown, script: number[]): { calls: () => number } {
  const rngAny = evo as unknown as { spreadRng: { next(): number } };
  let k = 0;
  rngAny.spreadRng.next = () => (k < script.length ? script[k++] : 0.9);
  return { calls: () => k };
}

const tid = (st: TileStore, x: number, y: number) => st.type[st.idx(x, y)];
const fxA = (st: TileStore, x: number, y: number) => st.frameX[st.idx(x, y)];

describe('BJ-C7 ① 82 芽块全支终值=83（WorldGen.cs:46195-46266）', () => {
  it('昼花芽（fx=0,白昼）支1 命中 → 83 而非 84（旧码 bloom 直跳 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(82), 0, 0);              // style0 昼花芽
    const evo = makeEvo(st, { isDay: true });
    const sc = scriptRng(evo, [0]);                     // 0 < 1/50 支1 命中
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));                // ★终值 83（旧码=84）
    expect(fxA(st, 40, 30)).toBe(0);                    // 帧原样（仅 type 翻面）
    expect(sc.calls()).toBe(1);                         // fx!==108 无第二掷
  });

  it('雪草芽（fx=108）支1 命中+第二掷落空 → 原地驻 82（vanilla 1/2 门;旧码 y>ws bloom 直跳 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 60, S(82), 108, 0);            // style6 雪草芽,地下（y>ws）
    const evo = makeEvo(st);
    const sc = scriptRng(evo, [0, 0.9]);                // 支1 命中,Next(2) 落空
    priv(evo).growAlch(40, 60);
    expect(tid(st, 40, 60)).toBe(S(82));                // ★门挡住,不写（旧码=84）
    expect(sc.calls()).toBe(2);
  });

  it('雪草芽支1 命中+第二掷命中 → 83（1/2 门放行）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 60, S(82), 108, 0);
    const evo = makeEvo(st);
    scriptRng(evo, [0, 0]);                             // Next(2)==0
    priv(evo).growAlch(40, 60);
    expect(tid(st, 40, 60)).toBe(S(83));
  });
});

describe('BJ-C7 ③ 82 加熟窗按 frameX 锚定+门（cs:46221-46265,else-if 链终值 83）', () => {
  it('昼花窗（fx=0,白昼）：支1 落空后窗掷命中 → 83（2 掷）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(82), 0, 0);
    const evo = makeEvo(st, { isDay: true });
    const sc = scriptRng(evo, [0.9, 0]);
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));
    expect(sc.calls()).toBe(2);
  });

  it('昼花窗夜闭（fx=0,夜）：仅支1 一掷,驻 82（旧码夜掷 else-if 曾误开窗）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(82), 0, 0);
    const evo = makeEvo(st, { isDay: false });
    const sc = scriptRng(evo, [0.9, 0]);                // 第二掷不应被消费
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(82));                // 驻芽
    expect(sc.calls()).toBe(1);                         // ★窗闭不掷（旧码消费 2 掷且转 83）
  });

  it('夜花窗（fx=18,夜）开 → 83；白昼闭', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(82), 18, 0);
    const evo = makeEvo(st, { isDay: false });
    scriptRng(evo, [0.9, 0]);
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));
    st.setTileSilent(44, 30, S(82), 18, 0);
    const evo2 = makeEvo(st, { isDay: true });
    const sc = scriptRng(evo2, [0.9, 0]);
    priv(evo2).growAlch(44, 30);
    expect(tid(st, 44, 30)).toBe(S(82));                // 昼闭
    expect(sc.calls()).toBe(1);
  });

  it('水叶窗（fx=72,雨天）开 → 83；非雨闭', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(82), 72, 0);
    const evo = makeEvo(st, { raining: true });
    scriptRng(evo, [0.9, 0]);
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));
    st.setTileSilent(44, 30, S(82), 72, 0);
    const evo2 = makeEvo(st, { raining: false });
    const sc = scriptRng(evo2, [0.9, 0]);
    priv(evo2).growAlch(44, 30);
    expect(tid(st, 44, 30)).toBe(S(82));                // 非雨闭
    expect(sc.calls()).toBe(1);
  });

  it('闪根窗（fx=36）门=地下 y>worldSurface：地下开/地上闭（旧码 style2 无门直跳 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 60, S(82), 36, 0);             // 地下（60>50）
    const evo = makeEvo(st);
    scriptRng(evo, [0.9, 0]);
    priv(evo).growAlch(40, 60);
    expect(tid(st, 40, 60)).toBe(S(83));                // 地下窗开 → 83
    st.setTileSilent(44, 30, S(82), 36, 0);             // 地上（30<50）
    const evo2 = makeEvo(st, { isDay: true });
    const sc = scriptRng(evo2, [0.9, 0]);
    priv(evo2).growAlch(44, 30);
    expect(tid(st, 44, 30)).toBe(S(82));                // ★窗闭驻芽（旧码=84）
    expect(sc.calls()).toBe(1);
  });

  it('火冠花窗（fx=90）门=地狱 y>maxTilesY-200：地狱开/浅层闭（旧码 style5 无门直跳 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 250, S(82), 90, 0);            // 地狱（250>300-200）
    const evo = makeEvo(st);
    scriptRng(evo, [0.9, 0]);
    priv(evo).growAlch(40, 250);
    expect(tid(st, 40, 250)).toBe(S(83));               // 地狱窗开 → 83
    st.setTileSilent(44, 60, S(82), 90, 0);             // 洞穴层（非地狱）
    const evo2 = makeEvo(st);
    const sc = scriptRng(evo2, [0.9, 0]);
    priv(evo2).growAlch(44, 60);
    expect(tid(st, 44, 60)).toBe(S(82));                // ★窗闭驻芽（旧码=84）
    expect(sc.calls()).toBe(1);
  });

  it('死亡草芽（fx=54,style3）无任何窗（vanilla 无 54 条件段）→ 仅支1 一掷（旧码 style3 无门直跳 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(82), 54, 0);
    const evo = makeEvo(st, { isDay: true, raining: true });   // 条件全开也无处入窗
    const sc = scriptRng(evo, [0.9, 0]);
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(82));                // 驻芽（旧码首掷命中时=84）
    expect(sc.calls()).toBe(1);
  });

  it('雪草芽不误入其他窗（fx=108 夜/雨/地下均不匹配,仅支1 双掷）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 60, S(82), 108, 0);
    const evo = makeEvo(st, { isDay: false, raining: true });
    const sc = scriptRng(evo, [0.9, 0]);                // 支1 落空后不应再掷
    priv(evo).growAlch(40, 60);
    expect(tid(st, 40, 60)).toBe(S(82));
    expect(sc.calls()).toBe(1);
  });
});

describe('BJ-C7 ② 83 成熟块无 bloom→84 路径（cs:46267-46293）', () => {
  it('成熟昼花（83,fx=0,白昼）：零掷永驻 83（旧码 bloom 1/50 → 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(83), 0, 0);
    const evo = makeEvo(st, { isDay: true });
    const sc = scriptRng(evo, [0]);                     // 不应被消费
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));                // ★永驻（旧码=84）
    expect(sc.calls()).toBe(0);                         // ★fx∉{36,108} 零掷
  });

  it('成熟月光（83,fx=18,夜）零掷永驻（旧码 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(83), 18, 0);
    const evo = makeEvo(st, { isDay: false });
    const sc = scriptRng(evo, [0]);
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));
    expect(sc.calls()).toBe(0);
  });

  it('成熟水叶（83,fx=72,雨天）零掷永驻（旧码 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(83), 72, 0);
    const evo = makeEvo(st, { raining: true });
    const sc = scriptRng(evo, [0]);
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));
    expect(sc.calls()).toBe(0);
  });

  it('成熟雪草（83,fx=108）1/30 开花：掷命中→84/落空驻 83', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(83), 108, 0);
    const evo = makeEvo(st);
    scriptRng(evo, [0]);                                // 0 < 1/30
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(84));                // 来源二：83+108
    st.setTileSilent(44, 30, S(83), 108, 0);
    const evo2 = makeEvo(st);
    const sc = scriptRng(evo2, [0.9]);
    priv(evo2).growAlch(44, 30);
    expect(tid(st, 44, 30)).toBe(S(83));
    expect(sc.calls()).toBe(1);
  });
});

describe('BJ-C7 ④ 闪根（fx=36）摆动面（cs:46267-46288）', () => {
  it('成熟闪根 83 开花：2/3 入支×1/2 → 84（来源一）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(83), 36, 0);
    const evo = makeEvo(st);
    const sc = scriptRng(evo, [0.4, 0]);                // 0.4≥1/3 入支,0<1/2 开花
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(84));
    expect(sc.calls()).toBe(2);
  });

  it('成熟闪根 83：入支但 Next(2) 落空 → 驻 83（2 掷）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(83), 36, 0);
    const evo = makeEvo(st);
    const sc = scriptRng(evo, [0.4, 0.9]);
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));
    expect(sc.calls()).toBe(2);
  });

  it('开花闪根 84 回落：rng∈[1/3,1/2) 即回落（2/3 率;旧码 1/2 率此段驻 84）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(84), 36, 0);
    const evo = makeEvo(st);
    const sc = scriptRng(evo, [0.4]);                   // ★0.4：≥1/3 入支且 84 短路
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(83));                // ★回落（旧码 0.4<1/2 也回落——
    expect(sc.calls()).toBe(1);                         //   换 0.6 段判别,见下）
    st.setTileSilent(44, 30, S(84), 36, 0);
    const evo2 = makeEvo(st);
    const sc2 = scriptRng(evo2, [0.6]);                 // ★0.6∈[1/2,2/3)：新 2/3 率回落,
    priv(evo2).growAlch(44, 30);                        //  旧 1/2 率不入支驻 84
    expect(tid(st, 44, 30)).toBe(S(83));                // ★判别位（旧码=84）
    expect(sc2.calls()).toBe(1);                        // 84 短路不掷 Next(5)
  });

  it('开花闪根 84：Next(3) 落空（<1/3）→ 驻 84（1 掷）', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(84), 36, 0);
    const evo = makeEvo(st);
    const sc = scriptRng(evo, [0.2]);
    priv(evo).growAlch(40, 30);
    expect(tid(st, 40, 30)).toBe(S(84));
    expect(sc.calls()).toBe(1);
  });
});

describe('BJ-C7 淹死规则回归（cs:46182-46194,非本刀改动面,守回归）', () => {
  it('昼花芽泡水（style0 非豁免）→ 杀;火冠花泡岩浆（style5）豁免继续走生长掷', () => {
    const st = mkWorld();
    st.setTileSilent(40, 30, S(82), 0, 0);
    st.liquid[st.idx(40, 30)] = 200; st.liquidType[st.idx(40, 30)] = L_WATER;
    const evo = makeEvo(st);
    scriptRng(evo, [0]);
    priv(evo).growAlch(40, 30);
    expect(st.hasTile(40, 30)).toBe(false);             // 水淹杀
    st.setTileSilent(44, 250, S(83), 90, 0);
    st.liquid[st.idx(44, 250)] = 200; st.liquidType[st.idx(44, 250)] = L_LAVA;
    const evo2 = makeEvo(st);
    const sc = scriptRng(evo2, [0]);                    // 岩浆豁免免杀;83+fx=90 无窗
    priv(evo2).growAlch(44, 250);
    expect(tid(st, 44, 250)).toBe(S(83));               // 火冠花永驻 83（浸泡翻面属
    expect(sc.calls()).toBe(0);                         //   CheckAlch case5,非本域）
  });
});
