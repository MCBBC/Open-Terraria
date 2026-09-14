// 逐列 ASCII:亮带/中带/水体存在图 + 分 tile 汇总(x→tile 反推)
import { PNG } from 'pngjs';
import fs from 'node:fs';
const png = PNG.sync.read(fs.readFileSync(process.argv[2] ?? '/tmp/iii256-out/repro-full.png'));
const { width, height, data } = png;
const near = (x, y, c, tol) => {
  const i = (y * width + x) * 4;
  return Math.abs(data[i] - c[0]) <= tol && Math.abs(data[i+1] - c[1]) <= tol && Math.abs(data[i+2] - c[2]) <= tol;
};
const LIGHT = [147, 177, 253], BODY = [9, 61, 191], MID = [51, 107, 249];
// x420..900, y340..470
const X0 = Number(process.argv[3] ?? 420), X1 = Number(process.argv[4] ?? 900);
const lines = { light: [], mid: [], body: [] };
for (let x = X0; x <= X1; x++) {
  let l = '.', m = '.', b = '.';
  for (let y = 340; y < 470; y++) {
    if (l === '.' && near(x, y, LIGHT, 8)) l = 'L';
    if (m === '.' && near(x, y, MID, 8)) m = 'M';
    if (b === '.' && near(x, y, BODY, 8)) b = 'B';
  }
  lines.light.push(l); lines.mid.push(m); lines.body.push(b);
}
const printRows = (name, arr) => {
  console.log(name + ':');
  for (let i = 0; i < arr.length; i += 100) {
    console.log('  x' + String(X0 + i).padStart(4), arr.slice(i, i + 100).join(''));
  }
};
printRows('LIGHT(147,177,253)', lines.light);
printRows('MID(51,107,249)', lines.mid);
printRows('BODY(9,61,191)', lines.body);
// tile 边界标记:x = (tx*16-camL)*2,camL=55952 → tx = x/64 + 3497
console.log('tile ticks: x=448→tx3504, 512→3505, 576→3506, 640→3507, 704→3508, 768→3509, 832→3510 ...');
console.log('每个 x 对应 tx = x/32 + 3497.0? 精确: tx = x/64 + 3497 (device 32px/tile)');
