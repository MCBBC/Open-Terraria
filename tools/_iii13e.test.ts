// 一次性诊断（III13 批）：notraps 槽末#31 定点残差对拍——
//   J 目录（SW_I13E_J，默认 /tmp/iii13-out/jslot31-fixed）
// vs X 真值 /tmp/rrrr-out/x86-notraps/076_Traps 8 通道。
// 输出：全局 diff 计数 + 本批 62 残差坐标逐一命中表（上游并行车道噪声下隔离本批净效应）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('iii13e targeted residual cmp', () => {
  if (process.env.SW_I13E !== '1') return;
  const W = 4200;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1); };
  const u8 = (p: string) => new Uint8Array(readFileSync(p));
  const J = process.env.SW_I13E_J ?? '/tmp/iii13-out/jslot31-fixed';
  const X = '/tmp/rrrr-out/x86-notraps/076_Traps.';
  const jt = le16(`${J}/type`), xt = le16(`${X}typ`);
  const ja = u8(`${J}/flags`), xa = u8(`${X}act`);
  const jw = le16(`${J}/wall`), xw = le16(`${X}wal`);
  const jh = u8(`${J}/half`), xh = u8(`${X}half`);
  const js2 = u8(`${J}/slope`), xs2 = u8(`${X}slope`);
  // 全局
  let dA = 0, dT = 0, dW = 0, dHf = 0, dSl = 0;
  let firstI = -1;
  for (let i = 0; i < W * 1200; i++) {
    const va = ja[i] ? 1 : 0, vb = xa[i] ? 1 : 0;
    const ta = va ? (SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999) : 0;
    const tb = vb ? xt[i]! : 0;
    if (va !== vb) { dA++; if (firstI < 0) firstI = i; }
    if (ta !== tb) { dT++; if (firstI < 0) firstI = i; }
    if (jw[i] !== xw[i]) { dW++; if (firstI < 0) firstI = i; }
    if (jh[i] !== xh[i]) { dHf++; if (firstI < 0) firstI = i; }
    if (js2[i] !== xs2[i]) { dSl++; if (firstI < 0) firstI = i; }
  }
  console.log(`GLOBAL first=(${firstI >= 0 ? `${firstI % W},${Math.floor(firstI / W)}` : '-'}) A=${dA} T=${dT} W=${dW} Hf=${dHf} Sl=${dSl}`);
  // 定点：本批 62 残差坐标
  const CELLS: Array<[number, number]> = [
    [1597, 367], [1597, 368], [1598, 368],
    [1580, 593], [1581, 593], [1659, 885], [1659, 886], [1660, 886],
    [568, 791], [568, 792], [3959, 535], [3959, 536],
    [3544, 606], [3544, 607], [3545, 606], [3545, 607], [3545, 608],
    [851, 703], [1148, 912], [2452, 799], [2452, 800],
    [103, 786], [195, 555], [324, 914], [404, 601], [457, 682], [498, 535],
    [608, 873], [731, 957], [807, 885], [834, 878], [844, 899], [904, 754],
    [1026, 647], [1123, 858], [1462, 964], [1756, 922], [1946, 583], [2086, 554],
    [2164, 703], [2228, 794], [2408, 609], [2830, 495], [2843, 568], [2846, 933],
    [2923, 544], [2964, 988], [3021, 495], [2994, 777], [3001, 852], [3056, 564],
    [3175, 754], [3259, 574], [3293, 678], [3303, 697], [3328, 940], [3384, 473],
    [3415, 495], [3519, 858], [3631, 681], [3984, 765], [4106, 555],
  ];
  let ok = 0, bad = 0;
  const badList: string[] = [];
  for (const [x, y] of CELLS) {
    const i = y * W + x;
    const va = ja[i] ? 1 : 0, vb = xa[i] ? 1 : 0;
    const ta = va ? (SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999) : 0;
    const tb = vb ? xt[i]! : 0;
    const same = ta === tb && jw[i] === xw[i] && jh[i] === xh[i] && js2[i] === xs2[i];
    if (same) ok++; else {
      bad++;
      badList.push(`(${x},${y}) v${tb}/${vb}/h${xh[i]}s${xs2[i]} j${ta}/${va}/h${jh[i]}s${js2[i]}${jw[i] === xw[i] ? '' : ' wall!'}`);
    }
  }
  console.log(`TARGETED ${ok}/${CELLS.length} aligned ✓ ; mismatched ${bad}:`);
  for (const b of badList) console.log('   ', b);
}, 120_000);
