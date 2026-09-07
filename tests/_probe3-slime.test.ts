import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/save/SaveFile';
import { TILE_DEFS } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/tiles';

it('numeric dump', () => {
  const json = readFileSync('/Users/vinlic/Downloads/map-流浪汉舌.json', 'utf8');
  const { world } = loadSave(json);
  const st = world.store;
  for (let y = 313; y <= 322; y++) {
    const cells: string[] = [];
    for (let x = 1819; x <= 1832; x++) {
      const i = st.idx(x, y);
      const t = st.type[i];
      const f = st.flags[i];
      const w = st.wall[i];
      const half = st.half[i];
      const slope = st.slope[i];
      const liq = st.liquid?.[i] ?? 0;
      const nm = TILE_DEFS[t]?.name ?? 'NODEF';
      cells.push(`${x}:t${t}${f ? '*' : '-'}${slope ? 's' + slope : ''}${half ? 'h' : ''}${liq ? 'L' + liq : ''}${w ? 'w' + w : ''}${f && t !== 0 ? '[' + nm + ']' : f ? '[ACT-t' + t + ']' : ''}`);
    }
    console.log(`y${y}: ` + cells.join(' '));
  }
  // TILE_DEFS 名字为空的类型
  console.log('empty-name tile defs:', TILE_DEFS.map((d: any, i: number) => (d && (d.name === '' || d.name === undefined) ? i : -1)).filter((i: number) => i >= 0).join(','));
});
