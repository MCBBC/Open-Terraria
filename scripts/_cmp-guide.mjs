import { PROJECT_ROOT, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const a = PNG.sync.read(readFileSync(join(PROJECT_ROOT, 'terraria-assets/Images/NPC_22.png')));
const b = PNG.sync.read(readFileSync(join(PROJECT_ROOT, 'terraria-assets/Images/TownNPCs/Guide_Default.png')));
let diff = 0;
for (let i = 0; i < a.data.length; i += 4) {
  if (Math.abs(a.data[i] - b.data[i]) > 8 || Math.abs(a.data[i + 3] - b.data[i + 3]) > 8) diff++;
}
console.log('差异像素:', diff, '/', a.data.length / 4, diff === 0 ? '→ 两贴图完全相同' : '→ 内容不同');
// 面朝判定（下巴突出测试，帧 0）：两贴图分别测
const chinSide = (png) => {
  const { width: w, data } = png;
  const rows = (y) => { let l = 99, r = -1; for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 100) { l = Math.min(l, x); r = Math.max(r, x); } return r >= 0 ? [l, r] : null; };
  let fl = 99, fr = -1, cl = 99, cr = -1;
  for (let y = 4; y <= 8; y++) { const t = rows(y); if (t) { fl = Math.min(fl, t[0]); fr = Math.max(fr, t[1]); } }
  for (let y = 12; y <= 17; y++) { const t = rows(y); if (t) { cl = Math.min(cl, t[0]); cr = Math.max(cr, t[1]); } }
  const dL = fl - cl, dR = cr - fr; // 下巴比额头多伸出的量
  return { dL, dR, face: dR > dL ? '右' : '左' };
};
console.log('NPC_22(遗留):', JSON.stringify(chinSide(a)));
console.log('Guide_Default(现行):', JSON.stringify(chinSide(b)));
