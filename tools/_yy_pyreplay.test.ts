// YYYY 诊断②e：vanilla Pyramid() 精确重放（cs:27816-28120 直译）on golden039
// 对照 vanilla 实际 carve 掩膜（039→045）——重放若吻合则 vanilla 轨迹/掷序权威成立
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
const G2 = '/tmp/sw-slp/g-s22222';
const W = 4200, H = 1200, N = W * H;
it('vanilla pyramid replay', () => {
  const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const g39t = le16(`${G2}/039_Clean_Up_Dirt.typ`), g39a = readFileSync(`${G2}/039_Clean_Up_Dirt.act`);
  const g45t = le16(`${G2}/045_Wet_Jungle.typ`), g45a = readFileSync(`${G2}/045_Wet_Jungle.act`);
  // scratch = golden039
  const T = Uint16Array.from(g39t), A = Uint8Array.from(g39a);
  const rng = new RNG(22222);
  const i = 2686, j = 228, pyramidMinDepth = 75, pyramidMaxDepth = 125, noTunnel = false;
  const num0 = 151;
  const trace: string[] = [];
  const num2 = j - rng.int(0, 6);
  const num3 = rng.int(9, 12);
  let num4 = 1;
  const num5 = j + rng.int(pyramidMinDepth, pyramidMaxDepth - 1);
  trace.push(`draws: num2=${num2} num3=${num3} num5=${num5}`);
  for (let k = num2; k < num5; k++) { for (let l = i - num4; l < i + num4 - 1; l++) { const idx = k * W + l; T[idx] = num0; A[idx] = 1; } num4++; }
  // wall coat（无 wall 通道，跳过——只影响 wall 不影响 carve）
  let num8 = 1;
  if (rng.int(0, 1) === 0) num8 = -1;
  let num9 = i - num3 * num8;
  let num10 = j + num3;
  const num11 = rng.int(5, 7);
  let flag2 = true;
  let num12 = rng.int(20, 29);
  trace.push(`draws: num8=${num8} num11=${num11} num12=${num12} (num9=${num9} num10=${num10})`);
  // stair
  let stairIt = 0;
  while (flag2) {
    flag2 = false; let flag3 = false;
    for (let n13 = num10; n13 <= num10 + num11; n13++) {
      const n14 = num9;
      if (A[(n13 - 1) * W + n14] === 1 && T[(n13 - 1) * W + n14] === 53) flag3 = true;
      if (A[n13 * W + n14] === 1 && T[n13 * W + n14] === num0) { A[n13 * W + n14] = 0; flag2 = true; }
      if (flag3) { T[n13 * W + n14] = 53; A[n13 * W + n14] = 1; }
    }
    num9 -= num8; stairIt++;
  }
  trace.push(`stair iters=${stairIt} num9=${num9}`);
  num9 = i - num3 * num8;
  let flag4 = true, flag5 = false;
  flag2 = true;
  let zigIt = 0;
  const flips: string[] = [];
  while (flag2) {
    for (let n15 = num10; n15 <= num10 + num11; n15++) A[n15 * W + num9] = 0;
    num9 += num8; num10++; num12--;
    if (num10 >= num5 - num11 * 2) num12 = 10;
    if (num12 <= 0) {
      let flag6 = false;
      if (!flag4 && !flag5) {
        if (noTunnel) flag2 = false;
        flag5 = true; flag6 = true;
        const num17 = rng.int(7, 12);
        const num18 = rng.int(23, 27);
        const num19 = num18;
        const num20 = num9;
        let cur = num18;
        while (cur > 0) {
          for (let n21 = num10 - num17 + num11; n21 <= num10 + num11; n21++) {
            if (cur === num19 || cur === 1) { if (n21 >= num10 - num17 + num11 + 2) A[n21 * W + num9] = 0; }
            else if (cur === num19 - 1 || cur === 2 || cur === num19 - 2 || cur === 3) { if (n21 >= num10 - num17 + num11 + 1) A[n21 * W + num9] = 0; }
            else A[n21 * W + num9] = 0;
          }
          cur--; num9 += num8;
        }
        const num22 = num9 - num8;
        const num23 = Math.min(num22, num20), num24 = Math.max(num22, num20);
        let num25 = rng.int(0, 2); if (num25 === 0) num25 = rng.int(0, 2);
        const num26 = rng.int(1, 9);
        for (let n27 = 0; n27 < num26; n27++) { rng.int(num23, num24 - 1); rng.int(16, 18); }
        for (let t4 = 0; t4 < 4; t4++) rng.int(4, 6);
        for (let n28 = num23; n28 <= num24; n28++) rng.int(25, 27);
        flips.push(`ROOM@zig${zigIt} num10=${num10} num17=${num17} num18=${num18} cols[${num23},${num24}] rows[${num10 - num17 + num11},${num10 + num11}]`);
      }
      if (flag4) { flag4 = false; num8 *= -1; num12 = rng.int(15, 19); flips.push(`FLIP4@zig${zigIt} num10=${num10} → num8=${num8} num12=${num12}`); }
      else if (flag6) num12 = rng.int(10, 14);
      else { num8 *= -1; num12 = rng.int(20, 39); flips.push(`FLIP@zig${zigIt} num10=${num10} → num8=${num8} num12=${num12}`); }
    }
    if (num10 >= num5 - num11) flag2 = false;
    zigIt++;
  }
  trace.push(`zig iters=${zigIt}`, ...flips);
  // 出口隧道
  let num29 = rng.int(100, 199);
  let num30 = rng.int(500, 799);
  flag2 = true;
  const num31 = num11;
  num12 = rng.int(10, 49);
  if (num8 === 1) num9 -= num31;
  const num32 = rng.int(5, 9);
  let exitRows = 0;
  const exitStop: string[] = [];
  while (flag2) {
    num29--; num30--; num12--;
    const lo = num9 - num32 - rng.int(0, 1);
    for (let n33 = lo; n33 <= num9 + num31 + num32 + rng.int(0, 1); n33++) {
      const n34 = num10;
      if (n33 >= num9 && n33 <= num9 + num31) { if (n33 >= 0 && n33 < W && n34 < H) A[n34 * W + n33] = 0; }
      else if (n33 >= 0 && n33 < W && n34 < H) { T[n34 * W + n33] = num0; A[n34 * W + n33] = 1; }
    }
    num10++; num9 += num8;
    if (num29 <= 0) {
      flag2 = false;
      for (let n35 = num9 + 1; n35 <= num9 + num31 - 1; n35++) if (n35 >= 0 && n35 < W && num10 < H && A[num10 * W + n35] === 1) flag2 = true;
      if (!flag2) exitStop.push(`num29exhaust@row${num10}`);
    }
    if (num12 < 0) { num12 = rng.int(10, 49); num8 *= -1; }
    if (num30 <= 0) { flag2 = false; exitStop.push(`num30exhaust@row${num10}`); }
    exitRows++;
  }
  trace.push(`exit rows=${exitRows} stop=${exitStop.join(',')} final num10=${num10} num8=${num8}`);
  console.log(trace.join('\n'));
  // 重放 carve 掩膜 vs vanilla 实际（039→045）
  const vc = (idx: number) => (g39a[idx]! === 1 && g39t[idx] !== 151 && g45a[idx]! === 0) || (g39a[idx]! === 1 && g39t[idx] !== 151 && g45t[idx] === 53);
  const rc = (idx: number) => (g39a[idx]! === 1 && g39t[idx] !== 151 && A[idx] === 0) || (g39a[idx]! === 1 && g39t[idx] !== 151 && T[idx] === 53);
  console.log('重放R vs vanilla V（行250-300，列2680-2760）');
  for (let y = 250; y <= 300; y += 1) {
    let row = `${String(y).padStart(5)} `;
    for (let x = 2680; x <= 2760; x++) {
      const idx = y * W + x;
      const v = vc(idx), r = rc(idx);
      row += v && r ? 'B' : v ? 'V' : r ? 'R' : '.';
    }
    console.log(row);
  }
}, 300_000);
