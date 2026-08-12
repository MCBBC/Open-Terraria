// 生成期天空不变量：
// ① 深空（y < 40）：原版唯一合法的深空内容是浮空岛（FloatingIslands y∈[90, worldSurfaceLow-50]）。
//    岛体云盘（±~20）与岛上方云 puff（num6−Next(20,40)，半径≤7，cs:79029-79033）在原版
//    可探到 y≈43——2026-08-12 islands 1:1 化（caves-oracle 对账）后实测 y=48-62 有岛云 189，
//    故界线从 60 下调到 40（仍高于 puff 下限 43 之下、足以捕捉地形穿透/非法深空块）。
//    岛树（树冠最高约 29 格）不在生成期放置，不构成约束。
//    （宽口径扫描证实：地表以上 flags=1 的块全部是合法内容——岛云/岛屋日光板/岛内矿石/
//    岛树/地表花草/高于平均地表线的丛林草等，已逐类核对，见 docs/worldgen/vanilla-pass-alignment.md）
// ② 预览着色语义：mapColor24 必须隐藏幽灵 tile（flags=0 有 type 不显形）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS, T } from '../src/data/tiles';
import { mapColor24 } from '../src/render/MapColors';

describe('生成期天空不变量', () => {
  it('深空 y<40 零活性 tile（两个种子）', async () => {
    for (const seed of ['sky-check-1', 'sky-check-2']) {
      const world = await generateWorld({ width: 4200, height: 1200, seedText: seed });
      const st = world.store;
      const bad: Array<{ x: number; y: number; key: string }> = [];
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < st.w; x++) {
          const i = st.idx(x, y);
          if (!st.flags[i]) continue;
          bad.push({ x, y, key: TILE_DEFS[st.type[i]]?.key ?? String(st.type[i]) });
          if (bad.length >= 5) break;
        }
        if (bad.length >= 5) break;
      }
      console.log(seed, '深空异常:', bad);
      expect(bad).toEqual([]);
    }
  }, 180000);

  it('mapColor24 隐藏幽灵 tile（flags=0 有 type → 天空/墙色，非 tile 色）', () => {
    // 直接构造：借一个生成世界的头部区域写幽灵 tile 验证着色
    return generateWorld({ width: 4200, height: 1200, seedText: 'sky-color' }).then((world) => {
      const st = world.store;
      const gl = Math.floor(world.groundLevel);
      const x = 2100, y = Math.max(2, gl - 200);
      const i = st.idx(x, y);
      const origType = st.type[i], origFlags = st.flags[i];
      st.type[i] = T.STONE; st.flags[i] = 0;   // 石头幽灵（空气位写 type）
      const ghostColor = mapColor24(st, x, y);
      st.flags[i] = 1;                    // 同格激活
      const activeColor = mapColor24(st, x, y);
      st.type[i] = origType; st.flags[i] = origFlags;
      expect(ghostColor).not.toBe(activeColor); // 幽灵≠实体色
      // 实体色必须等于石头表色（防 flags 判断接反把实体当幽灵）
      const expected = parseInt(TILE_DEFS[T.STONE].mapColor.slice(1, 7), 16);
      expect(activeColor).toBe(expected);
    });
  }, 180000);
});
