import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/save/SaveFile';
import { TILE_DEFS } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/tiles';

it('dump', () => {
  const json = readFileSync('/Users/vinlic/Downloads/map-流浪汉舌.json', 'utf8');
  const { world } = loadSave(json);
  const st = world.store;
  const X0 = 1808, X1 = 1848, Y0 = 308, Y1 = 326;
  for (let y = Y0; y <= Y1; y++) {
    let row = `${String(y).padStart(4)} `;
    for (let x = X0; x <= X1; x++) {
      const i = st.idx(x, y);
      const t = st.type[i];
      const active = st.flags[i] !== 0 && t !== 0;
      const wall = st.wall[i];
      const liquid = st.liquid?.[i] ?? 0;
      const half = st.half[i];
      const slope = st.slope[i];
      let ch: string;
      if (!active) ch = liquid > 0 ? '~' : (wall > 0 ? '"' : '.');
      else if (half) ch = 'h';
      else if (slope > 0) ch = String(slope);
      else ch = '#';
      row += ch;
    }
    console.log(row);
  }
  console.log('cols: x=' + X0 + '..' + X1);
  // 逐格列出标注点周围 6x6
  for (let y = 314; y <= 322; y++) {
    let cells: string[] = [];
    for (let x = 1820; x <= 1830; x++) {
      const i = st.idx(x, y);
      const t = st.type[i];
      const active = st.flags[i] !== 0 && t !== 0;
      const wall = st.wall[i];
      const half = st.half[i];
      const slope = st.slope[i];
      cells.push(`(${x},${y})=${active ? (TILE_DEFS[t]?.name ?? t) + (slope ? '/s' + slope : '') + (half ? '/h' : '') : (wall ? 'empty/w' + wall : 'empty')}`);
    }
    console.log(cells.join('  '));
  }
});
