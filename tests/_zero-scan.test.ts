// 一次性：全 sheet 零帧多格家具复扫（终清批落地确认）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
describe('零帧复扫(一次性)', () => {
  it('seed 12345', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    const multi = new Set<number>();
    for (let t = 1; t < TILE_DEFS.length; t++) {
      const d = TILE_DEFS[t];
      if (d?.vanilla?.frame === 'style' && ((d.vanilla.fw ?? 1) > 1 || (d.vanilla.fh ?? 1) > 1)) multi.add(t);
    }
    // 整组全零口径（组 = 同型连通块；合法样式0物体只锚点格为(0,0)，不整组全零）
    const seen = new Uint8Array(st.w * st.h);
    const groups = new Map<number, number>();
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      const i = y * st.w + x;
      if (seen[i] || !st.flags[i] || !multi.has(st.type[i])) continue;
      const type = st.type[i];
      const stack = [[x, y]]; let n = 0, zero = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const ci = cy * st.w + cx;
        if (cx < 0 || cy < 0 || cx >= st.w || cy >= st.h || seen[ci]) continue;
        if (!st.flags[ci] || st.type[ci] !== type) continue;
        seen[ci] = 1; n++;
        if (st.frameX[ci] === 0 && st.frameY[ci] === 0) zero++;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      if (n >= 2 && zero === n) {
        const sh = TILE_DEFS[type]!.vanilla!.sheet!;
        groups.set(sh, (groups.get(sh) ?? 0) + 1);
      }
    }
    console.log('零帧组 by sheet:', JSON.stringify([...groups.entries()].sort((a, b) => b[1] - a[1])));
    expect(true).toBe(true);
  }, 300000);
});
