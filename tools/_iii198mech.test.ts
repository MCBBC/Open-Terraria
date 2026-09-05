// IIII198: 用 gen2-g 链的 x86 帧通道(frx/fry)实证 vanilla CheckPot 机制——
// 对每个 104→105 被杀罐格,用 x86 帧复算 CheckPot 锚/完整性/支撑,验证杀块集合。
// 用法：npx vitest run tools/_iii198mech.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';

const D4 = `${process.env.HOME}/GoldenChains/gen2-g/104_Remove_Broken_Traps`;
const D5 = `${process.env.HOME}/GoldenChains/gen2-g/105_Final_Cleanup`;
const W = Number(process.env.SW_I198M_W ?? 4200), H = Number(process.env.SW_I198M_H ?? 1200);
const N = W * H;

it('iii198 x86 pot mechanism (gen2-g frx)', () => {
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const rdu8 = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  const t4 = rd16(`${D4}.typ`), a4 = rdu8(`${D4}.act`), fx4 = rd16(`${D4}.frx`), fy4 = rd16(`${D4}.fry`), sl4 = rdu8(`${D4}.slope`), hf4 = rdu8(`${D4}.half`), ia4 = rdu8(`${D4}.inact`);
  const t5 = rd16(`${D5}.typ`), a5 = rdu8(`${D5}.act`);

  // vanilla SolidTile2(1457:71023): null→true; active&&tileSolid&&(!plat||...)&&slope0&&!half&&!inActive
  const SOLID = new Set<number>();
  for (let v = 0; v < 700; v++) SOLID.add(v);   // 近似:vanilla tileSolid 表巨大,先按"非罐"近似
  // 实际按需:支撑格读 typ,罐28非实心,其余主流实心——用排除表
  const notSolid = new Set([28, 653, 59, 60, 61, 62, 71, 72, 73, 74, 77, 78, 80, 82, 83, 84, 85, 86, 110, 113, 114, 115, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 149, 150, 151, 152, 153, 154, 172, 173, 174, 175, 184, 185, 186, 187, 201, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 218, 219, 220, 226, 227, 228, 229, 230, 231, 232, 233, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 316, 317, 318, 320, 321, 323, 324, 330, 331, 332, 334, 335, 336, 337, 338, 339, 340, 341, 342, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669]);
  const solid2x = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const i = y * W + x;
    if (!(a4[i] & 1)) return false;
    if (notSolid.has(t4[i])) return false;
    return sl4[i] === 0 && hf4[i] === 0 && !(ia4[i]);
  };
  const wrap2 = (v: number) => { let n = Math.floor(v / 18); while (n > 1) n -= 2; return n; };
  const checkPot = (x: number, y: number): { bad: boolean; why: string } => {
    const i = y * W + x;
    const x0 = x - wrap2(fx4[i]);
    let n3 = Math.floor(fy4[i] / 18), num4 = 0;
    while (n3 > 1) { n3 -= 2; num4++; }
    const y0 = y - n3;
    let bad = false; const why: string[] = [];
    for (let k = x0; k < x0 + 2 && !bad; k++) for (let l = y0; l < y0 + 2; l++) {
      const q = l * W + k;
      const ok = (a4[q] & 1) && t4[q] === 28 && wrap2(fx4[q]) === k - x0 && fy4[q] === (l - y0) * 18 + num4 * 36;
      if (!ok) { bad = true; why.push(`cell(${k},${l}) act${a4[q] & 1} t${t4[q]} fxp${wrap2(fx4[q])} fyp${fy4[q]}`); }
    }
    for (let k = x0; k < x0 + 2; k++) if (!solid2x(k, y0 + 2)) { bad = true; why.push(`sup(${k},${y0 + 2}) t${t4[(y0 + 2) * W + k]}a${a4[(y0 + 2) * W + k] & 1}`); }
    return { bad, why: why.join('|') + ` anchor=(${x0},${y0})style${num4}` };
  };

  // 收集 x86 杀的罐格,按 pot 窗口(JS帧不可用→用 x86 帧解码)分组
  const killed: number[] = [];
  for (let i = 0; i < N; i++) if ((a4[i] & 1) && !(a5[i] & 1) && t4[i] === 28) killed.push(i);
  console.log(`[mech] x86 杀罐格=${killed.length}`);
  const seen = new Set<number>();
  let shapes = new Map<number, number>();
  let wholePot = 0, partial = 0;
  const samples: string[] = [];
  for (const i of killed) {
    if (seen.has(i)) continue;
    const x = i % W, y = (i / W) | 0;
    // 用任一成员帧解码整罐窗口(取触发格=(x,y))
    const x0 = x - wrap2(fx4[i]);
    let n3 = Math.floor(fy4[i] / 18), num4 = 0;
    while (n3 > 1) { n3 -= 2; num4++; }
    const y0 = y - n3;
    const cells: Array<[number, number]> = [];
    for (let k = x0; k < x0 + 2; k++) for (let l = y0; l < y0 + 2; l++) cells.push([k, l]);
    let killedN = 0; const det: string[] = [];
    for (const [k, l] of cells) {
      const q = l * W + k;
      seen.add(q);
      const was = (a4[q] & 1) === 1 && t4[q] === 28;
      const now = a5[q] & 1;
      if (was && !now) killedN++;
      det.push(`(${k},${l})${was ? (now ? 'K' : 'k') : '·'}`);
    }
    shapes.set(killedN, (shapes.get(killedN) ?? 0) + 1);
    if (killedN === 4) wholePot++; else partial++;
    if (partial <= 12 && samples.length < 12) {
      const v = checkPot(x, y);
      samples.push(`pot@(${x0}..${x0 + 1},${y0}..${y0 + 1})style${num4} killed=${killedN} [${det.join(' ')}] checkPot(${x},${y}).bad=${v.bad} ${v.why}`);
    }
  }
  console.log(`[mech] 整罐杀=${wholePot} 非整罐=${partial}; kill数分布=${[...shapes.entries()].map(([k, v]) => `${k}格×${v}`).join(' ')}`);
  for (const s of samples) console.log('  ' + s);

  // 反向:x86 没杀但 CheckPot 判坏的罐(支撑残型 type0 计实心的效应)
  let falseBad = 0; const fs: string[] = [];
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x;
    if (!(a4[i] & 1) || t4[i] !== 28 || (a5[i] & 1)) continue;
    const v = checkPot(x, y);
    if (v.bad) { falseBad++; if (fs.length < 8) fs.push(`alive@(${x},${y}) ${v.why}`); }
  }
  console.log(`[mech] x86 末态仍活的罐格中 checkPot(用104态)判坏=${falseBad}`);
  for (const s of fs) console.log('  ' + s);
}, 600_000);
