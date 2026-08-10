// 分析 NPC 贴图条首帧的"脸部偏侧"：上半身行的水平质心偏向哪边 = 面朝哪边
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
for (const id of [3, 17, 18, 22, 67]) {
  const png = PNG.sync.read(readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_${id}.png`));
  const { width: w, height: h, data } = png;
  // 取首帧（高度整条的第 0 帧；帧高未知→取整条顶部 1/4 行带分析）
  const bandH = Math.min(h, 20);
  let sumX = 0, n = 0;
  for (let y = 0; y < bandH; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 100) { sumX += x; n++; }
    }
  }
  const centroid = n ? sumX / n : w / 2;
  console.log(`NPC_${id}: w=${w} band质心=${centroid.toFixed(1)} (左偏=${centroid < w/2 ? '是' : '否'})`);
}
