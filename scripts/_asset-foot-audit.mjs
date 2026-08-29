// 资产端「美术脚底 vs 碰撞盒底」审计（用户报：NPC/小动物沉降、EoW 盒错位）
// 公式：repo draw = 帧中心钉盒中心(+addYT,guide/bunny/EoW 均无表项=0) →
//   美术脚底相对盒底 = (F_bottom_ex - frameH/2) - boxH/2 ；vanilla 同式同资产 → 相等即 1:1。
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const vf = JSON.parse(readFileSync('public/sprites/vanilla-npcs.json', 'utf8'));
const scan = (png, sy, sh) => {
  let top = -1, bottom = -1;
  for (let y = sy; y < sy + sh; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      if (png.data[idx + 3] > 16) { if (top < 0) top = y - sy; bottom = y - sy; break; }
    }
  }
  return { top, bottom };
};
for (const vid of ['22', '208', '46', '13', '6']) {
  const m = vf[vid];
  if (!m) continue;
  const file = `public/sprites/vanilla/NPC_${vid}.png`;
  let png;
  try { png = PNG.sync.read(readFileSync(file)); } catch { console.log(vid, 'no sheet'); continue; }
  const frames = m.frames ?? 1;
  const fh = png.height / frames;
  const boxH = m.height, boxW = m.width;
  const rows = [];
  for (const f of [0, Math.floor(frames / 2)]) {
    const r = scan(png, Math.round(f * fh), Math.round(fh));
    const feetBelowBox = (r.bottom + 1) - (fh / 2 + boxH / 2);   // 脚底行(exclusive) − 盒底线
    rows.push({ f, headTop: r.top, artBottomEx: r.bottom + 1, feetBelowBox });
  }
  console.log(`NPC_${vid} [${m.name}] ${png.width}x${png.height}/${frames}=帧高${fh} 盒${boxW}x${boxH}`, JSON.stringify(rows));
}
