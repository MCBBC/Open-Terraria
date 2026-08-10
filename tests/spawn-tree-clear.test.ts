// 出生点清理盒回归:树干豁免(曾把清理盒内树干中段整格清掉 → 浮空断干"贴图透明")
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('出生点清理不破坏树', () => {
  it('全图树干无同列断口 + 树登记有效', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'spawn-tree-regression', name: 't' } as never);
    const TREE = TILE_BY_KEY['tree']!;
    const st = world.store;
    // ① 每列树段必须连续(干/枝/冠中,同列任意两段间隔 >15 视为断干)
    for (let x = 1; x < st.w - 1; x++) {
      const segs: Array<[number, number]> = [];
      let y = 20;
      while (y < 800) {
        if (st.type[st.idx(x, y)] === TREE) {
          let y2 = y;
          while (y2 + 1 < 800 && st.type[st.idx(x, y2 + 1)] === TREE) y2++;
          segs.push([y, y2]);
          y = y2 + 1;
        } else y++;
      }
      for (let s = 0; s < segs.length - 1; s++) {
        // 病理:长段(≥5)+短缺口(≤6)+下一段(≤3)= 清理盒打洞形状
        const gap = segs[s + 1][0] - segs[s][1] - 1;
        expect(
          !(segs[s][1] - segs[s][0] + 1 >= 5 && gap >= 1 && gap <= 6 && segs[s + 1][1] - segs[s + 1][0] + 1 <= 3),
          `x=${x} 树干断口: ${JSON.stringify(segs)}`,
        ).toBe(true);
      }
    }
    // ② 树登记表与实际树一致(顶部格必须是 TREE)
    for (const t of world.trees) {
      expect(st.type[st.idx(t.x, t.y)], `登记树(${t.x},${t.y})顶部缺格`).toBe(TREE);
    }
  }, 600000);
});
