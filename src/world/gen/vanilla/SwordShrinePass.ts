// 原版附魔剑圣地(EnchantedSwordBiome.cs L16-85)移植。
// 外形:地表 1 格宽竖井 + 地下 ~40×40 水潭洞穴(花墙 68/草缘/藤蔓)+ 中央土丘上的剑。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';

const SWORD_TILE = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
const VINE = TILE_BY_KEY['v_52_vines']!;

export function runSwordShrinePass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  const count = 2; // 每世界约 1-2 处
  for (let n = 0; n < count * 80; n++) {
    // 位置:左/右 30%
    const left = rng.next() < 0.5;
    const x = left ? rng.int(50, Math.floor(w * 0.3)) : rng.int(Math.floor(w * 0.7), w - 50);
    const oy = Math.floor(gs.worldSurface) + rng.int(50, 99);
    if (!st.inBounds(x, oy) || !st.flags[st.idx(x, oy)]) continue;
    // 上方不能有沙(不在沙漠下)
    let sandAbove = false;
    for (let y = 0; y < oy && !sandAbove; y++) if (st.type[st.idx(x, y)] === T.SAND && st.flags[st.idx(x, y)]) sandAbove = true;
    if (sandAbove) continue;
    // 洞穴中心:种子点上方 10-20(EnchantedSwordBiome 的 point1/point2 语义)
    const sy = oy - rng.int(10, 20);
    if (sy < gs.worldSurface + 30) continue;
    // ---- 地下小屋(Slime(20, 0.8-1.3) 清空 + 灌水 + 花墙 68)----
    const xScale = 0.8 + rng.next() * 0.5;
    const rx = 20 * xScale, ry = 20;
    for (let dx = Math.floor(-rx); dx <= Math.ceil(rx); dx++) {
      for (let dy = Math.floor(-ry); dy <= Math.ceil(ry); dy++) {
        const d = (dx / rx) ** 2 + (dy / ry) ** 2;
        if (d > 1) continue;
        if (rng.next() < 0.15) continue; // Blotches 不规则边
        const px = x + dx, py = sy + dy;
        if (!st.inBounds(px, py)) continue;
        const i = st.idx(px, py);
        st.type[i] = 0; st.flags[i] = 0;
        st.wall[i] = 68; // Flower Wall
        st.liquid[i] = 255; st.liquidType[i] = 1;

      }
    }
    // 草缘(洞缘土改草)+ 藤蔓
    for (let dx = Math.floor(-rx); dx <= Math.ceil(rx); dx++) {
      for (let dy = Math.floor(-ry); dy <= Math.ceil(ry); dy++) {
        const px = x + dx, py = sy + dy;
        if (!st.inBounds(px, py)) continue;
        const i = st.idx(px, py);
        if (!st.flags[i] || st.type[i] !== T.DIRT) continue;
        // 实心但邻空腔 → 草
        let nearCavity = false;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const j = st.idx(px + ax, py + ay);
          if (st.inBounds(px + ax, py + ay) && !st.flags[j] && st.wall[j] === 68) { nearCavity = true; break; }
        }
        if (nearCavity) {
          st.type[i] = T.GRASS;
          if (py % 3 === 0 && st.inBounds(px, py + 1) && !st.flags[st.idx(px, py + 1)]) {
            st.setTileSilent(px, py + 1, VINE, 0, 0);
          }
        }
      }
    }
    // 中央土丘(14×14 泥土)隆出水面
    for (let dx = -7; dx <= 7; dx++) {
      for (let dy = -7; dy <= 7; dy++) {
        if ((dx / 7) ** 2 + (dy / 7) ** 2 > 1) continue;
        const px = x + dx, py = sy - 4 + dy;
        if (!st.inBounds(px, py)) continue;
        const i = st.idx(px, py);
        st.type[i] = T.DIRT; st.flags[i] = 1;
        st.liquid[i] = 0;
      }
    }
    // ---- 1 格宽竖井通地表(切割一切,原版 SkipTiles 仅生命木)----
    for (let y = sy + 5; y >= Math.max(2, Math.floor(gs.worldSurface) - 2); y--) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      st.type[i] = 0; st.flags[i] = 0;
      st.liquid[i] = 0;
    }
    // 剑插土丘顶(真 1/3:187 style17,假:186 style15 → v_187 帧 15*36 近似)——
    // 必须在竖井之后放,否则被同列清理删掉
    const real = rng.next() < 1 / 3;
    if (st.inBounds(x, sy - 10)) {
      st.setTileSilent(x, sy - 10, SWORD_TILE, (real ? 17 : 15) * 36, 0);
    }
    return; // 每世界一处足矣
  }
}
