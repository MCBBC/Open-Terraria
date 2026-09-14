// 精确锚版:逐列亮带/水体 y 剖面,camL/camT 从 _waveCss 实测(55910.3/6100.85, cssZoom2)
import { PNG } from 'pngjs';
import fs from 'node:fs';
const png = PNG.sync.read(fs.readFileSync(process.argv[2] ?? '/tmp/iii256-out/repro-full.png'));
const { width, height, data } = png;
const CAML = 55910.3, CAMT = 6100.85, Z = 2;
const near = (x, y, c, tol) => {
  const i = (y * width + x) * 4;
  return Math.abs(data[i] - c[0]) <= tol && Math.abs(data[i+1] - c[1]) <= tol && Math.abs(data[i+2] - c[2]) <= tol;
};
const LIGHT = [147, 177, 253], BODY = [9, 61, 191], MID = [51, 107, 249], WHITE = [218, 236, 242];
// 每 tile:左/中/右 3 列采样,输出各行归属
for (let tx = 3505; tx <= 3524; tx++) {
  const xL = Math.round((tx * 16 - CAML) * Z) + 2;
  const xM = Math.round((tx * 16 - CAML) * Z) + 15;
  const xR = Math.round((tx * 16 - CAML) * Z) + 29;
  let line = `tx${tx}: `;
  for (const [tag, x] of [['L', xL], ['M', xM], ['R', xR]]) {
    let sig = `${tag}:`;
    for (let y = 395; y < 425; y++) {
      const w = near(x, y, WHITE, 10) ? 'W' : near(x, y, LIGHT, 8) ? 'l' : near(x, y, MID, 8) ? 'm' : near(x, y, BODY, 8) ? 'b' : '.';
      sig += w;
    }
    line += sig + ' ';
  }
  console.log(line);
}
console.log('rows = device y395..424 (waterline ≈ y406-408); W=白 l=亮带 m=中 b=体 .=无');
