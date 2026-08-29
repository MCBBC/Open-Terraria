// IIII48 仪D：三路对拍——①faithful 模型(full-write 重放 dump-011)产「模型侧 012」；
// ②vs G2/x86-remix/012_Rock_Layer_Caves 八通道；③vs 真实 JS 管线同锚点状态。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I48D === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200;
const SEED = 1138154190;

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

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
  510, 511, 520, 521, 522, 523, 524, 525, 527, 530, 531, 532, 533, 538, 542, 543, 544,
]);

(RUN ? it : it.skip)('i48d three-way', async () => {
  // ---------- Part 1: 模型侧 012（faithful 重放） ----------
  const t0 = rd16(`${G2}/011_Dirt_Layer_Caves.typ`);
  const a0 = rd8(`${G2}/011_Dirt_Layer_Caves.act`);
  const w0 = rd16(`${G2}/011_Dirt_Layer_Caves.wal`);
  const l0 = rd8(`${G2}/011_Dirt_Layer_Caves.liq`);
  const lt0 = rd8(`${G2}/011_Dirt_Layer_Caves.lty`);

  const ty = new Uint16Array(W * H);
  const tf = new Uint8Array(W * H);
  const tw = new Uint16Array(W * H);
  const tlq = new Uint8Array(W * H);
  const tlt = new Uint8Array(W * H); // vanilla 0 基
  for (let i = 0; i < W * H; i++) {
    ty[i] = t0[i]; tf[i] = a0[i] ? 1 : 0; tw[i] = w0[i]; tlq[i] = l0[i]; tlt[i] = lt0[i];
  }

  let cnt = 0;
  const g = globalThis as { __swOnRoll?: (v: number) => void };
  g.__swOnRoll = () => cnt++;
  const rng = new RNG(SEED);

  const CONS_WS = 337, CONS_ROCK = 769, WL = 929, LL = 418, BH = 250;
  const maxTilesX = W, maxTilesY = H, rockHiInt = 769;
  const oceanLevel = (CONS_WS + CONS_ROCK) / 2 + 40;

  function tileRunner(xIn: number, yIn: number, strengthIn: number, stepsIn: number, type: number,
    speedX = 0.0, speedY = 0.0, noYChange = false): void {
    let strength = strengthIn * (1 + rng.int(-50, 50) * 0.01);
    let valX = xIn as number, valY = yIn as number;
    let vx = rng.int(-10, 10) * 0.1;
    let vy = rng.int(-10, 10) * 0.1;
    if (speedX !== 0 || speedY !== 0) { vx = speedX; vy = speedY; }
    const r4 = rng.nextIntRange(0, 4); // num3：普通世界恒水
    void r4;
    let num2 = stepsIn;
    while (strength > 0 && num2 > 0) {
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
          if (tf[ti] && FRAMED_SHEET.has(ty[ti])) continue;
          if (!(Math.abs(k - valX) + Math.abs(l - valY) < strength * 0.5 * (1 + rng.int(-10, 10) * 0.015))) continue;
          if (type < 0) {
            if (tf[ti] && ty[ti] === 53) continue;
            if (type === -2 && tf[ti] && (l < WL || l > LL)) {
              tlq[ti] = 255;
              tlt[ti] = 0; // 水
              // remix lava 覆写（1458 cs:77795-77801）：l>lavaLine ∧ (l<rockLayer-80 ∨ l>maxTilesY-350) ∧ !oceanDepths
              const remLava = l > LL && (l < CONS_ROCK - 80 || l > maxTilesY - 350)
                && !((l <= oceanLevel) && (k < BH || k > maxTilesX - BH));
              if (remLava) tlt[ti] = 1;
            }
            tf[ti] = 0;
            continue;
          }
          throw new Error('unexpected');
        }
      }
      valX += vx; valY += vy;
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

  const areaF = W * H;
  let num = Math.trunc(Math.trunc(areaF * 0.00013) * 1.1);
  for (let i = 0; i < num; i++) {
    let type = -1;
    if (rng.nextInt(10) === 0) type = -2;
    const nstr = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
    const nstp = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
    const rx = rng.nextIntRange(0, maxTilesX);
    const ry = rng.nextIntRange(rockHiInt, maxTilesY);
    tileRunner(rx, ry, nstr, nstp, type);
  }
  num = Math.trunc(areaF * 0.00013 * 0.4);
  for (let j = 0; j < num; j++) {
    let type2 = -1;
    if (rng.nextInt(10) === 0) type2 = -2;
    const nstr2 = rng.nextIntRange(7, 26);
    const nstp2 = rng.nextIntRange(50, 200);
    const spX = rng.nextIntRange(100, 221) * 0.1;
    const spY = rng.nextIntRange(-10, 11) * 0.02;
    const x2 = rng.nextIntRange(0, maxTilesX);
    const y2 = rng.nextIntRange(rockHiInt, maxTilesY);
    tileRunner(x2, y2, nstr2, nstp2, type2, spX, spY, true);
    tileRunner(x2, y2, nstr2, nstp2, type2, -spX, -spY, true);
  }
  delete g.__swOnRoll;
  console.log(`model total=${cnt}`);

  // vs G2 012
  const gt12t = rd16(`${G2}/012_Rock_Layer_Caves.typ`);
  const gt12a = rd8(`${G2}/012_Rock_Layer_Caves.act`);
  const gt12w = rd16(`${G2}/012_Rock_Layer_Caves.wal`);
  const gt12l = rd8(`${G2}/012_Rock_Layer_Caves.liq`);
  const gt12lt = rd8(`${G2}/012_Rock_Layer_Caves.lty`);
  const chanDiff = (nm: string, mine: Uint8Array | Uint16Array, ref: Uint8Array | Uint16Array) => {
    let d = 0, fx = -1, fy = -1;
    for (let i = 0; i < W * H; i++) {
      if (mine[i] !== ref[i]) { if (fx < 0) { fx = i % W; fy = (i / W) | 0; } d++; }
    }
    console.log(`model-vs-G2 ${nm}: ${d}${fx >= 0 ? ` first@(${fx},${fy})` : ''}`);
  };
  chanDiff('act', tf, gt12a);
  chanDiff('typ', ty, gt12t);
  chanDiff('wall', tw, gt12w);
  chanDiff('liq', tlq, gt12l);
  chanDiff('lty', tlt, gt12lt);

  // ---------- Part 2: 真实 JS 管线同锚点快照 ----------
  let cur: { flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array } | null = null;
  let taken = false;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const oReseed = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: unknown, s: number) => void;
  (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
    if (cur && !taken) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          if (labelOf(m[1], Number(m[2])) === 'SurfaceCaves') {
            taken = true;
            writeFileSync('/tmp/iii51-out/js-012.typ', Buffer.from((() => {
              const o = new Uint16Array(W * H);
              for (let i = 0; i < W * H; i++) o[i] = (cur!.flags[i] & 1) ? Math.max(0, SHEETC[cur!.type[i]]) : 0;
              return o.buffer;
            })()));
            writeFileSync('/tmp/iii51-out/js-012.act', Buffer.from(Uint8Array.from(cur.flags, (v) => v & 1)));
            break;
          }
        }
      }
    }
    return oReseed.call(this, s);
  };
  const SHEETC = new Int32Array(4096).fill(-1);
  try {
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 0, seedFlags: { remix: true },
      onWorldPartial: (w) => {
        if (!cur) {
          const s = w.store as unknown as Record<string, TypedArrays>;
          cur = {
            flags: s.flags as Uint8Array, type: s.type as Uint16Array, wall: s.wall as Uint16Array,
            liquid: s.liquid as Uint8Array, liquidType: s.liquidType as Uint8Array,
          };
        }
      },
    });
  } finally {
    (RNG.prototype as unknown as Record<string, unknown>).reseed = oReseed;
  }
  if (!taken) throw new Error('SurfaceCaves anchor not captured');
  const jt = rd16('/tmp/iii51-out/js-012.typ');
  const ja = rd8('/tmp/iii51-out/js-012.act');
  const pairCompare = () => {
    const buckets = new Map<string, { n: number; ex: number }>();
    let first = -1;
    for (let i = 0; i < W * H; i++) {
      const va = gt12a[i], vva = va ? 1 : 0;
      const jja = ja[i];
      const vt = vva ? gt12t[i] : 0;
      const jjt = jja ? jt[i] : 0;
      if (vva !== jja || vt !== jjt) {
        if (first < 0) first = i;
        const key = `act${vva}>${jja}|T${vt}>${jjt}`;
        const b = buckets.get(key) ?? { n: 0, ex: -1 };
        b.n++; if (b.ex < 0) b.ex = i;
        buckets.set(key, b);
      }
    }
    console.log(`G2-012 vs JS-anchor total diff cells = ${[...buckets.values()].reduce((s, b) => s + b.n, 0)} first@(${first % W},${(first / W) | 0})`);
    for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
      console.log(`  ${k.padEnd(20)} n=${v.n} firstEx@(${v.ex % W},${(v.ex / W) | 0})`);
    }
  };
  pairCompare();
}, 900_000);

interface TypedArrays { flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array }
