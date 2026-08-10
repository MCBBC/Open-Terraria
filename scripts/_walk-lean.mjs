// 全行走周期(帧2..N-extra)前倾均值：脚质心-头质心的均值偏移方向 = 面朝方向
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const FH = 56;
function bandCentroid(png, y0, y1) {
  const { width: w, data } = png;
  let sx = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 100) { sx += x; n++; }
  }
  return n ? sx / n : -1;
}
const EXTRA = { 17: 9, 18: 9, 22: 10, 37: 5 };
for (const id of [17, 18, 22]) {
  const png = PNG.sync.read(readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_${id}.png`));
  const total = Math.floor(png.height / FH);
  const walkEnd = total - EXTRA[id];
  let sum = 0, cnt = 0;
  const per = [];
  for (let f = 2; f < walkEnd; f++) {
    const y = f * FH;
    const head = bandCentroid(png, y + 2, y + 14);
    const foot = bandCentroid(png, y + 40, y + 54);
    if (head > 0 && foot > 0) { sum += foot - head; cnt++; per.push((foot - head).toFixed(1)); }
  }
  console.log(`NPC_${id}: 行走周期均值 lean = ${(sum / cnt).toFixed(2)} → 面朝${sum / cnt > 0.5 ? '右' : sum / cnt < -0.5 ? '左' : '中性'} | 逐帧: ${per.join(',')}`);
}
