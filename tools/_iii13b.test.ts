// 一次性诊断（III13 批）：#76 残差逐格上下文（H 半砖族/S 斜面族/T 类型族的
// 本格+四邻 sheet/帧/半砖/坡），X=/tmp/rrrr-out/x86-notraps（任务指定真值链）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('iii13b residual cell context', () => {
  const W = Number(process.env.SW_III10_W ?? 4200);
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const J = '/tmp/iii10-out/jslot31', X = '/tmp/rrrr-out/x86-notraps/076_Traps';
  const jT = le16(`${J}/type`), xT = le16(`${X}.typ`);
  const jA = readFileSync(`${J}/flags`), xA = readFileSync(`${X}.act`);
  const jW = le16(`${J}/wall`), xW = le16(`${X}.wal`);
  const jH = readFileSync(`${J}/half`), xH = readFileSync(`${X}.half`);
  const jS = readFileSync(`${J}/slope`), xS = readFileSync(`${X}.slope`);
  // frame channels of JS only (X side didn't dump frames)
  const jFX = le16(`${J}/frameX`), jFY = le16(`${J}/frameY`);

  const ctx = (cx: number, cy: number): string => {
    const rows: string[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      let row = '';
      for (let dx = -3; dx <= 3; dx++) {
        const i = cx + dx >= 0 && cx + dx < W ? (cy + dy) * W + (cx + dx) : -1;
        if (i < 0) { row += ' .. '; continue; }
        const sh = jA[i] ? SHEET[jT[i]!] : -1;
        row += String(sh).padStart(4);
      }
      rows.push(`y${cy + dy}: ${row}`);
    }
    return rows.join('\n');
  };
  const show = (cx: number, cy: number) => {
    const i = cy * W + cx;
    console.log(`=== (${cx},${cy})`);
    console.log(`  JS t=${jT[i]}sh${jA[i] ? SHEET[jT[i]!] : '-'} fx=${jFX[i]} fy=${jFY[i]} half=${jH[i]} sl=${jS[i]} wall=${jW[i]} | X t=${xA[i] ? xT[i] : '-'} half=${xH[i]} sl=${xS[i]} wall=${xW[i]}`);
    console.log(ctx(cx, cy));
  };
  // 全部残差格（来自 _iii13a 清单）
  const CELLS: Array<[number, number, string]> = [
    [1597, 367, '485'], [1597, 368, '485'], [1598, 368, '485'],
    [1580, 593, '484'], [1581, 593, '484'], [1659, 885, '484'], [1659, 886, '484'], [1660, 886, '484'],
    [568, 791, '165'], [568, 792, '165'], [3959, 535, '165'], [3959, 536, '165'],
    [3544, 606, '654X'], [3544, 607, '654X'], [3545, 606, '654X'], [3545, 607, '654X'], [3545, 608, 'H'],
    [851, 703, 'S'], [1148, 912, 'S'], [2452, 799, 'Sinv'], [2452, 800, 'H'],
    [103, 786, 'H'], [195, 555, 'H'], [324, 914, 'H'], [404, 601, 'H'], [457, 682, 'H'], [498, 535, 'H'],
    [608, 873, 'H'], [731, 957, 'H'], [807, 885, 'H'], [834, 878, 'H'], [844, 899, 'H'], [904, 754, 'H'],
    [1026, 647, 'H'], [1123, 858, 'H'], [1462, 964, 'H'], [1756, 922, 'H'], [1946, 583, 'H'], [2086, 554, 'H'],
    [2164, 703, 'H'], [2228, 794, 'H'], [2408, 609, 'H'], [2830, 495, 'H'], [2843, 568, 'H'], [2846, 933, 'H'],
    [2923, 544, 'H'], [2964, 988, 'H'], [3021, 495, 'H'], [2994, 777, 'H'], [3001, 852, 'H'], [3056, 564, 'H'],
    [3175, 754, 'H'], [3259, 574, 'H'], [3293, 678, 'H'], [3303, 697, 'H'], [3328, 940, 'H'], [3384, 473, 'H'],
    [3415, 495, 'H'], [3519, 858, 'H'], [3631, 681, 'H'], [3984, 765, 'H'], [4106, 555, 'H'],
  ];
  for (const [x, y, tagk] of CELLS) {
    const i = y * W + x;
    if (tagk === 'H') {
      console.log(`(${x},${y}) T(x86sheet=${xA[i] ? xT[i] : 0}) fx=${jFX[i]} fy=${jFY[i]} half v=${xH[i]} j=${jH[i]} slope v=${xS[i]} j=${jS[i]} wall v=${xW[i]} j=${jW[i]}`);
    } else if (tagk === 'S') {
      show(x, y);
    } else {
      show(x, y);
    }
  }
}, 120_000);
