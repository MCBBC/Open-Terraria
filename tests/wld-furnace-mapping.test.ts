import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { TILE_BY_KEY } from '../src/data/tiles';


describe('wld 导入:tile 17 = 熔炉(非铁砧)', () => {
  it('标注区导入后:熔炉 3×2 帧完整,铁砧正常', () => {
    const { save } = parseWldToSave(readFileSync('/Users/vinlic/Downloads/Starter_World Master.wld'));
    const u8 = Buffer.from(save.tiles, 'base64');
    const W = save.header.width, H = save.header.height;
    const type = new Uint16Array(W * H), fx = new Uint16Array(W * H), fy = new Uint16Array(W * H);
    let pos = 0, i = 0;
    function rv() { let v = 0, s = 0, b; do { b = u8[pos++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return v >>> 0; }
    while (i < type.length && pos < u8.length) {
      const run = rv() + 1, t = rv();
      let x = 0, y = 0;
      if (t !== 0) { x = rv(); y = rv(); }
      for (let k = 0; k < run && i < type.length; k++, i++) { type[i] = t; fx[i] = x; fy[i] = y; }
    }
    const F = TILE_BY_KEY['furnace']!, A = TILE_BY_KEY['anvil']!;
    const area: string[] = [];
    for (let y = 395; y <= 396; y++) {
      for (let x = 3171; x <= 3175; x++) {
        const j = y * W + x;
        const nm = type[j] === F ? 'furnace' : type[j] === A ? 'anvil' : type[j] === 0 ? '.' : String(type[j]);
        area.push(`${nm}(${fx[j]},${fy[j]})`);
      }
    }
    console.log('导入后标注区(3171-3175 × 395-396):', area.join(' '));
    // 熔炉 3×2:上排 fy=0 下排 fy=18;铁砧 2×1 fy=0
    const jF1 = 395 * W + 3171, jF2 = 396 * W + 3171;
    expect(type[jF1]).toBe(F);
    expect(fy[jF1]).toBe(0);
    expect(fy[jF2]).toBe(18);
    expect(type[396 * W + 3174]).toBe(A);
  });
});
