// SW-BJ11: 逐贴图帧内容界测量 —— Armor_Head/Armor/legs row0 与 Player_0_0 row0
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
function bounds(file, fy = 0, fh = 56) {
  const png = PNG.sync.read(readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/game/public/sprites/vanilla/${file}`));
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  for (let y = fy; y < Math.min(fy + fh, png.height); y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        const ly = y - fy;
        if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
      }
    }
  }
  return `${file} r0: x[${minX}-${maxX}] y[${minY}-${maxY}]`;
}
for (const f of ['Armor_Head_1.png', 'Armor_Head_3.png', 'Player_0_0.png', 'Player_0_1.png', 'Player_0_2.png', 'Player_Hair_2.png', 'Player_Hair_9.png'])
  console.log(bounds(f));
// 复合甲 3 号:躯干格(0,0)与后肩(1,1)/前肩(0,1)/前臂格(2,0)
function cellBounds(file, cx, cy) {
  const png = PNG.sync.read(readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/game/public/sprites/vanilla/${file}`));
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  for (let y = cy * 56; y < (cy + 1) * 56; y++) {
    for (let x = cx * 40; x < (cx + 1) * 40; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 24) {
        const lx = x - cx * 40, ly = y - cy * 56;
        if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
      }
    }
  }
  return `${file} cell(${cx},${cy}): x[${minX}-${maxX}] y[${minY}-${maxY}]`;
}
for (const [f, cx, cy] of [['Armor_Armor_3.png', 0, 0], ['Armor_Armor_3.png', 1, 1], ['Armor_Armor_3.png', 2, 0], ['Player_0_3.png', 0, 0], ['Player_0_4.png', 1, 1]])
  console.log(cellBounds(f, cx, cy));
