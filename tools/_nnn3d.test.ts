// NNN · 全金标岛屋家具画像（纯金标,不生成）
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const FILES = ['12345世界', '9293480世界', '20260811世界', '2147483647世界', 'SandboxWorld世界'];

describe('金标岛屋画像', { timeout: 120_000 }, () => {
  it('dump', () => {
    for (const f of FILES) {
      const g = parseWld(new Uint8Array(readFileSync(`tests/golden/wld/${f}.wld`)));
      const W = g.tilesWide, act = g.tiles.active, typ = g.tiles.type, fx = g.tiles.frameX, fy = g.tiles.frameY, wall = g.tiles.wall;
      // 202 聚类
      const pts: Array<[number, number]> = [];
      for (let x = 0; x < W; x++) for (let y = 0; y < g.tilesHigh; y++) {
        const i = y * W + x;
        if (act[i] && typ[i] === 202) pts.push([x, y]);
      }
      pts.sort((a, b) => a[0] - b[0]);
      const cl: Array<Array<[number, number]>> = [];
      let cur: Array<[number, number]> = [];
      for (const p of pts) {
        if (cur.length && p[0] - cur[cur.length - 1][0] > 60) { cl.push(cur); cur = []; }
        cur.push(p);
      }
      if (cur.length) cl.push(cur);
      console.log(`\n=== ${f} ${g.tilesWide}x${g.tilesHigh} islands=${cl.length} ===`);
      cl.forEach((c, k) => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (c.length < 40) return; // 非屋岛(碎片)跳过
        // 家具清单
        const out: string[] = [];
        let door = 0, table = 0, chair = 0, chest = 0, banner = 0;
        for (let y = y0 - 4; y <= y1 + 4; y++) for (let x = x0 - 4; x <= x1 + 4; x++) {
          const i = y * W + x;
          if (!act[i]) continue;
          const t = typ[i];
          if (t === 10 || t === 11) { door++; out.push(`D${x},${y}[${fx[i]},${fy[i]}]`); }
          if (t === 14) { table++; out.push(`T${x},${y}[${fx[i]},${fy[i]}]`); }
          if (t === 15) { chair++; out.push(`c${x},${y}[${fx[i]},${fy[i]}]`); }
          if (t === 21) { chest++; }
          if (t === 91) { banner++; }
        }
        console.log(` isl#${k} x${x0}-${x1},y${y0}-${y1} n=${c.length} door=${door / 3 | 0} table=${table / 3 | 0} chair=${chair / 2 | 0} chest=${chest / 4 | 0} banner=${banner / 3 | 0}`);
        console.log(`   ${out.join(' ')}`);
      });
    }
  });
});
