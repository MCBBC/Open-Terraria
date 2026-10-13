// ★652b:C# 忠实 chasm 计数审计(独立转录 MiscWorldgenRoutines.cs:226-468,与 gen.ts
// 移植互为对照)。chasm 控制流只依赖掷值与 j(probe 由同一 pre 快照决定,真链同值),
// 故「fresh RNG → 烧 fill 掷 → 跑 C# 计数模拟」即真链 chasm 段掷数。
// 对照面:scripts/_replay-abyss.ts 的 [seg] chasm1/2/3(我方移植实测)。
// ★流纪律:每格噪声掷必须真实消费(值虽不入控制流,但流位必须对齐 C#)。
import { RNG, translateSeed } from '../src/core/rng.ts';

const F = Math.fround;
const F01 = F(0.1), F02 = F(0.2), F05 = F(0.5), F001 = F(0.01), F002 = F(0.02);
const W = 4200, H = 1200;
const CHASM_BOTTOM = 850;          // Abyss.cs:48 small=850
const LIMIT_INCREASE = 0;          // 非 remix
const FIVE = 5;

/** C# 忠实计数模拟(掷数 + 迭代数;不落格;流位对齐) */
function chasmCSharp(
  rng: RNG, i: number, j: number, steps: number,
  opts: { ocean?: boolean; trace?: string[] } = {},
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
        if (F(F(Math.abs(m - X)) + F(Math.abs(n - Y))) < cw * 1.1 * (1 + noise * 0.015)) {
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

// ── 主流程:fresh RNG → 烧 fill(4880,位对拍锁定)→ 三 chasm ──
const FILL_DRAWS = 4880;
const rng = new RNG(translateSeed('9293480'));
for (let z = 0; z < FILL_DRAWS; z++) rng.next();
const jChasm = (process.env.SW_AUDIT_J ?? '281,247,245').split(',').map(Number);
const xs = [4065, 4043, 4087];
let total = 0;
for (let c = 0; c < 3; c++) {
  const tr: string[] = [];
  const r = chasmCSharp(rng, xs[c], jChasm[c], CHASM_BOTTOM, { trace: tr });
  for (const line of tr) console.log(`[chasm-trace] c${c + 1}\t${line}`);
  console.log(`[audit] chasm${c + 1}: 掷数=${r.draws} 迭代=${r.iters}`);
  total += r.draws;
}
console.log(`[audit] chasm 合计(C# 忠实)=${total}`);
process.exit(0);
