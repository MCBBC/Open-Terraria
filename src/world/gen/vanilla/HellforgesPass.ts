// 原版 "Hellforges" pass 1:1(cs:18298-18347)。
// 数量 = w/200;落点墙须地狱自然墙(13/14),向下扫到实心后上一格 PlaceTile 77;
// 预算只计"有效墙位上放置失败"的尝试(上限 10000 次)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';

const HELLFORGE = TILE_BY_KEY['v_77_hellforge']!;

export function runHellforgesPass(st: TileStore, rng: RNG): void {
  const { w, h } = st;
  const count = Math.floor(w / 200);
  for (let n = 0; n < count; n++) {
    let done = false;
    let fail = 0;
    while (!done) {
      // cs:18314-18315：Next(1, maxTilesX) / Next(h-250, h-30) = [1,w-1] / [h-250,h-31]
      //   （rng.int 闭区间；x 上界旧代码 w-2 少一列，2026-08-13 校源修正）
      const x = rng.int(1, w - 1);
      let y = rng.int(h - 250, h - 31);
      // F1(cs:18312-18319)：墙非 13/14 时整个 if 块跳过——num3 不增，仅重掷 x/y 继续。
      //   旧代码此处 fail++ 烧预算，墙覆盖率低时地狱熔炉数量被预算虚吃提前见底。
      if (st.inBounds(x, y) && (st.wall[st.idx(x, y)] === 13 || st.wall[st.idx(x, y)] === 14)) {
        while (y < h - 20 && !st.flags[st.idx(x, y)]) y++;
        y--;
        // 3×2 净空(PlaceTile forced 语义;锚点 = 底行右列? 以左上角放置)
        if (y < 2 || !st.inBounds(x + 2, y - 1)) { fail++; }
        else {
          let ok = true;
          for (let dx = 0; dx < 3 && ok; dx++) {
            for (let dy = -1; dy <= 0 && ok; dy++) {
              if (st.flags[st.idx(x + dx, y + dy)]) ok = false;
            }
          }
          if (ok) {
            const fw = TILE_DEFS[HELLFORGE].vanilla?.fw ?? 3;
            for (let dx = 0; dx < 3; dx++) {
              for (let dy = 0; dy < 2; dy++) {
                st.setTileSilent(x + dx, y - 1 + dy, HELLFORGE, dx * 18, dy * 18);
              }
            }
            void fw;
            done = true;
          } else fail++;
        }
        if (fail >= 10000) done = true;
      }
    }
  }
}
