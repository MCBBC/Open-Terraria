// 宝箱帧写入验证：用用户地图同种子生成，全图扫多格 framed 物体的帧合法性
// （合法：块内至少一格 ≥18px 偏移，或全 0[渲染端重建]；非法：索引帧 0/1 且非全 0）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { hashString } from '../src/core/rng';

describe('宝箱/多格家具帧写入', () => {
  it('同种子(929393480)生成后无索引帧损坏', async () => {
    // hashString 转换与 mainFlow 一致（seedText 数字字符串）
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '929393480' });
    const st = world.store;
    let bad: Array<{ x: number; y: number; name: string; frames: number[][] }> = [];
    for (let y = 0; y < st.h && bad.length < 5; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        const type = st.type[i];
        if (type === 0 || !st.flags[i]) continue;
        const def = TILE_DEFS[type];
        const fw = def?.vanilla?.fw ?? 0, fh = def?.vanilla?.fh ?? 0;
        if (!def?.vanilla || def.vanilla.frame !== 'style' || fw < 2) continue;
        // 非左上角格跳过
        const li = st.idx(Math.max(0, x - 1), y), ai = st.idx(x, Math.max(0, y - 1));
        if (x > 0 && st.type[li] === type) continue;
        if (y > 0 && st.type[ai] === type) continue;
        const frames: number[][] = [];
        let maxFx = 0, maxFy = 0, anyNonZero = false;
        for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) {
          const xx = x + dx, yy = y + dy;
          if (!st.inBounds(xx, yy)) continue;
          const ii = st.idx(xx, yy);
          if (st.type[ii] !== type) continue;
          const fx = st.frameX[ii], fy = st.frameY[ii];
          frames.push([fx, fy]);
          maxFx = Math.max(maxFx, fx); maxFy = Math.max(maxFy, fy);
          if (fx || fy) anyNonZero = true;
        }
        if (frames.length >= 2 && maxFx < 18 && maxFy < 18 && anyNonZero) {
          bad.push({ x, y, name: def.key, frames });
        }
      }
    }
    console.log('坏块:', JSON.stringify(bad));
    expect(bad).toEqual([]);
  }, 180000);
});
