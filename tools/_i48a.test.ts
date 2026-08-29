// IIII48 仪A：pass12(RockLayerCaves) 离线重放——自 G2 dump-011 起，TileRunner 语义按
// Terarria1458 反编译逐行转写（不信 JS port），三路对拍：
//   ① 总量 vs rig 窗；② 值流 vs js-roll-RockLayerCaves.txt 公共前缀；
//   ③ 值流 vs rollwin-rig-p12.txt。分段账本(main/extra)。
// 用法：cd game && SW_I48A=1 npx vitest run tools/_i48a.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I48A === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200;
const SEED = 1138154190;

const CONS = {
  worldSurface: 337,
  rockLevel: 769,
  waterLine: 929,
  lavaLine: 418,
  rockLevelHigh: 769,   // (int)GenVars.rockLayerHigh
  beachDistance: 250,
};

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

/** 活性 framed sheet 集（Main.tileFrameImportant——与 TileRunner.ts 同源表） */
const FRAMED_SHEET = new Set<number>([
  4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 27, 29, 31, 33, 34, 35, 36,
  42, 49, 50, 55, 72, 77, 78, 79, 81, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97,
  98, 99, 100, 101, 102, 103, 104, 105, 106, 114, 125, 126, 128, 129, 132, 133, 134, 135,
  136, 137, 138, 139, 141, 142, 143, 144, 149, 165, 171, 172, 173, 174, 178, 185, 186, 187,
  207, 209, 210, 212, 215, 216, 217, 218, 219, 220, 227, 228, 233, 235, 237, 238, 239, 240,
  241, 242, 243, 244, 245, 246, 247, 269, 270, 271, 275, 276, 277, 278, 279, 280, 281, 282,
  283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301,
  302, 303, 304, 305, 306, 307, 308, 309, 310, 314, 316, 317, 318, 319, 320, 323, 324, 334,
  335, 337, 338, 339, 349, 354, 355, 356, 358, 359, 360, 361, 362, 363, 364, 372, 373, 374,
  375, 376, 377, 378, 380, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 405, 406, 410,
  411, 412, 413, 414, 419, 420, 423, 424, 425, 427, 428, 429, 435, 436, 437, 438, 439, 440,
  441, 442, 443, 445, 452, 453, 455, 456, 457, 461, 462, 463, 464, 465, 466, 467, 468, 469,
  470, 471, 475, 476, 480, 486, 487, 488, 489, 490, 491, 493, 494, 497, 499, 505, 506, 509,
  510, 511, 520, 521, 522, 523, 524, 525, 526, 527, 530, 531, 532, 533, 538, 542, 543, 544,
  545, 547, 548, 550, 551, 552, 553, 554, 555, 556, 558, 559, 560, 564, 565, 567, 568, 569,
  570, 571, 572, 573, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592,
  593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610,
  611, 612, 613, 614, 615, 616, 617, 619, 620, 621, 622, 623, 624, 629, 630, 631, 632, 634,
  639, 640, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 656, 657, 658, 660,
  663, 664, 665, 693, 694, 695, 696, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 709,
  710, 712, 713, 714, 715, 716, 720, 721, 723, 724, 725, 726, 733, 751, 752,
]);

(RUN ? it : it.skip)('i48a faithful pass12 replay', async () => {
  const t0 = rd16(`${G2}/011_Dirt_Layer_Caves.typ`);
  const a0 = rd8(`${G2}/011_Dirt_Layer_Caves.act`);
  let framedActive = 0;
  for (let i = 0; i < W * H; i++) if (a0[i] && FRAMED_SHEET.has(t0[i])) framedActive++;
  console.log(`entry framed-active=${framedActive}`);

  // 活性度镜像（挖空写 tf；-2 填液不写 act）
  const ty = new Uint8Array(W * H); // 只存「是否 sand53」域外布尔即可？不行——53 判定要 type。
  // 直接存 sheet 到 Uint16Array
  const tsheet = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) { tsheet[i] = t0[i]; }
  let tf = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) tf[i] = a0[i] ? 1 : 0;

  let cnt = 0;
  const vals = new Int32Array(10_500_000);
  const g = globalThis as { __swOnRoll?: (v: number) => void };
  g.__swOnRoll = (v: number) => { if (cnt < vals.length) vals[cnt] = v; cnt++; };

  const rng = new RNG(SEED);
  const maxTilesX = W, maxTilesY = H;
  const wsInt = CONS.worldSurface, waterLine = CONS.waterLine, lavaLine = CONS.lavaLine;
  const rockHiInt = CONS.rockLevelHigh;
  const oceanLevel = (CONS.worldSurface + CONS.rockLevel) / 2 + 40;
  const beachDistance = CONS.beachDistance;

  /** WorldGen.TileRunner（1458 cs:77596-77983）转写；type 本段恒 <0 */
  function tileRunner(xIn: number, yIn: number, strengthIn: number, stepsIn: number, type: number,
    speedX = 0.0, speedY = 0.0, noYChange = false): void {
    // head: remix strength 抖动（!mudWall && remix）——cs:77673-77678
    let strength = strengthIn * (1 + rng.int(-50, 50) * 0.01);
    let valX = xIn as number, valY = yIn as number;
    let vx = rng.int(-10, 10) * 0.1;
    let vy = rng.int(-10, 10) * 0.1;
    if (speedX !== 0.0 || speedY !== 0.0) { vx = speedX; vy = speedY; }
    // num3：Next(4)==0 掷（普通世界弃用，恒水）——cs:77707-77716
    const r4 = rng.nextIntRange(0, 4);
    void r4;
    let num2 = stepsIn; // stepsLeft double in C# — int here fine
    while (strength > 0 && num2 > 0) {
      // 循环头：val.Y<0 且 type==59 不触。drunk 门无。
      const num = strength * (num2 / stepsIn);
      num2--;
      let bx0 = Math.trunc(valX - num * 0.5);
      let bx1 = Math.trunc(valX + num * 0.5);
      let by0 = Math.trunc(valY - num * 0.5);
      let by1 = Math.trunc(valY + num * 0.5);
      if (bx0 < 1) bx0 = 1;
      if (bx1 > maxTilesX - 1) bx1 = maxTilesX - 1;
      if (by0 < 1) by0 = 1;
      if (by1 > maxTilesY - 1) by1 = maxTilesY - 1;
      for (let k = bx0; k < bx1; k++) {
        for (let l = by0; l < by1; l++) {
          const ti = l * W + k;
          // cs:77715+: (tile.active() && frameImportant && !cut) → continue（dist 骰前短路）
          if (tf[ti] && FRAMED_SHEET.has(tsheet[ti])) continue;
          // ignoreTileType<0 不触
          // dist 判定骰（每格 1 骰）
          if (!(Math.abs(k - valX) + Math.abs(l - valY) < strength * 0.5 * (1 + rng.int(-10, 10) * 0.015))) continue;
          if (type < 0) {
            // -1/-2：活性沙(53)保护
            if (tf[ti] && tsheet[ti] === 53) continue;
            if (type === -2 && tf[ti] && (l < waterLine || l > lavaLine)) {
              // liquid=255; liquidType(num3=0→JS 水)；remix lava 域覆写（cs:77795-77801，
              // oceanDepths cs:10990-11001：y>oceanLevel false / x∈beach 带 true）
              const remLava = l > lavaLine && (l < CONS.rockLevel - 80 || l > maxTilesY - 350)
                && !((l <= oceanLevel) && (k < beachDistance || k > W - beachDistance));
              void remLava; // 覆写不影响骰流
            }
            tf[ti] = 0;
            continue;
          }
          throw new Error('unexpected placed type');
        }
      }
      // 步进
      valX += vx; valY += vy;
      // ladder：!drunk ⇒ 无 Next(3) 门；num<=50 恒不触发（本段 strength≤25×1.5=37.5<50）
      vx += rng.int(-10, 10) * 0.05;
      if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
      if (!noYChange) {
        vy += rng.int(-10, 10) * 0.05;
        if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
      } else if (num < 3) {
        if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
      }
    }
  }

  // ---- pass12 主干 ----
  const areaF = maxTilesX * maxTilesY; // C#: (double)(maxTilesX*maxTilesY)*0.00013
  let num = Math.trunc(areaF * 0.00013);
  console.log(`main attempts=${num} (area*0.00013=${areaF * 0.00013})`);
  let mainDice = 0, extraDice = 0;
  const attemptCum: number[] = [];
  for (let i = 0; i < num; i++) {
    if (!(CONS.rockLevelHigh <= maxTilesY)) continue;
    let type = -1;
    if (rng.nextInt(10) === 0) type = -2;
    let nstr = rng.nextIntRange(6, 20);
    let nstp = rng.nextIntRange(50, 300);
    nstr = Math.trunc(nstr * 0.7);
    nstp = Math.trunc(nstp * 0.7);
    const rx = rng.nextIntRange(0, maxTilesX);
    const ry = rng.nextIntRange(rockHiInt, maxTilesY);
    const before = cnt;
    tileRunner(rx, ry, nstr, nstp, type);
    attemptCum.push(cnt - before);
  }
  mainDice = cnt;
  // extra 双发环
  num = Math.trunc(areaF * 0.00013 * 0.4);
  console.log(`extra attempts=${num} (${areaF * 0.00013 * 0.4})`);
  for (let j = 0; j < num; j++) {
    if (!(CONS.rockLevelHigh <= maxTilesY)) continue;
    let type2 = -1;
    if (rng.nextInt(10) === 0) type2 = -2;
    const nstr2 = rng.nextIntRange(7, 26);
    const nstp2 = rng.nextIntRange(50, 200);
    const spX = rng.nextIntRange(100, 221) * 0.1;
    const spY = rng.nextIntRange(-10, 11) * 0.02;
    const x2 = rng.nextIntRange(0, maxTilesX);
    const y2 = rng.nextIntRange(rockHiInt, maxTilesY);
    const before = cnt;
    tileRunner(x2, y2, nstr2, nstp2, type2, spX, spY, true);
    tileRunner(x2, y2, nstr2, nstp2, type2, -spX, -spY, true);
    extraDice += cnt - before;
  }
  delete g.__swOnRoll;
  console.log(`TOTAL=${cnt} (mainHead-to-extraEnd=${cnt}, main=${mainDice} extra=${extraDice})`);
  console.log(`TARGET rig total=9017227 ; JS window total=8541215`);

  // 三路流对拍
  const loadStream = (p: string): Int32Array => {
    const lines = readFileSync(p, 'utf8').split('\n');
    const out: number[] = [];
    for (const l of lines) { const s = l.trim(); if (!s || s.startsWith('-')) continue; out.push(Number(s)); }
    return Int32Array.from(out);
  };
  const rigS = loadStream('/tmp/iii45-out/rollwin-rig-p12.txt');
  const jsS = loadStream('/tmp/iii45-out/js-roll-RockLayerCaves.txt');
  const prefLen = (a: Int32Array, b: Int32Array) => {
    const k = Math.min(a.length, b.length);
    let i = 0;
    while (i < k && a[i] === b[i]) i++;
    return i;
  };
  const pJs = prefLen(Int32Array.from(vals.slice(0, cnt)), jsS);
  const pRig = prefLen(Int32Array.from(vals.slice(0, cnt)), rigS);
  console.log(`replay∩js prefix = ${pJs} (js len ${jsS.length})`);
  console.log(`replay∩rig prefix = ${pRig} (rig len ${rigS.length})`);
  const showDiverge = (a: Int32Array, b: Int32Array, name: string, at: number) => {
    console.log(`--- divergence detail vs ${name} at ${at} ---`);
    for (let i = Math.max(0, at - 4); i < at + 8; i++) {
      const av = i < a.length ? a[i] : NaN;
      const bv = i < b.length ? b[i] : NaN;
      console.log(String(i).padStart(9), String(av).padEnd(12), String(bv).padEnd(12), av === bv ? '' : '<== DIFF');
    }
  };
  if (pJs < cnt && pJs < jsS.length) showDiverge(Int32Array.from(vals.slice(0, cnt)), jsS, 'js', pJs);
  if (pRig < cnt && pRig < rigS.length) showDiverge(Int32Array.from(vals.slice(0, cnt)), rigS, 'rig', pRig);

  writeFileSync('/tmp/iii51-out/replay-p12.txt', Array.prototype.join.call(vals.slice(0, cnt), '\n'));
  // 每 attempt 成本直方图概览（首 40）
  console.log('attempt costs head:', attemptCum.slice(0, 40).join(','));
}, 900_000);
