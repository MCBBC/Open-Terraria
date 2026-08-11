// 临时探针：微光液体生成量 vs 沉降后存活量 + aether 树计数（验证后删除）
import { describe, it } from 'vitest';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { TILE_BY_KEY } from '../src/data/tiles';

const GEM = ['v_583_topaz_tree', 'v_584_amethyst_tree', 'v_585_sapphire_tree', 'v_586_emerald_tree', 'v_587_ruby_tree', 'v_588_diamond_tree', 'v_589_amber_tree'].map((k) => TILE_BY_KEY[k]!);
const AETH = TILE_BY_KEY['v_659_aetherium_block']!;

function stat(st: any) {
  let shim = 0, amt = 0, aeth = 0, gem = 0;
  for (let i = 0; i < st.liquid.length; i++) if (st.liquidType[i] === 4 && st.liquid[i] > 0) { shim++; amt += st.liquid[i]; }
  for (let i = 0; i < st.type.length; i++) {
    if (st.type[i] === AETH) aeth++;
    else if (GEM.includes(st.type[i])) gem++;
  }
  return { shim, amt, aeth, gem };
}

describe('shimmer probe', () => {
  it('survives settle + trees planted', async () => {
    for (const seed of ['probe-shimmer', '9293480']) {
      const snaps: Record<string, unknown> = {};
      const t0 = Date.now();
      const world = await generateWorld({
        width: 4200, height: 1200, seedText: seed,
        onWorldPartial: (w, _i, name) => {
          if (name === '微光') snaps.afterShimmerPass = stat(w.store);
          if (name === '水体沉降') snaps.afterMidSettle = stat(w.store);
        },
      });
      snaps.afterGenerate = stat(world.store);
      for (let r = 1; r <= 3; r++) {
        await settleWorldLiquids(world, 'gen');
        snaps[`afterSettle${r}`] = stat(world.store);
      }
      snaps.ms = Date.now() - t0;
      snaps.shimmerPos = [world.shimmerX, world.shimmerY];
      const gs: any = lastGenState();
      snaps.gsShimmer = gs ? [gs.shimmerX, gs.shimmerY] : null;
      console.log(seed, JSON.stringify(snaps));
    }
  }, 600000);
});
