// IIIII113b 一次性仪：JS tile id → vanilla sheet 映射倾倒（python 侧对拍用）
// 用法：cd game && SW_IDS=1,2,59 npx vitest run tools/_iii113sheet.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('dump sheet map', () => {
  const sheetOf = new Int32Array(TILE_DEFS.length).fill(-1);
  const keys: string[] = [];
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') sheetOf[i] = s;
    keys.push(String(TILE_DEFS[i]?.key ?? ''));
  }
  const ids = (process.env.SW_IDS ?? '')
    .split(',').filter(Boolean).map(Number);
  for (const i of ids) {
    console.log(`JS[${i}] key=${keys[i]} sheet=${sheetOf[i]}`);
  }
  if (process.env.SW_IDS_ALL === '1') {
    writeFileSync(process.env.SW_IDS_OUT ?? '/tmp/iii113b-out/sheetof.json',
      JSON.stringify({ sheetOf: Array.from(sheetOf), keys }));
    console.log('sheetof.json written');
  }
});
