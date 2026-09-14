// Liquid_0 / LiquidSlope_0 顶行像素(亮边溯源)
import { PNG } from 'pngjs';
import fs from 'node:fs';
const dump = (p, rows, cols) => {
  const png = PNG.sync.read(fs.readFileSync(p));
  console.log(p.split('/').pop(), png.width + 'x' + png.height);
  for (let y = 0; y < rows; y++) {
    let line = `y${String(y).padStart(2)}: `;
    for (let x = 0; x < Math.min(cols, png.width); x++) {
      const i = (y * png.width + x) * 4;
      line += `(${png.data[i]},${png.data[i+1]},${png.data[i+2]},${png.data[i+3]}) `;
    }
    console.log(line);
  }
};
dump('public/sprites/vanilla/Liquid_0.png', 8, 16);
dump('public/sprites/vanilla/Misc_water_0.png'.replace('Misc_water_0', 'LiquidSlope_0'), 4, 18);
