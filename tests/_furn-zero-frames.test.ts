// 一次性审计：187 零帧写入方抓捕（2026-08-17 石头装饰物贴图错位）。
// 探针挂 TileStore.setTileSilent 抓 type-187 且 (0,0) 帧的写入调用栈，
// 再全图确认零帧组坐标（应与用户存档 dump 的 (2988,226) 等一致）。
// 运行：npx vitest run tests/_furn-zero-frames.test.ts
import { describe, it, expect } from 'vitest';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('187 零帧写入方抓捕(一次性)', () => {
  it('seed 12345: setTileSilent 探针 + 零帧组坐标', async () => {
    const { TileStore } = await import('../src/world/TileStore');
    const { generateWorld } = await import('../src/world/gen/WorldGen');
    const T187 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
    const orig = TileStore.prototype.setTileSilent;
    const logs: string[] = [];
    let writing = false;
    TileStore.prototype.setTileSilent = function (x: number, y: number, type: number, fx = 0, fy = 0) {
      if (writing && type === T187 && fx === 0 && fy === 0 && logs.length < 8) {
        const stack = String(new Error('t').stack).split('\n').slice(2, 6).join(' <- ');
        logs.push(`(${x},${y}) ${stack.slice(0, 300)}`);
      }
      return orig.call(this, x, y, type, fx, fy);
    } as typeof TileStore.prototype.setTileSilent;
    writing = true;
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    writing = false;
    TileStore.prototype.setTileSilent = orig;
    const st = world.store;
    // 零帧组坐标（4 邻接连通，同型）
    const seen = new Uint8Array(st.w * st.h);
    const groups: string[] = [];
    const flood = (sx: number, sy: number): number => {
      const stack = [[sx, sy]]; let n = 0, zero = 0;
      while (stack.length) {
        const [x, y] = stack.pop()!;
        const i = y * st.w + x;
        if (x < 0 || y < 0 || x >= st.w || y >= st.h || seen[i]) continue;
        if (!st.flags[i] || st.type[i] !== T187) continue;
        seen[i] = 1; n++;
        if (st.frameX[i] === 0 && st.frameY[i] === 0) zero++;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return zero === n ? n : 0;
    };
    let total = 0;
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = y * st.w + x;
        if (seen[i] || !st.flags[i] || st.type[i] !== T187) continue;
        const n = flood(x, y);
        if (n > 0) { total++; if (groups.length < 10) groups.push(`(${x},${y})n=${n}`); }
      }
    }
    const fxHist = new Map<number, number>();
    for (let i = 0; i < st.frameX.length; i++) {
      if (st.flags[i] && st.type[i] === T187) fxHist.set(st.frameX[i], (fxHist.get(st.frameX[i]) ?? 0) + 1);
    }
    console.log('187 fx 直方图(尾):', [...fxHist.entries()].sort((a, b) => a[0] - b[0]).slice(-12).map(([k, v]) => `${k}:${v}`).join(' '));
    console.log(`187 零帧组=${total}: ${groups.join(' ')}`);
    console.log('零帧写入栈探针:');
    for (const l of logs) console.log('  ' + l);
    if (!logs.length) console.log('  (无 setTileSilent 零帧写入 → 帧是直接数组赋值/他法清零)');
    expect(true).toBe(true);
  }, 300000);
});
