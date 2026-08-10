import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
function metrics(path, FH, frame = 0) {
  const png = PNG.sync.read(readFileSync(path));
  const { width: w, data } = png;
  const y0 = frame * FH;
  const rows = (y) => {
    let l = 99, r = -1;
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * w + x) * 4;
      if (i + 3 < data.length && data[i + 3] > 100) { l = Math.min(l, x); r = Math.max(r, x); }
    }
    return r >= 0 ? [l, r] : null;
  };
  let fl = 99, fr = -1, cl = 99, cr = -1;
  for (let y = 4; y <= 8; y++) { const t = rows(y); if (t) { fl = Math.min(fl, t[0]); fr = Math.max(fr, t[1]); } }
  for (let y = 12; y <= 17; y++) { const t = rows(y); if (t) { cl = Math.min(cl, t[0]); cr = Math.max(cr, t[1]); } }
  return { dL: fl - cl, dR: cr - fr, face: cr - fr > fl - cl ? '右' : '左', w };
}
// Player_0_0（肤色变体 0 皮肤 0）：原版玩家贴图必然朝右（direction==-1 才翻转）
console.log('Player_0_0(校准:已知朝右):', JSON.stringify(metrics('/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/Player_0_0.png', 56)));
console.log('Guide NPC_22:', JSON.stringify(metrics('/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_22.png', 56)));
console.log('Merchant 17:', JSON.stringify(metrics('/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_17.png', 56)));
console.log('Nurse 18:', JSON.stringify(metrics('/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_18.png', 56)));
console.log('OldMan 37:', JSON.stringify(metrics('/Users/vinlic/Project/GLM/SandboxWorld/terraria-assets/Images/NPC_37.png', 56)));
