// IIII100f 取证仪③c：命中的 (1754,oy) 在 pre-track 瓦片上做 FindSuitableOrigin 下降,
// 终点=558 者=金标首巷真 attempt;并给出对应 C* 候选(=P1754−A0−2k',k'=前序失败数)。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I100FO === '1';
const OUT = '/tmp/iii225b-out';
const W = 4200, N = W * 1200;
const SOLID = new Uint8Array(TILE_DEFS.length);
for (let i = 0; i < TILE_DEFS.length; i++) SOLID[i] = TILE_DEFS[i]?.solid ? 1 : 0;
const INVALID_TILES = new Set([383, 384, 15, 304, 30, 321, 245, 246, 240, 241, 242, 16, 34, 158, 377, 94, 10, 19, 86, 219, 484, 190, 664, 665, 41, 43, 44, 226, 237, 711, 712, 713, 714, 715, 716, 379, 314, 141, 411, 21, 467, 88]);
const INVALID_WALLS = new Set([7, 94, 95, 8, 98, 99, 9, 96, 97, 3, 83, 68, 62, 78, 87, 86, 42, 74, 27, 149]);

(RUN ? it : it.skip)('iii100f descent verification for 1754 hits', { timeout: 1_200_000 }, async () => {
  const jpt = new Uint16Array(readFileSync(`${OUT}/js-pretrack.typ`).buffer, 0, N);
  const jpa = new Uint8Array(readFileSync(`${OUT}/js-pretrack.act`).buffer, 0, N);
  const typeAt = (x: number, y: number): number => (jpa[y * W + x] & 1) ? (SOLID.length > jpt[y * W + x]! ? jpt[y * W + x]! : 0) : 0;
  const solidAt = (x: number, y: number): boolean => (jpa[y * W + x] & 1) !== 0 && SOLID[typeAt(x, y)] === 1;
  const isLocationInvalid = (x: number, y: number): boolean => {
    if (y > 1000 || x < 5 || y < 460 || x > 4195) return true;   // h-200=1000, ws≈460
    const t = typeAt(x, y);
    if (INVALID_TILES.has(t)) return true;
    return false;
  };
  const calcState = (x: number, y: number): number => {
    for (let i = 0; i < 6; i++) if (isLocationInvalid(x, y - i)) return 2;   // Invalid
    for (let k = 0; k < 6; k++) if (solidAt(x, y - k)) return 1;             // Obstructed
    return 0;                                                                 // Available
  };
  const descend = (oy: number): number => {
    let y = oy;
    for (let guard = 0; guard < 800; guard++) {
      const st = calcState(1754, y);
      if (st === 1) { y--; return y; }       // obstructed → back 1
      if (st === 2) return -999;             // invalid → fail
      y++;
    }
    return -999;
  };
  // 读命中清单
  const hits: Array<{ c: number; k: number; oy: number }> = [];
  for (const line of readFileSync(`${OUT}/scan1754.txt`, 'utf8').split('\n')) {
    const m = /HIT C=(-?\d+) attempt#(\d+) ox=1754 oy=(\d+)/.exec(line);
    if (m) hits.push({ c: Number(m[1]), k: Number(m[2]), oy: Number(m[3]) });
  }
  const lines: string[] = [];
  lines.push(`hits=${hits.length}; descent→558 verification:`);
  const verified: Array<{ c: number; k: number; oy: number; p1754: number }> = [];
  for (const h of hits) {
    const fin = descend(h.oy);
    if (fin === 558) {
      const p1754 = 1267454 + h.c + 2 * h.k;
      verified.push({ ...h, p1754 });
      lines.push(`  OK C=${h.c} k=${h.k} oy=${h.oy} descend→${fin} P1754=${p1754} C*候选=P1754−A0−2k' (k'∈[0..260])`);
    } else {
      lines.push(`  .. C=${h.c} k=${h.k} oy=${h.oy} descend→${fin}`);
    }
  }
  lines.push(`verified=${verified.length}`);
  writeFileSync(`${OUT}/descent1754.txt`, lines.join('\n') + '\n');
});
