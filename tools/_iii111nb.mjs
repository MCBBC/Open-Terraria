// IIII111 离线邻域对账：dump075/dump076 vs JS replay 产物（tr-before 由 CAP 基座即=dump075）
// 用法：node tools/_iii111nb.mjs <cx,cy> [...]  — 默认两站
import { readFileSync } from 'node:fs';
const G2 = '/tmp/iii80-out/x86-jagged';
const OUT = '/tmp/iii111-out';
const W = 4200, H = 1200, N = W * H;
const le16 = (p) => new Uint16Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).length >> 1);
const u8 = (p) => new Uint8Array(readFileSync(p));
function dump(idx, nm) {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  return {
    t: le16(`${pre}.typ`), a: u8(`${pre}.act`), w: le16(`${pre}.wal`), l: u8(`${pre}.liq`),
    hf: u8(`${pre}.half`), sl: u8(`${pre}.slope`), lt: u8(`${pre}.lty`), ia: u8(`${pre}.inact`),
    fx: le16(`${pre}.frx`), fy: le16(`${pre}.fry`),
  };
}
const D75 = dump(75, 'Place_Fallen_Log');
const D76 = dump(76, 'Traps');
// JS after 态：从 base_*(前)+replay 只跑了内存…没有落盘。改为：读 tr-map-js 推不出态。
// ⇒ 折衷：打印 base(=d75) 与 x86-after(d76)，JS-after 的差异格已在 replay 输出(samples)。
const args = process.argv.slice(2);
const sites = args.length ? args.map((s) => s.split(',').map(Number)) : [[2421, 487], [2373, 738]];
for (const [cx, cy] of sites) {
  console.log(`\n===== site (${cx},${cy}) — 行=y; 每格 [075态→076态] =====`);
  for (let y = cy - 6; y <= cy + 6; y++) {
    let row = '';
    for (let x = cx - 12; x <= cx + 12; x++) {
      const i = y * W + x;
      const f75 = `${D75.a[i] ? D75.t[i] : 0}`;
      const f76 = `${D76.a[i] ? D76.t[i] : 0}`;
      const mark = f75 !== f76 ? '>' : ' ';
      const extra = [];
      // 致动/线（actuator=inact bit1? x86 inact 存致动位；wire 单独通道没 dump，跳过）
      if (D76.ia[i] !== D75.ia[i]) extra.push('I');
      if (mark === '>') row += `<${f75}>${f76}`;
      else row += String(f76).padStart(3);
      row += ' ';
      void extra;
    }
    console.log(`y=${String(y).padStart(4)} ${row}`);
  }
  console.log('半砖/坡 076:');
  for (let y = cy - 3; y <= cy + 3; y++) {
    let hs = '', ss = '';
    for (let x = cx - 12; x <= cx + 12; x++) { const i = y * W + x; hs += D76.hf[i]; ss += D76.sl[i]; }
    console.log(`y=${String(y).padStart(4)} hf=${hs} sl=${ss}`);
  }
  // x86 动作图该处（bit: 1 act+/2 act-/4 typ/8 wal/64 ia）
  const w86 = new Uint8Array(readFileSync(`${OUT}/tr-map-x86.bin`).buffer);
  const acts = [];
  for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 14; x <= cx + 14; x++) {
    const i = y * W + x;
    const b = w86[i];
    if (b) acts.push(`(${x},${y})b${b}`);
  }
  console.log(`x86 动作图±14: ${acts.join(' ') || '(none)'}`);
}
