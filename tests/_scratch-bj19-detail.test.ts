import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { TILE_DEFS } from '../src/data/tiles';

// SW-BJ19 一次性诊断:标注坡格逐格属性 dump
describe('scratch SW-BJ19 逐格属性', () => {
  it('dump 坡区逐格', () => {
    const json = readFileSync('/Users/vinlic/Downloads/map-Starter_World (29).json', 'utf8');
    const { world } = loadSave(json);
    const st = world.store;
    const X0 = 3200, X1 = 3216, Y0 = 356, Y1 = 368;
    for (let y = Y0; y <= Y1; y++) {
      const cells: string[] = [];
      for (let x = X0; x <= X1; x++) {
        const i = st.idx(x, y);
        const t = st.type[i];
        const active = st.flags[i] !== 0 && t !== 0;
        if (!active) { cells.push(`${x}:.`); continue; }
        const def = TILE_DEFS[t];
        const tag = def?.key ?? String(t);
        const slope = st.slope[i] ? ` s${st.slope[i]}` : '';
        const half = st.half[i] ? ' half' : '';
        const plat = def?.platform ? ' PLAT' : '';
        const solid = st.isSolid(x, y) ? '' : ' NONSOLID';
        cells.push(`${x}:${tag}${slope}${half}${plat}${solid}`);
      }
      console.log(`y=${y}  ${cells.join(' | ')}`);
    }
    console.log('player save:', JSON.stringify(world.store.constructor.name));
    expect(true).toBe(true);
  });
});
