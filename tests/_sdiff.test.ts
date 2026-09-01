import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

describe('时效差分', () => {
  it('F5快照(今日09:22) vs 存档(26)', () => {
    const { world } = loadSave(readFileSync('/Users/vinlic/Downloads/map-Starter_World (26).json', 'utf8'));
    const stA = (world as unknown as { store: TileStore }).store;
    const j = JSON.parse(readFileSync('/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T09-22-21-139Z.json', 'utf8'));
    const stB = new TileStore(4000, 1200);
    for (const [k, v] of Object.entries(j.meta.terrain.cells)) {
      const [x, y] = k.split(',').map(Number);
      const i = stB.idx(x, y);
      stB.type[i] = v[0]; stB.slope[i] = v[1]; stB.half[i] = v[2]; stB.flags[i] = 1;
      if (v[3]) stB.flags[i] |= 64;
    }
    const cls = (st: TileStore, x: number, y: number): string => {
      if (!st.inBounds(x, y)) return '?';
      if (!(st.flags[st.idx(x, y)] & 1)) return '.';
      const d = TILE_DEFS[st.type[st.idx(x, y)]];
      if (!d || (!d.solid && !st.isPlatform(x, y))) return '.';   // 装饰忽略
      if (st.isPlatform(x, y)) return st.slope[st.idx(x, y)] ? `P${st.slope[st.idx(x, y)]}` : 'P=';
      if (st.half[st.idx(x, y)]) return 'H';
      if (st.slope[st.idx(x, y)]) return `S${st.slope[st.idx(x, y)]}`;
      return '#';
    };
    const diffs: string[] = [];
    for (let y = 270; y <= 292; y++) for (let x = 3150; x <= 3200; x++) {
      const a = cls(stA, x, y), b = cls(stB, x, y);
      if (a !== b && a !== '?' && b !== '?') diffs.push(`(${x},${y}) 存档=${a} 今日=${b}`);
    }
    console.log('差异格:\n' + (diffs.join('\n') || '(一致)'));
  });
});
