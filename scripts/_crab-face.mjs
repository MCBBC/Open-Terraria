import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
// NPC_67 蟹：帧高 34。分析帧 0 前腿/钳子伸出侧（下部行的左右伸出长度）
const png = PNG.sync.read(readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_67.png'));
const { width: w, data } = png;
const FH = 34;
// 帧的前腿带（底部 10 行）
let left = w, right = 0, n = 0, sx = 0;
for (let y = FH - 12; y < FH; y++) {
  for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 100) { if (x < left) left = x; if (x > right) right = x; n++; sx += x; }
  }
}
console.log('蟹帧0 前腿带: 左缘=' + left + ' 右缘=' + right + ' 质心=' + (n ? (sx / n).toFixed(1) : '?') + ' → 伸出 L=' + left + ' R=' + (w - 1 - right) + ' → 面朝' + (left < w - 1 - right ? '左' : '右'));
