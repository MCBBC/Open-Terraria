// IIII198: iamerror 链 x86 杀罐格规则普查——每个被杀罐格按局部模式分类
// (残形窗/支撑缺/上格液体/2x2 完整),定位 kill 规则。
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198RULE=1 npx vitest run tools/_iii198rule.test.ts
const RUN = process.env.SW_I198RULE === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';

const D4 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/104_Remove_Broken_Traps`;
const D5 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/105_Final_Cleanup`;
const W = 4200, H = 1200, N = W * H;

it('iii198 kill rule census', () => {
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const rdu8 = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  const t4 = rd16(`${D4}.typ`), a4 = rdu8(`${D4}.act`), l4 = rd16(`${D4}.liq`), w4 = rd16(`${D4}.wal`);
  const t5 = rd16(`${D5}.typ`), a5 = rdu8(`${D5}.act`);

  const act = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H) ? (a4[y * W + x] & 1) : 0;
  const typ = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H) ? t4[y * W + x] : -1;
  const liq = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H) ? l4[y * W + x] : 0;

  // 残形检测:罐格 (x,y) 所在 4 个可能的 2×2 锚窗中,是否存在全 4 格 t28 活性窗
  const inWholePot = (x: number, y: number): boolean => {
    for (const dx of [-1, 0]) for (const dy of [-1, 0]) {
      let full = true;
      for (let k = 0; k < 2 && full; k++) for (let l = 0; l < 2; l++) {
        if (!act(x + dx + k, y + dy + l) || typ(x + dx + k, y + dy + l) !== 28) { full = false; break; }
      }
      if (full) return true;
    }
    return false;
  };
  // 支撑(正下方)是否缺:下方格非活性 或 非主流实心(近似表)
  const notSolidish = (x: number, y: number): boolean => {
    if (!act(x, y)) return true;
    const t = typ(x, y);
    return ![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 22, 23, 25, 30, 38, 39, 40, 41, 43, 44, 45, 46, 47, 48, 53, 56, 57, 59, 60, 63, 64, 66, 67, 69, 70, 75, 76, 87, 99, 112, 116, 117, 125, 126, 140, 147, 151, 152, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 182, 183, 184, 199, 200, 201, 202, 203, 204, 224, 225, 229, 230, 231, 234, 236, 237, 238, 239, 240, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 331, 333, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700].includes(t) === false;
  };

  const killed: number[] = [];
  for (let i = 0; i < N; i++) if ((a4[i] & 1) && !(a5[i] & 1) && t4[i] === 28) killed.push(i);
  const aliveKept: number[] = [];
  for (let i = 0; i < N; i++) if ((a4[i] & 1) && (a5[i] & 1) && t4[i] === 28) aliveKept.push(i);

  const classify = (i: number) => {
    const x = i % W, y = (i / W) | 0;
    const whole = inWholePot(x, y);
    const supBad = notSolidish(x, y + 1);
    const liqAbove = liq(x, y - 1) > 0;
    const anySupBad = notSolidish(x, y + 1) || notSolidish(x + 1, y + 1) || notSolidish(x - 1, y + 1);
    return `whole=${whole ? 1 : 0} supBad=${supBad ? 1 : 0} liqAbove=${liqAbove ? 1 : 0}`;
  };
  const census = (list: number[], name: string) => {
    const m = new Map<string, number>();
    for (const i of list) { const c = classify(i); m.set(c, (m.get(c) ?? 0) + 1); }
    console.log(`[${name}] ${list.length} 格:`);
    for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${k} × ${v}`);
  };
  census(killed, 'x86杀');
  census(aliveKept.slice(0, 50000), 'x86留(采样5万)');

  // 杀格的几何:同窗(2x2 候选)内同批被杀的邻居数
  const shapes = new Map<number, number>();
  const killedSet = new Set(killed);
  for (const i of killed) {
    const x = i % W, y = (i / W) | 0;
    // 找含 i 的 4 候选窗中被杀格数最多的窗
    let best = 0;
    for (const dx of [-1, 0]) for (const dy of [-1, 0]) {
      let n = 0;
      for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) {
        const q = (y + dy + l) * W + (x + dx + k);
        if (killedSet.has(q)) n++;
      }
      if (n > best) best = n;
    }
    shapes.set(best, (shapes.get(best) ?? 0) + 1);
  }
  console.log(`[x86杀] 最佳窗内同杀数分布: ${[...shapes.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}格×${v}`).join(' ')}`);
}, 600_000);
