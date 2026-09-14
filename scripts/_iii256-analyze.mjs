// 精确剖析 repro-full.png 水线行颜色(标定用)
import { PNG } from 'pngjs';
import fs from 'node:fs';
const png = PNG.sync.read(fs.readFileSync('/tmp/iii256-out/repro-full.png'));
const { width, height, data } = png;
// camL=55952, camT=6104, zoom*dpr=2
const w2s = (wx, wy) => [Math.round((wx - 55952) * 2), Math.round((wy - 6104) * 2)];
const px = (x, y) => { const i = (y * width + x) * 4; return [data[i], data[i+1], data[i+2]]; };
// 每 tile 中心列,水线附近 y=398..410 打印颜色
for (let tx = 3505; tx <= 3524; tx++) {
  const [sx] = w2s(tx * 16 + 8, 0);
  let row = `tx${tx} x${sx}: `;
  for (let wy = 393 * 16 + 12; wy <= 394 * 16 + 12; wy += 2) {
    const [, sy] = w2s(0, wy);
    const [r, g, b] = px(sx, sy);
    row += `y${wy & 15}:(${r},${g},${b}) `;
  }
  console.log(row);
}
console.log('--- 水线行 y=6304..6312 每 tile 8 列采样 ---');
for (let tx = 3505; tx <= 3524; tx++) {
  const [sx0] = w2s(tx * 16, 0);
  let row = `tx${tx}: `;
  for (let dy = 0; dy <= 8; dy += 2) {
    const [r, g, b] = px(sx0 + 8, 400 + dy);
    row += `d${dy}:(${r},${g},${b}) `;
  }
  console.log(row);
}
