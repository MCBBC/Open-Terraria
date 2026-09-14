import { PNG } from 'pngjs';
import fs from 'node:fs';
const [file, out] = process.argv.slice(2, 4);
const CAML = 55910.3, CAMT = 6100.85, Z = 2;
const png = PNG.sync.read(fs.readFileSync(file));
const crop = (tx0, tx1, wy0, wy1) => {
  const x0 = Math.round((tx0 * 16 - CAML) * Z), y0 = Math.round((wy0 - CAMT) * Z);
  const w = Math.round((tx1 * 16 - tx0 * 16) * Z), h = Math.round((wy1 - wy0) * Z);
  const c = new PNG({ width: w * 6, height: h * 6 });
  for (let y = 0; y < h * 6; y++) for (let x = 0; x < w * 6; x++) {
    const si = ((y0 + Math.floor(y / 6)) * png.width + x0 + Math.floor(x / 6)) * 4, di = (y * c.width + x) * 4;
    c.data[di] = png.data[si]; c.data[di+1] = png.data[si+1]; c.data[di+2] = png.data[si+2]; c.data[di+3] = 255;
  }
  fs.writeFileSync(out, PNG.sync.write(c));
};
crop(3504, 3524, 6298, 6326);
console.log('wrote', out);
