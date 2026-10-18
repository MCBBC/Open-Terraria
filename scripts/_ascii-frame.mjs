import { PROJECT_ROOT, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const png = PNG.sync.read(readFileSync(join(PROJECT_ROOT, 'terraria-assets/Images/NPC_22.png')));
const { width: w, data } = png;
const FH = 56;
// 帧 2（行走第一帧）与帧 8：输出 2x2 采样 ASCII（# 实心 . 空）
const render = (frame) => {
  const y0 = frame * FH;
  for (let y = 0; y < FH; y += 2) {
    let line = '';
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * w + x) * 4;
      const a = data[i + 3];
      line += a > 100 ? (x % 2 === 0 ? '#' : '#') : ' ';
    }
    console.log(String(frame) + '| ' + line);
  }
};
render(2);
console.log('---');
render(8);
