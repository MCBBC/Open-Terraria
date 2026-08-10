// 行走帧前倾分析：帧 N 的头部带质心 vs 身体带质心水平偏移
// 身体前倾侧 = 面朝方向（头向后仰、躯干前倾）
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const FH = 56; // 城镇 NPC 帧高
function centroid(png, y0, y1) {
  const { width: w, data } = png;
  let sx = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 100) { sx += x; n++; }
  }
  return n ? sx / n : -1;
}
for (const id of [17, 18, 22]) {
  const png = PNG.sync.read(readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_${id}.png`));
  const frame = 3; // 行走帧
  const yBase = frame * FH;
  const head = centroid(png, yBase + 2, yBase + 14);
  const body = centroid(png, yBase + 20, yBase + 34);
  const legs = centroid(png, yBase + 42, yBase + 52);
  console.log(`NPC_${id} 帧${frame}: 头=${head.toFixed(1)} 躯干=${body.toFixed(1)} 腿=${legs.toFixed(1)} → 躯干相对头偏${body - head > 0 ? '右' : '左'}`);
}
