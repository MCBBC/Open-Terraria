// 植物锚门 + 孤儿清整回归（2026-08-26 用户实报两案，存档解码定罪）：
// ①(2059,242)=S1 坡面草块上长出 1023 蘑菇（自造装饰 sheet3 分型）
// ②(1014,241)=H 半砖腐化草 / 23 整砖上长 73 森林高草
// 原版标杆：IsFitToPlaceFlowerIn(WorldGen.cs:58714)+PlaceTile 61/71 内联锚支——
// 支撑 slope==0+非半砖+类型严格配对；PlantCheck(:81818) 运行期换型/杀。
// SW 缺陷：演化放置端 place1 无门=粘滞非法生成（写入监听只查上方格,新放植株
// 自身永不被复检）；读档/导入期遗留件无收口。修：fitTopPlant 门+sanitizePlants。
import { describe, it, expect, vi } from 'vitest';
import { RNG } from '../src/core/rng';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

// 与 WorldEvolution.SID 同语义：sheet → 首个内部 id
const SID = (() => {
  const m = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const sh = TILE_DEFS[i]?.vanilla?.sheet;
    if (sh != null && !m.has(sh)) m.set(sh, i);
  }
  return m;
})();
const sid = (sh: number) => SID.get(sh) ?? -1;

const GRASS = TILE_BY_KEY['v_2_grass_block'] ?? TILE_BY_KEY['grass'];
const CORRUPT = TILE_BY_KEY['v_23_corrupt_grass_block'];
const TALL73 = TILE_BY_KEY['v_73_forest_tall_plants'];
const SHORT24 = TILE_BY_KEY['v_24_corruption_short_plants'];
const MUSH = TILE_BY_KEY['mushroom'];          // 自造装饰,sheet3 分型(稳定1023)
const SAND = TILE_BY_KEY['v_53_sand'] ?? TILE_BY_KEY['sand'];
const CACTUS = TILE_BY_KEY['v_80_cactus'] ?? TILE_BY_KEY['cactus'];

function mkWorld(place: (st: TileStore) => void) {
  const w = new World(40, 40, 21, 'plant-fit');
  const st = w.store;
  place(st);
  const host: EvolutionHost = {
    store: st, worldSurface: 20, rockLevel: 30, dungeonX: 0, difficulty: 0,
    flags: w.flags, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
  };
  return { st, evo: new WorldEvolution(host) };
}
const typeAt = (st: TileStore, x: number, y: number) => st.type[st.idx(x, y)];

describe('fitTopPlant（IsFitToPlaceFlowerIn :58714 + PlaceTile 61/71 内联支）', () => {
  it('坡面支撑拒绝（案①根因）：S1 草块上方不得长植物', () => {
    const { st, evo } = mkWorld((s) => { s.setTile(20, 20, GRASS); s.setSlope(20, 20, 1); });
    expect((evo as unknown as { fitTopPlant(x: number, y: number, w: number): boolean }).fitTopPlant(20, 19, 3)).toBe(false);
    void st;
  });
  it('半砖支撑拒绝（案②根因之一）：H 腐化草上方不得长', () => {
    const { evo } = mkWorld((s) => { s.setTile(20, 20, CORRUPT); s.setHalfBrick(20, 20, true); });
    expect((evo as unknown as { fitTopPlant(x: number, y: number, w: number): boolean }).fitTopPlant(20, 19, 24)).toBe(false);
  });
  it('类型配对：腐化草只许 24，森林高草 73 只许普通草族', () => {
    const { evo: e1 } = mkWorld((s) => s.setTile(20, 20, CORRUPT));
    expect((e1 as unknown as { fitTopPlant(x: number, y: number, w: number): boolean }).fitTopPlant(20, 19, 73)).toBe(false);
    expect((e1 as unknown as { fitTopPlant(x: number, y: number, w: number): boolean }).fitTopPlant(20, 19, 24)).toBe(true);
    const { evo: e2 } = mkWorld((s) => s.setTile(20, 20, GRASS));
    expect((e2 as unknown as { fitTopPlant(x: number, y: number, w: number): boolean }).fitTopPlant(20, 19, 3)).toBe(true);
  });
});

describe('创建路径整合（overgroundTile 经 fitTopPlant 门）', () => {
  const rnd0 = () => 0;
  function sampleTop(st: TileStore, evo: WorldEvolution) {
    const rnd = vi.spyOn(RNG.prototype, 'next').mockImplementation(rnd0);
    try { (evo as unknown as { overgroundTile(i: number, j: number, wallDist: number): void }).overgroundTile(20, 20, 1); } finally { rnd.mockRestore(); }
    return typeAt(st, 20, 19);
  }
  it('坡面腐化草不再长新植物（修复前=直接 place1 粘滞非法件）', () => {
    const { st, evo } = mkWorld((s) => { s.setTile(20, 20, CORRUPT); s.setSlope(20, 20, 2); });
    expect(sampleTop(st, evo)).toBe(0);
  });
  it('平整腐化草正常长出腐化短草（门不误伤合法对）', () => {
    const { st, evo } = mkWorld((s) => s.setTile(20, 20, CORRUPT));
    expect(sampleTop(st, evo)).toBe(SHORT24);
  });
});

describe('growCactus 支撑形态双态门（cs:57060-57061，2026-08-26 案③）', () => {
  function mkCactus(slope: number, half: boolean) {
    return mkWorld((s) => {
      for (let x = 12; x <= 28; x++) for (let y = 20; y <= 24; y++) s.setTile(x, y, SAND);   // 沙密度窗先满足
      if (slope) { s.setTile(20, 20, SAND); s.setSlope(20, 20, slope); }
      if (half) { s.setTile(20, 20, SAND); s.setHalfBrick(20, 20, true); }
    });
  }
  const grow = (evo: WorldEvolution, rndVal = 0.01) => {
    const rnd = vi.spyOn(RNG.prototype, 'next').mockReturnValue(rndVal);
    try { (evo as unknown as { growCactus(i: number, j: number): void }).growCactus(20, 20); } finally { rnd.mockRestore(); }
  };
  it('S1 坡沙上不生长（用户案③根因：运行时语境拒绝坡面基格）', () => {
    const { st, evo } = mkCactus(1, false);
    grow(evo);
    expect(typeAt(st, 20, 19)).toBe(0);
  });
  it('半砖沙上不生长（GrowCactus halfBrick 门）', () => {
    const { st, evo } = mkCactus(0, true);
    grow(evo);
    expect(typeAt(st, 20, 19)).toBe(0);
  });
  it('平整沙正常生长（双态门不误伤合法支）', () => {
    const { st, evo } = mkWorld((s) => {
      for (let x = 12; x <= 28; x++) for (let y = 20; y <= 24; y++) s.setTile(x, y, SAND);   // 沙≥10 满足密度窗
    });
    grow(evo);
    expect(typeAt(st, 20, 19)).toBe(CACTUS);
  });
});

describe('全族审查补齐（2026-08-26 全面 review）', () => {
  // 与上方 SID 同语义（模块级构建）
  it('藤蔓向上扫描 bottomSlope 中断（cs:73097 族——下缘削坡草挂不住藤）', () => {
    // 挂靠腐化草：slope3/4=bottomSlope → 不垂藤；slope1/2/0 → 正常垂 636
    const CORRUPT_ID = sid(23), VINE636 = sid(636);
    for (const [sl, want] of [[3, 0], [4, 0], [1, VINE636], [2, VINE636], [0, VINE636]] as const) {
      const { st, evo } = mkWorld((s) => s.setTile(20, 20, CORRUPT));
      if (sl) st.setSlope(20, 20, sl);
      const rnd = vi.spyOn(RNG.prototype, 'next').mockReturnValue(0.01);  // 1/maxV=1/60 必过
      try { (evo as unknown as { vineFamily(i: number, j: number, s2: number): void }).vineFamily(20, 20, 23); } finally { rnd.mockRestore(); }
      expect(typeAt(st, 20, 21)).toBe(want);
    }
  });
  it('hasSupport 同款中断（普通藤 2 号草锚，cs:72563-72579）', () => {
    const GRASS_ID = sid(2);
    const { evo } = mkWorld((s) => { s.setTile(20, 18, GRASS_ID); s.setSlope(20, 18, 4); });
    expect((evo as unknown as { hasSupport(i: number, j: number, g: number): boolean }).hasSupport(20, 19, 2)).toBe(false);
    const { evo: e2 } = mkWorld((s) => s.setTile(20, 18, GRASS_ID));
    expect((e2 as unknown as { hasSupport(i: number, j: number, g: number): boolean }).hasSupport(20, 19, 2)).toBe(true);
  });
  it('蘑菇草地表顶 71 经门：平整长出、坡面不长（overgroundTile 整合）', () => {
    const MUSHGRASS = sid(70), TOP71 = sid(71);
    const flat = mkWorld((s) => s.setTile(20, 20, MUSHGRASS));
    let rnd = vi.spyOn(RNG.prototype, 'next').mockReturnValue(0.01);
    try { (flat.evo as unknown as { overgroundTile(i: number, j: number, w: number): void }).overgroundTile(20, 20, 1); } finally { rnd.mockRestore(); }
    expect(typeAt(flat.st, 20, 19)).toBe(TOP71);
    const slope = mkWorld((s) => { s.setTile(20, 20, MUSHGRASS); s.setSlope(20, 20, 1); });
    rnd = vi.spyOn(RNG.prototype, 'next').mockReturnValue(0.01);
    try { (slope.evo as unknown as { overgroundTile(i: number, j: number, w: number): void }).overgroundTile(20, 20, 1); } finally { rnd.mockRestore(); }
    expect(typeAt(slope.st, 20, 19)).toBe(0);
  });
  it('fitJunglePairFlat：球茎/生命果双列整平底（PlaceJunglePlant :48226 两列 SolidTile&&60）', () => {
    const JG = sid(60);
    const bothFlat = mkWorld((s) => { s.setTile(20, 20, JG); s.setTile(21, 20, JG); });
    expect((bothFlat.evo as unknown as { fitJunglePairFlat(x: number, y: number): boolean }).fitJunglePairFlat(20, 20)).toBe(true);
    const oneAir = mkWorld((s) => s.setTile(20, 20, JG));
    expect((oneAir.evo as unknown as { fitJunglePairFlat(x: number, y: number): boolean }).fitJunglePairFlat(20, 20)).toBe(false);
    const oneSlope = mkWorld((s) => { s.setTile(20, 20, JG); s.setTile(21, 20, JG); s.setSlope(21, 20, 2); });
    expect((oneSlope.evo as unknown as { fitJunglePairFlat(x: number, y: number): boolean }).fitJunglePairFlat(20, 20)).toBe(false);
  });
});

describe('sanitizePlants（进图一次性孤儿清整）', () => {
  it('案① 收口：坡面草块上的蘑菇装饰被清除', () => {
    const { st, evo } = mkWorld((s) => {
      s.setTile(20, 20, GRASS); s.setSlope(20, 20, 1);
      s.setTile(20, 19, MUSH);
    });
    evo.sanitizePlants();
    expect(typeAt(st, 20, 19)).toBe(0);
  });
  it('案② 收口：腐化草上的森林高草 → 腐化短草变型（TryGetNewType 换型不杀）', () => {
    const { st, evo } = mkWorld((s) => {
      s.setTile(20, 20, CORRUPT);
      s.setTile(20, 19, TALL73);
    });
    evo.sanitizePlants();
    expect(typeAt(st, 20, 19)).toBe(SHORT24);
  });
  it('合法植株不受影响：普通草上蘑菇/整砖腐化草上腐化短草保留', () => {
    const legal = mkWorld((s) => {
      s.setTile(10, 20, GRASS); s.setTile(10, 19, MUSH);       // 平整普通草+分型植物 ✓
      s.setTile(20, 20, CORRUPT); s.setTile(20, 19, SHORT24);  // 腐化对 ✓
    });
    legal.evo.sanitizePlants();
    expect(typeAt(legal.st, 10, 19)).toBe(MUSH);
    expect(typeAt(legal.st, 20, 19)).toBe(SHORT24);
  });
});
