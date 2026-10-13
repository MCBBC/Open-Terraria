// ★652b:chasm3 iter0 m,n 噪声指纹拟合(验证版 chasmCSharp + iter0 格级记录)
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { RNG, translateSeed } from '../src/core/rng.ts';

const F = Math.fround;
const F01 = F(0.1), F02 = F(0.2), F05 = F(0.5), F001 = F(0.01), F002 = F(0.02);
const W = 4200, H = 1200;
const CHASM_BOTTOM = 850;
const LIMIT_INCREASE = 0;
const FIVE = 5;

/** C# 忠实计数模拟(掷数 + 迭代数;不落格;流位对齐) */
function chasmCSharp(
  rng: RNG, i: number, j: number, steps: number,
  opts: { ocean?: boolean; trace?: string[]; rec?: Array<{ m: number; n: number; noise: number; pass: boolean; g: number; dist: number }>; g0?: number } = {},
): { draws: number; iters: number } {
  const ocean = opts.ocean ?? true;
  let draws = 0, iters = 0;
  const Next = (a: number, b: number) => { draws++; return a + Math.floor(rng.next() * (b - a)); };
  // ocean probe(ocean=true, atLeft=false):j = probe(i-125) 首实心行——零掷,由调用方给定
  let maxChasmSize = steps;                 // float
  let X = F(i), Y = F(j);                   // Vector2 float32
  let offX = F(Next(-1, 2) * F01);
  let offY = F(F(Next(3, 8) * F02) + F05);
  let cw = Next(5, 7) + 20;                 // double
  while (cw > 0) {
    iters++;
    if (maxChasmSize > 0) {
      cw += Next(0, 10);
      cw -= Next(0, 10);
      const smallHoleLimit = 790;           // small(H≤1500)
      if (ocean && maxChasmSize > smallHoleLimit) {
        if (cw < 7) cw = 7;
        if (cw > 45) cw = 45;
      } else {
        if (cw < 30) cw = 30;
        if (cw > 70) cw = 70;
        if (maxChasmSize === 1 && cw < 50) cw = 50;
      }
    } else {
      if (Y > CHASM_BOTTOM + LIMIT_INCREASE) cw -= Next(0, 5) + 8;
    }
    if ((Y > CHASM_BOTTOM + LIMIT_INCREASE && maxChasmSize > 0 && ocean) ||
      (Y > H && maxChasmSize > 0 && !ocean)) maxChasmSize = 0;
    maxChasmSize = F(maxChasmSize - 1);
    let dbgInner = 0, dbgSpan = 0, dbgPass = 0;
    if (maxChasmSize > FIVE) {
      // 内盒(0.5):1 掷/格
      let x0 = Math.trunc(X - cw * 0.5), x1 = Math.trunc(X + cw * 0.5);
      let y0 = Math.trunc(Y - cw * 0.5), y1 = Math.trunc(Y + cw * 0.5);
      if (x0 < 0) x0 = 0; if (x1 > W - 1) x1 = W - 1;
      if (y0 < 0) y0 = 0; if (y1 > H) y1 = H;
      const cells = (x1 - x0) * (y1 - y0);
      for (let z = 0; z < cells; z++) rng.next();
      draws += cells;
      dbgInner = cells;
    }
    X = F(X + offX); Y = F(Y + offY);
    offX = F(offX + F(Next(-1, 2) * F001));
    if (offX > 0.02) offX = F002;
    if (offX < -0.02) offX = -F002;
    // 宽盒(1.1):m,n 1掷/格 + dist 内 Next(7,16);r,s 1掷/格
    let wx0 = Math.trunc(X - cw * 1.1), wx1 = Math.trunc(X + cw * 1.1);
    let wy0 = Math.trunc(Y - cw * 1.1), wy1 = Math.trunc(Y + cw * 1.1);
    if (wx0 < 1) wx0 = 1; if (wx1 > W - 1) wx1 = W - 1;
    if (wy0 < 0) wy0 = 0; if (wy1 > H) wy1 = H;
    const span = (wx1 - wx0) * (wy1 - wy0);
    let mPass = 0;
    for (let m = wx0; m < wx1; m++) {
      for (let n = wy0; n < wy1; n++) {
        const noise = Next(-5, 6);
        const dist = F(F(Math.abs(m - X)) + F(Math.abs(n - Y)));
        const pass = dist < cw * 1.1 * (1 + noise * 0.015);
        if (iters === 1 && opts.rec) opts.rec.push({ m, n, noise, pass, g: (opts.g0 ?? 0) + draws, dist });
        if (pass) {
          Next(7, 16);                     // n > j + Next(7,16):dist 内恒掷
          mPass++;
        }
      }
    }
    // ★勘误(652b):末迭代 cw 可 ≤0 → wx0>wx1/wy0>wy1(C# 双循环=零消费);
    //   平铺 for z<span 会把负×负乘积当正数多掷多计 → 须连同消费一起跳过
    if (wx1 > wx0 && wy1 > wy0) {
      for (let z = 0; z < span; z++) rng.next();
      draws += span;
      dbgSpan = span;
    } else {
      dbgSpan = 0;
    }
    if (opts.trace) opts.trace.push(`${iters}\t${draws}\t${cw.toFixed(4)}\t${Y.toFixed(4)}\t${offX.toFixed(6)}\t${maxChasmSize}\t${dbgInner}\t${dbgSpan}\t${dbgPass}`);
  }
  return { draws, iters };
}

// ── 状态快照 ──
const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
function fnvOf(buf: Uint8Array): string {
  let hh = 0x811c9dc5;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const o = (x * H + y) * 4;
    hh ^= buf[o]; hh = Math.imul(hh, 0x01000193) >>> 0;
    hh ^= buf[o + 1]; hh = Math.imul(hh, 0x01000193) >>> 0;
  }
  return hh.toString(16).padStart(8, '0');
}
const passTf = new Map<string, string>();
for (const line of readFileSync(join(LOGS, 'genprobe.log'), 'utf8').split('\n')) {
  const c = line.split('\t'); if (c[0] === 'PASS') passTf.set(c[2], c[3]);
}
let preFile = '', postFile = '';
for (const f of readdirSync(LOGS).sort()) {
  if (!f.startsWith('genprobe-snap-') || !f.endsWith('.bin.gz')) continue;
  const tf = fnvOf(gunzipSync(readFileSync(join(LOGS, f))));
  if (tf === passTf.get('Draedon Structures')) preFile = f;
  if (tf === passTf.get('Abyss')) postFile = f;
}
const pre = gunzipSync(readFileSync(join(LOGS, preFile)));
const post = gunzipSync(readFileSync(join(LOGS, postFile)));
const N = W * H;
const pT = new Uint16Array(N), qT = new Uint16Array(N);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
  const o = (x * H + y) * 4;
  pT[y * W + x] = pre[o] | (pre[o + 1] << 8);
  qT[y * W + x] = post[o] | (post[o + 1] << 8);
}
console.log('[fit] pre=', preFile);

// ── 主流程 ──
const rng = new RNG(translateSeed('9293480'));
for (let z = 0; z < 4880; z++) rng.next();
const r1 = chasmCSharp(rng, 4030, 281, 850);
const r2 = chasmCSharp(rng, 4008, 247, 850);   // j=probe 结果(replay 探针实测)
const g0 = 4880 + r1.draws + r2.draws;
console.log(`[fit] chasm1=${r1.draws}(exp 11962542) chasm2=${r2.draws}(exp 17687535) chasm3起=${g0}(exp 29650957)`);
const rec: Array<{ m: number; n: number; noise: number; pass: boolean; g: number; dist: number }> = [];
const r3 = chasmCSharp(rng, 4052, 245, 850, { rec, g0 });   // chasm3 实际 x=abyssChasmX+22=4052(Abyss.cs:315)
console.log(`[fit] chasm3=${r3.draws}(exp 6543626) iter0格数=${rec.length}`);

let first = -1;
const rows: string[] = [];
for (let k = 0; k < rec.length; k++) {
  const r = rec[k];
  const o = r.n * W + r.m;
  const preT = pT[o] | (pT[o + 1] << 8);
  const postT = qT[o] | (qT[o + 1] << 8);
  if (preT === 0) continue;
  if (r.n >= 288 || r.m < 4070) continue;   // chasm1 m,n 门(n≥288)与 chasm2 盒(x≤4058)不可达区
  const trueCarved = postT === 0;
  if (r.pass === trueCarved) continue;
  rows.push(`(${r.m},${r.n}) g=${r.g} myNoise=${r.noise} dist=${r.dist.toFixed(2)} my=${r.pass ? '雕' : '未'} true=${trueCarved ? '雕' : '未'}`);
  if (first < 0) first = k;
}
console.log('[fit] 违反格数=', rows.length, '首序号=', first);
for (const r of rows.slice(0, 14)) console.log('[fit-violate]', r);
process.exit(0);
