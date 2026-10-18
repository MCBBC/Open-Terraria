// ★一次性：从用户存档提取楼梯窗口 → tests/fixtures/stair-window.json
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { readLocalFixtureText, localFixtureMissing } from './fixturePath';
import { loadSave } from '../src/save/SaveFile';

const SAVE = 'starter-sbw-20260831.json';   // ★C档收编:原 ~/Downloads/Starter_World-20260831-2315.sbw.json
const X0 = 3180, X1 = 3222, Y0 = 380, Y1 = 404;

describe.skipIf(localFixtureMissing(SAVE))('fixture 提取', () => {
  it('dump 窗口', () => {
    const { world } = loadSave(readLocalFixtureText(SAVE));
    const st = world.store;
    const cells: Array<[number, number, number, number, number]> = []; // x,y,type,slope,half
    for (let y = Y0; y <= Y1; y++) {
      for (let x = X0; x <= X1; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i] || st.type[i] === 0) continue;
        cells.push([x, y, st.type[i], st.slope[i], st.half[i]]);
      }
    }
    const fx = { origin: [X0, Y0], w: X1 - X0 + 1, h: Y1 - Y0 + 1, cells };
    writeFileSync('tests/fixtures/stair-window.json', JSON.stringify(fx));
    console.log(`fixture cells=${cells.length}`);
  });
});
