// NNN · 无门屋门口精确格 dump
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

describe('无门屋门口', { timeout: 120_000 }, () => {
  it('dump', () => {
    const cases: Array<[string, number, number, number, number]> = [
      ['2147483647世界', 1068, 1082, 120, 132],   // isl0 右侧(门应在 1075)
      ['20260811世界', 1360, 1376, 110, 124],     // isl0(无门)
      ['2147483647世界', 2862, 2876, 126, 140],   // isl2(无门)
      ['20260811世界', 3008, 3022, 90, 100],      // isl1 缺右椅区
      ['SandboxWorld世界', 1874, 1888, 114, 124], // isl1 缺左椅区
    ];
    for (const [f, x0, x1, y0, y1] of cases) {
      const g = parseWld(new Uint8Array(readFileSync(`tests/golden/wld/${f}.wld`)));
      const W = g.tilesWide, act = g.tiles.active, typ = g.tiles.type, fx = g.tiles.frameX, fy = g.tiles.frameY, wall = g.tiles.wall, liq = g.tiles.liquid;
      console.log(`\n--- ${f} x${x0}-${x1} y${y0}-${y1} ---`);
      for (let y = y0; y <= y1; y++) {
        let row = String(y).padStart(4) + ' ';
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          const t = act[i] ? typ[i] : -1;
          row += `${t}`.padStart(3).slice(-3);
        }
        console.log(row);
      }
      console.log('hdr   ' + Array.from({ length: x1 - x0 + 1 }, (_, k) => String((x0 + k) % 100).padStart(3).slice(-3)).join(''));
      // 液体分布
      for (let y = y0; y <= y1; y++) {
        let row = String(y).padStart(4) + ' ';
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          row += String(liq[i]).padStart(3).slice(-3);
        }
        console.log('L' + row);
      }
    }
  });
});
