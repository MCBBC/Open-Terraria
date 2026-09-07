import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { TILE_DEFS } from '../src/data/tiles';

describe('scratch 流浪汉舌地形窗口', () => {
  it('渲染标注点周边 ASCII', () => {
    const json = readFileSync('/Users/vinlic/Downloads/map-流浪汉舌.json', 'utf8');
    const { world } = loadSave(json);
    const st = world.store;
    const X0 = 1790, X1 = 1865, Y0 = 295, Y1 = 350;
    const lines: string[] = [];
    // 图例: . =空 # =实心 h =半砖 1-4 =坡  ~ =液 " =有墙空格 P =平台
    for (let y = Y0; y <= Y1; y++) {
      let row = `${String(y).padStart(4)} `;
      for (let x = X0; x <= X1; x++) {
        const i = st.idx(x, y);
        const t = st.type[i];
        const def = TILE_DEFS[t];
        const active = st.flags[i] !== 0 && t !== 0;
        const wall = st.wall[i];
        const liquid = st.liquid?.[i] ?? 0;
        const half = st.half[i];
        const slope = st.slope[i];
        const isMark = (x === 1825 && y === 317) || (x === 1824 && y === 318);
        let ch: string;
        if (isMark) ch = '@';
        else if (!active) ch = liquid > 0 ? '~' : (wall > 0 ? '"' : '.');
        else if (half) ch = 'h';
        else if (slope > 0) ch = String(slope);
        else if (def?.platform) ch = 'P';
        else ch = '#';
        row += ch;
      }
      lines.push(row);
    }
    console.log(`X ${X0} → ${X1} (@=标注点 #=实心 h=半砖 1-4=坡 P=平台 ~=液 "=墙 . =空)`);
    console.log(lines.join('\n'));
    expect(true).toBe(true);
  });
});
