import { REPO_ROOT } from './_pathlib.mjs';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
function cellBounds(file, cx, cy) {
  let png;
  try { png = PNG.sync.read(readFileSync(`${REPO_ROOT}/public/sprites/vanilla/${file}`)); }
  catch { return `${file}: MISSING`; }
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  for (let y = cy * 56; y < Math.min((cy + 1) * 56, png.height); y++) {
    for (let x = cx * 40; x < Math.min((cx + 1) * 40, png.width); x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 24) {
        const lx = x - cx * 40, ly = y - cy * 56;
        if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
      }
    }
  }
  return minY === 99 ? `${file} cell(${cx},${cy}): EMPTY` : `${file} cell(${cx},${cy}): x[${minX}-${maxX}] y[${minY}-${maxY}]`;
}
// 女躯干表 4_3:cell(0,0) 与 (0,2);男表 0_3 同格对照;女腿 4_10 vs 男 0_10
for (const [f, cx, cy] of [
  ['Player_4_3.png', 0, 0], ['Player_4_3.png', 0, 2],
  ['Player_0_3.png', 0, 0], ['Player_0_3.png', 0, 2],
  ['Player_4_4.png', 0, 2], ['Player_4_6.png', 0, 2],
  ['Player_4_10.png', 0, 0], ['Player_0_10.png', 0, 0],
  ['Player_4_11.png', 0, 0], ['Player_0_11.png', 0, 0],
  ['Player_4_12.png', 0, 0], ['Player_0_12.png', 0, 0],
  ['Player_4_10.png', 0, 1], ['Player_4_10.png', 0, 2],
  ['Player_4_13.png', 0, 0], ['Player_0_13.png', 0, 0],
]) console.log(cellBounds(f, cx, cy));
