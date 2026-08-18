// NNN · 缺失家具位置占用查证 + 无门屋门位查证（纯金标）
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

describe('缺失位置占用', { timeout: 120_000 }, () => {
  it('dump', () => {
    const cases: Array<[string, number, number, number, number, string]> = [
      // [file, x0, x1, y0, y1, label]
      ['20260811世界', 3010, 3024, 92, 104, '20260811 isl1 furniture(缺右椅@3017)'],
      ['SandboxWorld世界', 1872, 1890, 114, 126, 'SW isl1 furniture(缺左椅@1879)'],
      ['12345世界', 1344, 1360, 96, 106, '12345 isl2(无桌椅区 1349-1353,101-102)'],
      ['20260811世界', 1340, 1372, 108, 126, '20260811 isl0(无门屋)'],
      ['2147483647世界', 1050, 1082, 116, 136, '2147483647 isl0(无门屋)'],
      ['2147483647世界', 2844, 2876, 121, 140, '2147483647 isl2(无门屋)'],
    ];
    for (const [f, x0, x1, y0, y1, label] of cases) {
      const g = parseWld(new Uint8Array(readFileSync(`tests/golden/wld/${f}.wld`)));
      const W = g.tilesWide, act = g.tiles.active, typ = g.tiles.type, fx = g.tiles.frameX, fy = g.tiles.frameY, wall = g.tiles.wall;
      console.log(`\n--- ${f} ${label} ---`);
      for (let y = y0; y <= y1; y++) {
        let row = String(y).padStart(4) + ' ';
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          if (!act[i]) { row += wall[i] === 0 ? '.' : wall[i] === 82 ? '8' : wall[i] === 21 ? 'G' : wall[i] === 73 ? 'P' : '?'; continue; }
          const t = typ[i];
          const c: Record<number, string> = {
            202: 'S', 14: 'T', 15: 'c', 10: 'D', 11: 'O', 91: 'B', 21: 'K', 5: 't', 3: 'p',
            2: 'g', 1: 's', 0: 'd', 4: '#', 207: 'F', 189: 'o', 196: 'l', 199: 'L', 27: 'W', 16: 'C',
            19: '=', 185: 'e', 186: 'E', 187: 'A', 616: 'Y', 323: 'm', 324: 'n', 53: 'S', 112: 'a', 23: 'f', 199: 'L',
          };
          row += c[t] ?? (t < 10 ? String(t) : '#');
        }
        console.log(row);
      }
      // 详查关键格
      const probe: Array<[number, number]> = label.includes('3017') ? [[3017, 94], [3017, 95], [3017, 96], [3017, 97]]
        : label.includes('1879') ? [[1879, 118], [1879, 119], [1879, 120], [1879, 121]]
        : label.includes('isl2') ? [[1349, 101], [1350, 101], [1351, 101], [1352, 101], [1353, 101]]
        : [];
      for (const [x, y] of probe) {
        const i = y * W + x;
        console.log(`  (${x},${y}) act=${act[i]} type=${typ[i]} fx=${fx[i]} fy=${fy[i]} wall=${wall[i]} liq=${g.tiles.liquid[i]}`);
      }
    }
  });
});

describe('房屋几何求解', { timeout: 120_000 }, () => {
  it('solve', () => {
    const cases: Array<[string, number, number, number, number]> = [
      ['SandboxWorld世界', 1860, 1892, 110, 128],
      ['20260811世界', 2990, 3028, 86, 106],
      ['12345世界', 1340, 1372, 92, 108],
      ['2147483647世界', 1048, 1084, 114, 134],
      ['20260811世界', 1338, 1374, 105, 124],
    ];
    for (const [f, x0, x1, y0, y1] of cases) {
      const g = parseWld(new Uint8Array(readFileSync(`tests/golden/wld/${f}.wld`)));
      const W = g.tilesWide, act = g.tiles.active, typ = g.tiles.type, fx = g.tiles.frameX, fy = g.tiles.frameY;
      const out: string[] = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (!act[i]) continue;
        const t = typ[i];
        if (t === 91 || t === 21 || t === 10 || t === 11 || t === 14 || t === 15) {
          if (fy[i] === 0 || fy[i] === 486 || (t === 91 && fy[i] === 0)) out.push(`${t}@${x},${y}[${fx[i]},${fy[i]}]`);
        }
      }
      console.log(`${f} x${x0}-${x1}: ${out.join(' ')}`);
    }
  });
});
