// 一次性：#29 dump 侧黑檀石足迹/暗影球(31)锚点提取 vs JS 重放侧——runner 集合对拍。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const load = (idx: number, ext: string, name: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const t28 = new Uint16Array(load(28, 'typ', 'Underworld').buffer.slice(0));
const a28 = RUN ? load(28, 'act', 'Underworld') : Buffer.alloc(0);   // ★套件门(2026-09-02):RUN=0 不读夹具
const w28 = new Uint16Array(load(28, 'wal', 'Underworld').buffer.slice(0));
const t29 = new Uint16Array(load(29, 'typ', 'Corruption').buffer.slice(0));
const a29 = RUN ? load(29, 'act', 'Corruption') : Buffer.alloc(0);
const w29 = new Uint16Array(load(29, 'wal', 'Corruption').buffer.slice(0));

(RUN ? it : it.skip)('vanilla corruption footprint + orbs', () => {
  // 1) 暗影球：dump029 中 type==31 且 dump028 非 31 的 2×2 块（runner 终点=挖尽头）
  const orbs: string[] = [];
  for (let y = 200; y < 500; y++) {
    for (let x = 600; x < 1300; x++) {
      const i = y * W + x;
      if (t29[i] === 31 && t28[i] !== 31 && (x === 600 || t29[i - 1] !== 31 || t28[i - 1] === 31)) {
        orbs.push(`(${x},${y})`);
      }
    }
  }
  console.log(`vanilla 新 31 球格: ${orbs.length} @`, orbs.join(' '));
  // 2) 每列挖空/墙3/ebonstone25 足迹（y 194..700）
  const prof: string[] = [];
  for (let x = 640; x < 1260; x++) {
    let dug = 0, w3 = 0, eb = 0, topDug = -1, topW3 = -1;
    for (let y = 194; y < 700; y++) {
      const i = y * W + x;
      if (a28[i] && !a29[i]) { dug++; if (topDug < 0) topDug = y; }
      if (w29[i] === 3 && w28[i] !== 3) { w3++; if (topW3 < 0) topW3 = y; }
      if (t29[i] === 25 && t28[i] !== 25) eb++;
    }
    if (dug + w3 + eb > 0) prof.push(`${x}:d${dug}/w${w3}/e${eb}${topDug >= 0 ? `/td${topDug}` : ''}${topW3 >= 0 ? `/tw${topW3}` : ''}`);
  }
  console.log('van 列剖(y194-700):');
  for (let k = 0; k < prof.length; k += 10) console.log('  ' + prof.slice(k, k + 10).join(' '));
}, 240000);
