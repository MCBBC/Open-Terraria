// 宝石系统世界生成回归（对照 1456 GemCaves/ExposedGems/SpeleothemsAndGemTrees）
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TileStore } from '../src/world/TileStore';
import { runGemCavesPass, runExposedGemsPass, runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';

function makeWorld(w = 800, h = 300): { st: TileStore; gs: GenState } {
  const st = new TileStore(w, h);
  // 地表 60 以上空气；往下实心石头；挖几个大洞穴腔（countTiles 连通 50-300 语义）
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (y < 60) continue;
      st.setTileSilent(x, y, TILE_BY_KEY['stone']!);
    }
  }
  const cave = (cx: number, cy: number, r: number) => {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (dx * dx + dy * dy <= r * r) {
        st.setTileSilent(cx + dx, cy + dy, 0);
        st.setWallSilent(cx + dx, cy + dy, 2);
      }
    }
  };
  cave(300, 150, 7); cave(150, 180, 6); cave(450, 200, 8);
  const gs = {
    worldSurface: 60, rockLevel: 120, lavaLine: h - 200,
    snowOriginLeft: 10, snowOriginRight: 100,
  } as unknown as GenState;
  return { st, gs };
}

describe('宝石系统世界生成', () => {
  it('GemCaves：产出宝石矿 + 宝石墙 + 暴露晶簇（19:1/1:2 语义）', () => {
    const { st, gs } = makeWorld(600, 300);
    runGemCavesPass(st, new RNG(42), gs);
    const GEMS = new Set(['gem_sapphire','gem_ruby','gem_emerald','gem_topaz','gem_amethyst','gem_diamond'].map(k => TILE_BY_KEY[k]!));
    const EXPOSED = TILE_BY_KEY['v_178_gems']!;
    let ore = 0, wall = 0, exposed = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (GEMS.has(st.type[i])) ore++;
      if (st.wall[i] >= 48 && st.wall[i] <= 53) wall++;
      if (st.type[i] === EXPOSED) exposed++;
    }
    expect(ore).toBeGreaterThan(0);
    expect(wall).toBeGreaterThan(0);
    expect(exposed).toBeGreaterThan(0);
  });

  it('ExposedGems：地下段产出单格晶簇；琥珀段在沙岩墙处 3×3', () => {
    const { st, gs } = makeWorld(400, 300);
    // 铺一块沙岩墙区（187；空气格供琥珀晶簇放置）
    for (let x = 100; x < 120; x++) for (let y = 100; y < 110; y++) {
      st.setTileSilent(x, y, 0);
      st.setWallSilent(x, y, 187);
    }
    runExposedGemsPass(st, new RNG(7), gs);
    const EXPOSED = TILE_BY_KEY['v_178_gems']!;
    let amber = 0;
    for (let x = 100; x < 120; x++) for (let y = 100; y < 110; y++) {
      const i = st.idx(x, y);
      if (st.type[i] === EXPOSED && Math.floor(st.frameX[i] / 18) === 6) amber++;
    }
    expect(amber).toBeGreaterThan(0);
  });

  it('GemTrees：洞穴墙+石基座处长出宝石树', () => {
    const { st, gs } = makeWorld(400, 250);
    // 构造一处合格点：石基座 + 洞穴墙 + 净空
    const x = 200;
    st.setWallSilent(x, 200, 54); // 洞穴墙
    for (let dy = -12; dy <= 0; dy++) st.setTileSilent(x, 199 + dy, 0);
    st.setTileSilent(x, 200, TILE_BY_KEY['stone']!);
    // 强制命中：扫全图足够多次时 1/5 命中率应至少长一棵
    runGemTreesPass(st, new RNG(3), gs);
    const TREE = new Set(['v_583_topaz_tree','v_584_amethyst_tree','v_585_sapphire_tree','v_586_emerald_tree','v_587_ruby_tree','v_588_diamond_tree','v_589_amber_tree'].map(k => TILE_BY_KEY[k]!));
    let trees = 0;
    for (let i = 0; i < st.type.length; i++) if (TREE.has(st.type[i])) trees++;
    expect(trees).toBeGreaterThan(0);
  });
});
