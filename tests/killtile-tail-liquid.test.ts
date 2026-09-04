// KillTile 尾段液体灌填三支回归（★终审B 2026-09-04，WorldGen.cs:64404-64429）。
// 原版尾段序：deactivate(:64398-64403)→液体灌填(:64404-64421)→419/TruncatesWalls
// (:64422-64429)→type=0(:64430)。本仓移植面（Game.ts breakTile 通用 1×1 尾段）：
//   ②a 狱石 58 && j>UnderworldLayer(maxTilesY-200) → lava+128【无掷】
//   ②b 脆蜂蜜块 230 && FTW && Next(2)==0 → lava+128
//   ③  147/224/Ices{161,200,163,164}（162 薄冰不在表）&& FTW && remix && !drunk
//      && Next(2)==0 → water+64
//   ①  TruncatesWalls{54,328,459,748} → SquareWallFrame = 架构等效 no-op（墙帧绘制期
//      虚拟化，VanillaWallTiler.hasNeighbor 已含截断邻判）——本文件用 frameAt 前后差
//      锁定「破块即重推邻墙帧」，并断言该四成员破坏不写液体。
// 掷签钉死（vi.spyOn(Math,'random')）区分「无条件支」与「1/2 掷支」。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { KILLTAIL_ICE_LIQUID_SHEETS } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { LIQUID_TYPE, TileStore } from '../src/world/TileStore';
import { VanillaWallTiler } from '../src/render/VanillaWallTiler';

// 40×260：UnderworldLayer = h-200 = 60 → y=100 在地狱带、y=30 在其上（严格 > 门两向）
function mkWorld(seedFlags: Record<string, boolean> = {}): World {
  const w = new World(40, 260, 11, 'killtail');
  w.seedFlags = seedFlags;
  return w;
}

/** breakTile 可驱动面最小桩（shell 形制同 tests/ghost-place-swap.test.ts，
 *  另补 playWavFile——replica 音档分档消费面） */
function shell(w: World, drops: Array<[string, number]>): Game & Record<string, unknown> {
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown> & {
    breakTile(x: number, y: number): void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: () => {}, playWavFile: () => {}, playFiles: () => true } as never;
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] } as never;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); return null; };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} } as never;
  g.player = { cx: 10 * 16 + 8, cy: 19 * 16 + 8, equipStats: {} } as never;
  return g;
}

const HEL = TILE_BY_KEY['ore_hellstone'];          // 58
const CRISPY = TILE_BY_KEY['v_230_crispy_honey_block']; // 230
const ICE_KEYS: Array<[string, number]> = [        // ③ 正集：147/224 + Sets.Ices 四件
  ['snow', 147],
  ['v_224_slush_block', 224],
  ['ice', 161],
  ['v_200_red_ice_block', 200],
  ['v_163_purple_ice_block', 163],
  ['v_164_pink_ice_block', 164],
];
const THIN_ICE = TILE_BY_KEY['thin_ice'];          // 162 BreakableIce——Ices 表【外】
const FTW_REMIX = { getGoodWorld: true, remix: true };

afterEach(() => { vi.restoreAllMocks(); });

describe('KillTile 尾段液体灌填（WorldGen.cs:64404-64421）', () => {
  it('②a:地狱带挖狱石 → 原格满格岩浆（128/LAVA，无掷——rand=0.99 也灌）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 100, HEL);                  // y=100 > 60=UnderworldLayer
    const g = shell(w, []);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);  // 无条件支：掷值不影响
    g.breakTile(10, 100);
    expect(st.type[st.idx(10, 100)]).toBe(0);        // 格已清
    expect(st.liquid[st.idx(10, 100)]).toBe(128);    // 满格
    expect(st.liquidType[st.idx(10, 100)]).toBe(LIQUID_TYPE.LAVA);
  });

  it('②a:UnderworldLayer 之上挖狱石 → 不灌（严格 > 门,无 FTW 门）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(10, 30, HEL);                   // y=30 ≤ 60
    st.setTileSilent(12, 30, HEL);                   // FTW 世界同验（58 支不带 getGood 门）
    w.seedFlags = { getGoodWorld: true };
    const g = shell(w, []);
    g.breakTile(10, 30);
    g.breakTile(12, 30);
    expect(st.liquid[st.idx(10, 30)]).toBe(0);
    expect(st.liquid[st.idx(12, 30)]).toBe(0);
  });

  it('②b:脆蜂蜜块非 FTW 不灌;FTW 下 1/2 掷（rand=0 灌满岩浆 / rand=0.99 不灌）', () => {
    // 非 FTW：掷值无关，恒不灌
    const w0 = mkWorld();
    w0.store.setTileSilent(14, 100, CRISPY);
    shell(w0, []).breakTile(14, 100);
    expect(w0.store.liquid[w0.store.idx(14, 100)]).toBe(0);

    // FTW + rand=0（Next(2)==0 臂）→ 灌满岩浆
    const w1 = mkWorld({ getGoodWorld: true });
    w1.store.setTileSilent(14, 100, CRISPY);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    shell(w1, []).breakTile(14, 100);
    expect(w1.store.liquid[w1.store.idx(14, 100)]).toBe(128);
    expect(w1.store.liquidType[w1.store.idx(14, 100)]).toBe(LIQUID_TYPE.LAVA);

    // FTW + rand=0.99（Next(2)==1 臂）→ 不灌
    const w2 = mkWorld({ getGoodWorld: true });
    w2.store.setTileSilent(14, 100, CRISPY);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    shell(w2, []).breakTile(14, 100);
    expect(w2.store.liquid[w2.store.idx(14, 100)]).toBe(0);
  });

  it('③:147/224/Ices 四件 ×FTW×remix×非drunk×掷中 → 半格水（64/WATER）', () => {
    for (const [key, sheet] of ICE_KEYS) {
      const w = mkWorld(FTW_REMIX);
      const st = w.store;
      expect(KILLTAIL_ICE_LIQUID_SHEETS.has(sheet)).toBe(true);
      st.setTileSilent(16, 100, TILE_BY_KEY[key]);
      vi.spyOn(Math, 'random').mockReturnValue(0);
      shell(w, []).breakTile(16, 100);
      expect(st.liquid[st.idx(16, 100)], `sheet ${sheet}`).toBe(64);
      expect(st.liquidType[st.idx(16, 100)], `sheet ${sheet}`).toBe(LIQUID_TYPE.WATER);
      vi.restoreAllMocks();
    }
  });

  it('③:门逐位——drunk/无remix/无FTW 各缺席即不灌;掷未中不灌', () => {
    const cases: Array<[Record<string, boolean>, number]> = [
      [{ getGoodWorld: true, remix: true, drunkWorld: true }, 0],   // drunk 在 → 否
      [{ getGoodWorld: true }, 0],                                   // 缺 remix → 否
      [{ remix: true }, 0],                                          // 缺 FTW → 否
      [FTW_REMIX, 0.99],                                             // 掷未中 → 否
    ];
    for (const [flags, rand] of cases) {
      const w = mkWorld(flags);
      const st = w.store;
      st.setTileSilent(18, 100, TILE_BY_KEY['ice']);
      vi.spyOn(Math, 'random').mockReturnValue(rand);
      shell(w, []).breakTile(18, 100);
      expect(st.liquid[st.idx(18, 100)], JSON.stringify(flags) + ' rand=' + rand).toBe(0);
      vi.restoreAllMocks();
    }
  });

  it('③:162 薄冰不在 Sets.Ices——全门齐+掷中也【不】灌水（TileID.cs:293 表边界）', () => {
    const w = mkWorld(FTW_REMIX);
    const st = w.store;
    expect(KILLTAIL_ICE_LIQUID_SHEETS.has(162)).toBe(false);
    st.setTileSilent(20, 100, THIN_ICE);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    shell(w, []).breakTile(20, 100);
    expect(st.type[st.idx(20, 100)]).toBe(0);        // 照常破坏
    expect(st.liquid[st.idx(20, 100)]).toBe(0);      // 不灌
  });
});

describe('KillTile 尾段 TruncatesWalls→SquareWallFrame（:64426-64429）架构等效', () => {
  /** 与 ChunkCache.ts:220-223 同构的渲染侧截断表（54/328/459/748 → 内部 id） */
  const TRUNCATES = ['glass', 'v_328_confetti_block', 'v_459_snowfall_block', 'v_748_aquarium_block']
    .map((k) => TILE_BY_KEY[k] ?? -1).filter((id) => id >= 0);

  it('①:破玻璃邻墙帧即时重推（虚拟化 no-op 等价性）+四成员破坏均不写液体', () => {
    const tiler = new VanillaWallTiler(null);
    // 截断邻判四件逐个：破块前后 frameAt 必变（mask 失去截断邻）且格内零液体
    for (const key of ['glass', 'v_328_confetti_block', 'v_459_snowfall_block', 'v_748_aquarium_block']) {
      const w = mkWorld();
      const st = w.store;
      st.setWall(15, 30, 1);                           // 邻墙格
      st.setTileSilent(16, 30, TILE_BY_KEY[key]);      // 截断块（E 邻）
      const before = tiler.frameAt(st, 15, 30, 1, TRUNCATES);
      expect(st.hasTile(16, 30)).toBe(true);
      shell(w, []).breakTile(16, 30);
      expect(st.type[st.idx(16, 30)]).toBe(0);         // 已破
      expect(st.liquid[st.idx(16, 30)]).toBe(0);       // 四成员均不在液体三支
      const after = tiler.frameAt(st, 15, 30, 1, TRUNCATES);
      expect(`${after.col},${after.row}`).not.toBe(`${before.col},${before.row}`);
      vi.restoreAllMocks();
    }
  });
});
