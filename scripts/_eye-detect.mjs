// 瞳孔检测：头部带内最暗像素的位置（眼在面朝侧）+ 头发团块侧（背侧）
import { PROJECT_ROOT } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const FH = 56;
for (const id of [17, 18, 22]) {
  const png = PNG.sync.read(readFileSync(`${PROJECT_ROOT}/terraria-assets/Images/NPC_${id}.png`));
  const { width: w, data } = png;
  const y0 = 0 * FH; // 帧 0 站立
  // 眼部带：头中下部（约 y+6..y+12）
  let darkest = null;
  for (let y = y0 + 6; y < y0 + 13; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 100) continue;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (darkest === null || lum < darkest.lum) darkest = { lum, x, y };
    }
  }
  // 头顶头发带质心
  let sx = 0, n = 0;
  for (let y = y0 + 0; y < y0 + 6; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 100) { sx += x; n++; }
  }
  const hair = n ? sx / n : -1;
  console.log(`NPC_${id}: 帧0 最暗点(瞳孔?) x=${darkest?.x} lum=${darkest?.lum?.toFixed(0)} 头顶带质心=${hair.toFixed(1)} w=${w} → 瞳孔偏${darkest && hair > 0 ? (darkest.x > hair ? '右(前)' : '左(前)') : '?'} 发团偏${hair > w / 2 ? '右(背)' : '左(背)'}`);
}
