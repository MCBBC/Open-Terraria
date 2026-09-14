// 裁剪 slope1(3507..3510)与 slope2(3519..3522)水域过渡区,6x 放大
import { PNG } from 'pngjs';
import fs from 'node:fs';
const png = PNG.sync.read(fs.readFileSync('/tmp/iii256-out/repro-full.png'));
const CAML = 55910.3, CAMT = 6100.85, Z = 2;
const crop = (tx0, tx1, wy0, wy1, out) => {
  const x0 = Math.round((tx0 * 16 - CAML) * Z), y0 = Math.round((wy0 - CAMT) * Z);
  const w = Math.round((tx1 * 16 - tx0 * 16) * Z), h = Math.round((wy1 - wy0) * Z);
  const c = new PNG({ width: w * 6, height: h * 6 });
  for (let y = 0; y < h * 6; y++) {
    for (let x = 0; x < w * 6; x++) {
      const sx = x0 + Math.floor(x / 6), sy = y0 + Math.floor(y / 6);
      const si = (sy * png.width + sx) * 4, di = (y * c.width + x) * 4;
      c.data[di] = png.data[si]; c.data[di+1] = png.data[si+1]; c.data[di+2] = png.data[si+2]; c.data[di+3] = 255;
    }
  }
  fs.writeFileSync(out, PNG.sync.write(c));
  console.log('wrote', out, w + 'x' + h, 'src');
};
crop(3506, 3511, 6300, 6324, '/tmp/iii256-out/crop-slope1-6x.png');
crop(3518, 3523, 6300, 6324, '/tmp/iii256-out/crop-slope2-6x.png');
crop(3516, 3519, 6300, 6324, '/tmp/iii256-out/crop-half-6x.png');
