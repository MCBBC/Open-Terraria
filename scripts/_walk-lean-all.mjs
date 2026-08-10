import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const FH = 56;
const data2 = JSON.parse(readFileSync('public/sprites/vanilla-npcs.json', 'utf8'));
const EXTRA = { 17: 9, 18: 9, 19: 9, 20: 7, 22: 10, 38: 9, 54: 7, 107: 9, 108: 7, 37: 5 };
function walkLean(id) {
  const p = `/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_${id}.png`;
  let png;
  try { png = PNG.sync.read(readFileSync(p)); } catch { return null; }
  const total = Math.floor(png.height / FH);
  const extra = EXTRA[id] ?? 2;
  const bandC = (y0, y1) => {
    const { width: w, data } = png;
    let sx = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 100) { sx += x; n++; }
    }
    return n ? sx / n : -1;
  };
  let sum = 0, cnt = 0;
  for (let f = 2; f < total - extra; f++) {
    const y = f * FH;
    const head = bandC(y + 2, y + 14);
    const foot = bandC(y + 38, y + 54);
    if (head > 0 && foot > 0) { sum += foot - head; cnt++; }
  }
  return cnt ? +(sum / cnt).toFixed(2) : null;
}
// 城镇 NPC（人类行走）+ 若干行走型怪物
for (const id of [17, 18, 19, 20, 22, 38, 54, 107, 108, 37]) {
  console.log(`NPC_${id} ${data2[id]?.name}: lean=${walkLean(id)}`);
}
