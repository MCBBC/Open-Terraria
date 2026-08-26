// 植物锚门 + 孤儿清整回归（2026-08-26 用户实报两案，存档解码定罪）：
// ①(2059,242)=S1 坡面草块上长出 1023 蘑菇（自造装饰 sheet3 分型）
// ②(1014,241)=H 半砖腐化草 / 23 整砖上长 73 森林高草
// 原版标杆：IsFitToPlaceFlowerIn(WorldGen.cs:58714)+PlaceTile 61/71 内联锚支——
// 支撑 slope==0+非半砖+类型严格配对；PlantCheck(:81818) 运行期换型/杀。
// SW 缺陷：演化放置端 place1 无门=粘滞非法生成（写入监听只查上方格,新放植株
// 自身永不被复检）；读档/导入期遗留件无收口。修：fitTopPlant 门+sanitizePlants。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TILE_BY_KEY } from '../src/data/tiles';

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
    const rnd = vi.spyOn(Math, 'random').mockImplementation(rnd0);
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
