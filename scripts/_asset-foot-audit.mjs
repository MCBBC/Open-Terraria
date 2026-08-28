// 资产端脚底行审计（用户报：NPC 碰撞盒偏上/视觉沉降）：
// 对 NPC_22.png(原版帧条) 与 Guide_Default.png(TownNPC profile 变体表) 逐帧测
// 「非透明像素最低行 F」「最高行 H」，与 repo drawTownNPC 的推导式对比：
//   vanilla: 绘制中心 = 盒中心(+num47,Guide=0) → 视觉脚底 y = cy - frameH/2 + F
//            站立地面盒底 = cy + boxH/2 → 脚底相对盒底 = F - frameH/2 - boxH/2
//   合法取值应为 0（脚踩盒底）;正值=视觉沉降进地。
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const scanFrame = (png, sx, sy, sw, sh) => {
  let top = -1, bottom = -1;
  for (let y = sy; y < sy + sh; y++) {
    let rowHas = false;
    for (let x = sx; x < sx + sw; x++) {
      const idx = (png.width * y + x) << 2;
      if (png.data[idx + 3] > 16) { rowHas = true; break; }
    }
    if (rowHas) { if (top < 0) top = y - sy; bottom = y - sy; }
  }
  return { top, bottom };
};

const scanFrame = (png, sx, sy, sw, sh) => {
  let top = -1, bottom = -1;
  for (let y = sy; y < sy + sh; y++) {
    let rowHas = false;
    for (let x = sx; x < sx + sw; x++) {
      const idx = (png.width * y + x) << 2;
      if (png.data[idx + 3] > 16) { rowHas = true; break; }
    }
    if (rowHas) { if (top < 0) top = y - sy; bottom = y - sy; }
  }
  return { top, bottom };
};
for (const file of ['public/sprites/vanilla/NPC_22.png', 'public/sprites/vanilla/Guide_Default.png']) {
  const png = PNG.sync.read(readFileSync(file));
  const FH = png.height / 26;
  console.log(`\n== ${file}: ${png.width}x${png.height} 帧高=${FH}`);
  const perFrame = [];
  for (let f = 0; f < 10 && f < 26; f++) {
    const r = scanFrame(png, 0, Math.round(f * FH), png.width, Math.round(FH));
    // 盒：y 中心对齐后盒高 40 → 脚底应落帧内行 = FH/2 + 20（=48 当 FH=56）
    perFrame.push({ f, top: r.top, bottom: r.bottom, feetVsBoxBottom: r.bottom - (FH / 2 + 20) });
  }
  console.log(JSON.stringify(perFrame));
}
