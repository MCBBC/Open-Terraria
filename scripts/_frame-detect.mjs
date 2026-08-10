import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
for (const id of [67, 602]) {
  const png = PNG.sync.read(readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_${id}.png`));
  const { width: w, height: h, data } = png;
  const rowEmpty = [];
  for (let y = 0; y < h; y++) {
    let any = false;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) { any = true; break; }
    rowEmpty.push(!any);
  }
  const bands = [];
  let s = -1;
  for (let y = 0; y < h; y++) {
    if (rowEmpty[y] && s < 0) s = y;
    if (!rowEmpty[y] && s >= 0) { if (y - s >= 2) bands.push([s, y - 1]); s = -1; }
  }
  console.log(id, 'h=', h, 'bands:', bands.slice(0, 10).map(b => b.join('-')).join(' '));
}
