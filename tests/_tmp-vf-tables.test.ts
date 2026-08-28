// 一次性校验:deriveVanillaSolidTablesFromDefs() vs Main.cs 真值(≤599) vs 旧 last-write 表
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveVanillaSolidTablesFromDefs } from '../src/render/VanillaFraming';
import { TILE_DEFS } from '../src/data/tiles';

describe('derived solid tables', () => {
  it('report vs Main.cs truth and vs old last-write table', () => {
    const main = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria/Main.cs', 'utf8');
    const solidT = new Array(800).fill(false);
    const topT = new Array(800).fill(false);
    for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solidT[+mm[1]] = true;
    for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) topT[+mm[1]] = true;
    const { solid, solidTop } = deriveVanillaSolidTablesFromDefs();
    // 旧实现:last-write-wins
    const oldS = new Array(600).fill(false);
    const oldT = new Array(600).fill(false);
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const v = TILE_DEFS[i]?.vanilla;
      if (!v || v.sheet >= 600) continue;
      oldS[v.sheet] = !!TILE_DEFS[i].solid;
      oldT[v.sheet] = !!TILE_DEFS[i].platform;
    }
    const badS: number[] = [], badT: number[] = [], changed: number[] = [], changedT: number[] = [];
    for (let s = 0; s < 600; s++) {
      if (!!solid[s] !== !!solidT[s]) badS.push(s);
      if (!!solidTop[s] !== !!topT[s]) badT.push(s);
      if (!!solid[s] !== !!oldS[s]) changed.push(s);
      if (!!solidTop[s] !== !!oldT[s]) changedT.push(s);
    }
    console.log('solid mismatches vs truth:', badS.length, badS.join(','));
    console.log('solidTop mismatches vs truth:', badT.length, badT.join(','));
    console.log('solid CHANGED vs old table:', changed.join(',') || '(none)');
    console.log('solidTop CHANGED vs old table:', changedT.join(',') || '(none)');
    console.log('critical: solid[0]=', solid[0], 'solid[2]=', solid[2], 'solid[1]=', solid[1], 'solid[53]=', solid[53], 'solid[59]=', solid[59], 'solidTop[19]=', solidTop[19]);
  });
});
