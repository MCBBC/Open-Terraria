// ★BJ341 件2（红，2026-09-25）：BJ315-F1 setTileSilent 同族 3 处漏网清偿判别面——
// 演化域多格件「整件裸写 + 末态单发 DECOR 复查」契约。
//
// 病灶定谳（亲读 1457 原版放置链,PlaceTile/裸写语义分立）：
//   ① placeTight 两格大钟乳石（cs:38696-38738）：原版 PlaceUncheckedStalactite=裸
//      数组直写 + PlaceTight 尾显式 CheckStalactite(x,y)（:38705-38708）。本仓曾走
//      setTile → 首格（fy0）写完即触 DECOR 3×3 扫（Game.checkDecorSquareFrame 监听）
//      → 'stalactite' 完整性裁决（底格未写=bad）→ killDecorTile 吃掉首格；次格写入
//      再扫再杀 → 2 格大型钟乳石【永不生成】。
//   ② 蜂巢 444（cs:74093-74160）：原版=裸数组直写（无 SquareTileFrame 尾检!）。
//      本仓 placeBlock 逐格 setTile → 'super' 裁决（余格未写=bad）→ killDecorTile
//      → breakBeeHive 伪触发（蜂未成巢先出）。
//   ③ 蚁狮幼虫 485（cs:73608-73693 段,PlaceTile→PlaceObject 尾 SquareTileFrame
//      :51886-51888）/ 751（PlaceTile default 支 Place2x2 裸写 :60686→:51780,无尾检;
//      751 不在 TileFrameImportant 派发表 cs:86969-86975 break 组）——同族伪触发+残件。
//
// 判别面（本文件,真实 DECOR 链端到端）：Game 壳挂真 checkDecorSquareFrame→
// checkDecorSupport→killDecorTile（breakTile 桩记录）,store 监听按生产接线同形；
//   - 修复后：整件存活 + breaks 空 + 末态复查恰一次（锚点断言）；
//   - 变异（placeBlock/placeTight 回退 setTile）：首格半写态被真裁决吃掉=红。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

type ShellG = {
  world: { store: TileStore };
  breakTile(x: number, y: number, a?: boolean, b?: boolean): void;
  checkDecorSquareFrame(x: number, y: number): void;
};

/** Game 壳：真 checkDecorSquareFrame/checkDecorSupport/killDecorTile 链 +
 *  breakTile 桩（bj113 shell 形制;killDecorTile 用 ??= 自配队列字段=壳安全）。 */
function mkShell(st: TileStore): { g: ShellG; breaks: Array<[number, number]> } {
  const g = Object.create(Game.prototype) as unknown as ShellG & Record<string, unknown>;
  g.world = { store: st };
  const breaks: Array<[number, number]> = [];
  g.breakTile = (x: number, y: number) => { breaks.push([x, y]); st.setTile(x, y, 0); };
  return { g, breaks };
}

function mkEvo(st: TileStore, over: Partial<EvolutionHost> = {}): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed: 20260925,
    worldSurface: 40, rockLevel: 200,
    dungeonX: 60, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: () => {},
    ...over,
  };
  return new WorldEvolution(host);
}

/** 生产接线同形：store 监听 → 真 DECOR 扫（setTile 半写态必被真裁决吃掉）。 */
function wireSweep(st: TileStore, g: ShellG): void {
  st.onTileChanged((x, y) => (g as unknown as { checkDecorSquareFrame(x: number, y: number): void }).checkDecorSquareFrame(x, y));
}

/** spreadRng.next 脚本化（pumpkin-growth-bj315 同款）：逐掷返回 script 值,末尾兜底 0.9 */
function scriptRng(evo: WorldEvolution, script: number[]): void {
  const rngAny = evo as unknown as { spreadRng: { next(): number } };
  let k = 0;
  rngAny.spreadRng.next = () => (k < script.length ? script[k++] : 0.9);
}

describe('BJ341 件2① placeTight 两格大钟乳石（cs:38696-38738）', () => {
  it('整件存活（fy0/fy18 同 frameX）+ 零 DECOR 误杀 + 末态单发复查锚 (x,y)', () => {
    const st = new TileStore(40, 80);
    const { g, breaks } = mkShell(st);
    st.setTileSilent(20, 19, S(147), 0, 0);          // 雪块顶锚（solidTile 门;base=0）
    const rechecks: Array<[number, number]> = [];
    const evo = mkEvo(st, {
      tileFrame: (x, y) => { rechecks.push([x, y]); g.checkDecorSquareFrame(x, y); },
    });
    wireSweep(st, g);
    scriptRng(evo, [0.6, 0.0]);                      // preferSmall=false（≥0.5）、variation=0
    (evo as unknown as { placeTight(x: number, y: number): void }).placeTight(20, 20);
    // 两格齐活：fy0（上）/fy18（下）,同 frameX=base+variation*18=0
    expect(st.type[st.idx(20, 20)]).toBe(S(165));
    expect(st.frameY[st.idx(20, 20)]).toBe(0);
    expect(st.type[st.idx(20, 21)]).toBe(S(165));
    expect(st.frameX[st.idx(20, 21)]).toBe(0);
    expect(st.frameY[st.idx(20, 21)]).toBe(18);
    // ★判别面：setTile 变异 → 首格写完即被真裁决 killDecorTile 吃掉（breaks 非空）
    expect(breaks).toEqual([]);
    // ★末态复查=原版 PlaceTight 尾 CheckStalactite(x,y)（:38705-38708）恰一次
    expect(rechecks).toEqual([[20, 20]]);
  });
});

describe('BJ341 件2② 蜂巢 444（cs:74093-74160 裸写链,无尾检=原版分立）', () => {
  it('整件存活 + 零 breakBeeHive 伪触发 + 不发末态复查（裸写链锚）', () => {
    const st = new TileStore(40, 80);
    const { g, breaks } = mkShell(st);
    st.setTileSilent(20, 39, S(60), 0, 0);           // 锚行 60 实心两列
    st.setTileSilent(21, 39, S(60), 0, 0);
    st.setTileSilent(20, 40, S(83), 0, 0);           // tileCut 药草占位（覆写面）
    const rechecks: Array<[number, number]> = [];
    const evo = mkEvo(st, { tileFrame: (x, y) => { rechecks.push([x, y]); g.checkDecorSquareFrame(x, y); } });
    wireSweep(st, g);
    const ok = (evo as unknown as { placeJungleBlock2x2(i: number, j: number, s: number, f: number): boolean })
      .placeJungleBlock2x2(20, 40, 444, 40);
    expect(ok).toBe(true);
    expect(st.get(20, 40)).toBe(S(444));
    expect(st.get(21, 41)).toBe(S(444));
    expect(st.frameX[st.idx(21, 41)]).toBe(18);
    expect(st.frameY[st.idx(21, 41)]).toBe(18);
    // ★判别面：placeBlock setTile 变异 → 首格 'super' 裁决 killDecorTile=伪触发
    expect(breaks).toEqual([]);
    // ★原版蜂巢=裸数组直写（cs:74140-74159）无 SquareTileFrame 尾检 → 不发复查
    expect(rechecks).toEqual([]);
  });
});

describe('BJ341 件2③ 蚁狮幼虫 485/751（PlaceTile→PlaceObject 尾 SquareTileFrame / Place2x2 裸写）', () => {
  it('485：整件存活 + 零 breakAntlionLarva 伪触发 + 末态单发复查锚 (i,j-1)', () => {
    const st = new TileStore(40, 80);
    const { g, breaks } = mkShell(st);
    st.setTileSilent(20, 40, S(396), 0, 0);          // 锚行沙岩两列（solidTile 门）
    st.setTileSilent(21, 40, S(396), 0, 0);
    const rechecks: Array<[number, number]> = [];
    const evo = mkEvo(st, { tileFrame: (x, y) => { rechecks.push([x, y]); g.checkDecorSquareFrame(x, y); } });
    wireSweep(st, g);
    // 掷位（undergroundTile cs:73853+ 链）：plantDye 1/2500 落空(0.9) → 1/80 门(0.001)
    //  → 751 掷(0.5≥1/100=走 485) → style(0.0)
    scriptRng(evo, [0.9, 0.001, 0.5, 0.0]);
    (evo as unknown as { undergroundTile(i: number, j: number, wallDist: number): void }).undergroundTile(20, 40, 3);
    // 2×2 幼虫堆（i..i+1, j-2..j-1）= (20..21, 38..39),style0 帧 (dx*18, dy*18)
    expect(st.type[st.idx(20, 38)]).toBe(S(485));
    expect(st.type[st.idx(21, 39)]).toBe(S(485));
    expect(st.frameX[st.idx(21, 38)]).toBe(18);
    expect(st.frameY[st.idx(20, 39)]).toBe(18);
    // ★判别面：placeBlock setTile 变异 → 首格 'super' 裁决 killDecorTile=伪触发+残件
    expect(breaks).toEqual([]);
    // ★末态复查=PlaceObject 尾 SquareTileFrame(i,j-1)（cs:60215/:51886-51888）恰一次
    expect(rechecks).toEqual([[20, 39]]);
  });

  it('751 稀有堆：整件存活（751 不在 TileFrame 派发表 cs:86969-86975=原版不裁决）', () => {
    const st = new TileStore(40, 80);
    const { g, breaks } = mkShell(st);
    st.setTileSilent(20, 40, S(396), 0, 0);
    st.setTileSilent(21, 40, S(396), 0, 0);
    const rechecks: Array<[number, number]> = [];
    const evo = mkEvo(st, { tileFrame: (x, y) => { rechecks.push([x, y]); g.checkDecorSquareFrame(x, y); } });
    wireSweep(st, g);
    // 掷位：plantDye 1/2500 落空(0.9) → 1/80 门(0.001) → 751 掷(0.001<1/100=走 751)
    scriptRng(evo, [0.9, 0.001, 0.001]);
    (evo as unknown as { undergroundTile(i: number, j: number, wallDist: number): void }).undergroundTile(20, 40, 3);
    expect(st.type[st.idx(20, 38)]).toBe(S(751));
    expect(st.type[st.idx(21, 39)]).toBe(S(751));
    expect(st.frameX[st.idx(21, 38)]).toBe(18);
    expect(st.frameY[st.idx(20, 39)]).toBe(18);
    expect(breaks).toEqual([]);
    // 复查面照发（锚点邻件复验）,但对 751 整件=原版同相 no-op（不派发）
    expect(rechecks).toEqual([[20, 39]]);
  });
});
