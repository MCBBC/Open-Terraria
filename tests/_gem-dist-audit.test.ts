// 一次性诊断：暴露晶簇(tile 178)分布对账——原版金标 12345世界.wld vs 我们 generateWorld(12345)
// 运行：npx vitest run tests/_gem-dist-audit.test.ts
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';
import { loadGolden } from './golden-wld-meta.test';

const EXPOSED = TILE_BY_KEY['v_178_gems']!;

interface Stats {
  total: number;
  bands: Record<string, number>;   // 深度带计数
  floating: number;                // 四邻无实心且无背景墙(悬空)
  noWall: number;                  // 无背景墙
  styles: number[];                // style(frameX/18)分布
}

function statsOf(
  w: number, h: number,
  get: (x: number, y: number) => { t: number; a: number; fx: number; wall: number; solidNb: boolean },
): Stats {
  const s: Stats = { total: 0, bands: {}, floating: 0, noWall: 0, styles: new Array(8).fill(0) };
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return get(x, y).a === 1 && get(x, y).t !== EXPOSED && true;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = get(x, y);
      if (c.a !== 1 || c.t !== EXPOSED) continue;
      s.total++;
      const band = y < 337 ? 'surface' : y < 457 ? 'dirt' : y < 802 ? 'rock' : y < 900 ? 'hellTop' : 'hell';
      s.bands[band] = (s.bands[band] ?? 0) + 1;
      if (c.wall === 0) s.noWall++;
      const nb = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
      if (!nb && c.wall === 0) s.floating++;
      const st = Math.round(c.fx / 18);
      if (st >= 0 && st < 8) s.styles[st]++;
    }
  }
  return s;
}

describe('宝石分布对账(一次性)', () => {
  it('金标 vs 我们: tile 178 总量/深度带/悬空比例', async () => {
    const g = loadGolden('12345世界.wld');
    const gw = g.tilesWide, gh = g.tilesHigh;
    const golden = statsOf(gw, gh, (x, y) => {
      const i = y * gw + x;
      // 金标 type 是原版 id:宝石=178
      return { t: g.tiles.type[i] === 178 ? EXPOSED : g.tiles.type[i], a: g.tiles.active[i], fx: g.tiles.frameX[i], wall: g.tiles.wall[i], solidNb: false };
    });
    console.log('GOLDEN 178:', JSON.stringify(golden));

    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    const ours = statsOf(st.w, st.h, (x, y) => {
      const i = st.idx(x, y);
      const d = (dx: number, dy: number) => {
        if (x + dx < 0 || y + dy < 0 || x + dx >= st.w || y + dy >= st.h) return false;
        const j = st.idx(x + dx, y + dy);
        return st.flags[j] === 1;
      };
      return {
        t: st.type[i], a: st.flags[i], fx: st.frameX[i], wall: st.wall[i],
        solidNb: d(-1, 0) || d(1, 0) || d(0, -1) || d(0, 1),
      };
    });
    console.log('OURS   178:', JSON.stringify(ours));
  }, 600000);
});
