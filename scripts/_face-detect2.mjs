import { PROJECT_ROOT } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
for (const id of [3, 17, 18, 22]) {
  const png = PNG.sync.read(readFileSync(`${PROJECT_ROOT}/terraria-assets/Images/NPC_${id}.png`));
  const { width: w, height: h, data } = png;
  const bandH = Math.min(16, h);
  let left = w, right = 0;
  for (let y = 0; y < bandH; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 100) { if (x < left) left = x; if (x > right) right = x; }
    }
  }
  const spanL = left, spanR = w - 1 - right;
  console.log('NPC_' + id, 'head left=' + left, 'right=' + right, 'protrude L=' + spanL + ' R=' + spanR, 'face-' + (spanL < spanR ? 'LEFT' : 'RIGHT'));
}
