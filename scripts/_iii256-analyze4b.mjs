// 参数化版逐 tile 水线剖面(任意截图)
import { PNG } from 'pngjs';
import fs from 'node:fs';
const file = process.argv[2], camL = Number(process.argv[3]), camT = Number(process.argv[4]);
const png = PNG.sync.read(fs.readFileSync(file));
const { width, height, data } = png;
const Z = 2;
const near = (x, y, c, tol) => {
  const i = (y * width + x) * 4;
  return Math.abs(data[i] - c[0]) <= tol && Math.abs(data[i+1] - c[1]) <= tol && Math.abs(data[i+2] - c[2]) <= tol;
};
const LIGHT = [147, 177, 253], BODY = [9, 61, 191], MID = [51, 107, 249];
for (let tx = 3505; tx <= 3524; tx++) {
  const xL = Math.round((tx * 16 - camL) * Z) + 2;
  const xM = Math.round((tx * 16 - camL) * Z) + 15;
  const xR = Math.round((tx * 16 - camL) * Z) + 29;
  let line = `tx${tx}: `;
  for (const [tag, x] of [['L', xL], ['M', xM], ['R', xR]]) {
    let sig = `${tag}:`;
    for (let y = 395; y < 425; y++) {
      const w = near(x, y, LIGHT, 8) ? 'l' : near(x, y, MID, 8) ? 'm' : near(x, y, BODY, 8) ? 'b' : '.';
      sig += w;
    }
    line += sig + ' ';
  }
  console.log(line);
}
