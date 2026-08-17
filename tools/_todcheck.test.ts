// 一次性（II 批 ①）：LiquidSim.diesIn 对拍 /tmp/sw-ddfin/deathtable.txt（1258 元组 100% 门槛）。
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_OBJECT_DEATH } from '../src/world/liquid/tile-object-death-table';

const rows = readFileSync('/tmp/sw-ddfin/deathtable.txt', 'utf8').trim().split('\n')
  .map((l) => l.split(/\s+/));
const LAVA_GLOB = new Set([630, 631, 571, 579, 591, 538, 544, 629, 550, 551, 533, 553, 554, 555, 556, 558, 559, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 632, 640, 643, 644, 645, 710, 568, 569, 570, 580, 582, 619, 620, 572, 560, 564, 567, 565, 654, 529, 530, 705, 484, 3, 5, 10, 11, 12, 13, 14, 469, 486, 488, 704, 487, 489, 490, 15, 497, 16, 17, 18, 19, 24, 27, 28, 29, 32, 33, 34, 35, 36, 42, 49, 50, 707, 51, 697, 52, 55, 61, 703, 62, 69, 655, 71, 72, 73, 74, 79, 80, 81, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 102, 103, 104, 106, 110, 113, 115, 125, 126, 128, 149, 172, 173, 174, 184, 201, 205, 209, 210, 212, 213, 353, 215, 216, 217, 218, 219, 642, 220, 227, 228, 233, 236, 702, 238, 240, 241, 242, 243, 244, 245, 246, 247, 254, 269, 270, 271, 581, 698, 660, 275, 413, 276, 277, 278, 279, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 532, 316, 317, 318, 319, 354, 355, 699, 499, 323, 335, 338, 339, 528, 636, 352, 382, 425, 453, 456, 463, 464, 465, 485, 511, 510, 547, 548, 552, 573, 621, 622, 623, 624, 700, 656, 701, 493, 395, 520, 471, 405, 406, 452, 457, 454, 494, 387, 386, 388, 389, 646, 372, 639, 668, 324, 427, 390]);
const WATER_GLOB = new Set([215, 4, 51, 697, 93, 98, 552, 405, 646, 372]);

function diesIn(sheet: number, fx: number, fy: number, isLava: boolean): boolean {
  const rec = TILE_OBJECT_DEATH[sheet];
  if (rec === undefined) return isLava ? LAVA_GLOB.has(sheet) : WATER_GLOB.has(sheet);
  const tr = (v: number, d: number) => Math.trunc(v / d);
  const num = tr(fx, rec.fw), num2 = tr(fy, rec.fh);
  const swl = rec.swl === 0 ? 1 : rec.swl;
  const n4 = rec.sh === 1 ? num2 * swl + num : num * swl + num2;
  let style = tr(n4, rec.sm), alt = ((n4 % rec.sm) + rec.sm) % rec.sm;
  if (rec.sls > 1) {
    if (rec.sh === 1) { style = tr(num2, rec.sls) * swl + num; alt = ((num2 % rec.sls) + rec.sls) % rec.sls; }
    else { style = tr(num, rec.sls) * swl + num2; alt = ((num % rec.sls) + rec.sls) % rec.sls; }
  }
  let d: readonly [number, number] | null = rec.d;
  let alts = rec.alts;
  const sub = rec.subs[String(style)];
  if (sub !== undefined) { d = sub.d; alts = sub.alts; }
  for (const a of alts) {
    if (a[0] <= alt && alt <= a[0] + a[1]) { d = [a[2] === null ? -1 : a[2], a[3] === null ? -1 : a[3]]; break; }
  }
  if (d === null || d[isLava ? 0 : 1] === -1) return isLava ? LAVA_GLOB.has(sheet) : WATER_GLOB.has(sheet);
  return d[isLava ? 0 : 1] === 1;
}

it('diesIn mirrors deathtable 1258/1258', () => {
  let ok = 0;
  const bad: string[] = [];
  for (const r of rows) {
    const t = Number(r[0]), fx = Number(r[1]), fy = Number(r[2]);
    const lw = r[3]!;
    const pL = diesIn(t, fx, fy, true), pW = diesIn(t, fx, fy, false);
    if (pL === (lw[0] === '1') && pW === (lw[1] === '1')) ok++;
    else if (bad.length < 5) bad.push(`${r.join(' ')} → ${+pL}${+pW}`);
  }
  console.log(`aligned ${ok}/${rows.length}`);
  expect(ok).toBe(rows.length);
});
