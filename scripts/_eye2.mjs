import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const FH = 56;
for (const id of [17, 18, 22]) {
  const png = PNG.sync.read(readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_${id}.png`));
  const { width: w, data } = png;
  const y0 = 0;
  // 头部整体带 4..20：列直方图 → 左右两半质量
  let L = 0, R = 0, darkXs = [];
  for (let y = y0 + 4; y < y0 + 20; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 100) continue;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (x < w / 2) L++; else R++;
      if (lum < 60) darkXs.push(x);
    }
  }
  const darkMean = darkXs.length ? darkXs.reduce((a, b) => a + b, 0) / darkXs.length : -1;
  console.log(`NPC_${id}: 头部 左半质量=${L} 右半质量=${R} (${L > R ? '左重' : '右重'}) 暗点均值x=${darkMean.toFixed(1)}`);
}
