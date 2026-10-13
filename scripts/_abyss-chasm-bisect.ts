// ★652b-2:chasm1 双模拟对拍(gen.ts 移植 vs C# 忠实)——逐迭代状态日志,定位首个分歧。
// 两模拟各自 fresh RNG 同种子同烧 4880,轨迹应逐迭代全同;首个 cw/py/掷数漂移点=移植缺陷处。
import { RNG, translateSeed } from '../src/core/rng.ts';

const F = Math.fround;
const F01 = F(0.1), F02 = F(0.2), F05 = F(0.5), F001 = F(0.01), F002 = F(0.02);
const W = 4200, H = 1200;
const CHASM_BOTTOM = 850, LIMIT_INCREASE = 0, FIVE = 5;
const FILL_DRAWS = 4880;

function runBoth(mode: 'ours' | 'csharp', log: Array<string>) {
  const rng = new RNG(translateSeed('9293480'));
  for (let z = 0; z < FILL_DRAWS; z++) rng.next();
  let draws = 0, iters = 0;
  const Next = (a: number, b: number) => { draws++; return a + Math.floor(rng.next() * (b - a)); };
  const i = 4065, j = 281, steps = 850;
  let maxChasmSize = steps;
  let X = F(i), Y = F(j);
  let offX: number, offY: number, cw: number;
  if (mode === 'ours') {
    offX = F(Next(-1, 2) * F01);
    offY = F(F(Next(3, 8) * F02) + F05);
    cw = Next(5, 7) + 20;
  } else {
    offX = F(Next(-1, 2) * F01);
    offY = F(F(Next(3, 8) * F02) + F05);
    cw = Next(5, 7) + 20;
  }
  const smallHoleLimit = 790;
  while (cw > 0) {
    iters++;
    let innerCells = 0, wideSpan = 0, mPass = 0;
    if (maxChasmSize > 0) {
      cw += Next(0, 10);
      cw -= Next(0, 10);
      if (maxChasmSize > smallHoleLimit) {
        if (cw < 7) cw = 7;
        if (cw > 45) cw = 45;
      } else {
        if (cw < 30) cw = 30;
        if (cw > 70) cw = 70;
        if (maxChasmSize === 1 && cw < 50) cw = 50;
      }
    } else if (mode === 'ours' ? Y > CHASM_BOTTOM : Y > CHASM_BOTTOM + LIMIT_INCREASE) {
      cw -= Next(0, 5) + 8;
    }
    if (maxChasmSize > 0 && Y > CHASM_BOTTOM) maxChasmSize = 0;
    maxChasmSize = F(maxChasmSize - 1);
    if (maxChasmSize > FIVE) {
      let x0 = Math.trunc(X - cw * 0.5), x1 = Math.trunc(X + cw * 0.5);
      let y0 = Math.trunc(Y - cw * 0.5), y1 = Math.trunc(Y + cw * 0.5);
      if (x0 < 0) x0 = 0; if (x1 > W - 1) x1 = W - 1;
      if (y0 < 0) y0 = 0; if (y1 > H) y1 = H;
      innerCells = (x1 - x0) * (y1 - y0);
      for (let k = x0; k < x1; k++) for (let l = y0; l < y1; l++) Next(-5, 6);
    }
    X = F(X + offX); Y = F(Y + offY);
    offX = F(offX + F(Next(-1, 2) * F001));
    if (offX > 0.02) offX = F002;
    if (offX < -0.02) offX = -F002;
    let wx0 = Math.trunc(X - cw * 1.1), wx1 = Math.trunc(X + cw * 1.1);
    let wy0 = Math.trunc(Y - cw * 1.1), wy1 = Math.trunc(Y + cw * 1.1);
    if (wx0 < 1) wx0 = 1; if (wx1 > W - 1) wx1 = W - 1;
    if (wy0 < 0) wy0 = 0; if (wy1 > H) wy1 = H;
    wideSpan = (wx1 - wx0) * (wy1 - wy0);
    for (let m = wx0; m < wx1; m++) {
      for (let n = wy0; n < wy1; n++) {
        const noise = Next(-5, 6);
        if (F(F(Math.abs(m - X)) + F(Math.abs(n - Y))) < cw * 1.1 * (1 + noise * 0.015)) {
          Next(7, 16);
          mPass++;
        }
      }
    }
    for (let z = 0; z < wideSpan; z++) rng.next();
    draws += innerCells + wideSpan * 2 + mPass;
    log.push(`${iters}\t${draws}\t${cw.toFixed(4)}\t${Y.toFixed(4)}\t${offX.toFixed(6)}\t${innerCells}\t${wideSpan}\t${mPass}\t${maxChasmSize}`);
  }
  return draws;
}

const a: string[] = [], b: string[] = [];
const oursTotal = runBoth('ours', a);
const csTotal = runBoth('csharp', b);
console.log(`[bisect] ours=${oursTotal} csharp=${csTotal} Δ=${csTotal - oursTotal}`);
const la = a.map((s) => s.split('\t')), lb = b.map((s) => s.split('\t'));
const n = Math.min(la.length, lb.length);
let first = -1;
for (let k = 0; k < n; k++) {
  if (la[k][1] !== lb[k][1] || la[k][2] !== lb[k][2] || la[k][3] !== lb[k][3] || la[k][4] !== lb[k][4]) { first = k; break; }
}
if (first < 0) { console.log('[bisect] 无状态分歧(可能仅迭代数差)'); }
else {
  console.log(`[bisect] 首分歧迭代 #${first + 1}(两者共 ${n} 迭代;ours 总迭代=${la.length} csharp=${lb.length})`);
  console.log('iter\t掷数\tcw\tpy\toffX\tinner\twide\tmPass\tmsz');
  for (let k = Math.max(0, first - 3); k <= Math.min(n - 1, first + 3); k++) {
    console.log(`O${k + 1}\t${la[k].join('\t')}`);
    console.log(`C${k + 1}\t${lb[k].join('\t')}`);
  }
}
process.exit(0);
