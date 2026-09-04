// IIII100f 仪③e：双方向 ox∈{1754,2353} 普查 + descent landing ∈[558..600] 验证(ws=361)。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I100FO2 === '1';
const OUT = '/tmp/iii225b-out';
const W = 4200, N = W * 1200;
const SOLID = new Uint8Array(TILE_DEFS.length);
for (let i = 0; i < TILE_DEFS.length; i++) SOLID[i] = TILE_DEFS[i]?.solid ? 1 : 0;
const INVALID_TILES = new Set([383, 384, 15, 304, 30, 321, 245, 246, 240, 241, 242, 16, 34, 158, 377, 94, 10, 19, 86, 219, 484, 190, 664, 665, 41, 43, 44, 226, 237, 711, 712, 713, 714, 715, 716, 379, 314, 141, 411, 21, 467, 88]);
const INVALID_WALLS = new Set([7, 94, 95, 8, 98, 99, 9, 96, 97, 3, 83, 68, 62, 78, 87, 86, 42, 74, 27, 149]);

(RUN ? it : it.skip)('iii100f dual-direction census', { timeout: 1_200_000 }, async () => {
  const jpt = new Uint16Array(readFileSync(`${OUT}/js-pretrack.typ`).buffer, 0, N);
  const jpa = new Uint8Array(readFileSync(`${OUT}/js-pretrack.act`).buffer, 0, N);
  const jwal = new Uint16Array(readFileSync(`${OUT}/js-pretrack.wal`).buffer, 0, N);
  const typeAt = (x: number, y: number): number => (jpa[y * W + x] & 1) ? jpt[y * W + x]! : 0;
  const solidAt = (x: number, y: number): boolean => (jpa[y * W + x] & 1) !== 0 && SOLID[typeAt(x, y)] === 1;
  const isLocInvalid = (x: number, y: number): boolean => {
    if (y > 1000 || x < 5 || y < 361 || x > 4195) return true;
    if (INVALID_TILES.has(typeAt(x, y))) return true;
    if (INVALID_WALLS.has(jwal[y * W + x]!)) return true;
    return false;
  };
  const calcState = (x: number, y: number): number => {
    for (let i = 0; i < 6; i++) if (isLocInvalid(x, y - i)) return 2;
    for (let k = 0; k < 6; k++) if (solidAt(x, y - k)) return 1;
    return 0;
  };
  const descendFinal = (ox: number, oy: number): number => {
    let y = oy;
    for (let g = 0; g < 900; g++) {
      const st = calcState(ox, y);
      if (st === 1) { y--; return calcState(ox, y) === 0 ? y : -998; }
      if (st === 2) return -999;
      y++;
    }
    return -999;
  };
  const seed = 9293480, A0 = 1267454;
  const u = new UnifiedRandom(seed);
  const t0 = A0 - 17900;
  for (let i = 0; i < t0; i++) u.next();
  const r = new RNG(1);
  (r as unknown as { ur: UnifiedRandom }).ur = u;
  const lines: string[] = [];
  for (let a = t0; a < A0 + 800; a += 2) {
    const ox = r.int(10, 4189);
    const oy = r.int(361, 999);
    if (ox === 1754 || ox === 2353) {
      const fin = descendFinal(ox, oy);
      const okLane = fin >= 500 && fin <= 700;
      lines.push(`abs=${a} (C*=${a - A0}) ox=${ox} oy=${oy} descend→${fin}${okLane ? '   ★LANE-TOP-OK' : ''}`);
    }
  }
  writeFileSync(`${OUT}/dual-census.txt`, lines.join('\n') + '\n');
});
